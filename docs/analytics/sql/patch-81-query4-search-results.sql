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
    'resultado_busca'::text as tipo_analise,
    'search_result_status_count'::text as metrica,
    'search_result_status'::text as dimensao,
    coalesce(metadata->>'search_result_status', 'UNKNOWN') as dimensao_valor,
    count(*) as valor_absoluto
  from production_commercial_search_events
  group by coalesce(metadata->>'search_result_status', 'UNKNOWN')

  union all

  select
    'resultado_busca',
    'average_results_count',
    null,
    null,
    round(avg(coalesce((metadata->>'results_count')::numeric, 0)))::bigint
  from production_commercial_search_events

  union all

  select
    'resultado_busca',
    'results_by_category',
    'category',
    coalesce(category, metadata->>'category', 'unknown'),
    count(*)
  from production_commercial_search_events
  group by coalesce(category, metadata->>'category', 'unknown')

  union all

  select
    'resultado_busca',
    'results_by_runtime_mode',
    'runtime_mode',
    coalesce(metadata->>'runtime_mode', 'UNKNOWN'),
    count(*)
  from production_commercial_search_events
  group by coalesce(metadata->>'runtime_mode', 'UNKNOWN')
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
