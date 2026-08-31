# Ciclo Initialization Walkthrough

This document provides a detailed transcript of a typical `ciclo init` session, including user prompts and expected output.

## Example Session

```bash
$ mkdir my-project && cd my-project
$ git init -q
$ echo "# My Project" > README.md
$ git add . && git commit -m "initial commit" -q
$ ciclo init
```

### Expected Output

```
🔧 Initializing ciclo in /path/to/my-project
🔍 Scanning repository...
   📦 Package: my-project
   📦 Manager: npm
   💬 Language: javascript
   ⚛️  Frameworks: none
   🧪 Test runner: none
   🔧 GH Workflows: no
? Your name (for attributing agent actions): > Guionardo
? Task prefix (e.g., TASK, PROJ): > FEAT
🔌 Service validation skipped in this scaffold (services not configured).

✅ ciclo initialized successfully!

📌 Next steps:
  1. Create your first task: ciclo new "My feature"
  2. Refine it: ciclo refine <task-id>
  3. Start implementation: ciclo start <task-id>

💡 Tip: Use ciclo doctor anytime to validate service access.
```

### With Service Configuration (non-interactive mode)

```bash
$ ciclo init -y
```

Output:
```
🔧 Initializing ciclo in /path/to/my-project
🔍 Scanning repository...
   📦 Package: my-project
   📦 Manager: npm
   💬 Language: javascript
   ⚛️  Frameworks: none
   🧪 Test runner: none
   🔧 GH Workflows: no
🔧 Using defaults (--yes flag)
🔧 Using defaults (--yes flag) - skipping service configuration

✅ ciclo initialized successfully!

📌 Next steps:
  1. Create your first task: ciclo new "My feature"
  2. Refine it: ciclo refine <task-id>
  3. Start implementation: ciclo start <task-id>

💡 Tip: Use ciclo doctor anytime to validate service access.
```

### With Service Configuration (interactive mode)

When not using `-y`, the wizard will prompt for service configuration after the basic questions:

```
? Configure Jira integration? > Yes
? Jira base URL (e.g., https://company.atlassian.net): > https://mycompany.atlassian.net
? Default project key for new tasks (optional, can be set via JIRA_PROJECT_KEY env var): > PROJ
? Configure GitHub integration? > Yes
```

Note: For actual service access, environment variables must be set:
- Jira: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
- GitHub: `GITHUB_TOKEN`

## Post-Initialization File Structure

After successful initialization, the repository will contain:

```
my-project/
├── .ciclo/
│   ├── config.json
│   └── state.json
├── .gitignore
├── AGENTS.md
├── context/
│   ├── specs/
│   ├── rules/
│   └── templates/
├── docs/
│   └── ciclo/
│       ├── decisoes/
│       └── CHANGELOG-IA.md
├── README.md
└── .git/
```

### .ciclo/config.json Example
```json
{
  "version": "0.1.0",
  "devName": "Guionardo",
  "taskPrefix": "FEAT",
  "services": {
    "github": { "configured": false, "method": null },
    "jira": { "configured": true, "method": "rest", "siteUrl": "https://mycompany.atlassian.net", "projectKey": "PROJ" }
  },
  "stack": {
    "language": "javascript",
    "frameworks": [],
    "testRunner": null,
    "packageManager": "npm"
  }
}
```

### .ciclo/state.json Example
```json
{
  "version": "0.1.0",
  "fingerprintHash": "a1b2c3d4",
  "initializedAt": "2026-08-26T18:30:00.000Z",
  "devName": "Guionardo",
  "taskPrefix": "FEAT",
  "services": {
    "github": { "configured": false, "method": null },
    "jira": { "configured": true, "method": "rest", "siteUrl": "https://mycompany.atlassian.net", "projectKey": "PROJ" }
  }
}
```

## Error Cases

### Not a Git Repository
```bash
$ ciclo init
✗ Not a git repository. Please run `git init` first.
```

### Initialization Failure (Rollback)
If any file write fails during the transacted process:
```
✗ Initialization failed. Rolling back...
   Error: ENOENT: no such file or directory, open '/path/to/nonexistent/file'
```
The system will attempt to restore all backed-up files to their original state.