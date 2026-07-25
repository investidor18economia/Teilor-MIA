# Baseline Conversacional Oficial da MIA

**Patch:** 2.6 — Baseline Conversacional  
**Fase:** 2 — Classificação e Priorização (encerrada)  
**Próxima fase:** Conv-Phase 3 — Correções Conversacionais  
**Status:** 🟢 Baseline congelado — referência permanente pré-implementação  
**Data de congelamento:** 2026-07-25  
**RC de referência:** MVP RC1 · `v1.0.0-rc1` · commit `d6cccb9`  
**Autoridade arquitetural:** documentos mestres em `docs/documentos master mestres pra dar contexto/`

| Documento mestre | Caminho |
|------------------|---------|
| Arquitetura | `mia_architecture_md_complete.md` |
| Engenharia | `mia_engineering_rules_md_complete.md` |
| Roadmap | `mia_roadmap_md_complete.md` |

**Trabalho de referência:** PATCH 1.1 → 1.8 (inventário) · PATCH 2.1 → 2.5 (classificação, auditoria, priorização, roadmap, auditoria final)

---

# Índice

1. [Objetivo do Baseline](#1-objetivo-do-baseline)
2. [Estado Atual da Arquitetura Conversacional](#2-estado-atual-da-arquitetura-conversacional)
3. [Matriz Oficial de Testes Congelada](#3-matriz-oficial-de-testes-congelada)
4. [Inventário Congelado de Problemas Conhecidos](#4-inventário-congelado-de-problemas-conhecidos)
5. [Inventário de Comportamentos Já Aprovados](#5-inventário-de-comportamentos-já-aprovados)
6. [Critérios Oficiais de Smoke Test (Fase 3)](#6-critérios-oficiais-de-smoke-test-fase-3)
7. [Checklist Oficial de Regressão](#7-checklist-oficial-de-regressão)
8. [Critérios Oficiais de Aprovação dos Patches](#8-critérios-oficiais-de-aprovação-dos-patches)
9. [Critérios para Encerramento da Fase 3](#9-critérios-para-encerramento-da-fase-3)
10. [Checklist Arquitetural Permanente](#10-checklist-arquitetural-permanente)

---

# 1. Objetivo do Baseline

## 1.1 Por que este documento existe

A MIA passou pelo MVP Release Candidate (`v1.0.0-rc1`) com **0 bloqueadores P0/P1** em produção. Paralelamente, testes manuais extensivos na interface identificaram **degradações conversacionais** que não impedem o RC, mas reduzem qualidade percebida, continuidade e profundidade argumentativa.

Este documento **congela o estado observado imediatamente antes da Fase 3 (implementação)**. Ele é a fotografia oficial do comportamento atual — incluindo o que funciona, o que falha e como validar que correções não introduzam regressões.

## 1.2 Qual problema resolve

| Problema | Como o baseline resolve |
|----------|---------------------------|
| Correção local que quebra outra área | Matriz + checklist de regressão reutilizável |
| Perda de referência do “antes” | Inventário congelado de problemas + comportamentos aprovados |
| Aprovação subjetiva de patches | Critérios objetivos de smoke, evidência e gate por estágio |
| Violação arquitetural durante correção | Checklist permanente alinhado aos documentos mestres |
| Retrabalho em auditorias futuras | Trace tags padronizadas e suites de referência congeladas |

## 1.3 Como será utilizado na Fase 3

- **Antes de cada patch (3.1–3.5):** consultar inventário de problemas alvo e comportamentos que não podem regredir.
- **Após cada patch:** executar smoke test oficial da seção 6 + checklist seção 7.
- **No PATCH 3.6:** regressão completa contra baselines MVP (12.4) + matriz conversacional deste documento.
- **No PATCH 3.7:** checklist arquitetural permanente (seção 10).
- **Em produção:** conversas reais pela interface comparadas à matriz congelada.
- **Em auditorias futuras:** diff comportamental “baseline vs pós-patch” com IDs `CONV-P-*` e `CONV-OK-*`.

---

# 2. Estado Atual da Arquitetura Conversacional

## 2.1 Princípios arquiteturais preservados (confirmação explícita)

| Princípio | Status no baseline | Evidência |
|-----------|-------------------|-----------|
| ✓ **MIA owns the intelligence** | Confirmado | Decision Engine, Intent Authority, Product Resolution decidem; LLM não escolhe winner |
| ✓ **LLM only verbalizes** | Confirmado | Prompt builder + verbalizers recebem facts estruturados |
| ✓ **Pipeline cognitivo único** | Confirmado | Entrada via `/api/mia-chat` → core `chat-gpt4o.js` |
| ✓ **Sem cérebro paralelo** | Confirmado | Cognitive Router em **shadow mode** — não altera decisões |
| ✓ **Sem inteligência duplicada** | Confirmado com ressalva | `resolveContextQuery()` legado coexiste com Intent Authority — **fonte de divergência conhecida**, não segundo cérebro autônomo |

## 2.2 Pipeline cognitivo atual (rastreado)

```text
Usuário (MIAChat.jsx)
  ↓ POST /api/mia-chat          [perímetro: rate limit, CORS, hardening]
  ↓ forward → chat-gpt4o.js
  ↓
resolveContextQuery()           ← LEGADO · heurístico · ANTES da autoridade
  ↓
buildSessionContext()           ← merge request session_context + histórico
  ↓
detectIntent() + Routing Decision Contract
  ↓
classifyMiaTurn()               ← SHADOW · não decide
  ↓
recognizeMiaIntent()            ← Intent Recognition (autoritativo)
  ↓
buildIntentAuthorityFromRecognition() + applyIntentAuthorityToPipeline()
  ↓
suppressCommercialSignalsForAuthority() + rebuild routing
  ↓
evaluateCommercialEntryPermission()   ← Commercial Entry Gate
  ↓
[deny] → runNonCommercialAuthorityFastBranch()
         → non_commercial_governed_fallback
[allow/mixed] ↓
Product Resolution (Specific Product Lock, aliases embutidos)
  ↓
Constraint Refinement / Clarification (distribuído)
  ↓
Decision Engine (winner, runner-up, tradeoffs)
  ↓
Behavior + Narrative Engines
  ↓
Commercial Explanation Verbalizer + LLM
  ↓
Post-Processing Governance + Runtime Precedence
  ↓
Resposta + session_context atualizado → Frontend
```

## 2.3 Componentes principais e responsabilidades

| Camada | Módulo / local | Responsabilidade |
|--------|----------------|------------------|
| **Perímetro** | `pages/api/mia-chat.js` | Proxy, segurança, validação — browser nunca acessa core |
| **Context Resolution (legado)** | `resolveContextQuery()` inline em `chat-gpt4o.js` | Heurísticas pré-autoridade: social casual, budget guide, needsClarification |
| **Session Context** | `buildSessionContext()` + `MIAChat.jsx` | Memória conversacional: `lastBestProduct`, `lastRankingSnapshot`, etc. |
| **Intent Recognition** | `lib/miaIntentRecognitionLayer.js` | Modos SOCIAL / MIXED / COMMERCE; `requiresClarification` |
| **Intent Authority** | `lib/miaIntentAuthority.js` | `commercialPermission` fail-closed; suppress commercial signals |
| **Commercial Entry Gate** | `lib/miaCommercialEntryGate.js` | Permissão de entrada comercial pós-routing |
| **Follow-up Continuity** | `lib/miaCommercialFollowUpContinuity.js` | Topic switch, follow-up contextual |
| **Routing Contract** | `lib/miaRoutingDecisionContract.js` | Anchor preservation, `cognitive_anchor_hold` |
| **Semantic State** | `lib/miaSemanticStateGovernance.js` | Transições de estado, snapshots |
| **Product Resolution** | `lib/miaSpecificProductResolutionLock.js` | Lock de produto específico, aliases embutidos |
| **Comparison Flow** | `lib/miaComparisonFlowCrashGuard.js` | Parser e guard de comparação |
| **Constraint Refinement** | `lib/miaCommercialConstraintRefinement.js` | RF-01, ASK_CLARIFICATION, decision refresh |
| **Clarification Closing** | `lib/miaGenericQueryClarificationClosing.js` | Fechamento de clarificação genérica |
| **Decision Engine** | `lib/miaDecisionConsistencyFixes.js` + core | Winner, runner-up, consistência |
| **Behavior** | `lib/miaSocialConversationBehavior.js`, `lib/miaHumanConversationExperience.js` | Tom e experiência |
| **Narrative** | `lib/miaHumanDecisionNarrativeEngine.js`, `lib/miaSpecialistNarrativeEngine.js` | Conteúdo argumentativo estruturado |
| **Verbalizer** | `lib/miaCommercialExplanationVerbalizer.js` | Verbalização comercial determinística + LLM |
| **Runtime Precedence** | `lib/miaRuntimePrecedence.js`, `lib/miaRuntimeEnforcement.js` | Paths governados, fallback institucional |
| **Cognitive Router** | `lib/miaCognitiveRouter.js` | Classificação shadow — **não decisória no baseline** |
| **LLM** | prompt builder no core | **Somente verbalização** |

## 2.4 Tags de trace para evidência (baseline)

Durante testes manuais e smoke, registrar sempre que possível:

| Tag | Origem | Uso |
|-----|--------|-----|
| `interactionMode` | Intent Recognition | SOCIAL / MIXED / COMMERCE / EMOTIONAL_SUPPORT |
| `commercialPermission` | Intent Authority | allow / deny / mixed |
| `responsePath` | Runtime Precedence | ex.: `non_commercial_governed_fallback` |
| `contextResolution.mode` | resolveContextQuery | ex.: `casual_chat`, `comparison_context_lock` |
| `commercialEntryGate.allowed` | Entry Gate | true / false |
| `routingDecision.mode` | Routing Contract | ex.: `cognitive_anchor_hold` |
| Session flags | `MIA_E2E_STATE_TRACE` | `REQUEST_SESSION_CONTEXT_MISSING`, `BUILD_CONTEXT_DROPPED_*` |

Ativar trace completo: `MIA_STATE_AUDIT=true` · `MIA_DEBUG=true`

---

# 3. Matriz Oficial de Testes Congelada

**Legenda de status:**

| Símbolo | Significado |
|---------|-------------|
| ✅ | Comportamento aprovado / estável no baseline |
| ⚠️ | Funciona parcialmente ou inconsistente |
| ❌ | Falha conhecida documentada |
| 🔒 | Não deve regredir após correções |

---

## 3.1 Primeira interação

| ID | Cenário | Objetivo | Esperado | Observado (baseline) |
|----|---------|----------|----------|----------------------|
| M-01 | Saudação simples ("oi", "bom dia") | Acolhimento social sem forçar comercial | Resposta social institucional; sem busca de produto | ✅ Estável |
| M-02 | Pergunta comercial direta ("quero um celular até 2 mil") | Entrada comercial imediata | Pipeline comercial; busca/recomendação | ⚠️ Ocasional deny ou fallback |
| M-03 | Pergunta institucional ("o que é a Teilor?") | Resposta direta sem pipeline comercial | `general_answer` ou equivalente | ✅ Estável |
| M-04 | Primeira mensagem mixed ("tô nervoso, preciso de um notebook") | Reconhecer emoção + abrir comercial | MIXED permitido com segmentação | ⚠️ Mixed frequentemente bloqueado |

---

## 3.2 Recomendação

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-10 | Busca genérica com categoria + budget | Recomendar após sinais suficientes | Winner + cards comerciais | ✅ Quando entra no pipeline |
| M-11 | Busca com sinais fracos ("quero algo bom") | Clarificar antes de recomendar | ASK_CLARIFICATION ou guide | ❌ Recomendação precoce reportada |
| M-12 | Budget constraint sem categoria | Guide antes de busca | Modo `budget_guide` | ✅ Estável quando legado aciona |
| M-13 | Regret fear sem produto | Guide emocional/comercial | Não recommend imediato | ⚠️ Parcial |

---

## 3.3 Comparação

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-20 | Comparação explícita ("iPhone 15 vs Galaxy S24") | Resolver ambos + comparar | Comparação profunda com tradeoffs | ⚠️ Superficial ou interrompida |
| M-21 | Follow-up pós-comparação ("e a câmera?") | Manter lock de comparação | `comparison_context_lock` | ⚠️ Perda de contexto reportada |
| M-22 | Comparação após recomendação anterior | Usar winner + runner-up da sessão | Continuidade comparativa | ❌ Perda winner/runner-up |

---

## 3.4 Continuidade

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-30 | 10 turnos com mesmo produto | Manter âncora | `lastBestProduct` persistente | ⚠️ MVP passa 10/10 em prod; falhas em casos específicos |
| M-31 | 15 turnos multi-tópico controlado | Continuidade comercial | Snapshots preservados | ⚠️ MVP passa 15/15; edge cases falham |
| M-32 | Follow-up de refinamento ("prefiro bateria") | Acumular preferências | Semantic state atualizado | ❌ Preferências não acumuladas |
| M-33 | Referência anafórica ("esse aí") | Resolver via sessão | Produto da sessão usado | ⚠️ Inconsistente |

---

## 3.5 Contestação / defesa de decisão

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-40 | "Por que esse e não o outro?" | Explicação pós-decisão | POST_DECISION_EXPLANATION | ⚠️ Depende de winner preservado |
| M-41 | "Não confio nessa escolha" | Confidence challenge | Narrativa defensiva com facts | ⚠️ Superficial se facts pobres |
| M-42 | Objeção de preço | Tradeoff humano | Reasoning engine + verbalizer | ✅ Quando pipeline comercial ativo |

---

## 3.6 Mudança de contexto

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-50 | Novo produto explícito ("agora quero notebook") | New search permitido | `allowNewSearch` | ⚠️ Anchor hold pode bloquear |
| M-51 | Mudança de prioridade ("priorizo câmera agora") | Reabrir decisão | `priority_change_reopen` | ❌ Quebra conversa reportada |
| M-52 | Topic switch social puro | Deny comercial | Fallback governado | ✅ Fail-closed correto |
| M-53 | Topic switch com ask comercial embutido | Mixed ou allow | Entrada comercial | ❌ Deny indevido reportado |

---

## 3.7 Conversas sociais

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-60 | Chat casual ("como você está?") | Social puro | `non_commercial_governed_fallback` ou social stack | ✅ Estável |
| M-61 | Post-purchase ack ("já comprei, obrigado") | Encerramento social | Deny comercial | ✅ Estável |
| M-62 | Menção de produto sem ask ("vi um iPhone lindo") | Entity frame conversacional | Deny comercial sem ask | ⚠️ Borderline — deny correto ou excessivo |

---

## 3.8 Mensagens mistas

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-70 | Emoção + produto + ask | Mixed allow | Segmentação comercial + social | ❌ Bloqueio frequente |
| M-71 | Mixed + ambiguidade | Clarificar segmento comercial | Clarificação antes de deny | ❌ Deny via requiresClarification |
| M-72 | Mixed com ask comercial explícito | Allow/mixed | Pipeline comercial | ⚠️ Inconsistente |

---

## 3.9 Robustez

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-80 | Query vazia / só emoji | Graceful | Pedir clarificação | ✅ Estável |
| M-81 | Texto longo com múltiplas intenções | Priorização correta | Uma decisão binding | ⚠️ Parser absorve fragmentos |
| M-82 | Produto inexistente no catálogo | Fallback honesto | Sem alucinação | ✅ Data layer governa |
| M-83 | Rate limit / erro provider | Degraded graceful | Resposta governada | ✅ Commercial runtime fallback |

---

## 3.10 Product Resolution

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-90 | Produto específico ("Galaxy S24 Ultra") | Lock + busca direcionada | Product lock ativo | ❌ Fallback genérico reportado |
| M-91 | Alias coloquial (" Moto G84 ") | Resolver via aliases embutidos | Match correto | ❌ Aliases falham |
| M-92 | Produto + modificador na mesma frase | Parser isolado | Termo produto limpo | ❌ Parser absorve frase |
| M-93 | Produto genérico vs específico | `isGenericProductSearchQuery` correto | Roteamento adequado | ⚠️ Borderline |

---

## 3.11 Follow-up comercial

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-100 | "E mais barato?" após recomendação | Follow-up contextual | ALLOW/MIXED + anchor | ⚠️ Depende de sessão |
| M-101 | "Me mostra outras opções" | Refinement / new search | Decisão coerente | ⚠️ Inconsistente |
| M-102 | Silêncio de categoria com sessão ativa | Usar lastCategory | Contexto preservado | ⚠️ Perda reportada |

---

## 3.12 Clarificação

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-110 | Ambiguidade de produto | ASK_CLARIFICATION | Pergunta antes de decidir | ❌ Decisão sem clarificar |
| M-111 | Preferências contraditórias | Detectar conflito | Clarificar ou reconciliar | ❌ Ignoradas |
| M-112 | Query genérica fechável | Generic query closing | Fechamento correto | ⚠️ Timing incorreto |

---

## 3.13 Encerramento / tom

| ID | Cenário | Objetivo | Esperado | Observado |
|----|---------|----------|----------|-----------|
| M-120 | Closing natural pós-decisão | Conversational closing | Encerramento humano | ✅ Parcialmente estável |
| M-121 | Tom especialista premium | Specialist narrative | Consultor, não review genérico | ⚠️ Qualidade variável |
| M-122 | Anti-spec-dump | Human-first | Sem dump de specs | ✅ Guard ativo quando facts existem |

---

# 4. Inventário Congelado de Problemas Conhecidos

**Origem:** Fase 1 (PATCH 1.1 → 1.8) · Classificação Fase 2 (PATCH 2.1) · Auditoria camadas (PATCH 2.2)

## 4.1 Grupo A — Intent Authority / Entrada Comercial → PATCH 3.1

| ID | Descrição | Impacto | Patch |
|----|-----------|---------|-------|
| CONV-P-A01 | Perguntas comerciais classificadas como sociais | Alto — pipeline comercial não inicia | 3.1 |
| CONV-P-A02 | Mensagens mixed bloqueando fluxo comercial | Alto — perda de conversões naturais | 3.1 |
| CONV-P-A03 | Pergunta sobre produto específico caindo em fallback institucional | Alto — usuário não recebe resposta útil | 3.1 |
| CONV-P-A04 | `commercialPermission = deny` em contexto comercial válido | Crítico — bloqueia toda cadeia downstream | 3.1 |
| CONV-P-A05 | `responsePath = non_commercial_governed_fallback` indevido | Alto — mascara problema como resposta genérica | 3.1 |
| CONV-P-A06 | Divergência `resolveContextQuery` (legado) vs Intent Authority | Alto — dual classificação pré-autoridade | 3.1 |
| CONV-P-A07 | Mixed + `requiresClarification` → deny fail-closed excessivo | Médio-alto — bloqueia em vez de clarificar | 3.1 (+ coordenação 3.4) |

## 4.2 Grupo B — Continuidade e Memória → PATCH 3.2

| ID | Descrição | Impacto | Patch |
|----|-----------|---------|-------|
| CONV-P-B01 | Perda de contexto entre turnos | Alto — conversa multi-turno quebra | 3.2 |
| CONV-P-B02 | Perda do winner (`lastBestProduct`) | Alto — recomendações/descrições desconectadas | 3.2 |
| CONV-P-B03 | Perda do runner-up (`lastRankingSnapshot`) | Médio-alto — comparações e defesas prejudicadas | 3.2 |
| CONV-P-B04 | Perda da âncora comercial | Alto — follow-ups falham | 3.2 |
| CONV-P-B05 | Mudança de prioridade quebrando a conversa | Médio — refinement impossível | 3.2 |
| CONV-P-B06 | Preferências não acumuladas entre turnos | Médio — decisões não evoluem | 3.2 (+ 3.4) |
| CONV-P-B07 | Session drop no transporte cliente → API (`session_context`) | Alto — perda antes da governança server | 3.2a |
| CONV-P-B08 | `BUILD_CONTEXT_DROPPED_*` no rebuild server-side | Alto — perda após recepção | 3.2b |

## 4.3 Grupo C — Product Resolution → PATCH 3.3

| ID | Descrição | Impacto | Patch |
|----|-----------|---------|-------|
| CONV-P-C01 | Aliases falhando (coloquialismos, variações) | Alto — produto errado ou genérico | 3.3 |
| CONV-P-C02 | Parser absorvendo partes da frase além do produto | Médio — lock/scoring incorreto | 3.3 |
| CONV-P-C03 | Comparação interrompida após Product Resolution | Alto — fluxo comparativo aborta | 3.3 (+ verificar A/B) |
| CONV-P-C04 | Produto específico desviado para busca genérica | Alto — perda de precisão | 3.3 |
| CONV-P-C05 | Comparison lock perdido entre turnos | Alto — follow-up comparativo falha | 3.3 (+ 3.2) |

## 4.4 Grupo D — Clarificação / Refinamento → PATCH 3.4

| ID | Descrição | Impacto | Patch |
|----|-----------|---------|-------|
| CONV-P-D01 | Recomendação precoce com sinais insuficientes | Alto — decisão de baixa qualidade | 3.4 |
| CONV-P-D02 | Ambiguidades sem clarificação | Alto — resposta errada ou genérica | 3.4 |
| CONV-P-D03 | Preferências contraditórias ignoradas | Médio — incoerência argumentativa | 3.4 |
| CONV-P-D04 | Supressão indevida de `needsClarification` | Médio — clarificação silenciada | 3.4a |
| CONV-P-D05 | Generic query clarification closing aplicado cedo demais | Médio — fecha antes de entender | 3.4b |
| CONV-P-D06 | Decision refresh não acionado quando deveria | Médio — decisão stale | 3.4b |

## 4.5 Grupo E — Qualidade Argumentativa → PATCH 3.5

| ID | Descrição | Impacto | Patch |
|----|-----------|---------|-------|
| CONV-P-E01 | Comparações superficiais (poucos tradeoffs) | Médio-alto — percepção de qualidade | 3.5 |
| CONV-P-E02 | Narrativa rica mas facts pobres upstream | Médio — risco de integridade | 3.5a |
| CONV-P-E03 | Verbalizer curto demais para decisões complexas | Médio — resposta "ras" | 3.5b |
| CONV-P-E04 | Tom especialista inconsistente em mixed | Baixo-médio — experiência desigual | 3.5 |

**Total congelado:** 28 problemas catalogados · IDs estáveis para rastreio em toda a Fase 3.

---

# 5. Inventário de Comportamentos Já Aprovados

**Estes comportamentos 🔒 NÃO PODEM REGREDIR.** Origem: MVP RC1 · PATCH 12.4–12.6 · auditorias arquiteturais.

## 5.1 Infraestrutura e perímetro

| ID | Comportamento | Evidência |
|----|---------------|-----------|
| CONV-OK-01 | Browser acessa apenas `/api/mia-chat`, nunca core direto | PATCH 12B |
| CONV-OK-02 | Rate limit, CORS, hardening funcionais | PATCH 12C · `test-mia-public-api-hardening.js` |
| CONV-OK-03 | Resposta sanitizada — sem vazamento de prompt/debug | PATCH 12C |
| CONV-OK-04 | RequestId / correlationId em logs | PATCH 12E |
| CONV-OK-05 | Shared State ALS — sem vazamento entre requests | PATCH 12F |

## 5.2 Autoridade e governança (quando corretamente acionada)

| ID | Comportamento | Evidência |
|----|---------------|-----------|
| CONV-OK-10 | Fail-closed em negação comercial explícita | `test-mia-intent-authority-enforcement.js` |
| CONV-OK-11 | Post-purchase ack → deny comercial | Intent Authority |
| CONV-OK-12 | Topic switch social puro → fallback governado | Runtime Precedence |
| CONV-OK-13 | LLM não decide winner — Decision Engine decide | MVP Architecture Audit §6 |
| CONV-OK-14 | Anti-spec-dump guard ativo | ETAPA 2.5.2 roadmap · guards existentes |

## 5.3 Pipeline comercial (quando entrada permitida)

| ID | Comportamento | Evidência |
|----|---------------|-----------|
| CONV-OK-20 | Commercial runtime: fetch → merge → select → activation | PATCH 12.4 P0 suites |
| CONV-OK-21 | Data Layer para produtos expostos (47 phones centrais) | PATCH 12.6 · 6.1 coverage |
| CONV-OK-22 | Cards comerciais renderizados no frontend | Browser validation 196/196 |
| CONV-OK-23 | Winner selection consistente no turno atual | Decision Engine tests |
| CONV-OK-24 | Provider fallback quando ML indisponível | KNOWN_LIMITATIONS · degradado OK |

## 5.4 Conversação validada em produção (RC)

| ID | Comportamento | Evidência |
|----|---------------|-----------|
| CONV-OK-30 | Fluxo 10 turnos — API produção | PATCH 12.6 · 10/10 |
| CONV-OK-31 | Fluxo 15 turnos — API produção | PATCH 12.6 · 15/15 |
| CONV-OK-32 | UI: saudação, genérica, produto, comparação, mista | Browser 196/196 |
| CONV-OK-33 | Saudação social inicial estável | M-01 ✅ |
| CONV-OK-34 | Budget guide sem categoria | M-12 ✅ |
| CONV-OK-35 | Manual residual UX aprovado (fluidez, scroll, links) | MVP_PRODUCTION_VALIDATION §Manual |

## 5.5 Funcionalidades adjacentes (fora do escopo conversacional, mas no mesmo fluxo)

| ID | Comportamento | Evidência |
|----|---------------|-----------|
| CONV-OK-40 | Favoritos com auth HMAC | PATCH 12.4 · favorites suite |
| CONV-OK-41 | Alertas de preço com auth | PATCH 12.4 · alerts suite |
| CONV-OK-42 | Analytics allowlist client-side | Event Contract v1 |
| CONV-OK-43 | Executive metrics / cockpit isolados | Fase 11 aprovada |

## 5.6 Componentes estáveis (não promover a decisor)

| ID | Componente | Status baseline |
|----|------------|-----------------|
| CONV-OK-50 | Cognitive Router | Shadow — observação apenas |
| CONV-OK-51 | CSO (`buildMiaCSOFromContext`) | Shadow — não decide routing |
| CONV-OK-52 | Runtime Precedence envelope | Estável — paths governados |

---

# 6. Critérios Oficiais de Smoke Test (Fase 3)

Executar **obrigatoriamente após cada patch 3.1–3.5** antes de avançar.

## 6.1 PATCH 3.1 — Entrada Comercial

**Cenários mínimos:**

| # | Cenário | Evidência esperada |
|---|---------|-------------------|
| 1 | "quero um celular até 2000" | `commercialPermission=allow`; pipeline comercial; ≠ `non_commercial_governed_fallback` |
| 2 | "tô ansioso mas preciso de um notebook gamer" | `commercialPermission=mixed` ou allow; segmentação aplicada |
| 3 | "como você está?" | `commercialPermission=deny`; fallback social governado |
| 4 | "já comprei o celular, valeu" | deny comercial; sem busca |
| 5 | Produto específico com ask ("quanto custa o Galaxy S24?") | ≠ fallback institucional genérico |

**Deve continuar funcionando:** CONV-OK-10, 11, 12, 01–05

**Suites automatizadas mínimas:**
```bash
node scripts/test-mia-intent-authority-enforcement.js
node scripts/test-mia-intent-recognition-social-conversation-audit.js
node scripts/test-mia-routing-guardrails.js
```

---

## 6.2 PATCH 3.2 — Continuidade (3.2a transporte → 3.2b governança)

**Cenários mínimos:**

| # | Cenário | Evidência esperada |
|---|---------|-------------------|
| 1 | Recomendação → "e mais barato?" | `lastBestProduct` preservado; mesmo produto referenciado |
| 2 | Comparação → follow-up "e a câmera?" | `comparisonContextLocked`; produtos preservados |
| 3 | 5 turnos sequenciais com refinamento | `lastRankingSnapshot` length ≥ 1 após decisão |
| 4 | Mudança prioridade explícita | conversa continua; nova decisão ou clarificação |
| 5 | Trace: sem `BUILD_CONTEXT_DROPPED_*` nos casos acima | flags vazias |

**Deve continuar funcionando:** CONV-OK-30, 31, 20, 23 + todos 3.1

**Suites mínimas:**
```bash
node scripts/test-mia-conversational-continuity-fix.js
node scripts/test-mia-conversational-stress-15-turns.js
```

---

## 6.3 PATCH 3.3 — Product Resolution

**Cenários mínimos:**

| # | Cenário | Evidência esperada |
|---|---------|-------------------|
| 1 | "Galaxy S24 Ultra" | product lock ativo; busca direcionada |
| 2 | Alias coloquial conhecido | match correto no catálogo exposto |
| 3 | "iPhone 15 vs Galaxy S24" | comparação completa; 2 produtos resolvidos |
| 4 | Frase com produto + constraint ("S24 com boa bateria") | parser isolou produto; constraint separado |
| 5 | Produto inexistente | fallback honesto; sem alucinação |

**Deve continuar funcionando:** CONV-OK-21, 22 + todos 3.1, 3.2

**Suites mínimas:**
```bash
node scripts/test-mia-specific-product-resolution-lock-audit.js   # se existir
node scripts/test-mia-comparison-flow-crash-guard-audit.js        # se existir
node scripts/test-mia-patch-122-data-layer-p0-smoke.js
```

---

## 6.4 PATCH 3.4 — Refinamento Cognitivo

**Cenários mínimos:**

| # | Cenário | Evidência esperada |
|---|---------|-------------------|
| 1 | "quero algo bom" (sem categoria) | clarificação antes de recommend |
| 2 | "barato e premium" (contraditório) | clarificação ou reconciliação |
| 3 | Mixed ambíguo sem ask | clarificação comercial, ≠ deny seco |
| 4 | Sinais suficientes após clarificação | decision refresh; novo winner se aplicável |
| 5 | Budget guide → resposta categoria | não recommend precoce |

**Deve continuar funcionando:** CONV-OK-34 + todos 3.1–3.3

**Suites mínimas:**
```bash
node scripts/test-mia-commercial-constraint-refinement-audit.js   # se existir
node scripts/test-mia-conversational-closing-engine-audit.js
```

---

## 6.5 PATCH 3.5 — Qualidade Argumentativa

**Cenários mínimos:**

| # | Cenário | Evidência esperada |
|---|---------|-------------------|
| 1 | Comparação flagship vs flagship | ≥2 tradeoffs humanos distintos; sem spec-dump |
| 2 | "por que esse?" pós-decisão | narrativa defensiva com facts do winner |
| 3 | Mixed com segmento comercial | tom especialista no trecho comercial |
| 4 | Comparação budget | consequências práticas, não benchmark clichê |
| 5 | Verificar payload narrative antes do LLM | facts estruturados; LLM não inventa specs |

**Deve continuar funcionando:** CONV-OK-14 + todos 3.1–3.4

**Suites mínimas:**
```bash
node scripts/test-mia-human-decision-narrative-engine-audit.js    # se existir
node scripts/test-mia-data-layer-humanization-guard-audit.js
node scripts/test-mia-conversational-family-closure-standard.js
```

---

# 7. Checklist Oficial de Regressão

Reutilizar **integralmente** após cada patch e na regressão final (3.6).

## 7.1 Entrada e classificação

- [ ] **Entrada comercial** — query comercial válida entra no pipeline
- [ ] **Conversas sociais** — social puro não dispara busca comercial
- [ ] **Conversas mistas** — mixed tratado sem bloqueio indevido
- [ ] **Mudança de assunto** — topic switch detectado corretamente
- [ ] **Deny fail-closed** — negações explícitas e post-purchase respeitados

## 7.2 Memória e continuidade

- [ ] **Continuidade** — multi-turno mantém coerência
- [ ] **Contexto** — `session_context` round-trip cliente ↔ API
- [ ] **Winner** — `lastBestProduct` preservado quando aplicável
- [ ] **Runner-up** — `lastRankingSnapshot` preservado quando aplicável
- [ ] **Âncora comercial** — follow-ups usam produto/sessão corretos

## 7.3 Resolução e decisão

- [ ] **Product Resolution** — produto específico resolvido
- [ ] **Alias** — variações coloquiais mapeadas
- [ ] **Comparação** — fluxo comparativo completo
- [ ] **Clarificação** — ambiguidade → pergunta antes de decidir
- [ ] **Contestação** — defesa pós-decisão com facts
- [ ] **Comercial** — cards, preços, runtime comercial intactos

## 7.4 Qualidade de saída

- [ ] **Humanização** — tom humano, não robótico
- [ ] **Narrativa** — consultor especialista, não review genérico
- [ ] **Especialista** — persuasão contextual, não clichê AI
- [ ] **Encerramento** — closing natural quando apropriado
- [ ] **Anti-spec-dump** — sem dump técnico não solicitado

## 7.5 Itens críticos adicionais

- [ ] **Runtime paths** — nenhum path não governado novo
- [ ] **Perímetro** — proxy, CORS, rate limit intactos
- [ ] **Analytics** — eventos allowlist inalterados semanticamente
- [ ] **Data Layer** — sem regressão P0 smoke (7/7)
- [ ] **Cognitive Router** — permanece shadow (não decisório)
- [ ] **LLM boundary** — winner/tradeoffs não movidos para prompt
- [ ] **MVP P0 suites** — runner 12.4 P0 verde
- [ ] **Produção 10/15 turnos** — fluxos RC mantidos

---

# 8. Critérios Oficiais de Aprovação dos Patches

## 8.1 Fluxo obrigatório (gate sequencial)

Nenhum patch avança sem **aprovação completa** do estágio anterior:

```text
Implementação
    ↓
Auditoria (escopo + arquitetura — checklist §10)
    ↓
Testes Unitários (suites do domínio do patch)
    ↓
Integração (cadeia handler + módulos afetados)
    ↓
Endpoint Local (POST /api/mia-chat com dev server)
    ↓
Smoke Test (seção 6 do patch correspondente)
    ↓
Regressão (checklist §7 + P0 runner 12.4)
    ↓
Deploy (staging ou produção conforme política RC)
    ↓
Validação em Produção (runner 12.6 ou equivalente conversacional)
    ↓
Conversa Real pela Interface da MIA (matriz §3 — casos do patch)
    ↓
Aprovação Final (sign-off documentado)
```

## 8.2 Critérios de rejeição automática

| Condição | Resultado |
|----------|-----------|
| Qualquer item 🔒 CONV-OK-* regrediu | **Rejeitado** |
| P0 suite falhou | **Rejeitado** |
| Checklist §10 com violação arquitetural | **Rejeitado** |
| Cognitive Router promovido a decisor | **Rejeitado** |
| LLM passou a decidir winner/tradeoff | **Rejeitado** |
| Novo path de resposta não registrado em Runtime Precedence | **Rejeitado** |
| Problema CONV-P-* alvo do patch não resolvido | **Rejeitado** |

## 8.3 Evidência mínima por patch

| Artefato | Conteúdo |
|----------|----------|
| Relatório de auditoria | Escopo, arquivos, checklist §10 |
| Log de testes | Suites + contagem pass/fail |
| Evidência smoke | Trace tags dos cenários §6 |
| Matriz manual | IDs M-* re-testados com status novo |
| Diff problemas | CONV-P-* resolvidos vs remanescentes |

---

# 9. Critérios para Encerramento da Fase 3

A **Conv-Phase 3** só pode ser declarada concluída quando **todos** os requisitos abaixo forem atendidos.

## 9.1 Requisitos funcionais

| # | Requisito |
|---|-----------|
| R1 | PATCH 3.1 → 3.5 implementados e aprovados pelo fluxo §8 |
| R2 | **100%** dos problemas P0/P1 (`CONV-P-A*`, `B*`, `C*`) resolvidos ou explicitamente reclassificados com aceite |
| R3 | **≥90%** dos problemas P2 (`D*`, `E*`) resolvidos |
| R4 | Matriz §3 re-executada — todos os casos M-* em ✅ ou ⚠️ aceito documentado |
| R5 | Nenhum CONV-OK-* 🔒 regrediu |

## 9.2 Requisitos de validação

| # | Evidência exigida |
|---|-------------------|
| E1 | PATCH 3.6 — regressão completa: runner 12.4 P0 **verde** (3 passes se política RC) |
| E2 | PATCH 3.6 — checklist §7 **100%** marcado |
| E3 | PATCH 3.6 — produção: fluxos 10 + 15 turnos **pass** |
| E4 | PATCH 3.7 — checklist §10 **100%** sem violação |
| E5 | Conversas reais: **≥20** sessões manuais documentadas pós-3.5 |
| E6 | Documento de evidência JSON/MD por patch (padrão projeto) |

## 9.3 Requisitos arquiteturais

| # | Requisito |
|---|-----------|
| A1 | Pipeline cognitivo único preservado |
| A2 | Cognitive Router permanece shadow OU promoção explícita aprovada em roadmap separado (fora Conv-Phase 3) |
| A3 | Nenhuma inteligência duplicada introduzida |
| A4 | Documentação atualizada refletindo comportamento pós-correção |

## 9.4 Entregáveis finais

- Relatório PATCH 3.7 — Auditoria Final Conv-Phase 3
- Baseline **pós-Fase 3** (novo documento ou revisão deste com status atualizado)
- Matriz §3 com coluna "observado pós-Fase 3"

---

# 10. Checklist Arquitetural Permanente

Consultar **antes de merge, após implementação e na auditoria 3.7**.

## 10.1 Princípios mestres

- [ ] Continua existindo **apenas um pipeline cognitivo**?
- [ ] **Algum cérebro paralelo** foi criado ou promovido (Router, CSO, LLM side-channel)?
- [ ] **Alguma decisão foi movida para o LLM** (winner, tradeoff, ranking, prioridade)?
- [ ] **Alguma inteligência foi duplicada** (segunda classificação autoritativa)?
- [ ] **Alguma decisão concorrente** (dois módulos decidem o mesmo turno)?

## 10.2 Fronteiras de camada

- [ ] **Alguma responsabilidade mudou de camada** sem atualização dos documentos mestres?
- [ ] Product Resolution continua antes do Decision Engine para facts?
- [ ] Verbalizer continua recebendo facts, não inventando reasoning?
- [ ] Runtime Precedence continua governando todos os response paths?

## 10.3 Conformidade e regressão

- [ ] **Alguma regra dos documentos mestres foi violada?**
- [ ] **Algum patch introduziu regressão** em comportamento CONV-OK-*?
- [ ] Refatoração arquitetural desnecessária foi evitada?
- [ ] Correção atacou **causa raiz** (não sintoma downstream)?

## 10.4 Observabilidade

- [ ] Novos paths têm trace/registro em Runtime Precedence?
- [ ] Tags de auditoria (`interactionMode`, `commercialPermission`, `responsePath`) ainda emitidas?
- [ ] Analytics allowlist inalterada ou versionada corretamente?

---

# Apêndice A — Referências cruzadas

| Artefato | Caminho |
|----------|---------|
| MVP Architecture Audit | `docs/architecture/MVP_ARCHITECTURE_AUDIT_REPORT.md` |
| Request Lifecycle | `docs/architecture/REQUEST_LIFECYCLE.md` |
| Known Limitations | `docs/architecture/KNOWN_LIMITATIONS.md` |
| MVP Production Validation | `docs/MVP_PRODUCTION_VALIDATION.md` |
| Full MVP Regression Runner | `scripts/test-mia-patch-124-full-mvp-regression-runner.js` |
| Documentos mestres | `docs/documentos master mestres pra dar contexto/` |

## Apêndice B — Mapeamento problema → patch

| Patch | IDs alvo |
|-------|----------|
| 3.1 | CONV-P-A01 → A07 |
| 3.2 | CONV-P-B01 → B08 |
| 3.3 | CONV-P-C01 → C05 |
| 3.4 | CONV-P-D01 → D06 |
| 3.5 | CONV-P-E01 → E04 |

## Apêndice C — Baselines numéricas congeladas (MVP)

| Baseline | Valor | Referência |
|----------|-------|------------|
| Unit tests P0 | 888/888 × 3 | PATCH 12.2 |
| Integration P0 | 896/896 × 3 | PATCH 12.3 |
| Full regression P0 | 1309/1309 × 3 | PATCH 12.4 |
| Production API | 64/72 (0 P0/P1) | PATCH 12.6 |
| Browser UI | 196/196 | PATCH 12.6 |
| Data Layer smoke | 7/7 | PATCH 12.2 |

---

*Baseline Conversacional Oficial — PATCH 2.6 · Congelado em 2026-07-25 · Pré Conv-Phase 3*
