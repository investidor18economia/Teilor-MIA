-- PATCH 9.4 — Q3 Ranking, display and delivery funnel
with decision_events as (
  select metadata->>'request_id' as decision_request_id, metadata
  from analytics_events
  where event_name = 'mia_recommendation_decision'
    and coalesce(metadata->>'event_version', '') = '9.1.0'
    and coalesce((metadata->>'decision_valid')::boolean, false) = true
    and not (category in ('recommendation_decision_test'))
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from analytics_events where event_name = 'mia_recommendation_decision'
),
funnel as (
  select
    count(*) filter (where coalesce((metadata->>'runner_up_present')::boolean, false)) as runner_up_exists,
    count(*) filter (where coalesce((metadata->>'runner_up_in_display_products')::boolean, false)) as runner_up_in_display,
    count(*) filter (where coalesce((metadata->>'runner_up_in_delivery')::boolean, false)) as runner_up_delivered,
    count(*) filter (where coalesce((metadata->>'display_second_card_is_cognitive_runner_up')::boolean, false)) as display_second_is_runner_up,
    count(*) filter (
      where coalesce((metadata->>'runner_up_present')::boolean, false)
        and not coalesce((metadata->>'runner_up_in_display_products')::boolean, false)
    ) as runner_up_not_displayed
  from decision_events
)
select r.dia_referencia, 'funnel'::text as tipo, f.* from funnel f cross join reference_day r;
