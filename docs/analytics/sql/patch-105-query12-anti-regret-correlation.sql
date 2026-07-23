-- PATCH 10.5 — Q12 Correlação Anti-Regret
-- PATCH 10.5 base filter
with outcomes as (
  select
    id,
    created_at,
    session_id,
    metadata->>'request_id' as request_id,
    metadata->>'decision_request_id' as decision_request_id,
    coalesce(metadata->>'event_version', '') as event_version,
    nullif(metadata->>'user_value_score', '')::numeric as user_value_score,
    coalesce(metadata->>'value_status', 'UNKNOWN') as value_status,
    coalesce(metadata->>'value_layer', 'UNKNOWN') as value_layer,
    coalesce(metadata->>'value_type', 'UNKNOWN') as value_type,
    coalesce(metadata->>'value_confidence', 'UNKNOWN') as value_confidence,
    coalesce(metadata->>'primary_value_source', 'UNKNOWN') as primary_value_source,
    coalesce(metadata->>'primary_evidence', 'UNKNOWN') as primary_evidence,
    coalesce((metadata->>'supporting_evidence_count')::int, 0) as supporting_evidence_count,
    coalesce((metadata->>'value_component_count')::int, 0) as value_component_count,
    nullif(metadata->>'potential_value_amount', '')::numeric as potential_value_amount,
    nullif(metadata->>'observed_value_amount', '')::numeric as observed_value_amount,
    nullif(metadata->>'verified_value_amount', '')::numeric as verified_value_amount,
    coalesce(metadata->>'verified_value_status', 'NOT_AVAILABLE') as verified_value_status,
    coalesce(metadata->>'time_saved_bucket', 'UNKNOWN') as time_saved_bucket,
    coalesce(metadata->>'price_quality', 'UNKNOWN') as price_quality,
    coalesce(metadata->>'price_confidence', 'UNKNOWN') as price_confidence,
    coalesce(metadata->>'savings_type', 'UNKNOWN') as savings_type,
    nullif(metadata->>'anti_regret_score', '')::numeric as anti_regret_score,
    coalesce(metadata->>'search_path', 'UNKNOWN') as search_path,
    coalesce(metadata->>'winner_provider_id', 'UNKNOWN') as winner_provider_id,
    coalesce((metadata->>'purchase_confirmed')::boolean, false) as purchase_confirmed,
    coalesce((metadata->>'value_verified')::boolean, false) as value_verified
  from analytics_events
  where event_name = 'mia_user_value_outcome'
    and coalesce(metadata->>'event_version', '') = '10.5.0'
    and category not in ('user_value_test')
)
select round(corr(anti_regret_score, user_value_score)::numeric, 4) as correlacao, count(*)::bigint as eventos from outcomes where anti_regret_score is not null and user_value_score is not null;
