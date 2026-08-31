# ACLI (Atlassian CLI) integration for ciclo

Session-derived notes (2026-08): ciclo's Jira integration migrated from the REST API
(env vars `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) to the **official Atlassian
CLI (ACLI)**. No credentials live in the project — ACLI keeps the session in the user's
HOME (`~/.config/acli/`). `ciclo doctor` validates connection via `acli jira auth status`.

## Install (per OS)

- **macOS (Homebrew):** `brew tap atlassian/homebrew-acli && brew install acli`
  - Binary alternate: `curl -sL https://acli.atlassian.com/darwin/latest/acli_darwin_arm64/acli -o acli`
  - Intel: `.../acli_darwin_amd64/acli`; then `chmod +x`, `sudo mv acli /usr/local/bin/acli` or `~/bin/`.
- **Windows (PowerShell):**
  `Invoke-WebRequest -Uri https://acli.atlassian.com/windows/latest/acli_windows_amd64/acli.exe -OutFile acli.exe`
  (ARM64: `acli_windows_arm64/acli.exe`). Move to a PATH dir; binary is `acli.exe`.
- **Linux (binary):** `https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli` (or `_arm64`),
  `chmod +x`, install to `/usr/local/bin/acli` or `~/.local/bin/acli`.
- **Linux (apt, Debian/Ubuntu):** official repo —
  `sudo apt-get install -y wget gnupg2`, keyring under `/etc/apt/keyrings/acli-archive-keyring.gpg`,
  source `https://acli.atlassian.com/linux/deb stable main`, then `sudo apt install -y acli`.
- **Linux (RPM, RHEL/Fedora):** `sudo yum install -y yum-utils && sudo yum-config-manager --add-repo https://acli.atlassian.com/linux/rpm/acli.repo && sudo yum install -y acli`.
- Docs: https://developer.atlassian.com/cloud/acli/guides/install-acli/

## Auth

- OAuth (recommended): `acli jira auth login --web` — opens browser, user accepts, then the
  TUI asks to "Select the site to login" (pick the same site as the browser).
- API token: `echo $TOKEN | acli jira auth login --site "site.atlassian.net" --email "user@..." --token`.
- Verify: `acli jira auth status` → `✓ Authenticated / Site / Email / Authentication Type: oauth`.
  Exit code nonzero = not authenticated (config files `~/.config/acli/*.yaml` stay empty).

**PITFALL — the login TUI does NOT respond to piped/PTY stdin.** `acli jira auth login --web`
spawns an interactive TUI ("Select the site to login", ↑/↓ + Enter). Sending Enter via
`process(submit/write)` or `printf '\n' | acli ...` does NOT advance it — the spinner keeps
running forever. Workarounds that work:
1. Run the command in a **real visible terminal** and interact with it yourself, or
2. Drive a real Terminal app window via computer_use (type the command, press Return,
   then interact with the TUI selector).
Also note: `--web` **rejects** `--site`/`--email` unless `--token` is also set
("if any flags in the group [token email site] are set they must all be set").

## Commands used by ciclo (JiraTaskStore)

| ciclo method | ACLI command |
|---|---|
| testConnection | `acli jira auth status` |
| getTask(key) | `acli jira workitem view <KEY> --json` |
| createTask | `acli jira workitem create --summary "..." --project <KEY> --type Task [--description "..."] --json` |
| updateTask (fields) | `acli jira workitem edit --key <KEY> --summary "..." [--description "..."] --yes` |
| updateTask (status) | `acli jira workitem transition --key <KEY> --status "Done" --yes` |
| listTasks | `acli jira workitem search --jql "project = X" --limit N --json` |

## JSON output shapes (important)

- `workitem view --json` returns a **single REST-style issue object**, NOT an array:
  `{ id, key, self, fields: { summary, status:{name}, assignee, created, updated, issuetype, description } }`.
  Normalizer must handle both this nested `fields.*` shape AND flattened `{key,summary,status,...}`.
- `workitem search --json` returns an **array**.
- `fields.description` is **ADF** (Atlassian Document Format): `{type:'doc', content:[...]}`.
  Extract plain text by walking nodes and collecting every `node.text`, joined with `\n`.
- Status/assignee are objects (`{name}`, `{displayName|emailAddress}`).

## Binary resolution (JiraTaskStore._resolveAcli)

Checks, in order: `ACLI_PATH` env → fixed paths
(`~/bin/acli`, `~/.local/bin/acli`, `/usr/local/bin/acli`, `/opt/homebrew/bin/acli`, `/usr/bin/acli`,
Windows: `acli.exe` + `LOCALAPPDATA\Microsoft\WindowsApps`) → `which acli` / `where acli`.
`isCommandAvailable()` also tries `acli.exe/.cmd/.bat` on Windows.

## Init/doctor flow (2026-08)

- `ciclo init` no longer requires Jira env vars; it requires **acli installed AND
  authenticated** (`acli jira auth status` OK). If the binary is missing it offers
  automatic install per-OS (see `src/services/cliInstall.js`) or prints manual instructions;
  Jira is mandatory → abort if it can't be satisfied. GitHub stays optional: `gh auth status` only.
- Config now stores `services.jira = { configured:true, method:'acli', siteUrl, projectKey? }`.
- `~/.hermes/ciclo-defaults.json` may seed devName/taskPrefix/services.jira/skillsEnabled
  (precedence: existing config/state → user defaults → os user / "TASK").
- Legacy env vars are no longer required; `JIRA_BASE_URL` is only a siteUrl hint and
  `JIRA_PROJECT_KEY` an optional project key default.