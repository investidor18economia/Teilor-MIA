-- PATCH 1.3 — Production overview (MIA public events)
-- session_id counts are tab sessions, not users.

select
  count(*) filter (where event_name = 'session_started') as sessoes_iniciadas,
  count(*) filter (where event_name = 'mia_question_sent') as perguntas_recebidas,
  count(*) filter (where event_name = 'mia_recommendation_shown') as recomendacoes_mostradas,
  count(*) filter (where event_name = 'offer_click') as cliques_em_oferta,
  count(*) filter (where event_name = 'favorite_created') as favoritos_criados,
  count(*) filter (where event_name = 'price_alert_created') as alertas_criados,
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
  ) as sessoes_unicas
from analytics_events
where not (
  category in ('price_alert_email_test', 'price_alert_e2e_test')
  or event_name like 'price_drop_email_test_%'
  or event_name like 'price_drop_email_e2e_%'
  or (
    event_name = 'session_started'
    and coalesce(metadata->>'user_agent', '') = 'test-agent'
  )
);
