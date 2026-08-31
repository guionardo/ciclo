# Agent-Assisted Task Refinement Workflow

This document describes the workflow for agent-assisted task refinement in the ciclo framework, where the Hermes Agent helps developers refine tasks through structured conversation before execution.

## Overview

When a developer asks for help refining a task, the agent follows this sequence:

1. **Analysis Phase**: Agent runs `ciclo contexto <id>` to gather all necessary information
2. **Proposal Phase**: Agent proposes a structured refinement plan in the chat
3. **Approval Phase**: Agent explicitly asks for developer approval before saving
4. **Application Phase**: Upon approval, agent applies the plan via `ciclo refine --plan <json>`
5. **Execution Gate**: `ciclo start` verifies the task is refined before allowing execution

## Detailed Steps

### 1. Analysis: `ciclo contexto <id>`

The agent first runs this command to understand the task context:

```bash
ciclo contexto FW-27
```

This outputs:
- Task local data (description, status, current plan/refined flag)
- Current Jira data (summary, status, labels, refined flag via `refined` label)
- Parent chain (Epics/Features/Stories with their descriptions)
- Project code context (detected stack, package manager, test runner, file structure)
- If the ID looks like a Jira key (e.g., FW-27), it automatically imports it first

### 2. Proposal: Structured Plan in Chat

Based on the contexto output, the agent proposes a structured refinement plan in the chat using this format:

```
🎯 Objetivo: [Clear, single-sentence goal of what should be achieved]
🪜 Passos para execução:
  - [Step 1: concrete action]
  - [Step 2: concrete action]
  - [Step 3: concrete action]
📦 Resultado esperado: [Tangible deliverable that defines completion]
📝 Critérios de aceitação:
  - [Measurable condition 1]
  - [Measurable condition 2]
  - [Measurable condition 3]
```

Example from actual session:
```
🎯 Objetivo: Entender o fluxo de envio de WhatsApp via fila com retry e DLQ para garantir entrega confiável
🪜 Passos para execução:
  - Modelar a fila (job) com payload, tentativas e DLQ
  - Implementar o worker com backoff exponencial e limite de tentativas
  - Configurar a DLQ para mensagens que falharam após todas as tentativas
  - Adicionar métricas (enviados, falhas, DLQ) e health check
  - Escrever testes de unidade e de integração com fila mock
📦 Resultado esperado: Worker funcional com retry configurável, DLQ e métricas expostas
📝 Critérios de aceitação:
  - Job com erro simula até 3 tentativas antes de ir para DLQ
  - DLQ armazena payload original e motivo da falha
  - Métricas expostas em /metrics no formato Prometheus
```

### 3. Approval: Explicit Developer Consent

**CRITICAL**: The agent MUST ask for explicit approval before applying any changes:

```
O refinamento está adequado? (sim/não)
```

Only proceed if the developer responds affirmatively (sim, yes, y, etc.). If they decline or request changes, return to step 2 with the updated proposal.

### 4. Application: `ciclo refine --plan <json>`

Upon explicit approval, the agent applies the plan using the `--plan` flag to skip interactive prompts:

```bash
ciclo refine 03196edd --plan '{
  "goal": "Entender o fluxo de envio de WhatsApp via fila com retry e DLQ para garantir entrega confiável",
  "steps": [
    "Modelar a fila (job) com payload, tentativas e DLQ",
    "Implementar o worker com backoff exponencial e limite de tentativas",
    "Configurar a DLQ para mensagens que falharam após todas as tentativas",
    "Adicionar métricas (enviados, falhas, DLQ) e health check",
    "Escrever testes de unidade e de integração com fila mock"
  ],
  "expectedResult": "Worker funcional com retry configurável, DLQ e métricas expostas",
  "acceptanceCriteria": [
    "Job com erro simula até 3 tentativas antes de ir para DLQ",
    "DLQ armazena payload original e motivo da falha",
    "Métricas expostas em /metrics no formato Prometheus"
  ],
  "subtasks": [
    "Modelo de fila",
    "Worker com retry",
    "DLQ e métricas",
    "Testes"
  ]
}'
```

This command:
- Saves the plan locally in the task JSON (goal, steps, expectedResult, acceptanceCriteria, subtasks)
- Synchronizes with Jira by:
  - Updating the issue description to include the structured plan
  - Adding the `refined` label to the issue
- Sets the task status to `refinando` (refining)
- Outputs confirmation: `✅ Task ID refined and status set to refinando (plan created). → Plano de execução sincronizado com o Jira (KEY) + label "refined"`

### 5. Execution Gate: `ciclo start` Verification

Before allowing execution, `ciclo start` performs a mandatory re-synchronization and checks:

```
✅ Issue refinada (label "refined" presente).
```

If the label is missing:
```
⚠️  A issue NÃO está marcada como refinada (label "refined" ausente).
? Deseja revisar a descrição e refiná-la agora (objetivo, passos e resultado esperado)? › (Y/n)
```

- **Y**: Runs `ciclo refine` (with parent context), then continues to start execution
- **N**: Proceeds with warning but allows execution to continue

When the label IS present, start proceeds directly:
```
✅ Issue refinada (label "refined" presente).
🌱 Created and checked out branch: TASK/ID-slugified-description
📝 Task ID status updated to em_execução
   → Sincronizado com o Jira (KEY → IN PROGRESS)
```

## Language Label Synchronization

An important enhancement to the workflow is the automatic synchronization of detected project language as a label to Jira issues:

- The fingerprint detection in `src/fingerprint.js` identifies the project stack:
  - JavaScript/TypeScript: via `package.json` + lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`)
  - .NET: via `*.sln`/`*.slnx`, `*.csproj`/`*.fsproj`/`*.vbproj`, `global.json`, `nuget.config`, `Directory.Build.props`
  - Go: via `go.mod`
  - Python: via `requirements.txt` or `pyproject.toml`
  - Rust: via `Cargo.toml`
  - PHP: via `composer.json`

- The detected language (e.g., "go", "dotnet", "python", "rust", "php", "js", "ts") is stored in `.ciclo/config.json` under `stack.language`

- During task creation (`ciclo new`) and update (`ciclo move`, `ciclo start`), the `JiraTaskStore` automatically:
  1. Reads the language from `.ciclo/config.json`
  2. Generates a label in the format `lang:<language>` (e.g., `lang:go`, `lang:python`)
  3. Ensures this label is present on the Jira issue via `_ensureLanguageLabel()` helper method
  4. Adds the label if missing during issue creation or update

Example: In a Go project like `atendente-imoveis`, tasks will automatically receive the `lang:go` label in Jira.

## Key Benefits

1. **Context Preservation**: Parent chain descriptions provide essential business context
2. **Structured Refinement**: Consistent format ensures all critical aspects are covered
3. **Explicit Approval**: No changes made without developer consent
4. **Jira Synchronization**: Both local task and Jira issue stay in sync
5. **Execution Safety**: Gate prevents starting work on poorly defined tasks
6. **Agent Efficiency**: `--plan` flag enables non-interactive application of approved plans
7. **Language Labeling**: Automatic detection and synchronization of project stack as Jira labels aids in filtering and reporting

## Implementation Notes for Agent Developers

- Always use `ciclo contexto` first, even if you think you know the task
- Never skip the approval step - it's what makes this agent-assisted rather than agent-autonomous
- The `--plan` flag expects valid JSON with the exact structure shown above
- Label `refined` is the source of truth for both local and Jira states
- Parent chain is automatically included in `ciclo contexto` output for context
- Stack detection now includes Go, Python, Rust, PHP alongside JS/TS (enhanced fingerprint)
- The detected language is automatically added as a `lang:<language>` label to Jira issues (e.g., `lang:go`, `lang:python`) via the JiraTaskStore integration