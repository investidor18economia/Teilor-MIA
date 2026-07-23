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
