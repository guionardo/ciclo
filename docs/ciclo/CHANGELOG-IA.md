# Changelog IA

*Changes made by ciclo agents*

## 2026-08-29 — Sincronia com cadeia de parents e docs consolidada

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