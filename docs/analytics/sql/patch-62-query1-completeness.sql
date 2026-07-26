with field_defs as (
  select *
  from (
    values
      ('product_specs', 'central', 'category', 'obrigatorio_runtime'),
      ('product_specs', 'central', 'brand', 'obrigatorio_runtime'),
      ('product_specs', 'central', 'official_name', 'obrigatorio_runtime'),
      ('product_specs', 'central', 'detail_table', 'importante'),
      ('product_specs', 'central', 'detail_id', 'importante'),
      ('product_specs', 'central', 'model_family', 'importante'),
      ('product_specs', 'central', 'search_text', 'opcional'),
      ('product_specs', 'central', 'aliases', 'opcional'),
      ('phone_specs', 'detail', 'brand', 'obrigatorio_runtime'),
      ('phone_specs', 'detail', 'official_name', 'obrigatorio_runtime'),
      ('phone_specs', 'detail', 'ram_gb', 'importante'),
      ('phone_specs', 'detail', 'storage_gb', 'importante'),
      ('phone_specs', 'detail', 'battery_mah', 'importante'),
      ('phone_specs', 'detail', 'chipset', 'importante'),
      ('phone_specs', 'detail', 'performance_score', 'importante'),
      ('phone_specs', 'detail', 'source_1', 'opcional'),
      ('phone_specs', 'detail', 'last_verified_at', 'opcional'),
      ('notebook_specs', 'detail', 'brand', 'obrigatorio_runtime'),
      ('notebook_specs', 'detail', 'official_name', 'obrigatorio_runtime'),
      ('notebook_specs', 'detail', 'cpu', 'importante'),
      ('notebook_specs', 'detail', 'ram_gb', 'importante'),
      ('notebook_specs', 'detail', 'source_1', 'opcional'),
      ('notebook_specs', 'detail', 'last_verified_at', 'opcional')
  ) as t(tabela, camada, campo, classificacao_campo)
),
central_rows as (
  select *
  from product_specs
  where coalesce(is_active, true)
),
central_totals as (
  select count(*) as registros_total from central_rows
),
phone_totals as (
  select count(*) as registros_total from phone_specs
),
notebook_totals as (
  select count(*) as registros_total from notebook_specs
),
central_completeness as (
  select
    fd.tabela,
    fd.camada,
    fd.campo,
    fd.classificacao_campo,
    ct.registros_total,
    count(*) filter (
      where case fd.campo
        when 'category' then cr.category is not null and trim(cr.category) <> ''
        when 'brand' then cr.brand is not null and trim(cr.brand) <> ''
        when 'official_name' then cr.official_name is not null and trim(cr.official_name) <> ''
        when 'detail_table' then cr.detail_table is not null and trim(cr.detail_table) <> ''
        when 'detail_id' then cr.detail_id is not null
        when 'model_family' then cr.model_family is not null and trim(cr.model_family) <> ''
        when 'search_text' then cr.search_text is not null and trim(cr.search_text) <> ''
        when 'aliases' then cr.aliases is not null and cr.aliases::text not in ('null', '[]', '')
        else false
      end
    ) as registros_preenchidos
  from field_defs fd
  cross join central_totals ct
  left join central_rows cr on fd.tabela = 'product_specs'
  where fd.tabela = 'product_specs'
  group by fd.tabela, fd.camada, fd.campo, fd.classificacao_campo, ct.registros_total
),
phone_completeness as (
  select
    fd.tabela,
    fd.camada,
    fd.campo,
    fd.classificacao_campo,
    pt.registros_total,
    count(*) filter (
      where case fd.campo
        when 'brand' then ph.brand is not null and trim(ph.brand) <> ''
        when 'official_name' then ph.official_name is not null and trim(ph.official_name) <> ''
        when 'ram_gb' then ph.ram_gb is not null
        when 'storage_gb' then ph.storage_gb is not null
        when 'battery_mah' then ph.battery_mah is not null
        when 'chipset' then ph.chipset is not null and trim(ph.chipset) <> ''
        when 'performance_score' then ph.performance_score is not null
        when 'source_1' then ph.source_1 is not null and trim(ph.source_1) <> ''
        when 'last_verified_at' then ph.last_verified_at is not null and trim(ph.last_verified_at) <> ''
        else false
      end
    ) as registros_preenchidos
  from field_defs fd
  cross join phone_totals pt
  left join phone_specs ph on fd.tabela = 'phone_specs'
  where fd.tabela = 'phone_specs'
  group by fd.tabela, fd.camada, fd.campo, fd.classificacao_campo, pt.registros_total
),
notebook_completeness as (
  select
    fd.tabela,
    fd.camada,
    fd.campo,
    fd.classificacao_campo,
    nt.registros_total,
    count(*) filter (
      where case fd.campo
        when 'brand' then nb.brand is not null and trim(nb.brand) <> ''
        when 'official_name' then nb.official_name is not null and trim(nb.official_name) <> ''
        when 'cpu' then nb.cpu is not null and trim(nb.cpu) <> ''
        when 'ram_gb' then nb.ram_gb is not null
        when 'source_1' then nb.source_1 is not null and trim(nb.source_1) <> ''
        when 'last_verified_at' then nb.last_verified_at is not null
        else false
      end
    ) as registros_preenchidos
  from field_defs fd
  cross join notebook_totals nt
  left join notebook_specs nb on fd.tabela = 'notebook_specs'
  where fd.tabela = 'notebook_specs'
  group by fd.tabela, fd.camada, fd.campo, fd.classificacao_campo, nt.registros_total
),
combined as (
  select * from central_completeness
  union all select * from phone_completeness
  union all select * from notebook_completeness
),
central_complete_records as (
  select count(*) as registros_completos
  from central_rows cr
  where cr.category is not null and trim(cr.category) <> ''
    and cr.brand is not null and trim(cr.brand) <> ''
    and cr.official_name is not null and trim(cr.official_name) <> ''
    and cr.detail_table is not null and trim(cr.detail_table) <> ''
    and cr.detail_id is not null
)
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'completude_campo' as tipo_analise,
  'completude' as dimensao_qualidade,
  c.tabela,
  c.camada,
  c.campo,
  c.classificacao_campo,
  c.registros_total,
  c.registros_preenchidos as registros_afetados,
  c.registros_total - c.registros_preenchidos as registros_incompletos,
  case
    when c.registros_total = 0 then null
    else round(c.registros_preenchidos::numeric / nullif(c.registros_total, 0), 4)
  end as pct_preenchimento,
  case
    when c.registros_total = 0 then null
    else round((c.registros_total - c.registros_preenchidos)::numeric / nullif(c.registros_total, 0), 4)
  end as pct_registros_afetados,
  concat(c.tabela, ' · total ', c.camada) as referencia_denominador,
  null::text as severidade,
  null::text as confianca,
  null::text as prioridade_correcao
from combined c

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'completude_registro',
  'completude',
  'product_specs',
  'central',
  'registro_runtime_completo',
  'obrigatorio_runtime',
  ct.registros_total,
  cc.registros_completos,
  ct.registros_total - cc.registros_completos,
  case when ct.registros_total = 0 then null else round(cc.registros_completos::numeric / ct.registros_total, 4) end,
  case when ct.registros_total = 0 then null else round((ct.registros_total - cc.registros_completos)::numeric / ct.registros_total, 4) end,
  'product_specs ativos · campos obrigatórios runtime (category, brand, official_name, detail_table, detail_id)',
  null,
  null,
  null
from central_totals ct
cross join central_complete_records cc
order by tipo_analise, tabela, classificacao_campo, campo;
