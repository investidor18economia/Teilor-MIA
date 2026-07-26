-- PATCH 4.4 — Products & Categories Dashboard (MIA public events · production scope)
-- Canonical metrics: docs/analytics/EXECUTIVE_METRICS.md (PATCH 4.1)
-- Dimensions: EVENT_FIELD_SPECIFICATION.md — product_name, product_id, category
-- Production filter: docs/analytics/analytics-production-scope.sql
--
-- Query 1 — Product ranking (recommendations · clicks · intent · CTR)
-- Query 2 — Category intelligence (interest · conversion · distribution)
-- Query 3 — Daily evolution by category
-- Query 4 — Daily evolution by product

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Product ranking
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Category intelligence
-- ═══════════════════════════════════════════════════════════════════════════════

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
  category as category,
  count(*) filter (where event_name = 'mia_question_sent') as total_perguntas,
  count(*) filter (where event_name = 'mia_recommendation_shown') as total_recomendacoes,
  count(*) filter (where event_name = 'offer_click') as total_cliques,
  count(*) filter (where event_name = 'favorite_created') as total_favoritos,
  count(*) filter (where event_name = 'price_alert_created') as total_alertas,
  count(*) as total_eventos_categoria,
  count(distinct visitor_id) filter (where visitor_id is not null) as visitantes_distintos,
  count(*) filter (
    where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
  ) as sinais_intencao_compra,
  round(
    count(*) filter (where event_name = 'mia_recommendation_shown')::numeric
    / nullif(count(*) filter (where event_name = 'mia_question_sent'), 0),
    4
  ) as taxa_conversao_pergunta_recomendacao,
  round(
    count(*) filter (where event_name = 'offer_click')::numeric
    / nullif(count(*) filter (where event_name = 'mia_recommendation_shown'), 0),
    4
  ) as taxa_conversao_recomendacao_clique,
  round(
    count(*) filter (
      where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
    )::numeric
    / nullif(count(*) filter (where event_name = 'mia_recommendation_shown'), 0),
    4
  ) as taxa_intencao_pos_recomendacao
from category_events
group by category
order by total_eventos_categoria desc, total_perguntas desc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Daily evolution by category
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 4 — Daily evolution by product
-- ═══════════════════════════════════════════════════════════════════════════════

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
