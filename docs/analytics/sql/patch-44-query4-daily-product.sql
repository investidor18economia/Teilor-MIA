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
product_events as (
  select
    *,
    (created_at at time zone 'UTC')::date as activity_day
  from production_events
  where event_name in (
    'mia_recommendation_shown',
    'offer_click',
    'favorite_created',
    'price_alert_created'
  )
    and product_name is not null
)
select
  activity_day as dia,
  product_name as product_name,
  count(*) filter (where event_name = 'mia_recommendation_shown') as eventos_recomendacoes,
  count(*) filter (where event_name = 'offer_click') as eventos_cliques,
  count(*) filter (where event_name = 'favorite_created') as eventos_favoritos,
  count(*) filter (where event_name = 'price_alert_created') as eventos_alertas,
  count(*) as total_eventos,
  count(distinct visitor_id) filter (where visitor_id is not null) as visitantes_distintos,
  round(
    count(*) filter (where event_name = 'offer_click')::numeric
    / nullif(count(*) filter (where event_name = 'mia_recommendation_shown'), 0),
    4
  ) as taxa_clique_recomendacao
from product_events
group by activity_day, product_name
order by activity_day desc, total_eventos desc;
