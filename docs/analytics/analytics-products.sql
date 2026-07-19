-- PATCH 1.3 — Production product ranking

select
  product_name,
  count(*) as total_recomendacoes
from analytics_events
where event_name = 'mia_recommendation_shown'
  and product_name is not null
  and not (
    category in ('price_alert_email_test', 'price_alert_e2e_test')
    or event_name like 'price_drop_email_test_%'
    or event_name like 'price_drop_email_e2e_%'
    or (
      event_name = 'session_started'
      and coalesce(metadata->>'user_agent', '') = 'test-agent'
    )
  )
group by product_name
order by total_recomendacoes desc
limit 20;

select
  product_name,
  count(*) as total_cliques
from analytics_events
where event_name = 'offer_click'
  and product_name is not null
  and not (
    category in ('price_alert_email_test', 'price_alert_e2e_test')
    or event_name like 'price_drop_email_test_%'
    or event_name like 'price_drop_email_e2e_%'
    or (
      event_name = 'session_started'
      and coalesce(metadata->>'user_agent', '') = 'test-agent'
    )
  )
group by product_name
order by total_cliques desc
limit 20;
