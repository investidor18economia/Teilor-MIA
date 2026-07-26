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