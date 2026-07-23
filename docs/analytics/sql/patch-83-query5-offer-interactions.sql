-- PATCH 8.3 — Q5 Interactions (delivery-based CTR)
with offer_sets as (
  select
    metadata->>'request_id' as request_id,
    session_id,
    coalesce((metadata->>'delivered_offers_count')::numeric, 0) as delivered_offers_count,
    coalesce(metadata->>'winner_provider_id', '') as winner_provider_id
  from analytics_events
  where event_name = 'mia_offer_set'
    and coalesce(metadata->>'event_version', '') = '8.3.0'
),
clicks as (
  select session_id, count(*) as click_count
  from analytics_events
  where event_name = 'offer_click'
  group by 1
),
favorites as (
  select session_id, count(*) as favorite_count
  from analytics_events
  where event_name = 'favorite_created'
  group by 1
),
alerts as (
  select session_id, count(*) as alert_count
  from analytics_events
  where event_name = 'price_alert_created'
  group by 1
)
select
  count(*) as offer_sets,
  sum(os.delivered_offers_count) as delivered_offers,
  coalesce(sum(c.click_count), 0) as clicks,
  coalesce(sum(f.favorite_count), 0) as favorites,
  coalesce(sum(a.alert_count), 0) as alerts,
  case when sum(os.delivered_offers_count) > 0
    then round(coalesce(sum(c.click_count), 0)::numeric / sum(os.delivered_offers_count), 4)
    else null end as delivery_ctr
from offer_sets os
left join clicks c on c.session_id = os.session_id
left join favorites f on f.session_id = os.session_id
left join alerts a on a.session_id = os.session_id;
