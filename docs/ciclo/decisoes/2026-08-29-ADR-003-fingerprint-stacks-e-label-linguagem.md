# ADR-003 — Fingerprint de stacks (multi-linguagem) e label `lang:<stack>` no Jira

**Data:** 2026-08-29
**Status:** Aceito e implementado
**Área:** Fingerprint do repositório + sincronização de labels (Jira)

---

## Contexto

O fingerprint do `ciclo init` detectava apenas stacks JS/TS (via `package.json`).
Projetos piloto em outras linguagens (ex.: **Go** no `atendente-imoveis`) ficavam
sem identificação de stack e sem visibilidade de linguagem nas issues do Jira.

## Decisões

### D-A: Detecção de stacks não-JS no fingerprint

O fingerprint passa a detectar, por ordem de prioridade:

| Stack | Marcador | `language` resultante |
|---|---|---|
| TypeScript | `package.json` + `tsconfig.json` | `typescript` |
| JavaScript | `package.json` (sem tsconfig) | `javascript` |
| **.NET** | `*.sln`/`*.slnx`, `*.csproj`/`*.fsproj`/`*.vbproj`, `global.json`, `nuget.config`, `Directory.Build.props` | `dotnet` |
| **Go** | `go.mod` | `go` |
| **Python** | `requirements.txt` / `pyproject.toml` (poetry/uv) | `python` |
| **Rust** | `Cargo.toml` | `rust` |
| **PHP** | `composer.json` | `php` |

- O resultado é gravado em `.ciclo/config.json` → `stack.language` (ex.:
  `"language": "go"`).
- Sem marcador detectado, `language` permanece `null` (stack desconhecida) e
  nenhuma label de linguagem é emitida.

### D-B: Label `lang:<stack>` sincronizada nas issues do Jira

- `JiraTaskStore` ganha `_getLanguageLabel()` (lê `stack.language` do config do
  repo) e `_ensureLanguageLabel(labels)` (adiciona com **dedupe**).
- A label `lang:<stack>` é aplicada em **criação** (`createTask`) e em
  **atualização** (`updateTask`) — junto com a label do repo e a `refined`.
- Exemplos: `lang:go`, `lang:python`, `lang:rust`, `lang:php`, `lang:js`,
  `lang:ts`.

### D-C: Posição dos métodos no `JiraTaskStore.js`

- Os métodos auxiliares **ficam dentro da classe** `JiraTaskStore`, antes do
  `module.exports` — métodos fora da classe quebram o arquivo
  (`TypeError: JiraTaskStore is not a constructor`).

## Consequências

- Issues no Jira carregam a linguagem do projeto desde a criação
  (ex.: FW-28 → `['atendente-imoveis', 'lang:go']`, e `['...', 'lang:go', 'refined']`
  após o refine).
- Permite filtrar boards por linguagem e dá contexto rápido ao agente.
- Validado ponta-a-ponta: `ciclo new` em repo Go criou FW-28 com `lang:go`;
  `ciclo refine --plan` preservou `lang:go` e adicionou `refined`.

## Alternativas consideradas

| Opção | Motivo da rejeição |
|---|---|
| Só JS/TS (estado anterior) | projetos Go/Python/Rust/PHP sem identificação |
| Gravar `language` fora de `stack` | `stack` é o bloco natural do fingerprint; manter um só lugar |