# Changelog IA

*Changes made by ciclo agents*

## 2026-08-29 — Consolidação da documentação arquitetural

- **SPEC.md** reescrito: reflete a arquitetura real (ACLI + gh, config em 2 níveis,
  vínculo repo↔label, hierarquia de issue types, statusMap, `ciclo trabalho`,
  `ciclo instrucoes`, observabilidade com `--jira`).
- **ROADMAP.md** atualizado: Fases 0–5 marcadas; próximos passos (PR automático,
  `ciclo pr`, dashboard) migrados para a Parte II.
- **ADR-001** criado: decisões de CLIs oficiais, config global/projeto, vínculo
  repo↔label, hierarquia de types, statusMap, preparação de repo via label.
- **README.md** mantido como guia rápido de instalação e uso.

### Histórico anterior (resumo das decisões já implementadas)

- 2026-08-26 — v0.1 local-first definida (SPEC/ROADMAP originais).
- 2026-08-28/29 — migração para ACLI (Jira) e gh (GitHub); labels de repo;
  hierarquia de issue types; statusMap; `ciclo trabalho`; `ciclo instrucoes`; `report --jira`.