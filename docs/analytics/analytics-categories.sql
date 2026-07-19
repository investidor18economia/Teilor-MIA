-- PATCH 1.3 — Production categories (mia_question_sent)

select
  category,
  count(*) as total_perguntas
from analytics_events
where event_name = 'mia_question_sent'
  and category is not null
  and not (
    category in ('price_alert_email_test', 'price_alert_e2e_test')
    or event_name like 'price_drop_email_test_%'
    or event_name like 'price_drop_email_e2e_%'
    or (
      event_name = 'session_started'
      and coalesce(metadata->>'user_agent', '') = 'test-agent'
    )
  )
group by category
order by total_perguntas desc;
