// src/services/JiraTaskStore.js
// Wrapper around the official Atlassian CLI (ACLI) for Jira work item operations.
//   Install: brew tap atlassian/homebrew-acli && brew install acli
//   Auth:    acli jira auth login --web   (OAuth)  OR
//            echo $TOKEN | acli jira auth login --site "site.atlassian.net" --email "user@..." --token
//
// No credentials are stored in the project: ACLI keeps the session in the user's home.
// Optional env vars (used as defaults only):
//   JIRA_PROJECT_KEY - default project key (e.g. FW)
//   ACLI_PATH        - path to the acli binary (default: resolves from PATH)
//
// If the acli binary or authentication is missing, the store reports
// configure=false and callers can fall back to local-only mode.

const { execaSync, execaCommandSync } = require('execa');
const os = require('node:os');
const { join } = require('node:path');
const { existsSync, readFileSync } = require('node:fs');

/**
 * Resolve projectKey with priority:
 *   1. env JIRA_PROJECT_KEY
 *   2. project config (.ciclo/config.json → services.jira.projectKey)
 *   3. global config (~/.ciclo/config.json or ~/.hermes/ciclo-defaults.json)
 * Falls back to null (callers may pass taskData.project explicitly).
 */
function resolveProjectKey(cwd) {
  if (process.env.JIRA_PROJECT_KEY) return process.env.JIRA_PROJECT_KEY.trim();
  const candidates = [
    cwd ? join(cwd, '.ciclo', 'config.json') : null,
    join(os.homedir(), '.ciclo', 'config.json'),
    join(os.homedir(), '.hermes', 'ciclo-defaults.json'),
  ].filter(Boolean);
  for (const path of candidates) {
    try {
      const cfg = JSON.parse(readFileSync(path, 'utf8'));
      const key = cfg.services?.jira?.projectKey;
      if (key && String(key).trim()) return String(key).trim();
    } catch (_) { /* try next */ }
  }
  return null;
}

class JiraTaskStore {
  constructor(cwd) {
    this.cwd = cwd || process.cwd();
    this.projectKey = resolveProjectKey(this.cwd);
    this.acliPath = this._resolveAcli();
    this.configured = !!this.acliPath && this._isAuthenticated();
  }

  _resolveAcli() {
    // 1. Explicit env var (accept acli or acli.exe)
    const envCandidates = process.env.ACLI_PATH
      ? [process.env.ACLI_PATH]
      : [];
    // 2. Known locations (avoid shell PATH issues); include .exe suffix on Windows
    const isWin = process.platform === 'win32';
    const candidates = [
      join(os.homedir(), 'bin', isWin ? 'acli.exe' : 'acli'),
      join(os.homedir(), '.local', 'bin', isWin ? 'acli.exe' : 'acli'),
      '/usr/local/bin/acli',
      '/opt/homebrew/bin/acli',
      '/usr/bin/acli',
      isWin ? join(process.env.LOCALAPPDATA || os.homedir(), 'Microsoft', 'WindowsApps', 'acli.exe') : null,
    ].filter(Boolean);
    for (const candidate of [...envCandidates, ...candidates]) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    // 3. Try PATH via `where`/`which`
    try {
      const probe = isWin ? 'where acli' : 'which acli';
      const out = execaCommandSync(probe, { shell: true }).stdout.trim();
      if (out) return out.split('\n')[0];
    } catch (_) {
      // not found in PATH
    }
    return null;
  }

  _isAuthenticated() {
    if (!this.acliPath) return false;
    try {
      execaSync(this.acliPath, ['jira', 'auth', 'status']);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Run an ACLI Jira command and return parsed JSON output.
   * @param {string[]} args - args after `jira`
   * @returns {any} parsed JSON
   */
  _run(args) {
    if (!this.acliPath) {
      throw new Error('acli binary not found. Install it: brew tap atlassian/homebrew-acli && brew install acli');
    }
    try {
      // Run WITHOUT shell: pass args as an array so values with spaces/newlines
      // (e.g. descriptions with real line breaks) arrive verbatim. No JSON.stringify
      // escaping needed — that turned '\n' into literal backslash-n in Jira.
      const { stdout } = execaSync(this.acliPath, ['jira', ...args, '--json']);
      return JSON.parse(stdout);
    } catch (err) {
      const stderr = err.stderr || err.message || '';
      // Some ACLI responses mix human text; try to extract JSON if present
      const jsonMatch = stderr.match(/\{[\s\S]*\}/) || String(err.stdout || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (_) {
          // fall through
        }
      }
      throw new Error(`ACLI jira ${args[0]} failed: ${stderr.split('\n').pop() || err.message}`);
    }
  }

  _normalizeWorkItems(items) {
    if (!Array.isArray(items)) {
      // ACLI `view --json` returns a single REST-style issue object (not array)
      items = items ? [items] : [];
    }
    return items.map((item) => {
      const fields = item.fields || {};
      // REST-style (ACLI view) uses item.key + item.fields.*; search uses flattened values too
      const raw = {
        id: item.id || fields.id || item.key || '',
        key: item.key || fields.key || '',
        summary: fields.summary !== undefined ? fields.summary : item.summary,
        description: fields.description !== undefined ? fields.description : item.description,
        status: fields.status || item.status,
        assignee: fields.assignee || item.assignee,
        priority: fields.priority || item.priority,
        created: fields.created || item.created || item.createdAt || null,
        updated: fields.updated || item.updated || item.updatedAt || null,
        issueType: fields.issuetype || item.issueType || item.issuetype || null,
        parent: fields.parent || item.parent || null,
        labels: fields.labels || item.labels || [],
        self: fields.self || item.self || item.url || null,
      };
      const status = raw.status && typeof raw.status === 'object'
        ? (raw.status.name || raw.status.status || '')
        : (raw.status || '');
      const assignee = raw.assignee && typeof raw.assignee === 'object'
        ? (raw.assignee.displayName || raw.assignee.emailAddress || '')
        : (raw.assignee || '');
      let description = raw.description;
      if (description && typeof description === 'object' && description.type === 'doc') {
        // Extract plain text from Atlassian Document Format (ADF)
        const parts = [];
        const walk = (node) => {
          if (node.text) parts.push(node.text);
          if (Array.isArray(node.content)) node.content.forEach(walk);
        };
        walk(description);
        description = parts.join('\n');
      }
      return {
        id: raw.id,
        key: raw.key,
        summary: raw.summary !== undefined && raw.summary !== null ? raw.summary : '',
        description: description !== undefined && description !== null ? description : '',
        status: typeof status === 'string' ? status : '',
        assignee: typeof assignee === 'string' ? assignee : '',
        priority: raw.priority && typeof raw.priority === 'object'
          ? (raw.priority.name || '')
          : (raw.priority || ''),
        created: raw.created,
        updated: raw.updated,
        issueType: raw.issueType,
        // parent normalized: { key, summary, issueType } (REST-style parent object)
        parent: raw.parent && typeof raw.parent === 'object'
          ? {
              key: raw.parent.key || '',
              summary: (raw.parent.fields && raw.parent.fields.summary) || '',
              issueType: (raw.parent.fields && raw.parent.fields.issuetype)
                ? (raw.parent.fields.issuetype.name || '')
                : '',
            }
          : (raw.parent || null),
        labels: Array.isArray(raw.labels) ? raw.labels : [],
        self: raw.self,
      };
    });
  }

  // --- TaskStore interface methods ---

  async getTask(taskId) {
    const key = String(taskId).includes('-') ? taskId : `${this.projectKey}-${taskId}`;
    if (!this.configured) {
      throw new Error('Jira via ACLI not configured (authenticate with `acli jira auth login --web`)');
    }
    try {
      // Explicitly request labels + parent so the repo↔label binding and the
      // hierarchy (parent chain) can be validated.
      const data = await this._run(['workitem', 'view', String(key), '--fields', 'key,summary,description,status,assignee,labels,created,updated,parent,issuetype']);
      const items = this._normalizeWorkItems(Array.isArray(data) ? data : [data]);
      if (items.length === 0) {
        throw new Error(`No issue found with key ${key}`);
      }
      return items[0];
    } catch (err) {
      throw new Error(`Failed to fetch task ${key}: ${err.message}`);
    }
  }

  /**
   * Walk the parent chain of an issue (parent → grandparent → … until Epic/root),
   * returning each ancestor with its summary, description and issue type.
   * Used to keep the task scope aligned with the Jira hierarchy (story/feature/epic).
   * @param {string} jiraKey - issue key (e.g. FW-21)
   * @param {number} maxDepth - safety limit (default 10)
   * @returns {Promise<Array<{key: string, issueType: string, summary: string, description: string}>>}
   *          ordered from the direct parent up to the root ancestor.
   */
  async getParentChain(jiraKey, maxDepth = 10) {
    const chain = [];
    let currentKey = String(jiraKey).includes('-') ? jiraKey : `${this.projectKey}-${jiraKey}`;
    const seen = new Set();
    for (let depth = 0; depth < maxDepth; depth += 1) {
      if (seen.has(currentKey)) break;
      seen.add(currentKey);
      let issue;
      try {
        issue = await this.getTask(currentKey);
      } catch (_) {
        break; // parent issue may not exist / no permission
      }
      if (!issue.parent || !issue.parent.key) break;
      const parentKey = issue.parent.key;
      let parent;
      try {
        parent = await this.getTask(parentKey);
      } catch (_) {
        // fall back to the summarized parent (no description)
        chain.push({
          key: issue.parent.key,
          issueType: issue.parent.issueType || '',
          summary: issue.parent.summary || '',
          description: '',
        });
        break;
      }
      chain.push({
        key: parent.key,
        issueType: parent.issueType && parent.issueType.name ? parent.issueType.name : (typeof parent.issueType === 'string' ? parent.issueType : ''),
        summary: parent.summary || '',
        description: parent.description || '',
      });
      currentKey = parentKey;
    }
    return chain;
  }

  /**
   * Fetch an issue together with its full parent chain (for local sync).
   * @param {string} jiraKey
   * @returns {Promise<{issue: Object, parentChain: Array}>}
   */
  async getTaskWithParents(jiraKey) {
    const issue = await this.getTask(jiraKey);
    const parentChain = await this.getParentChain(jiraKey);
    return { issue, parentChain };
  }

  async createTask(taskData) {
    if (!this.configured) {
      throw new Error('Jira via ACLI not configured (authenticate with `acli jira auth login --web`)');
    }
    const project = taskData.project || this.projectKey;
    if (!project) {
      throw new Error('No project key set (set JIRA_PROJECT_KEY env var or pass taskData.project)');
    }
    try {
      const args = [
        'workitem', 'create',
        '--summary', String(taskData.summary || 'No summary'),
        '--project', String(project),
        '--type', String(taskData.issueType || 'Task'),
      ];
      if (taskData.description) {
        args.push('--description', String(taskData.description));
      }
      if (taskData.labels && taskData.labels.length > 0) {
        const labels = (Array.isArray(taskData.labels) ? taskData.labels : [taskData.labels])
          .map((l) => String(l).trim())
          .filter(Boolean);
        // Add language label from fingerprint
        const langLabel = this._getLanguageLabel();
        if (langLabel && !labels.includes(langLabel)) {
          labels.push(langLabel);
        }
        if (labels.length > 0) {
          args.push('--label', labels.join(','));
        }
      }
      // Parent issue (hierarchy link), e.g. epic or feature key
      if (taskData.parent) {
        args.push('--parent', String(taskData.parent));
      }
      const data = await this._run(args);
      const items = this._normalizeWorkItems(Array.isArray(data) ? data : [data]);
      const created = items[0] || {};
      return {
        id: created.key || created.id,
        key: created.key || created.id,
        self: created.self || null,
      };
    } catch (err) {
      throw new Error(`Failed to create task: ${err.message}`);
    }
  }

  async updateTask(taskId, updates) {
    const key = String(taskId).includes('-') ? taskId : `${this.projectKey}-${taskId}`;
    if (!this.configured) {
      throw new Error('Jira via ACLI not configured (authenticate with `acli jira auth login --web`)');
    }
    try {
      // Status changes go through the transition command
      if (updates.status !== undefined) {
        await this._run(['workitem', 'transition', '--key', String(key), '--status', String(updates.status), '--yes']);
      }
      // Field edits (summary/description/labels) only if at least one editable flag is present
      const editArgs = ['workitem', 'edit', '--key', String(key)];
      let hasEdits = false;
      if (updates.summary !== undefined) {
        editArgs.push('--summary', String(updates.summary));
        hasEdits = true;
      }
      if (updates.description !== undefined) {
        editArgs.push('--description', String(updates.description));
        hasEdits = true;
      }
      if (updates.labels !== undefined && Array.isArray(updates.labels)) {
        const labels = updates.labels.map((l) => String(l).trim()).filter(Boolean);
        // Add language label from fingerprint
        const langLabel = this._getLanguageLabel();
        if (langLabel && !labels.includes(langLabel)) {
          labels.push(langLabel);
        }
        if (labels.length > 0) {
          editArgs.push('--labels', labels.join(','));
          hasEdits = true;
        }
      }
      if (hasEdits) {
        editArgs.push('--yes');
        await this._run(editArgs);
      }
      return;
    } catch (err) {
      throw new Error(`Failed to update task ${key}: ${err.message}`);
    }
  }

  async listTasks(filters = {}) {
    if (!this.configured) {
      throw new Error('Jira via ACLI not configured (authenticate with `acli jira auth login --web`)');
    }
    let jql = `project = "${this.projectKey || 'TASK'}"`;
    if (filters.status) jql += ` AND status = "${filters.status}"`;
    if (filters.assignee) jql += ` AND assignee = "${filters.assignee}"`;
    // repoLabel: only tasks belonging to this repository (binding label). This is the
    // canonical way to sync Jira → local scoped to the current repo.
    if (filters.repoLabel) {
      jql += ` AND labels = "${filters.repoLabel}"`;
    } else if (filters.labels) {
      const labels = Array.isArray(filters.labels) ? filters.labels : [filters.labels];
      jql += ` AND labels in (${labels.map((l) => `"${l}"`).join(', ')})`;
    }
    const limit = filters.limit || 50;
    try {
      const data = await this._run(['workitem', 'search', '--jql', String(jql), '--limit', String(limit), '--fields', 'key,summary,status,labels,assignee,priority,issuetype']);
      return this._normalizeWorkItems(Array.isArray(data) ? data : (data.items || []));
    } catch (err) {
      throw new Error(`Failed to list tasks: ${err.message}`);
    }
  }

  // --- Connection validation (used by ciclo doctor) ---

  async testConnection() {
    if (!this.acliPath) {
      return { ok: false, error: 'acli binary not found. Install: brew tap atlassian/homebrew-acli && brew install acli' };
    }
    try {
      const status = execaSync(this.acliPath, ['jira', 'auth', 'status']).stdout.trim();
      return { ok: true, status: status || 'authenticated', acliPath: this.acliPath };
    } catch (err) {
      return {
        ok: false,
        error: 'Not authenticated. Run `acli jira auth login --web` (OAuth) or use API token.',
        detail: (err.stderr || err.message || '').split('\n').pop(),
      };
    }
  }

  /**
   * Discover the lanes (statuses) this issue can adopt — i.e. its available
   * Jira transitions. Boards may have custom lanes, so this is queried from the
   * Jira REST API when a token is available (global config or JIRA_API_TOKEN),
   * falling back to the configured statusMap.
   *
   * Priority for the token:
   *   1. global config (~/.ciclo/config.json) → services.jira.apiToken
   *   2. legacy defaults (~/.hermes/ciclo-defaults.json) → services.jira.apiToken
   *   3. env JIRA_API_TOKEN
   *
   * @param {string} jiraKey - e.g. FW-11
   * @param {{statusMap?: object}} [statusFallback] - ciclo-state → jira-status map
   * @returns {Promise<string[]>} array of Jira status/transition names available
   */
  async getAvailableTransitions(jiraKey, statusFallback = {}) {
    const key = String(jiraKey).includes('-') ? jiraKey : `${this.projectKey}-${jiraKey}`;
    // Try REST discovery when we have a token (OAuth token is in the keyring;
    // we can also use an explicit API token from config/env).
    const token = await this._resolveApiToken();
    if (token && this.baseUrl) {
      try {
        const https = require('https');
        const url = new URL(`${this.baseUrl.replace(/\/+$/, '')}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
        const data = await new Promise((resolve, reject) => {
          const req = https.request(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          }, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 120)}`));
              }
            });
          });
          req.on('error', reject);
          req.end();
        });
        const transitions = (data.transitions || []).map((t) => t.name || t.to?.name).filter(Boolean);
        if (transitions.length > 0) return transitions;
      } catch (_) {
        // REST discovery failed — fall through to configured map
      }
    }
    // Fallback: return the values from the statusMap (default or configured)
    return Object.values(statusFallback).filter(Boolean);
  }

  async _resolveApiToken() {
    if (process.env.JIRA_API_TOKEN) return process.env.JIRA_API_TOKEN;
    try {
      const { readGlobalConfig } = require('./globalConfig.js');
      const cfg = await readGlobalConfig();
      const tok = cfg.services?.jira?.apiToken;
      if (tok) return tok;
    } catch (_) {}
    return null;
  }

  _getLanguageLabel() {
    try {
      const configPath = join(this.cwd, '.ciclo', 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      const lang = config.stack?.language;
      if (lang) return `lang:${lang}`;
    } catch (_) {
      // ignore
    }
    return null;
  }

  _ensureLanguageLabel(labels) {
    const langLabel = this._getLanguageLabel();
    if (langLabel && !labels.includes(langLabel)) {
      return [...labels, langLabel];
    }
    return labels;
  }
}

module.exports = JiraTaskStore;
