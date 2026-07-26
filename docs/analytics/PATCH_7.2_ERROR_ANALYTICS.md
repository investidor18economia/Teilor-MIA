# PATCH 7.2 — Error Reliability Analytics

**Data:** 2026-07-23  
**Status:** 🟢 **PATCH 7.2 — APROVADO**  
**Commit:** `c541010`  
**Deploy:** Vercel `https://economia-ai.vercel.app` · build `c541010c8ef4` · `/api/health` 200  
**Supabase:** projeto linkado `xzijmzqsquasrtnkotrw` (produção)

---

## Entregas

| Artefato | Status |
|----------|--------|
| Auditoria runtime | ✅ [RELIABILITY_ERROR_ANALYTICS.md](./RELIABILITY_ERROR_ANALYTICS.md) |
| `lib/miaErrorReasonCodeCatalog.js` | ✅ |
| `lib/miaErrorClassifier.js` | ✅ |
| `lib/miaErrorAnalytics.js` | ✅ |
| Hooks `chat-gpt4o.js` | ✅ |
| SQL Q1–Q4 + splits | ✅ |
| Testes unitários | ✅ **53/53** |
| Prod validation | ✅ **24/24** (pós-eventos) |
| Prod smoke | ✅ `scripts/patch-72-production-smoke.mjs` |
| Deploy produção | ✅ |
| Eventos reais | ✅ **2** `mia_error_event` |

---

## Auditoria pré-teste (sem alteração de código)

| Critério | Resultado |
|----------|-----------|
| Evento `mia_error_event` | ✅ |
| `event_version: 7.2.0` | ✅ confirmado em produção |
| Deduplicação `request_id \| error_layer \| reason_code` | ✅ 2 requisições distintas → 2 eventos; mesma chave não duplicou |
| Persistência fire-and-forget | ✅ latência ~14s observada; aguardar ≥15s antes de consulta |
| Falha Analytics não derruba endpoint | ✅ HTTP 400/200 entregues normalmente |
| Sem dados sensíveis | ✅ sem stack, secrets ou PII nos `metadata` |
| PATCH 7.1 preservado | ✅ regressão **67/67** |
| PATCH 6.4 preservado | ✅ regressão **71/71** |

---

## Testes automatizados

| Comando | Resultado |
|---------|-----------|
| `npm run test:mia:analytics:patch-72:error-analytics` | **53/53** |
| `npm run test:mia:analytics:patch-72:prod-validation` (pré) | **25/25** · 0 eventos (esperado) |
| `npm run test:mia:analytics:patch-72:prod-validation` (pós) | **24/24** · **2 eventos** |
| `npm run test:mia:analytics:patch-71:response-analytics` | **67/67** |
| `npm run test:mia:analytics:patch-64:data-layer-usage-analytics` | **71/71** |

---

## Eventos reais de produção (seguros)

Evidência sanitizada: [PATCH_7.2_PRODUCTION_EVIDENCE.json](./PATCH_7.2_PRODUCTION_EVIDENCE.json)

| Cenário | Método | HTTP | `reason_code` | Evento | Correlação 7.1 |
|---------|--------|------|---------------|--------|----------------|
| **E1** empty query via `/api/mia-chat` | POST `{ text: "" }` | 400 | `chat_empty_query` | ✅ | `mia_response_outcome` = **ERROR** (mesmo `request_id`) |
| **E2** empty query via `/api/chat-gpt4o` (API key) | POST `{ text: "" }` | 400 | `chat_empty_query` | ✅ | — |
| **B** GET `/api/chat-gpt4o` | GET | 405 | — | ❌ (esperado) | fora do ALS · não é falha do patch |
| **C1** comercial normal | POST | 200 | — | ✅ sem erro indevido | `PARTIAL_SUCCESS` |
| **C2** social normal | POST | 200 | — | ✅ sem erro indevido | `SUCCESS` |

**Taxonomia observada (ambos os eventos):**

- `error_type`: `VALIDATION_ERROR`
- `error_layer`: `HTTP`
- `reason_code`: `chat_empty_query`
- `severity`: `INFO`
- `recovered`: `true`
- `recovery_method`: `none`
- `response_delivered`: `true`
- `response_outcome`: `ERROR`
- `endpoint`: `/api/chat-gpt4o`
- `http_status`: `400`

**Cenário C (erro técnico recuperado de provider):** não exercitado nesta rodada — requer tráfego comercial com falha de provider real ou bloqueio conhecido. Instrumentação existe via `scheduleRuntimeRecoveredErrorAnalytics`; validação futura recomendada quando ocorrer organicamente.

---

## Deduplicação

- Chave documentada: `request_id | error_layer | reason_code`
- E1 e E2: `request_id` distintos → **2 eventos** (correto)
- Mesmo erro lógico na mesma requisição: dedup in-memory via `sharedState.errorAnalytics.emittedKeys` (validado em unit tests)
- Nenhuma duplicação observada em produção

---

## SQL Q1–Q4 (pós-eventos)

### Q1 — Error Overview

| Métrica | Valor | Denominador |
|---------|-------|-------------|
| `total_eventos_mia_error_event` | **2** | eventos_erro |
| `requests_with_error` | **2** | 10 requisições 7.1 |
| `error_request_rate` | **0.2000** | requisições_instrumentadas_7_1 |
| `recovered_error_count` | **2** | eventos_erro |
| `recovered_error_rate` | **1.0000** | eventos_erro |
| `unrecovered_error_count` | **0** | eventos_erro |
| `unknown_error_rate` | **0.0000** | eventos_erro |

### Q2 — Error Type and Layer

- `VALIDATION_ERROR` / `HTTP` / `chat_empty_query` / `/api/chat-gpt4o` / provider `unknown` / severity `INFO` — 100% dos 2 eventos

### Q3 — Recovery Analytics

- `recovery_method`: `none` · `fallback_used`: false · `response_delivered`: true
- Correlação com `mia_response_outcome` = `ERROR` confirmada para E1

### Q4 — Evolution and Gaps

- `event_version` **7.2.0** presente · amostra analisável · sem campos críticos ausentes

---

## Regressões

| Patch | Status |
|-------|--------|
| 7.1 Response Analytics | ✅ intacto · novos `mia_response_outcome` gerados nos testes |
| 6.4 Data Layer Analytics | ✅ intacto |
| Respostas comerciais/sociais | ✅ HTTP 200 · sem `mia_error_event` indevido |
| Analytics não alteram HTTP status/corpo | ✅ |
| Falha INSERT não afeta usuário | ✅ (fire-and-forget) |

---

## Limitações conhecidas

1. **401/405** — handlers pré-ALS; ausência de evento não indica falha do patch
2. **400 no perímetro público** (`invalid_request` em `miaPublicApiHardening`) — fora do core; não emite `mia_error_event`
3. **Erros recuperados de provider** — instrumentados, mas não evidenciados nesta rodada
4. **Fire-and-forget** — aguardar ≥15s antes de consultar Supabase

---

## Comandos

```bash
npm run test:mia:analytics:patch-72:error-analytics
npm run test:mia:analytics:patch-72:prod-validation
npm run test:mia:analytics:patch-72:prod-smoke
npm run test:mia:analytics:patch-71:response-analytics
npm run test:mia:analytics:patch-64:data-layer-usage-analytics
```

---

## Veredito

🟢 **PATCH 7.2 — APROVADO**

- ≥1 evento real seguro em produção (**2** via `chat_empty_query`)
- Taxonomia, deduplicação e SQL Q1–Q4 validados
- Correlação com PATCH 7.1 confirmada
- Regressões 7.1 e 6.4 intactas
- Documentação e evidências atualizadas

**PATCH 7.3 não iniciado.**
