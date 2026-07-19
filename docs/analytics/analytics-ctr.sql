-- PATCH 1.3 — Production recommendation CTR

select
  count(*) filter (where event_name = 'mia_recommendation_shown') as recomendacoes,
  count(*) filter (where event_name = 'offer_click') as cliques,
  round(
    (
      count(*) filter (where event_name = 'offer_click')::numeric
      / nullif(count(*) filter (where event_name = 'mia_recommendation_shown'), 0)
    ) * 100,
    2
  ) as ctr_percentual
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
