# PATCH 8.1 — Commercial Search Analytics

**Data:** 2026-07-23  
**Status:** 🟢 **PATCH 8.1 — APROVADO**  
**Commit:** `e6b5eb1` · **Deploy:** `e6b5eb123da6` · **Produção:** https://economia-ai.vercel.app

---

## 1. Objetivo

Observabilidade server-side da etapa de **busca comercial** — hub correlacionável por `request_id` para PATCH 8.2/8.3.

---

## 2. Auditoria pré-implementação

| Ponto | Decisão |
|-------|---------|
| Início tracker | Após Commercial Entry Gate quando domínio comercial/mixed |
| Finalização | `sendHttpRuntimeResponse` (junto 7.1/7.2/7.3) |
| Dedup | `request_id \| mia_commercial_search \| 8.1.0` |
| Atualização pipeline | Pós-ranking e follow-up prioritário |

---

## 3. Git e deploy

| Item | Valor |
|------|-------|
| Branch publicada | `master` + `patch-81-commercial-search-analytics` |
| Commit | `e6b5eb1` |
| Push | `master` → `origin/master` (aprovado) |
| Vercel build | `e6b5eb123da6` |
| `/api/health` | 200 |

---

## 4. Validação produção

### Smoke (`patch-81-production-smoke.mjs`)

**10/10** checks · evidência inicial

### SQL (`patch-81-production-validation.mjs`)

**27/27** checks · Q1–Q5 executados

### Cenários A–F (`patch-81-production-full-scenarios.mjs`)

Via `POST /api/mia-chat` (fluxo oficial da UI)

| Cenário | Resultado | Observação |
|---------|-----------|------------|
| **A** Comercial simples | ✅ EXECUTED · DATA_LAYER_ONLY · 12 results | Correlação 6.4/7.1/7.3 |
| **B** Mixed intent | ✅ MIXED · EXTRACTION · NOT_EXECUTED | Fallback antes da busca — observação correta |
| **C** Data Layer | ✅ NOT_EXECUTED · normalização `preço` | `context_decision_no_search` |
| **D** Provider | ✅ EXECUTED · DL only | `provider_continuation_required=false` — DL resolveu |
| **E** Social puro | ✅ Sem `mia_commercial_search` | `greeting_flow` |
| **F** No results | ⚠️ Roteado social | Sem evento comercial — domínio não confirmado |

Evidência completa: [PATCH_8.1_PRODUCTION_EVIDENCE.json](./PATCH_8.1_PRODUCTION_EVIDENCE.json)

---

## 5. Eventos persistidos (amostra)

| request_id (prefixo) | intent | execution | path | results |
|----------------------|--------|-----------|------|---------|
| `3bbe8bdc` | COMMERCIAL | EXECUTED | DATA_LAYER_ONLY | 12 |
| `9ee8c779` | MIXED | NOT_EXECUTED | NO_SEARCH | 0 |
| `af98e4ea` | COMMERCIAL | NOT_EXECUTED | NO_SEARCH | 0 |
| `0d52d963` | COMMERCIAL | EXECUTED | DATA_LAYER_ONLY | 12 |

- `event_version`: **8.1.0** em todos
- Dedup: **1 evento / request_id**
- Sem campos de provider ou ofertas no metadata

---

## 6. Regressões pós-deploy

| Suite | Resultado |
|-------|-----------|
| PATCH 8.1 | **60/60** |
| PATCH 6.4 | **71/71** |
| PATCH 7.1–7.4 | **239/239** |
| **Total** | **370/370** |

---

## 7. Overhead

| Operação | Impacto |
|----------|---------|
| Tracker init/update | O(1) · request-scoped ALS |
| Sanitização query | Regex + truncate 280 chars |
| Finalize + INSERT | Fire-and-forget pós-response |
| Caminho síncrono | Sem `await` bloqueante |

**Impacto material na UX:** nenhum observado (HTTP 200 em todos cenários).

---

## 8. Limitações (não bloqueantes)

- Amostra produção pequena (6 eventos na sessão de validação)
- `runtime_mode=CONTROLLED` em produção
- Cenário D: DL resolveu — `provider_continuation_required` não acionado (correto)
- Cenário F: roteamento social — sem evento comercial
- Search success ≠ response success (ex.: A=RESULTS_FOUND, outcome=PARTIAL_SUCCESS)
- Percentis SQL: `amostra_analisavel=false` até n≥20

---

## 9. Veredito

🟢 **PATCH 8.1 — APROVADO**

PATCH 8.2 **não iniciado**.

---

## 10. Comandos de revalidação

```bash
npm run test:mia:analytics:patch-81:commercial-search-analytics
npm run test:mia:analytics:patch-81:prod-smoke
npm run test:mia:analytics:patch-81:prod-validation
node scripts/patch-81-production-full-scenarios.mjs
```
