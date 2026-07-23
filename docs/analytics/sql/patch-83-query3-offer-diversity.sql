-- PATCH 8.3 — Q3 Provider and merchant diversity
with production_offer_set_events as (
  select *
  from analytics_events
  where event_name = 'mia_offer_set'
    and coalesce(metadata->>'event_version', '') = '8.3.0'
    and not (category in ('offer_set_test'))
)
select
  coalesce(metadata->>'search_path', 'UNKNOWN') as search_path,
  count(*) as offer_sets,
  round(avg(nullif((metadata->>'provider_count')::numeric, null)), 2) as avg_provider_count,
  round(avg(nullif((metadata->>'merchant_count')::numeric, null)), 2) as avg_merchant_count,
  count(*) filter (where coalesce(metadata->>'single_provider_dependency', '') = 'true') as single_provider_sets,
  count(*) filter (where coalesce(metadata->>'single_merchant_dependency', '') = 'true') as single_merchant_sets,
  count(*) filter (where coalesce(metadata->>'winner_provider_id', '') <> '') as winners_with_provider
from production_offer_set_events
group by 1
order by offer_sets desc;
