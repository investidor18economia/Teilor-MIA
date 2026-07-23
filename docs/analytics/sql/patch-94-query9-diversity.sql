-- PATCH 9.4 — Q9 Winner vs runner-up diversity
with decision_events as (
  select metadata
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and coalesce((metadata->>'runner_up_valid')::boolean, false) = true
    and not (category in ('recommendation_decision_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events
  where event_name = 'mia_recommendation_decision'
)
select r.dia_referencia,
  coalesce(d.metadata->>'alternative_diversity_class', 'UNKNOWN') as alternative_diversity_class,
  sum(case when coalesce((d.metadata->>'same_family')::boolean, false) then 1 else 0 end)::bigint as same_family_count,
  sum(case when coalesce((d.metadata->>'same_brand')::boolean, false) then 1 else 0 end)::bigint as same_brand_count,
  sum(case when coalesce((d.metadata->>'same_provider')::boolean, false) then 1 else 0 end)::bigint as same_provider_count,
  count(*)::bigint as decision_count
from decision_events d
cross join reference_day r
group by 1, 2
order by decision_count desc;
