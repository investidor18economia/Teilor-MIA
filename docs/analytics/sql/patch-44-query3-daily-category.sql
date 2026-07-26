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
category_events as (
  select
    *,
    (created_at at time zone 'UTC')::date as activity_day
  from production_events
  where event_name in (
    'mia_question_sent',
    'mia_recommendation_shown',
    'offer_click',
    'favorite_created',
    'price_alert_created'
  )
    and category is not null
    and category not in (
      'price_alert_email',
      'price_alert_email_test',
      'price_alert_e2e_test'
    )
)
select
  activity_day as dia,
  category as category,
  count(*) filter (where event_name = 'mia_question_sent') as eventos_perguntas,
  count(*) filter (where event_name = 'mia_recommendation_shown') as eventos_recomendacoes,
  count(*) filter (where event_name = 'offer_click') as eventos_cliques,
  count(*) filter (where event_name = 'favorite_created') as eventos_favoritos,
  count(*) filter (where event_name = 'price_alert_created') as eventos_alertas,
  count(*) as total_eventos,
  count(distinct visitor_id) filter (where visitor_id is not null) as visitantes_distintos
from category_events
group by activity_day, category
order by activity_day desc, total_eventos desc;
