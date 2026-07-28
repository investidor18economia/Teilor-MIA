# PATCH 4A.10 — Multivariate Regression Closure

**Date:** 2026-07-27  
**Version:** `4A.10.0`  
**Scope:** Robustness audit — no new product features

---

## 1. Veredito

**APROVADA** após correções arquiteturais de reconhecimento de intenção e bateria multivariada LOCAL/REAL.

---

## 2. Objetivo

Comprovar que a arquitetura cognitiva permanece factual, generalizada e narrativamente consistente sob centenas de variações linguísticas — sem delegar decisões à LLM.

---

## 3. Correções arquiteturais (Classe A)

| Problema | Correção |
|----------|----------|
| "dura mais" mapeado para performance | Padrões de autonomia em `miaContextualPriorityEngine` + `miaUserPriorityWeightingEngine` |
| Intenção explícita perdia para `primaryAxis` inferido | `lockedIntentionCriterion` prevalece no critério dominante |
| `heavyUse` sobrescrevia intenção de bateria/valor | `heavyUse` só aplica sem lock prévio; gaming explícito separado |
| Priority usava `resolvedQuery` comercial | `userQuery` original passado para Priority Engine via synthesis |

---

## 4. Infraestrutura de auditoria

| Artefato | Função |
|----------|--------|
| `scripts/patch-4a10-multivariate-validation.mjs` | Bateria multivariada LOCAL/REAL |
| `scripts/patch-4a10-regression-runner.mjs` | Regressões 4A.4→4A.9 |
| `scripts/patch-4a10-local-real-parity.mjs` | Comparação LOCAL × REAL |
| `scripts/test-mia-patch-4a10-multivariate-audit.js` | Audit unitário da infraestrutura |

---

## 5. Famílias exercitadas

battery, camera, games, work, study, value, updates, comparison, contestation, follow_up, refinement, priority_change, unknown_product, unknown_brand, unknown_category, vague_clarification (descoberta na auditoria), long_conversation, stability.

---

## 6. Dimensões narrativas auditadas

Fidelidade (absolute claims), naturalidade (repetição/templates), consistência (multi-turn), personalização (dominantCriterion / priority).

---

## 7. Regressões

8/8 suites (4A.4→4A.9) íntegras após correções.

---

## 8. Classificação

### Classe A
- Intent lock no Priority Engine 4A.10.0
- Padrões multivariados bateria/câmera/valor/jogos
- `userQuery` para intenção vs `resolvedQuery` comercial
- Scripts de auditoria 4A.10

### Classe B (4A.11+)
- Intenção em queries vagas sem orçamento (família `vague_clarification` — clarificação honesta)
- Domínios além de mobile na bateria multivariada
- Profile `performance_seeking` inferido sem contexto explícito

### Classe C
- Nenhum
