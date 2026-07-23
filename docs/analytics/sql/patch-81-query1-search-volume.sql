with production_commercial_search_events as (
  select *
  from analytics_events
  where event_name = 'mia_commercial_search'
    and not (
      category in (
        'price_alert_email_test',
        'price_alert_e2e_test',
        'data_layer_usage_test',
        'reliability_response_test',
        'reliability_latency_test',
        'commercial_search_test'
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
  from production_commercial_search_events
),
totals as (
  select count(*) as registros_total
  from production_commercial_search_events
),
metric_rows as (
  select
    'volume_execucao'::text as tipo_analise,
    'total_commercial_search_events'::text as metrica,
    null::text as dimensao,
    null::text as dimensao_valor,
    count(*) as valor_absoluto
  from production_commercial_search_events

  union all

  select
    'volume_execucao',
    'commercial_intent_rate',
    null,
    null,
    count(*) filter (where coalesce(metadata->>'intent_type', '') = 'COMMERCIAL')
  from production_commercial_search_events

  union all

  select
    'volume_execucao',
    'mixed_intent_rate',
    null,
    null,
    count(*) filter (where coalesce(metadata->>'intent_type', '') = 'MIXED')
  from production_commercial_search_events

  union all

  select
    'volume_execucao',
    'search_executed_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'search_execution_status', '') = 'EXECUTED'
    )
  from production_commercial_search_events

  union all

  select
    'volume_execucao',
    'search_not_executed_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'search_execution_status', '') = 'NOT_EXECUTED'
    )
  from production_commercial_search_events

  union all

  select
    'volume_execucao',
    'search_aborted_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'search_execution_status', '') = 'ABORTED'
    )
  from production_commercial_search_events

  union all

  select
    'volume_execucao',
    'search_failed_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'search_execution_status', '') = 'FAILED'
    )
  from production_commercial_search_events
)
select
  rd.dia_referencia,
  mr.tipo_analise,
  mr.metrica,
  mr.dimensao,
  mr.dimensao_valor,
  mr.valor_absoluto,
  round(
    case
      when t.registros_total > 0 then mr.valor_absoluto::numeric / t.registros_total
      else null
    end,
    4
  ) as valor_relativo,
  t.registros_total,
  'total_commercial_search_events'::text as referencia_denominador,
  case when t.registros_total >= 20 then true else false end as amostra_analisavel
from metric_rows mr
cross join totals t
cross join reference_day rd
order by mr.metrica;
