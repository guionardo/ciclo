# Language label sync (lang:<stack>) — fingerprint → Jira

How ciclo propagates the detected project language to Jira as a `lang:<stack>` label.
Validated end-to-end 2026-08 against a real Jira site (project FW, repo `atendente-imoveis`).

## Pipeline

1. `src/fingerprint.js` detects the stack and writes it to `.ciclo/config.json`:
   - `stack.language` — `javascript`/`typescript` (package.json), `dotnet`
         (`*.sln`/`*.csproj`/`global.json`), `go` (go.mod), `python`
         (requirements.txt / pyproject.toml), `rust` (Cargo.toml), `php` (composer.json).
   - `stack.packageManager`/`testRunner` alongside. Written under the `stack` key —
     NOT at the config root. Verified config shape:
     `{"stack":{"language":"go","frameworks":[],"testRunner":"go test","packageManager":"gomod"}}`.
2. `src/services/JiraTaskStore.js` reads it:
   - `_getLanguageLabel()` → reads `join(this.cwd, '.ciclo', 'config.json')`,
     parses `config.stack?.language`, returns `` `lang:${lang}` `` or `null` (any error → `null`, never throws).
   - `_ensureLanguageLabel(labels)` → `[...labels, langLabel]` with dedup (no-op when already present).
3. Integration points (both were verified live):
   - `createTask()` — after building the `labels` array from `taskData.labels`, push `langLabel`.
   - `updateTask()` — same after mapping `updates.labels`.

## E2E validation recipe (what actually worked)

```bash
# 1. Create a task (interactive — see PTY pattern in SKILL.md; accepts prompts via process submit)
ciclo new "Teste lang label e2e"          # → task cab3e9bf, issue FW-28

# 2. Verify labels on creation — labels field MUST be requested explicitly
acli jira workitem search --jql 'key = FW-28' --fields "key,summary,labels" --json \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['fields']['labels'])"
# → ['atendente-imoveis', 'lang:go']   ✅ createTask added lang:go

# 3. Refine (exercises updateTask) — lang label must survive + 'refined' added
ciclo refine cab3e9bf --plan '{"goal":"x","steps":["y"],"expectedResult":"z","acceptanceCriteria":["w"]}'
# verify again → ['atendente-imoveis', 'lang:go', 'refined']   ✅ both preserved

# 4. Cleanup
rm -f .ciclo/tasks/cab3e9bf.json
acli jira workitem delete --key FW-28 --yes   # NOTE: --key flag required, positional fails
```

## Pitfalls specific to this flow

- **`acli jira workitem view --json` does NOT include `labels`** even with default fields —
  it omits the key entirely (not `[]`). Use `search --jql 'key = X' --fields key,summary,labels --json` to read labels.
- **One-off test tasks pollute Jira** — always delete after the test (`--key` form above) and
  remove the local `.ciclo/tasks/<id>.json`; board should return to only real issues.
- **`node --check` on the edited store**: copy `.backup` files to a `.js` temp path first
  (`ERR_UNKNOWN_FILE_EXTENSION` otherwise). Full class-structure repair details in SKILL.md pitfall.