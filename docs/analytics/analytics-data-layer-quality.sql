-- PATCH 6.2 — Data Layer Quality Analytics (read-only · catalog tables)
-- Runtime: searchUniversalDataLayer() · getProductDetailSpecsFromSupabase()
-- Tables: product_specs · phone_specs · notebook_specs
-- NÃO duplica: PATCH 4.5 (analytics_events) · PATCH 6.1 (cobertura) · 6.3 (estatísticas) · 6.4 (uso)
-- Regra Fase 6: registros_afetados + registros_total + pct_registros_afetados + referencia_denominador
--
-- Query 1 — Completude por campo (central + detail)
-- Query 2 — Duplicações e aliases
-- Query 3 — Integridade central/detail · valores inválidos · conflitos
-- Query 4 — Proveniência · atualidade · painel dimensional · ranking de problemas

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Record completeness (absolute + relative per field)
-- Field classes: obrigatorio_runtime · importante · opcional (documented in DATA_QUALITY_ANALYTICS.md)
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Duplications and alias quality
-- ═══════════════════════════════════════════════════════════════════════════════

with central_active as (
  select *
  from product_specs
  where coalesce(is_active, true)
),
central_total as (
  select count(*) as registros_total from central_active
),
dup_official_name as (
  select
    official_name,
    count(*) as ocorrencias
  from central_active
  where official_name is not null and trim(official_name) <> ''
  group by official_name
  having count(*) > 1
),
dup_detail_link as (
  select
    detail_table,
    detail_id,
    count(*) as ocorrencias
  from central_active
  where detail_id is not null
  group by detail_table, detail_id
  having count(*) > 1
),
dup_phone_name as (
  select
    official_name,
    count(*) as ocorrencias
  from phone_specs
  where official_name is not null and trim(official_name) <> ''
  group by official_name
  having count(*) > 1
),
dup_official_name_stats as (
  select
    coalesce(sum(ocorrencias), 0)::bigint as registros_afetados,
    coalesce(count(*), 0)::bigint as grupos_duplicados
  from dup_official_name
),
dup_detail_link_stats as (
  select
    coalesce(sum(ocorrencias), 0)::bigint as registros_afetados,
    coalesce(count(*), 0)::bigint as grupos_duplicados
  from dup_detail_link
),
dup_phone_name_stats as (
  select
    coalesce(sum(ocorrencias), 0)::bigint as registros_afetados,
    coalesce(count(*), 0)::bigint as grupos_duplicados
  from dup_phone_name
),
alias_empty_central as (
  select count(*) as registros_afetados
  from central_active
  where aliases is null or aliases::text in ('null', '[]', '')
),
alias_empty_phone as (
  select count(*) as registros_afetados
  from phone_specs
  where aliases is null or aliases::text in ('null', '[]', '')
),
phone_total as (
  select count(*) as registros_total from phone_specs
)
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'duplicacao' as tipo_analise,
  'unicidade' as dimensao_qualidade,
  'product_specs' as tabela,
  'central' as camada,
  'official_name' as campo,
  'obrigatorio_runtime' as classificacao_campo,
  ct.registros_total,
  dos.registros_afetados,
  dos.grupos_duplicados as registros_incompletos,
  case
    when ct.registros_total = 0 then null
    else round(dos.registros_afetados::numeric / ct.registros_total, 4)
  end as pct_preenchimento,
  case
    when ct.registros_total = 0 then null
    else round(dos.registros_afetados::numeric / ct.registros_total, 4)
  end as pct_registros_afetados,
  'product_specs ativos · official_name duplicado' as referencia_denominador,
  'alto' as severidade,
  'duplicacao_confirmada' as confianca,
  'prioridade_alta' as prioridade_correcao
from central_total ct
cross join dup_official_name_stats dos

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'duplicacao',
  'unicidade',
  'product_specs',
  'central',
  'detail_id',
  'importante',
  ct.registros_total,
  dls.registros_afetados,
  dls.grupos_duplicados,
  case when ct.registros_total = 0 then null else round(dls.registros_afetados::numeric / ct.registros_total, 4) end,
  case when ct.registros_total = 0 then null else round(dls.registros_afetados::numeric / ct.registros_total, 4) end,
  'product_specs ativos · múltiplos centrais por detail_id',
  'critico',
  'duplicacao_confirmada',
  'prioridade_critica'
from central_total ct
cross join dup_detail_link_stats dls

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'duplicacao',
  'unicidade',
  'phone_specs',
  'detail',
  'official_name',
  'obrigatorio_runtime',
  pt.registros_total,
  dps.registros_afetados,
  dps.grupos_duplicados,
  case when pt.registros_total = 0 then null else round(dps.registros_afetados::numeric / pt.registros_total, 4) end,
  case when pt.registros_total = 0 then null else round(dps.registros_afetados::numeric / pt.registros_total, 4) end,
  'phone_specs · official_name duplicado',
  'medio',
  'duplicacao_confirmada',
  'prioridade_media'
from phone_total pt
cross join dup_phone_name_stats dps

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'alias',
  'unicidade',
  'product_specs',
  'central',
  'aliases',
  'opcional',
  ct.registros_total,
  ae.registros_afetados,
  ae.registros_afetados,
  case when ct.registros_total = 0 then null else round(ae.registros_afetados::numeric / ct.registros_total, 4) end,
  case when ct.registros_total = 0 then null else round(ae.registros_afetados::numeric / ct.registros_total, 4) end,
  'product_specs ativos · aliases vazio ou ausente',
  'baixo',
  'nao_conclusiva',
  'prioridade_baixa'
from central_total ct
cross join alias_empty_central ae

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'alias',
  'unicidade',
  'phone_specs',
  'detail',
  'aliases',
  'opcional',
  pt.registros_total,
  ap.registros_afetados,
  ap.registros_afetados,
  case when pt.registros_total = 0 then null else round(ap.registros_afetados::numeric / pt.registros_total, 4) end,
  case when pt.registros_total = 0 then null else round(ap.registros_afetados::numeric / pt.registros_total, 4) end,
  'phone_specs · aliases vazio ou ausente',
  'baixo',
  'nao_conclusiva',
  'prioridade_baixa'
from phone_total pt
cross join alias_empty_phone ap
order by tipo_analise, severidade nulls last;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Referential integrity · invalid values · conflicts
-- ═══════════════════════════════════════════════════════════════════════════════

with central_active as (
  select *
  from product_specs
  where coalesce(is_active, true)
),
central_total as (
  select count(*) as registros_total from central_active
),
phone_total as (
  select count(*) as registros_total from phone_specs
),
linked as (
  select
    ps.*,
    ph.official_name as detail_official_name,
    ph.brand as detail_brand,
    ph.ram_gb as detail_ram_gb
  from central_active ps
  left join phone_specs ph on ps.detail_table = 'phone_specs' and ps.detail_id = ph.id
  where ps.detail_id is not null
),
fk_missing as (
  select count(*) as registros_afetados
  from linked l
  where l.detail_official_name is null
),
fk_name_mismatch as (
  select count(*) as registros_afetados
  from linked l
  where l.detail_official_name is not null
    and lower(trim(l.official_name)) <> lower(trim(l.detail_official_name))
),
brand_mismatch as (
  select count(*) as registros_afetados
  from linked l
  where l.detail_brand is not null
    and l.brand is not null
    and lower(trim(l.brand)) <> lower(trim(l.detail_brand))
),
invalid_phone as (
  select
    count(*) filter (where ram_gb is not null and ram_gb <= 0) as ram_invalida,
    count(*) filter (where storage_gb is not null and storage_gb <= 0) as storage_invalida,
    count(*) filter (where battery_mah is not null and (battery_mah <= 0 or battery_mah > 30000)) as bateria_heuristica,
    count(*) filter (where performance_score is not null and (performance_score < 0 or performance_score > 100)) as score_fora_intervalo,
    count(*) filter (where value_score is not null and value_score > 94) as value_score_heuristica
  from phone_specs
),
conflict_ram as (
  select count(*) as registros_afetados
  from (
    select official_name
    from phone_specs
    where official_name is not null
    group by official_name
    having count(distinct ram_gb) filter (where ram_gb is not null) > 1
  ) x
),
combined as (
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'integridade_referencial' as tipo_analise,
  'integridade' as dimensao_qualidade,
  'product_specs' as tabela,
  'central' as camada,
  'detail_id' as campo,
  'obrigatorio_runtime' as classificacao_campo,
  ct.registros_total,
  fm.registros_afetados,
  fm.registros_afetados,
  null::numeric as pct_preenchimento,
  case when ct.registros_total = 0 then null else round(fm.registros_afetados::numeric / ct.registros_total, 4) end as pct_registros_afetados,
  'product_specs ativos com detail_id · FK ausente em phone_specs/notebook_specs' as referencia_denominador,
  'critico' as severidade,
  'integridade_confirmada' as confianca,
  'prioridade_critica' as prioridade_correcao
from central_total ct
cross join fk_missing fm

union all

select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'integridade_referencial' as tipo_analise,
  'consistencia' as dimensao_qualidade,
  'product_specs' as tabela,
  'central' as camada,
  'official_name' as campo,
  'obrigatorio_runtime' as classificacao_campo,
  ct.registros_total,
  nm.registros_afetados as registros_afetados,
  nm.registros_afetados as registros_incompletos,
  null::numeric as pct_preenchimento,
  case when ct.registros_total = 0 then null else round(nm.registros_afetados::numeric / ct.registros_total, 4) end as pct_registros_afetados,
  'product_specs ativos · official_name diverge do detail vinculado' as referencia_denominador,
  'alto' as severidade,
  'integridade_confirmada' as confianca,
  'prioridade_alta' as prioridade_correcao
from central_total ct
cross join fk_name_mismatch nm

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'integridade_referencial',
  'consistencia',
  'product_specs',
  'central',
  'brand',
  'importante',
  ct.registros_total,
  bm.registros_afetados,
  bm.registros_afetados,
  null::numeric,
  case when ct.registros_total = 0 then null else round(bm.registros_afetados::numeric / ct.registros_total, 4) end,
  'product_specs ativos · brand diverge do detail vinculado',
  'medio',
  'integridade_confirmada',
  'prioridade_media'
from central_total ct
cross join brand_mismatch bm

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'valor_invalido',
  'validade',
  'phone_specs',
  'detail',
  'ram_gb',
  'importante',
  pt.registros_total,
  ip.ram_invalida,
  ip.ram_invalida,
  null::numeric,
  case when pt.registros_total = 0 then null else round(ip.ram_invalida::numeric / pt.registros_total, 4) end,
  'phone_specs · ram_gb <= 0',
  'alto',
  'validacao_confirmada',
  'prioridade_alta'
from phone_total pt
cross join invalid_phone ip

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'valor_invalido',
  'validade',
  'phone_specs',
  'detail',
  'battery_mah',
  'importante',
  pt.registros_total,
  ip.bateria_heuristica,
  ip.bateria_heuristica,
  null::numeric,
  case when pt.registros_total = 0 then null else round(ip.bateria_heuristica::numeric / pt.registros_total, 4) end,
  'phone_specs · bateria fora de faixa 1–30000 mAh (heurística documentada)',
  'medio',
  'heuristica',
  'prioridade_media'
from phone_total pt
cross join invalid_phone ip

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'valor_invalido',
  'validade',
  'phone_specs',
  'detail',
  'performance_score',
  'importante',
  pt.registros_total,
  ip.score_fora_intervalo,
  ip.score_fora_intervalo,
  null::numeric,
  case when pt.registros_total = 0 then null else round(ip.score_fora_intervalo::numeric / pt.registros_total, 4) end,
  'phone_specs · score fora do intervalo 0–100',
  'medio',
  'validacao_confirmada',
  'prioridade_media'
from phone_total pt
cross join invalid_phone ip

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'valor_invalido',
  'validade',
  'phone_specs',
  'detail',
  'value_score',
  'importante',
  pt.registros_total,
  ip.value_score_heuristica,
  ip.value_score_heuristica,
  null::numeric,
  case when pt.registros_total = 0 then null else round(ip.value_score_heuristica::numeric / pt.registros_total, 4) end,
  'phone_specs · value_score > 94 (heurística audit-data-layer.js)',
  'baixo',
  'heuristica',
  'prioridade_baixa'
from phone_total pt
cross join invalid_phone ip

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'conflito_dados',
  'consistencia',
  'phone_specs',
  'detail',
  'official_name',
  'obrigatorio_runtime',
  pt.registros_total,
  cr.registros_afetados,
  cr.registros_afetados,
  null::numeric,
  case when pt.registros_total = 0 then null else round(cr.registros_afetados::numeric / pt.registros_total, 4) end,
  'phone_specs · mesmo official_name com ram_gb distintos',
  'alto',
  'duplicacao_provavel',
  'prioridade_alta'
from phone_total pt
cross join conflict_ram cr
)
select * from combined
order by tipo_analise, severidade;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 4 — Provenance · staleness · dimensional panel · problem ranking
-- ═══════════════════════════════════════════════════════════════════════════════

with phone_total as (
  select count(*) as registros_total from phone_specs
),
central_total as (
  select count(*) as registros_total
  from product_specs
  where coalesce(is_active, true)
),
central_complete as (
  select count(*) as registros_completos
  from product_specs
  where coalesce(is_active, true)
    and category is not null and trim(category) <> ''
    and brand is not null and trim(brand) <> ''
    and official_name is not null and trim(official_name) <> ''
    and detail_table is not null and trim(detail_table) <> ''
    and detail_id is not null
),
fk_missing_count as (
  select count(*) as registros_afetados
  from product_specs ps
  where coalesce(ps.is_active, true)
    and ps.detail_id is not null
    and ps.detail_table = 'phone_specs'
    and not exists (select 1 from phone_specs ph where ph.id = ps.detail_id)
),
score_invalid_count as (
  select count(*) as registros_afetados
  from phone_specs
  where performance_score is not null
    and (performance_score < 0 or performance_score > 100)
),
no_source_count as (
  select count(*) as registros_afetados
  from phone_specs
  where source_1 is null or trim(source_1) = ''
),
verified_total as (
  select count(*) as registros_total
  from phone_specs
  where last_verified_at is not null and trim(last_verified_at) <> ''
),
staleness_phone as (
  select count(*) as registros_afetados
  from phone_specs
  where last_verified_at is not null
    and trim(last_verified_at) <> ''
    and last_verified_at ~ '^\d{4}-\d{2}-\d{2}$'
    and last_verified_at::date < current_date - 180
),
prov_phone as (
  select
    count(*) filter (where source_1 is not null and trim(source_1) <> '') as com_source_1,
    count(*) filter (where last_verified_at is not null and trim(last_verified_at) <> '') as com_verificacao
  from phone_specs
),
issue_rows as (
  select
    'completude'::text as dimensao_qualidade,
    'product_specs'::text as tabela,
    'registro_runtime_completo'::text as campo,
    (ct.registros_total - cc.registros_completos)::bigint as registros_afetados,
    ct.registros_total,
    'medio'::text as severidade,
    'prioridade_media'::text as prioridade_correcao
  from central_total ct
  cross join central_complete cc
  where ct.registros_total - cc.registros_completos > 0

  union all

  select
    'integridade',
    'product_specs',
    'detail_id_fk_ausente',
    fk.registros_afetados,
    ct.registros_total,
    'critico',
    'prioridade_critica'
  from fk_missing_count fk
  cross join central_total ct
  where fk.registros_afetados > 0

  union all

  select
    'validade',
    'phone_specs',
    'score_fora_intervalo',
    si.registros_afetados,
    pt.registros_total,
    'medio',
    'prioridade_media'
  from score_invalid_count si
  cross join phone_total pt
  where si.registros_afetados > 0

  union all

  select
    'proveniencia',
    'phone_specs',
    'sem_source_1',
    ns.registros_afetados,
    pt.registros_total,
    'baixo',
    'prioridade_baixa'
  from no_source_count ns
  cross join phone_total pt
  where ns.registros_afetados > 0

  union all

  select
    'atualidade',
    'phone_specs',
    'verificacao_antiga_180d',
    sp.registros_afetados,
    vt.registros_total,
    'medio',
    'prioridade_media'
  from staleness_phone sp
  cross join verified_total vt
  where sp.registros_afetados > 0
),
combined as (
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'proveniencia' as tipo_analise,
  'proveniencia' as dimensao_qualidade,
  'phone_specs' as tabela,
  'detail' as camada,
  'source_1' as campo,
  'opcional' as classificacao_campo,
  pt.registros_total,
  pp.com_source_1 as registros_afetados,
  pt.registros_total - pp.com_source_1 as registros_incompletos,
  case when pt.registros_total = 0 then null else round(pp.com_source_1::numeric / pt.registros_total, 4) end as pct_preenchimento,
  case when pt.registros_total = 0 then null else round((pt.registros_total - pp.com_source_1)::numeric / pt.registros_total, 4) end as pct_registros_afetados,
  'phone_specs · registros com source_1 preenchido' as referencia_denominador,
  'informativo' as severidade,
  null::text as confianca,
  null::text as prioridade_correcao
from phone_total pt
cross join prov_phone pp

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'proveniencia',
  'proveniencia',
  'phone_specs',
  'detail',
  'last_verified_at',
  'opcional',
  pt.registros_total,
  pp.com_verificacao,
  pt.registros_total - pp.com_verificacao,
  case when pt.registros_total = 0 then null else round(pp.com_verificacao::numeric / pt.registros_total, 4) end,
  case when pt.registros_total = 0 then null else round((pt.registros_total - pp.com_verificacao)::numeric / pt.registros_total, 4) end,
  'phone_specs · registros com last_verified_at',
  'informativo',
  null,
  null
from phone_total pt
cross join prov_phone pp

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'atualidade',
  'atualidade',
  'phone_specs',
  'detail',
  'last_verified_at',
  'opcional',
  vt.registros_total,
  sp.registros_afetados,
  sp.registros_afetados,
  null::numeric,
  case when vt.registros_total = 0 then null else round(sp.registros_afetados::numeric / vt.registros_total, 4) end,
  'phone_specs com last_verified_at parseável · >180 dias (heurística)',
  'medio',
  'heuristica',
  'prioridade_media'
from staleness_phone sp
cross join verified_total vt

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'painel_dimensional',
  ir.dimensao_qualidade,
  ir.tabela,
  'catalogo',
  ir.campo,
  'n/a',
  ir.registros_total,
  ir.registros_afetados,
  ir.registros_afetados,
  case when ir.registros_total = 0 then null else round(ir.registros_afetados::numeric / ir.registros_total, 4) end,
  case when ir.registros_total = 0 then null else round(ir.registros_afetados::numeric / ir.registros_total, 4) end,
  concat('Painel dimensional · ', ir.dimensao_qualidade, ' · ', ir.campo),
  ir.severidade,
  null,
  ir.prioridade_correcao
from issue_rows ir

union all

select
  (current_timestamp at time zone 'UTC')::date,
  'ranking_problema',
  ir.dimensao_qualidade,
  ir.tabela,
  'catalogo',
  ir.campo,
  'n/a',
  ir.registros_total,
  ir.registros_afetados,
  ir.registros_afetados,
  case when ir.registros_total = 0 then null else round(ir.registros_afetados::numeric / ir.registros_total, 4) end,
  case when ir.registros_total = 0 then null else round(ir.registros_afetados::numeric / ir.registros_total, 4) end,
  concat('Ranking correção · ', ir.dimensao_qualidade),
  ir.severidade,
  null,
  ir.prioridade_correcao
from issue_rows ir
)
select * from combined
order by
  case tipo_analise
    when 'ranking_problema' then 1
    when 'painel_dimensional' then 2
    else 3
  end,
  case prioridade_correcao
    when 'prioridade_critica' then 1
    when 'prioridade_alta' then 2
    when 'prioridade_media' then 3
    else 4
  end nulls last,
  tipo_analise;
