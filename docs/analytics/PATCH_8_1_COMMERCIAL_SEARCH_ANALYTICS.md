# PATCH 8.1 — Commercial Search Analytics

**Data:** 2026-07-23  
**Status:** 🟡 **PATCH 8.1 — EM VALIDAÇÃO DE PRODUÇÃO**  
**Evento:** `mia_commercial_search` · `8.1.0`

---

## 1. Objetivo

Observabilidade server-side da etapa de **busca comercial** — hub correlacionável por `request_id` para PATCH 8.2/8.3.

---

## 2. Auditoria pré-implementação

| Ponto | Decisão |
|-------|---------|
| Início tracker | Após Commercial Entry Gate (`~30443`) quando domínio comercial/mixed |
| Finalização | `sendHttpRuntimeResponse` (junto 7.1/7.2/7.3) |
| Dedup | `request_id \| mia_commercial_search \| 8.1.0` |
| Atualização pipeline | Pós-ranking (`~34329`) e follow-up prioritário |
| Social puro | Sem evento (permission deny) |

---

## 3. Arquivos

| Tipo | Path |
|------|------|
| Catalog | `lib/miaCommercialSearchCatalog.js` |
| Sanitizer | `lib/miaCommercialSearchQuerySanitizer.js` |
| Classifier | `lib/miaCommercialSearchClassifier.js` |
| Tracker | `lib/miaCommercialSearchTracker.js` |
| Analytics | `lib/miaCommercialSearchAnalytics.js` |
| Hook | `pages/api/chat-gpt4o.js` |
| SQL | `docs/analytics/sql/patch-81-query*.sql` |
| Tests | `scripts/test-mia-analytics-patch-81-commercial-search-analytics.js` |

---

## 4. Testes locais

| Suite | Resultado |
|-------|-----------|
| PATCH 8.1 unit | **60/60** |
| PATCH 6.4 regressão | **71/71** |
| PATCH 7.1–7.4 regressão | **239/239** |

---

## 5. Privacidade

- Limite: **280 caracteres**
- Mascaramento PII (email, phone, CPF, URL)
- Sem tokens/headers/conversa completa

---

## 6. Relação com eventos existentes

- **Não duplica** `data_layer_resolution`, 7.x, frontend events
- **Correlaciona** via `request_id`
- **Não inclui** provider attempts (8.2) nem offer detail (8.3)

---

## 7. Produção

Evidências: [PATCH_8.1_PRODUCTION_EVIDENCE.json](./PATCH_8.1_PRODUCTION_EVIDENCE.json) *(após smoke)*

---

## 8. Próximo passo

PATCH 8.2 — Provider Analytics (**não iniciado**)
