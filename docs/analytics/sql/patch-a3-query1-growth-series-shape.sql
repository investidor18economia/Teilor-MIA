-- PATCH A.3 — Validation: growth temporal series RPC references canonical metrics
-- Expected: dau_visitors, wau_visitors, mau_visitors, crescimento_* fields

select
  'growth_series_shape' as check_name,
  jsonb_typeof(result->'series') as series_type,
  jsonb_array_length(coalesce(result->'series', '[]'::jsonb)) as point_count
from (
  select public.mia_temporal_series_growth(30, 0) as result
) t;
