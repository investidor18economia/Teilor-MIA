-- PATCH 1.3 — Production buying-intent signals

select
  count(*) filter (where event_name = 'offer_click') as cliques_em_oferta,
  count(*) filter (where event_name = 'favorite_created') as favoritos,
  count(*) filter (where event_name = 'price_alert_created') as alertas,
  count(*) filter (
    where event_name in ('offer_click', 'favorite_created', 'price_alert_created')
  ) as sinais_fortes_de_compra
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
