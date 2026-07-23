# Executive Metrics API — PATCH 11.1

Single Source of Truth for consolidated MIA metrics. **Read-only aggregates** — no individual events, no PII.

## Endpoint

```text
GET /api/executive-metrics
```

Query params:

| Param | Description |
|-------|-------------|
| `days` | Rolling window (1–365, default 30) |
| `fresh=1` | Bypass in-memory cache |

## Response groups

`platform` · `conversation` · `recommendation` · `commerce` · `alerts` · `price_intelligence` · `savings` · `anti_regret` · `user_value` · `system`

## Versioning

- `metrics_version`: `11.1.0` (API contract)
- Event versions (10.1.0, etc.) filtered inside SQL RPCs

## Cache

- **Type:** in-memory TTL (default 300s)
- **Env:** `MIA_EXECUTIVE_METRICS_CACHE_TTL_MS`
- **Invalidation:** TTL expiry or `?fresh=1`
- **Fallback:** partial groups on RPC failure; never 500 unless catastrophic

## Architecture

```text
GET /api/executive-metrics
        ↓
lib/miaExecutiveMetricsApi.js
        ↓ (parallel RPC, partial resilience)
Supabase functions mia_executive_metrics_*
        ↓
analytics_events (production scope filter)
```

## Privacy

Never returned: query, prompt, response, product_name, email, visitor_id, request_id, decision_request_id, conversation_id, alert_id, URLs.

## Semantic rules

- `potential_savings_total` ≠ realized savings
- `recommendation_acceptance_rate` ≠ satisfaction
- `average_user_value` ≠ ROI
- `target_reached` ≠ purchase

## SQL

- RPC migration: `supabase/migrations/20260723210000_mia_executive_metrics_api_v1.sql`
- Validation: `docs/analytics/sql/patch-111-query*.sql`

## Tests

```bash
npm run test:mia:analytics:patch-111:executive-metrics-api
npm run test:mia:analytics:patch-111:prod-smoke
npm run test:mia:analytics:patch-111:prod-validation
```
