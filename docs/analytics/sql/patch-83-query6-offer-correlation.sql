-- PATCH 8.3 — Q6 Full correlation diagnostic
with commercial_search as (
  select metadata->>'request_id' as request_id, metadata->>'search_path' as search_path
  from analytics_events
  where event_name = 'mia_commercial_search' and coalesce(metadata->>'event_version', '') = '8.1.0'
),
provider_attempts as (
  select metadata->>'request_id' as request_id, count(*) as provider_attempt_count
  from analytics_events
  where event_name = 'mia_provider_attempt' and coalesce(metadata->>'event_version', '') = '8.2.0'
  group by 1
),
offer_sets as (
  select
    metadata->>'request_id' as request_id,
    metadata->>'offer_pipeline_status' as offer_pipeline_status,
    coalesce((metadata->>'delivered_offers_count')::numeric, 0) as delivered_offers_count,
    coalesce(metadata->>'winner_present', 'false') as winner_present
  from analytics_events
  where event_name = 'mia_offer_set' and coalesce(metadata->>'event_version', '') = '8.3.0'
),
response_outcome as (
  select metadata->>'request_id' as request_id, metadata->>'delivery_status' as delivery_status
  from analytics_events
  where event_name = 'mia_response_outcome'
)
select
  os.request_id,
  cs.search_path,
  coalesce(pa.provider_attempt_count, 0) as provider_attempt_count,
  os.offer_pipeline_status,
  os.delivered_offers_count,
  os.winner_present,
  ro.delivery_status
from offer_sets os
left join commercial_search cs on cs.request_id = os.request_id
left join provider_attempts pa on pa.request_id = os.request_id
left join response_outcome ro on ro.request_id = os.request_id
order by os.request_id desc
limit 100;
