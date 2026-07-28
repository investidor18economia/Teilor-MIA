-- PATCH A.3.1 — Validate first growth point shape when data exists
with growth as (
  select public.mia_temporal_series_growth(30, 0) as payload
),
first_point as (
  select (payload->'series'->0) as point
  from growth
  where jsonb_array_length(coalesce(payload->'series', '[]'::jsonb)) > 0
)
select
  'growth_point_shape' as check_name,
  point ? 'activity_day' as has_activity_day,
  point ? 'dau_visitors' as has_dau_visitors,
  point ? 'wau_visitors' as has_wau_visitors,
  point ? 'mau_visitors' as has_mau_visitors,
  point ? 'crescimento_dau_visitors_pct' as has_growth_dau_pct
from first_point
union all
select
  'growth_point_shape',
  false, false, false, false, false
where not exists (select 1 from first_point);
