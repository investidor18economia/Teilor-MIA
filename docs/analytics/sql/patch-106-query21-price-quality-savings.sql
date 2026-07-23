-- PATCH 10.6 — Q21 Price quality vs savings
-- PATCH 10.6 cross-audit base
with phase10 as (
  select
    id,
    created_at,
    event_name,
    category,
    session_id,
    user_id,
    metadata->>'request_id' as request_id,
    metadata->>'decision_request_id' as decision_request_id,
    metadata->>'event_version' as event_version,
    metadata->>'alert_id' as alert_id,
    metadata->>'lifecycle_stage' as lifecycle_stage,
    metadata->>'value_status' as value_status,
    metadata->>'savings_type' as savings_type,
    coalesce((metadata->>'purchase_confirmed')::boolean, false) as purchase_confirmed,
    coalesce((metadata->>'value_verified')::boolean, false) as value_verified,
    coalesce((metadata->>'roi_assumed')::boolean, false) as roi_assumed,
    coalesce((metadata->>'regret_confirmed')::boolean, false) as regret_confirmed,
    coalesce((metadata->>'satisfaction_assumed')::boolean, false) as satisfaction_assumed,
    nullif(metadata->>'potential_value_amount', '')::numeric as potential_value_amount,
    nullif(metadata->>'observed_value_amount', '')::numeric as observed_value_amount,
    nullif(metadata->>'verified_value_amount', '')::numeric as verified_value_amount,
    nullif(metadata->>'user_value_score', '')::numeric as user_value_score,
    nullif(metadata->>'anti_regret_score', '')::numeric as anti_regret_score,
    metadata
  from analytics_events
  where event_name in (
    'mia_price_intelligence',
    'mia_savings_estimation',
    'mia_price_alert_lifecycle',
    'mia_anti_regret_foundation',
    'mia_user_value_outcome'
  )
  and coalesce(category, '') not like '%_test'
)
select p.metadata->>'price_quality' as price_quality,
  s.metadata->>'savings_type' as savings_type,
  count(*)::bigint as pares
from phase10 p
join phase10 s on s.decision_request_id = p.decision_request_id
  and p.event_name = 'mia_price_intelligence' and s.event_name = 'mia_savings_estimation'
group by 1, 2 order by pares desc limit 30;
