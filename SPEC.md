# SPEC — ciclo

Framework de IA para operar o ciclo de desenvolvimento de um time pequeno.
Projeto independente; compartilha conceitos com a proposta L3A (hub de contexto,
padronização) sem vínculo com o cliente.

**Estratégia v0.1 (decisões D8/D9): local-first.** O framework é instalado no
ambiente de **um desenvolvedor piloto**, que usa o fluxo completo em repositórios
reais enquanto o framework é refinado. JIRA, GitHub e observabilidade remota são
integrações posteriores — a arquitetura já nasce preparada para elas via adaptadores.

---

## 1. Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                         ciclo-core                          │
│  orquestração: workflow de task, transições, gates, fila    │
├───────────┬───────────┬───────────┬───────────┬─────────────┤
│ task-     │ vcs-      │ agentes   │ review-   │ observ-     │
│ store     │ adapter   │ (runtime) │ engine    │ module      │
│ (local    │ (git      │ Hermes /  │           │             │
│ files)    │ local)    │ opencode  │           │             │
└───────────┴───────────┴───────────┴───────────┴─────────────┘
      │            │           │          │           │
  arquivos     git do       runtimes   diffs +    eventos +
  .md/.json    projeto      locais     checklist  relatório
               (repos                   local      markdown
               existentes)
```

### 1.1 ciclo-core

Núcleo de orquestração, em Node.js + TypeScript. Não conhece JIRA nem GitHub —
conhece **interfaces** (`TaskStore`, `VcsAdapter`) que hoje têm implementação
local e amanhã terão implementações remotas.

Responsabilidades:

- **Workflow da task** — estados e transições permitidas:
  `backlog → refinando → pronta → em_execução → em_review → aprovada → deploy → concluída`
- **Fila de trabalho** — quais tasks estão disponíveis para qual agente, com prioridade.
- **Regras de gate** — condições para avançar de estado (ex.: `em_review` exige PR/branch;
  `aprovada` exige revisão humana explícita).
- **Registro de eventos** — cada transição gera evento (`task.refinada`, `branch.criada`, …)
  consumido pelo módulo de observabilidade.

Implementação: CLI Node.js + TypeScript (`ciclo`), estado em arquivos locais.
Sem banco na v0.1; se precisar de persistência estruturada futura, SQL Server via
camada de dados aberta (D6).

### 1.2 TaskStore (adaptador de tasks)

Interface única para tasks; duas implementações planejadas:

| Implementação | Quando | Armazenamento |
|---|---|---|
| `LocalTaskStore` ✅ v0.1 | agora | arquivos `.md` (conteúdo) + `.json` (metadados) num diretório `tasks/`, versionado em git junto ao hub |
| `JiraTaskStore` ⏳ fase 2+ | quando houver acesso ao Jira Cloud | API REST do Jira, custom fields do ciclo |

A interface cobre: criar/listar/ler/atualizar task, transição de estado,
adicionar comentário (o comentário local vira thread no Jira depois).

Formato da task local:

```
tasks/
├── TASK-001.md          # corpo: objetivo, contexto, critérios de aceite
└── TASK-001.json        # metadados: estado, prioridade, agente, histórico de transições
```

### 1.3 VcsAdapter (adaptador de versionamento)

Interface para operações de código; implementação v0.1 opera **diretamente no git
local** dos repositórios existentes do time (D9):

- criar branch `ciclo/TASK-001` a partir de `main`
- commit/push (push só se o repo tiver remoto configurado — funciona offline também)
- abrir PR: **não existe na v0.1** (sem GitHub na fase inicial); o "PR" local é o
  próprio branch + diff, revisável pelo humano com `git diff main..ciclo/TASK-001`
- `GithubVcsAdapter` ⏳ fase 2+: branches, PRs, labels, webhooks, observação dos workflows Actions (D7)

### 1.4 Agentes (runtimes)

Dois runtimes, papéis distintos:

| Papel | Runtime | Onde roda | Função |
|---|---|---|---|
| **Analista** | Hermes Agent | máquina do piloto | criar, detalhar, refinar tasks; validar specs |
| **Dev** | opencode | diretório de trabalho por task | implementar código a partir da spec refinada |
| **Reviewer** | Hermes ou opencode | sob demanda | primeira passada de code review no diff |

- Cada agente recebe **somente a spec refinada + contexto do hub**, nunca a task bruta.
- O agente Dev trabalha num **worktree/diretório dedicado por task**
  (`git worktree add ../repo-task-001 ciclo/TASK-001`) — isolamento sem clone pesado.
- Prompts/instruções versionados no repositório do framework (`agents/`),
  nunca inline no código da orquestração.

### 1.5 Hub de contexto (ideia herdada do L3A)

Diretório compartilhado que dá contexto consistente aos agentes:

```
context/
├── AGENTS.md            # regras globais de comportamento dos agentes
├── specs/               # specs refinadas por task (TASK-001.md)
├── rules/               # convenções de código, git workflow, erros
│   ├── typescript.md    # padrões TS/Node (stack principal — D5)
│   ├── react.md         # componentes, estado, testes de UI
│   └── sqlserver.md     # migrations, acesso a dados (D6; aberto p/ PostgreSQL/MySQL)
├── templates/           # scaffolds Node/TS/React, checklist de revisão
└── docs/                # ADRs, runbooks (incl. workflows GitHub Actions existentes)
```

Cada repo de produto referencia o hub via `AGENTS.md` próprio.

### 1.6 Review engine

Primeira passada automatizada antes do humano — funciona igual no modo local:

1. Agente Reviewer lê o diff (`main..ciclo/TASK-001`) + spec da task
2. Produz checklist comentado (corretude vs. spec, convenções do hub,
   riscos, testes faltantes), gravado em `reviews/TASK-001.md`
3. Veredito: `ok` ou `mudanças-pedidas` (vira comentário na task e dispara
   novo ciclo do agente Dev)
4. Humano revisa com esse material — merge sempre humano na v0.1

### 1.7 Módulo de observabilidade

Consome eventos do ciclo-core (armazenados localmente em `events.jsonl`) e responde:

- **Task-level:** tempo em cada estado, retrabalho (voltas p/ refinamento),
  taxa de aprovação em primeira revisão
- **Roadmap:** burndown, throughput semanal, tasks travadas (> N dias num estado)
- **Agentes:** custo/token por task, taxa de sucesso, tarefas que precisaram
  intervenção humana
- Formato v0.1: comando `ciclo report` gera relatório markdown local;
  dashboard React fica para fase posterior (D5)

### 1.8 Setup & configuração (`ciclo init`)

#### 1.8.1 Como o dev adiciona o framework a um repositório existente

Padrão de mercado (prisma, eslint, firebase, husky, vercel, claude-code-setup):
**instalar ≠ inicializar**.

```bash
# Instalação do binário (uma vez): global ou one-shot
npm install -g @ciclo/cli        # opção A: global
npx @ciclo/cli init              # opção B: one-shot, sem instalar

# Inicialização (dentro do repositório alvo)
cd ~/projetos/app-existente
ciclo init
```

O `init` **nunca toca no código da aplicação** — só adiciona os artefatos do
framework (tabela abaixo) e respeita o que já existe.

**Pré-voo:** valida Node ≥ 20, git; detecta opcionais (`gh`, `opencode`,
servidores MCP) para uso posterior.

**Fingerprint do repo antes de perguntar:** o wizard escaneia `package.json`
(deps → React/TS/test runner/gerenciador de pacotes), CI existente
(`.github/workflows/`) e estrutura de pastas. Só pergunta o que não conseguiu
inferir (padrão *question filtering*). Num repo Node+React típico, as perguntas
reduzem a: nome do dev, convenção de tasks e quais serviços configurar.

#### 1.8.2 Wizard — passos

1. **Identidade** — nome do dev, confirmação do repo alvo (detectado)
2. **GitHub** — valida acesso via CLI (`gh auth status`), token ou MCP; pulável
3. **Jira Cloud** — valida acesso (API `/myself`) via token ou MCP Atlassian; pulável
4. **Agentes** — runtimes disponíveis (opencode, Hermes), modelos/chaves
5. **Resumo** — o que foi validado ✅ / pulado ⏭️ + próximos passos sugeridos
   (ex.: "rode `ciclo new` para criar a primeira task")

#### 1.8.3 Onde cada coisa é gravada

| Conteúdo | Local | Motivo |
|---|---|---|
| Config não-sensível | `<repo>/.ciclo/config.json` | versionável, específica do projeto |
| **Credenciais** (tokens GitHub/Jira, chaves) | `~/.ciclo/credentials.json` (fora de qualquer repo, chmod 600) | compartilhadas entre projetos; nunca commitadas |
| Lockfile de estado | `<repo>/.ciclo/state.json` | versão do ciclo, hash do fingerprint, respostas do wizard |
| Eventos e logs | `<repo>/.ciclo/events.jsonl`, `.ciclo/logs/` (gitignored) | rastreabilidade local |

#### 1.8.4 Arquivos criados/modificados no repo alvo

| Arquivo | Estratégia |
|---|---|
| `.ciclo/config.json` | criar (se existir: merge preservando valores do usuário) |
| `.ciclo/state.json` | criar/sobrescrever (lockfile controlado) |
| `.gitignore` | append: `.ciclo/logs/`, `.ciclo/events.jsonl`, worktrees |
| `AGENTS.md` | criar; se existir, injetar **seção gerenciada** entre marcadores `<!-- ciclo:begin -->` / `<!-- ciclo:end -->` preservando o resto |
| `docs/ciclo/decisoes/` + `CHANGELOG-IA.md` | criar esqueleto se não existirem |
| `context/` (hub local) | criar rules/templates **da stack detectada** (ex.: React detectado → `rules/react.md` pré-populado) |

#### 1.8.5 Segurança da escrita e re-run

- **Transacional:** backup dos arquivos-alvo antes de escrever; qualquer falha ⇒ rollback ao estado exato anterior
- **Idempotente:** rodar `init` num repo já inicializado entra em modo *update* — diff de versão do framework, novas rules da stack, re-validação de acessos; nunca sobrescreve specs/tasks/decisões existentes
- **Validação técnica:** preferência por **MCP** (GitHub MCP, Atlassian MCP) quando disponível; fallback para CLI (`gh`, `jira-cli`) ou REST direto; método registrado na config
- Comando `ciclo doctor`: re-executa todas as validações sob demanda (diagnóstico)
- Fase 2+: wizard pode também **gerar o rascunho do AGENTS.md lendo o repo** (convenções reais), como faz o `/init` do Claude Code

### 1.9 Registro de decisões da IA

Cada repo de produto mantém uma pasta de documentação gerada pelo ciclo:

```
docs/ciclo/
├── decisoes/
│   ├── 2026-08-26-TASK-001-escolha-biblioteca-x.md   # mini-ADR: contexto, opções, decisão, motivo
│   └── ...
└── CHANGELOG-IA.md    # changelog específico do que os agentes fizeram por task
```

- O agente Dev é **obrigado** a registrar decisão relevante sempre que escolher
  entre alternativas (biblioteca, padrão, abordagem) durante a execução da task
- O agente Analista referencia decisões anteriores ao refinar tasks novas
- Formato livre mas estruturado (contexto → opções → decisão → consequências)
- Na fase 2+, essas pastas podem virar PRs/documentação no repositório normalmente

---

## 2. Fluxo detalhado do ciclo (modo local)

### Fase A — Criação & refinamento (Hermes)
1. Task nasce como arquivo local (`ciclo new` ou importada de conversa/agente),
   estado `backlog`
2. Agente Analista lê a task bruta, faz perguntas ao dev piloto e propõe uma spec
   estruturada (objetivo, critérios de aceite, impacto, dependências, plano de teste)
3. Interação humano↔agente até aprovação; spec aprovada vai para
   `context/specs/TASK-001.md`; task → `pronta`

### Fase B — Execução (opencode)
1. `ciclo init` já executado (ver 1.8): credenciais em `~/.ciclo/`, config no repo
2. `ciclo start TASK-001` cria branch `ciclo/TASK-001` + worktree dedicado
3. Contexto montado no worktree: spec + rules + templates relevantes
4. Agente Dev implementa, escreve testes, faz commits na branch e **registra
   decisões relevantes em `docs/ciclo/decisoes/`** (ver 1.9)
5. Task → `em_review`

### Fase C — Revisão
1. Review engine roda primeira passada sobre o diff (ver 1.6)
2. Se `mudanças-pedidas`: volta para o agente Dev com o checklist → novos commits
3. Se `ok`: dev piloto revisa o diff e faz merge em `main`; task → `aprovada`

### Fase D — Deploy
1. Push do repo dispara o pipeline GitHub Actions existente (D7) — fora do controle
   do framework nesta fase
2. Na v0.1 o dev confirma manualmente o resultado do deploy; task → `concluída`
3. Fase 2+: ciclo-core observa os workflows via API e registra eventos automaticamente

### Fase E — Observabilidade contínua
Eventos alimentam métricas (ver 1.7); `ciclo report` compara roadmap planejado
vs. executado e destaca gargalos (ex.: "tasks passam em média 3 dias esperando
revisão humana").

---

## 3. Segurança & limites dos agentes

- Princípio do menor privilégio: agente Dev só escreve no worktree da sua task;
  nunca mergeia, nunca toca em `main`
- Nenhum agente acessa segredos de produção; deploys são sempre via pipeline existente
- Toda saída de agente é sugestão; estados caros (`aprovada`, deploy prod) exigem ação humana
- Log completo de prompts/respostas por execução (auditoria), em `.ciclo/logs/`

## 4. Fora de escopo (v0.1)

- Integração com APIs do Jira Cloud e GitHub (fase 2+, via adaptadores)
- Banco de dados próprio do framework
- Multi-tenant / múltiplos desenvolvedores simultâneos (piloto único)
- Merge automático / PR automático
- Dashboard React

## 5. Perguntas abertas

1. Quais repos do time serão alvo das primeiras tasks do piloto?
2. opencode: versão/config do piloto já definida? (modelos, chaves)
3. Convenção de numeração de tasks: `TASK-001` global ou por projeto (`PROJ-001`)?
4. MCP: quais servidores MCP estarão disponíveis nos ambientes dos agentes (GitHub MCP, Atlassian MCP)? O wizard deve detectar ou instalar?
