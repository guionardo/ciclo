# ROTEIRO-REPLICACAO — Instalar o ciclo numa máquina de dev (do zero)

Checklist operacional para **replicar o setup completo** numa máquina nova de
desenvolvedor. Siga em ordem; cada etapa tem verificação. Tempo estimado:
**15–25 min** (a maior parte é autenticação OAuth).

> Versão detalhada e uso no dia a dia: [GUIA-DEV.md](GUIA-DEV.md).
> Decisões por trás: ADR-001 (CLIs oficiais), ADR-004 (skills no repo).

---

## Suporte a sistemas operacionais (v0.1)

O framework é **multi-OS**: Linux, macOS e Windows.

| Camada | Linux | macOS | Windows |
|---|---|---|---|
| CLI ciclo (Node) | ✅ | ✅ | ✅ (`npm link` cria shim `.cmd`) |
| acli (Jira) | ✅ (binário/apt/rpm) | ✅ (Homebrew/binário) | ✅ (binário `acli.exe` em `%HOME%\bin` ou PATH) |
| gh (GitHub) | ✅ (apt/rpm) | ✅ (Homebrew) | ✅ (winget/choco/scoop) |
| `ciclo doctor`, `list`, `new`, `refine`, `start`, `move`, `sync`, `skills` | ✅ | ✅ | ✅ |
| `verify-dev-machine.js` (validação) | ✅ | ✅ | ✅ (Node — sem shell) |
| `verify-setup.sh` (bônus bash) | ✅ | ✅ | ❌ (use o `.js`) |
| Autenticação Jira | `acli jira auth login --web` (navegador, qualquer SO) | | |

> O código chama as CLIs **sem shell** (args como array via execa) — funciona
> igual nos 3 SOs, inclusive com caminhos/descrições com espaços. Os comandos
> `ciclo` de instalação (`cliInstall`) já têm comandos específicos por SO.

---

## Etapa 0 — Pré-requisitos do sistema

| Item | Mínimo | Verificar com |
|---|---|---|
| Node.js | 18+ | `node -v` |
| npm (ou bun/pnpm) | — | `npm -v` |
| git | — | `git --version` |
| **Hermes Agent** | presente (runtime do agente) | `hermes --version` |
| **acli** (Atlassian CLI) | ✅ obrigatória — presente + autenticado | `acli --version` + `acli jira auth status` |
| **gh** (GitHub CLI) | ✅ obrigatória — presente + autenticado | `gh --version` + `gh auth status` |

> **gh é obrigatória desde o `ciclo init`** (exige instalação + `gh auth login`),
> da mesma forma que a acli exige o Jira. Sem gh autenticada o wizard aborta.
> O **Hermes Agent** é o runtime do agente (instalação na Etapa 3).

Se faltar Node/git, instale pelo gerenciador do SO (homebrew/apt/winget).

---

## Etapa 1 — CLIs oficiais (acli + gh)

A `ciclo init` **instala automaticamente** CLIs ausentes quando você roda o
wizard; mas é mais rápido fazer na mão antes:

### acli (Atlassian CLI)

```bash
# macOS (Homebrew)
brew tap atlassian/homebrew-acli
brew install acli
```

Linux/Windows: ver [README.md](../../README.md) (apt/rpm/curl/powershell).

```bash
# Autenticar no Jira (OAuth — abre o navegador; rode num terminal REAL,
# o TUI não aceita stdin/piped)
acli jira auth login --web
```

✅ Verificação: `acli jira auth status` → autenticado.

> Alternativa por API token:
> `echo "$TOKEN" | acli jira auth login --site "sua-empresa.atlassian.net" --email "voce@empresa.com" --token`

### gh (GitHub CLI)

```bash
# macOS
brew install gh
# ou winget install --id GitHub.cli -e (Windows) / apt (Linux)
gh auth login
```

✅ Verificação: `gh auth status` → autenticado.

---

## Etapa 2 — Instalar a CLI ciclo (framework)

**Opção rápida — direto do repositório GitHub (recomendado):**

```bash
npm install -g guionardo/ciclo    # instala o pacote @ciclo/cli do repo GitHub
ciclo --version                   # → 0.1.0
```

> Equivale a `npm install -g github:guionardo/ciclo`. Para atualizar depois:
> `npm install -g guionardo/ciclo@main`.

**Opção local (contribuir/desenvolver):**

```bash
# 1. Clonar o repositório do framework (qualquer lugar da máquina)
git clone <URL_DO_REPOSITORIO_CICLO> ~/ciclo
cd ~/ciclo/cli

# 2. Dependências + link global
npm install
npm link          # expõe `ciclo` no PATH (ou bun link / pnpm link --global)

# 3. Validar
ciclo --version   # → 0.1.0
```

✅ Verificação: `which ciclo` mostra o caminho do symlink (npm link).

> **Instaladores:** npm é o oficial. pnpm (`pnpm add -g github:guionardo/ciclo`)
> e bun (`bun add -g github:guionardo/ciclo`) também instalam a CLI, mas por
> segurança **bloqueiam o `postinstall`** (mensagem de boas-vindas vem do
> **first-run**, que funciona em todos). **Deno não é suportado** (a CLI usa
> CommonJS; `deno install` → `ReferenceError: require is not defined`). Ver
> detalhes no [GUIA-DEV.md](GUIA-DEV.md) §1.3.

---

## Etapa 3 — Instalar o Hermes Agent (runtime do agente)

O **Hermes Agent** (Nous Research) é o runtime do agente que lê o `AGENTS.md`
gerado pelo ciclo, roda `ciclo contexto`, propõe refinamento e opera o fluxo
para o dev. Open-source, multi-OS (Linux/macOS/Windows + WSL).

**Instalação por SO** (instaladores oficiais — configuram uv, Python, venv e o
launcher `hermes`):

```bash
# Linux / macOS
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

```powershell
# Windows (PowerShell 5.1+ — o install.ps1 é o instalador oficial)
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

> Em **WSL** (Windows Subsystem for Linux) use o instalador Linux (`install.sh`)
> — o `install.sh` detecta Windows nativo e aponta para o PowerShell.

```bash
# Verificar (qualquer SO)
hermes --version    # ex.: Hermes Agent v0.20.6
hermes setup        # 1ª vez: wizard (modelo + provider)
hermes model        # trocar modelo/provedor
hermes doctor       # health check
```

✅ Verificação: `hermes --version` responde e `hermes doctor` não aponta erros
críticos.

> 💡 O dev usa o Hermes **no chat** com o ciclo: "me ajuda a refinar a task
> FW-27" → o agente roda `ciclo contexto`, propõe 🎯🪜📦📝, você aprova, ele
> aplica `ciclo refine --plan`. Isso NÃO é configurado manualmente — o
> `AGENTS.md` do projeto já instrui o agente (criado no `ciclo init`).

---

## Etapa 4 — Instalar as skills do framework no Hermes

As skills (ex.: `ciclo-framework-setup`) são **versionadas no repo** — sem isso o
agente não tem o conhecimento do ciclo numa máquina nova:

```bash
ciclo skills list               # deve listar: ciclo-framework-setup
ciclo skills install            # copia skills/ → ~/.hermes/skills/
```

✅ Verificação:

```bash
ls ~/.hermes/skills/ciclo-framework-setup/SKILL.md   # deve existir
```

> Atualizar depois: `ciclo skills install --force` (sobrescreve versões).

---

## Etapa 5 — Configuração global do usuário

O ciclo usa **dois níveis** de config; o global guarda o que é da máquina:

```bash
# Criar ~/.ciclo/config.json manualmente (ou deixe o wizard criar)
mkdir -p ~/.ciclo
cat > ~/.ciclo/config.json <<'EOF'
{
  "devName": "Seu Nome",
  "reposDir": "/Users/<voce>/workspace",
  "services": {
    "jira": { "siteUrl": "https://sua-empresa.atlassian.net", "projectKey": "PROJ" }
  }
}
EOF
```

- **`reposDir`** é onde ficam os repositórios dos projetos — o agente resolve
  `reposDir/<label>` a partir da label da issue do Jira.
- Se **não** existir, o `ciclo init` interativo pergunta e grava.
- Fallback legado: `~/.hermes/ciclo-defaults.json`.
- `statusMap` (se o board tem lanes customizadas) também mora aqui.

✅ Verificação: `ciclo doctor` → mostra seu `devName` e sem erros nas seções.

---

## Etapa 6 — Inicializar os projetos

Para cada repositório de projeto do time:

```bash
cd /caminho/para/o/projeto
ciclo init -y        # aceita padrões (usa seu devName/reposDir globais)
```

O que acontece (estado final esperado):

| Artefato | Estado esperado |
|---|---|
| `.ciclo/config.json` | versionável, com `services.jira.configured: true` e `stack.language` detectado |
| `.ciclo/state.json` | lockfile com fingerprint hash |
| `AGENTS.md` | seção gerenciada `<!-- ciclo:begin -->` com instruções ao agente |
| `context/`, `docs/ciclo/decisoes/` | pastas criadas |
| `.gitignore` | bloco `.ciclo/...` adicionado (sem duplicar) |

✅ Verificação em cada projeto:

```bash
ciclo doctor
cat .ciclo/config.json | python3 -m json.tool   # conferir stack.language
```

---

## Etapa 7 — Validação completa (ponta-a-ponta)

```bash
# 1. Verificação automática da máquina (Linux/macOS/Windows — Node, sem deps)
node verify-dev-machine.js                        # com as skills instaladas:
node ~/.hermes/skills/ciclo-framework-setup/scripts/verify-dev-machine.js
# opcional: validar também um repo já inicializado
node ~/.hermes/skills/ciclo-framework-setup/scripts/verify-dev-machine.js /caminho/para/o/projeto

# 1b. (Linux/macOS) script bash da skill — checks básicos de arquivos
bash ~/.hermes/skills/ciclo-framework-setup/scripts/verify-setup.sh

# 2. Fluxo real num dos projetos
cd /caminho/para/o/projeto
ciclo list                                # lista das tasks do repo
ciclo new "Task de teste de instalacao"   # cria local + Jira (label do repo + lang:<stack>)
ciclo refine <id> --plan '{"goal":"Validar instalacao","steps":["Criar","Verificar"],"expectedResult":"Setup ok","acceptanceCriteria":["Issue criada"]}'
ciclo start <id>                          # gera branch + Jira IN PROGRESS
ciclo move <id> concluida                 # valida transição (depois delete)
# limpeza da task de teste:
rm -f .ciclo/tasks/<id>.json
acli jira workitem delete --key <JIRA_KEY> --yes
```

✅ Critérios de aceite (tudo isso deve passar):

- [ ] `node verify-dev-machine.js` → **10/10 checks OK** (ou 9/9 sem repo; nas 3 plataformas)
- [ ] `ciclo doctor` sem erros (Jira ✅, GitHub ✅)
- [ ] `ciclo new` criou issue no Jira com label do repo + `lang:<stack>`
- [ ] `ciclo refine --plan` gravou descrição **com quebras de linha reais** (nada de `\n` literal) e label `refined`
- [ ] `ciclo start` criou branch e moveu para IN PROGRESS
- [ ] `ciclo skills list` lista a skill; `~/.hermes/skills/ciclo-framework-setup/` existe
- [ ] Board voltou ao estado original (task de teste deletada)

---

## Etapa 8 — Entrega ao dev (checklist final)

- [ ] Node + git instalados
- [ ] **Hermes Agent instalado** — `hermes --version` responde e `hermes doctor` OK
- [ ] `acli` autenticado (OAuth) — `acli jira auth status` OK
- [ ] `gh` autenticado — `gh auth status` OK
- [ ] `ciclo --version` responde
- [ ] `ciclo skills install` feito (skills no `~/.hermes/skills/`)
- [ ] `~/.ciclo/config.json` com `devName` e `reposDir`
- [ ] Projetos inicializados (`ciclo init -y`) e `ciclo doctor` OK
- [ ] Ponta-a-ponta validado (etapa 7) e task de teste removida
- [ ] Dev recebeu o **GUIA-DEV.md** ([docs/ciclo/GUIA-DEV.md](GUIA-DEV.md))
      — fluxo do dia a dia + exemplos de prompts para o agente

---

## Troubleshooting da replicação

| Sintoma | Causa/solução |
|---|---|
| `acli jira auth login --web` não avança | o TUI não aceita stdin — rode num terminal visível |
| `ciclo doctor` Jira ❌ | `acli jira auth status` falha → refazer login OAuth |
| `ciclo doctor` GitHub ❌ | `gh auth login` |
| `command not found: ciclo` | rodar `npm link` dentro de `~/ciclo/cli` |
| `ciclo skills list` vazio | repo clonado sem a pasta `skills/` → `git pull` (versão antiga) |
| `ciclo init` aborta "not a git repository" | `git init` antes |
| Descrição no Jira com `\n` literal | versão antiga do CLI — atualizar para a correção do commit `88c7698` |