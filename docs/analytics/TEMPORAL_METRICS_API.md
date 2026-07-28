# Temporal Metrics API — PATCH A.3

Reusable temporal series layer for dashboards (Founder, Executive, MIA Analista, Investidores, Teilor em Números).

**Read-only aggregates** — no individual events, no PII, no UI in this patch.

## Endpoint

```text
GET /api/temporal-metrics
```

## Query params

| Param | Description |
|-------|-------------|
| `days` / `window_days` | Rolling window (1–365, default 30) |
| `offset_days` / `offset` | Period offset for comparison (0–365, default 0) |
| `granularity` | `day` (default) · `week` · `month` |
| `series` / `groups` | Comma-separated: `growth`, `platform_activity` (default: all) |
| `fresh=1` | Bypass in-memory cache |

## Granularity

| Value | Behaviour |
|-------|-----------|
| `day` | Full daily series (all metrics) |
| `week` | Growth group only — projects `wau_*` + rolling WAU growth pct |
| `month` | Growth group only — projects `mau_*` + rolling MAU growth pct |

Per `GROWTH_DASHBOARD.md`: weekly/monthly evolution uses rolling WAU/MAU per day — not calendar ISO weeks.

## Response groups

| Group | RPC | Metrics |
|-------|-----|---------|
| `growth` | `mia_temporal_series_growth` | DAU/WAU/MAU visitors & users, new/returning, auth rate, growth pct |
| `platform_activity` | `mia_temporal_series_platform_activity` | Daily sessions, conversations, questions, recommendations shown |

## Versioning

- `temporal_version`: `A.3.0`
- Metric definitions: [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md) + [GROWTH_DASHBOARD.md](./GROWTH_DASHBOARD.md)

## Cache

- **Type:** in-memory TTL (reuses `miaExecutiveMetricsCache.js`, default 300s)
- **Env:** `MIA_EXECUTIVE_METRICS_CACHE_TTL_MS`
- **Key prefix:** `temporal-metrics:vA.3.0:...`

## Architecture

```text
GET /api/temporal-metrics
        ↓
lib/miaTemporalSeriesApi.js
        ↓ (parallel RPC, partial resilience)
Supabase functions mia_temporal_series_*
        ↓
analytics_events (mia_analytics_production_scope)
```

**Principle:** Same chain as Executive Metrics API — no SQL in routes, no aggregation in frontend.

## Privacy

Reuses forbidden keys from Executive Metrics API catalog.

## SQL

- Migration: `supabase/migrations/20260728160000_mia_temporal_series_api_v1.sql`
- Reference SQL: `docs/analytics/analytics-growth-dashboard.sql` (Query 1)

## Tests

```bash
npm run test:mia:analytics:patch-a3:temporal-series-api
```

## Future patches

| Patch | Consumes |
|-------|----------|
| A.4 Sessões e Usuários | `growth` + `platform_activity` |
| A.5 Produtos e Categorias | new RPC group (future) |
| A.6 Performance e Conversão | new RPC group (future) |
| A.8 Gráficos | mappers consume this API |
