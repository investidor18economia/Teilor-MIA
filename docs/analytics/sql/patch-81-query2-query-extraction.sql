with production_commercial_search_events as (
  select *
  from analytics_events
  where event_name = 'mia_commercial_search'
    and not (
      category = 'commercial_search_test'
      or coalesce(metadata->>'controlled_test', '') = 'true'
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
    'extracao_query'::text as tipo_analise,
    'extraction_success_rate'::text as metrica,
    null::text as dimensao,
    null::text as dimensao_valor,
    count(*) filter (
      where coalesce(metadata->>'query_extraction_status', '') = 'SUCCESS'
    ) as valor_absoluto
  from production_commercial_search_events

  union all

  select
    'extracao_query',
    'extraction_partial_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'query_extraction_status', '') = 'PARTIAL'
    )
  from production_commercial_search_events

  union all

  select
    'extracao_query',
    'extraction_failed_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'query_extraction_status', '') = 'FAILED'
    )
  from production_commercial_search_events

  union all

  select
    'extracao_query',
    'query_changed_rate',
    null,
    null,
    count(*) filter (where coalesce(metadata->>'query_changed', '') = 'true')
  from production_commercial_search_events

  union all

  select
    'extracao_query',
    'query_change_type_count',
    'query_change_type',
    coalesce(metadata->>'query_change_type', 'UNKNOWN'),
    count(*)
  from production_commercial_search_events
  group by coalesce(metadata->>'query_change_type', 'UNKNOWN')

  union all

  select
    'extracao_query',
    'mixed_intent_with_extraction_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'intent_type', '') = 'MIXED'
        and coalesce(metadata->>'query_extraction_status', '') in ('SUCCESS', 'PARTIAL')
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
order by mr.metrica, mr.dimensao_valor nulls first;
