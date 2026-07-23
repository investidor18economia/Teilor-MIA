-- PATCH 9.4 — Q12 Quality, orphans and fan-out
with decision_events as (
  select metadata->>'request_id' as decision_request_id, metadata
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and not (category in ('recommendation_decision_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events
  where event_name = 'mia_recommendation_decision'
),
dup_runner_up as (
  select metadata->>'runner_up_product_family' as family, count(*) as cnt
  from decision_events
  where metadata->>'runner_up_product_family' is not null
  group by 1
  having count(*) > 1
),
metric_rows as (
  select 'quality'::text as tipo, 'runner_up_equals_winner_family'::text as metrica,
    count(*)::numeric as valor
  from decision_events
  where metadata->>'runner_up_product_family' is not null
    and metadata->>'runner_up_product_family' = metadata->>'winner_product_family'
  union all
  select 'quality', 'runner_up_present_without_identity',
    count(*)::numeric from decision_events
  where coalesce((metadata->>'runner_up_present')::boolean, false)
    and metadata->>'runner_up_product_family' is null
  union all
  select 'quality', 'display_divergence_from_second_card',
    count(*)::numeric from decision_events
  where coalesce((metadata->>'runner_up_present')::boolean, false)
    and coalesce((metadata->>'display_second_card_is_cognitive_runner_up')::boolean, false) = false
    and coalesce((metadata->>'runner_up_in_display_products')::boolean, false) = true
)
select r.dia_referencia, m.tipo, m.metrica, m.valor from metric_rows m cross join reference_day r order by m.metrica;
