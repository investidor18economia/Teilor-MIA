-- PATCH 4.5 — Data Quality Dashboard (analytics_events · Event Contract v1)
-- Canonical catalog: docs/analytics/contracts/EVENT_CONTRACT.md §7
-- Field semantics: docs/analytics/contracts/EVENT_FIELD_SPECIFICATION.md
-- Production filter: docs/analytics/analytics-production-scope.sql
--
-- Query 1 — Volume snapshot + catalog compliance + QA split
-- Query 2 — Field coverage by event (MIA production · campos típicos only)
-- Query 3 — Daily quality evolution (volume + coverage + drop detection)
-- Query 4 — Integrity anomalies (duplicates · semantic violations)

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Volume snapshot + catalog compliance
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Field coverage by event (MIA production · campos típicos)
-- Cobertura = preenchimento observado — campos opcionais no contrato (não violação)
-- ═══════════════════════════════════════════════════════════════════════════════

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
mia_events as (
  select *
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
)
select
  event_name as event_name,
  count(*) as total_eventos,
  round(
    count(*) filter (where visitor_id is not null)::numeric / nullif(count(*), 0),
    4
  ) as cobertura_visitor_id,
  round(
    count(*) filter (where session_id is not null)::numeric / nullif(count(*), 0),
    4
  ) as cobertura_session_id,
  round(
    count(*) filter (where conversation_id is not null)::numeric
    / nullif(count(*) filter (where event_name in (
      'mia_question_sent', 'mia_recommendation_shown', 'offer_click',
      'favorite_created', 'price_alert_created'
    )), 0),
    4
  ) as cobertura_conversation_id,
  round(
    count(*) filter (where query_text is not null)::numeric
    / nullif(count(*) filter (where event_name in (
      'mia_question_sent', 'mia_recommendation_shown'
    )), 0),
    4
  ) as cobertura_query_text,
  round(
    count(*) filter (where category is not null)::numeric
    / nullif(count(*) filter (where event_name in (
      'mia_question_sent', 'mia_recommendation_shown', 'offer_click',
      'favorite_created', 'price_alert_created'
    )), 0),
    4
  ) as cobertura_category,
  round(
    count(*) filter (where product_name is not null)::numeric
    / nullif(count(*) filter (where event_name in (
      'mia_recommendation_shown', 'offer_click', 'favorite_created', 'price_alert_created'
    )), 0),
    4
  ) as cobertura_product_name,
  round(
    count(*) filter (where user_id is not null)::numeric
    / nullif(count(*) filter (where event_name = 'user_authenticated'), 0),
    4
  ) as cobertura_user_id,
  round(
    count(*) filter (
      where created_at is not null
        and created_at >= timestamptz '2020-01-01'
        and created_at <= now() + interval '1 day'
    )::numeric / nullif(count(*), 0),
    4
  ) as cobertura_timestamp_valido
from mia_events
group by event_name
order by total_eventos desc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Daily quality evolution (MIA production)
-- ═══════════════════════════════════════════════════════════════════════════════

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
mia_events as (
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
daily_by_event as (
  select
    activity_day as dia,
    event_name,
    count(*) as total_eventos,
    round(
      count(*) filter (where visitor_id is not null)::numeric / nullif(count(*), 0),
      4
    ) as cobertura_visitor_id,
    round(
      count(*) filter (where session_id is not null)::numeric / nullif(count(*), 0),
      4
    ) as cobertura_session_id
  from mia_events
  group by activity_day, event_name
),
daily_with_lag as (
  select
    *,
    lag(total_eventos) over (
      partition by event_name
      order by dia
    ) as total_eventos_dia_anterior
  from daily_by_event
)
select
  dia,
  event_name as event_name,
  total_eventos,
  cobertura_visitor_id,
  cobertura_session_id,
  total_eventos_dia_anterior,
  round(
    (total_eventos - total_eventos_dia_anterior)::numeric
    / nullif(total_eventos_dia_anterior, 0),
    4
  ) as variacao_volume_pct
from daily_with_lag
order by dia desc, event_name;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 4 — Integrity anomalies
-- ═══════════════════════════════════════════════════════════════════════════════

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
