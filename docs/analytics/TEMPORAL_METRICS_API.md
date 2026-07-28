# Temporal Metrics API — PATCH A.3 / A.5

Reusable temporal series layer for dashboards (Founder, Executive, MIA Analista, Investidores, Teilor em Números).

**Read-only aggregates** — no individual events, no PII in public responses.

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
| `series` / `groups` | Comma-separated groups (default: `growth`, `platform_activity`) |
| `fresh=1` | Bypass in-memory cache |

## Granularity

| Value | Behaviour |
|-------|-----------|
| `day` | Full daily series (all metrics) |
| `week` | Growth group only — projects `wau_*` + rolling WAU growth pct |
| `month` | Growth group only — projects `mau_*` + rolling MAU growth pct |

## Response groups

| Group | RPC | Shape |
|-------|-----|-------|
| `growth` | `mia_temporal_series_growth` | `{ series[] }` daily DAU/WAU/MAU |
| `platform_activity` | `mia_temporal_series_platform_activity` | `{ series[] }` daily activity |
| `products` | `mia_temporal_series_products` | `{ summary, ranking[], daily[] }` — PATCH A.5 / 4.4 Q1+Q4 |
| `categories` | `mia_temporal_series_categories` | `{ summary, ranking[], daily[] }` — PATCH A.5 / 4.4 Q2+Q3 |

## Versioning

- `temporal_version`: `A.5.0`
- Metric definitions: [EXECUTIVE_METRICS.md](./EXECUTIVE_METRICS.md), [GROWTH_DASHBOARD.md](./GROWTH_DASHBOARD.md), [PRODUCTS_CATEGORIES_DASHBOARD.md](./PRODUCTS_CATEGORIES_DASHBOARD.md)

## Cache

- **Type:** in-memory TTL (reuses `miaExecutiveMetricsCache.js`, default 300s)
- **Env:** `MIA_EXECUTIVE_METRICS_CACHE_TTL_MS`
- **Key prefix:** `temporal-metrics:vA.5.0:...`

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

## Privacy

Reuses forbidden keys from Executive Metrics API catalog. Products group exposes `product_label` (not `product_name`) for founder dashboards.

## SQL / Migrations

- A.3: `supabase/migrations/20260728160000_mia_temporal_series_api_v1.sql`
- A.5: `supabase/migrations/20260728210000_mia_temporal_series_products_categories_v1.sql`
- Reference: `docs/analytics/analytics-products-categories-dashboard.sql`

## Tests

```bash
npm run test:mia:analytics:patch-a3:temporal-series-api
npm run test:mia:analytics:patch-a5:founder-products-categories
```

## Founder consumption

| Patch | Series param |
|-------|--------------|
| A.4 Sessões e Usuários | `growth`, `platform_activity` |
| A.5 Produtos e Categorias | `products`, `categories` |
| A.8 Gráficos | mappers consume this API |
