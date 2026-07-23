-- PATCH 9.4 — Q6 Runner-up selection and replacement
with decisions as (
  select
    metadata->>'request_id' as decision_request_id,
    metadata->>'runner_up_product_family' as runner_up_family,
    metadata->>'winner_product_family' as winner_family
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and coalesce((metadata->>'runner_up_valid')::boolean, false) = true
    and not (category in ('recommendation_decision_test'))
),
acceptance_runner_up as (
  select distinct metadata->>'decision_request_id' as decision_request_id
  from analytics_events
  where event_name = 'mia_recommendation_acceptance_signal'
    and coalesce(metadata->>'event_version', '') = '9.2.0'
    and metadata->>'signal_target' = 'RUNNER_UP'
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
),
replacements as (
  select
    metadata->>'previous_decision_request_id' as prior_decision,
    metadata->>'replacement_decision_request_id' as replacement_decision
  from analytics_events
  where event_name = 'mia_recommendation_rejection_signal'
    and metadata->>'signal_type' = 'WINNER_REPLACED'
    and coalesce((metadata->>'signal_valid')::boolean, false) = true
),
replacement_winners as (
  select r.prior_decision, d2.metadata->>'winner_product_family' as new_winner_family
  from replacements r
  join analytics_events d2
    on d2.event_name = 'mia_recommendation_decision'
   and d2.metadata->>'request_id' = r.replacement_decision
),
runner_up_became_winner as (
  select count(*)::numeric as valor
  from replacement_winners rw
  join decisions d on d.decision_request_id = rw.prior_decision
  where rw.new_winner_family is not null
    and d.runner_up_family is not null
    and rw.new_winner_family = d.runner_up_family
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_recommendation_decision'
)
select r.dia_referencia, 'selection'::text as tipo, 'decisions_with_runner_up_valid'::text as metrica, count(*)::numeric as valor from decisions
union all
select r.dia_referencia, 'selection', 'runner_up_acceptance_signals', count(*)::numeric from acceptance_runner_up cross join reference_day r
union all
select r.dia_referencia, 'selection', 'runner_up_became_winner', (select valor from runner_up_became_winner) from reference_day r;
