// src/services/issueTypes.js
// Jira issue types supported by ciclo and their hierarchy.
//
// Hierarchy (higher level = container):
//   Level 1: Epic      → pode conter Feature, Story, Task, Bug
//   Level 2: Feature   → pode conter Story, Task, Bug
//   Level 3: Story     → pode conter Task, Bug
//   Level 4: Task      → unidade de trabalho (default do ciclo)
//   Level 4: Bug       → correção (paralela à Task)
//
// Default when the user does not choose: "Task".

const ISSUE_TYPES = ['Epic', 'Feature', 'Story', 'Task', 'Bug'];

const HIERARCHY = [
  { name: 'Epic', level: 1, parent: null, children: ['Feature', 'Story', 'Task', 'Bug'], description: 'Grande entrega / tema (agrupa Features, Stories, Tasks e Bugs)' },
  { name: 'Feature', level: 2, parent: 'Epic', children: ['Story', 'Task', 'Bug'], description: 'Funcionalidade concreta (agrupa Stories/Tasks de uma capacidade)' },
  { name: 'Story', level: 3, parent: 'Feature', children: ['Task', 'Bug'], description: 'Necessidade com valor de negócio (agrupa Tasks)' },
  { name: 'Task', level: 4, parent: 'Story', children: [], description: 'Unidade de trabalho (padrão do ciclo)' },
  { name: 'Bug', level: 4, parent: null, children: [], description: 'Correção de defeito (paralela à Task)' },
];

const DEFAULT_ISSUE_TYPE = 'Task';

/** @returns {Array<{name: string, level: number, description: string}>} ordered by hierarchy */
function getIssueTypes() {
  return HIERARCHY.map(({ name, level, description }) => ({ name, level, description }));
}

/** @returns {boolean} whether the given type name is valid (case-insensitive) */
function isValidIssueType(type) {
  return ISSUE_TYPES.some((t) => t.toLowerCase() === String(type || '').trim().toLowerCase());
}

/**
 * Return the issue type to use: explicit value (if valid) → config default → "Task".
 * @param {string} [explicit] user-provided type
 * @param {string} [configured] value from config (e.g. config.services.jira.issueType)
 */
function resolveIssueType(explicit, configured) {
  if (explicit && isValidIssueType(explicit)) {
    return ISSUE_TYPES.find((t) => t.toLowerCase() === String(explicit).trim().toLowerCase());
  }
  if (configured && isValidIssueType(configured)) {
    return ISSUE_TYPES.find((t) => t.toLowerCase() === String(configured).trim().toLowerCase());
  }
  return DEFAULT_ISSUE_TYPE;
}

/** Format a human-readable list with hierarchy (for prompts/help) */
function formatIssueTypeChoices() {
  return HIERARCHY.map((t) => ({
    title: `${t.name}${t.level > 1 ? '' : ''}`,
    description: `${'  '.repeat(t.level - 1)}▸ ${t.name} — ${t.description}`,
    value: t.name,
  }));
}

module.exports = {
  ISSUE_TYPES,
  HIERARCHY,
  DEFAULT_ISSUE_TYPE,
  getIssueTypes,
  isValidIssueType,
  resolveIssueType,
  formatIssueTypeChoices,
};