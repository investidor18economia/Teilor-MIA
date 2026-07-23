-- PATCH 9.4 — Q4 Runner-up and alternative interactions (from 9.2, deduped)
with acceptance_signals as (
  select
    metadata->>'decision_request_id' as decision_request_id,
    metadata->>'signal_type' as signal_type,
    metadata->>'signal_target' as signal_target,
    metadata->>'signal_strength' as signal_strength,
    metadata->>'source_event_id' as source_event_id
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
    and coalesce(metadata->>'event_version', '') = '9.2.0'
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
    and not (category in ('recommendation_acceptance_signal_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from acceptance_signals
)
select r.dia_referencia,
  s.signal_target,
  s.signal_type,
  count(distinct s.decision_request_id)::bigint as unique_decisions,
  count(distinct s.source_event_id)::bigint as unique_signals
from acceptance_signals s
cross join reference_day r
where s.signal_target in ('RUNNER_UP', 'ALTERNATIVE')
group by 1, 2, 3
order by unique_decisions desc;
