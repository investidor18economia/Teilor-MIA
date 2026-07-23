-- PATCH 9.4 — Q5 Alternative request signals (from 9.2 + 9.3)
with rejection_requests as (
  select distinct metadata->>'decision_request_id' as decision_request_id,
    metadata->>'signal_target' as signal_target
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and coalesce(metadata->>'event_version', '') = '9.3.0'
    and metadata->>'signal_type' = 'ALTERNATIVE_REQUESTED'
    and not (category in ('recommendation_rejection_signal_test'))
),
acceptance_runner_up as (
  select distinct metadata->>'decision_request_id' as decision_request_id
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
    and coalesce(metadata->>'event_version', '') = '9.2.0'
    and metadata->>'signal_target' = 'RUNNER_UP'
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events
  where event_name in ('mia_recommendation_rejection_signal', 'mia_recommendation_acceptance_signal')
),
metric_rows as (
  select 'requests'::text as tipo, 'alternative_requested_rejection'::text as metrica, count(*)::numeric as valor from rejection_requests
  union all
  select 'requests', 'runner_up_target_requested', count(*)::numeric from rejection_requests where signal_target = 'RUNNER_UP'
  union all
  select 'requests', 'acceptance_runner_up_follow_up', count(*)::numeric from acceptance_runner_up
)
select r.dia_referencia, m.tipo, m.metrica, m.valor from metric_rows m cross join reference_day r order by m.metrica;
