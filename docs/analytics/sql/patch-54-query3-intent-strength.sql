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
  select *
  from production_events
  where event_name in (
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
    and visitor_id is not null
),
category_intent as (
  select
    category,
    count(distinct visitor_id) filter (
      where event_name = 'mia_recommendation_shown'
    ) as visitantes_recomendacao,
    count(distinct visitor_id) filter (
      where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
    ) as visitantes_intencao,
    count(distinct visitor_id) as visitantes_engajados
  from category_events
  group by category
),
category_ranked as (
  select
    'intencao_categoria'::text as tipo_analise,
    ci.category as dimensao,
    ci.visitantes_recomendacao,
    ci.visitantes_intencao,
    ci.visitantes_engajados,
    round(
      ci.visitantes_intencao::numeric / nullif(ci.visitantes_recomendacao, 0),
      4
    ) as taxa_visitantes_intencao_pos_recomendacao,
    rank() over (
      order by ci.visitantes_intencao::numeric / nullif(ci.visitantes_recomendacao, 0) desc nulls last
    ) as rank_intencao
  from category_intent ci
  where ci.visitantes_recomendacao > 0
),
product_events as (
  select
    *,
    (created_at at time zone 'UTC')::date as activity_day
  from production_events
  where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
    and product_name is not null
    and visitor_id is not null
),
product_intent as (
  select
    product_name,
    count(distinct visitor_id) as visitantes_intencao,
    count(distinct activity_day) as dias_com_intencao,
    count(*) as total_sinais_evento
  from product_events
  group by product_name
),
product_ranked as (
  select
    'intencao_produto'::text as tipo_analise,
    pi.product_name as dimensao,
    null::bigint as visitantes_recomendacao,
    pi.visitantes_intencao,
    pi.dias_com_intencao as visitantes_engajados,
    round(
      pi.dias_com_intencao::numeric / nullif(pi.visitantes_intencao, 0),
      4
    ) as taxa_visitantes_intencao_pos_recomendacao,
    rank() over (
      order by pi.visitantes_intencao desc, pi.dias_com_intencao desc
    ) as rank_intencao
  from product_intent pi
  where pi.visitantes_intencao >= 1
),
reference_day as (
  select max((created_at at time zone 'UTC')::date) as ref_day
  from production_events
),
combined as (
  select * from category_ranked
  union all
  select * from product_ranked
)
select
  c.tipo_analise,
  c.dimensao,
  c.visitantes_recomendacao,
  c.visitantes_intencao,
  c.visitantes_engajados,
  c.taxa_visitantes_intencao_pos_recomendacao,
  c.rank_intencao,
  rd.ref_day as dia_referencia
from combined c
cross join reference_day rd
order by c.tipo_analise, c.rank_intencao;

-- ═══════════════════════════════════════════════════════════════════════════════