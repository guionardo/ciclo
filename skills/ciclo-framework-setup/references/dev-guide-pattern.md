# Dev-facing guide pattern (GUIA-DEV.md)

When the user asks for "documentação para o dev que vai usar este setup"
(or similar), the validated structure (created 2026-08-29, commit `ecc7258`)
lives at `ciclo/docs/ciclo/GUIA-DEV.md` and is linked from the README's
"Documentos" section. Target audience: the DEVELOPER who OPERATES the framework,
not the one building it — so it must be practical, prompt-oriented, and in the
user's language (pt-BR in this project).

## Section structure (reuse as template)

1. **Instalação**
   - Pré-requisitos table: Node 18+, `acli` (mandatory), `gh` (recommended), with validate commands.
   - Installing the CLI: `cd ciclo/cli && npm install && npm link` (bun/pnpm variants).
   - `ciclo init` / `ciclo init -y` — what it does (fingerprint → config → AGENTS.md → .gitignore).
   - Validate with `ciclo doctor`.

2. **Primeiros comandos** — reference table (`list`, `new`, `show`, `move`, `sync`, `report`, `doctor`) plus one worked example: `ciclo new "..."` → prompt flow → created task + Jira issue with labels.

3. **Ciclo de vida completo** — `new → refine → start → move revisao → move concluida → report --jira`, with the estado ciclo ↔ status Jira mapping table (`backlog/refinando/pronta`→To Do, `em_execução`→In Progress, `revisao`→In Review, `concluida`→Done). Include a real `ciclo start` transcript showing the `refined` gate.

4. **Uso pelo agente (prompts + exemplos)** — THE key section for this project. Show the exact prompts the dev types in chat and what the agent runs:
   - "Cria uma task para X" → agent runs `ciclo new`.
   - "Me ajuda a refinar a task FW-27" → agent runs `ciclo contexto <id>`, proposes 🎯🪜📦📝 plan, ASKS approval, then `ciclo refine <id> --plan '<json>'`.
   - "Inicia a task a1b2c3d4" → `ciclo start`.
   - "Move a FW-30 para revisão" → `ciclo move <id> revisao` (accepts Jira keys).
   - Note that `ciclo start` gates on the `refined` label and asks the dev if missing.

5. **Labels automáticas** — table: `<repo>` (repo binding, env `CICLO_REPO_LABEL` override), `lang:<stack>` (fingerprint), `refined` (refine gate). Note `ciclo sync` scopes by repo label.

6. **Troubleshooting rápido** — table: doctor Jira/GitHub fail → re-auth; `ciclo` not found → `npm link`; prompts are interactive on purpose.

7. **Referências** — link SPEC + ADRs (relative paths from `docs/ciclo/`).

## Conventions that held

- Keep the doc in the user's native language (pt-BR here).
- Regenerate/refresh AGENTS.md instruction text (init.js) BEFORE writing the guide so the doc matches reality — this session found the AGENTS.md referenced non-existent commands (`ciclo refinar/iniciar/mover`), fixed init.js, re-ran `ciclo init -y` on pilots, then wrote the guide.
- Always link the new doc from README "Documentos" and add a CHANGELOG-IA top entry; commit docs together.