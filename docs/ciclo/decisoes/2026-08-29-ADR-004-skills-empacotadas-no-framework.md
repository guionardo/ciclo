# ADR-004 — Skills empacotadas no framework (instalação no ambiente novo)

**Data:** 2026-08-29
**Status:** Aceito e implementado
**Área:** Distribuição/instalação do framework

---

## Contexto

As skills do Hermes Agent ficam em `~/.hermes/skills/<nome>/` na máquina de cada
usuário — inclusive a `ciclo-framework-setup`, que documenta e instrui o uso do
ciclo. Num **ambiente novo do dev** (outra máquina, máquina nova do time), essas
skills locais não existem: o dev precisa do texto delas para que o Hermes consiga
carregá-las e o ciclo funcione com o mesmo conhecimento.

## Decisões

### D-A: Skills versionadas dentro do repo do framework

- O repo ciclo tem uma pasta **`skills/<nome>/`** no versionamento, com a mesma
  estrutura que o Hermes espera: `SKILL.md` + `references/` + `templates/` +
  `scripts/` (arquivos ocultos como `.git`/`.ciclo` não são empacotados).
- Hoje contém a skill **`ciclo-framework-setup`**; novas skills do framework são
  adicionadas na mesma pasta.
- Isso dá **uma fonte única de verdade**: o texto das skills viaja junto com o
  código do ciclo (clone/versionamento), em vez de viver só na HOME de quem criou.

### D-B: Comandos `ciclo skills list` e `ciclo skills install`

- `ciclo skills list` — lista as skills empacotadas no repo do framework.
- `ciclo skills install` — copia as skills de `skills/` para `~/.hermes/skills/`:
  - Pula skills já existentes (sem sobrescrever); `--force` sobrescreve.
  - Resolve o diretório de origem a partir do próprio CLI
    (`cli/src/commands/skills.js` → `<repo>/skills`), independente de onde o repo
    foi clonado.
- **Setup de ambiente novo:** `git clone <repo-ciclo> && cd cli && npm link &&
  ciclo skills install` — o dev ganha a CLI e as skills numa sequência só.

## Consequências

- Ambiente novo de dev reproduzível: as skills vêm do repo, não da memória de quem
  montou o setup.
- Skills ficam versionadas e revisáveis (diff em PR) junto com o código.
- O destino continua sendo `~/.hermes/skills/` — o Hermes não muda nada; só recebe
  os arquivos.

## Alternativas consideradas

| Opção | Motivo da rejeição |
|---|---|
| Copiar manualmente as skills (`cp -R ~/.hermes/skills/...`) | não versionado; fácil de esquecer arquivos; sem idempotência |
| Submódulo git para a skill | sobre-engenharia; a skill já é um repo ciclo próprio, mas o pacote no framework é só arquivos |
| Instalar como pacote npm separado | as skills não são código executável; o modelo de pasta do Hermes é mais simples |