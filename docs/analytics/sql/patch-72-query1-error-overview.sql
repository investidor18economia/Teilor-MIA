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
