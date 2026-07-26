-- PATCH 4.3 — Conversion Dashboard (MIA public events · production scope)
-- Canonical metrics: docs/analytics/EXECUTIVE_METRICS.md (PATCH 4.1 — reutilização obrigatória)
-- Production filter: docs/analytics/analytics-production-scope.sql
--
-- Query 1 — Funnel snapshot (reference day · sequential journey + reach volumes)
-- Query 2 — Daily funnel evolution (visitor reach + conversion rates)
-- Query 3 — Segment comparison (visitante vs usuario_autenticado)

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Funnel snapshot (reference day = latest UTC day with visitor activity)
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
funnel_events as (
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
reference_day as (
  select max(activity_day) as ref_day
  from funnel_events
  where visitor_id is not null
),
ref as (
  select ref_day from reference_day
),
day_events as (
  select fe.*
  from funnel_events fe
  cross join ref
  where fe.activity_day = ref.ref_day
),
visitor_milestones as (
  select
    visitor_id,
    min(created_at) filter (where event_name = 'session_started') as t_sessao,
    min(created_at) filter (where event_name = 'mia_question_sent') as t_pergunta,
    min(created_at) filter (where event_name = 'mia_recommendation_shown') as t_recomendacao,
    min(created_at) filter (where event_name = 'offer_click') as t_clique,
    min(created_at) filter (where event_name = 'favorite_created') as t_favorito,
    min(created_at) filter (where event_name = 'price_alert_created') as t_alerta
  from day_events
  where visitor_id is not null
  group by visitor_id
),
session_milestones as (
  select
    session_id,
    min(created_at) filter (where event_name = 'session_started') as t_sessao,
    min(created_at) filter (where event_name = 'mia_question_sent') as t_pergunta,
    min(created_at) filter (where event_name = 'mia_recommendation_shown') as t_recomendacao,
    min(created_at) filter (where event_name = 'offer_click') as t_clique,
    min(created_at) filter (where event_name = 'favorite_created') as t_favorito,
    min(created_at) filter (where event_name = 'price_alert_created') as t_alerta
  from day_events
  where session_id is not null
  group by session_id
),
visitor_sequential as (
  select
    count(*) filter (where t_sessao is not null) as v1,
    count(*) filter (
      where t_sessao is not null and t_pergunta is not null and t_pergunta >= t_sessao
    ) as v2,
    count(*) filter (
      where t_pergunta is not null and t_recomendacao is not null and t_recomendacao >= t_pergunta
    ) as v3,
    count(*) filter (
      where t_recomendacao is not null and t_clique is not null and t_clique >= t_recomendacao
    ) as v4,
    count(*) filter (
      where t_clique is not null and t_favorito is not null and t_favorito >= t_clique
    ) as v5,
    count(*) filter (
      where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito
    ) as v6
  from visitor_milestones
),
session_sequential as (
  select
    count(*) filter (where t_sessao is not null) as s1,
    count(*) filter (
      where t_sessao is not null and t_pergunta is not null and t_pergunta >= t_sessao
    ) as s2,
    count(*) filter (
      where t_pergunta is not null and t_recomendacao is not null and t_recomendacao >= t_pergunta
    ) as s3,
    count(*) filter (
      where t_recomendacao is not null and t_clique is not null and t_clique >= t_recomendacao
    ) as s4,
    count(*) filter (
      where t_clique is not null and t_favorito is not null and t_favorito >= t_clique
    ) as s5,
    count(*) filter (
      where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito
    ) as s6
  from session_milestones
),
reach_volumes as (
  select
    count(distinct visitor_id) filter (where event_name = 'session_started') as visitantes_sessao,
    count(distinct session_id) filter (where event_name = 'session_started') as sessoes_iniciadas,
    count(*) filter (where event_name = 'session_started') as eventos_sessao,
    count(distinct visitor_id) filter (where event_name = 'mia_question_sent') as visitantes_pergunta,
    count(distinct session_id) filter (where event_name = 'mia_question_sent') as sessoes_pergunta,
    count(*) filter (where event_name = 'mia_question_sent') as eventos_perguntas,
    count(distinct visitor_id) filter (where event_name = 'mia_recommendation_shown') as visitantes_recomendacao,
    count(distinct session_id) filter (where event_name = 'mia_recommendation_shown') as sessoes_recomendacao,
    count(*) filter (where event_name = 'mia_recommendation_shown') as eventos_recomendacoes,
    count(distinct visitor_id) filter (where event_name = 'offer_click') as visitantes_clique,
    count(distinct session_id) filter (where event_name = 'offer_click') as sessoes_clique,
    count(*) filter (where event_name = 'offer_click') as eventos_cliques_oferta,
    count(distinct visitor_id) filter (where event_name = 'favorite_created') as visitantes_favorito,
    count(distinct session_id) filter (where event_name = 'favorite_created') as sessoes_favorito,
    count(*) filter (where event_name = 'favorite_created') as eventos_favoritos,
    count(distinct visitor_id) filter (where event_name = 'price_alert_created') as visitantes_alerta,
    count(distinct session_id) filter (where event_name = 'price_alert_created') as sessoes_alerta,
    count(*) filter (where event_name = 'price_alert_created') as eventos_alertas_preco
  from day_events
),
funnel_rows as (
  select *
  from (
    values
      (1, 'sessoes_iniciadas', 'session_started'),
      (2, 'perguntas_enviadas', 'mia_question_sent'),
      (3, 'recomendacoes_exibidas', 'mia_recommendation_shown'),
      (4, 'cliques_em_oferta', 'offer_click'),
      (5, 'favoritos_criados', 'favorite_created'),
      (6, 'alertas_preco_criados', 'price_alert_created')
  ) as t(ordem, etapa, event_name)
),
funnel_data as (
  select
    fr.ordem,
    fr.etapa,
    fr.event_name,
    case fr.ordem
      when 1 then rv.visitantes_sessao
      when 2 then rv.visitantes_pergunta
      when 3 then rv.visitantes_recomendacao
      when 4 then rv.visitantes_clique
      when 5 then rv.visitantes_favorito
      when 6 then rv.visitantes_alerta
    end as visitantes,
    case fr.ordem
      when 1 then rv.sessoes_iniciadas
      when 2 then rv.sessoes_pergunta
      when 3 then rv.sessoes_recomendacao
      when 4 then rv.sessoes_clique
      when 5 then rv.sessoes_favorito
      when 6 then rv.sessoes_alerta
    end as sessoes,
    case fr.ordem
      when 1 then rv.eventos_sessao
      when 2 then rv.eventos_perguntas
      when 3 then rv.eventos_recomendacoes
      when 4 then rv.eventos_cliques_oferta
      when 5 then rv.eventos_favoritos
      when 6 then rv.eventos_alertas_preco
    end as eventos,
    case fr.ordem
      when 1 then vs.v1
      when 2 then vs.v2
      when 3 then vs.v3
      when 4 then vs.v4
      when 5 then vs.v5
      when 6 then vs.v6
    end as visitantes_sequenciais,
    case fr.ordem
      when 1 then ss.s1
      when 2 then ss.s2
      when 3 then ss.s3
      when 4 then ss.s4
      when 5 then ss.s5
      when 6 then ss.s6
    end as sessoes_sequenciais
  from funnel_rows fr
  cross join reach_volumes rv
  cross join visitor_sequential vs
  cross join session_sequential ss
),
funnel_rates as (
  select
    fd.*,
    lag(fd.visitantes_sequenciais) over (order by fd.ordem) as visitantes_seq_anterior,
    lag(fd.sessoes_sequenciais) over (order by fd.ordem) as sessoes_seq_anterior,
    first_value(fd.visitantes_sequenciais) over (order by fd.ordem) as visitantes_topo,
    first_value(fd.sessoes_sequenciais) over (order by fd.ordem) as sessoes_topo
  from funnel_data fd
)
select
  ref.ref_day as dia_referencia,
  fr.ordem as ordem,
  fr.etapa as etapa,
  fr.event_name,
  fr.visitantes,
  fr.sessoes,
  fr.eventos,
  fr.visitantes_sequenciais,
  fr.sessoes_sequenciais,
  round(
    fr.visitantes_sequenciais::numeric / nullif(fr.visitantes_seq_anterior, 0),
    4
  ) as taxa_conversao_visitante,
  round(
    1 - fr.visitantes_sequenciais::numeric / nullif(fr.visitantes_seq_anterior, 0),
    4
  ) as abandono_visitante,
  round(
    fr.sessoes_sequenciais::numeric / nullif(fr.sessoes_seq_anterior, 0),
    4
  ) as taxa_conversao_sessao,
  round(
    1 - fr.sessoes_sequenciais::numeric / nullif(fr.sessoes_seq_anterior, 0),
    4
  ) as abandono_sessao,
  round(
    fr.visitantes_sequenciais::numeric / nullif(fr.visitantes_topo, 0),
    4
  ) as conversao_acumulada_visitante,
  round(
    fr.sessoes_sequenciais::numeric / nullif(fr.sessoes_topo, 0),
    4
  ) as conversao_acumulada_sessao
from funnel_rates fr
cross join ref
order by fr.ordem;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Daily funnel evolution (visitor reach + sequential conversion)
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
funnel_events as (
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
activity_days as (
  select distinct activity_day as dia
  from funnel_events
  where visitor_id is not null
),
daily_reach as (
  select
    fe.activity_day as dia,
    count(distinct fe.visitor_id) filter (where fe.event_name = 'session_started') as visitantes_sessao,
    count(distinct fe.session_id) filter (where fe.event_name = 'session_started') as sessoes_iniciadas,
    count(*) filter (where fe.event_name = 'session_started') as eventos_sessao,
    count(distinct fe.visitor_id) filter (where fe.event_name = 'mia_question_sent') as visitantes_pergunta,
    count(distinct fe.session_id) filter (where fe.event_name = 'mia_question_sent') as sessoes_pergunta,
    count(*) filter (where fe.event_name = 'mia_question_sent') as eventos_perguntas,
    count(distinct fe.visitor_id) filter (where fe.event_name = 'mia_recommendation_shown') as visitantes_recomendacao,
    count(distinct fe.session_id) filter (where fe.event_name = 'mia_recommendation_shown') as sessoes_recomendacao,
    count(*) filter (where fe.event_name = 'mia_recommendation_shown') as eventos_recomendacoes,
    count(distinct fe.visitor_id) filter (where fe.event_name = 'offer_click') as visitantes_clique,
    count(distinct fe.session_id) filter (where fe.event_name = 'offer_click') as sessoes_clique,
    count(*) filter (where fe.event_name = 'offer_click') as eventos_cliques_oferta,
    count(distinct fe.visitor_id) filter (where fe.event_name = 'favorite_created') as visitantes_favorito,
    count(distinct fe.session_id) filter (where fe.event_name = 'favorite_created') as sessoes_favorito,
    count(*) filter (where fe.event_name = 'favorite_created') as eventos_favoritos,
    count(distinct fe.visitor_id) filter (where fe.event_name = 'price_alert_created') as visitantes_alerta,
    count(distinct fe.session_id) filter (where fe.event_name = 'price_alert_created') as sessoes_alerta,
    count(*) filter (where fe.event_name = 'price_alert_created') as eventos_alertas_preco
  from funnel_events fe
  where fe.visitor_id is not null
  group by fe.activity_day
),
daily_visitor_milestones as (
  select
    fe.activity_day as dia,
    fe.visitor_id,
    min(fe.created_at) filter (where fe.event_name = 'session_started') as t_sessao,
    min(fe.created_at) filter (where fe.event_name = 'mia_question_sent') as t_pergunta,
    min(fe.created_at) filter (where fe.event_name = 'mia_recommendation_shown') as t_recomendacao,
    min(fe.created_at) filter (where fe.event_name = 'offer_click') as t_clique,
    min(fe.created_at) filter (where fe.event_name = 'favorite_created') as t_favorito,
    min(fe.created_at) filter (where fe.event_name = 'price_alert_created') as t_alerta
  from funnel_events fe
  where fe.visitor_id is not null
  group by fe.activity_day, fe.visitor_id
),
daily_sequential as (
  select
    dia,
    count(*) filter (where t_sessao is not null) as visitantes_seq_sessao,
    count(*) filter (
      where t_sessao is not null and t_pergunta is not null and t_pergunta >= t_sessao
    ) as visitantes_seq_pergunta,
    count(*) filter (
      where t_pergunta is not null and t_recomendacao is not null and t_recomendacao >= t_pergunta
    ) as visitantes_seq_recomendacao,
    count(*) filter (
      where t_recomendacao is not null and t_clique is not null and t_clique >= t_recomendacao
    ) as visitantes_seq_clique,
    count(*) filter (
      where t_clique is not null and t_favorito is not null and t_favorito >= t_clique
    ) as visitantes_seq_favorito,
    count(*) filter (
      where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito
    ) as visitantes_seq_alerta
  from daily_visitor_milestones
  group by dia
),
daily_funnel as (
  select
    dr.dia,
    dr.visitantes_sessao,
    dr.sessoes_iniciadas,
    dr.eventos_sessao,
    dr.visitantes_pergunta,
    dr.sessoes_pergunta,
    dr.eventos_perguntas,
    dr.visitantes_recomendacao,
    dr.sessoes_recomendacao,
    dr.eventos_recomendacoes,
    dr.visitantes_clique,
    dr.sessoes_clique,
    dr.eventos_cliques_oferta,
    dr.visitantes_favorito,
    dr.sessoes_favorito,
    dr.eventos_favoritos,
    dr.visitantes_alerta,
    dr.sessoes_alerta,
    dr.eventos_alertas_preco,
    ds.visitantes_seq_sessao,
    ds.visitantes_seq_pergunta,
    ds.visitantes_seq_recomendacao,
    ds.visitantes_seq_clique,
    ds.visitantes_seq_favorito,
    ds.visitantes_seq_alerta
  from daily_reach dr
  join daily_sequential ds on ds.dia = dr.dia
)
select
  dia,
  visitantes_sessao,
  sessoes_iniciadas,
  eventos_sessao,
  visitantes_pergunta,
  sessoes_pergunta,
  eventos_perguntas,
  visitantes_recomendacao,
  sessoes_recomendacao,
  eventos_recomendacoes,
  visitantes_clique,
  sessoes_clique,
  eventos_cliques_oferta,
  visitantes_favorito,
  sessoes_favorito,
  eventos_favoritos,
  visitantes_alerta,
  sessoes_alerta,
  eventos_alertas_preco,
  round(
    visitantes_seq_pergunta::numeric / nullif(visitantes_seq_sessao, 0),
    4
  ) as taxa_conversao_sessao_pergunta,
  round(
    visitantes_seq_recomendacao::numeric / nullif(visitantes_seq_pergunta, 0),
    4
  ) as taxa_conversao_pergunta_recomendacao,
  round(
    visitantes_seq_clique::numeric / nullif(visitantes_seq_recomendacao, 0),
    4
  ) as taxa_conversao_recomendacao_clique,
  round(
    visitantes_seq_favorito::numeric / nullif(visitantes_seq_clique, 0),
    4
  ) as taxa_conversao_clique_favorito,
  round(
    visitantes_seq_alerta::numeric / nullif(visitantes_seq_favorito, 0),
    4
  ) as taxa_conversao_favorito_alerta,
  round(
    visitantes_seq_alerta::numeric / nullif(visitantes_seq_sessao, 0),
    4
  ) as conversao_acumulada_visitante,
  round(
    eventos_cliques_oferta::numeric / nullif(eventos_recomendacoes, 0),
    4
  ) as taxa_clique_recomendacao
from daily_funnel
order by dia desc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Segment comparison (visitante vs usuario_autenticado · reference day)
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
funnel_events as (
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
reference_day as (
  select max(activity_day) as ref_day
  from funnel_events
  where visitor_id is not null
),
ref as (
  select ref_day from reference_day
),
day_events as (
  select fe.*
  from funnel_events fe
  cross join ref
  where fe.activity_day = ref.ref_day
),
segment_metrics as (
  select
    'visitante'::text as segmento,
    count(distinct de.visitor_id) filter (where de.event_name = 'session_started') as entidades_sessao,
    count(distinct de.visitor_id) filter (where de.event_name = 'mia_question_sent') as entidades_pergunta,
    count(distinct de.visitor_id) filter (where de.event_name = 'mia_recommendation_shown') as entidades_recomendacao,
    count(distinct de.visitor_id) filter (where de.event_name = 'offer_click') as entidades_clique,
    count(distinct de.visitor_id) filter (where de.event_name = 'favorite_created') as entidades_favorito,
    count(distinct de.visitor_id) filter (where de.event_name = 'price_alert_created') as entidades_alerta,
    count(distinct de.user_id) filter (where de.event_name = 'user_authenticated') as authenticated_users
  from day_events de
  where de.visitor_id is not null

  union all

  select
    'usuario_autenticado'::text as segmento,
    count(distinct de.user_id) filter (
      where de.event_name = 'session_started' and de.user_id is not null
    ) as entidades_sessao,
    count(distinct de.user_id) filter (
      where de.event_name = 'mia_question_sent' and de.user_id is not null
    ) as entidades_pergunta,
    count(distinct de.user_id) filter (
      where de.event_name = 'mia_recommendation_shown' and de.user_id is not null
    ) as entidades_recomendacao,
    count(distinct de.user_id) filter (
      where de.event_name = 'offer_click' and de.user_id is not null
    ) as entidades_clique,
    count(distinct de.user_id) filter (
      where de.event_name = 'favorite_created' and de.user_id is not null
    ) as entidades_favorito,
    count(distinct de.user_id) filter (
      where de.event_name = 'price_alert_created' and de.user_id is not null
    ) as entidades_alerta,
    count(distinct de.user_id) filter (
      where de.event_name = 'user_authenticated' and de.user_id is not null
    ) as authenticated_users
  from day_events de
)
select
  ref.ref_day as dia_referencia,
  sm.segmento,
  sm.entidades_sessao,
  sm.entidades_pergunta,
  sm.entidades_recomendacao,
  sm.entidades_clique,
  sm.entidades_favorito,
  sm.entidades_alerta,
  sm.authenticated_users,
  round(
    sm.entidades_pergunta::numeric / nullif(sm.entidades_sessao, 0),
    4
  ) as taxa_conversao_sessao_pergunta,
  round(
    sm.entidades_recomendacao::numeric / nullif(sm.entidades_pergunta, 0),
    4
  ) as taxa_conversao_pergunta_recomendacao,
  round(
    sm.entidades_clique::numeric / nullif(sm.entidades_recomendacao, 0),
    4
  ) as taxa_conversao_recomendacao_clique,
  round(
    sm.entidades_alerta::numeric / nullif(sm.entidades_sessao, 0),
    4
  ) as conversao_acumulada_intencao_compra
from segment_metrics sm
cross join ref
order by sm.segmento;
