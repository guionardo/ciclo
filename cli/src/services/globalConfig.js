// src/services/globalConfig.js
// Centralized user-level configuration for ciclo, stored OUTSIDE the project repo.
//
// Location: ~/.ciclo/config.json   (fallback: ~/.hermes/ciclo-defaults.json)
//
// This holds cross-project settings such as the Jira board lane mapping
// (boards may have custom lanes instead of the default To Do/In Progress/...),
// plus optional project defaults. Project config (.ciclo/config.json) always
// OVERRIDES these values.

const os = require('node:os');
const { join } = require('node:path');
const { promises: fs } = require('node:fs');

const GLOBAL_CONFIG_PATH = join(os.homedir(), '.ciclo', 'config.json');
const LEGACY_DEFAULTS_PATH = join(os.homedir(), '.hermes', 'ciclo-defaults.json');

let cache = null;

/**
 * Read the global ciclo config (with cache).
 * @returns {Promise<Object>} parsed JSON or {}
 */
async function readGlobalConfig() {
  if (cache) return cache;
  let result = {};
  for (const p of [GLOBAL_CONFIG_PATH, LEGACY_DEFAULTS_PATH]) {
    try {
      const raw = await fs.readFile(p, 'utf8');
      result = { ...result, ...JSON.parse(raw) };
      break; // prefer primary path
    } catch (_) {
      // try next
    }
  }
  cache = result;
  return result;
}

/**
 * Read the project config (.ciclo/config.json) — always wins over global.
 * @param {string} cwd
 * @returns {Promise<Object>} parsed JSON or {}
 */
async function readProjectConfig(cwd) {
  try {
    const raw = await fs.readFile(join(cwd, '.ciclo', 'config.json'), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

/**
 * Merge global + project config, with project taking precedence (deep-ish merge
 * on services).
 */
function mergeConfigs(global, project) {
  const merged = { ...(global || {}), ...(project || {}) };
  merged.services = { ...(global.services || {}), ...(project.services || {}) };
  for (const svc of Object.keys(merged.services)) {
    merged.services[svc] = { ...(global.services?.[svc] || {}), ...(project.services?.[svc] || {}) };
  }
  return merged;
}

/**
 * Load effective config: project config over global config.
 * @param {string} cwd
 * @returns {Promise<Object>}
 */
async function loadEffectiveConfig(cwd) {
  const [global, project] = await Promise.all([readGlobalConfig(), readProjectConfig(cwd)]);
  return mergeConfigs(global, project);
}

/**
 * Resolve the Jira statusMap (ciclo state → Jira status) with priority:
 *   project config.services.jira.statusMap > global config.services.jira.statusMap > default
 * @param {{jira?: {statusMap?: object}}} [globalCfg]
 * @param {{jira?: {statusMap?: object}}} [projectCfg]
 * @returns {Object} statusMap
 */
function resolveStatusMap(globalCfg = {}, projectCfg = {}) {
  const { CICLO_TO_JIRA_DEFAULT } = require('./statusMap.js');
  return {
    ...CICLO_TO_JIRA_DEFAULT,
    ...(globalCfg.services?.jira?.statusMap || {}),
    ...(projectCfg.services?.jira?.statusMap || {}),
  };
}

module.exports = {
  GLOBAL_CONFIG_PATH,
  LEGACY_DEFAULTS_PATH,
  readGlobalConfig,
  readProjectConfig,
  mergeConfigs,
  loadEffectiveConfig,
  resolveStatusMap,
};