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
windows as (
  select
    'janela_recente'::text as janela,
    r.ref_day - 6 as dia_inicio,
    r.ref_day as dia_fim
  from reference_day r
  union all
  select
    'janela_anterior'::text,
    r.ref_day - 13,
    r.ref_day - 7
  from reference_day r
),
window_events as (
  select
    w.janela,
    fe.*
  from funnel_events fe
  cross join windows w
  where fe.activity_day between w.dia_inicio and w.dia_fim
    and fe.visitor_id is not null
),
visitor_window_milestones as (
  select
    we.janela,
    we.activity_day,
    we.visitor_id,
    min(we.created_at) filter (where we.event_name = 'session_started') as t_sessao,
    min(we.created_at) filter (where we.event_name = 'mia_question_sent') as t_pergunta,
    min(we.created_at) filter (where we.event_name = 'mia_recommendation_shown') as t_recomendacao,
    min(we.created_at) filter (where we.event_name = 'offer_click') as t_clique,
    min(we.created_at) filter (where we.event_name = 'favorite_created') as t_favorito,
    min(we.created_at) filter (where we.event_name = 'price_alert_created') as t_alerta
  from window_events we
  group by we.janela, we.activity_day, we.visitor_id
),
window_funnel as (
  select
    janela,
    count(*) filter (where t_sessao is not null) as n_sessao,
    count(*) filter (
      where t_sessao is not null and t_pergunta is not null and t_pergunta >= t_sessao
    ) as n_pergunta,
    count(*) filter (
      where t_pergunta is not null and t_recomendacao is not null and t_recomendacao >= t_pergunta
    ) as n_recomendacao,
    count(*) filter (
      where t_recomendacao is not null and t_clique is not null and t_clique >= t_recomendacao
    ) as n_clique,
    count(*) filter (
      where t_favorito is not null and t_alerta is not null and t_alerta >= t_favorito
    ) as n_intencao
  from visitor_window_milestones
  group by janela
),
window_rates as (
  select
    wf.janela,
    round(wf.n_pergunta::numeric / nullif(wf.n_sessao, 0), 4) as taxa_conversao_sessao_pergunta,
    round(wf.n_recomendacao::numeric / nullif(wf.n_pergunta, 0), 4) as taxa_conversao_pergunta_recomendacao,
    round(wf.n_clique::numeric / nullif(wf.n_recomendacao, 0), 4) as taxa_conversao_recomendacao_clique,
    round(wf.n_intencao::numeric / nullif(wf.n_sessao, 0), 4) as conversao_acumulada_intencao,
    round(1 - wf.n_pergunta::numeric / nullif(wf.n_sessao, 0), 4) as abandono_topo_pergunta
  from window_funnel wf
)
select
  wr.janela,
  w.dia_inicio,
  w.dia_fim,
  wr.taxa_conversao_sessao_pergunta,
  wr.taxa_conversao_pergunta_recomendacao,
  wr.taxa_conversao_recomendacao_clique,
  wr.conversao_acumulada_intencao,
  wr.abandono_topo_pergunta,
  rd.ref_day as dia_referencia,
  round(
    wr.taxa_conversao_sessao_pergunta
    - lag(wr.taxa_conversao_sessao_pergunta) over (order by wr.janela desc),
    4
  ) as delta_taxa_sessao_pergunta,
  round(
    wr.taxa_conversao_recomendacao_clique
    - lag(wr.taxa_conversao_recomendacao_clique) over (order by wr.janela desc),
    4
  ) as delta_taxa_recomendacao_clique,
  round(
    wr.conversao_acumulada_intencao
    - lag(wr.conversao_acumulada_intencao) over (order by wr.janela desc),
    4
  ) as delta_conversao_acumulada_intencao,
  case
    when wr.conversao_acumulada_intencao is null then null
    when wr.conversao_acumulada_intencao > lag(wr.conversao_acumulada_intencao) over (order by wr.janela desc)
      then 'melhorando'
    when wr.conversao_acumulada_intencao < lag(wr.conversao_acumulada_intencao) over (order by wr.janela desc)
      then 'piorando'
    else 'estavel'
  end as sinal_tendencia_funil
from window_rates wr
join windows w on w.janela = wr.janela
cross join reference_day rd
order by wr.janela desc;