# Repo ↔ Label binding (ciclo ↔ Jira)

Establishes which Jira issues belong to the local repository, so multi-repo
setups don't cross-contaminate task lists. Implemented 2026-08-29 in the ciclo
CLI.

## The rule

- **Local → Jira** (`ciclo new`): the created issue gets a label equal to the
  repository label (e.g. `test-piloto-zero`, `ciclo`). The local task file stores
  `jiraKey` AND `repoLabel`.
- **Jira → Local** (`ciclo show`, `ciclo sync`): only issues carrying the repo
  label are treated as this repo's tasks. Re-imports dedupe by `jiraKey` +
  `repoLabel`; sync filters the JQL with `AND labels = "<repoLabel>"`.

## `src/services/repoLabel.js`

Resolution order (first hit wins):

1. `CICLO_REPO_LABEL` env var (explicit override)
2. `git remote get-url origin` → strip protocol/`git@host:`/`.git` → last path
   segment (`github.com/owner/repo.git` → `repo`)
3. `basename(cwd)` (fallback when no origin remote)

Normalized with `normalizeLabel()`: lowercase, non-`[a-z0-9_-]` → `-`, strip
edge dashes, cap at 60 chars, fallback `'repo'`.

## Integration points

- `new.js`: `getRepoLabel(cwd)` → `createTask({ ..., labels: [repoLabel] })`,
  store `task.repoLabel = repoLabel`, log `(label: <repoLabel>)`.
- `show.js fetchFromJira()`: before importing, scan local tasks for matching
  `jiraKey`; reuse only when `existing.repoLabel === currentRepoLabel` (else warn
  and re-import). After fetching, if remote `labels` (lowercased) don't include
  the repo label, **prompt the user whether to add it to the Jira issue** — but
  ONLY when the current folder is a git repository (`isGitRepository(cwd)` checks
  for `.git`; outside a repo, import proceeds without touching Jira):
  - `Y` → `store.updateTask(jiraKey, { labels: [...remoteLabels, repoLabel] })`
    (adds the label via `workitem edit --labels ...`), then import; local copy
    gets `repoLabel`.
  - `N` → import locally, Jira untouched.
  - Prompt is a `prompts` confirm with `initial: true`; runs inside
    `fetchFromJira()` before creating the local task.
- `sync.js`: `JiraTaskStore.listTasks({ repoLabel, limit })` → JQL
  `project = "X" AND labels = "<repoLabel>"`. Skips already-imported-for-this-repo
  keys; warns+re-imports keys under a different label. Per-issue label-add prompt
  mirrors `show` (same `isGitRepository` gate), skipped when `--yes` is passed.
- `JiraTaskStore.listTasks()`: `repoLabel` filter takes precedence over generic
  `labels` filter.
- `JiraTaskStore.updateTask()`: accepts `updates.labels` (array) → appends
  `--labels <comma-joined>` to the `workitem edit` args. Only runs `edit` when at
  least one editable field (summary/description/labels) is present.

## Critical ACLI detail

`workitem view`/`search --json` do NOT return `labels` unless requested:

```bash
acli jira workitem view FW-5 --fields key,labels --json     # → {"fields":{"labels":["test-piloto-zero"]}}
acli jira workitem view FW-5 --json                         # → labels key absent
```

Without `--fields key,summary,description,status,assignee,labels,created,updated`
in `getTask()` and `--fields key,summary,status,labels` in `listTasks()`, the
label binding silently no-ops (labels always empty).

## Verified test transcript (2026-08-29)

```text
$ ciclo new "Teste de label do repositorio"
🆕 Created task 1249854f ...
   → Também criada no Jira: FW-5 (label: test-piloto-zero)

$ acli jira workitem view FW-5 --fields key,labels --json
key: FW-5 | labels: ['test-piloto-zero']

$ ciclo sync -y
🔄 Sincronizando tasks do Jira com o label "test-piloto-zero"...
🔎 Encontradas 2 task(s): FW-6, FW-5
   ➕ FW-6 → local b51d7f77 [to_do]
   ⏭️  FW-5 — já local (1249854f)
✅ Sincronização concluída: 1 importada(s), 1 já existente(s).
```

FW-1 (no label), FW-3, FW-4 (no label) were correctly ignored by sync; only
FW-5/FW-6 carried `test-piloto-zero`.