# PATCH 4A.8 — Contextual Priority Engine Closure

**Date:** 2026-07-27  
**Version:** `4A.8.0`  
**Engine:** `lib/miaContextualPriorityEngine.js`

---

## 1. Veredito

**APROVADA (LOCAL)** — Priority Engine determinístico implementado, integrado ao pipeline de síntese contextual, persistência em sessão validada (7/7 cenários LOCAL). Produção pendente de push/deploy.

---

## 2. Objetivo

Adaptar a **priorização de critérios de decisão** (não o ranking de produtos) com base em:

- intenção;
- perfil rastreável;
- categoria;
- contexto conversacional.

A LLM continua apenas verbalizando. Nenhum peso é inferido pelo modelo.

---

## 3. Arquitetura implementada

```text
Decision Facts / StructuredDecisionFacts
        ↓
Context Understanding (querySignals, session, priorityWeightsModel)
        ↓
Priority Engine (buildContextualPriorityModel)
        ↓
applyContextualPriorityToStructuredFacts (reordena gains)
        ↓
Practical Consequence Engine (4A.7)
        ↓
Confidence / NarrativePlan / VerbalizationPlan
        ↓
Composition Guard → LLM
```

---

## 4. Priority Engine

| Responsabilidade | Implementação |
|------------------|---------------|
| Interpretar intenção | Famílias semânticas + `querySignals` + `buildUserPriorityWeightingModel` |
| Interpretar perfil | `personalDecisionAdaptationModel` somente se `isPersonalAdaptationTraceable` e contexto explícito |
| Categoria | `CATEGORY_CRITERIA` (`mobile`, `notebook`, `default`) |
| Contexto conversacional | `lastPriority`, `lastPreviousPriority`, session shift |
| Calcular pesos | `baseWeight` + `contextWeight` → `finalWeight` normalizado |
| Justificar pesos | `reason`, `origin`, `evidenceUsed`, `confidence` |
| Nunca gerar texto | Engine retorna apenas modelo estruturado |

---

## 5. Modelo de pesos

Cada critério possui:

```text
criterion → baseWeight → contextWeight → finalWeight → reason → confidence → origin → evidenceUsed
```

Origens: `default`, `explicit_user`, `session_shift`, `priority_class`, `primary_axis`, `profile`, `query_signal`.

---

## 6. Governança

- Personalização explícita vs. fallback conservador (`conservativeFallback`, `limitation`).
- Perfil nunca aplicado sem contexto explícito do usuário.
- Intenção bloqueada (`lockedIntentionCriterion`) prevalece sobre perfil inferido.
- Ranking/winner **nunca** manipulados — apenas reordenação de `SemanticDecisionUnits` (gains).

---

## 7. Integração

| Arquivo | Papel |
|---------|-------|
| `lib/miaContextualPriorityEngine.js` | Engine principal + `attachContextualPriorityToSession` |
| `lib/miaContextualDecisionSynthesis.js` | Orquestra priority antes do NarrativePlan |
| `pages/api/chat-gpt4o.js` | Persiste `lastContextualPriorityModel`; fix `specialistExplanation` scope |
| `lib/miaExplicitRecommendationChangeProtocol.js` | Priority em mudanças explícitas de recomendação |
| `lib/miaSessionContextTransport.js` | Campo `lastContextualPriorityModel` |
| `lib/miaSemanticVerbalizer.js` | Perfil de verbalização usa `dominantCriterion` (apresentação) |

---

## 8. Regressões

| Suite | Resultado |
|-------|-----------|
| PATCH 4A.3 (43) | 21/21 |
| PATCH 4A.4 (44) | 36/36 |
| PATCH 4A.5 (45) | 26/26 |
| PATCH 4A.6 (46) | 50/50 |
| PATCH 4A.7 (47) | 32/32 |
| PATCH 4A.8 (48) | 26/26 |
| Build | OK |

---

## 9. Validação conversacional LOCAL

| Cenário | Resultado |
|---------|-----------|
| p1-gamer | PASS |
| p2-photographer | PASS |
| p3-student | PASS |
| p4-basic-use | PASS |
| p5-priority-shift | PASS |
| n1-no-priority | PASS |
| n2-conflict | PASS |

Evidência: `docs/conversational/audits/phase-4a/evidence/PATCH_4A_8_LOCAL_PRIORITY_EVIDENCE.json`

---

## 10. Correções neste PATCH (Classe A)

1. **`specialistExplanation is not defined`** — regressão em `return_seguro` corrigida (hoist de variável).
2. **Priority model ausente em constraint refinement early return** — `attachContextualPriorityToSession` no write-path.
3. **Priority model sobrescrito com `null`** — fallback determinístico em `return_seguro`.
4. **Fotografia não dominava critério** — família semântica + bloqueio de perfil conflitante.
5. **Fallback conservador incorreto** — `personalized` apenas com origens explícitas rastreáveis.

---

## 11. Classificação B (próximos PATCHs)

- Painel interno de depuração visual dos pesos (dados já rastreáveis via `contextualPriorityTrace`).
- Expansão de critérios para categorias além de mobile/notebook no Data Layer.
- Re-síntese completa de StructuredDecisionFacts em todos os follow-ups contextuais (hoje parcialmente coberto).

---

## 12. Classificação C (fora do roadmap)

- Alterar ranking comercial ou winner por perfil inferido.
- Prompts LLM para inferir prioridades do usuário.
