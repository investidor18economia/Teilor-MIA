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
    'caminhos_busca'::text as tipo_analise,
    'search_path_count'::text as metrica,
    'search_path'::text as dimensao,
    coalesce(metadata->>'search_path', 'UNKNOWN') as dimensao_valor,
    count(*) as valor_absoluto
  from production_commercial_search_events
  group by coalesce(metadata->>'search_path', 'UNKNOWN')

  union all

  select
    'caminhos_busca',
    'runtime_mode_count',
    'runtime_mode',
    coalesce(metadata->>'runtime_mode', 'UNKNOWN'),
    count(*)
  from production_commercial_search_events
  group by coalesce(metadata->>'runtime_mode', 'UNKNOWN')

  union all

  select
    'caminhos_busca',
    'provider_continuation_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'provider_continuation_required', '') = 'true'
    )
  from production_commercial_search_events

  union all

  select
    'caminhos_busca',
    'data_layer_attempted_rate',
    null,
    null,
    count(*) filter (
      where coalesce(metadata->>'data_layer_attempted', '') = 'true'
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
