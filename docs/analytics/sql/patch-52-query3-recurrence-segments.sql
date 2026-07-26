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