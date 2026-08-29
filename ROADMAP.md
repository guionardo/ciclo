# ROADMAP — ciclo

Evolução incremental. **Fases 0–5 = piloto local** (um desenvolvedor, sem APIs
externas); fases seguintes plugam JIRA/GitHub quando houver acesso.

---

## Parte I — Piloto local (v0.x)

### Fase 0 — Scaffold do framework (½–1 semana)
- [ ] Repo/estrutura `ciclo-core`: CLI Node.js + TypeScript (`ciclo`), publicável via `npx @ciclo/cli`
- [ ] Interfaces `TaskStore` e `VcsAdapter` + `LocalTaskStore`
- [ ] **Fingerprint do repo**: escanear package.json/workflows/estrutura; *question filtering* no wizard
- [ ] **Wizard `ciclo init`**: pré-voo → fingerprint → perguntas mínimas → validação de acesso GitHub/Jira (MCP preferencial, fallback CLI/REST; pulável) → resumo
- [ ] **Escrita transacional**: backup/rollback dos arquivos-alvo; estratégias por arquivo (criar / managed section no AGENTS.md / append no .gitignore / merge no config)
- [ ] Lockfile `.ciclo/state.json` (versão, fingerprint, respostas); re-run idempotente em modo update
- [ ] Credenciais em `~/.ciclo/credentials.json` (fora do repo, chmod 600)
- [ ] Comando `ciclo doctor` (re-valida acessos sob demanda)
- [ ] Esqueleto do hub de contexto (`context/` com rules da stack detectada) e pasta de decisões da IA (`docs/ciclo/decisoes/`)
- **Saída:** `npx @ciclo/cli init` dentro de um repo existente cria todos os artefatos sem tocar no código da aplicação; wizard pulável quando serviços indisponíveis.

### Fase 1 — Tasks locais (1 semana)
- [ ] `ciclo new / list / show / move` — CRUD de tasks em arquivos `.md` + `.json`
- [ ] Workflow de estados com gates (`backlog → … → concluída`)
- [ ] Registro de eventos em `events.jsonl`
- [ ] CHANGELOG-IA.md por repo (registro das ações dos agentes)
- **Saída:** dev piloto gerencia tasks locais com workflow rastreado.
- **Validação:** criar task, refinar à mão, mover estados, ver histórico.

### Fase 2 — Agente Analista (Hermes) (1 semana)
- [ ] Prompt/fluxo de refinamento (perguntas → spec estruturada)
- [ ] Gravação da spec aprovada em `context/specs/`
- [ ] Transição `backlog → refinando → pronta` com gate humano
- [ ] Analista consulta decisões anteriores em `docs/ciclo/decisoes/`
- **Saída:** task bruta entra, spec detalhada sai, aprovada pelo dev piloto.
- **Validação:** task real de um repo do time refinada ponta-a-ponta.

### Fase 3 — Agente Dev (opencode) (1–2 semanas)
- [ ] `ciclo start TASK-N`: branch `ciclo/TASK-N` + worktree dedicado
- [ ] Montagem de contexto no worktree (spec + rules + templates)
- [ ] Execução do opencode → commits na branch
- [ ] **Registro obrigatório de decisões** em `docs/ciclo/decisoes/` (formato mini-ADR)
- [ ] Loop de retrabalho (checklist do reviewer → novos commits)
- **Saída:** primeira feature implementada sem código humano.
- **Validação:** diff revisado pelo piloto e mergeado manualmente.

### Fase 4 — Review engine (1 semana)
- [ ] Primeira passada automatizada sobre o diff (`main..ciclo/TASK-N`)
- [ ] Checklist gravado em `reviews/TASK-N.md` + veredito
- [ ] Integração com o loop de retrabalho da Fase 3
- **Saída:** revisão humana chega mais rápida ao merge, com material pronto.

### Fase 5 — Observabilidade local (1 semana)
- [ ] `ciclo report`: relatório markdown a partir de `events.jsonl`
- [ ] Métricas: tempo por estado, retrabalho, custo/token por task
- **Saída:** visão da evolução das tasks vs. roadmap durante o pilotagem.

## Parte II — Integrações externas (fase 2+ do produto)

Quando houver acesso ao Jira Cloud e GitHub:

### Fase 6 — GitHub
- [ ] `GithubVcsAdapter`: PRs, labels, observação dos workflows Actions (D7)
- [ ] Deploy: eventos automáticos `deploy.homolog-ok` / `prod-ok` / `falhou`
- [ ] Task → `concluída` confirmada pelo pipeline
- [ ] Wizard: geração de rascunho do AGENTS.md lendo as convenções reais do repo (estilo `/init` do Claude Code)

### Fase 7 — Jira Cloud
- [ ] `JiraTaskStore`: espelhamento task local ↔ issue Jira (custom fields)
- [ ] Comentários do ciclo viram threads no Jira

### Fase 8+ — Evolução
- Dashboard React consumindo os eventos (D5)
- Multi-dev: fila compartilhada entre pilotos
- Merge assistido com gates maduros

---

## Riscos

| Risco | Mitigação |
|---|---|
| Specs mal refinadas → código errado | Humano aprova toda spec antes de `pronta` |
| Agente Dev quebra build repetidamente | Limite de tentativas; escalona p/ humano |
| Custo de tokens fora de controle | Log por execução + teto por task |
| Worktrees conflitam com fluxo manual existente | Branches `ciclo/*` isoladas; merge sempre humano |
| Framework não colar com o piloto | Dogfooding desde a Fase 1; ajustar workflow conforme feedback |
