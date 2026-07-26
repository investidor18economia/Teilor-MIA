# PATCH 4A.5 — Semantic Verbalizer Closure

**Date:** 2026-07-26  
**Version:** `4A.5.0`

---

## 1. Auditoria inicial (classificação A/B/C)

| Achado | Categoria | PATCH responsável |
|--------|-----------|-------------------|
| Consumidores montavam strings legadas sem plano intermediário | **A** | 4A.5 (este PATCH) |
| LLM recebia ordem narrativa sem contrato de variação | **A** | 4A.5 |
| Tradeoffs perdidos quando dedupe em sections colide effectKey | **A** | 4A.5 |
| "sem me preocupar" classificado como reassuring | **A** | 4A.5 |
| Repetição estrutural / frases cristalizadas | **B** | 4A.6 |
| Tradução de specs em consequências práticas | **B** | 4A.7 |
| Personalização por perfil/intenção | **B** | 4A.8 |
| Brand switch / contestação avançada | **B** | 4A.8 / 4A.9 |
| Continuidade "explica/continua" rasa | **B** | 4A.6 |

---

## 2. Arquitetura anterior

```text
NarrativePlan → strings legadas / ordem adapter → LLM
```

## 3. Arquitetura nova

```text
NarrativePlan → miaSemanticVerbalizer → VerbalizationPlan → LLM
```

## 4. Impacto arquitetural esperado

```text
PATCH 4A.5 (VerbalizationPlan + perfis + llmContract)
        ↓ habilita
PATCH 4A.6 (anti-repetição sobre slots já separados)
        ↓ habilita
PATCH 4A.7 (tradução de specs nos supporting/tradeoff slots)
        ↓ habilita
PATCH 4A.8 (personalização por intenção/perfil sobre variationProfile)
```

## 5. Testes

| Suite | Resultado |
|-------|-----------|
| patch-45:semantic-verbalizer-audit | **26/26** |
| patch-44:narrative-planner-audit | **36/36** |
| patch-43:contextual-synthesis-audit | **21/21** |
| patch-42 | **30/30** |
| patch-41a | **30/30** |
| patch-4a2vf | **60/60** |
| patch-35a | **15/15** |
| patch-34b | **18/18** |
| patch-32 | **22/22** |

## 6. Veredito

**APROVADA** — deploy `5e6ad85a5ac2`, produção API 12/12, interface local 12/12, interface real 12/12.

## 7. Deploy e validação

| Etapa | Resultado |
|-------|-----------|
| Commit | `5e6ad85` |
| Build Vercel | `5e6ad85a5ac2` |
| Produção API | **12/12** |
| Interface local | **12/12** |
| Interface real | **12/12** |
| Evidências | `evidence/PATCH_4A_5_SEMANTIC_VERBALIZER_EVIDENCE.json` |
