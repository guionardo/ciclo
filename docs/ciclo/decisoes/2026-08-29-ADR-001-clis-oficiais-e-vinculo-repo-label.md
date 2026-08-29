# ADR-001 — CLIs oficiais e vínculo repositório↔label

**Data:** 2026-08-29
**Status:** Aceito e implementado
**Área:** Arquitetura da integração com Jira e GitHub

---

## Contexto

O ciclo (framework de IA para o ciclo de desenvolvimento) precisa interagir com
Jira e GitHub. As abordagens avaliadas:

1. **API REST direta** com tokens no projeto (`JIRA_BASE_URL/EMAIL/API_TOKEN`,
   `GITHUB_TOKEN`) — vazava credenciais para o repo, exigia scopes/permutations
   e quebrava quando o token expirava.
2. **MCP (GitHub MCP, Atlassian MCP)** — bom quando disponível, mas nem sempre
   presente no ambiente do piloto.
3. **CLIs oficiais** — `acli` (Atlassian CLI) e `gh` (GitHub CLI), que guardam a
   sessão autenticada na HOME do usuário.

## Decisões

### D-A: Integração via CLIs oficiais (ACLI + gh)

- **Jira** → `acli jira workitem ...` (view/create/edit/search/transition),
  autenticado com **OAuth** (`acli jira auth login --web`) ou API token; a sessão
  fica em `~/.config/acli`.
- **GitHub** → `gh auth login` (keyring); sem `GITHUB_TOKEN` no projeto.
- **Nenhuma credencial** é armazenada no repositório nem no `.env` do projeto.

Consequências:
- Cluster de segredos reduzida; re-autenticação única por máquina.
- `ciclo doctor` valida via `acli jira auth status` e `gh auth status`.
- `ciclo init` detecta CLIs ausentes e **oferece instalação automática por SO**
  (Homebrew/curl no macOS, winget/PowerShell no Windows, apt/dnf/curl no Linux).

### D-B: Configuração em dois níveis (global + projeto)

- **Global** `~/.ciclo/config.json` (fallback: `~/.hermes/ciclo-defaults.json`):
  `reposDir` (raiz dos repos), `statusMap` custom (lanes de boards), `apiToken`
  opcional do Jira (habilita REST de transições).
- **Projeto** `.ciclo/config.json` (versionável): devName, taskPrefix, services,
  `skillsEnabled`, stack. **Sobrescreve o global.**

### D-C: Vínculo repositório ↔ label

- Todo issue criado no Jira recebe o **label do repositório local**
  (remote `origin` → nome do repo; fallback: nome do diretório; override: env
  `CICLO_REPO_LABEL`).
- Importação (`ciclo show`, `ciclo sync`) só considera issues que carregam o label
  deste repo — dedupe por `jiraKey` + `repoLabel`.
- Se a issue não tem o label e a pasta é um repo git, o ciclo pergunta se quer
  adicioná-lo (atualização no Jira).

### D-D: Hierarquia de issue types e parent

- Tipos: **Epic > Feature > Story > Task/Bug** (Task é o padrão).
- `ciclo new` aceita `--type` (case-insensitive) e pergunta quando não definido.
- `--parent <key>` cria o vínculo real de hierarquia no Jira (o Jira valida o scheme).

### D-E: Mapeamento de status centralizado (statusMap)

- Estado ciclo ↔ status Jira default: `em_execução→IN PROGRESS`,
  `revisao→IN REVIEW`, `concluida→DONE`; demais ficam em `To Do`.
- Boards com lanes customizadas definem `statusMap` no config (global ou projeto).
- `ciclo move` sem estado descobre as lanes reais da issue (REST transitions
  quando há token; senão usa o statusMap) e pede a escolha.

### D-F: Preparação de repo a partir da issue (`ciclo trabalho`)

- O repositório de uma issue é derivado da **label** + `reposDir`:
  `<reposDir>/<label>`.
- Se não existe → `gh repo clone <label>` + `ciclo init` + `ciclo show <jiraKey>`.
- O AGENTS.md gerado pelo init instrui o agente a carregar o ciclo a cada sessão,
  informando `reposDir` e a resolução `<reposDir>/<label>`.

## Alternativas consideradas e rejeitadas

| Opção | Motivo da rejeição |
|---|---|
| REST + tokens no projeto | segredos no repo; expiração; manutenção de scopes |
| MCP como obrigatório | indisponível em alguns ambientes; wizard ficaria frágil |
| Sessão no projeto (`~/.ciclo/credentials.json`) | ainda mistura credencial com o repo do framework; CLIs já resolvem isso |

## Consequências

- Piloto validado ponta-a-ponta: new → refine → start → move → concluída, com
  sincronização bidirecional Jira (status, descrição, labels) e GitHub (branch push).
- `ciclo report --jira` mescla dados reais do board (assignee, prioridade, status).
- Comandos: `init`, `new`, `list`, `show`, `move`, `start`, `refine`, `sync`,
  `trabalho`, `report [--jira]`, `doctor`, `instrucoes [--texto|--check]`.