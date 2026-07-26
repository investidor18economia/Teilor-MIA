with central_active as (
  select *
  from product_specs
  where coalesce(is_active, true)
),
phone_all as (
  select
    coalesce(nullif(trim(brand), ''), '(sem marca)') as marca,
    coalesce(nullif(trim(model_family), ''), '(sem família)') as familia,
    official_name
  from phone_specs
),
brand_central as (
  select
    'central' as camada,
    coalesce(nullif(trim(category), ''), '(sem categoria)') as categoria,
    coalesce(nullif(trim(brand), ''), '(sem marca)') as marca,
    count(*) as registros
  from central_active
  group by 1, 2, 3
),
brand_detail_phone as (
  select
    'detail' as camada,
    'phone' as categoria,
    marca,
    count(*) as registros,
    count(distinct familia) as familias_distintas,
    count(distinct official_name) as modelos_distintos
  from phone_all
  group by marca
),
family_central as (
  select
    coalesce(nullif(trim(category), ''), '(sem categoria)') as categoria,
    coalesce(nullif(trim(brand), ''), '(sem marca)') as marca,
    coalesce(nullif(trim(model_family), ''), '(sem família)') as familia,
    count(*) as registros
  from central_active
  group by 1, 2, 3
),
category_totals as (
  select
    coalesce(nullif(trim(category), ''), '(sem categoria)') as categoria,
    count(*) as registros_total
  from central_active
  group by 1
),
brand_rank_central as (
  select
    bc.*,
    sum(bc.registros) over (partition by bc.categoria) as total_categoria,
    row_number() over (partition by bc.categoria order by bc.registros desc, bc.marca) as posicao,
    sum(bc.registros) over (partition by bc.categoria order by bc.registros desc, bc.marca rows unbounded preceding) as cumsum
  from brand_central bc
),
concentration_central as (
  select
    categoria,
    max(case when posicao = 1 then registros end) as top1_registros,
    max(case when posicao = 1 then round(registros::numeric / nullif(total_categoria, 0), 4) end) as top1_pct,
    sum(case when posicao <= 3 then registros else 0 end) as top3_registros,
    max(total_categoria) as total_categoria,
    min(case when cumsum >= total_categoria * 0.5 then posicao end) as entidades_para_50pct,
    min(case when cumsum >= total_categoria * 0.8 then posicao end) as entidades_para_80pct,
    count(*) as entidades_total
  from brand_rank_central
  group by categoria
),
single_model_brands_central as (
  select count(*) as marcas_um_modelo
  from (
    select brand, count(*) as c
    from central_active
    where brand is not null and trim(brand) <> ''
    group by brand
    having count(*) = 1
  ) x
),
single_model_families_central as (
  select count(*) as familias_um_modelo
  from (
    select model_family, count(*) as c
    from central_active
    where model_family is not null and trim(model_family) <> ''
    group by model_family
    having count(*) = 1
  ) x
),
combined as (
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'distribuicao_marca' as tipo_analise,
  'distribuicao' as dimensao_estatistica,
  bc.camada,
  bc.categoria,
  'marca' as entidade_tipo,
  bc.marca as entidade_nome,
  'registros' as metrica,
  bc.registros as valor_absoluto,
  case when bc.total_categoria = 0 then null else round(bc.registros::numeric / bc.total_categoria, 4) end as valor_relativo,
  bc.total_categoria as registros_total,
  bc.registros as amostra_analisavel,
  concat('product_specs ativos · categoria ', bc.categoria) as referencia_denominador,
  'Participação no Data Layer ≠ market share' as limitacao
from brand_rank_central bc

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'distribuicao_marca',
  'distribuicao',
  bdp.camada,
  bdp.categoria,
  'marca',
  bdp.marca,
  'registros',
  bdp.registros,
  case when (select count(*) from phone_specs) = 0 then null else round(bdp.registros::numeric / (select count(*) from phone_specs), 4) end,
  (select count(*) from phone_specs),
  bdp.registros,
  'phone_specs · participação por marca no inventário detail',
  null
from brand_detail_phone bdp

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'distribuicao_familia',
  'distribuicao',
  'central',
  fc.categoria,
  'familia',
  concat(fc.marca, ' · ', fc.familia),
  'registros',
  fc.registros,
  case when ct.registros_total = 0 then null else round(fc.registros::numeric / ct.registros_total, 4) end,
  ct.registros_total,
  fc.registros,
  concat('product_specs ativos · categoria ', fc.categoria),
  null
from family_central fc
join category_totals ct on ct.categoria = fc.categoria

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'concentracao',
  'concentracao',
  'central',
  cc.categoria,
  'marca',
  cc.categoria,
  'top1_participacao',
  cc.top1_registros,
  cc.top1_pct,
  cc.total_categoria,
  cc.total_categoria,
  concat('Maior marca · categoria ', cc.categoria, ' · product_specs ativos'),
  case when cc.entidades_total < 3 then 'Universo <3 entidades — top3 parcial' else null end
from concentration_central cc

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'concentracao',
  'concentracao',
  'central',
  cc.categoria,
  'marca',
  cc.categoria,
  'top3_participacao',
  cc.top3_registros,
  case when cc.total_categoria = 0 then null else round(cc.top3_registros::numeric / cc.total_categoria, 4) end,
  cc.total_categoria,
  cc.total_categoria,
  concat('Três maiores marcas · categoria ', cc.categoria),
  case when cc.entidades_total < 3 then 'Universo <3 marcas — métrica adaptada' else null end
from concentration_central cc

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'concentracao',
  'concentracao',
  'central',
  cc.categoria,
  'marca',
  cc.categoria,
  'entidades_para_50pct',
  cc.entidades_para_50pct,
  case when cc.total_categoria = 0 then null else round(cc.entidades_para_50pct::numeric / nullif(cc.entidades_total, 0), 4) end,
  cc.entidades_total,
  cc.entidades_total,
  concat('Marcas necessárias para 50% do inventário central · ', cc.categoria),
  case when cc.entidades_total < 2 then 'Universo insuficiente — NULL aplicável' else null end
from concentration_central cc

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'concentracao',
  'concentracao',
  'central',
  cc.categoria,
  'marca',
  cc.categoria,
  'entidades_para_80pct',
  cc.entidades_para_80pct,
  case when cc.total_categoria = 0 then null else round(cc.entidades_para_80pct::numeric / nullif(cc.entidades_total, 0), 4) end,
  cc.entidades_total,
  cc.entidades_total,
  concat('Marcas necessárias para 80% do inventário central · ', cc.categoria),
  null
from concentration_central cc

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'diversidade',
  'diversidade',
  'central',
  null,
  'marca',
  'catalogo_central',
  'marcas_com_um_modelo',
  smb.marcas_um_modelo,
  case when (select count(distinct brand) from central_active where brand is not null and trim(brand) <> '') = 0
    then null
    else round(
      smb.marcas_um_modelo::numeric
      / nullif((select count(distinct brand) from central_active where brand is not null and trim(brand) <> ''), 0),
      4
    )
  end,
  (select count(distinct brand) from central_active where brand is not null and trim(brand) <> ''),
  (select count(*) from central_active),
  'product_specs ativos · marcas com exatamente 1 modelo central',
  null
from single_model_brands_central smb

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'diversidade',
  'diversidade',
  'central',
  null,
  'familia',
  'catalogo_central',
  'familias_com_um_modelo',
  smf.familias_um_modelo,
  case when (select count(distinct model_family) from central_active where model_family is not null and trim(model_family) <> '') = 0
    then null
    else round(
      smf.familias_um_modelo::numeric
      / nullif((select count(distinct model_family) from central_active where model_family is not null and trim(model_family) <> ''), 0),
      4
    )
  end,
  (select count(distinct model_family) from central_active where model_family is not null and trim(model_family) <> ''),
  (select count(*) from central_active),
  'product_specs ativos · famílias com exatamente 1 modelo central',
  null
from single_model_families_central smf
)
select * from combined
order by tipo_analise, categoria nulls first, valor_absoluto desc nulls last;
