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

const { execaCommandSync } = require('execa');
const os = require('node:os');
const { join } = require('node:path');
const { existsSync } = require('node:fs');

class JiraTaskStore {
  constructor() {
    this.projectKey = process.env.JIRA_PROJECT_KEY || null;
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
      execaCommandSync(`${this.acliPath} jira auth status`, { shell: true });
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
    const cmd = `${this.acliPath} jira ${args.join(' ')} --json`;
    try {
      const { stdout } = execaCommandSync(cmd, { shell: true });
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
        created: fields.created || item.created || item.createdAt || null,
        updated: fields.updated || item.updated || item.updatedAt || null,
        issueType: fields.issuetype || item.issueType || item.issuetype || null,
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
        created: raw.created,
        updated: raw.updated,
        issueType: raw.issueType,
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
      // Explicitly request labels so the repo↔label binding can be validated
      const data = await this._run(['workitem', 'view', String(key), '--fields', 'key,summary,description,status,assignee,labels,created,updated']);
      const items = this._normalizeWorkItems(Array.isArray(data) ? data : [data]);
      if (items.length === 0) {
        throw new Error(`No issue found with key ${key}`);
      }
      return items[0];
    } catch (err) {
      throw new Error(`Failed to fetch task ${key}: ${err.message}`);
    }
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
        '--summary', JSON.stringify(taskData.summary || 'No summary'),
        '--project', String(project),
        '--type', JSON.stringify(taskData.issueType || 'Task'),
      ];
      if (taskData.description) {
        args.push('--description', JSON.stringify(taskData.description));
      }
      if (taskData.labels && taskData.labels.length > 0) {
        const labels = (Array.isArray(taskData.labels) ? taskData.labels : [taskData.labels])
          .map((l) => String(l).trim())
          .filter(Boolean);
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
        await this._run(['workitem', 'transition', '--key', String(key), '--status', JSON.stringify(updates.status), '--yes']);
      }
      // Field edits (summary/description/labels) only if at least one editable flag is present
      const editArgs = ['workitem', 'edit', '--key', String(key)];
      let hasEdits = false;
      if (updates.summary !== undefined) {
        editArgs.push('--summary', JSON.stringify(updates.summary));
        hasEdits = true;
      }
      if (updates.description !== undefined) {
        editArgs.push('--description', JSON.stringify(updates.description));
        hasEdits = true;
      }
      if (updates.labels !== undefined && Array.isArray(updates.labels)) {
        const labels = updates.labels.map((l) => String(l).trim()).filter(Boolean);
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
      const data = await this._run(['workitem', 'search', '--jql', JSON.stringify(jql), '--limit', String(limit), '--fields', 'key,summary,status,labels']);
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
      const status = execaCommandSync(`${this.acliPath} jira auth status`, { shell: true }).stdout.trim();
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
}

module.exports = JiraTaskStore;