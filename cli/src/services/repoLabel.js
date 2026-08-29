// src/services/repoLabel.js
// Derives a stable "repository label" from the current git repository.
// This label links Jira tasks to the repo they belong to:
//   - Local → Jira:  `ciclo new` adds this label to the created issue
//   - Jira → Local:  import/list only considers issues carrying this label
//
// Resolution order:
//   1. env CICLO_REPO_LABEL (explicit override)
//   2. git remote origin URL (owner/repo → repo name, normalized)
//   3. basename of the current directory

const { execaCommandSync } = require('execa');
const { basename } = require('node:path');

function getRepoLabel(cwd) {
  if (process.env.CICLO_REPO_LABEL && process.env.CICLO_REPO_LABEL.trim()) {
    return normalizeLabel(process.env.CICLO_REPO_LABEL);
  }
  // Try git remote origin (https://github.com/owner/repo.git or git@github.com:owner/repo.git)
  try {
    const url = execaCommandSync('git remote get-url origin', {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).stdout.trim();
    if (url) {
      let name = url;
      // strip protocol prefix and .git suffix, then take the last path segment
      name = name.replace(/^[a-z]+:\/\//i, '').replace(/^git@[^:]+:/, '');
      name = name.replace(/\.git$/, '');
      const parts = name.split('/').filter(Boolean);
      const repo = parts[parts.length - 1];
      if (repo && repo !== '.') {
        return normalizeLabel(repo);
      }
    }
  } catch (_) {
    // no origin remote configured — fall through
  }
  // Fallback: directory name
  return normalizeLabel(basename(cwd || process.cwd()));
}

/**
 * Normalize a repository label: lowercase, replace spaces/weird chars with '-',
 * trim to a safe length (Jira labels allow [a-zA-Z0-9_-]).
 */
function normalizeLabel(name) {
  const cleaned = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 60) || 'repo';
}

module.exports = { getRepoLabel, normalizeLabel };