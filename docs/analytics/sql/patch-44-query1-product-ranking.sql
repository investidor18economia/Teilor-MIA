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
  product_name as product_name,
  max(product_id) filter (where product_id is not null) as product_id,
  max(product_brand) filter (where product_brand is not null) as product_brand,
  count(*) as total_aparicoes,
  count(*) filter (where event_name = 'mia_recommendation_shown') as total_recomendacoes,
  count(*) filter (where event_name = 'offer_click') as total_cliques,
  count(*) filter (where event_name = 'favorite_created') as total_favoritos,
  count(*) filter (where event_name = 'price_alert_created') as total_alertas,
  count(*) filter (
    where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
  ) as sinais_intencao_compra,
  count(distinct visitor_id) filter (where visitor_id is not null) as visitantes_distintos,
  round(
    count(*) filter (where event_name = 'offer_click')::numeric
    / nullif(count(*) filter (where event_name = 'mia_recommendation_shown'), 0),
    4
  ) as taxa_clique_recomendacao
from product_events
group by product_name
order by total_aparicoes desc, total_recomendacoes desc
limit 50;
