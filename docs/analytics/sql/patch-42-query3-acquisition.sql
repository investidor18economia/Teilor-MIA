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
qualifying_events as (
  select
    visitor_id,
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
    and visitor_id is not null
),
visitor_first_day as (
  select
    visitor_id,
    min(activity_day) as first_active_day
  from qualifying_events
  group by visitor_id
),
acquisition_daily as (
  select
    first_active_day as dia,
    count(*) as new_visitors
  from visitor_first_day
  group by first_active_day
)
select
  dia,
  new_visitors,
  sum(new_visitors) over (order by dia rows unbounded preceding) as new_visitors_acumulado
from acquisition_daily
order by dia desc;
