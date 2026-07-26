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