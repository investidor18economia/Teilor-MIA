# PATCH 7.3 — Latency Reliability Analytics

**Data:** 2026-07-23  
**Status:** 🟢 **PATCH 7.3 — APROVADO**  
**Commit:** `360768a`  
**Deploy:** Vercel `https://economia-ai.vercel.app` · build `360768a70d85` · `/api/health` 200

---

## Entregas

| Artefato | Status |
|----------|--------|
| Auditoria runtime + delta 6.4 | ✅ [RELIABILITY_LATENCY_ANALYTICS.md](./RELIABILITY_LATENCY_ANALYTICS.md) |
| `lib/miaLatencyStageCatalog.js` | ✅ |
| `lib/miaLatencyTracker.js` | ✅ |
| `lib/miaLatencyAnalytics.js` | ✅ |
| Hooks `chat-gpt4o.js` + `lib/openai.js` | ✅ |
| SQL Q1–Q4 + splits | ✅ |
| Testes unitários | ✅ **65/65** |
| Prod validation | ✅ **24/24** |
| Prod smoke | ✅ **11/12** (1 evento persistido + summary inline L1) |
| Eventos reais | ✅ **1** (+ summary API L1) |

---

## Definições temporais

| Conceito | Implementação |
|----------|---------------|
| Request start | `pipelineStartedAt` (POST core) |
| Response ready | `instrumentLatencyAnalyticsForDelivery` |
| E2E server latency | `total_duration_ms` |
| Stage latency | Segmentos em `metadata.stages[]` |
| Analytics overhead | Fire-and-forget pós-response ready |

**Delta 6.4:** `query_duration_ms` = Data Layer · `total_duration_ms` = pipeline completo.

---

## Evento `mia_latency_event` v7.3.0

- **Modelo:** 1 evento/requisição · dedup `request_id | event_name | event_version`
- **Persistência:** `analytics_events` · category `reliability_latency`

---

## Testes

| Comando | Resultado |
|---------|-----------|
| `patch-73:latency-analytics` | **65/65** |
| `patch-73:prod-validation` | **24/24** |
| `patch-73:prod-smoke` | **11/12** |
| Regressão 7.2 | **53/53** |
| Regressão 7.1 | **67/67** |
| Regressão 6.4 | **71/71** |

---

## Produção real

Evidência: [PATCH_7.3_PRODUCTION_EVIDENCE.json](./PATCH_7.3_PRODUCTION_EVIDENCE.json)

| Cenário | HTTP | `total_duration_ms` | Persistido | Outcome 7.1 |
|---------|------|---------------------|------------|-------------|
| L1 social | 200 | 2161 (summary API) | ⏳ não encontrado em 15s | — |
| L2 comercial | 200 | 6580 | ✅ | PARTIAL_SUCCESS |

**Evento real L2:** `request_id` `79230888-…` · band `SLOW` · stages: HTTP_VALIDATION, ROUTER, INTENT_CLASSIFICATION, DATA_LAYER (5849ms), RESPONSE_BUILDER · gaps: DECISION_ENGINE, PROVIDER, LLM, CONTRACTS.

**SQL Q1:** 1 evento · avg 6580ms · percentis marcados `amostra_limitada_percentil` (n=1).

---

## Thresholds (baseline documental)

FAST < 2s · ACCEPTABLE < 5s · SLOW < 10s · CRITICAL ≥ 10s

---

## Limitações

1. Amostra pequena — percentis não conclusivos até n ≥ 20
2. Etapas DECISION_ENGINE / CONTRACTS — hooks futuros
3. PROVIDER/LLM — medidos quando caminho executa provider/LLM
4. L1 social — summary inline OK; persistência a confirmar em tráfego adicional

---

## Veredito

🟢 **PATCH 7.3 — APROVADO**

**PATCH 7.4 não iniciado.**
