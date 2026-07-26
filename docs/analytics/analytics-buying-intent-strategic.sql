-- PATCH 5.4 — Buying Intent Analytics Estratégico (MIA public events · production scope)
-- Canonical base: docs/analytics/EXECUTIVE_METRICS.md · docs/analytics/PRODUCTS_CATEGORIES_DASHBOARD.md (PATCH 4.4)
-- Operational products/intent: docs/analytics/analytics-products-categories-dashboard.sql — NÃO duplicar
-- Production filter: docs/analytics/analytics-production-scope.sql
--
-- Query 1 — Intent signal ranking & visitor combinations
-- Query 2 — Behavioral antecedents before first intent signal
-- Query 3 — Category & product intent strength (visitor-level rates)
-- Query 4 — Intent trends · cohort intent · window comparison

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Intent signal ranking & visitor-level combinations
-- Visitor-level focus — does NOT reproduce event-volume ranking (PATCH 4.4 Q1)
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
intent_events as (
  select *
  from production_events
  where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
    and visitor_id is not null
),
reference_day as (
  select max((created_at at time zone 'UTC')::date) as ref_day
  from production_events
),
visitor_signals as (
  select
    visitor_id,
    bool_or(event_name = 'offer_click') as tem_clique,
    bool_or(event_name = 'favorite_created') as tem_favorito,
    bool_or(event_name = 'price_alert_created') as tem_alerta,
    count(*) as total_sinais_evento
  from intent_events
  group by visitor_id
),
total_intent_visitors as (
  select count(*) as total from visitor_signals
),
signal_ranking as (
  select
    'ranking_sinal'::text as tipo_analise,
    event_name as tipo_sinal,
    null::text as combinacao_sinais,
    count(distinct visitor_id) as visitantes_com_sinal,
    null::numeric as media_sinais_por_visitante,
    round(
      count(distinct visitor_id)::numeric
      / nullif((select total from total_intent_visitors), 0),
      4
    ) as pct_visitantes_intencao
  from intent_events
  group by event_name

  union all

  select
    'combinacao_sinais'::text,
    null::text,
    case
      when vs.tem_clique and vs.tem_favorito and vs.tem_alerta then 'clique_favorito_alerta'
      when vs.tem_clique and vs.tem_favorito then 'clique_favorito'
      when vs.tem_clique and vs.tem_alerta then 'clique_alerta'
      when vs.tem_favorito and vs.tem_alerta then 'favorito_alerta'
      when vs.tem_clique then 'somente_clique'
      when vs.tem_favorito then 'somente_favorito'
      else 'somente_alerta'
    end as combinacao_sinais,
    count(*) as visitantes_com_sinal,
    round(avg(vs.total_sinais_evento)::numeric, 4) as media_sinais_por_visitante,
    round(
      count(*)::numeric / nullif((select total from total_intent_visitors), 0),
      4
    ) as pct_visitantes_intencao
  from visitor_signals vs
  group by 3
)
select
  sr.tipo_analise,
  sr.tipo_sinal,
  sr.combinacao_sinais,
  sr.visitantes_com_sinal,
  sr.media_sinais_por_visitante,
  sr.pct_visitantes_intencao,
  (select total from total_intent_visitors) as visitantes_total_intencao,
  rd.ref_day as dia_referencia
from signal_ranking sr
cross join reference_day rd
order by sr.tipo_analise, sr.visitantes_com_sinal desc nulls last;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Behavioral antecedents before first intent signal
-- What behaviors precede the first buying-intent event per visitor
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
first_intent as (
  select distinct on (visitor_id)
    visitor_id,
    created_at as t_primeiro_sinal,
    event_name as primeiro_tipo_sinal,
    conversation_id
  from production_events
  where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
    and visitor_id is not null
  order by visitor_id, created_at asc
),
visitor_profile as (
  select
    fi.visitor_id,
    fi.primeiro_tipo_sinal,
    exists (
      select 1
      from production_events pe
      where pe.visitor_id = fi.visitor_id
        and pe.event_name = 'mia_recommendation_shown'
        and pe.created_at <= fi.t_primeiro_sinal
    ) as teve_recomendacao_antes,
    (
      select count(*)
      from production_events pe
      where pe.visitor_id = fi.visitor_id
        and pe.event_name = 'mia_question_sent'
        and pe.created_at <= fi.t_primeiro_sinal
    ) as perguntas_antes_intencao,
    exists (
      select 1
      from production_events pe
      where pe.visitor_id = fi.visitor_id
        and pe.event_name = 'mia_question_sent'
        and coalesce((pe.metadata->>'has_image')::boolean, false)
        and pe.created_at <= fi.t_primeiro_sinal
    ) as usou_imagem_antes_intencao,
    exists (
      select 1
      from production_events pe
      where pe.visitor_id = fi.visitor_id
        and pe.user_id is not null
        and pe.created_at <= fi.t_primeiro_sinal
    ) as autenticado_antes_intencao,
    (
      select count(*)
      from production_events pe
      where pe.visitor_id = fi.visitor_id
        and pe.event_name = 'mia_question_sent'
        and pe.created_at <= fi.t_primeiro_sinal
    ) >= 2 as conversa_profunda_antes_intencao
  from first_intent fi
),
reference_day as (
  select max((created_at at time zone 'UTC')::date) as ref_day
  from production_events
),
aggregated as (
  select
    'antecedentes_gerais'::text as tipo_analise,
    null::text as subsegmento,
    count(*) as visitantes_com_intencao,
    round(avg(perguntas_antes_intencao)::numeric, 4) as media_perguntas_antes_intencao,
    round(
      count(*) filter (where teve_recomendacao_antes)::numeric / nullif(count(*), 0),
      4
    ) as pct_com_recomendacao_antes_intencao,
    round(
      count(*) filter (where usou_imagem_antes_intencao)::numeric / nullif(count(*), 0),
      4
    ) as pct_com_imagem_antes_intencao,
    round(
      count(*) filter (where conversa_profunda_antes_intencao)::numeric / nullif(count(*), 0),
      4
    ) as pct_conversa_profunda_antes_intencao,
    round(
      count(*) filter (where autenticado_antes_intencao)::numeric / nullif(count(*), 0),
      4
    ) as pct_autenticado_antes_intencao
  from visitor_profile

  union all

  select
    'antecedentes_segmento'::text,
    case when vp.autenticado_antes_intencao then 'usuario_autenticado' else 'visitante_anonimo' end,
    count(*),
    round(avg(vp.perguntas_antes_intencao)::numeric, 4),
    round(
      count(*) filter (where vp.teve_recomendacao_antes)::numeric / nullif(count(*), 0),
      4
    ),
    round(
      count(*) filter (where vp.usou_imagem_antes_intencao)::numeric / nullif(count(*), 0),
      4
    ),
    round(
      count(*) filter (where vp.conversa_profunda_antes_intencao)::numeric / nullif(count(*), 0),
      4
    ),
    round(
      count(*) filter (where vp.autenticado_antes_intencao)::numeric / nullif(count(*), 0),
      4
    )
  from visitor_profile vp
  group by 2
)
select
  a.tipo_analise,
  a.subsegmento,
  a.visitantes_com_intencao,
  a.media_perguntas_antes_intencao,
  a.pct_com_recomendacao_antes_intencao,
  a.pct_com_imagem_antes_intencao,
  a.pct_conversa_profunda_antes_intencao,
  a.pct_autenticado_antes_intencao,
  rd.ref_day as dia_referencia
from aggregated a
cross join reference_day rd
order by a.tipo_analise, a.subsegmento nulls first;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Category & product intent strength (visitor-level · not volume ranking)
-- taxa_visitantes_intencao uses DISTINCT visitors — differs from PATCH 4.4 event ratios
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
-- QUERY 4 — Intent trends · cohort intent · window comparison
-- Does NOT reproduce daily product/category evolution (PATCH 4.4 Q3/Q4)
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
qualifying_events as (
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
    and visitor_id is not null
),
visitor_first_day as (
  select
    visitor_id,
    min(activity_day) as cohort_day
  from qualifying_events
  group by visitor_id
),
visitor_has_intent as (
  select distinct visitor_id
  from production_events
  where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
    and visitor_id is not null
),
cohort_intent as (
  select
    vfd.cohort_day,
    count(*) as visitantes_cohort,
    count(*) filter (where vhi.visitor_id is not null) as visitantes_com_intencao,
    round(
      count(*) filter (where vhi.visitor_id is not null)::numeric / nullif(count(*), 0),
      4
    ) as taxa_intencao_cohort
  from visitor_first_day vfd
  left join visitor_has_intent vhi on vhi.visitor_id = vfd.visitor_id
  group by vfd.cohort_day
),
reference_day as (
  select max(activity_day) as ref_day from qualifying_events
),
windows as (
  select 'janela_recente'::text as janela, r.ref_day - 6 as dia_inicio, r.ref_day as dia_fim
  from reference_day r
  union all
  select 'janela_anterior'::text, r.ref_day - 13, r.ref_day - 7
  from reference_day r
),
window_visitors as (
  select distinct
    w.janela,
    qe.visitor_id
  from qualifying_events qe
  join windows w
    on qe.activity_day between w.dia_inicio and w.dia_fim
),
window_intent as (
  select
    wv.janela,
    count(*) as visitantes_ativos,
    count(*) filter (where vhi.visitor_id is not null) as visitantes_com_intencao,
    round(
      count(*) filter (where vhi.visitor_id is not null)::numeric / nullif(count(*), 0),
      4
    ) as taxa_visitantes_com_intencao
  from window_visitors wv
  left join visitor_has_intent vhi on vhi.visitor_id = wv.visitor_id
  group by wv.janela
),
window_rates as (
  select
    wi.*,
    round(
      wi.taxa_visitantes_com_intencao
      - lag(wi.taxa_visitantes_com_intencao) over (order by wi.janela desc),
      4
    ) as delta_taxa_intencao,
    case
      when wi.taxa_visitantes_com_intencao is null then null
      when wi.taxa_visitantes_com_intencao > lag(wi.taxa_visitantes_com_intencao) over (order by wi.janela desc)
        then 'aumentando'
      when wi.taxa_visitantes_com_intencao < lag(wi.taxa_visitantes_com_intencao) over (order by wi.janela desc)
        then 'diminuindo'
      else 'estavel'
    end as sinal_tendencia_intencao
  from window_intent wi
)
select
  'cohort_intencao'::text as tipo_analise,
  ci.cohort_day::text as dimensao,
  ci.visitantes_cohort as visitantes_ativos,
  ci.visitantes_com_intencao,
  ci.taxa_intencao_cohort as taxa_visitantes_com_intencao,
  null::numeric as delta_taxa_intencao,
  null::text as sinal_tendencia_intencao,
  rd.ref_day as dia_referencia
from cohort_intent ci
cross join reference_day rd

union all

select
  'tendencia_janela'::text,
  wr.janela,
  wr.visitantes_ativos,
  wr.visitantes_com_intencao,
  wr.taxa_visitantes_com_intencao,
  wr.delta_taxa_intencao,
  wr.sinal_tendencia_intencao,
  rd.ref_day
from window_rates wr
cross join reference_day rd
order by tipo_analise, dimensao desc;
