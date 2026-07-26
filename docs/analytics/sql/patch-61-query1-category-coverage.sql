with runtime_categories as (
  select *
  from (
    values
      ('phone', 'phone_specs', true, 'detecção + detail_table'),
      ('notebook', 'notebook_specs', true, 'detecção + detail_table'),
      ('computer', null, false, 'detecção apenas'),
      ('storage', null, false, 'detecção apenas'),
      ('console', null, false, 'detecção apenas'),
      ('tv', null, false, 'detecção apenas'),
      ('monitor', null, false, 'detecção apenas'),
      ('audio', null, false, 'detecção apenas'),
      ('chair', null, false, 'detecção apenas'),
      ('fridge', null, false, 'detecção apenas'),
      ('washer', null, false, 'detecção apenas'),
      ('tablet', null, false, 'detecção apenas'),
      ('car_part', null, false, 'detecção apenas'),
      ('kitchen', null, false, 'detecção apenas')
  ) as t(categoria, detail_table, tem_detail_table, modo_suporte_runtime)
),
central_catalog as (
  select
    category as categoria,
    count(*) filter (where coalesce(is_active, true)) as modelos_ativos,
    count(*) filter (where coalesce(is_active, true) and detail_id is not null) as modelos_com_detail,
    count(*) filter (where coalesce(is_active, true) and detail_table is not null and detail_table <> '') as modelos_com_detail_table
  from product_specs
  group by category
),
detail_inventory as (
  select 'phone' as categoria, count(*) as registros_detail from phone_specs
  union all
  select 'notebook', count(*) from notebook_specs
),
detail_orphans as (
  select
    'phone' as categoria,
    count(*) as registros_detail_orfaos
  from phone_specs ph
  where not exists (
    select 1
    from product_specs ps
    where ps.detail_id = ph.id
      and ps.detail_table = 'phone_specs'
      and coalesce(ps.is_active, true)
  )
  union all
  select
    'notebook',
    count(*)
  from notebook_specs nb
  where not exists (
    select 1
    from product_specs ps
    where ps.detail_id = nb.id
      and ps.detail_table = 'notebook_specs'
      and coalesce(ps.is_active, true)
  )
)
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'cobertura_categoria' as tipo_analise,
  rc.categoria,
  rc.detail_table,
  rc.modo_suporte_runtime,
  coalesce(cc.modelos_ativos, 0) as modelos_ativos,
  coalesce(cc.modelos_com_detail, 0) as modelos_com_detail,
  coalesce(di.registros_detail, 0) as registros_detail,
  coalesce(do2.registros_detail_orfaos, 0) as registros_detail_orfaos,
  case
    when coalesce(cc.modelos_ativos, 0) > 0
      and coalesce(cc.modelos_com_detail, 0) < coalesce(cc.modelos_ativos, 0) then 'parcial'
    when coalesce(cc.modelos_ativos, 0) > 0 then 'presente'
    when rc.tem_detail_table and coalesce(di.registros_detail, 0) > 0 then 'latente_sem_central'
    when coalesce(cc.modelos_ativos, 0) = 0 and rc.tem_detail_table then 'ausente'
    else 'ausente'
  end as status_cobertura,
  case
    when coalesce(cc.modelos_ativos, 0) = 0 then null
    else round(
      coalesce(cc.modelos_com_detail, 0)::numeric
      / nullif(coalesce(cc.modelos_ativos, 0), 0),
      4
    )
  end as pct_hidratacao_detail_central,
  case
    when coalesce(di.registros_detail, 0) = 0 then null
    else round(
      (coalesce(di.registros_detail, 0) - coalesce(do2.registros_detail_orfaos, 0))::numeric
      / nullif(coalesce(di.registros_detail, 0), 0),
      4
    )
  end as pct_detail_exposto_ao_runtime
from runtime_categories rc
left join central_catalog cc on cc.categoria = rc.categoria
left join detail_inventory di on di.categoria = rc.categoria
left join detail_orphans do2 on do2.categoria = rc.categoria
order by
  case
    when coalesce(cc.modelos_ativos, 0) > 0
      and coalesce(cc.modelos_com_detail, 0) < coalesce(cc.modelos_ativos, 0) then 3
    when coalesce(cc.modelos_ativos, 0) > 0 then 4
    when rc.tem_detail_table and coalesce(di.registros_detail, 0) > 0 then 2
    else 1
  end,
  rc.categoria;
