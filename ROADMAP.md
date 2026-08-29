# ROADMAP — ciclo

Evolução incremental. **Parte I — piloto (v0.x)** cobre o fluxo local + integrações
nativas via CLIs oficiais (ACLI + gh). Fases posteriores adicionam PR automático
e dashboard.

---

## Parte I — Piloto (v0.x)

### Fase 0 — Framework & wizard ✅
- [x] CLI Node.js `ciclo` publicável; estrutura do framework
- [x] Fingerprint do repo (package.json/workflows/estrutura) no `ciclo init`
- [x] Wizard `ciclo init`: valida/instala as CLIs oficiais (`acli` via Homebrew/curl/apt, `gh` via brew/winget/apt) por SO; exige Jira autenticado via ACLI
- [x] Escrita transacional (backup/rollback) e idempotente (re-run não duplica `.gitignore`)
- [x] Lockfile `.ciclo/state.json`; config versionável `.ciclo/config.json` (sem credenciais)
- [x] Config global do usuário `~/.ciclo/config.json` (`reposDir`, `statusMap`, `apiToken` opcional)
- [x] `ciclo doctor` (valida ACLI + gh + conexões)
- [x] AGENTS.md gerenciado com **instruções ao agente** (carregar o ciclo, reposDir, `<reposDir>/<label>`)
- [x] Esqueleto do hub de contexto (`context/`) e decisões da IA (`docs/ciclo/decisoes/`)

### Fase 1 — Tasks locais ✅
- [x] `ciclo new / list / show / move` — CRUD de tasks em `.ciclo/tasks/*.json`
- [x] Workflow de estados com normalização Jira↔ciclo (`statusMap`)
- [x] `ciclo refine` — descrição, critérios de aceitação, subtasks (sincroniza no Jira)
- [x] `ciclo start` — branch `TASK/<id>-<slug>` + push (gh) + Jira → IN PROGRESS

### Fase 2 — Integração Jira (ACLI) ✅
- [x] `JiraTaskStore` via **Atlassian CLI** (view/create/edit/search/transition; OAuth)
- [x] `ciclo show <chave-jira>` — importa do board com dedupe (jiraKey + repoLabel)
- [x] Vínculo **repositório ↔ label**: issues criadas com o label; import só do label do repo; pergunta se quer adicionar o label quando falta
- [x] Hierarquia de issue types (`--type`, default Task) e parent (`--parent`)
- [x] `ciclo sync` — puxa do Jira as tasks do label do repo
- [x] `ciclo move` sem estado — descobre as **lanes reais** da issue e pede escolha
- [x] Sincronização bidirecional de status (`IN PROGRESS`/`IN REVIEW`/`DONE`), `statusMap` custom por board

### Fase 3 — Integração GitHub (gh CLI) ✅
- [x] `GithubVcsAdapter` via `gh` (auth no keyring; sem `GITHUB_TOKEN`)
- [x] Push de branch do `ciclo start` quando há remote `origin`
- [x] `ciclo trabalho <jiraKey>` — clona `<reposDir>/<label>` (gh repo clone), inicializa e sincroniza a issue
- [ ] `ciclo pr` — abrir PR da branch via `gh pr create` *(próximo)*

### Fase 4 — Agentes & instruções ✅
- [x] `ciclo instrucoes` — consolida AGENTS.md (projeto + global) e skills habilitadas (recursivo em `~/.hermes/skills/`, incl. categorias)
- [x] `skillsEnabled` persistido no config; skills descobertas e resumidas
- [ ] Montagem automática do worktree por task com opencode *(parcial — branch direta)*
- [ ] Loop de retrabalho automatizado reviewer → dev

### Fase 5 — Observabilidade ✅ (parcial)
- [x] `ciclo report` — contagens, idade média, branches ativas, atividade 24h
- [x] `ciclo report --jira` — mescla dados do Jira (assignee, prioridade, status, labels)
- [ ] Dashboard React consumindo eventos *(fase posterior)*

---

## Parte II — Evolução (fases seguintes)

### Fase 6 — GitHub avançado
- [ ] `ciclo pr` automático ao concluir revisão
- [ ] Observação dos workflows Actions (deploy ok/falhou → eventos automáticos)
- [ ] Geração de rascunho do AGENTS.md lendo convenções reais do repo (estilo `/init` do Claude Code)

### Fase 7 — Jira avançado
- [ ] Comentários do ciclo viram threads no Jira
- [ ] Estimativas/assignee round-trip no `refine`

### Fase 8+ — Escala
- Dashboard React (D5)
- Multi-dev: fila compartilhada
- Merge assistido com gates maduros

---

## Riscos

| Risco | Mitigação |
|---|---|
| Specs mal refinadas → código errado | Humano aprova todo `pronta` |
| Agente Dev quebra build repetidamente | Limite de tentativas; escala p/ humano |
| Custo de tokens fora de controle | Log por execução + teto por task |
| Branches conflitam com fluxo manual | Branches `TASK/*` isoladas; merge sempre humano |
| Framework não colar com o piloto | Dogfooding desde a Fase 1; ajustar conforme feedback |
| Label de repo divergir do nome real | `remote origin` configurado OU env `CICLO_REPO_LABEL` |