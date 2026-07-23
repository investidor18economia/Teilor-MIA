-- PATCH 9.4 — Q11 Runner-up quality association (observational)
with decision_events as (
  select
    metadata->>'request_id' as decision_request_id,
    metadata->>'runner_up_competitiveness' as competitiveness,
    metadata->>'score_gap_bucket' as score_gap_bucket,
    metadata
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and coalesce((metadata->>'runner_up_valid')::boolean, false) = true
    and not (category in ('recommendation_decision_test'))
),
acceptance as (
  select distinct metadata->>'decision_request_id' as decision_request_id
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
    and metadata->>'signal_target' = 'RUNNER_UP'
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from decision_events
)
select r.dia_referencia,
  d.competitiveness,
  d.score_gap_bucket,
  count(*)::bigint as decisions,
  count(a.decision_request_id)::bigint as with_runner_up_interaction
from decision_events d
left join acceptance a on a.decision_request_id = d.decision_request_id
cross join reference_day r
group by 1, 2, 3
order by decisions desc;
