# Skills packaging in the framework repo (ADR-004) — `ciclo skills`

How ciclo versioned its Hermes skills inside the framework repo so a NEW dev
machine can install them reproducibly. Implemented 2026-08-29 (commit `1f53819`).

## Why

Hermes skills live in `~/.hermes/skills/<name>/` per machine — including
`ciclo-framework-setup`, which documents the framework itself. On a fresh dev
machine those local skills don't exist. Requirement: the ciclo repo must CARRY
the skill text so it can be installed into the new environment.

## Layout

```
ciclo/
├── cli/src/commands/skills.js     # ciclo skills list / install
└── skills/<name>/                 # versioned skills (same shape Hermes expects)
    ├── SKILL.md
    ├── references/*.md
    ├── templates/*
    └── scripts/*
```

## Command implementation (`src/commands/skills.js`)

- **Resolve the framework skills dir from `__dirname`, never a hardcoded path**
  (repo can be cloned anywhere):
  `FRAMEWORK_SKILLS_DIR = join(__dirname, '..', '..', '..', 'skills')`
  (from `cli/src/commands/` → repo root).
- **Dest**: `~/.hermes/skills/<name>/` (`os.homedir()`).
- `ciclo skills list` — names of subdirs that contain `SKILL.md` (sorted).
- `ciclo skills install` — recursive copy; **skip dotfiles** (`.git`, `.ciclo`,
  `.env`, `.gitignore` — never ship those into the Hermes skill). Idempotent:
  if the destination dir exists and `--force` was NOT passed, skip with a hint;
  `--force` removes the dest first then copies.
- Register in `bin/ciclo.js`: `const skillsCommand = require('../src/commands/skills');`
  + `program.addCommand(skillsCommand);`

## Testing install without touching the real `~/.hermes/skills/`

The fake-HOME trick simulates a new dev machine:

```bash
FAKE_HOME=$(mktemp -d)
HOME="$FAKE_HOME" node bin/ciclo.js skills install
find "$FAKE_HOME/.hermes/skills" -type f        # verify files landed
HOME="$FAKE_HOME" node bin/ciclo.js skills install   # 2nd run → skipped (idempotent)
# mutate dest, then: HOME="$FAKE_HOME" node bin/ciclo.js skills install --force
rm -rf "$FAKE_HOME"
```

This never touches the real `~/.hermes/skills/` — safe to run while the real
skill is in use on the dev machine.

## Packaging a skill into the repo

```bash
mkdir -p skills/<name>
cp -R ~/.hermes/skills/<name>/SKILL.md        skills/<name>/
cp -R ~/.hermes/skills/<name>/references      skills/<name>/
cp -R ~/.hermes/skills/<name>/templates       skills/<name>/
cp -R ~/.hermes/skills/<name>/scripts         skills/<name>/
```

Copy only the Hermes-relevant parts (SKILL.md + references/ + templates/ +
scripts/), NOT the skill's own `.git`/`.ciclo`/`AGENTS.md`/`.env` — those are
repo-local to the skill's own management and must not ship.

## Update flow

- Skill text lives in the repo (`skills/<name>/`) — maintainers edit there and
  commit; dev updates with `ciclo skills install --force` (2nd run without
  `--force` is a no-op skip).
- Docs every time this lands: ADR entry (`docs/ciclo/decisoes/`), SPEC command
  table + agents section + ADR index, README install steps + documents list,
  GUIA-DEV install section, CHANGELOG-IA top entry — one docs commit.

## Pitfall: guessed commit hashes in CHANGELOG-IA

Writing `(commit \`a8f3c2d?\`)` before the commit exists is wrong twice over:
the hash is unknown until the commit lands, and a follow-up
`docs: ajusta hash do commit no CHANGELOG-IA` commit is then required (happened
2× this session, for ADR-002/003 and for .NET). **Rule: write the CHANGELOG-IA
entry withOUT a hash, or commit first and copy the real hash — never a
placeholder.**