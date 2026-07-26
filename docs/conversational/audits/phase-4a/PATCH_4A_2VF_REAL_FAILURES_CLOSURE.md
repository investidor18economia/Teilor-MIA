# PATCH 4A.2VF — Real Failures Closure

**Date:** 2026-07-26  
**Validator:** Composer (automated audits + Playwright UI + API)  
**Scope:** Correção cirúrgica das 3 falhas funcionais bloqueando o fechamento do PATCH 4A.2V

---

## 1. Contexto

O PATCH 4A.2V validou 4A.1 / 4A.1F / 4A.2 em produção com **9/12** cenários na interface real. Três falhas pré-existentes permaneceram:

| ID | Entrada | Comportamento incorreto |
|----|---------|-------------------------|
| A | `bateria é minha prioridade` | Gate de clarificação de produto |
| B | `o Galaxy A55 vale a pena?` | Product lock não ancorava Galaxy A55 |
| C | `mas eu achei o S23 FE melhor` | Acknowledgement de melhora pessoal |

Este PATCH corrige exclusivamente essas três famílias semânticas.

---

## 2. Reprodução (estado pré-correção)

### Falha A
- Intent: `commerce` / `PRIORITY_SHIFT` ✓
- Pipeline: `extractCommercialRefinement` → `detected: false`; `classifyCommercialFollowUpType` → `none`
- Resultado: ack genérico ou clarificação indevida

### Falha B
- Intent: `specific_product_evaluation_query` ✓
- Pipeline: `isContextDecision("vale a pena")` → `contextAction=decision` → skip search com produtos da sessão (iPhone)
- Lock: `extractProductMentionFromQuery` em query concatenada → `"celular até 2.500. o Galaxy A55"` → `isGenericProductSearchQuery=true` → lock inativo
- Resultado: iPhone 13 ou erro de histórico vazio

### Falha C
- `extractContentAnchors`: `\bmelhor\b` em `"achei...melhor"` → anchor `"melhora"`
- Social path vence contestação comercial
- Resultado: `"Bom saber que melhorou um pouco."`

---

## 3. Causa raiz

| Falha | Causa raiz | Módulos |
|-------|------------|---------|
| A | Padrões de prioridade declarative incompletos; follow-up não classificado como `CONSTRAINT_REFINEMENT` | `miaCommercialConstraintRefinement.js`, `miaCommercialFollowUpContinuity.js`, `miaCognitiveRouter.js` |
| B | `isContextDecision` capturava `"vale a pena"`; lock usava menção concatenada genérica; busca Data Layer não priorizava produto citado | `chat-gpt4o.js`, `miaSpecificProductResolutionLock.js`, `miaProductIdentityResolution.js`, `miaCommercialNewSearchResetGuard.js` |
| C | Anchor lexical `"melhor"` → wellbeing; contestação comercial abaixo de social | `miaSocialResponsePerception.js`, `miaCognitiveRouter.js`, `miaIntentRecognitionLayer.js` |

---

## 4. Correções (generalizáveis)

1. **Prioridade declarative** — famílias `"X é minha prioridade"`, `"minha prioridade é X"`, `"pra mim X primeiro"`, aversões e comparações entre critérios → `CONSTRAINT_REFINEMENT` / `PRIORITY_SHIFT`.
2. **Product evaluation anchor** — `resolveSpecificProductEvaluationAnchorQuery()` isola modelo canônico; `isContextDecision` exclui avaliação de produto específico; busca e lock usam anchor; `pickCommercialPresentationProduct` alinha por identidade de produto.
3. **Contestation vs wellbeing** — `"melhor"` só vira wellbeing com sinais pessoais; contestação exige produto + comparação + contexto comercial; precedência comercial antes de social.

Sem hardcode de A55, S23 FE ou frases exatas.

---

## 5. Testes

| Suite | Resultado |
|-------|-----------|
| `test:mia:conv:patch-4a2vf:real-intent-product-lock-audit` | **60/60** |
| `patch-41a:semantic-decision-contract-audit` | **30/30** |
| `patch-42:structured-decision-facts-audit` | **30/30** |
| `patch-35a:decision-facts-narrative-audit` | **15/15** |
| `patch-35b:verbalizer-humanization-audit` | **30/30** |
| First Answer contract | **20/20** |
| Commercial new search reset guard | **22/22** |
| `npm run build` | **PASS** |

---

## 6. Validação local

**API (`patch-4a2vf-local-api-debug.mjs`):**
- S2 prioridade: refinamento de bateria ✓
- S4 contextual: Galaxy A55 5G ✓
- S4 standalone: Galaxy A55 5G ✓

**Interface (`patch-4a2v-browser-validation.mjs` @ localhost:3001):** **12/12**

Evidência: `evidence/PATCH_4A_2VF_BROWSER_EVIDENCE.json`

---

## 7. Arquivos alterados

- `lib/miaProductIdentityResolution.js`
- `lib/miaSpecificProductResolutionLock.js`
- `lib/miaCommercialNewSearchResetGuard.js`
- `lib/miaCommercialConstraintRefinement.js`
- `lib/miaCommercialFollowUpContinuity.js`
- `lib/miaCommercialNewSearchResetGuard.js`
- `lib/miaCognitiveRouter.js`
- `lib/miaIntentRecognitionLayer.js`
- `lib/miaClarificationGates.js`
- `lib/miaSocialResponsePerception.js`
- `pages/api/chat-gpt4o.js`
- `scripts/test-mia-patch-4a2vf-real-intent-and-product-lock-audit.js`
- `scripts/patch-4a2vf-local-api-debug.mjs`
- `package.json`

---

## 8. Deploy e produção

| Campo | Valor |
|-------|-------|
| Commit | `b0908f0b993a` |
| Push | `master` → `origin/master` |
| Build publicado (`/api/health`) | `b0908f0b993a` |
| Browser produção | **12/12** |
| API produção (`patch-4a2v-production-validation.mjs`) | **12/12** |

Evidências:
- `evidence/PATCH_4A_2VF_BROWSER_EVIDENCE.json` (local)
- `evidence/PATCH_4A_2VF_PRODUCTION_EVIDENCE.json` (produção)

---

## 9. Veredito

**APROVADA**

---

## 10. Estado oficial dos PATCHS 4A

Após aprovação completa:

- PATCH 4A.1 — APROVADO OFICIALMENTE
- PATCH 4A.1F — APROVADO OFICIALMENTE
- PATCH 4A.2 — APROVADO OFICIALMENTE
- PATCH 4A.2V — APROVADO OFICIALMENTE
- PATCH 4A.2VF — APROVADO OFICIALMENTE

**Prontidão PATCH 4A.3:** PRONTA
