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