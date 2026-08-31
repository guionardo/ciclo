# Byte-Level Repair of Corrupted JS Source (learned editing init.js)

When a JS/TS source file gets corrupted by escape mangling (double-escaped `\n`,
stray control bytes, broken string literals), plain `patch`/`sed` often fails
because the file's visible content and its actual bytes disagree. Repair
deterministically at the byte level with Python read/replace, driven from a
script FILE — never inline `python3 -c "..."`.

## The trap: shell quoting mangles escapes inside `python3 -c "..."`

Passing escape-heavy code through a double-quoted `python3 -c "..."` is a trap:
the shell reinterprets `\\n`, `\\\\n`, etc. BEFORE Python sees them. A literal
`s.replace(b'\\\\n', b'\\n')` typed into `python3 -c "..."` arrives as
`b'\\n'`/`b'\n'` — replacing every backslash-`n` with a REAL newline byte,
corrupting string literals across the whole file. (Exactly what happened to
`src/commands/init.js` in a past session: 33 replacements, one `SyntaxError` at
a `console.log('`+newline, recovery required a byte-level inverse fix.)

## Correct workflow

1. `write_file` the fix to `/tmp/fix_<file>.py` (the write tool does NOT
   shell-escape it; what you see is what Python gets).
2. Run `python3 /tmp/fix_<file>.py <target>`.
3. Verify the file parses: `node -e "require('./<target>')"` for CJS,
   `node --check` for ESM. Then `od -c` the touched lines to confirm actual bytes.

## Byte sequences that matter (JS double-escaped newline repairs)

| Intended (in source) | Bytes | Fix target → replacement |
|---|---|---|
| `'\n'` escape (correct) | `\` `n` (0x5C 0x6E) | leave alone |
| double-escaped `'\\n'` | `\` `\` `n` | `b'\\'+b'\\'+b'n'` → `b'\\'+b'n'` |
| shell-mangled | `\` + real LF (0x5C 0x0A) | `b'\\'+b'\n'` → `b'\\'+b'n'` |
| shell-mangled, backslash eaten | `'` + real LF | `"('" + LF + ...` → `"('\\n..."` |

Python note: in a script file, `b'\\'` is a single backslash byte and `b'\n'`
is LF. Build search/replace target sequences from composing those so the intent
is unambiguous.

## Diagnostic snippet

```python
# /tmp/diag.py — find corrupted spots (dangling open quotes, lone backslashes)
import sys
lines = open(sys.argv[1], 'rb').read().split(b'\n')
for i, line in enumerate(lines, 1):
    if line.endswith(b"('") or line.endswith(b'\\'):
        print(i, repr(line.decode('utf-8', 'replace')))
```

Also scan for `b'\\' + b'\n'` (backslash+real-newline) pairs and report the line
number of each — those are the shell-mangled escapes.

## General rules

- Compare intended vs actual bytes with `od -c` BEFORE choosing the replacement;
  display-level `\n` vs byte-level `0x0A` confusion is the usual cause of
  wrong fixes.
- After ANY byte-level edit, syntax-check the file before reporting success —
  a corrupt source that still "loads" far enough to print help can hide the
  breakage until a specific string literal is hit.
- Iterate: fix one corrupted class, re-check all modules load, run the CLI once,
  then run `ciclo doctor` in a real repo to confirm the runtime path.