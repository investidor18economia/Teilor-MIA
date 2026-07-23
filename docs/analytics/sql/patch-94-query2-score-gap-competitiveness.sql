-- PATCH 9.4 — Q2 Score gap and competitiveness
with decision_events as (
  select metadata
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and coalesce((metadata->>'decision_valid')::boolean, false) = true
    and coalesce((metadata->>'runner_up_present')::boolean, false) = true
    and not (category in ('recommendation_decision_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_recommendation_decision'
)
select r.dia_referencia,
  coalesce(d.metadata->>'score_gap_bucket', 'UNKNOWN') as score_gap_bucket,
  coalesce(d.metadata->>'runner_up_competitiveness', 'UNKNOWN') as runner_up_competitiveness,
  count(*)::bigint as decision_count,
  round(avg((d.metadata->>'score_gap')::numeric), 2) as avg_score_gap,
  round(percentile_cont(0.5) within group (order by (d.metadata->>'score_gap')::numeric), 2) as median_score_gap
from decision_events d
cross join reference_day r
group by 1, 2, 3
order by decision_count desc;
