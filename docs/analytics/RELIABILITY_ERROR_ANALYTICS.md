# Error Reliability Analytics — PATCH 7.2

**Fase:** 7 — Reliability Analytics  
**Patch:** 7.2 — Error Analytics  
**Versão do evento:** `7.2.0`  
**Status:** 🟡 EM ANDAMENTO

---

## 1. Pergunta respondida

> **Quais erros acontecem na MIA, onde acontecem, com que frequência, qual sua severidade e se o sistema consegue se recuperar?**

Distinto de PATCH 7.1 (`mia_response_outcome` = resultado final) e PATCH 6.4 (efetividade Data Layer).

---

## 2. Auditoria pré-implementação (Etapa 1)

### Infraestrutura existente

| Componente | Caminho | Papel |
|------------|---------|-------|
| Observability wrapper | `lib/miaObservability.js` | `withMiaObservability`, `logObservedError` (stdout PATCH 12E) |
| Reason codes | Runtime comercial, providers, auth, perimeter | Espalhados — catálogo centralizado em `lib/miaErrorReasonCodeCatalog.js` |
| Response outcomes | PATCH 7.1 `mia_response_outcome` | Correlação via `request_id` |
| Provider accounting | `lib/miaRuntimeEnforcement.js` | `providerAccounting`, `costGuardDecisions` |
| HTTP errors chat | `pages/api/chat-gpt4o.js` | 400 empty query, 500 catch (401/405 pré-ALS — limitação) |

### Caminhos de erro mapeados (chat core)

| Caminho | HTTP | reasonCode | Camada |
|---------|------|------------|--------|
| Empty query | 400 | `chat_empty_query` | HTTP / validação |
| Internal catch | 500 | `chat_internal_error` | RESPONSE_BUILDER |
| Image ID failed | 200→ERROR outcome | `image_identification_failed` | ROUTER |
| Provider unavailable | 200→ERROR outcome | `provider_unavailable` | PROVIDER |
| Unknown response path | 200 recovered | `unknown_response_path` | CONTRACTS |
| Provider blocks (accounting) | 200 recovered | vários | PROVIDER |
| Cost guard blocks | 200 recovered | `budget_exhausted`, etc. | PROVIDER |

### Delta vs PATCH 7.1

| 7.1 | 7.2 |
|-----|-----|
| Outcome final (`SUCCESS`, `FALLBACK`, …) | Erro técnico (`error_type`, `error_layer`, `severity`) |
| 1 evento por resposta HTTP | 0..N eventos por request (deduplicados) |
| Inclui respostas sem erro | Exclui `NO_RESULT` comercial sem falha técnica |

---

## 3. Definições formais (Etapa 2)

| Conceito | Definição |
|----------|-----------|
| **Erro técnico** | Falha em camada, integração, serviço ou contrato |
| **Falha recuperada** | Erro ocorreu; resposta utilizável entregue (`recovered: true`) |
| **Falha não recuperada** | Erro impediu resposta válida ou HTTP ≥500 |
| **Resultado sem produto** | `NO_RESULT` 7.1 — **não** é erro automático |
| **Fallback** | Só gera `mia_error_event` se houve falha técnica real (provider/guard) |
| **Erro do usuário** | Validação/auth — `INFO`, separado de `INTERNAL_ERROR` |

---

## 4. Taxonomias (Etapas 3–5)

### error_type (estável — adicionar, nunca renomear)

`VALIDATION_ERROR` · `AUTHENTICATION_ERROR` · `AUTHORIZATION_ERROR` · `RATE_LIMIT_ERROR` · `DATA_LAYER_ERROR` · `DECISION_ENGINE_ERROR` · `ROUTER_ERROR` · `CONTRACT_ERROR` · `PROVIDER_ERROR` · `DATABASE_ERROR` · `TIMEOUT_ERROR` · `NETWORK_ERROR` · `PERSISTENCE_ERROR` · `INTERNAL_ERROR` · `UNKNOWN_ERROR`

### error_layer

`HTTP` · `AUTH` · `ROUTER` · `DATA_LAYER` · `DECISION_ENGINE` · `CONTRACTS` · `RESPONSE_BUILDER` · `PROVIDER` · `DATABASE` · `ANALYTICS` · `UNKNOWN`

### severity

| Nível | Critério |
|-------|----------|
| `INFO` | Entrada inválida esperada, auth perimeter |
| `WARNING` | Falha recuperada (fallback/degradação) |
| `ERROR` | Resposta degradada ou provider fail não recuperado |
| `CRITICAL` | HTTP 500, indisponibilidade sistêmica |

---

## 5. Recuperação (Etapa 6)

| Campo | Valores |
|-------|---------|
| `recovered` | `true` \| `false` |
| `recovery_method` | `fallback` · `retry` · `graceful_degradation` · `cached_result` · `alternate_provider` · `none` |
| `fallback_used` | boolean |
| `response_delivered` | boolean |
| `response_outcome` | outcome PATCH 7.1 quando disponível |

---

## 6. Evento `mia_error_event` (Etapa 8)

| Campo | Valor |
|-------|-------|
| `event_name` | `mia_error_event` |
| `category` | `reliability_error` · `reliability_error_test` |
| `metadata.event_version` | `7.2.0` |
| Writer | `scheduleErrorAnalytics()` · `scheduleRuntimeRecoveredErrorAnalytics()` |
| Hook | `instrumentErrorAnalyticsForDelivery()` em `chat-gpt4o.js` |

**Não persiste:** stack trace, tokens, API keys, prompts/respostas completas.

---

## 7. Deduplicação (Etapa 9)

Chave: `request_id | error_layer | reason_code`

- Evita re-emissão do mesmo erro lógico na mesma requisição
- Erros independentes (camadas/reason codes distintos) **não** são suprimidos
- Bucket request-scoped: `sharedState.errorAnalytics.emittedKeys`

---

## 8. Métricas (Etapa 10)

Denominadores:

| Métrica | Denominador |
|---------|-------------|
| Taxas sobre eventos | `eventos_erro` (`total_error_events`) |
| `error_request_rate` | `requisicoes_instrumentadas_7_1` (distinct `request_id` em `mia_response_outcome`) |
| Dimensões Q2 | subtotal por tipo/camada/reason |

SQL: [analytics-reliability-error.sql](./analytics-reliability-error.sql)

---

## 9. Dashboards (4 queries)

| Query | Split |
|-------|-------|
| Q1 Error overview | `patch-72-query1-error-overview.sql` |
| Q2 Type/layer/reason | `patch-72-query2-error-dimensions.sql` |
| Q3 Recovery + 7.1 correlation | `patch-72-query3-recovery-correlation.sql` |
| Q4 Evolution/gaps | `patch-72-query4-evolution-gaps-panel.sql` |

---

## 10. Limitações

1. **401/405** — fora de `runWithSharedRequestState` (não instrumentados)
2. **Erros só stdout (12E)** — permanecem em logs; 7.2 persiste subset mapeado
3. **`UNKNOWN_ERROR`** — reservado para codes não catalogados
4. Deploy necessário para eventos reais em produção

---

## 11. Referências

- [PATCH_7.2_ERROR_ANALYTICS.md](./PATCH_7.2_ERROR_ANALYTICS.md)
- [RELIABILITY_RESPONSE_ANALYTICS.md](./RELIABILITY_RESPONSE_ANALYTICS.md) (7.1)
- [contracts/EVENT_CONTRACT.md](./contracts/EVENT_CONTRACT.md) §7.8
- Runtime: `lib/miaErrorReasonCodeCatalog.js` · `lib/miaErrorClassifier.js` · `lib/miaErrorAnalytics.js`
