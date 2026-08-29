// src/services/statusMap.js
// Bidirectional mapping between ciclo workflow states and Jira status names.
//
// Ciclo states:     backlog → refinando → pronta → em_execução → revisao → concluida
// Jira (default):  To Do    → (refine)  → To Do  → In Progress  → In Review → Done
//
// Jira workflows vary per project; the reverse map (ciclo → Jira) can be
// overridden per project via config.services.jira.statusMap.

const CICLO_STATES = ['backlog', 'refinando', 'pronta', 'em_execução', 'revisao', 'concluida'];

const CICLO_TO_JIRA_DEFAULT = {
  'backlog': null, // stays in To Do
  'refinando': null, // stays in To Do
  'pronta': null, // stays in To Do (ready to pick up)
  'em_execução': 'IN PROGRESS',
  'revisao': 'IN REVIEW',
  'concluida': 'DONE',
};

/**
 * Normalize an incoming Jira status name into a ciclo state.
 * Accepts any case and common variants ("Ready for Review", "READY FOR REVIEW",
 * "to do", "in progress", etc.). Falls back to the raw lowercased slug when unknown.
 */
function jiraToCiclo(status) {
  const raw = String(status || '').trim();
  if (!raw) return 'backlog';
  const s = raw.toLowerCase().replace(/[_\s]+/g, '_');
  const map = {
    'to_do': 'backlog',
    'backlog': 'backlog',
    'in_progress': 'em_execução',
    'em_execução': 'em_execução',
    'in_review': 'revisao',
    'revisao': 'revisao',
    'ready_for_review': 'pronta',
    'pronta': 'pronta',
    'done': 'concluida',
    'closed': 'concluida',
    'refinando': 'refinando',
  };
  return map[s] || s;
}

/**
 * Map a ciclo state to a Jira status name (with optional per-project override).
 */
function cicloToJira(state, statusMapOverride = {}) {
  const override = statusMapOverride && statusMapOverride[state];
  if (override) return override;
  return CICLO_TO_JIRA_DEFAULT[state] || null;
}

/**
 * Normalize a slug to a valid Jira status-ish string (for transitions we rely
 * on exact names, so this is mostly informational).
 */
function normalizeCicloStatusSlug(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

module.exports = {
  CICLO_STATES,
  CICLO_TO_JIRA_DEFAULT,
  jiraToCiclo,
  cicloToJira,
  normalizeCicloStatusSlug,
};