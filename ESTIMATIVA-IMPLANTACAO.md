# Estimativa de Esforço e Implantação do Framework **ciclo**

**Objetivo:** Apresentar uma estimativa de tempo, esforço (pessoa‑dias) e custos para a criação do framework **ciclo** e sua implantação em uma equipe de desenvolvimento, considerando:
1. Fase de **dev piloto** (setup final, validação e ajustes).
2. Fase de **roll‑out para os demais desenvolvedores** (treinamento, adoção e suporte inicial).
3. Integração final com **Jira** e **GitHub** (Parte II do roadmap).

---

## 1. Premissas (Assumptions)

| Item | Valor / Descrição |
|------|-------------------|
| Equipe de desenvolvimento alvo | 6 devs (inclui o piloto) |
| Jornada padrão | 8 h/dia |
| Custo médio hora‑dev (para referência) | R$ 150/h (ajustável conforme realidade da empresa) |
| Tecnologia base | Node.js, TypeScript (opcional para versão inicial), Git |
| Disponibilidade de ambiente | Dev já possui máquina com Node ≥20 e Git instalado |
| Integrações Jira/GitHub | Utilizar MCP (preferido) ou fallback CLI/REST; esforço estimado considerando adaptação e testes. |
| Documentação | Estruturada em Markdown, com arquivos SPEC.md, ROADMAP.md, guia de uso e tutoriais. |
| Qualidade | Revisão de código, testes unitários básicos (cobertura ≥70 % nas partes críticas) e validação manual. |
| Gerenciamento de risco | 15 % de contingência adicionada ao esforço total. |

---

## 2. Estrutura do Trabalho (Fases e Atividades)

| Fase | Atividade | Descrição | Pessoa‑dias (PD) |
|------|-----------|-----------|------------------|
| **0 – Preparação e Estudos** | Levantamento de requisitos | Reuniões com stakeholders, definição de escopo, priorização de features (D1‑D12). | 2 |
| | Pesquisa de ferramentas | Avaliação de MCP, CLI (gh, jira-cli), padrões de wizard (prisma, eslint, firebase). | 1 |
| **1 – Desenvolvimento do Núcleo (ciclo‑core)** | Scaffold do CLI | package.json, bin, estrutura de pastas, comandos básicos (init, new, list, show, move, start, report, doctor). | 3 |
| | Implementação de **fingerprint** | Detecção de linguagem, gerenciador de pacotes, frameworks, presença de workflows GH. | 2 |
| | Wizard de inicialização (`ciclo init`) | Perguntas interativas (nome, prefixo de task), validação, escrita transacional (backup/rollback), criação de .ciclo/, config.json, state.json, AGENTS.md seção gerenciada, context/, docs/. | 4 |
| | Interface **TaskStore** e **VcsAdapter** (esqueletos) | Definição de contratos TypeScript (ou JSDoc) para armazenamento de tasks e adaptadores de VCS. | 2 |
| | Comando **doctor** | Validação de acesso a serviços (GitHub, Jira – placeholder) e integridade do ambiente .ciclo/. | 1 |
| | Testes unitários básicos | Cobrindo fingerprint, escrita transacional, merge de config, geração de state. | 2 |
| **2 – Documentação e Material de Apoio** | SPEC.md (atualizado) | Detalhamento de arquitetura, decisões D1‑D12, fluxo de task, locais de armazenamento. | 1 |
| | ROADMAP.md (atualizado) | Linha do tempo com marcos, entregas por fase. | 0.5 |
| | Guia de uso do desenvolvedor | Passo‑a‑passo: `ciclo init`, criação de task, refinamento, início, revisão, deploy. | 1 |
| | Modelo de ADR (decisões IA) | Template para docs/ciclo/decisoes/. | 0.2 |
| | CHANGELOG-IA.md exemplo | Exemplo de entrada. | 0.1 |
| **3 – Piloto (Dev Piloto)** | Setup no ambiente do piloto | Executar wizard em um repo real, validar geração de arquivos, testar fluxo de task (new → refinamento → start). | 1 |
| | Coleta de feedback | Reuniões de retrospecto, ajustes no wizard, melhorias na UX (prompts, mensagens). | 1 |
| | Correções e polimento | Fixes de bugs identificados, melhorias de mensagens, ajuste de transação. | 1 |
| **4 – Integração Jira / GitHub (Parte II)** | Adapter **GithubVcsAdapter** (MCP ou CLI) | Leitura de PRs, label, status de workflows Actions, geração de branch/worktree por task. | 3 |
| | Adapter **JiraTaskStore** (MCP ou CLI) | Leitura/atualização de tasks nos campos customizados, transição de status (backlog → refinando → pronta → em_execução → revisão → concluída). | 3 |
| | Eventos e observabilidade | Integração de webhooks (ou polling) para atualizar .ciclo/events.jsonl ao mudar status no Jira/GH. | 2 |
| | Testes de integração (cenário end‑to‑end) | Simular criação de task no Jira, refinamento pelo ciclo, branch no GH, PR, revisão, merge e fechamento da task. | 2 |
| **5 – Roll‑out para a Equipe** | Treinamento inicial | Workshop de 4 h (slides + hands‑on) para os 5 devs restantes. | 0,5 (prep) + 2 (execução) = 2,5 |
| | Suporte inicial (primeiras 2 semanas) | Plantão para dúvidas, revisão de primeiros usos, ajustes de configuração. | 3 |
| | Materiais de treinamento | Vídeos curtos (5‑10 min) gravados, FAQ. | 1 |
| **6 – Qualidade e Revisão Final** | Revisão de código | Pair programming / linting / ajuste de documentação. | 1 |
| | Testes de regressão | Execução completa do fluxo piloto + integração. | 1 |
| | Preparação de release | Versionamento, tag, changelog, instruções de upgrade. | 0,5 |
| **Contingência (15 %)** | – | – | **≈ 4,5 PD** |
| **TOTAL ESTIMADO** | – | – | **≈ 34,5 pessoa‑dias** |

> **Nota:** Os valores acima são arredondados para facilitar a leitura. O total de **34,5 PD** equivale a aproximadamente **7 semanas** de trabalho de um desenvolvedor full‑time (considerando 5 dias úteis por semana). Se houver dois desenvolvedores trabalhando em paralelo em tarefas não‑dependentes, o calendário pode ser reduzido para cerca de **4 semanas**.

---

## 3. Cronograma Sugerido (Gantt simplificado)

| Semana | Atividade principal |
|--------|---------------------|
| 1 | Levantamento de requisitos, pesquisa de ferramentas, scaffold do CLI |
| 2 | Fingerprint, wizard init, interface TaskStore/VcsAdapter (esqueleto) |
| 3 | Testes unitários básicos, comando doctor, documentação (SPEC, ROADMAP) |
| 4 | Piloto: setup, feedback, correções |
| 5 | Integração GitHub (adapter, eventos) |
| 6 | Integração Jira (adapter, eventos) + testes end‑to‑end |
| 7 | Treinamento da equipe, suporte inicial, revisão final e release |

> O cronograma pode ser ajustado conforme disponibilidade de recursos e eventuais bloqueios (ex.: aprovação de acesso a APIs externas).

---

## 4. Estimativa de Custo (opcional)

Usando o custo médio hora‑dev de **R$ 150/h**:

- Total de horas = 34,5 PD × 8 h = **276 h**
- Custo direto = 276 h × R$ 150/h = **R$ 41.400**
- Acrescentando a margem de contingência já incluída no esforço, o valor acima já cobre o risco previsto.

Se a empresa preferir um orçamento separado, pode‑se apresentar:

| Item | Valor (R$) |
|------|------------|
| Desenvolvimento (34,5 PD) | 41.400 |
| Infraestrutura (licenças MCP, se houver) | a definir |
| Treinamento (materiais, local) | já incluído |
| **Total estimado** | **≈ R$ 41.400** |

---

## 5. Riscos Principais e Mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Falta de padronização de repositórios (diversidade de linguagens/gerenciadores) | Média | Alto (rework no fingerprint) | Fazer fingerprint extensível; permitir sobrescrita via config. |
| Resistência à mudança dos devs | Média | Medio | Envolver o piloto desde o início, mostrar ganhos rápidos (visibilidade de tasks, redução de møtes). |
| Atraso na disponibilidade de MCP/Jira ou GH | Baixa | Alto | Desenvolver adapters com fallback CLI/REST; definir marcos de “integração opcional” na Fase 0. |
| Sobrecarga de trabalho do piloto além do planejado | Média | Medio | Limitar o escopo do piloto a validação de fluxo básico; deixar features avançadas para posteriores sprints. |
| Qualidade da documentação insuficiente | Baixa | Medio | Revisão cruzada com técnico e não‑técnico; incluir exemplos práticos. |

---

## 6. Entregáveis (Deliverables)

| Código / Artefato | Descrição | Local |
|-------------------|-----------|-------|
| `@ciclo/cli` (npm package) | CLI com comandos `init`, `new`, `list`, `show`, `move`, `start`, `report`, `doctor`. | `~/workspace/ciclo/cli/` |
| Specificação arquitetural | `SPEC.md` (decisões D1‑D12, locais de armazenamento, fluxo de task). | `~/workspace/ciclo/SPEC.md` |
| Roadmap | `ROADMAP.md` (fases, marcos, datas estimadas). | `~/workspace/ciclo/ROADMAP.md` |
| Guia de uso | `docs/USAGE.md` (passo‑a‑passo para dev). | `~/workspace/ciclo/docs/USAGE.md` |
| Modelo de decisões IA | Template em `docs/ciclo/decisoes/TEMPLATE.md`. | `~/workspace/ciclo/docs/ciclo/decisoes/` |
| Exemplo de changelog IA | `docs/ciclo/CHANGELOG-IA.md`. | `~/workspace/ciclo/docs/ciclo/` |
| Testes unitários | Jest ou vitest (cobertura ≥70 % no core). | `~/workspace/ciclo/cli/__tests__/` |
| Documentação de integração | `docs/INTEGRATION.md` (como adapter GitHub/Jira funciona). | `~/workspace/ciclo/docs/INTEGRATION.md` |
| Release inicial | Versão `0.1.0` publicada no registro interno (ou GitHub Packages). | — |

---

## 7. Conclusão

Com um esforço estimado de **~34,5 pessoa‑dias** (aproximadamente **7 semanas** de um desenvolvedor ou **4 semanas** com dupla em paralelo), o framework **ciclo** pode ser desenvolvido, validado com um piloto, integrado a Jira e GitHub e colocado em produção para toda a equipe de desenvolvimento. Essa estimativa inclui toda a documentação, treinamento e suporte inicial necessários para uma adoção suave e eficaz.

*Próximos passos:* aprovação do orçamento, kickoff com o desenvolvedor piloto e início das atividades da Fase 0 (levantamento de requisitos e scaffold).

--- 

*Elaborado por: Hermes Agent (analista de IA) – data: 2026‑08‑26.*