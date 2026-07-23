-- PATCH 8.1 Q5 — Diagnostic correlation by request_id (audit query, not permanent dashboard)
with production_commercial_search_events as (
  select
    metadata->>'request_id' as request_id,
    created_at,
    metadata->>'intent_type' as intent_type,
    metadata->>'search_execution_status' as search_execution_status,
    metadata->>'search_path' as search_path,
    metadata->>'search_result_status' as search_result_status,
    metadata->>'results_count' as results_count
  from analytics_events
  where event_name = 'mia_commercial_search'
    and coalesce(metadata->>'request_id', '') <> ''
    and not (
      category = 'commercial_search_test'
      or coalesce(metadata->>'controlled_test', '') = 'true'
    )
),
correlated as (
  select
    cs.request_id,
    cs.created_at as commercial_search_at,
    cs.intent_type,
    cs.search_execution_status,
    cs.search_path,
    cs.search_result_status,
    cs.results_count,
    dl.metadata->>'response_classification' as data_layer_classification,
    ro.metadata->>'outcome' as response_outcome,
    le.metadata->>'total_duration_ms' as latency_total_ms
  from production_commercial_search_events cs
  left join analytics_events dl
    on dl.event_name = 'data_layer_resolution'
   and dl.metadata->>'request_id' = cs.request_id
  left join analytics_events ro
    on ro.event_name = 'mia_response_outcome'
   and ro.metadata->>'request_id' = cs.request_id
  left join analytics_events le
    on le.event_name = 'mia_latency_event'
   and le.metadata->>'request_id' = cs.request_id
)
select
  current_date as dia_referencia,
  'correlacao_diagnostica'::text as tipo_analise,
  'correlated_requests'::text as metrica,
  null::text as dimensao,
  null::text as dimensao_valor,
  count(distinct request_id)::bigint as valor_absoluto,
  null::numeric as valor_relativo,
  count(distinct request_id)::bigint as registros_total,
  'correlated_request_id'::text as referencia_denominador,
  case when count(distinct request_id) >= 5 then true else false end as amostra_analisavel
from correlated

union all

select
  current_date,
  'correlacao_diagnostica',
  'with_data_layer_resolution',
  null,
  null,
  count(distinct request_id) filter (where data_layer_classification is not null),
  null,
  count(distinct request_id),
  'correlated_request_id',
  case when count(distinct request_id) >= 5 then true else false end
from correlated

union all

select
  current_date,
  'correlacao_diagnostica',
  'with_response_outcome',
  null,
  null,
  count(distinct request_id) filter (where response_outcome is not null),
  null,
  count(distinct request_id),
  'correlated_request_id',
  case when count(distinct request_id) >= 5 then true else false end
from correlated

union all

select
  current_date,
  'correlacao_diagnostica',
  'with_latency_event',
  null,
  null,
  count(distinct request_id) filter (where latency_total_ms is not null),
  null,
  count(distinct request_id),
  'correlated_request_id',
  case when count(distinct request_id) >= 5 then true else false end
from correlated

order by metrica;
