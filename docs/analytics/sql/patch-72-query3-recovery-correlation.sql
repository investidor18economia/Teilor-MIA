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
