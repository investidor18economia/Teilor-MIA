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
  select *
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
)
select
  event_name as event_name,
  count(*) as total_eventos,
  round(
    count(*) filter (where visitor_id is not null)::numeric / nullif(count(*), 0),
    4
  ) as cobertura_visitor_id,
  round(
    count(*) filter (where session_id is not null)::numeric / nullif(count(*), 0),
    4
  ) as cobertura_session_id,
  round(
    count(*) filter (where conversation_id is not null)::numeric
    / nullif(count(*) filter (where event_name in (
      'mia_question_sent', 'mia_recommendation_shown', 'offer_click',
      'favorite_created', 'price_alert_created'
    )), 0),
    4
  ) as cobertura_conversation_id,
  round(
    count(*) filter (where query_text is not null)::numeric
    / nullif(count(*) filter (where event_name in (
      'mia_question_sent', 'mia_recommendation_shown'
    )), 0),
    4
  ) as cobertura_query_text,
  round(
    count(*) filter (where category is not null)::numeric
    / nullif(count(*) filter (where event_name in (
      'mia_question_sent', 'mia_recommendation_shown', 'offer_click',
      'favorite_created', 'price_alert_created'
    )), 0),
    4
  ) as cobertura_category,
  round(
    count(*) filter (where product_name is not null)::numeric
    / nullif(count(*) filter (where event_name in (
      'mia_recommendation_shown', 'offer_click', 'favorite_created', 'price_alert_created'
    )), 0),
    4
  ) as cobertura_product_name,
  round(
    count(*) filter (where user_id is not null)::numeric
    / nullif(count(*) filter (where event_name = 'user_authenticated'), 0),
    4
  ) as cobertura_user_id,
  round(
    count(*) filter (
      where created_at is not null
        and created_at >= timestamptz '2020-01-01'
        and created_at <= now() + interval '1 day'
    )::numeric / nullif(count(*), 0),
    4
  ) as cobertura_timestamp_valido
from mia_events
group by event_name
order by total_eventos desc;
