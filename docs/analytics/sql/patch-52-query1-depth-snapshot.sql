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