-- PATCH 1.3 — Daily unique tab sessions (NOT users / NOT DAU)
-- session_id = tab session per PATCH 1.1 / SESSION_ID.md

select
  date(created_at) as dia,
  count(distinct session_id) filter (
    where session_id is not null
      and event_name in (
        'session_started',
        'mia_question_sent',
        'mia_recommendation_shown',
        'favorite_created',
        'price_alert_created',
        'offer_click'
      )
  ) as sessoes_unicas_diarias,
  count(*) filter (where event_name = 'mia_question_sent') as perguntas,
  count(*) filter (where event_name = 'mia_recommendation_shown') as recomendacoes,
  count(*) filter (where event_name = 'offer_click') as cliques
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
group by dia
order by dia desc;
