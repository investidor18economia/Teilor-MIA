-- PATCH 10.3 — Q14 Taxa target reached
-- PATCH 10.3 base filter
with lifecycle as (
  select
    id,
    created_at,
    user_id,
    metadata->>'alert_id' as alert_id,
    coalesce(metadata->>'lifecycle_stage', 'UNKNOWN') as lifecycle_stage,
    coalesce(metadata->>'alert_status', 'UNKNOWN') as alert_status,
    coalesce(metadata->>'alert_source', 'UNKNOWN') as alert_source,
    coalesce(metadata->>'target_realism', 'UNKNOWN') as target_realism,
    coalesce(metadata->>'creation_failure_reason', 'UNKNOWN') as creation_failure_reason,
    coalesce(metadata->>'check_failure_reason', 'UNKNOWN') as check_failure_reason,
    coalesce(metadata->>'notification_failure_reason', 'UNKNOWN') as notification_failure_reason,
    coalesce(metadata->>'check_source', 'UNKNOWN') as check_source,
    coalesce(metadata->>'provider_id', 'UNKNOWN') as provider_id,
    coalesce(metadata->>'lifecycle_occurrence_key', '') as lifecycle_occurrence_key,
    nullif(metadata->>'current_price', '')::numeric as current_price,
    nullif(metadata->>'target_price', '')::numeric as target_price,
    nullif(metadata->>'target_delta_percent', '')::numeric as target_delta_percent,
    nullif(metadata->>'potential_savings_amount', '')::numeric as potential_savings_amount,
    nullif(metadata->>'checks_until_target', '')::numeric as checks_until_target,
    coalesce((metadata->>'creation_success')::boolean, false) as creation_success,
    coalesce((metadata->>'target_reached')::boolean, false) as target_reached,
    coalesce((metadata->>'check_success')::boolean, false) as check_success,
    coalesce((metadata->>'notification_success')::boolean, false) as notification_success,
    coalesce((metadata->>'duplicate_existing')::boolean, false) as duplicate_existing
  from analytics_events
  where event_name = 'mia_price_alert_lifecycle'
    and coalesce(metadata->>'event_version', '') = '10.3.0'
    and category not in ('price_alert_lifecycle_test')
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from lifecycle
),
active as (
  select count(distinct alert_id)::numeric as n from lifecycle where lifecycle_stage = 'ACTIVE'
),
reached as (
  select count(distinct alert_id)::numeric as n from lifecycle where lifecycle_stage = 'TARGET_REACHED'
)
select active.n as alertas_ativos, reached.n as target_reached,
  round(100.0 * reached.n / nullif(active.n, 0), 2) as taxa_pct
from active, reached;
