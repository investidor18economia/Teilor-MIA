with production_events as (
  select *
  from analytics_events
  where not (
    category in ('price_alert_email_test', 'price_alert_e2e_test')
    or event_name like 'price_drop_email_test_%'
    or event_name like 'price_drop_email_e2e_%'
    or (
      event_name = 'session_started'
      and coalesce(metadata->>'user_agent', '') = 'test-agent'
    )
  )
),
mia_events as (
  select
    *,
    (created_at at time zone 'UTC')::date as activity_day
  from production_events
  where event_name in (
    'session_started',
    'user_authenticated',
    'mia_question_sent',
    'mia_recommendation_shown',
    'offer_click',
    'favorite_created',
    'price_alert_created'
  )
),
daily_by_event as (
  select
    activity_day as dia,
    event_name,
    count(*) as total_eventos,
    round(
      count(*) filter (where visitor_id is not null)::numeric / nullif(count(*), 0),
      4
    ) as cobertura_visitor_id,
    round(
      count(*) filter (where session_id is not null)::numeric / nullif(count(*), 0),
      4
    ) as cobertura_session_id
  from mia_events
  group by activity_day, event_name
),
daily_with_lag as (
  select
    *,
    lag(total_eventos) over (
      partition by event_name
      order by dia
    ) as total_eventos_dia_anterior
  from daily_by_event
)
select
  dia,
  event_name as event_name,
  total_eventos,
  cobertura_visitor_id,
  cobertura_session_id,
  total_eventos_dia_anterior,
  round(
    (total_eventos - total_eventos_dia_anterior)::numeric
    / nullif(total_eventos_dia_anterior, 0),
    4
  ) as variacao_volume_pct
from daily_with_lag
order by dia desc, event_name;
