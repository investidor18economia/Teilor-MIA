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