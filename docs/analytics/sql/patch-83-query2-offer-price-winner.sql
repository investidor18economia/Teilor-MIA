-- PATCH 8.3 — Q2 Price and winner
with production_offer_set_events as (
  select *
  from analytics_events
  where event_name = 'mia_offer_set'
    and coalesce(metadata->>'event_version', '') = '8.3.0'
    and not (category in ('offer_set_test'))
    and coalesce((metadata->>'price_sample_count')::numeric, 0) > 0
)
select
  count(*) as sample_size,
  round(avg(nullif((metadata->>'minimum_price')::numeric, null)), 2) as avg_minimum_price,
  round(avg(nullif((metadata->>'maximum_price')::numeric, null)), 2) as avg_maximum_price,
  round(avg(nullif((metadata->>'average_price')::numeric, null)), 2) as avg_average_price,
  round(avg(nullif((metadata->>'median_price')::numeric, null)), 2) as avg_median_price,
  round(avg(nullif((metadata->>'winner_price')::numeric, null)), 2) as avg_winner_price,
  count(*) filter (where coalesce(metadata->>'winner_is_lowest_price', '') = 'true') as winners_lowest_price_count,
  count(*) filter (where coalesce(metadata->>'winner_present', '') = 'true') as winners_present_count
from production_offer_set_events;
