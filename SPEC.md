# SPEC — ciclo

Framework de IA para operar o ciclo de desenvolvimento de um time pequeno.
Projeto independente; compartilha conceitos com a proposta L3A (hub de contexto,
padronização) sem vínculo com o cliente.

**Estratégia v0.1 (decisões D8/D9): local-first.** O framework é instalado no
ambiente de **um desenvolvedor piloto**, que usa o fluxo completo em repositórios
reais. As integrações com Jira e GitHub **já são nativas via CLIs oficiais**
(ACLI + gh), com sessões autenticadas na HOME do usuário — nenhuma credencial
vive no repositório.

---

## 1. Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                         ciclo-core                          │
│  orquestração: CLI Node.js (comandos), workflow de tasks,   │
│  sincronização Jira/GitHub, observabilidade                 │
├───────────┬───────────┬───────────┬───────────┬─────────────┤
│ task-     │ vcs-      │ agentes   │ config    │ observ-     │
│ store     │ adapter   │ (runtime) │ global    │ module      │
│ (local +  │ (git +    │ Hermes /  │ (~/.ciclo │ (report,    │
│ Jira via  │ gh CLI)   │ opencode  │ + .ciclo  │ --jira)     │
│ ACLI)     │           │           │ do repo)  │             │
└───────────┴───────────┴───────────┴───────────┴─────────────┘
```

### 1.1 ciclo-core

Núcleo de orquestração em **Node.js** (CLI `ciclo`). Não conhece a API REST do
Jira nem tokens do GitHub diretamente — opera através das **CLIs oficiais**:

| Serviço | CLI | Autenticação | Onde vive a sessão |
|---|---|---|---|
| Jira | **acli** (Atlassian CLI) | OAuth (`acli jira auth login --web`) ou API token | `~/.config/acli` |
| GitHub | **gh** (GitHub CLI) | `gh auth login` | keyring do sistema |

**Princípio central:** credenciais **nunca** ficam no repositório nem no `.env`
do projeto — a sessão fica na HOME do usuário (mesmo modelo do `gh`). O projeto
guarda apenas configuração não-sensível em `.ciclo/config.json`.

Comandos atuais:

| Comando | Função |
|---|---|
| `ciclo init` | wizard/instalação do framework no repo (validando/instalando CLIs) |
| `ciclo new [desc] --type --parent` | cria task local + issue no Jira (com tipo e hierarquia) |
| `ciclo list` | lista tasks locais |
| `ciclo show <id>` | exibe task; se for chave Jira, importa do board (dedupe por label) |
| `ciclo move <id> [estado]` | muda estado local + sincroniza transition no Jira; sem estado, descobre as lanes |
| `ciclo start <id>` | cria branch `TASK/<id>-<slug>`, push (gh), Jira → IN PROGRESS |
| `ciclo refine <id>` | detalha task (descrição, critérios, subtasks) e sincroniza no Jira |
| `ciclo sync` | puxa do Jira as tasks com o label do repositório |
| `ciclo trabalho <jiraKey>` | prepara o repo de uma issue (clona + init + sync) |
| `ciclo report [--jira]` | observabilidade local + dados mesclados do Jira |
| `ciclo doctor` | valida ACLI + gh + conexões |
| `ciclo instrucoes [--texto] [--check]` | exibe AGENTS.md + skills passadas ao agente |

### 1.2 TaskStore (adaptador de tasks)

| Implementação | Status | Armazenamento |
|---|---|---|
| `LocalTaskStore` | ✅ v0.1 | arquivos `.json` em `.ciclo/tasks/<id>.json` |
| `JiraTaskStore` | ✅ v0.1 (via **ACLI**) | Jira Cloud via `acli jira workitem` |

`JiraTaskStore` usa exclusivamente a ACLI:

- `getTask(key)` → `acli jira workitem view <key> --json`
- `createTask(data)` → `acli jira workitem create --summary ... --project ... --type ... --label ... --parent ...`
- `updateTask(id, updates)` → `workitem edit` (summary/description/labels) + `workitem transition` (status)
- `listTasks(filters)` → `workitem search --jql ... --json`
- `getAvailableTransitions(key)` → REST `/issue/{key}/transitions` quando há token; senão fallback para o statusMap configurado
- Converte **ADF** (Atlassian Document Format) da descrição para texto

Task local:

```
.ciclo/tasks/
├── a1b2c3d4.json        # id local (8 chars), jiraKey, repoLabel, descrição, status, issueType...
```

### 1.3 VcsAdapter (adaptador de versionamento)

`GithubVcsAdapter` opera com o **git local + gh CLI**:

- branch `TASK/<id>-<slug>` criada a partir da branch atual
- push para `origin` (usando `gh` autenticado; sem remote, a branch fica local)
- download/clone de repos via `gh repo clone <label>` (usado pelo `ciclo trabalho`)
- PR automático: **não implementado ainda** (merge sempre humano na v0.1)

### 1.4 Agentes (runtimes)

| Papel | Runtime | Função |
|---|---|---|
| **Analista** | Hermes Agent | criar, detalhar, refinar tasks; validar specs |
| **Dev** | opencode | implementar código a partir da spec refinada |
| **Reviewer** | Hermes/opencode | primeira passada de code review no diff |

As instruções repassadas aos agentes são consolidadas em:

- **`AGENTS.md`** do repo (seção gerenciada `<!-- ciclo:begin -->`) com a instrução
  de **carregar o ciclo a cada início de sessão**, o `reposDir` e a resolução
  `<reposDir>/<label>` para issues do Jira
- **Skills** habilitadas em `.ciclo/config.json` (`skillsEnabled`), localizadas em
  `~/.hermes/skills/` — o comando `ciclo instrucoes` exibe tudo isso

### 1.5 Configuração (dois níveis)

**Config global do usuário** — `~/.ciclo/config.json` (fallback legado:
`~/.hermes/ciclo-defaults.json`):

```json
{
  "reposDir": "/Users/voce/workspace",
  "services": {
    "jira": {
      "siteUrl": "https://voce.atlassian.net",
      "projectKey": "PROJ",
      "statusMap": { "em_execução": "IN PROGRESS", "revisao": "IN REVIEW", "concluida": "DONE" },
      "apiToken": ""   // opcional — habilita REST de transições
    }
  }
}
```

**Config do projeto** — `.ciclo/config.json` (versionável, sobrescreve o global):

```json
{
  "devName": "voce",
  "taskPrefix": "TASK",
  "services": { "jira": { "configured": true, "method": "acli", "siteUrl": "...", "projectKey": "FW" } },
  "skillsEnabled": ["hermes-agent", "autonomous-ai-agents", "coding-agents", "github"],
  "stack": { ... }
}
```

### 1.6 Vínculo repositório ↔ label (Jira)

Cada task sincronizada com o Jira carrega o **label do repositório local**
(derivado do remote `origin` → nome do repo, ou do nome do diretório;
sobrescrevível com env `CICLO_REPO_LABEL`):

- **Local → Jira**: `ciclo new` cria a issue com `--label <repo>`.
- **Jira → Local**: `ciclo show`/`ciclo sync` só consideram issues **com o label
  deste repo** — dedupe por `jiraKey` + `repoLabel`, ignorando issues de outros repos.
- **Task sem o label + pasta é repo git**: o ciclo **pergunta se quer adicionar o
  label** à issue (atualização no Jira).
- **Cadeia de parents**: ao importar (`show`) ou ao iniciar (`start`), a task local
  também guarda a **cadeia de hierarquia** (Story/Feature/Epic com `summary` +
  `description` de cada ancestor) em `parentChain`. O `start` re-sincroniza SEMPRE
  (issue + parentChain) antes de criar a branch, garantindo escopo alinhado ao board;
  o `refine` exibe essa cadeia como contexto.
- **Label `refined` (prontidão para execução)**:
  - Ao refinar, a issue recebe a label **`refined`** (sincronizada Jira ↔ local).
  - `ciclo start` verifica a label: se a issue **não** está refinada, pergunta ao dev
    se quer revisar a descrição e refiná-la (objetivo 🎯, passos de execução 🪜 e
    resultado esperado 📦) antes de iniciar; o refine usa a cadeia de parents como
    contexto adicional.
  - `ciclo list`/`ciclo show` indicam o estado de refinamento (✅ / ⚠️-sem-refine).

### 1.7 Hierarquia de issue types

| Nível | Tipo | Pode conter |
|---|---|---|
| 1 | **Epic** | Feature, Story, Task, Bug |
| 2 | **Feature** | Story, Task, Bug |
| 3 | **Story** | Task, Bug |
| 4 | **Task** *(default)* | — |
| 4 | **Bug** | — |

- `ciclo new` pergunta o tipo (default `Task`), aceita `--type` e valida.
- `--parent <key>` cria o vínculo real de hierarquia no Jira (o Jira valida o scheme).

### 1.8 Mapeamento de status (ciclo ↔ Jira)

| Estado ciclo | Status Jira (default) |
|---|---|
| `backlog` / `refinando` / `pronta` | To Do |
| `em_execução` | In Progress |
| `revisao` | In Review |
| `concluida` | Done |

- Sobrescrevível por **`statusMap`** no config global ou do projeto (boards com lanes customizadas).
- `ciclo move <id>` sem estado **descobre as lanes reais** que a issue pode adotar
  (`getAvailableTransitions`) e pede a escolha.

### 1.9 Observabilidade

- `ciclo report` — contagens por estado, idade média, branches ativas, atividade 24h.
- `ciclo report --jira` — mescla dados do Jira (assignee, prioridade, status real, labels)
  para tasks com `jiraKey` do label do repo; seções por responsável e prioridade.

### 1.10 Registro de decisões da IA

```
docs/ciclo/
├── decisoes/
│   └── 2026-08-29-ADR-001-clis-oficiais-e-vinculo-repo-label.md
└── CHANGELOG-IA.md
```

---

## 2. Fluxo de trabalho (implementado e validado no piloto)

```
ciclo trabalho FW-123      # (opcional) clona <reposDir>/<label>, init, e importa a issue
ciclo new "Feature" --type Story --parent FW-9
                           # → cria local + issue no Jira (label do repo, tipo, parent)
ciclo refine <id>          # detalha (descrição + critérios) e sincroniza no Jira
ciclo move <id> em_execução # → local em_execução + Jira IN PROGRESS
   ...implementação...     # código no branch TASK/<id>-<slug> (push via gh)
ciclo move <id> revisao    # → Jira IN REVIEW
ciclo move <id> concluida  # → Jira DONE
ciclo report --jira        # observabilidade mesclada
```

Gates: transições críticas (`concluida`) continuam exigindo ação humana; merge em
`main` é sempre manual na v0.1.

---

## 3. Segurança & limites dos agentes

- Agente Dev escreve apenas no branch/worktree da sua task; não mergeia sozinho.
- Nenhuma credencial no repo: sessões em `~/.config/acli` e keyring do `gh`.
- Tokens opcionais (ex.: `apiToken` do Jira p/ REST de transições) ficam no
  config **global** (`~/.ciclo/config.json`), nunca no projeto.
- Toda decisão relevante de agente vira mini-ADR em `docs/ciclo/decisoes/`.

## 4. Fora de escopo (v0.1)

- PR automático / merge automático (revisão humana obrigatória)
- Dashboard React
- Multi-tenant / fila compartilhada
- Banco de dados próprio do framework

## 5. Próximos passos sugeridos

1. Configurar remote `origin` nos repos do piloto (label passa a usar o nome real
   do repo; `ciclo start` ganha push automático).
2. `ciclo pr` — abrir PR da branch via `gh pr create`.
3. `reposDir` multi-root (mais de um diretório de repos).