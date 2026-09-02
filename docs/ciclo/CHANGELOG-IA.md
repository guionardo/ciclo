# Changelog IA

*Changes made by ciclo agents*

## 2026-08-29 — Roteiro de replicação da instalação (máquinas de dev)

- **ROTEIRO-REPLICACAO.md criado** (`docs/ciclo/ROTEIRO-REPLICACAO.md`):
  checklist operacional de 7 etapas para instalar o ciclo numa máquina nova —
  pré-requisitos, CLIs oficiais (acli/gh + OAuth), `npm link`, `ciclo skills
  install`, config global (`~/.ciclo/config.json` com `reposDir`), `ciclo init -y`
  por projeto, validação ponta-a-ponta (com critérios de aceite e limpeza da
  task de teste) e troubleshooting.
- Linkado no README e no GUIA-DEV (seção Referências).

### 2026-08-29 — Fix: quebras de linha reais na descrição das issues (Jira)

- **Bug**: descrições enviadas ao Jira via `JiraTaskStore` ficavam com `\n`
  **literal** (backslash+n) em vez de quebra de linha real (observado na FW-27).
- **Causa**: `_run()` montava `acli jira ... ${args.join(' ')}` com `shell: true`
  e cada valor de campo era "escapado" com `JSON.stringify()`, que converte
  newline real em `\n` de 2 caracteres.
- **Fix**: `_run()` agora executa via `execaSync(acliPath, ['jira', ...args, '--json'])`
  **sem shell** (args como array — valores chegam verbatim); removidos todos os
  `JSON.stringify` de `createTask`/`updateTask`/`search` (summary, type,
  description, status, jql) — agora `String(value)`. Mesmo padrão aplicado a
  `_isAuthenticated` e `testConnection`.
- **Dado corrigido**: descrição da FW-27 reescrita com quebras reais;
  varredura do board não achou outras issues afetadas.
- **Validado**: create→get→delete round-trip (FW-31 temporária) confirmou que a
  descrição lida de volta tem newlines reais.
- Obs.: `GithubVcsAdapter` tem o mesmo padrão shell-join — anotado na skill;
  fora do escopo v0.1 (PR automático não ativo).

### 2026-08-29 — Skills empacotadas no framework (ciclo skills install)

- **ADR-004 implementado**: as skills do framework são versionadas no repo em
  `skills/<nome>/` (SKILL.md + references/ + templates/ + scripts/), com fonte
  única de verdade para instalação em ambiente novo.
- **Novos comandos** (commit `1f53819`):
  - `ciclo skills list` — lista as skills empacotadas.
  - `ciclo skills install [--force]` — copia `skills/` → `~/.hermes/skills/`
    (idempotente; `--force` sobrescreve). Testado com HOME temporário: 13
    arquivos instalados, 2ª execução pula sem `--force`.
- **Skill `ciclo-framework-setup`** empacotada no repo.
- Docs: SPEC (tabela de comandos + seção agentes + índice de ADRs), README
  (instalação + documentos), GUIA-DEV (seção 1.3 instalando skills).

### 2026-08-29 — Fingerprint .NET (dotnet) adicionado

- **Fingerprint passa a detectar .NET** (`language: dotnet`): marcadores
  `*.sln`/`*.slnx`, `*.csproj`/`*.fsproj`/`*.vbproj`, `global.json`,
  `nuget.config` e `Directory.Build.props` (commit `764a482`). Testado
  ponta-a-ponta: repo .NET → `ciclo init -y` gravou `stack.language: "dotnet"`
  → task criada no Jira com label `lang:dotnet` (FW-29, removida após o teste).

### 2026-08-29 — GUIA-DEV e correção dos comandos no AGENTS.md

- **GUIA-DEV.md criado** (`docs/ciclo/GUIA-DEV.md`): instalação da CLI, primeiros
  comandos, ciclo de vida completo da task, uso pelo agente via prompts (com
  exemplos de refinamento assistido) e troubleshooting — documentação de
  referência para o dev que usa o setup.
- **Correção no `ciclo init`**: o AGENTS.md gerado instruía o agente com
  `ciclo refinar/iniciar/mover` (nomes em português que não existem). Corrigido
  para os comandos reais `ciclo refine/start/move` (commit `ecc7258`).

### 2026-08-29 — Refinamento assistido, fingerprint multi-stack e label de linguagem

- **Refinamento assistido pelo agente** (ADR-002):
  - `ciclo contexto <id>` reúne task + parents Jira + estrutura de código.
  - `ciclo refine <id> --plan '<json>'` aplica plano **aprovado pelo dev** (salva
    local + sincroniza Jira com descrição estruturada e label `refined`).
  - `ciclo start` gateia a execução na label `refined` (ausente → pergunta ao dev).
- **Fingerprint multi-stack** (ADR-003): detecção de Go (`go.mod`), Python
  (`requirements.txt`/`pyproject.toml`), Rust (`Cargo.toml`) e PHP
  (`composer.json`) além de JS/TS → `stack.language` no `.ciclo/config.json`.
- **Label `lang:<stack>` no Jira**: `JiraTaskStore` adiciona a label de linguagem
  em criação e atualização de issues (com dedupe). Validado ponta-a-ponta
  (FW-28: `lang:go` + `refined`).
- Estrutura do `JiraTaskStore.js` corrigida (métodos dentro da classe; commit `3a237dd`).

### 2026-08-29 — Sincronia com cadeia de parents e docs consolidada

- **Sincronia de issues agora inclui a cadeia de parents** (Story/Feature/Epic):
  - `getParentChain` sobe a hierarquia até a raiz (key/issueType/summary/description).
  - `ciclo show` salva a `parentChain` no arquivo local da task.
  - `ciclo start` **re-sincroniza sempre** (issue + parentChain) antes de criar a
    branch — escopo sempre alinhado com o board.
  - `ciclo refine` exibe a cadeia como contexto.
- **docs**: SPEC/ROADMAP/ADR-001 consolidadas; CHANGELOG-IA criado.

### Histórico anterior (resumo das decisões já implementadas)

- 2026-08-26 — v0.1 local-first definida (SPEC/ROADMAP originais).
- 2026-08-28/29 — migração para ACLI (Jira) e gh (GitHub); labels de repo;
  hierarquia de issue types; statusMap; `ciclo trabalho`; `ciclo instrucoes`; `report --jira`.