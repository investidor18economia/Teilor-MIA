with catalogo_oficial as (
  select unnest(array[
    'session_started',
    'user_authenticated',
    'mia_question_sent',
    'mia_recommendation_shown',
    'favorite_created',
    'price_alert_created',
    'offer_click',
    'price_drop_email_attempted',
    'price_drop_email_sent',
    'price_drop_email_failed',
    'price_drop_email_skipped',
    'price_drop_email_test_sent',
    'price_drop_email_test_failed',
    'price_drop_email_test_skipped',
    'price_drop_email_e2e_sent',
    'price_drop_email_e2e_failed',
    'price_drop_email_e2e_skipped'
  ]) as event_name
),
all_events as (
  select
    ae.*,
    (ae.created_at at time zone 'UTC')::date as activity_day,
    (
      category in ('price_alert_email_test', 'price_alert_e2e_test')
      or ae.event_name like 'price_drop_email_test_%'
      or ae.event_name like 'price_drop_email_e2e_%'
      or (
        ae.event_name = 'session_started'
        and coalesce(ae.metadata->>'user_agent', '') = 'test-agent'
      )
    ) as is_qa_row
  from analytics_events ae
),
volume_by_event as (
  select
    ae.event_name,
    count(*) as total_eventos,
    count(*) filter (where not ae.is_qa_row) as total_eventos_producao,
    count(*) filter (where ae.is_qa_row) as total_eventos_qa,
    count(*) filter (where co.event_name is null) as eventos_fora_catalogo,
    min(ae.created_at) as primeiro_evento,
    max(ae.created_at) as ultimo_evento
  from all_events ae
  left join catalogo_oficial co on co.event_name = ae.event_name
  group by ae.event_name
),
totals as (
  select
    count(*) as total_geral,
    count(*) filter (where not is_qa_row) as total_producao,
    count(*) filter (where is_qa_row) as total_qa
  from all_events
),
fora_catalogo as (
  select count(*) as eventos_fora_catalogo_total
  from all_events ae
  left join catalogo_oficial co on co.event_name = ae.event_name
  where co.event_name is null
)
select
  vbe.event_name,
  vbe.total_eventos,
  vbe.total_eventos_producao,
  vbe.total_eventos_qa,
  vbe.eventos_fora_catalogo,
  round(vbe.total_eventos::numeric / nullif(t.total_geral, 0), 4) as pct_do_total,
  vbe.primeiro_evento,
  vbe.ultimo_evento,
  t.total_geral,
  t.total_producao,
  t.total_qa,
  fc.eventos_fora_catalogo_total
from volume_by_event vbe
cross join totals t
cross join fora_catalogo fc
order by vbe.total_eventos desc;
