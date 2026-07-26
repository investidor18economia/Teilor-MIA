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
