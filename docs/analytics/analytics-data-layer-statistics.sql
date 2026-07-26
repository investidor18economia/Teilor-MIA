-- PATCH 6.3 — Data Layer Statistics (read-only · catalog tables)
-- Runtime: searchUniversalDataLayer() · getProductDetailSpecsFromSupabase()
-- Tables: product_specs · phone_specs · notebook_specs
-- NÃO duplica: PATCH 4.5 (Analytics) · PATCH 6.1 (cobertura/lacunas) · PATCH 6.2 (qualidade) · 6.4 (uso)
-- Regra Fase 6: valor_absoluto + valor_relativo + registros_total + referencia_denominador
--
-- Query 1 — Inventário consolidado · distribuição categoria · exposição central/detail
-- Query 2 — Distribuição marca/família · concentração · diversidade
-- Query 3 — Atributos técnicos · faixas · variantes
-- Query 4 — Temporal · proveniência · painel · insights

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Consolidated inventory and category distribution
-- Separate totals per table — no artificial cross-table product deduplication
-- ═══════════════════════════════════════════════════════════════════════════════

with central_all as (
  select * from product_specs
),
central_active as (
  select * from product_specs where coalesce(is_active, true)
),
central_inactive as (
  select * from product_specs where not coalesce(is_active, true)
),
phone_linked as (
  select ph.*
  from phone_specs ph
  where exists (
    select 1 from product_specs ps
    where ps.detail_id = ph.id
      and ps.detail_table = 'phone_specs'
      and coalesce(ps.is_active, true)
  )
),
phone_unlinked as (
  select ph.*
  from phone_specs ph
  where not exists (
    select 1 from product_specs ps
    where ps.detail_id = ph.id
      and ps.detail_table = 'phone_specs'
      and coalesce(ps.is_active, true)
  )
),
notebook_linked as (
  select nb.*
  from notebook_specs nb
  where exists (
    select 1 from product_specs ps
    where ps.detail_id = nb.id
      and ps.detail_table = 'notebook_specs'
      and coalesce(ps.is_active, true)
  )
),
notebook_unlinked as (
  select nb.*
  from notebook_specs nb
  where not exists (
    select 1 from product_specs ps
    where ps.detail_id = nb.id
      and ps.detail_table = 'notebook_specs'
      and coalesce(ps.is_active, true)
  )
),
totals as (
  select
    (select count(*) from central_all) as central_total,
    (select count(*) from central_active) as central_ativo,
    (select count(*) from central_inactive) as central_inativo,
    (select count(*) from phone_specs) as phone_detail_total,
    (select count(*) from phone_linked) as phone_ligado,
    (select count(*) from phone_unlinked) as phone_nao_ligado,
    (select count(*) from notebook_specs) as notebook_detail_total,
    (select count(*) from notebook_linked) as notebook_ligado,
    (select count(*) from notebook_unlinked) as notebook_nao_ligado,
    (select count(distinct brand) filter (where brand is not null and trim(brand) <> '') from central_active) as marcas_central,
    (select count(distinct model_family) filter (where model_family is not null and trim(model_family) <> '') from central_active) as familias_central,
    (select count(distinct official_name) filter (where official_name is not null and trim(official_name) <> '') from central_active) as modelos_central,
    (select count(distinct category) filter (where category is not null and trim(category) <> '') from central_active) as categorias_central
),
category_central as (
  select
    coalesce(nullif(trim(category), ''), '(sem categoria)') as categoria,
    count(*) as registros
  from central_active
  group by coalesce(nullif(trim(category), ''), '(sem categoria)')
),
category_inactive as (
  select
    coalesce(nullif(trim(category), ''), '(sem categoria)') as categoria,
    count(*) as registros
  from central_inactive
  group by coalesce(nullif(trim(category), ''), '(sem categoria)')
),
combined as (
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'inventario_consolidado' as tipo_analise,
  'inventario' as dimensao_estatistica,
  'central' as camada,
  null::text as categoria,
  'tabela' as entidade_tipo,
  'product_specs' as entidade_nome,
  'total_registros' as metrica,
  t.central_total::bigint as valor_absoluto,
  null::numeric as valor_relativo,
  t.central_total as registros_total,
  t.central_total as amostra_analisavel,
  'product_specs · total de registros (ativos + inativos)' as referencia_denominador,
  'Totais por tabela — sem deduplicação cross-table' as limitacao
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'inventario_consolidado',
  'inventario',
  'central',
  null,
  'tabela',
  'product_specs',
  'registros_ativos',
  t.central_ativo,
  case when t.central_total = 0 then null else round(t.central_ativo::numeric / t.central_total, 4) end,
  t.central_total,
  t.central_ativo,
  'product_specs · registros com is_active=true (ou null)',
  null
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'inventario_consolidado',
  'inventario',
  'central',
  null,
  'tabela',
  'product_specs',
  'registros_inativos',
  t.central_inativo,
  case when t.central_total = 0 then null else round(t.central_inativo::numeric / t.central_total, 4) end,
  t.central_total,
  t.central_inativo,
  'product_specs · registros com is_active=false',
  null
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'inventario_consolidado',
  'inventario',
  'detail',
  'phone',
  'tabela',
  'phone_specs',
  'total_registros',
  t.phone_detail_total,
  null,
  t.phone_detail_total,
  t.phone_detail_total,
  'phone_specs · inventário detail phone',
  null
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'inventario_consolidado',
  'inventario',
  'detail',
  'notebook',
  'tabela',
  'notebook_specs',
  'total_registros',
  t.notebook_detail_total,
  null,
  t.notebook_detail_total,
  t.notebook_detail_total,
  'notebook_specs · inventário detail notebook',
  null
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'inventario_consolidado',
  'diversidade',
  'central',
  null,
  'dimensao',
  'catalogo_central_ativo',
  'marcas_distintas',
  t.marcas_central,
  null,
  t.central_ativo,
  t.central_ativo,
  'product_specs ativos · count(distinct brand)',
  'Participação no Data Layer ≠ market share'
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'inventario_consolidado',
  'diversidade',
  'central',
  null,
  'dimensao',
  'catalogo_central_ativo',
  'familias_distintas',
  t.familias_central,
  null,
  t.central_ativo,
  t.central_ativo,
  'product_specs ativos · count(distinct model_family)',
  null
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'inventario_consolidado',
  'diversidade',
  'central',
  null,
  'dimensao',
  'catalogo_central_ativo',
  'modelos_distintos',
  t.modelos_central,
  null,
  t.central_ativo,
  t.central_ativo,
  'product_specs ativos · count(distinct official_name)',
  null
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'inventario_consolidado',
  'diversidade',
  'central',
  null,
  'dimensao',
  'catalogo_central_ativo',
  'categorias_presentes',
  t.categorias_central,
  null,
  t.central_ativo,
  t.central_ativo,
  'product_specs ativos · count(distinct category)',
  null
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'distribuicao_categoria',
  'composicao',
  'central',
  cc.categoria,
  'categoria',
  cc.categoria,
  'registros_ativos',
  cc.registros,
  case when t.central_ativo = 0 then null else round(cc.registros::numeric / t.central_ativo, 4) end,
  t.central_ativo,
  cc.registros,
  'product_specs ativos · participação por category',
  null
from category_central cc
cross join totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'distribuicao_categoria',
  'composicao',
  'central',
  ci.categoria,
  'categoria',
  ci.categoria,
  'registros_inativos',
  ci.registros,
  case when t.central_inativo = 0 then null else round(ci.registros::numeric / nullif(t.central_inativo, 0), 4) end,
  t.central_inativo,
  ci.registros,
  'product_specs inativos · participação por category',
  case when t.central_inativo = 0 then 'Sem registros inativos — percentual NULL' else null end
from category_inactive ci
cross join totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'exposicao_central_detail',
  'exposicao',
  'phone',
  'phone',
  'vinculo',
  'phone_specs',
  'detail_ligado_central',
  t.phone_ligado,
  case when t.phone_detail_total = 0 then null else round(t.phone_ligado::numeric / t.phone_detail_total, 4) end,
  t.phone_detail_total,
  t.phone_detail_total,
  'phone_specs ligados a product_specs ativo · contexto estatístico (PATCH 6.1 mediu cobertura)',
  'Não é ranking de expansão — estrutura quantitativa'
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'exposicao_central_detail',
  'exposicao',
  'phone',
  'phone',
  'vinculo',
  'phone_specs',
  'detail_nao_ligado_central',
  t.phone_nao_ligado,
  case when t.phone_detail_total = 0 then null else round(t.phone_nao_ligado::numeric / t.phone_detail_total, 4) end,
  t.phone_detail_total,
  t.phone_detail_total,
  'phone_specs sem product_specs ativo',
  null
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'exposicao_central_detail',
  'exposicao',
  'notebook',
  'notebook',
  'vinculo',
  'notebook_specs',
  'detail_ligado_central',
  t.notebook_ligado,
  case when t.notebook_detail_total = 0 then null else round(t.notebook_ligado::numeric / t.notebook_detail_total, 4) end,
  t.notebook_detail_total,
  t.notebook_detail_total,
  'notebook_specs ligados a product_specs ativo',
  null
from totals t

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'exposicao_central_detail',
  'exposicao',
  'notebook',
  'notebook',
  'vinculo',
  'notebook_specs',
  'detail_nao_ligado_central',
  t.notebook_nao_ligado,
  case when t.notebook_detail_total = 0 then null else round(t.notebook_nao_ligado::numeric / t.notebook_detail_total, 4) end,
  t.notebook_detail_total,
  t.notebook_detail_total,
  'notebook_specs sem product_specs ativo',
  null
from totals t
)
select * from combined
order by tipo_analise, dimensao_estatistica, categoria nulls first, metrica;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Brand/family distribution · concentration · diversity
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Technical attributes · buckets · variants
-- ═══════════════════════════════════════════════════════════════════════════════

with phone_numeric as (
  select ram_gb, storage_gb, battery_mah, refresh_rate_hz, main_camera_mp, performance_score
  from phone_specs
  where ram_gb is not null or storage_gb is not null or battery_mah is not null
),
phone_stats as (
  select
    'phone_specs' as tabela,
    attr.atributo,
    count(*) filter (where attr.valor is not null) as amostra,
    count(*) filter (where attr.valor is null) as sem_valor,
    min(attr.valor) as minimo,
    max(attr.valor) as maximo,
    round(avg(attr.valor)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by attr.valor))::numeric, 2) as mediana,
    round((percentile_cont(0.25) within group (order by attr.valor))::numeric, 2) as p25,
    round((percentile_cont(0.75) within group (order by attr.valor))::numeric, 2) as p75
  from phone_specs ph
  cross join lateral (
    values
      ('ram_gb', ph.ram_gb::numeric),
      ('storage_gb', ph.storage_gb::numeric),
      ('battery_mah', ph.battery_mah::numeric),
      ('refresh_rate_hz', ph.refresh_rate_hz::numeric),
      ('main_camera_mp', ph.main_camera_mp::numeric),
      ('performance_score', ph.performance_score::numeric)
  ) as attr(atributo, valor)
  group by attr.atributo
),
phone_total as (
  select count(*) as n from phone_specs
),
ram_buckets as (
  select
    faixa,
    count(*) as registros
  from (
    select
      case
        when ram_gb is null then '(sem valor)'
        when ram_gb <= 4 then 'até 4 GB'
        when ram_gb <= 8 then 'acima de 4 até 8 GB'
        when ram_gb <= 12 then 'acima de 8 até 12 GB'
        else 'acima de 12 GB'
      end as faixa
    from phone_specs
  ) x
  group by faixa
),
storage_buckets as (
  select
    faixa,
    count(*) as registros
  from (
    select
      case
        when storage_gb is null then '(sem valor)'
        when storage_gb <= 64 then 'até 64 GB'
        when storage_gb <= 128 then 'acima de 64 até 128 GB'
        when storage_gb <= 256 then 'acima de 128 até 256 GB'
        when storage_gb <= 512 then 'acima de 256 até 512 GB'
        else 'acima de 512 GB'
      end as faixa
    from phone_specs
  ) x
  group by faixa
),
variants as (
  select
    official_name,
    count(*) as variantes_total,
    count(distinct ram_gb) filter (where ram_gb is not null) as variantes_ram,
    count(distinct storage_gb) filter (where storage_gb is not null) as variantes_storage
  from phone_specs
  where official_name is not null and trim(official_name) <> ''
  group by official_name
),
variant_summary as (
  select
    count(*) as modelos_canonicos,
    round(avg(variantes_total)::numeric, 2) as media_variantes,
    round((percentile_cont(0.5) within group (order by variantes_total))::numeric, 2) as mediana_variantes,
    max(variantes_total) as max_variantes
  from variants
),
notebook_stats as (
  select
    'notebook_specs' as tabela,
    attr.atributo,
    count(*) filter (where attr.valor is not null) as amostra,
    count(*) filter (where attr.valor is null) as sem_valor,
    min(attr.valor) as minimo,
    max(attr.valor) as maximo,
    round(avg(attr.valor)::numeric, 2) as media,
    round((percentile_cont(0.5) within group (order by attr.valor))::numeric, 2) as mediana,
    round((percentile_cont(0.25) within group (order by attr.valor))::numeric, 2) as p25,
    round((percentile_cont(0.75) within group (order by attr.valor))::numeric, 2) as p75
  from notebook_specs nb
  cross join lateral (
    values
      ('ram_gb', nb.ram_gb::numeric),
      ('storage_gb', nb.storage_gb::numeric),
      ('screen_size_inches', nb.screen_size_inches::numeric),
      ('battery_wh', nb.battery_wh::numeric),
      ('weight_kg', nb.weight_kg::numeric),
      ('performance_score', nb.performance_score::numeric)
  ) as attr(atributo, valor)
  group by attr.atributo
),
notebook_total as (
  select count(*) as n from notebook_specs
),
combined as (
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'estatistica_atributo' as tipo_analise,
  'atributo_tecnico' as dimensao_estatistica,
  'detail' as camada,
  'phone' as categoria,
  'atributo' as entidade_tipo,
  ps.atributo as entidade_nome,
  m.metrica,
  m.valor::numeric as valor_absoluto,
  null::numeric as valor_relativo,
  pt.n as registros_total,
  ps.amostra as amostra_analisavel,
  concat('phone_specs · ', ps.atributo, ' · ', m.metrica),
  case when ps.amostra = 0 then 'Sem valores analisáveis' else null end as limitacao
from phone_stats ps
cross join phone_total pt
cross join lateral (
  values
    ('amostra', ps.amostra),
    ('sem_valor', ps.sem_valor),
    ('minimo', ps.minimo),
    ('maximo', ps.maximo),
    ('media', ps.media),
    ('mediana', ps.mediana),
    ('p25', ps.p25),
    ('p75', ps.p75)
) as m(metrica, valor)
where m.valor is not null

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'faixa_tecnica',
  'distribuicao',
  'detail',
  'phone',
  'faixa',
  'ram_gb',
  rb.faixa,
  rb.registros,
  case when pt.n = 0 then null else round(rb.registros::numeric / pt.n, 4) end,
  pt.n,
  rb.registros,
  'phone_specs · faixas RAM (limites documentados em DATA_LAYER_STATISTICS.md)',
  null
from ram_buckets rb
cross join phone_total pt

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'faixa_tecnica',
  'distribuicao',
  'detail',
  'phone',
  'faixa',
  'storage_gb',
  sb.faixa,
  sb.registros,
  case when pt.n = 0 then null else round(sb.registros::numeric / pt.n, 4) end,
  pt.n,
  sb.registros,
  'phone_specs · faixas armazenamento',
  null
from storage_buckets sb
cross join phone_total pt

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'variantes_modelo',
  'composicao',
  'detail',
  'phone',
  'modelo',
  'phone_specs',
  m.metrica,
  m.valor::numeric,
  null,
  vs.modelos_canonicos,
  vs.modelos_canonicos,
  'phone_specs · variantes por official_name (RAM/storage distintos)',
  'Variante = registro detail — duplicação ≠ variante (PATCH 6.2)'
from variant_summary vs
cross join lateral (
  values
    ('modelos_canonicos', vs.modelos_canonicos),
    ('media_variantes_por_modelo', vs.media_variantes),
    ('mediana_variantes_por_modelo', vs.mediana_variantes),
    ('max_variantes_por_modelo', vs.max_variantes)
) as m(metrica, valor)

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'estatistica_atributo',
  'atributo_tecnico',
  'detail',
  'notebook',
  'atributo',
  ns.atributo,
  m.metrica,
  m.valor::numeric,
  null,
  nt.n,
  ns.amostra,
  concat('notebook_specs · ', ns.atributo, ' · ', m.metrica),
  case when ns.amostra = 0 then 'Sem valores analisáveis' else null end
from notebook_stats ns
cross join notebook_total nt
cross join lateral (
  values
    ('amostra', ns.amostra),
    ('sem_valor', ns.sem_valor),
    ('minimo', ns.minimo),
    ('maximo', ns.maximo),
    ('media', ns.media),
    ('mediana', ns.mediana),
    ('p25', ns.p25),
    ('p75', ns.p75)
) as m(metrica, valor)
where m.valor is not null
)
select * from combined
order by tipo_analise, categoria, entidade_nome, metrica;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 4 — Temporal · provenance · consolidated panel · derived insights
-- ═══════════════════════════════════════════════════════════════════════════════

with phone_total as (
  select count(*) as n from phone_specs
),
verified_parseable as (
  select *
  from phone_specs
  where last_verified_at is not null
    and trim(last_verified_at) <> ''
    and last_verified_at ~ '^\d{4}-\d{2}-\d{2}$'
),
verification_by_month as (
  select
    to_char(last_verified_at::date, 'YYYY-MM') as periodo,
    count(*) as registros
  from verified_parseable
  group by 1
),
release_year_dist as (
  select
    coalesce(release_year::text, '(sem ano)') as periodo,
    count(*) as registros
  from phone_specs
  group by 1
),
source_dist as (
  select
    coalesce(nullif(trim(source_1), ''), '(sem source_1)') as fonte,
    count(*) as registros
  from phone_specs
  group by 1
),
temporal_bounds as (
  select
    min(last_verified_at::date) as primeira_verificacao,
    max(last_verified_at::date) as ultima_verificacao,
    count(*) as registros_com_data
  from verified_parseable
),
insight_rows as (
  select
    'phone_exposicao_central' as insight_id,
    'exposicao_central_detail' as origem_tipo,
    (select count(*) from product_specs where coalesce(is_active, true) and category = 'phone') as valor_absoluto,
    (select count(*) from phone_specs) as registros_total,
    'Central phone ativo vs inventário detail' as descricao
  union all
  select
    'phone_detail_nao_exposto',
    'exposicao_central_detail',
    (select count(*) from phone_specs ph where not exists (
      select 1 from product_specs ps where ps.detail_id = ph.id and ps.detail_table = 'phone_specs' and coalesce(ps.is_active, true)
    )),
    (select count(*) from phone_specs),
    'Detail phone sem central ativo'
  union all
  select
    'capacidade_historica',
    'estatistica_temporal',
    null::bigint,
    null::bigint,
    'apenas_timestamps_estado_atual'
),
combined as (
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'estatistica_temporal' as tipo_analise,
  'temporal' as dimensao_estatistica,
  'detail' as camada,
  'phone' as categoria,
  'periodo' as entidade_tipo,
  vm.periodo as entidade_nome,
  'registros_verificados' as metrica,
  vm.registros as valor_absoluto,
  case when (select count(*) from verified_parseable) = 0 then null else round(vm.registros::numeric / (select count(*) from verified_parseable), 4) end as valor_relativo,
  (select count(*) from verified_parseable) as registros_total,
  vm.registros as amostra_analisavel,
  'phone_specs · last_verified_at parseável · agrupado por mês',
  'Verificação ≠ criação do registro' as limitacao
from verification_by_month vm

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'estatistica_temporal',
  'temporal',
  'detail',
  'phone',
  'release_year',
  ry.periodo,
  'registros',
  ry.registros,
  case when pt.n = 0 then null else round(ry.registros::numeric / pt.n, 4) end,
  pt.n,
  ry.registros,
  'phone_specs · distribuição por release_year',
  null
from release_year_dist ry
cross join phone_total pt

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'estatistica_temporal',
  'temporal',
  'detail',
  'phone',
  'limite',
  'last_verified_at',
  'primeira_data',
  extract(epoch from tb.primeira_verificacao)::bigint,
  null,
  tb.registros_com_data,
  tb.registros_com_data,
  'phone_specs · primeira last_verified_at parseável',
  null
from temporal_bounds tb
where tb.primeira_verificacao is not null

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'estatistica_temporal',
  'temporal',
  'detail',
  'phone',
  'limite',
  'last_verified_at',
  'ultima_data',
  extract(epoch from tb.ultima_verificacao)::bigint,
  null,
  tb.registros_com_data,
  tb.registros_com_data,
  'phone_specs · última last_verified_at parseável',
  null
from temporal_bounds tb
where tb.ultima_verificacao is not null

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'capacidade_historica',
  'temporal',
  'catalogo',
  null,
  'classificacao',
  'data_layer',
  'nivel_capacidade',
  null::bigint,
  null::numeric,
  null::bigint,
  pt.n,
  'Sem created_at/updated_at no catálogo — apenas timestamps do estado atual',
  'apenas_timestamps_estado_atual'
from phone_total pt

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'proveniencia_distribuicao',
  'proveniencia',
  'detail',
  'phone',
  'fonte',
  sd.fonte,
  'registros',
  sd.registros,
  case when pt.n = 0 then null else round(sd.registros::numeric / pt.n, 4) end,
  pt.n,
  sd.registros,
  'phone_specs · composição por source_1 (PATCH 6.2 auditou qualidade)',
  'Concentração em fonte ≠ erro automaticamente'
from source_dist sd
cross join phone_total pt

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'painel_estatistico',
  'painel',
  'catalogo',
  null,
  'dimensao',
  ir.insight_id,
  'valor_observado',
  ir.valor_absoluto,
  case when ir.registros_total is null or ir.registros_total = 0 or ir.valor_absoluto is null
    then null
    else round(ir.valor_absoluto::numeric / ir.registros_total, 4)
  end,
  ir.registros_total,
  ir.valor_absoluto,
  ir.descricao as referencia_denominador,
  null::text as limitacao
from insight_rows ir
where ir.insight_id <> 'capacidade_historica'

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'insight_estatistico',
  'insight',
  'catalogo',
  null,
  'insight',
  ir.insight_id,
  'descricao',
  ir.valor_absoluto,
  case when ir.registros_total is null or ir.registros_total = 0 or ir.valor_absoluto is null
    then null
    else round(ir.valor_absoluto::numeric / ir.registros_total, 4)
  end,
  ir.registros_total,
  coalesce(ir.valor_absoluto, 0),
  ir.descricao as referencia_denominador,
  'Insight derivado de resultados observados — sem causalidade externa'
from insight_rows ir
)
select * from combined
order by
  case tipo_analise
    when 'painel_estatistico' then 1
    when 'insight_estatistico' then 2
    else 3
  end,
  tipo_analise,
  entidade_nome nulls last;
