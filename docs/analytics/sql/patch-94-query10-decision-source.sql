-- PATCH 9.4 — Q10 Runner-up metrics by decision source and runtime
with decision_events as (
  select metadata
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and coalesce((metadata->>'decision_valid')::boolean, false) = true
    and not (category in ('recommendation_decision_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events
  where event_name = 'mia_recommendation_decision'
)
select r.dia_referencia,
  coalesce(d.metadata->>'decision_source', 'UNKNOWN') as decision_source,
  coalesce(d.metadata->>'runtime_mode', 'UNKNOWN') as runtime_mode,
  count(*)::bigint as decisions,
  sum(case when coalesce((d.metadata->>'runner_up_present')::boolean, false) then 1 else 0 end)::bigint as with_runner_up,
  sum(case when coalesce((d.metadata->>'runner_up_in_display_products')::boolean, false) then 1 else 0 end)::bigint as runner_up_displayed
from decision_events d
cross join reference_day r
group by 1, 2, 3
order by decisions desc;
