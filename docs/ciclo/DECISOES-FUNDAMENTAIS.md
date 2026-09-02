# Decisões fundamentais (v0.1)

Tabela das decisões arquiteturais da **v0.1** do ciclo. Decisões detalhadas e
recentes vivem nos [ADRs](decisoes/) (`docs/ciclo/decisoes/`); mudanças grandes
nesta tabela são registradas no [CHANGELOG-IA](CHANGELOG-IA.md).

| # | Decisão | Escolha |
|---|---|---|
| D1 | Relação com L3A | Projeto novo e independente; pode compartilhar ideias (hub de contexto, padrões), mas não está atrelado ao cliente L3A |
| D2 | JIRA | Integrado via **ACLI oficial** (Atlassian CLI) com OAuth — session na HOME, sem tokens no repo (ADR-001) |
| D3 | Runtime dos agentes | Hermes Agent + opencode (ambos, papéis distintos) |
| D4 | Time alvo | Time pequeno de desenvolvimento |
| D5 | Stack do framework | Node.js + JavaScript (CLI `ciclo`); projetos alvo em qualquer stack (fingerprint detecta JS/TS, .NET, Go, Python, Rust, PHP) |
| D6 | Banco de dados | **SQL Server** como padrão dos projetos alvo; PostgreSQL e MySQL no radar — camada de dados aberta |
| D7 | Deploy | GitHub Actions já funciona nos projetos; o framework **observa** (integração posterior) |
| D8 | Estratégia v0.1 | **Local-first**: framework instalado no ambiente de um desenvolvedor piloto; tasks em arquivos locais + issues no Jira via ACLI; sem credenciais no repo |
| D9 | Contexto atual dos projetos | Repositórios existentes com aplicações desenvolvidas; fluxo de desenvolvimento manual (única automação: deploy via GitHub Actions) |
| D10 | Setup | Wizard interativo (`ciclo init`) que valida/instala as CLIs oficiais (`acli` + `gh`, auto-instala se ausente) e exige Jira autenticado via ACLI; `ciclo doctor` para diagnóstico; fingerprint multi-stack do repo |
| D11 | Credenciais | **Fora do repositório**: sessão da ACLI em `~/.config/acli` (OAuth) e do `gh` no keyring — nenhum token/credencial versionado; config não-sensível em `<repo>/.ciclo/config.json` (ADR-001) |
| D12 | Decisões da IA | Registradas no repo do produto em `docs/ciclo/decisoes/` (mini-ADRs) + `CHANGELOG-IA.md` — documentação e changelog específicos do que os agentes fizeram |

---

## ADRs (decisões detalhadas)

| ADR | Tema |
|---|---|
| [ADR-001](decisoes/2026-08-29-ADR-001-clis-oficiais-e-vinculo-repo-label.md) | CLIs oficiais (ACLI + gh) e vínculo repositório ↔ label |
| [ADR-002](decisoes/2026-08-29-ADR-002-refinamento-assistido-agente-dev.md) | Refinamento assistido pelo agente (contexto → proposta → aprovação → `--plan`) |
| [ADR-003](decisoes/2026-08-29-ADR-003-fingerprint-stacks-e-label-linguagem.md) | Fingerprint multi-stack + label `lang:<stack>` no Jira |
| [ADR-004](decisoes/2026-08-29-ADR-004-skills-empacotadas-no-framework.md) | Skills empacotadas no framework (`ciclo skills install`) |