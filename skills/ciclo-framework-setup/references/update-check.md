# Update check flow — `ciclo update-check` + checagem automática

Como a CLI ciclo verifica periodicamente se há versão nova no repositório GitHub
e como o changelog é apresentado. Implementado 2026-09-02.

## Comandos

```bash
ciclo update-check            # mostra versão atual, disponível e changelog
ciclo update-check --json     # saída estruturada (jq)
ciclo update-check --forcar   # ignora o cache e consulta o GitHub agora
ciclo update                  # alias
```

## Checagem automática (1×/dia)

- `bin/ciclo.js` chama `scheduleAutomaticCheck()` no arranque de QUALQUER
  comando — dispara sem bloquear; aviso discreto só quando há versão nova:
  ```
  ⚡ Nova versão da CLI ciclo disponível: 0.1.0 → 0.2.0
     Rode `ciclo update-check` para ver o changelog, ou atualize com:
     npm install -g guionardo/ciclo@0.2.0
  ```
- Cache: `~/.ciclo/update-check.json` (TTL 24h). Um cache com `latest: null` e
  sem changelog indica fetch falho (ex.: repo privado sem token) → é tratado
  como expirado e re-consultado no próximo comando.
- Desligável: `CICLO_SKIP_UPDATE_CHECK=1` (ou `CI=true` — o CI nunca mostra).

## Resolução da versão disponível

1. **GitHub Releases**: `gh api repos/<repo>/releases/latest` → tag semântica +
   body (changelog da release). Update usa `@<tag>`.
2. **Sem releases**: `gh api .../contents/package.json?ref=main` → version da
   branch main (a instalação `npm install -g guionardo/ciclo` baixa o HEAD da
   main). Update usa `@main`. Changelog = entradas recentes de
   `docs/ciclo/CHANGELOG-IA.md` da main.

Repo: env `CICLO_GITHUB_REPO` → remote `origin` do repo (dev) → `guionardo/ciclo`.

## Pontos importantes

- **`gh api` é o caminho principal (token no keyring)**, com fallback para HTTP
  anônimo (com `GITHUB_TOKEN` se presente, útil em CI). O repo
  `guionardo/ciclo` era **privado** quando isso foi escrito (2026-09-02) e a API
  pública sem token respondia **404** (o GitHub não revela repos privados), o
  que fazia o check retornar "sem releases/publicado" erroneamente — por isso o
  `gh api` preferido. Com o repo **público** (mudou em seguida), o fallback HTTP
  anônimo também funciona (validado: `contents/package.json` → 200; 404 só em
  `/releases/latest` quando não há release — correto).
- `gh api <path> --jq '.'` com `reject: false` retorna `exitCode 0` + stdout
  no sucesso; 404 vem em stderr (`/404|Not Found/i`) → retorna null.
- `compareVersions` é local (sem dep): ignora prefixo `v`, compara numéricos
  por `.`/`-`; pré-release pode ser tratado como 0 nas partes não numéricas.
- O aviso automático nunca derruba um comando: erros de rede/timeout são
  silenciosos (catch vazio).

## Dica de manutenção

Crie uma **GitHub Release por versão** para que o changelog completo seja
exibido e o update use a tag:

```bash
gh release create v0.2.0 --title "v0.2.0" --notes "$(python3 -c '...')"
# ou: --generate-notes
```