-- PATCH 9.4 — Q1 Runner-up availability
with decision_events as (
  select metadata->>'request_id' as decision_request_id, metadata
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and coalesce((metadata->>'decision_valid')::boolean, false) = true
    and not (category in ('recommendation_decision_test'))
    and metadata->>'request_id' is not null
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_recommendation_decision'
),
metric_rows as (
  select 'availability'::text as tipo, 'decisions_eligible'::text as metrica, count(*)::numeric as valor from decision_events
  union all
  select 'availability', 'runner_up_present', count(*)::numeric from decision_events where coalesce((metadata->>'runner_up_present')::boolean, false)
  union all
  select 'availability', 'runner_up_identity_available', count(*)::numeric from decision_events where coalesce((metadata->>'runner_up_identity_available')::boolean, false)
  union all
  select 'availability', 'runner_up_valid', count(*)::numeric from decision_events where coalesce((metadata->>'runner_up_valid')::boolean, false)
  union all
  select 'availability', 'runner_up_score_available', count(*)::numeric from decision_events where metadata->>'runner_up_score' is not null
)
select r.dia_referencia, m.tipo, m.metrica, m.valor,
  case when m.metrica = 'runner_up_present' then 'runner_up_availability_rate denominator = decisions_eligible' else null end as nota
from metric_rows m cross join reference_day r order by m.metrica;
