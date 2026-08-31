# Jira Setup Step in ciclo Wizard

> ⚠️ **DEPRECATED (2026-08):** The REST/env-var flow described below was replaced by the
> **ACLI (Atlassian CLI)** integration. See `references/acli-integration.md` — the reference
> for current behavior. This file is kept for history only.

## Historical behavior (REST API era — superseded)

During `ciclo init` (without `-y`), after basic questions (developer name, task prefix),
the wizard previously offered optional service configuration for Jira and GitHub.

## Jira Configuration Prompt (old)

If the user chose to configure Jira, they were asked:

- **Jira base URL** (e.g., `https://yourcompany.atlassian.net`)
- **Default project key** for new tasks (optional; can also be set via `JIRA_PROJECT_KEY` environment variable)

## How Credentials Were Supplied (old)

The wizard did **not** store credentials in the repository. Instead, `JiraTaskStore`
expected environment variables:

- `JIRA_BASE_URL` – base URL
- `JIRA_EMAIL` – email of the service account
- `JIRA_API_TOKEN` – API token generated in Atlassian Account → Security

## Wizard Behavior (old)

- If the user skipped Jira configuration, `services.jira.configured` stayed `false`.
- If configured, `configured:true` + `siteUrl` + optional `projectKey` were saved, `method:'rest'`.
- `doctor` validated the three env vars and optionally tested the connection.

## Current behavior (2026-08+)

- Jira is **mandatory** and validated via **ACLI**: `acli jira auth login --web` (OAuth) or
  token variant; `services.jira = {configured:true, method:'acli', siteUrl, projectKey?}`.
- No env-var validation. Missing binary → per-OS auto-install or manual instructions.
- `doctor` validates via `JiraTaskStore.testConnection()` → `acli jira auth status`.

## Related Code

- Wizard prompts: `src/commands/init.js` (Jira validation + CLI install flow)
- Service implementation: `src/services/JiraTaskStore.js` (ACLI-based)
- CLI install specs: `src/services/cliInstall.js`
- Validation: `src/commands/doctor.js`