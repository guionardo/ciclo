# Changelog IA

*Changes made by ciclo agents*

## 2026-09-02 — Instalação do Hermes passa a ser opcional (recomendada)

- **Hermes Agent**: a verificação da máquina do dev (`ciclo doctor` e `verify-dev-machine.js`) agora trata o Hermes como **opcional, mas recomendado para recursos avançados**. A saída mostra `instale com: ... (opcional, mas recomendado para recursos avançados)` quando ausente.
- As skills do ciclo continuam sendo instaladas por padrão via `ciclo skills install` (necessárias para o funcionamento do framework).
- Documentação atualizada: skill `ciclo-framework-setup` (seção de setup da máquina) e `verify-dev-machine.js` refletem a mudança.
- O wizard `ciclo init` não exige Hermes; ele apenas sugere a instalação como parte da preparação da máquina.

## 2026-09-02 — doctor oferece comando de instalação por SO

- **`ciclo doctor`** agora imprime, para cada CLI ausente (acli/gh), o **comando
  de instalação do SO em execução**: reutiliza `cliInstall.js`
  `detectPlatform()`/`getInstallSpec()` → `brew` (macOS), `winget`/PowerShell
  (Windows), curl/apt (Linux); Hermes já era por SO (install.sh/install.ps1).
  Inclui o rótulo `📥 Instalar agora (<plataforma>):` + dica de `ciclo init`
  (instala automaticamente) e de `gh auth login` após instalar o gh.
- Validado: saída real no macOS (brew tap + brew install acli; brew install gh);
  comandos Windows/Linux conferidos via simulação do `cliInstall.js`.
- Skill sincronizada (seção `doctor` descreve a ordem toolchain-primeiro e os
  comandos por SO).

## 2026-09-02 — Instalação compatível com npm 12 (allow-git)

- **Problema**: em máquina limpa com npm ≥ 12, `npm install -g guionardo/ciclo`
  falha com `EALLOWGIT: refusing to fetch "github:guionardo/ciclo"` — o npm 12
  **desabilitou dependências git por padrão** (nova config `allow-git`, default
  `none`; valores `all`/`none`/`root`, confirmado no fonte do npm 12.0.2).
- **Solução**: instalação documentada com `npm install -g --allow-git=all
  guionardo/ciclo` (reproduzida e validada com npm 12 real: install + bin +
  first-run OK; a flag é aceita sem efeito no npm 9–11). Alternativa
  permanente: `npm config set allow-git all`.
- **`updateCheck.js`**: o comando sugerido no aviso de versão nova agora inclui
  `--allow-git=all`.
- **Docs**: README (Início rápido + seção de instalação + checagem de versão),
  GUIA-DEV §1.3 (opção rápida + tabela de instaladores), ROTEIRO-REPLICACAO
  Etapa 2 e skill (SKILL.md + references update-check/docs-decisions, repo e
  local sincronizadas).

## 2026-09-02 — Instalação do Hermes prevê Windows e macOS

- **Instalação por SO documentada** (instaladores oficiais do Hermes):
  Linux/macOS → `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`;
  **Windows → PowerShell `iex (irm https://hermes-agent.nousresearch.com/install.ps1)`**
  (instalador oficial, verificado no install.sh que aponta para ele); WSL usa o
  instalador Linux.
- **Código com detecção por SO**: `doctor.js` (mensagem de Hermes ausente),
  `welcome.js` (first-run) e `scripts/welcome.js` (postinstall) mostram o
  comando correto conforme `process.platform === 'win32'`;
  `verify-dev-machine.js` (check 5b) sugere o instalador do SO.
- **Docs**: ROTEIRO-REPLICACAO Etapa 3, GUIA-DEV §1.2 e README (Início rápido +
  tabela de pré-requisitos) com os dois comandos; skill sincronizada (repo +
  local). Comandos oficiais conferidos na skill `hermes-agent`.

## 2026-09-02 — ciclo doctor: valida dependências (toolchain) antes do projeto

- **Ordem das checagens invertida**: o doctor validava o `.ciclo` do diretório e
  abortava (`exit(1)`) antes de checar acli/gh/Hermes — inútil na 1ª instalação.
  Agora a **seção "🔧 Dependencies (toolchain)" roda sempre primeiro** (mesmo
  fora de projeto ciclo): Node.js, acli + auth Jira, gh + auth GitHub, Hermes
  Agent — cada ausência/falta de auth vira ❌ com a instrução de instalação
  específica (brew/README, `gh auth login`, `curl ... install.sh`).
- **Projeto ciclo validado depois** (`.ciclo/config.json`, services, state) e o
  doctor aguenta rodar fora de projeto: orienta `ciclo init` como primeiro
  passo; resumo "❌ N pendência(s)" + exit 1, ou "✅ All checks passed" + exit 0.
- Testado: fora de projeto (toolchain ✅ / projeto ✗), projeto fake com
  credenciais reais (exit 0), PATH sem acli/hermes (❌ com instruções, exit 1).

## 2026-09-02 — Boas-vindas pós-instalação + compatibilidade de instaladores

- **Mensagem de boas-vindas pós-instalação**: `scripts/welcome.js` +
  `postinstall` no pacote (mostra comandos essenciais ao instalar). Como npm
  ≥11, pnpm e bun **bloqueiam scripts de dependências por padrão**
  (allow-scripts / onlyBuiltDependencies / untrusted), a garantia veio do
  **first-run**: `cli/src/services/welcome.js` + chamada no `bin/ciclo.js`
  mostram boas-vindas + comandos na **1ª execução** (marker
  `~/.ciclo/first-run.json`; respeita `CICLO_NO_WELCOME=1` e CI).
- **Instaladores testados na prática** (todos via `github:guionardo/ciclo`):
  **npm 11.17** ✅ (postinstall condicionado a allow-scripts + first-run ok),
  **pnpm 11.13** ✅ (bloqueia postinstall, first-run ok), **bun 1.3** ✅
  (bloqueia postinstall, first-run ok), **deno 2.9** ❌ não suportado (CLI é
  CommonJS → `ReferenceError: require is not defined`).
- **Docs**: GUIA-DEV §1.3 e ROTEIRO-REPLICACAO Etapa 2 ganharam tabela/nota
  "Instaladores alternativos (bun, pnpm, deno)"; skill sincronizada (repo +
  local).

## 2026-09-02 — Instruções de instalação do Hermes Agent para o dev

- **A instalação do Hermes Agent agora faz parte do setup do dev** (era o
  runtime do agente que faltava instruir): ROTEIRO-REPLICACAO ganhou a
  **Etapa 3 — Instalar o Hermes Agent** (`curl -fsSL
  https://hermes-agent.nousresearch.com/install.sh | bash` + `hermes setup`/
  `doctor`) e renumerou as etapas seguintes (skills 4, config 5, init 6,
  validação 7, entrega 8).
- **GUIA-DEV**: seção 1.2 "Instalar o Hermes Agent (runtime do agente)"
  (pré-requisitos, comandos oficiais) — demais seções renumeradas.
- **README**: Início rápido e tabela de pré-requisitos citam o Hermes com o
  instalador oficial.
- **`verify-dev-machine.js`**: novo check 5b "Hermes Agent (runtime do agente)"
  (`hermes --version`; valida instalação e orienta se ausente) → máquina pronta
  agora é **10/10 checks**; skill sincronizada.
- Comandos oficiais usados vieram da skill hermes-agent (install.sh + setup +
  doctor), não de suposição.

### 2026-09-02 — README como entrada rápida + decisões em doc separado

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