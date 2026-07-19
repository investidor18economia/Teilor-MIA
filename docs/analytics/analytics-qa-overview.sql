-- PATCH 1.3 — QA / test events only (do not use as production metrics)

select
  count(*) as total_eventos_qa,
  count(*) filter (where category = 'price_alert_email_test') as price_alert_email_test,
  count(*) filter (where category = 'price_alert_e2e_test') as price_alert_e2e_test,
  count(*) filter (where event_name like 'price_drop_email_test_%') as eventos_test_prefix,
  count(*) filter (where event_name like 'price_drop_email_e2e_%') as eventos_e2e_prefix,
  count(*) filter (
    where event_name = 'session_started'
      and coalesce(metadata->>'user_agent', '') = 'test-agent'
  ) as session_started_harness
from analytics_events
where (
  category in ('price_alert_email_test', 'price_alert_e2e_test')
  or event_name like 'price_drop_email_test_%'
  or event_name like 'price_drop_email_e2e_%'
  or (
    event_name = 'session_started'
    and coalesce(metadata->>'user_agent', '') = 'test-agent'
  )
);
