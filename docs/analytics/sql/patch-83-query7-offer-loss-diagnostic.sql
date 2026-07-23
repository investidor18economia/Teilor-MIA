-- PATCH 8.3 — Q7 Loss diagnostic
with offer_sets as (
  select *
  from analytics_events
  where event_name = 'mia_offer_set'
    and coalesce(metadata->>'event_version', '') = '8.3.0'
),
provider_attempts as (
  select metadata->>'request_id' as request_id, count(*) filter (where coalesce(metadata->>'attempt_status', '') = 'SUCCESS') as provider_success_count
  from analytics_events
  where event_name = 'mia_provider_attempt' and coalesce(metadata->>'event_version', '') = '8.2.0'
  group by 1
)
select
  'provider_success_zero_delivery'::text as diagnostico,
  count(*) as casos
from offer_sets os
join provider_attempts pa on pa.request_id = os.metadata->>'request_id'
where pa.provider_success_count > 0
  and coalesce((os.metadata->>'delivered_offers_count')::numeric, 0) = 0

union all

select
  'ranked_not_delivered',
  count(*)
from offer_sets
where coalesce((metadata->>'ranked_offers_count')::numeric, 0) > 0
  and coalesce((metadata->>'delivered_offers_count')::numeric, 0) = 0

union all

select
  'dedup_removed_high',
  count(*)
from offer_sets
where coalesce((metadata->>'removed_duplicate_count')::numeric, 0) >= 2;
