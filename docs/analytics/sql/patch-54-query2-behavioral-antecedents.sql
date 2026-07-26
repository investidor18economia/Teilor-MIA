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