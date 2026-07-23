-- PATCH 8.3 — Q4 Offer quality
with production_offer_set_events as (
  select *
  from analytics_events
  where event_name = 'mia_offer_set'
    and coalesce(metadata->>'event_version', '') = '8.3.0'
    and not (category in ('offer_set_test'))
)
select
  coalesce(metadata->>'offer_pipeline_status', 'UNKNOWN') as offer_pipeline_status,
  count(*) as offer_sets,
  round(avg(coalesce((metadata->>'offers_with_complete_data_count')::numeric, 0)), 2) as avg_complete_data,
  round(avg(coalesce((metadata->>'offers_with_incomplete_data_count')::numeric, 0)), 2) as avg_incomplete_data,
  round(avg(coalesce((metadata->>'offers_in_stock_count')::numeric, 0)), 2) as avg_in_stock,
  count(*) filter (where coalesce(metadata->>'response_contains_offer_cards', '') = 'false') as without_cards,
  count(*) filter (where coalesce(metadata->>'delivered_offers_count', '0')::numeric = 0) as empty_delivery
from production_offer_set_events
group by 1
order by offer_sets desc;
