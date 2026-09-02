---
name: ciclo-framework-setup
description: Setup ciclo CLI in a Git repo with wizard.
---
# Ciclo Framework Setup

Skill for setting up the ciclo framework CLI (@ciclo/cli) in a new or existing repository. Covers scaffolding the CLI package, implementing the fingerprint detection, the transacted initialization wizard, and core command stubs (new, list, show, move, start, doctor). This skill encapsulates the workflow used to create a local-first task management framework that integrates with Jira and GitHub via optional adapters.

## When to Use
- Starting a new ciclo-based project from scratch.
- Adding ciclo to an existing Git repository.
- Need to generate the initial .ciclo directory, config, state, and folder structure.
- Want to reproduce the setup steps consistently across different environments.
- Setting up agent-assisted task refinement workflows (context → proposal → approval → refine --plan).
- Configuring automatic language label synchronization to Jira issues.
- Packaging the framework's Hermes skills into the repo / installing them on a new dev machine (`ciclo skills install`, ADR-004).
- Documenting framework decisions: new ADR + CHANGELOG-IA top entry + coordinated SPEC/README/ROADMAP/GUIA-DEV updates (see `references/docs-decisions.md` and `references/dev-guide-pattern.md`).

## Steps
1. **Initialize the CLI package**
   - Create `package.json` with name `@ciclo/cli`, version `0.1.0`, type `module`, and a `bin` entry pointing to `bin/ciclo.js`.
   - Set up `src/` directory with subdirectories `commands/`, `services/`.
   - Install core dependencies: `commander`, `prompts`, `uuid`, `execa`.

2. **Implement fingerprint detection (`src/fingerprint.js`)**
   - Read `package.json` to infer language (JavaScript/TypeScript), package manager (npm/yarn/pnpm via lockfiles), frameworks (React, Vue, Express, etc.), test runner (Jest, Vitest, etc.).
   - Also detects non-JS stacks: **.NET** (via `*.sln`/`*.slnx`, `*.csproj`/`*.fsproj`/`*.vbproj`, `global.json`, `nuget.config`, `Directory.Build.props` → language=`dotnet`, packageManager=`nuget`, testRunner=`dotnet test`), Go (via `go.mod`), Python (via `requirements.txt` or `pyproject.toml`), Rust (via `Cargo.toml`), PHP (via `composer.json`).
   - For Go: sets language=`go`, packageManager=`gomod`, testRunner=`go test`.
   - For .NET: language=`dotnet`, packageManager=`nuget`, testRunner=`dotnet test`; best-effort packageName from `<AssemblyName>`/`<RootNamespace>` in the first root-level project file.
   - Check for existence of `.github/workflows` to flag GitHub Actions usage.
   - Generate a short SHA‑256 hash of the fingerprint for use in the lockfile.
   - The detected language is used to add a `lang:<language>` label to Jira issues via `JiraTaskStore`.

3. **Build the transacted wizard (`src/commands/init.js`)**
   - Pre‑flight: verify the current directory is a Git repository.
   - Run fingerprint to inform the user about the detected stack.
   - Prompt for developer name and task prefix (optional `-y` to accept defaults). Load `~/.hermes/ciclo-defaults.json` first (precedence: existing config/state → user defaults → system username/`"TASK"`).
   - Jira service configuration is MANDATORY, validated via the **official Atlassian CLI (ACLI)** — NOT REST env vars:
     - Requires `acli` installed AND authenticated (`acli jira auth status` OK). If the binary is missing, offer automatic install per-OS (`src/services/cliInstall.js`: brew/curl on macOS, PowerShell on Windows, curl/apt/rpm on Linux) or print manual instructions; Jira is mandatory so abort if it can't be satisfied.
     - Store `configured:true`, `method:'acli'`, `siteUrl`, optional `projectKey`. No `JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN` validation.
   - GitHub is NOT configured in ciclo (no prompts, no `services.github` in config). Its availability is detected at runtime via `gh auth status` only. On init, a missing `gh` binary triggers the same optional auto-install flow and does NOT block.
   - Prepare files to be written atomically:
     - `.ciclo/config.json` (merged with existing if present).
     - `.ciclo/state.json` (lockfile containing version, fingerprint hash, timestamp, wizard answers).
     - `.gitignore` append lines for `.ciclo/logs/`, `.ciclo/events.jsonl`, `worktrees/`.
     - `AGENTS.md`: inject or replace a managed section between `<!-- ciclo:begin -->` and `<!-- ciclo:end -->` describing the agents (Analista: Hermes, Dev: opencode, Reviewer: Hermes/opencode) and context folders. **The instruction text MUST use real CLI command names** (`ciclo refine/start/move`) — Portuguese translations of command names (`ciclo refinar/iniciar/mover`) silently break every agent that follows them (see Pitfalls).
   - Create folder skeleton:
     - `context/{specs, rules, templates}`
     - `docs/ciclo/decisoes/`
     - `docs/ciclo/CHANGELOG-IA.md`
   - Use backup/restore pattern: before each write, copy original content to an in‑memory map; on any error, restore all backups.
   - On success, print next‑step hints (`ciclo new`, `ciclo list`, `ciclo start`).

4. **Implement core command stubs**
   - `new`: create a UUID task file under `.ciclo/tasks/` with description, status `backlog`, timestamps. When Jira is configured (`services.jira.configured` + ACLI authed via `JiraTaskStore.configured`), ALSO create the issue in Jira via `createTask()` and store `jiraKey` + `repoLabel` back into the local task file. The Jira issue gets a **label = repository label** (`getRepoLabel(cwd)` from `src/services/repoLabel.js`: `CICLO_REPO_LABEL` env → git `origin` remote name → basename of cwd; normalized lowercase `[a-z0-9_-]`).
   - `list`: read all `.json` files in `.ciclo/tasks/`, display short ID, description, status.
   - `show`: display full task JSON for a given ID. When the id is NOT found locally AND matches a Jira key pattern (`/^[A-Z]+-\d+$/i`, e.g. `FW-1`), fetch it from Jira via `JiraTaskStore.getTask()` and save a local copy (`id` = 8-char UUID prefix, `jiraKey` field set, `repoLabel` set, status slugified, summary in `description`, ADF description in `details`). **Dedup scoped by repo**: scan existing `.ciclo/tasks/*.json` for a matching `jiraKey` (case-insensitive); if found AND its `repoLabel` equals the current repo label, print the existing copy. If found under a DIFFERENT `repoLabel`, warn and re-import. Also warn (but still import) if the fetched issue's Jira `labels` do not include the current repo label.
   - `sync`: pull Jira → local in bulk, scoped to the repo label:
     1. `getRepoLabel(cwd)`, then `JiraTaskStore.listTasks({ repoLabel, limit })` (JQL adds `AND labels = "<repoLabel>"`).
     2. Load existing local tasks by `jiraKey`; skip ones already imported for THIS repo; warn+re-import ones under a different label.
     3. Create a local `.json` per issue with `jiraKey`/`repoLabel`/`description`(summary)/`status`(slug)/`details`(ADF text).
     4. Confirm prompt unless `-y`; report created vs skipped counts. Register in `bin/ciclo.js` (add `syncCommand`).
   - `move`: validate state (`backlog`, `refinando`, `pronta`, `em_execução`, `revisao`, `concluida`) and update the task’s status and `updatedAt`. **If the task has `jiraKey`, sync the status to Jira** via `JiraTaskStore.updateTask(jiraKey, { status: mapped })` which runs `acli jira workitem transition --key ... --status "<JIRA STATUS>" --yes`. Default mapping in `mapCicloToJira`: `pronta`→(none, stays To Do), `em_execução`→`IN PROGRESS`, `revisao`→`IN REVIEW`, `concluida`→`DONE`; `backlog`/`refinando`/`pronta` stay in To Do (no transition). Per-project override: `config.services.jira.statusMap = { pronta: "READY FOR CODE REVIEW", concluida: "Closed" }`.
   - `start`: 
     - Load config to get `taskPrefix`.
     - Generate branch name: `${taskPrefix}/${shortId}-<slugified-description>`. 
     - Create and checkout the branch via `execa('git', ['checkout', '-b', branchName])` (fallback to checkout if branch exists).
     - Update task status to `em_execução`, store branch name in task JSON.
     - GitHub push is opportunistic: check `gh auth status`; if authenticated and the `origin` remote URL parses to a GitHub `owner/repo`, verify repo access via `gh api /repos/{owner}/{repo}` then `git push -u origin <branch>`. No config, no token env vars. Branch stays local-only otherwise.
   - `doctor`: 
     - Validate existence of `.ciclo/`, readability of `config.json` and `state.json`.
     - Print version, dev name, task prefix.
     - Jira: report config state and validate connection via `JiraTaskStore.testConnection()` (runs `acli jira auth status`), report OK/FAIL. Also report `gh auth status`-style checks for GitHub via the `gh` CLI (`/Logged in to (\S+) account (\S+)/` → account=match[2], host=match[1]).
     - GitHub: do NOT read config — just run `gh auth status` and report installed + authenticated (account/host), or instruct `gh auth login`.
     - Verify presence of context directories and documentation files.
   - All commands should handle missing `.ciclo` gracefully and exit with a clear message.

5. **Link the CLI entrypoint**
   - Create `bin/ciclo.js` with a `#!/usr/bin/env node` shebang.
   - Instantiate a `commander` program, import each command from `src/commands/`, and add them to the program.
   - Call `program.parse()`.

6. **Testing the setup**
   - In a fresh Git repo, run `ciclo init` (or `ciclo init -y` for non‑interactive).
   - Verify that `.ciclo/config.json`, `.ciclo/state.json`, `.gitignore`, `AGENTS.md`, and the folder skeleton are present.
   - Run `ciclo doctor` to see the reported status.
   - Create a task with `ciclo new \"My feature\"` and confirm it appears in `ciclo list`.
   - Move the task through states (`refinando`, `pronta`, `em_execução`) and verify the updates.
   - Run `ciclo start <id>` and check that a git branch is created and the task status changes.

## Pitfalls & Troubleshooting
- **`JSON.stringify()` on ACLI/gh values turns real newlines into literal `\n` (2026-08-29).** `JiraTaskStore._run()` used to build `\`${acliPath} jira ${args.join(' ')} --json\`` and run it with `shell: true`, with every field value wrapped in `JSON.stringify()` as a "generic escape". That converts a real `\n` newline in a description into the TWO characters backslash+n — Jira received descriptions full of literal `\n` (observed on FW-27). **Fix: run WITHOUT shell, passing args as an array** — `execaSync(this.acliPath, ['jira', ...args, '--json'])` (execa ≥9 exports `execaSync`), and pass values as `String(value)` (no JSON.stringify). Applied to `_run`, `createTask` (summary/type/description), `updateTask` (status/summary/description), `search` (jql), `_isAuthenticated` and `testConnection`. Verify with a create→get→delete round-trip: the read-back description must contain real newlines (`"a\nb"`), not `"a\\nb"`. Also fix existing polluted issues (`desc.split("\\n").join("\n")` via `updateTask`).\n- **Same shell-join pattern exists in `GithubVcsAdapter.js`** (`\`gh ${args.join(' ')}\`` / `\`git ${args.join(' ')}\`` with `execSync`). Not yet triggered (PR auto is out of v0.1 scope) — when `openPullRequest`/`commit` with multiline bodies becomes active, refactor to `execaSync`/array args the same way.\n- **Silence dotenv v17 startup noise with `{ quiet: true }`.** `require('dotenv').config()` (dotenv 17/dotenvx) prints `◇ injected env (N) from .env // tip: ...` on EVERY command invocation. Since credentials moved out of `.env` (ACLI/gh sessions), the file only carries optional defaults (`JIRA_PROJECT_KEY`, `GITHUB_OWNER/REPO`, `ACLI_PATH`) — set `require('dotenv').config({ quiet: true })` in `bin/ciclo.js` to keep loading them without the log line. Verified working on dotenv 17.4.2.
- **`ciclo show <jira-key>` re-imports by default unless deduped.** When adding the Jira fetch fallback to `show`, remember to scan `.ciclo/tasks/*.json` for an existing `jiraKey` match BEFORE calling `getTask()` — otherwise repeated `ciclo show FW-1` calls create a new local UUID copy each time (observed 3 duplicates in one session).
- **Do NOT put GitHub in the wizard config.** GitHub presence = `gh` CLI installed AND `gh auth status` succeeds. Never store `services.github`, never prompt for owner/repo/siteUrl, never read `GITHUB_TOKEN` env. The user's requirement (2026-08): "GitHub should only check if gh is authenticated."
- **Jira requires the ACLI, not env vars (2026-08 migration).** The old constraint ("validate `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN` before proceeding") is GONE. Init now requires `acli` installed + authenticated (`acli jira auth login --web`, OAuth; or token variant). `services.jira.method` is `'acli'`.
- **ACLI login TUI is not scriptable via stdin/PTY.** `acli jira auth login --web` shows an interactive site selector that ignores piped Enter (`printf '\
'`, process submit/write). Run it in a real visible terminal, or drive a Terminal window via computer_use. `--web` also rejects `--site`/`--email` without `--token`. Details in `references/acli-integration.md`.
- **JiraTaskStore class modification pitfall:** When adding new methods to `JiraTaskStore` (like `_getLanguageLabel()`), ensure they are inserted **inside** the class definition (before the closing `}`), not after it. Incorrect placement causes `TypeError: JiraTaskStore is not a constructor` when the class is instantiated. Verify syntax with `node --check src/services/JiraTaskStore.js` after modifications.
  - **Diagnosis:** `node --check` fails with `SyntaxError: Unexpected token '{'` pointing at the method-name line (e.g. `_getLanguageLabel() {`), not near the class closing brace. The stray methods sit between the class closing `}` and `module.exports`.
  - **`node --check` on a `.backup`/non-`.js` file fails with `ERR_UNKNOWN_FILE_EXTENSION`** — copy the backup to a real `.js` temp file first (`cp X.js.backup /tmp/X.js && node --check /tmp/X.js`). CAUTION: the copy is not just to appease the checker — it reveals the backup's REAL syntax. A "restored-from-backup" file can itself be broken (observed: backup contained the stray methods outside the class and failed when checked as `.js`). Always re-check after restoring a backup; don't trust that the original was clean.
  - **Repair technique:** locate the class closing brace with a balanced-brace scan from `class JiraTaskStore {`, cut the stray-methods block out of the `class_close+1 … module.exports` region, and re-insert it BEFORE the class closing brace; then `node --check` + runtime-smoke-test.
  - **Runtime smoke test (no Jira needed):** `node -e` that requires the store, instantiates `new JiraTaskStore('<tempdir>')` where `<tempdir>/.ciclo/config.json` contains `{"stack":{"language":"go"}}`, and asserts `_getLanguageLabel()` returns `lang:go` and `_ensureLanguageLabel(['refined'])` returns `['refined','lang:go']` (dedup). This proves the class compiles AND the methods live inside it.
- **ACLI `view`/`search --json` omit `labels` by default.** Default fields are only `key,issuetype,summary,status,assignee,description` — `fields.labels` comes back missing, NOT `[]`. To read/validate the repo label binding you must request it explicitly: `acli jira workitem view KEY --fields key,summary,description,status,assignee,labels,created,updated --json` and `acli jira workitem search --jql ... --fields key,summary,status,labels --json`. The `JiraTaskStore.getTask()`/`listTasks()` methods must pass `--fields` accordingly; otherwise `labels` is always empty and repo-scoped sync silently no-ops.
- **`ciclo new` (prompts) IS scriptable via PTY — but piping stdin does NOT work.** Unlike the ACLI TUI, cycle's own prompts library responds to terminal input, but `printf 'Task
' | ciclo new` misbehaves (the piped first line gets consumed as a keystroke/submit for the wrong prompt — observed it selecting `Story` instead of the default `Task`). Working pattern: run `ciclo new "..."` with `terminal(background=true, pty=true)`, then drive it via `process(action='submit')` — empty submit accepts the default highlighted option (`Task`), `n` answers the parent-issue prompt, etc. Poll output between submits to confirm each prompt advanced.
- **`acli jira workitem delete` requires the `--key` flag — positional key is NOT accepted.** `acli jira workitem delete FW-28 --yes` fails with `Error: at least one of the flags in the group [key from-file jql filter] is required`. Correct: `acli jira workitem delete --key FW-28 --yes` (→ `✓ Work item FW-28 has been successfully deleted`).
- **Jira status names are workflow-specific — verify them, don't guess.** Default Jira workflow uses `To Do → In Progress → In Review → Done`. A made-up status like `READY FOR REVIEW` fails with `No allowed transitions found for given status` (silently in `--yes` mode: the command "succeeds" but the issue doesn't move). Probe actual names with `acli jira workitem transition --key KEY --status "<candidate>" --yes` against a To-Do issue before hardcoding the map. If a transition reports success but `view` shows the old status, the status name was wrong.
- **Don't call `workitem edit` with no editable flags.** `JiraTaskStore.updateTask()` used to always append `edit --key ...` and got `at least one of the flags in the group [summary assignee remove-assignee description ...] is required` on status-only updates. Route status changes through `workitem transition` and only run `workitem edit` when summary/description actually changed (`hasEdits` flag).
- **Missing Git repository**: The wizard will abort with a clear message. Always run `git init` first in a new folder.
- **File write failures**: The transacted backup/restore mechanism ensures that a partial write does not leave the repository in an inconsistent state. If you see a rollback message, check the error printed (often a permission issue or missing parent directory).
- **Command not found after install**: Ensure you ran `npm link` in the ciclo/cli directory (or installed the package locally) so that the `ciclo` binary is available on `$PATH`.
- **Windows line endings**: The scripts use LF line endings; if you encounter issues on Windows, consider running inside Git Bash or WSL, or configure `core.autocrlf=input`.
- **UUID package**: The `new` command depends on the `uuid` package; forgetting to install it will cause a runtime error. Add it via `npm install uuid`.
- **Execa not found**: The `start` command uses `execa` to spawn git commands. Install it with `npm install execa`.
- **Prompts interaction**: When using `-y` the wizard skips all prompts; without it, the user must provide a name and optionally configure services. Empty or invalid inputs will trigger reprompts.
- **`ciclo init` AGENTS.md used Portuguese command names that don't exist (2026-08-29).** The `agentInstruction` string wrote `ciclo refinar <id>` / `ciclo iniciar <id>` / `ciclo mover <id> <estado>` — but the CLI only registers `refine`, `start`, `move` (checked `bin/ciclo.js` `.name()`; only `instrucoes` has `.alias('agent-instructions')`). Any agent following AGENTS.md would fail on every command. Fixed by switching the strings to the real names. **Rule: before writing ANY command reference into AGENTS.md/init output, verify the exact name with `ciclo <cmd> --help` or grep `bin/ciclo.js` for `.name()`/`.alias()` — never assume Portuguese translations of command names exist.**
  - **Propagating the fix to existing pilots:** after patching `init.js`, re-run `ciclo init -y` in each pilot repo — it MERGES `.ciclo/config.json` (preserves `stack.language`, `services.jira`, `skillsEnabled`) and rewrites only the managed AGENTS.md section. Verify with `grep -o "ciclo [a-z]* <id>" AGENTS.md | sort -u` → should list only real commands (`contexto`, `move`, `refine`, `start`).
- **Dev-facing docs pattern (2026-08-29).** When asked for "documentação para o dev que vai usar este setup", the working structure is a `docs/ciclo/GUIA-DEV.md` (linked from README + CHANGELOG-IA entry) covering: 1) instalação (pré-reqs, `npm link`, `ciclo init`), 2) primeiros comandos (tabela + exemplo real), 3) ciclo de vida completo com tabela estado↔status Jira, 4) uso pelo agente via prompts com exemplos do refinamento assistido (contexto → proposta 🎯🪜📦📝 → aprovação → `--plan`), 5) labels automáticas, 6) troubleshooting, 7) referências aos ADRs. Full structure in `references/dev-guide-pattern.md`.
- **Keeping the packaged skill coherent ("revise as skills").** After config changes, verify `skills/<name>/` still matches the local `~/.hermes/skills/<name>/` AND reality: `diff -rq` the two dirs, grep cited `ciclo <cmd>` names vs `ciclo --help`, check cited reference paths exist (framework paths resolve under `cli/`), then sync one way and commit once. Full checklist in `references/skills-packaging.md` (Coherence review section). ACLI flags (`--jql`/`--fields`/`--key`) and git flags (`--no-verify`) inside command examples are legitimate — do not flag them as phantom ciclo flags.
- **Literal `\n` inside SKILL.md files.** A section (observed: "References") can be one giant line because 20 literal `\n` backslash-n sequences were written as text instead of real newlines (from escaped content at creation). In `skill_view` JSON, `\\n` in content = literal backslash-n in the file. Detect with `grep -c '\\\\n' SKILL.md`; fix with a Python `content.replace('\\n', '\n')` on BOTH local and repo copies. Details in `references/skills-packaging.md`.

## Verification
After running through the steps, the following should hold:
- `.ciclo/config.json` contains the entered `devName`, `taskPrefix`, and service configuration.
- `.ciclo/state.json` includes a `fingerprintHash` matching the output of the fingerprint function.
- The `AGENTS.md` file contains exactly one managed section (no duplicates) with the expected agent and context description.
- Running `ciclo doctor` reports no errors (missing services are reported as “not configured”, which is expected until env vars are set).
- Git branch created by `ciclo start` follows the naming convention and is checked out.

## References
- See `references/acli-integration.md` for the **ACLI (Atlassian CLI) integration**: per-OS install commands, OAuth/token auth, the TUI-not-scriptable pitfall, workitem command mapping, and JSON output shapes (nested `fields.*`, ADF description).
- See `references/repo-label-binding.md` for the **repo ↔ label binding**: `repoLabel.js` resolution, `CICLO_REPO_LABEL`, label-aware `show`/`sync` dedupe, and the mandatory `--fields ...labels` ACLI detail.
- See `references/init-walkthrough.md` for a detailed transcript of a full initialization session.
- See `templates/ciclo-config.json` for an example configuration file.
- See `scripts/verify-setup.sh` for a quick verification script that checks the presence of key files and runs the doctor command (Linux/macOS bash).
- See `scripts/verify-dev-machine.js` for the **cross-platform machine check** (Linux/macOS/Windows, pure Node stdlib, no shell): validates Node, ciclo CLI, acli+auth, gh+auth, Hermes skills installed, `~/.ciclo/config.json` (devName/reposDir) and optionally `ciclo doctor` in a repo; exit 0/1. Run: `node ~/.hermes/skills/ciclo-framework-setup/scripts/verify-dev-machine.js [repoDir]`.
- See `references/jira-setup.md` for the OLD Jira env-var setup (REST API era — kept for history; superseded by `acli-integration.md`).
- See `references/skill-selection.md` for an overview of available skill sets and their purposes.
- See `references/byte-level-repair.md` for recovering corrupted JS source (escape mangling via shell-quoted `python3 -c`; the init.js corruption incident and its byte-level fix).
- See `references/agent-refinement-workflow.md` for the **agent-assisted task refinement workflow**: `ciclo contexto` (analysis), proposal in chat, dev approval, `ciclo refine --plan <json>` (apply approved plan), gate in `ciclo start`, and language label synchronization.
- See `references/lang-label-sync.md` for the **lang:<stack> label sync E2E**: fingerprint `stack.language` → `JiraTaskStore._getLanguageLabel()`/`_ensureLanguageLabel()` → labels on `createTask`/`updateTask`, plus the exact ACLI commands to verify labels and clean up test issues.
- See `references/docs-decisions.md` for the **docs-update pattern when a decision lands**: ADR naming/template (`docs/ciclo/decisoes/`), CHANGELOG-IA top entry (old entry demoted to `###`), and the coordinated SPEC/README/ROADMAP updates — done as ONE docs commit.
- See `references/dev-guide-pattern.md` for the **dev-facing guide template** (GUIA-DEV.md): section structure, prompt examples for agent usage, and the pitfall of AGENTS.md referencing non-existent command names (verify against `bin/ciclo.js` before writing instructions).
- See `references/skills-packaging.md` for the **skills-in-repo pattern (ADR-004)**: `skills/<name>/` layout, how to implement `ciclo skills list/install` (resolve dir from `__dirname`, skip dotfiles, `--force`), the fake-HOME install test that never touches the real `~/.hermes/skills/`, the pitfall of guessed commit hashes in CHANGELOG-IA entries, the **coherence-review checklist** (sync packaged skill ↔ local ↔ reality), and the literal-`\n`-in-SKILL.md fix.