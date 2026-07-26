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
qualifying_events as (
  select * from funnel_events where visitor_id is not null
),
visitor_first_day as (
  select
    visitor_id,
    min(activity_day) as cohort_day
  from qualifying_events
  group by visitor_id
),
visitor_milestones as (
  select
    vfd.cohort_day,
    qe.visitor_id,
    min(qe.created_at) filter (where qe.event_name = 'session_started') as t_sessao,
    min(qe.created_at) filter (where qe.event_name = 'mia_question_sent') as t_pergunta,
    min(qe.created_at) filter (where qe.event_name = 'mia_recommendation_shown') as t_recomendacao,
    min(qe.created_at) filter (where qe.event_name = 'offer_click') as t_clique,
    min(qe.created_at) filter (where qe.event_name = 'favorite_created') as t_favorito,
    min(qe.created_at) filter (where qe.event_name = 'price_alert_created') as t_alerta
  from qualifying_events qe
  join visitor_first_day vfd on vfd.visitor_id = qe.visitor_id
  group by vfd.cohort_day, qe.visitor_id
),
cohort_funnel as (
  select
    cohort_day,
    count(*) as visitantes_cohort,
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
  from visitor_milestones
  group by cohort_day
),
reference_day as (
  select max(activity_day) as ref_day from qualifying_events
)
select
  cf.cohort_day,
  cf.visitantes_cohort,
  cf.visitantes_seq_sessao,
  cf.visitantes_seq_pergunta,
  cf.visitantes_seq_recomendacao,
  cf.visitantes_seq_clique,
  cf.visitantes_seq_favorito,
  cf.visitantes_seq_alerta,
  round(
    cf.visitantes_seq_pergunta::numeric / nullif(cf.visitantes_seq_sessao, 0),
    4
  ) as taxa_conversao_sessao_pergunta_cohort,
  round(
    cf.visitantes_seq_recomendacao::numeric / nullif(cf.visitantes_seq_pergunta, 0),
    4
  ) as taxa_conversao_pergunta_recomendacao_cohort,
  round(
    cf.visitantes_seq_clique::numeric / nullif(cf.visitantes_seq_recomendacao, 0),
    4
  ) as taxa_conversao_recomendacao_clique_cohort,
  round(
    cf.visitantes_seq_alerta::numeric / nullif(cf.visitantes_seq_sessao, 0),
    4
  ) as conversao_acumulada_intencao_cohort,
  rd.ref_day as dia_referencia
from cohort_funnel cf
cross join reference_day rd
order by cf.cohort_day desc;

-- ═══════════════════════════════════════════════════════════════════════════════