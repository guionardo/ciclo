# Changelog IA

*Changes made by ciclo agents*

## 2026-09-02 — README como entrada rápida + decisões em doc separado

- **README.md reorganizado**: virou documento de **entrada rápida para o dev** —
  "🚀 Início rápido" com `npm install -g guionardo/ciclo` logo no topo
  (pré-requisitos → CLI → skills → init → primeira task), depois fluxo do dia a
  dia, comandos, tabela de Documentos e referências (instalação detalhada,
  checagem de versão, integração Jira/labels/status).
- **`docs/ciclo/DECISOES-FUNDAMENTAIS.md` criado**: recebeu a tabela D1–D12
  (movida do README) + índice dos ADRs 001–004.
- Skill `ciclo-framework-setup` atualizada (padrão de docs: README curto de
  entrada; detalhes em GUIA-DEV/ROTEIRO/SPEC; decisões em
  DECISOES-FUNDAMENTAIS + ADRs).

### 2026-09-02 — Checagem periódica de versão + `ciclo update-check`

- **`src/services/updateCheck.js`**: versão local vs GitHub (releases → senão
  package.json da main); `gh api` preferido (funciona com repo **privado**),
  fallback HTTP com `GITHUB_TOKEN`; cache em `~/.ciclo/update-check.json` (TTL
  24h; cache com `latest:null` sem changelog é tratado como falho e re-consultado).
- **`ciclo update-check`** (+ alias `update`, flags `--json`/`--forcar`):
  mostra versão atual, disponível, fonte (release/main), comando de update e
  **changelog** (body da última GitHub Release; sem releases, entradas do
  `CHANGELOG-IA.md` da main).
- **Checagem automática discreta** no arranque da CLI (1×/dia, aviso só quando
  há versão nova; `CICLO_SKIP_UPDATE_CHECK=1` ou CI desliga).
- Validado: comparação semver (unit), `guionardo/ciclo` (repo privado, sem
  releases → main + CHANGELOG), `cli/cli` (repo público com releases → detectou
  v2.99.0 + changelog + aviso automático).
- Docs: README (workflow + seção checagem), GUIA-DEV (comando na tabela);
  CHANGELOG-IA registrado.

### 2026-09-02 — Instalação rápida via `npm install guionardo/ciclo`

- **`package.json` na raiz do repo** habilitando o npm install direto do
  GitHub: bin `ciclo` → `cli/bin/ciclo.js`, deps replicadas do `cli/`,
  `files: [cli/bin, cli/src, skills]`.
- **Instalação rápida documentada** (README, GUIA-DEV, ROTEIRO-REPLICACAO):
  `npm install -g guionardo/ciclo` (equivale a `github:guionardo/ciclo`);
  atualização com `npm install -g guionardo/ciclo@main`. Opção local (clone +
  `npm link`) fica para quem quer contribuir.
- **Validado**: `npm pack` + `npm install` do tarball em projeto limpo →
  `ciclo --version` (0.1.0), `ciclo skills list` (resolve `skills/` do pacote
  instalado) e `ciclo skills install` (HOME fake) funcionaram.

### 2026-09-02 — gh (GitHub CLI) passa a ser obrigatória no `ciclo init`

- **Decisão**: gh deixa de ser opcional/recomendada — agora é **obrigatória** no
  wizard, no mesmo nível da acli/Jira.
- **`init.js`**: novo `validateGitHub()` (roda nos modos interativo e `-y`):
  - gh ausente → `ensureCliInstalled('gh', …)` (auto-instala ou aborta);
  - `gh auth status` falha → aborta com `✗ GitHub CLI (gh) não autenticada.
    Rode \`gh auth login\` e tente novamente.`
- **Docs**: README (tabela de pré-requisitos), GUIA-DEV (gh ✅ Obrigatória),
  ROTEIRO-REPLICACAO (Etapa 0 marca as duas CLIs como obrigatórias + nota).
- **Skill** `ciclo-framework-setup` atualizada (GH required; auto-install +
  auth obrigatória) e sincronizada com o repo.
- Validado: `init -y` OK com gh autenticado; aborta (exit 1) com
  `GH_CONFIG_DIR` vazio (simulando gh sem login).

### 2026-09-02 — CI matrix multi-OS validado (Linux/macOS/Windows)

- **`.github/workflows/ci-multi-os.yml` criado e passando** nos 3 SOs
  (ubuntu/macos/windows × Node 20): lint de todos os .js do CLI,
  `verify-dev-machine.js --ci`, smoke do fingerprint (dotnet/go/python) e
  `ciclo skills list + install` em HOME temporário (commit `b7c7eea`).
- **Pitfall descoberto no Windows**: o Node usa `USERPROFILE` (não `HOME`) para
  `os.homedir()` — no primeiro run o `skills install` com HOME fake instalou no
  `C:\Users\<user>\.hermes` real e o teste falhou (o código estava correto).
  Fix: setar `HOME` e `USERPROFILE` juntos (commit `e5f1a12`); registrado na
  skill `ciclo-framework-setup`.
- `verify-dev-machine.js` ganhou o modo `--ci` (sai 0 mesmo com pendências
  esperadas do runner, validando execução/saída nos 3 SOs).

### 2026-08-29 — Compatibilidade Linux/macOS/Windows + verificação de máquina

- **Refactors para execução sem shell (multi-OS)** — comandos de git/gh/acli
  agora usam `execaSync`/array de args (sem `shell: true`), funcionando igual
  nos 3 SOs (inclusive paths/descrições com espaços):
  - `repoLabel.js` e `context.js` → `git remote get-url origin`
  - `GithubVcsAdapter.js` → `_git`, `_ghApi`, `openPullRequest`, `getWorkflowStatus`
  - `start.js` → gh auth/api/push; `doctor.js` → gh --version/auth status
  - (JiraTaskStore já havia sido refatorado no commit `88c7698`)
- **`verify-dev-machine.js` criado** (skill `scripts/`, Node puro sem deps — roda
  nos 3 SOs): valida Node, CLI ciclo, acli+auth, gh+auth, skills instaladas,
  config global e (opcional) `ciclo doctor` num repo. Exit 0/1; testado 9/9 na
  máquina pronta e com HOME fake (4 pendentes detectados + orientações).
- **ROTEIRO-REPLICACAO** ganhou seção "Suporte a sistemas operacionais" (tabela
  por camada/SO) e a Etapa 6 usa o `verify-dev-machine.js` como validação
  principal (`.sh` fica como bônus Linux/macOS).
- `cliInstall.js` já cobria os 3 SOs (specs macos/windows/linux) — sem mudanças.

### 2026-08-29 — Roteiro de replicação da instalação (máquinas de dev)

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