# ADR-002 — Refinamento assistido pelo agente (agente ↔ dev)

**Data:** 2026-08-29
**Status:** Aceito e implementado
**Área:** Fluxo de refinamento de tasks (Agentes)

---

## Contexto

O refinamento de uma task exige contexto caro de reunir (issue no Jira, cadeia de
parents, estrutura do código) e uma proposta de plano clara. Sem um fluxo definido,
o agente ou perguntava demais ao dev, ou aplicava planos sem aprovação. Decisões:

## Decisões

### D-A: Material de análise via `ciclo contexto <id>`

- Novo comando que **reúne o contexto completo** da task: issue local/Jira,
  campos atuais, **cadeia de parents** (Story/Feature/Epic) e **estrutura de
  código** do repositório.
- É o primeiro passo de qualquer refinamento assistido — o agente roda
  `ciclo contexto <id>` antes de propor qualquer plano.
- Aceita ID local ou chave Jira curta (ex.: `FW-27`), importando a issue via
  `ciclo show` quando necessário.

### D-B: Plano proposto no chat, aplicado via `ciclo refine --plan <json>`

- O agente propõe o plano estruturado **no chat** com:
  🎯 objetivo · 🪜 passos de execução · 📦 resultado esperado · 📝 critérios de aceitação.
- **Só após aprovação explícita do dev** o plano é aplicado com
  `ciclo refine <id> --plan '{"goal":"...","steps":[...],"expectedResult":"...","acceptanceCriteria":[...]}'`.
- O `--plan` salva o plano localmente (estado `refinando`) e **sincroniza o Jira**:
  descrição estruturada + label **`refined`**.
- Sem `--plan`, o `refine` mantém o fluxo interativo original.

### D-C: Gate de refinamento no `ciclo start`

- `ciclo start <id>` verifica a label **`refined`** na issue:
  - Presente → segue direto para a execução (branch + Jira IN PROGRESS).
  - Ausente → avisa `⚠️ A issue NÃO está marcada como refinada` e pergunta ao dev
    se quer revisar/refinar antes de iniciar.
- O AGENTS.md gerado pelo `ciclo init` documenta o fluxo completo
  (contexto → proposta → aprovação → `--plan`) para o agente.

## Consequências

- Dev sempre tem **aprovação humana** antes de salvar um plano.
- Refinamento fica mais rico: usa a cadeia de parents como contexto dos passos.
- Validado ponta-a-ponta no piloto (FW-27: contexto → proposta → `--plan` →
  label `refined` → `start` direto).

## Alternativas consideradas

| Opção | Motivo da rejeição |
|---|---|
| Agente aplica o plano sem aprovação | viola o princípio "humano no loop nos pontos caros" |
| Só prompts interativos no `refine` | travava o fluxo autônomo do agente; sem contexto externo |