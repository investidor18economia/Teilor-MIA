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
ref as (
  select ref_day from reference_day
),
day_events as (
  select fe.*
  from funnel_events fe
  cross join ref
  where fe.activity_day = ref.ref_day
),
segment_metrics as (
  select
    'visitante'::text as segmento,
    count(distinct de.visitor_id) filter (where de.event_name = 'session_started') as entidades_sessao,
    count(distinct de.visitor_id) filter (where de.event_name = 'mia_question_sent') as entidades_pergunta,
    count(distinct de.visitor_id) filter (where de.event_name = 'mia_recommendation_shown') as entidades_recomendacao,
    count(distinct de.visitor_id) filter (where de.event_name = 'offer_click') as entidades_clique,
    count(distinct de.visitor_id) filter (where de.event_name = 'favorite_created') as entidades_favorito,
    count(distinct de.visitor_id) filter (where de.event_name = 'price_alert_created') as entidades_alerta,
    count(distinct de.user_id) filter (where de.event_name = 'user_authenticated') as authenticated_users
  from day_events de
  where de.visitor_id is not null

  union all

  select
    'usuario_autenticado'::text as segmento,
    count(distinct de.user_id) filter (
      where de.event_name = 'session_started' and de.user_id is not null
    ) as entidades_sessao,
    count(distinct de.user_id) filter (
      where de.event_name = 'mia_question_sent' and de.user_id is not null
    ) as entidades_pergunta,
    count(distinct de.user_id) filter (
      where de.event_name = 'mia_recommendation_shown' and de.user_id is not null
    ) as entidades_recomendacao,
    count(distinct de.user_id) filter (
      where de.event_name = 'offer_click' and de.user_id is not null
    ) as entidades_clique,
    count(distinct de.user_id) filter (
      where de.event_name = 'favorite_created' and de.user_id is not null
    ) as entidades_favorito,
    count(distinct de.user_id) filter (
      where de.event_name = 'price_alert_created' and de.user_id is not null
    ) as entidades_alerta,
    count(distinct de.user_id) filter (
      where de.event_name = 'user_authenticated' and de.user_id is not null
    ) as authenticated_users
  from day_events de
)
select
  ref.ref_day as dia_referencia,
  sm.segmento,
  sm.entidades_sessao,
  sm.entidades_pergunta,
  sm.entidades_recomendacao,
  sm.entidades_clique,
  sm.entidades_favorito,
  sm.entidades_alerta,
  sm.authenticated_users,
  round(
    sm.entidades_pergunta::numeric / nullif(sm.entidades_sessao, 0),
    4
  ) as taxa_conversao_sessao_pergunta,
  round(
    sm.entidades_recomendacao::numeric / nullif(sm.entidades_pergunta, 0),
    4
  ) as taxa_conversao_pergunta_recomendacao,
  round(
    sm.entidades_clique::numeric / nullif(sm.entidades_recomendacao, 0),
    4
  ) as taxa_conversao_recomendacao_clique,
  round(
    sm.entidades_alerta::numeric / nullif(sm.entidades_sessao, 0),
    4
  ) as conversao_acumulada_intencao_compra
from segment_metrics sm
cross join ref
order by sm.segmento;

