-- PATCH 9.4 — Q7 Non-runner-up alternative uptake
with replacements as (
  select
    metadata->>'previous_decision_request_id' as prior_decision,
    metadata->>'replacement_decision_request_id' as replacement_decision
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and metadata->>'signal_type' = 'WINNER_REPLACED'
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
),
prior_runner_up as (
  select metadata->>'request_id' as decision_request_id, metadata->>'runner_up_product_family' as runner_up_family
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce((metadata->>'decision_valid')::boolean, false) = true
),
new_winners as (
  select metadata->>'request_id' as decision_request_id, metadata->>'winner_product_family' as winner_family
  from analytics_events
  where event_name = 'mia_recommendation_decision'
),
classified as (
  select
    case
      when p.runner_up_family is not null and n.winner_family = p.runner_up_family then 'RUNNER_UP_REPLACEMENT'
      when n.winner_family is not null and n.winner_family <> coalesce(p.runner_up_family, '') then 'NON_RUNNER_UP_REPLACEMENT'
      else 'UNRESOLVED'
    end as replacement_class
  from replacements r
  left join prior_runner_up p on p.decision_request_id = r.prior_decision
  left join new_winners n on n.decision_request_id = r.replacement_decision
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_recommendation_rejection_signal'
)
select r.dia_referencia, c.replacement_class, count(*)::bigint as replacement_count
from classified c cross join reference_day r
group by 1, 2
order by replacement_count desc;
