-- PATCH A.3.1 — Smoke execute growth RPC (30 days, offset 0)
select
  'growth_smoke' as check_name,
  jsonb_typeof(result->'series') as series_type,
  jsonb_array_length(coalesce(result->'series', '[]'::jsonb)) as point_count,
  result->>'grain' as grain,
  result->>'window_days' as window_days
from (
  select public.mia_temporal_series_growth(30, 0) as result
) t;
