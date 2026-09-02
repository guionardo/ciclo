# GUIA-DEV — ciclo: como usar o setup no dia a dia

Guia prático para o **desenvolvedor** que vai operar o ciclo (framework de tasks
conectado a Jira + GitHub + agentes de IA). Pressupõe que o framework já esteja
instalado e configurado (se não estiver, veja [Instalação](#1-instalação)).

**Resumo do fluxo:** criar task → refinar (agente ou manual) → iniciar execução →
implementar → mover para revisão/concluída. Cada passo sincroniza com o Jira.

---

## 1. Instalação

### 1.1 Pré-requisitos

| Ferramenta | Necessária? | Como validar |
|---|---|---|
| Node.js 18+ | ✅ | `node -v` |
| **acli** (Atlassian CLI) | ✅ Jira | `acli jira auth status` |
| **gh** (GitHub CLI) | ⚠️ Recomendada | `gh auth status` |

> O `ciclo init` detecta CLIs ausentes e oferece a instalação automática por SO.
> Autenticação: `acli jira auth login --web` (OAuth no navegador) e `gh auth login`.

### 1.2 Instalar a CLI ciclo

```bash
# a partir do repositório do framework
cd ciclo/cli
npm install          # ou: bun install / pnpm install
npm link             # expõe o comando `ciclo` globalmente (ou bun link / pnpm link --global)

ciclo --version      # valida a instalação
```

### 1.3 Instalar as skills do framework (ambiente novo)

As skills que instruem o agente sobre o ciclo são **versionadas no repo** (em
`skills/`) — em uma máquina nova, instale-as no Hermes:

```bash
ciclo skills install      # copia skills/ → ~/.hermes/skills/
ciclo skills list         # vê o que foi empacotado no framework
# --force sobrescreve versões existentes (para atualizar)
```

> Sem isso, o Hermes não encontra as skills locais do ciclo (ex.:
> `ciclo-framework-setup`) num ambiente novo.

### 1.4 Inicializar um projeto

Entre na pasta do repositório onde você vai trabalhar e rode:

```bash
cd /caminho/para/seu/projeto
ciclo init           # wizard interativo
# ou, para aceitar os padrões:
ciclo init -y
```

O `init` (5 segundos de decisão, ~1 min de execução):

1. Verifica se a pasta é um repositório git (se não, rode `git init` antes).
2. Detecta a **stack** do projeto (JS/TS, Go, Python, Rust, PHP) — vira
   `stack.language` no `.ciclo/config.json` (usado para a label `lang:<stack>`).
3. Cria `.ciclo/config.json` (config não-sensível, versionável), `.ciclo/state.json`
   e as pastas `context/` e `docs/ciclo/decisoes/`.
4. Gera/adiciona o **`AGENTS.md`** — as instruções que o agente (Hermes/opencode)
   recebe em toda sessão, incluindo o fluxo de refinamento assistido.
5. Complementa o `.gitignore` com `.ciclo/tasks/`, `.ciclo/logs/`, etc.

Valide tudo com:

```bash
ciclo doctor
```

---

## 2. Primeiros comandos (5 minutos de uso)

| Comando | O que faz |
|---|---|
| `ciclo list` | lista as tasks locais |
| `ciclo new "Minha feature"` | cria task local + issue no Jira (label do repo + `lang:<stack>`) |
| `ciclo new "Bug no login" --type Bug` | cria com tipo específico (Epic, Feature, Story, Task, Bug) |
| `ciclo new "Strapi" --type Story --parent FW-9` | cria com pai (hierarquia Epic→Feature→Story→Task) |
| `ciclo show <id>` | mostra detalhes; aceita id local (`a1b2c3d4`) **ou chave Jira** (`FW-27`, importa do board) |
| `ciclo move <id> em_execução` | muda o estado local + sincroniza o status no Jira |
| `ciclo move <id>` | sem estado: descobre as lanes que a issue pode adotar e pergunta |
| `ciclo sync` | puxa do Jira as issues com o label **deste repositório** |
| `ciclo report` / `ciclo report --jira` | observabilidade (estados, idade, activity) / mesclada com Jira |
| `ciclo doctor` | valida ACLI + gh + conexões |

**Exemplo — criar e acompanhar uma task:**

```bash
cd /caminho/para/seu/projeto
ciclo new "Adicionar campo CPF no cadastro"
# → Qual tipo de issue? (Task é o padrão — Enter)
# → Criar issue pai? (n)
# 🆕 Created task a1b2c3d4: "Adicionar campo CPF no cadastro"
#    → Também criada no Jira: FW-30 [Task] (label: meu-projeto, lang:go)

ciclo list                # vê a task (status: backlog)
ciclo show a1b2c3d4       # detalhes completos
```

---

## 3. Ciclo de vida completo (fluxo do dia a dia)

```
ciclo new "descrição"          # 1. criar
ciclo refine <id>              # 2. refinar (detalhar, critérios) — ou refinar pelo agente (seção 4)
ciclo start <id>               # 3. iniciar: branch TASK/<id>-<slug> + Jira → IN PROGRESS
... implementação no código ... # 4. desenvolver no branch
ciclo move <id> revisao        # 5. Jira → IN REVIEW (pedido de review)
ciclo move <id> concluida      # 6. Jira → DONE (merge manual na main)
ciclo report --jira            # 7. ver o board/roadmap
```

Estados do ciclo vs Jira:

| Estado ciclo | Status Jira |
|---|---|
| `backlog` / `refinando` / `pronta` | To Do |
| `em_execução` | In Progress |
| `revisao` | In Review |
| `concluida` | Done |

> Boards com lanes customizadas podem definir `statusMap` no
> `.ciclo/config.json` (ex.: `"pronta": "READY FOR CODE REVIEW"`).

**Exemplo — um start típico:**

```bash
ciclo start a1b2c3d4
# ✅ Issue refinada (label "refined" presente).
# 🌱 Created and checked out branch: TASK/a1b2c3d4-adicionar-campo-cpf
# 📝 Task a1b2c3d4 status updated to em_execução
#    → Sincronizado com o Jira (FW-30 → IN PROGRESS)
```

> Se a issue **não** tiver a label `refined`, o `ciclo start` avisa e pergunta se
> você quer refiná-la antes de começar — é o gate de qualidade.

---

## 4. Uso pelo agente (prompts) — como pedir as coisas no chat

O agente (Hermes Agent) recebe as instruções do `AGENTS.md` e opera o ciclo por
você. Você só **conversa** — ele roda os comandos. Padrão de uso:

### 4.1 Pedir para criar uma task

> "Cria uma task para adicionar validação de CPF no cadastro"

O agente roda `ciclo new "..."` (respondendo os prompts) e confirma a issue no Jira.

### 4.2 Refinamento assistido (o principal uso do agente)

O fluxo é **contexto → proposta → sua aprovação → aplicação**. Você pede:

> "Me ajuda a refinar a task FW-27"
> — ou — "Refina a task sobre a fila de WhatsApp do atendente-imoveis"

O agente então:

1. **Roda `ciclo contexto FW-27`** — reúne a task, a cadeia de parents (Epic/
   Feature/Story com descrições) e a estrutura do código do projeto.
2. **Propõe o plano no chat**, estruturado assim:

```
🎯 Objetivo: Entender o fluxo de envio de WhatsApp via fila com retry e DLQ
🪜 Passos para execução:
  - Modelar a fila (job) com payload, tentativas e DLQ
  - Implementar o worker com backoff exponencial e limite de tentativas
  - Configurar a DLQ para mensagens que falharam após todas as tentativas
- 📦 Resultado esperado: Worker funcional com retry configurável, DLQ e métricas
📝 Critérios de aceitação:
  - Job com erro simula até 3 tentativas antes de ir para DLQ
  - Métricas expostas em /metrics
```

3. **Pede sua aprovação** (nunca aplica sem você confirmar):
   > "O refinamento está adequado? (sim/não)"

4. Você responde `sim` (ou pede ajustes). Só então o agente aplica:
   ```bash
   ciclo refine 03196edd --plan '{"goal":"...","steps":[...],"expectedResult":"...","acceptanceCriteria":[...]}'
   ```
   Isso salva o plano localmente, marca `refinando` e sincroniza o Jira
   (descrição estruturada + label `refined`).

> Regra: se o agente propor um plano e aplicá-lo **sem** pedir sua aprovação,
> peça para refazer seguindo o fluxo acima (contexto → proposta → aprovação → `--plan`).

### 4.3 Pedir para iniciar a implementação

> "Inicia a task a1b2c3d4" — o agente roda `ciclo start a1b2c3d4`.

O gateway verifica a label `refined`. Com a label → branch criada e Jira
In Progress. Sem a label → o agente pergunta se você quer refinar antes.

### 4.4 Acompanhamento e avanço

> - "Quais tasks estão em execução?" → o agente roda `ciclo report`
> - "Move a FW-30 para revisão" → `ciclo move FW-30 revisao` (aceita chave Jira)
> - "O que está pendente no board?" → `ciclo report --jira` ou `ciclo list`

### 4.5 Dica de ouro para o agente

Quando a conversa envolver uma issue do Jira, o agente resolve o repositório
pela **label** da issue: `<reposDir>/<label>`. Se você passar um contexto do
board (ex.: "a task FW-31"), ele já sabe onde encontrar o código.

---

## 5. Labels automáticas no Jira

Toda issue criada pelo ciclo carrega:

| Label | Origem | Exemplo |
|---|---|---|
| `<repo>` | vínculo repositório ↔ label (remote `origin`; env `CICLO_REPO_LABEL` para override) | `atendente-imoveis` |
| `lang:<stack>` | fingerprint do projeto (`stack.language`) | `lang:dotnet`, `lang:go`, `lang:python`, `lang:ts` |
| `refined` | adicionada pelo `refine` (prontidão para execução) | `refined` |

As labels servem para filtrar boards e o `ciclo sync` usa a `label do repo` para
saber quais issues pertencem a este repositório (dedupe por `jiraKey` + `repoLabel`).

---

## 6. Troubleshooting rápido

| Sintoma | Solução |
|---|---|
| `ciclo doctor` acusa Jira ❌ | `acli jira auth login --web` (rode no terminal visível; o TUI não aceita stdin) |
| `ciclo doctor` acusa GitHub ❌ | `gh auth login` |
| Command not found: `ciclo` | rode `npm link` dentro de `ciclo/cli` |
| `ciclo start` reclama de branch existente | ele faz checkout da branch existente e segue |
| Issu não aparece no `ciclo list` | confira a label do repo na issue: `ciclo show FW-XX --fields ...labels` (ver ADR-003) |
| `ciclo new` travado nos prompts | eles são interativos de propósito — escolha com as setas + Enter |

---

## 7. Referências

- [SPEC.md](../../SPEC.md) — arquitetura e fluxo completo
- [ADR-001](decisoes/2026-08-29-ADR-001-clis-oficiais-e-vinculo-repo-label.md) — CLIs oficiais e vínculo repo↔label
- [ADR-002](decisoes/2026-08-29-ADR-002-refinamento-assistido-agente-dev.md) — refinamento assistido agente↔dev
- [ADR-003](decisoes/2026-08-29-ADR-003-fingerprint-stacks-e-label-linguagem.md) — fingerprint multi-stack + label `lang:<stack>`
- [ADR-004](decisoes/2026-08-29-ADR-004-skills-empacotadas-no-framework.md) — skills empacotadas no framework (`ciclo skills install`)
- [ROTEIRO-REPLICACAO.md](ROTEIRO-REPLICACAO.md) — checklist operacional de instalação em máquina nova (do zero até o ponta-a-ponta)
- [CHANGELOG-IA.md](CHANGELOG-IA.md) — histórico das decisões dos agentes