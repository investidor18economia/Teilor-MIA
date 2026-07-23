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
