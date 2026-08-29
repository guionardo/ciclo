// interfaces.js - placeholder for TaskStore and VcsAdapter contracts
// These will be implemented in later phases (Jira and GitHub adapters)

/**
 * TaskStore interface - defines how tasks are stored and retrieved.
 * Implementations: LocalTaskStore (files), JiraTaskStore (Jira API), etc.
 */
class TaskStore {
  /**
   * Get a task by its ID.
   * @param {string} taskId - The task identifier.
   * @returns {Promise<Object>} The task object.
   */
  async getTask(taskId) {
    throw new Error('Method not implemented.');
  }

  /**
   * Create a new task.
   * @param {Object} taskData - The task data to create.
   * @returns {Promise<string>} The ID of the created task.
   */
  async createTask(taskData) {
    throw new Error('Method not implemented.');
  }

  /**
   * Update an existing task.
   * @param {string} taskId - The task identifier.
   * @param {Object} updates - The fields to update.
   * @returns {Promise<void>}
   */
  async updateTask(taskId, updates) {
    throw new Error('Method not implemented.');
  }

  /**
   * List tasks based on optional filters.
   * @param {Object} [filters] - Filter criteria (e.g., status, assignee).
   * @returns {Promise<Array<Object>>} List of tasks.
   */
  async listTasks(filters) {
    throw new Error('Method not implemented.');
  }
}

/**
 * VcsAdapter interface - defines how the framework interacts with a version control system.
 * Implementations: GitAdapter (local git), GithubVcsAdapter (GitHub API/MCP), etc.
 */
class VcsAdapter {
  /**
   * Initialize the adapter with a repository path.
   * @param {string} repoPath - Path to the git repository.
   */
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  /**
   * Create a new branch for a task.
   * @param {string} taskId - The task identifier.
   * @param {string} branchName - The name for the new branch.
   * @returns {Promise<void>}
   */
  async createBranch(taskId, branchName) {
    throw new Error('Method not implemented.');
  }

  /**
   * Commit changes to the current branch.
   * @param {string} message - Commit message.
   * @param {Array<string>} [files] - Specific files to commit (optional).
   * @returns {Promise<string>} The commit hash.
   */
  async commit(message, files) {
    throw new Error('Method not implemented.');
  }

  /**
   * Push the current branch to the remote.
   * @param {string} [branchName] - Branch to push (defaults to current).
   * @returns {Promise<void>}
   */
  async push(branchName) {
    throw new Error('Method not implemented.');
  }

  /**
   * Open a pull request (or merge request) for the current branch.
   * @param {Object} prData - Data for the PR (title, description, base branch, etc.).
   * @returns {Promise<string>} The URL or ID of the created PR.
   */
  async openPullRequest(prData) {
    throw new Error('Method not implemented.');
  }

  /**
   * Get the current status of the workflow (e.g., GitHub Actions) for a commit.
   * @param {string} commitHash - The commit hash to check.
   * @returns {Promise<Object>} Status information.
   */
  async getWorkflowStatus(commitHash) {
    throw new Error('Method not implemented.');
  }
}

module.exports = { TaskStore, VcsAdapter };