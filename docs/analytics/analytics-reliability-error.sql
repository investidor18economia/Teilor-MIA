-- PATCH 7.2 — Error Reliability Analytics (read-only · analytics_events)
-- Runtime instrumentation: lib/miaErrorAnalytics.js · pages/api/chat-gpt4o.js
-- Event: mia_error_event (server-side INSERT) · category: reliability_error
-- Correlação PATCH 7.1: metadata.request_id ↔ mia_response_outcome
-- NÃO duplica: PATCH 7.1 outcomes · PATCH 6.4 data_layer_resolution · PATCH 7.3 latência
-- Production filter: docs/analytics/analytics-production-scope.sql + reliability_error_test exclusion
-- Regra Fase 6/7: valor_absoluto + valor_relativo + registros_total + referencia_denominador
--
-- Query 1 — Error overview (volume · request rate · recovery · unknown)
-- Query 2 — Error by type / layer / reason / severity / endpoint / provider
-- Query 3 — Recovery analytics + correlation with response outcome (7.1)
-- Query 4 — Daily evolution · operational gaps · instrumentation capacity panel

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Error overview
-- ═══════════════════════════════════════════════════════════════════════════════

with production_error_events as (
  select *
  from analytics_events
  where event_name = 'mia_error_event'
    and category = 'reliability_error'
    and not (
      category in (
        'price_alert_email_test',
        'price_alert_e2e_test',
        'data_layer_usage_test',
        'reliability_response_test',
        'reliability_error_test'
      )
      or event_name like 'price_drop_email_test_%'
      or event_name like 'price_drop_email_e2e_%'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or coalesce(metadata->>'not_market_real', '') = 'true'
      or (
        event_name = 'session_started'
        and coalesce(metadata->>'user_agent', '') = 'test-agent'
      )
    )
),
production_response_events as (
  select *
  from analytics_events
  where event_name = 'mia_response_outcome'
    and not (
      category in (
        'price_alert_email_test',
        'price_alert_e2e_test',
        'data_layer_usage_test',
        'reliability_response_test'
      )
      or event_name like 'price_drop_email_test_%'
      or event_name like 'price_drop_email_e2e_%'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or (
        event_name = 'session_started'
        and coalesce(metadata->>'user_agent', '') = 'test-agent'
      )
    )
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_error_events
),
error_totals as (
  select count(*) as registros_total
  from production_error_events
),
instrumented_requests as (
  select count(distinct metadata->>'request_id') as total
  from production_response_events
  where coalesce(metadata->>'request_id', '') <> ''
),
requests_with_error as (
  select count(distinct metadata->>'request_id') as total
  from production_error_events
  where coalesce(metadata->>'request_id', '') <> ''
),
metric_rows as (
  select
    'erro_global'::text as tipo_analise,
    'total_error_events'::text as metrica,
    null::text as dimensao,
    null::text as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events

  union all

  select
    'erro_global',
    'requests_with_error',
    null,
    null,
    (select total from requests_with_error)

  union all

  select
    'erro_global',
    'error_request_rate',
    null,
    null,
    (select total from requests_with_error)

  union all

  select
    'erro_global',
    'recovered_error_count',
    null,
    null,
    count(*) filter (where coalesce(metadata->>'recovered', '') = 'true')
  from production_error_events

  union all

  select
    'erro_global',
    'recovered_error_rate',
    null,
    null,
    count(*) filter (where coalesce(metadata->>'recovered', '') = 'true')
  from production_error_events

  union all

  select
    'erro_global',
    'unrecovered_error_count',
    null,
    null,
    count(*) filter (where coalesce(metadata->>'recovered', '') = 'false')
  from production_error_events

  union all

  select
    'erro_global',
    'unrecovered_error_rate',
    null,
    null,
    count(*) filter (where coalesce(metadata->>'recovered', '') = 'false')
  from production_error_events

  union all

  select
    'erro_global',
    'unknown_error_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'error_type', '') = 'UNKNOWN_ERROR'
         or coalesce(metadata->>'reason_code', '') = 'unknown_error'
    )
  from production_error_events

  union all

  select
    'capacidade_instrumentacao',
    'total_eventos_mia_error_event',
    null,
    null,
    count(*)
  from production_error_events
)
select
  mr.tipo_analise,
  mr.metrica,
  mr.dimensao,
  mr.dimensao_valor,
  mr.valor_absoluto,
  round(
    mr.valor_absoluto::numeric / nullif(
      case
        when mr.metrica in ('error_request_rate', 'requests_with_error')
          then (select total from instrumented_requests)
        when mr.metrica in (
          'recovered_error_rate',
          'unrecovered_error_rate',
          'unknown_error_rate'
        ) then et.registros_total
        else et.registros_total
      end,
      0
    ),
    4
  ) as valor_relativo,
  case
    when mr.metrica in ('error_request_rate', 'requests_with_error')
      then (select total from instrumented_requests)
    else et.registros_total
  end as registros_total,
  case
    when mr.metrica in ('error_request_rate', 'requests_with_error')
      then 'requisicoes_instrumentadas_7_1'::text
    else 'eventos_erro'::text
  end as referencia_denominador,
  et.registros_total > 0 as amostra_analisavel,
  case
    when et.registros_total = 0 then 'sem_eventos_apos_deploy_patch_72'
    else null
  end as limitacao,
  rd.dia_referencia
from metric_rows mr
cross join error_totals et
cross join reference_day rd
order by mr.tipo_analise, mr.metrica;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Error by type / layer / reason / severity / endpoint / provider
-- ═══════════════════════════════════════════════════════════════════════════════

with production_error_events as (
  select *
  from analytics_events
  where event_name = 'mia_error_event'
    and category = 'reliability_error'
    and not (
      category in (
        'price_alert_email_test',
        'price_alert_e2e_test',
        'data_layer_usage_test',
        'reliability_response_test',
        'reliability_error_test'
      )
      or event_name like 'price_drop_email_test_%'
      or event_name like 'price_drop_email_e2e_%'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or coalesce(metadata->>'not_market_real', '') = 'true'
      or (
        event_name = 'session_started'
        and coalesce(metadata->>'user_agent', '') = 'test-agent'
      )
    )
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_error_events
),
error_totals as (
  select count(*) as registros_total
  from production_error_events
),
type_errors as (
  select
    'erro_por_tipo'::text as tipo_analise,
    'errors_by_type'::text as metrica,
    'error_type'::text as dimensao,
    coalesce(nullif(trim(metadata->>'error_type'), ''), 'unknown') as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events
  group by 4
),
layer_errors as (
  select
    'erro_por_camada'::text as tipo_analise,
    'errors_by_layer'::text as metrica,
    'error_layer'::text as dimensao,
    coalesce(nullif(trim(metadata->>'error_layer'), ''), 'unknown') as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events
  group by 4
),
reason_errors as (
  select
    'erro_por_reason'::text as tipo_analise,
    'errors_by_reason'::text as metrica,
    'reason_code'::text as dimensao,
    coalesce(nullif(trim(metadata->>'reason_code'), ''), 'unknown') as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events
  group by 4
),
severity_errors as (
  select
    'erro_por_severidade'::text as tipo_analise,
    'errors_by_severity'::text as metrica,
    'severity'::text as dimensao,
    coalesce(nullif(trim(metadata->>'severity'), ''), 'unknown') as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events
  group by 4
),
endpoint_errors as (
  select
    'erro_por_endpoint'::text as tipo_analise,
    'errors_by_endpoint'::text as metrica,
    'endpoint'::text as dimensao,
    coalesce(nullif(trim(metadata->>'endpoint'), ''), 'unknown') as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events
  group by 4
),
provider_errors as (
  select
    'erro_por_provider'::text as tipo_analise,
    'errors_by_provider'::text as metrica,
    'provider'::text as dimensao,
    coalesce(nullif(trim(metadata->>'provider'), ''), 'unknown') as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events
  group by 4
),
combined as (
  select * from type_errors
  union all select * from layer_errors
  union all select * from reason_errors
  union all select * from severity_errors
  union all select * from endpoint_errors
  union all select * from provider_errors
)
select
  c.tipo_analise,
  c.metrica,
  c.dimensao,
  c.dimensao_valor,
  c.valor_absoluto,
  round(
    c.valor_absoluto::numeric / nullif(et.registros_total, 0),
    4
  ) as valor_relativo,
  et.registros_total,
  'eventos_erro'::text as referencia_denominador,
  et.registros_total > 0 as amostra_analisavel,
  case
    when et.registros_total = 0 then 'sem_eventos_apos_deploy_patch_72'
    else null
  end as limitacao,
  rd.dia_referencia
from combined c
cross join error_totals et
cross join reference_day rd
order by c.tipo_analise, c.dimensao_valor;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Recovery analytics + correlation with response outcome (7.1)
-- ═══════════════════════════════════════════════════════════════════════════════

with production_error_events as (
  select *
  from analytics_events
  where event_name = 'mia_error_event'
    and category = 'reliability_error'
    and not (
      category in (
        'price_alert_email_test',
        'price_alert_e2e_test',
        'data_layer_usage_test',
        'reliability_response_test',
        'reliability_error_test'
      )
      or event_name like 'price_drop_email_test_%'
      or event_name like 'price_drop_email_e2e_%'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or coalesce(metadata->>'not_market_real', '') = 'true'
      or (
        event_name = 'session_started'
        and coalesce(metadata->>'user_agent', '') = 'test-agent'
      )
    )
),
production_response_events as (
  select *
  from analytics_events
  where event_name = 'mia_response_outcome'
    and not (
      category in (
        'price_alert_email_test',
        'price_alert_e2e_test',
        'data_layer_usage_test',
        'reliability_response_test'
      )
      or event_name like 'price_drop_email_test_%'
      or event_name like 'price_drop_email_e2e_%'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or (
        event_name = 'session_started'
        and coalesce(metadata->>'user_agent', '') = 'test-agent'
      )
    )
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_error_events
),
error_totals as (
  select count(*) as registros_total
  from production_error_events
),
error_response_correlation as (
  select
    e.*,
    r.metadata->>'outcome' as correlated_outcome,
    r.metadata->>'response_path' as correlated_response_path
  from production_error_events e
  left join production_response_events r
    on coalesce(e.metadata->>'request_id', '') <> ''
   and e.metadata->>'request_id' = r.metadata->>'request_id'
),
recovery_overview as (
  select
    'recuperacao_global'::text as tipo_analise,
    'response_delivered_after_error_rate'::text as metrica,
    null::text as dimensao,
    null::text as dimensao_valor,
    count(*) filter (
      where coalesce(metadata->>'response_delivered', '') = 'true'
    ) as valor_absoluto
  from production_error_events

  union all

  select
    'recuperacao_global',
    'fallback_caused_by_error_count',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'fallback_used', '') = 'true'
    )
  from production_error_events

  union all

  select
    'recuperacao_global',
    'recovered_error_rate',
    null,
    null,
    count(*) filter (where coalesce(metadata->>'recovered', '') = 'true')
  from production_error_events

  union all

  select
    'recuperacao_global',
    'unrecovered_error_rate',
    null,
    null,
    count(*) filter (where coalesce(metadata->>'recovered', '') = 'false')
  from production_error_events
),
recovery_method_rows as (
  select
    'recuperacao_por_metodo'::text as tipo_analise,
    'recovery_method'::text as metrica,
    null::text as dimensao,
    coalesce(nullif(trim(metadata->>'recovery_method'), ''), 'none') as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events
  group by 4
),
outcome_correlation as (
  select
    'correlacao_outcome_7_1'::text as tipo_analise,
    coalesce(correlated_outcome, 'uncorrelated') as metrica,
    'response_outcome'::text as dimensao,
    coalesce(nullif(trim(correlated_response_path), ''), 'unknown') as dimensao_valor,
    count(*) as valor_absoluto
  from error_response_correlation
  group by 2, 4
),
fallback_outcome_correlation as (
  select
    'correlacao_fallback_7_1'::text as tipo_analise,
    coalesce(correlated_outcome, 'uncorrelated') as metrica,
    'fallback_used'::text as dimensao,
    case
      when coalesce(metadata->>'fallback_used', '') = 'true' then 'true'
      else 'false'
    end as dimensao_valor,
    count(*) as valor_absoluto
  from error_response_correlation
  where coalesce(metadata->>'fallback_used', '') = 'true'
  group by 2, 4
),
combined as (
  select * from recovery_overview
  union all select * from recovery_method_rows
  union all select * from outcome_correlation
  union all select * from fallback_outcome_correlation
)
select
  c.tipo_analise,
  c.metrica,
  c.dimensao,
  c.dimensao_valor,
  c.valor_absoluto,
  round(
    c.valor_absoluto::numeric / nullif(et.registros_total, 0),
    4
  ) as valor_relativo,
  et.registros_total,
  case
    when c.tipo_analise = 'correlacao_outcome_7_1' then 'eventos_erro_com_request_id'::text
    when c.tipo_analise = 'correlacao_fallback_7_1' then 'eventos_erro_com_fallback'::text
    else 'eventos_erro'::text
  end as referencia_denominador,
  et.registros_total > 0 as amostra_analisavel,
  case
    when et.registros_total = 0 then 'sem_eventos_apos_deploy_patch_72'
    else null
  end as limitacao,
  rd.dia_referencia
from combined c
cross join error_totals et
cross join reference_day rd
order by c.tipo_analise, c.metrica, c.dimensao_valor;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 4 — Daily evolution · operational gaps · instrumentation capacity panel
-- ═══════════════════════════════════════════════════════════════════════════════

with production_error_events as (
  select *
  from analytics_events
  where event_name = 'mia_error_event'
    and category = 'reliability_error'
    and not (
      category in (
        'price_alert_email_test',
        'price_alert_e2e_test',
        'data_layer_usage_test',
        'reliability_response_test',
        'reliability_error_test'
      )
      or event_name like 'price_drop_email_test_%'
      or event_name like 'price_drop_email_e2e_%'
      or coalesce(metadata->>'controlled_test', '') = 'true'
      or coalesce(metadata->>'not_market_real', '') = 'true'
      or (
        event_name = 'session_started'
        and coalesce(metadata->>'user_agent', '') = 'test-agent'
      )
    )
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from production_error_events
),
daily_totals as (
  select
    (created_at at time zone 'UTC')::date as dia,
    count(*) as registros_total
  from production_error_events
  group by 1
),
daily_errors as (
  select
    'evolucao_diaria'::text as tipo_analise,
    coalesce(metadata->>'error_type', 'UNKNOWN_ERROR') as metrica,
    'error_type'::text as dimensao,
    to_char((created_at at time zone 'UTC')::date, 'YYYY-MM-DD') as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events
  group by 2, 4
),
daily_severity as (
  select
    'evolucao_diaria_severidade'::text as tipo_analise,
    coalesce(metadata->>'severity', 'unknown') as metrica,
    'severity'::text as dimensao,
    to_char((created_at at time zone 'UTC')::date, 'YYYY-MM-DD') as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events
  group by 2, 4
),
capacity_rows as (
  select
    'capacidade_instrumentacao'::text as tipo_analise,
    'total_eventos_mia_error_event'::text as metrica,
    null::text as dimensao,
    coalesce(metadata->>'event_version', 'unknown') as dimensao_valor,
    count(*) as valor_absoluto
  from production_error_events
  group by 4

  union all

  select
    'capacidade_instrumentacao',
    'eventos_com_request_id',
    null,
    'request_id_present',
    count(*) filter (
      where coalesce(metadata->>'request_id', '') <> ''
    )
  from production_error_events

  union all

  select
    'capacidade_instrumentacao',
    'eventos_com_analytics_context',
    null,
    'session_or_visitor_present',
    count(*) filter (
      where session_id is not null or visitor_id is not null
    )
  from production_error_events
),
gap_rows as (
  select
    'gap_operacional_classificacao'::text as tipo_analise,
    'eventos_sem_request_id'::text as metrica,
    'request_id'::text as dimensao,
    'missing'::text as dimensao_valor,
    count(*) filter (
      where coalesce(metadata->>'request_id', '') = ''
    ) as valor_absoluto
  from production_error_events

  union all

  select
    'gap_operacional_classificacao',
    'eventos_reason_desconhecido',
    'reason_code',
    coalesce(nullif(trim(metadata->>'reason_code'), ''), 'unknown'),
    count(*)
  from production_error_events
  where coalesce(metadata->>'reason_code', '') in ('', 'unknown_error')
  group by 4

  union all

  select
    'gap_operacional_classificacao',
    'eventos_tipo_desconhecido',
    'error_type',
    coalesce(nullif(trim(metadata->>'error_type'), ''), 'unknown'),
    count(*)
  from production_error_events
  where coalesce(metadata->>'error_type', '') in ('', 'UNKNOWN_ERROR')
  group by 4

  union all

  select
    'gap_operacional_recuperacao',
    'erros_criticos_nao_recuperados',
    'severity',
    coalesce(metadata->>'severity', 'unknown'),
    count(*)
  from production_error_events
  where coalesce(metadata->>'recovered', '') = 'false'
    and coalesce(metadata->>'severity', '') in ('ERROR', 'CRITICAL')
  group by 4
  having count(*) > 0
),
combined as (
  select
    d.tipo_analise,
    d.metrica,
    d.dimensao,
    d.dimensao_valor,
    d.valor_absoluto,
    dt.registros_total
  from daily_errors d
  join daily_totals dt on dt.dia = d.dimensao_valor::date

  union all

  select
    ds.tipo_analise,
    ds.metrica,
    ds.dimensao,
    ds.dimensao_valor,
    ds.valor_absoluto,
    dt.registros_total
  from daily_severity ds
  join daily_totals dt on dt.dia = ds.dimensao_valor::date

  union all

  select
    c.tipo_analise,
    c.metrica,
    c.dimensao,
    c.dimensao_valor,
    c.valor_absoluto,
    (select count(*) from production_error_events) as registros_total
  from capacity_rows c

  union all

  select
    g.tipo_analise,
    g.metrica,
    g.dimensao,
    g.dimensao_valor,
    g.valor_absoluto,
    (select count(*) from production_error_events) as registros_total
  from gap_rows g
)
select
  c.tipo_analise,
  c.metrica,
  c.dimensao,
  c.dimensao_valor,
  c.valor_absoluto,
  round(
    c.valor_absoluto::numeric / nullif(c.registros_total, 0),
    4
  ) as valor_relativo,
  c.registros_total,
  case
    when c.tipo_analise like 'evolucao_diaria%' then 'eventos_erro_no_dia'::text
    else 'eventos_erro'::text
  end as referencia_denominador,
  c.registros_total > 0 as amostra_analisavel,
  case
    when c.registros_total = 0 then 'sem_eventos_apos_deploy_patch_72'
    else null
  end as limitacao,
  rd.dia_referencia
from combined c
cross join reference_day rd
order by c.tipo_analise, c.dimensao_valor, c.metrica;
