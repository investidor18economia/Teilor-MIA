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

