with active_catalog as (
  select *
  from product_specs
  where coalesce(is_active, true)
),
category_totals as (
  select category as categoria, count(*) as total_categoria
  from active_catalog
  group by category
),
brand_coverage as (
  select
    ac.category as categoria,
    coalesce(nullif(trim(ac.brand), ''), '(sem marca)') as marca,
    count(*) as modelos_ativos,
    count(*) filter (where ac.detail_id is not null) as modelos_com_detail,
    count(distinct ac.model_family) filter (where ac.model_family is not null and trim(ac.model_family) <> '') as familias_distintas
  from active_catalog ac
  group by ac.category, coalesce(nullif(trim(ac.brand), ''), '(sem marca)')
),
family_coverage as (
  select
    ac.category as categoria,
    coalesce(nullif(trim(ac.brand), ''), '(sem marca)') as marca,
    coalesce(nullif(trim(ac.model_family), ''), '(sem família)') as familia,
    count(*) as modelos_ativos,
    count(*) filter (where ac.detail_id is not null) as modelos_com_detail
  from active_catalog ac
  group by
    ac.category,
    coalesce(nullif(trim(ac.brand), ''), '(sem marca)'),
    coalesce(nullif(trim(ac.model_family), ''), '(sem família)')
)
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'cobertura_marca' as tipo_analise,
  bc.categoria,
  bc.marca,
  null::text as familia,
  bc.modelos_ativos,
  bc.modelos_com_detail,
  bc.familias_distintas,
  round(bc.modelos_ativos::numeric / nullif(ct.total_categoria, 0), 4) as pct_modelos_na_categoria,
  case
    when bc.modelos_ativos = 0 then null
    else round(bc.modelos_com_detail::numeric / nullif(bc.modelos_ativos, 0), 4)
  end as pct_hidratacao_detail
from brand_coverage bc
join category_totals ct on ct.categoria = bc.categoria

union all

select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'cobertura_familia' as tipo_analise,
  fc.categoria,
  fc.marca,
  fc.familia,
  fc.modelos_ativos,
  fc.modelos_com_detail,
  null::bigint as familias_distintas,
  round(fc.modelos_ativos::numeric / nullif(ct.total_categoria, 0), 4) as pct_modelos_na_categoria,
  case
    when fc.modelos_ativos = 0 then null
    else round(fc.modelos_com_detail::numeric / nullif(fc.modelos_ativos, 0), 4)
  end as pct_hidratacao_detail
from family_coverage fc
join category_totals ct on ct.categoria = fc.categoria
