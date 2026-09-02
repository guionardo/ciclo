// src/services/GithubVcsAdapter.js
// Wrapper around GitHub CLI (gh) and git for version control operations.
// Uses environment variables for configuration:
//   GITHUB_OWNER - repository owner (optional, can be overridden per call)
//   GITHUB_REPO  - repository name (optional, can be overridden per call)
// If gh CLI is not available or owner/repo not set, the adapter will operate in "mock" mode.

const { execaSync } = require('execa');

class GithubVcsAdapter {
  constructor(repoPath) {
    this.repoPath = repoPath;
    // Check if gh CLI is available
    try {
      execaSync('gh', ['--version']);
      this.ghAvailable = true;
    } catch (_) {
      this.ghAvailable = false;
    }
    // Optional defaults from env
    this.owner = process.env.GITHUB_OWNER;
    this.repo = process.env.GITHUB_REPO;
    // Configured if gh is available and we have owner/repo (can be overridden per call)
    this.configured = this.ghAvailable && !!this.owner && !!this.repo;
  }

  _ghApi(path, method = 'GET', data = null) {
    if (!this.ghAvailable) throw new Error('gh CLI not available');
    const args = ['api', path, '--method', method];
    if (data) {
      // Pass JSON data as stdin via --input
      args.push('--input', JSON.stringify(data));
    }
    // Run WITHOUT shell (array args) — works on Linux/macOS/Windows, values verbatim
    const output = execaSync('gh', args, { encoding: 'utf8' });
    return JSON.parse(output.stdout);
  }

  _git(args, opts = {}) {
    const options = { cwd: this.repoPath, encoding: 'utf8', ...opts };
    try {
      return execaSync('git', args, { ...options }).stdout;
    } catch (err) {
      throw new Error(`git ${args.join(' ')} failed: ${err.message}`);
    }
  }

  // --- VcsAdapter interface methods ---
  async createBranch(taskId, branchName) {
    // Get current branch SHA (default branch) using git
    const defaultBranch = this._git(['symbolic-ref', '--short', 'HEAD']).trim();
    const sha = this._git(['rev-parse', defaultBranch]).trim();
    this._git(['update-ref', `refs/heads/${branchName}`, sha]);
    return;
  }

  async commit(message, files) {
    // Add files (if none, add all)
    if (files && files.length) {
      this._git(['add', ...files]);
    } else {
      this._git(['add', '-A']);
    }
    // Commit
    this._git(['commit', '-m', message]);
    // Get commit SHA
    const sha = this._git(['rev-parse', 'HEAD']).trim();
    return sha;
  }

  async push(branchName) {
    // Push branch to origin (assumes origin remote exists)
    this._git(['push', 'origin', branchName]);
    return;
  }

  async openPullRequest(prData) {
    const { title, body, head, base } = prData;
    const args = ['pr', 'create', '--title', title, '--head', head];
    if (base) {
      args.push('--base', base);
    } else {
      args.push('--base', 'main'); // default base
    }
    if (body) {
      args.push('--body', body);
    }
    const output = execaSync('gh', args, { encoding: 'utf8' });
    const pr = JSON.parse(output.stdout);
    return { id: pr.number, url: pr.html_url };
  }

  async getWorkflowStatus(commitHash) {
    if (!this.ghAvailable || !this.owner || !this.repo) {
      // Fallback to mock if we cannot query GitHub
      return { state: 'pending' };
    }
    try {
      const output = execaSync(
        'gh', ['api', `/repos/${this.owner}/${this.repo}/commits/${commitHash}/check-runs`],
        { encoding: 'utf8' }
      );
      const data = JSON.parse(output.stdout);
      if (data.total_count === 0) {
        return { state: 'pending' };
      }
      // Take the most recent check run
      const latest = data.check_runs[0];
      const state = latest.status === 'completed' && latest.conclusion === 'success'
        ? 'success'
        : 'failure';
      return { state };
    } catch (err) {
      // If API fails (e.g., no check runs), treat as pending
      return { state: 'pending' };
    }
  }
}

module.exports = GithubVcsAdapter;