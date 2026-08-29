// types.js - shared TypeScript-like definitions for JavaScript (JSDoc)
/**
 * Version of the ciclo framework.
 * @type {string}
 */
const VERSION = "0.1.0";

/**
 * Task states used in the ciclo workflow.
 * @readonly
 * @enum {string}
 */
const TASK_STATES = {
  BACKLOG: "backlog",
  REFINANDO: "refinando",
  PRONTA: "pronta",
  EM_EXECUCAO: "em_execução",
  REVISAO: "revisao",
  CONCLUIDA: "concluida",
};

/**
 * Shape of a repository fingerprint.
 * @typedef {Object} RepoFingerprint
 * @property {string|null} packageName - Name from package.json, if present
 * @property {string|null} packageManager - Detected package manager (npm, yarn, pnpm)
 * @property {string|null} language - Detected language (javascript, typescript)
 * @property {string[]} frameworks - List of detected frameworks (react, vue, etc.)
 * @property {string|null} testRunner - Detected test runner (jest, vitest, etc.)
 * @property {boolean} hasGithubWorkflows - Whether .github/workflows exists
 * @property {string} hash - Short hash of the fingerprint (for state.lock)
 */

/**
 * Shape of wizard answers collected during `ciclo init`.
 * @typedef {Object} WizardAnswers
 * @property {string} devName - Developer's name (for attributing agent actions)
 * @property {string} taskPrefix - Prefix for task IDs (e.g., TASK, PROJ)
 * @property {Object} services - Configuration status for external services
 * @property {Object} services.jira - Jira service configuration
 * @property {boolean} services.jira.configured - Whether Jira is configured
 * @property {string|null} services.jira.method - Method used (mcp, cli, rest)
 * @property {string|null} services.jira.siteUrl - Jira base URL (if configured)
 * Note: GitHub is NOT configured in ciclo. Its availability is detected at runtime via `gh auth status`.
 */

module.exports = {
  VERSION,
  TASK_STATES,
  // Note: RepoFingerprint and WizardAnswers are TypeScript interfaces; for JS we rely on JSDoc.
  // We could also export validation functions, but for now just the constants.
};