with referencia_comercial as (
  select *
  from (
    values
      ('phone', 'Samsung', 'Galaxy S', 'Flagship Samsung'),
      ('phone', 'Samsung', 'Galaxy A', 'Linha intermediária Samsung'),
      ('phone', 'Samsung', 'Galaxy M', 'Linha entrada Samsung'),
      ('phone', 'Samsung', 'Galaxy Z', 'Dobrável Samsung'),
      ('phone', 'Motorola', 'Edge', 'Linha premium Motorola'),
      ('phone', 'Motorola', 'Moto G', 'Linha volume Motorola'),
      ('phone', 'Apple', 'iPhone', 'Linha Apple'),
      ('phone', 'Xiaomi', 'Redmi', 'Linha volume Xiaomi'),
      ('phone', 'Xiaomi', 'POCO', 'Linha performance Xiaomi'),
      ('notebook', 'Lenovo', null, 'Marca notebook BR'),
      ('notebook', 'Dell', null, 'Marca notebook BR'),
      ('notebook', 'Acer', null, 'Marca notebook BR'),
      ('notebook', 'ASUS', null, 'Marca notebook BR'),
      ('notebook', 'Samsung', null, 'Marca notebook BR')
  ) as r(categoria, marca, familia, linha_comercial)
),
active_catalog as (
  select *
  from product_specs
  where coalesce(is_active, true)
),
ref_central as (
  select
    rc.categoria,
    rc.marca,
    rc.familia,
    rc.linha_comercial,
    count(ac.official_name) as modelos_central
  from referencia_comercial rc
  left join active_catalog ac
    on ac.category = rc.categoria
    and lower(trim(ac.brand)) = lower(trim(rc.marca))
    and (
      rc.familia is null
      or ac.model_family ilike rc.familia || '%'
      or ac.official_name ilike '%' || rc.familia || '%'
    )
  group by rc.categoria, rc.marca, rc.familia, rc.linha_comercial
),
phone_inventory as (
  select
    'phone' as categoria,
    coalesce(nullif(trim(brand), ''), '(sem marca)') as marca,
    coalesce(nullif(trim(model_family), ''), '(sem família)') as familia,
    count(*) as modelos_detail
  from phone_specs
  group by 1, 2, 3
),
ref_detail_phone as (
  select
    rc.categoria,
    rc.marca,
    rc.familia,
    rc.linha_comercial,
    coalesce(sum(pi.modelos_detail), 0) as modelos_detail
  from referencia_comercial rc
  left join phone_inventory pi
    on rc.categoria = 'phone'
    and lower(pi.marca) = lower(rc.marca)
    and (
      rc.familia is null
      or pi.familia ilike rc.familia || '%'
      or pi.familia ilike '%' || rc.familia || '%'
    )
  where rc.categoria = 'phone'
  group by rc.categoria, rc.marca, rc.familia, rc.linha_comercial
),
notebook_inventory as (
  select
    coalesce(nullif(trim(brand), ''), '(sem marca)') as marca,
    count(*) as modelos_detail
  from notebook_specs
  group by 1
),
ref_detail_notebook as (
  select
    rc.categoria,
    rc.marca,
    rc.familia,
    rc.linha_comercial,
    coalesce(ni.modelos_detail, 0) as modelos_detail
  from referencia_comercial rc
  left join notebook_inventory ni on lower(ni.marca) = lower(rc.marca)
  where rc.categoria = 'notebook'
),
commercial_status as (
  select
    rc.categoria,
    rc.marca,
    rc.familia,
    rc.linha_comercial,
    coalesce(rcc.modelos_central, 0) as modelos_central,
    case
      when rc.categoria = 'phone' then coalesce(rdp.modelos_detail, 0)
      when rc.categoria = 'notebook' then coalesce(rdn.modelos_detail, 0)
      else 0
    end as modelos_detail,
    case
      when coalesce(rcc.modelos_central, 0) = 0
        and (
          case
            when rc.categoria = 'phone' then coalesce(rdp.modelos_detail, 0)
            when rc.categoria = 'notebook' then coalesce(rdn.modelos_detail, 0)
            else 0
          end
        ) = 0 then 'ausente'
      when coalesce(rcc.modelos_central, 0) = 0
        and (
          case
            when rc.categoria = 'phone' then coalesce(rdp.modelos_detail, 0)
            when rc.categoria = 'notebook' then coalesce(rdn.modelos_detail, 0)
            else 0
          end
        ) > 0 then 'latente_sem_central'
      when coalesce(rcc.modelos_central, 0) > 0
        and (
          case
            when rc.categoria = 'phone' then coalesce(rdp.modelos_detail, 0)
            when rc.categoria = 'notebook' then coalesce(rdn.modelos_detail, 0)
            else 0
          end
        ) > coalesce(rcc.modelos_central, 0) then 'parcial'
      when coalesce(rcc.modelos_central, 0) > 0 then 'presente'
      else 'ausente'
    end as status_linha_comercial,
    case
      when rc.categoria = 'phone' and coalesce(rdp.modelos_detail, 0) = 0 then null
      when rc.categoria = 'notebook' and coalesce(rdn.modelos_detail, 0) = 0 then null
      when rc.categoria = 'phone' then round(
        coalesce(rcc.modelos_central, 0)::numeric / nullif(coalesce(rdp.modelos_detail, 0), 0),
        4
      )
      when rc.categoria = 'notebook' then round(
        coalesce(rcc.modelos_central, 0)::numeric / nullif(coalesce(rdn.modelos_detail, 0), 0),
        4
      )
      else null
    end as pct_exposicao_runtime_sobre_detail
  from referencia_comercial rc
  left join ref_central rcc
    on rcc.categoria = rc.categoria
    and rcc.marca = rc.marca
    and rcc.familia is not distinct from rc.familia
  left join ref_detail_phone rdp
    on rdp.categoria = rc.categoria
    and rdp.marca = rc.marca
    and rdp.familia is not distinct from rc.familia
  left join ref_detail_notebook rdn
    on rdn.categoria = rc.categoria
    and rdn.marca = rc.marca
),
category_gaps as (
  select
    rc.categoria,
    null::text as marca,
    null::text as familia,
    'Categoria detectada pelo runtime sem catálogo central ativo' as linha_comercial,
    0 as modelos_central,
    coalesce(di.registros_detail, 0) as modelos_detail,
    case
      when coalesce(cc.modelos_ativos, 0) = 0 and rc.tem_detail_table and coalesce(di.registros_detail, 0) > 0
        then 'latente_sem_central'
      when coalesce(cc.modelos_ativos, 0) = 0 and rc.tem_detail_table then 'ausente'
      when coalesce(cc.modelos_ativos, 0) = 0 then 'ausente'
      else 'presente'
    end as status_linha_comercial,
    null::numeric as pct_exposicao_runtime_sobre_detail
  from (
    values
      ('notebook', true),
      ('phone', true)
  ) as rc(categoria, tem_detail_table)
  left join (
    select category as categoria, count(*) as modelos_ativos
    from product_specs
    where coalesce(is_active, true)
    group by category
  ) cc on cc.categoria = rc.categoria
  left join (
    select 'phone' as categoria, count(*) as registros_detail from phone_specs
    union all
    select 'notebook', count(*) from notebook_specs
  ) di on di.categoria = rc.categoria
  where coalesce(cc.modelos_ativos, 0) = 0 or rc.categoria = 'notebook'
),
all_gaps as (
  select * from commercial_status
  union all
  select * from category_gaps
  where status_linha_comercial in ('ausente', 'latente_sem_central', 'parcial')
),
prioritized as (
  select
    ag.*,
    case
      when ag.categoria = 'notebook' and ag.modelos_central = 0 and ag.modelos_detail > 0
        then 'prioridade_alta'
      when ag.status_linha_comercial = 'ausente' and ag.familia is not null
        then 'prioridade_alta'
      when ag.status_linha_comercial = 'latente_sem_central'
        then 'prioridade_alta'
      when ag.status_linha_comercial = 'parcial'
        then 'prioridade_media'
      when ag.status_linha_comercial = 'ausente' and ag.familia is null and ag.categoria = 'notebook'
        then 'prioridade_media'
      else 'prioridade_baixa'
    end as prioridade_expansao,
    case
      when ag.status_linha_comercial = 'ausente' and ag.familia is not null
        then 'Linha comercial de referência sem modelos no catálogo central'
      when ag.status_linha_comercial = 'latente_sem_central'
        then 'Inventário detail existe mas searchUniversalDataLayer() não expõe (product_specs vazio)'
      when ag.status_linha_comercial = 'parcial'
        then 'Catálogo central cobre parte do inventário detail compatível'
      when ag.categoria = 'notebook' and ag.modelos_central = 0
        then 'Runtime detecta notebook; detail_table tem registros sem product_specs'
      else 'Monitorar — cobertura presente ou referência parcial'
    end as justificativa_prioridade
  from all_gaps ag
)
select * from (
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'lacuna_comercial' as tipo_analise,
  cs.categoria,
  cs.marca,
  cs.familia,
  cs.linha_comercial,
  cs.modelos_central,
  cs.modelos_detail,
  cs.status_linha_comercial,
  cs.pct_exposicao_runtime_sobre_detail,
  null::text as prioridade_expansao,
  null::text as justificativa_prioridade
from commercial_status cs
where cs.status_linha_comercial <> 'presente'
   or cs.pct_exposicao_runtime_sobre_detail is not null

union all

select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'cobertura_relativa' as tipo_analise,
  cs.categoria,
  cs.marca,
  cs.familia,
  cs.linha_comercial,
  cs.modelos_central,
  cs.modelos_detail,
  cs.status_linha_comercial,
  cs.pct_exposicao_runtime_sobre_detail,
  null::text as prioridade_expansao,
  case
    when cs.pct_exposicao_runtime_sobre_detail is null
      then 'Sem inventário detail compatível — pct relativo indisponível'
    else 'Referência: modelos_central / modelos_detail (mesmo padrão marca+família)'
  end as justificativa_prioridade
from commercial_status cs
where cs.modelos_central > 0 or cs.modelos_detail > 0

union all

select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'prioridade_expansao' as tipo_analise,
  p.categoria,
  p.marca,
  p.familia,
  p.linha_comercial,
  p.modelos_central,
  p.modelos_detail,
  p.status_linha_comercial,
  p.pct_exposicao_runtime_sobre_detail,
  p.prioridade_expansao,
  p.justificativa_prioridade
from prioritized p
) combined
order by
  case combined.prioridade_expansao
    when 'prioridade_alta' then 1
    when 'prioridade_media' then 2
    else 3
  end nulls last,
  combined.tipo_analise,
  combined.categoria,
  combined.marca;
