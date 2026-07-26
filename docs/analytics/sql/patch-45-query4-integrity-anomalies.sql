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
production_events as (
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
checks as (
  select
    'eventos_fora_catalogo'::text as verificacao,
    count(*)::bigint as ocorrencias,
    coalesce(string_agg(distinct ae.event_name, ', ' order by ae.event_name), '') as detalhe
  from analytics_events ae
  left join catalogo_oficial co on co.event_name = ae.event_name
  where co.event_name is null

  union all

  select
    'session_started_duplicado_por_sessao'::text,
    count(*)::bigint,
    'sessoes com >1 session_started (EVENT_CONTRACT — max 1x por aba)'::text
  from (
    select session_id
    from production_events
    where event_name = 'session_started'
      and session_id is not null
    group by session_id
    having count(*) > 1
  ) dup

  union all

  select
    'session_started_com_conversation_id'::text,
    count(*)::bigint,
    'viola EVENT_CONTRACT §7.5 — conversation_id deve ser NULL'::text
  from production_events
  where event_name = 'session_started'
    and conversation_id is not null

  union all

  select
    'timestamps_invalidos'::text,
    count(*)::bigint,
    'created_at nulo, anterior a 2020, ou futuro > 1 dia'::text
  from production_events
  where created_at is null
    or created_at < timestamptz '2020-01-01'
    or created_at > now() + interval '1 day'

  union all

  select
    'event_name_nulo'::text,
    count(*)::bigint,
    'event_name obrigatório (EVENT_FIELD_SPECIFICATION §event_name)'::text
  from analytics_events
  where event_name is null
)
select
  verificacao,
  ocorrencias,
  detalhe
from checks
order by verificacao;

