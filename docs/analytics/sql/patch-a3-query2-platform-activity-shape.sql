-- PATCH A.3 — Validation: platform activity temporal series RPC
-- Expected: total_sessions, conversations, questions, recommendations_shown

select
  'platform_activity_shape' as check_name,
  jsonb_typeof(result->'series') as series_type,
  jsonb_array_length(coalesce(result->'series', '[]'::jsonb)) as point_count
from (
  select public.mia_temporal_series_platform_activity(30, 0) as result
) t;
