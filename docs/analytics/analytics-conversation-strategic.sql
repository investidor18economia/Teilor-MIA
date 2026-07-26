-- PATCH 5.2 — Conversation Analytics Estratégico (MIA public events · production scope)
-- Canonical base: docs/analytics/EXECUTIVE_METRICS.md · docs/analytics/CONVERSATION_ID.md
-- Operational metrics: docs/analytics/analytics-executive-dashboard.sql (PATCH 4.1 — NÃO duplicar)
-- Production filter: docs/analytics/analytics-production-scope.sql
--
-- Query 1 — Conversation depth snapshot (behavioral profile)
-- Query 2 — Depth distribution (questions per conversation)
-- Query 3 — Recurrence · visitor/user · segment comparison
-- Query 4 — Daily engagement trends (behavioral, not volume)

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Conversation depth snapshot
-- Analyzes conversations with conversation_id — behavioral ratios only
-- Does NOT expose conversas_unicas (EXECUTIVE_METRICS §5.2 — PATCH 4.1)
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
conversation_events as (
  select *
  from production_events
  where conversation_id is not null
    and event_name in (
      'mia_question_sent',
      'mia_recommendation_shown',
      'offer_click',
      'favorite_created',
      'price_alert_created'
    )
),
conversation_stats as (
  select
    conversation_id,
    count(*) filter (where event_name = 'mia_question_sent') as perguntas,
    count(*) filter (where event_name = 'mia_recommendation_shown') as recomendacoes,
    count(*) filter (
      where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
    ) as sinais_intencao,
    count(*) filter (
      where event_name = 'mia_question_sent'
        and coalesce((metadata->>'has_image')::boolean, false)
    ) as perguntas_com_imagem
  from conversation_events
  group by conversation_id
),
question_gaps as (
  select
    conversation_id,
    extract(epoch from (created_at - lag(created_at) over (
      partition by conversation_id
      order by created_at
    ))) as gap_seconds
  from conversation_events
  where event_name = 'mia_question_sent'
),
gap_summary as (
  select
    round(avg(gap_seconds), 2) as media_intervalo_segundos_entre_perguntas
  from question_gaps
  where gap_seconds is not null
),
reference_day as (
  select max((created_at at time zone 'UTC')::date) as ref_day
  from conversation_events
)
select
  rd.ref_day as dia_referencia,
  round(avg(cs.perguntas)::numeric, 4) as media_perguntas_por_conversa,
  percentile_cont(0.5) within group (order by cs.perguntas) as mediana_perguntas_por_conversa,
  round(
    count(*) filter (where cs.perguntas >= 2)::numeric / nullif(count(*), 0),
    4
  ) as pct_conversas_profundas,
  round(
    count(*) filter (where cs.recomendacoes >= 1)::numeric / nullif(count(*), 0),
    4
  ) as pct_conversas_com_recomendacao,
  round(
    count(*) filter (where cs.sinais_intencao >= 1)::numeric / nullif(count(*), 0),
    4
  ) as pct_conversas_com_intencao_compra,
  round(
    sum(cs.perguntas_com_imagem)::numeric / nullif(sum(cs.perguntas), 0),
    4
  ) as pct_perguntas_com_imagem,
  gs.media_intervalo_segundos_entre_perguntas,
  count(*) as amostra_conversas
from conversation_stats cs
cross join reference_day rd
cross join gap_summary gs
group by rd.ref_day, gs.media_intervalo_segundos_entre_perguntas;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Depth distribution (questions per conversation)
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
conversation_events as (
  select *
  from production_events
  where conversation_id is not null
    and event_name = 'mia_question_sent'
),
conversation_depth as (
  select
    conversation_id,
    count(*) as perguntas
  from conversation_events
  group by conversation_id
),
bucketed as (
  select
    case
      when perguntas = 1 then '1_pergunta'
      when perguntas between 2 and 3 then '2_a_3_perguntas'
      else '4_ou_mais_perguntas'
    end as faixa_profundidade,
    perguntas
  from conversation_depth
),
reference_day as (
  select max((created_at at time zone 'UTC')::date) as ref_day
  from production_events
  where conversation_id is not null
)
select
  b.faixa_profundidade,
  count(*) as conversas_na_faixa,
  round(count(*)::numeric / nullif(sum(count(*)) over (), 0), 4) as pct_conversas_na_faixa,
  rd.ref_day as dia_referencia
from bucketed b
cross join reference_day rd
group by b.faixa_profundidade, rd.ref_day
order by
  case b.faixa_profundidade
    when '1_pergunta' then 1
    when '2_a_3_perguntas' then 2
    else 3
  end;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Recurrence and segment comparison
-- Part A: visitor/user conversation recurrence
-- Part B: behavioral comparison anonymous vs authenticated conversations
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
conversation_events as (
  select *
  from production_events
  where conversation_id is not null
    and event_name in (
      'mia_question_sent',
      'mia_recommendation_shown',
      'offer_click',
      'favorite_created',
      'price_alert_created'
    )
),
conversation_stats as (
  select
    conversation_id,
    min(visitor_id::text)::uuid as visitor_id,
    bool_or(user_id is not null) as conversa_autenticada,
    count(*) filter (where event_name = 'mia_question_sent') as perguntas,
    count(*) filter (where event_name = 'mia_recommendation_shown') as recomendacoes,
    count(*) filter (
      where event_name = 'mia_question_sent'
        and coalesce((metadata->>'has_image')::boolean, false)
    ) as perguntas_com_imagem
  from conversation_events
  group by conversation_id
),
visitor_recurrence as (
  select
    visitor_id,
    count(distinct conversation_id) as conversas_por_visitante
  from conversation_stats
  where visitor_id is not null
  group by visitor_id
),
user_recurrence as (
  select
    pe.user_id,
    count(distinct pe.conversation_id) as conversas_por_usuario
  from conversation_stats cs
  join production_events pe
    on pe.conversation_id = cs.conversation_id
    and pe.user_id is not null
  group by pe.user_id
),
reference_day as (
  select max((created_at at time zone 'UTC')::date) as ref_day
  from conversation_events
),
recurrence_metrics as (
  select
    'recorrencia_visitante'::text as tipo_analise,
    null::text as segmento,
    round(avg(vr.conversas_por_visitante)::numeric, 4) as media_conversas_por_entidade,
    round(
      count(*) filter (where vr.conversas_por_visitante >= 2)::numeric
      / nullif(count(*), 0),
      4
    ) as pct_entidades_multiplas_conversas,
    count(*) as entidades_analisadas,
    null::numeric as media_perguntas_por_conversa,
    null::numeric as pct_conversas_com_recomendacao,
    null::numeric as pct_perguntas_com_imagem
  from visitor_recurrence vr

  union all

  select
    'recorrencia_usuario'::text,
    null::text,
    round(avg(ur.conversas_por_usuario)::numeric, 4),
    round(
      count(*) filter (where ur.conversas_por_usuario >= 2)::numeric
      / nullif(count(*), 0),
      4
    ),
    count(*),
    null::numeric,
    null::numeric,
    null::numeric
  from user_recurrence ur

  union all

  select
    'segmento_conversa'::text,
    'visitante_anonimo'::text,
    null::numeric,
    null::numeric,
    count(*),
    round(avg(cs.perguntas)::numeric, 4),
    round(
      count(*) filter (where cs.recomendacoes >= 1)::numeric / nullif(count(*), 0),
      4
    ),
    round(
      sum(cs.perguntas_com_imagem)::numeric / nullif(sum(cs.perguntas), 0),
      4
    )
  from conversation_stats cs
  where not cs.conversa_autenticada

  union all

  select
    'segmento_conversa'::text,
    'usuario_autenticado'::text,
    null::numeric,
    null::numeric,
    count(*),
    round(avg(cs.perguntas)::numeric, 4),
    round(
      count(*) filter (where cs.recomendacoes >= 1)::numeric / nullif(count(*), 0),
      4
    ),
    round(
      sum(cs.perguntas_com_imagem)::numeric / nullif(sum(cs.perguntas), 0),
      4
    )
  from conversation_stats cs
  where cs.conversa_autenticada
)
select
  rm.tipo_analise,
  rm.segmento,
  rm.media_conversas_por_entidade,
  rm.pct_entidades_multiplas_conversas,
  rm.entidades_analisadas,
  rm.media_perguntas_por_conversa,
  rm.pct_conversas_com_recomendacao,
  rm.pct_perguntas_com_imagem,
  rd.ref_day as dia_referencia
from recurrence_metrics rm
cross join reference_day rd
order by rm.tipo_analise, rm.segmento nulls first;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 4 — Daily engagement trends (behavioral)
-- Does NOT report raw conversas_unicas or perguntas volume (PATCH 4.1 / overview)
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
conversation_events as (
  select *
  from production_events
  where conversation_id is not null
    and event_name in (
      'mia_question_sent',
      'mia_recommendation_shown',
      'offer_click',
      'favorite_created',
      'price_alert_created'
    )
),
conversation_stats as (
  select
    conversation_id,
    min((created_at at time zone 'UTC')::date) filter (
      where event_name = 'mia_question_sent'
    ) as dia_inicio_conversa,
    count(*) filter (where event_name = 'mia_question_sent') as perguntas,
    count(*) filter (where event_name = 'mia_recommendation_shown') as recomendacoes,
    count(*) filter (
      where event_name = 'mia_question_sent'
        and coalesce((metadata->>'has_image')::boolean, false)
    ) as perguntas_com_imagem
  from conversation_events
  group by conversation_id
),
question_gaps as (
  select
    (created_at at time zone 'UTC')::date as dia,
    conversation_id,
    extract(epoch from (created_at - lag(created_at) over (
      partition by conversation_id
      order by created_at
    ))) as gap_seconds
  from conversation_events
  where event_name = 'mia_question_sent'
),
daily_behavior as (
  select
    cs.dia_inicio_conversa as dia,
    round(avg(cs.perguntas)::numeric, 4) as media_perguntas_por_conversa,
    round(
      count(*) filter (where cs.perguntas >= 2)::numeric / nullif(count(*), 0),
      4
    ) as pct_conversas_profundas,
    round(
      count(*) filter (where cs.recomendacoes >= 1)::numeric / nullif(count(*), 0),
      4
    ) as pct_conversas_com_recomendacao,
    round(
      sum(cs.perguntas_com_imagem)::numeric / nullif(sum(cs.perguntas), 0),
      4
    ) as pct_perguntas_com_imagem
  from conversation_stats cs
  where cs.dia_inicio_conversa is not null
  group by cs.dia_inicio_conversa
),
daily_gaps as (
  select
    dia,
    round(avg(gap_seconds) filter (where gap_seconds is not null), 2) as media_intervalo_segundos_entre_perguntas
  from question_gaps
  group by dia
)
select
  db.dia,
  db.media_perguntas_por_conversa,
  db.pct_conversas_profundas,
  db.pct_conversas_com_recomendacao,
  db.pct_perguntas_com_imagem,
  dg.media_intervalo_segundos_entre_perguntas,
  round(
    db.media_perguntas_por_conversa
    - lag(db.media_perguntas_por_conversa) over (order by db.dia),
    4
  ) as delta_media_perguntas_dia_anterior,
  round(
    db.pct_conversas_profundas
    - lag(db.pct_conversas_profundas) over (order by db.dia),
    4
  ) as delta_pct_conversas_profundas
from daily_behavior db
left join daily_gaps dg on dg.dia = db.dia
order by db.dia desc;
