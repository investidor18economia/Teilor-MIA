-- PATCH 6.1 — Data Layer Coverage Analytics (read-only · catalog tables)
-- Runtime source: pages/api/chat-gpt4o.js — searchUniversalDataLayer()
-- Tables: product_specs (central) · phone_specs · notebook_specs (detail — allowedTables)
-- NÃO duplica: PATCH 4.5 (instrumentação Analytics) · PATCH 6.2 (qualidade) · 6.3 (estatísticas) · 6.4 (uso)
--
-- Query 1 — Cobertura por categoria (runtime vs catálogo central vs detail)
-- Query 2 — Cobertura por marca e família
-- Query 3 — Cobertura por modelo, concentração e atributos técnicos
-- Query 4 — Lacunas comerciais, cobertura relativa e priorização de expansão

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 1 — Category coverage (runtime detection vs central catalog vs detail tables)
-- searchUniversalDataLayer() reads product_specs only — detail tables hydrate via detail_id
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 2 — Brand and family coverage (active central catalog only)
-- ═══════════════════════════════════════════════════════════════════════════════

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
order by tipo_analise, categoria, modelos_ativos desc;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 3 — Model concentration + technical attribute coverage (coverage only — not quality)
-- Phones: merge central + phone_specs via detail_id
-- Notebooks: attribute coverage on notebook_specs inventory (detail exists; central may be absent)
-- ═══════════════════════════════════════════════════════════════════════════════

with active_phones as (
  select
    ps.category as categoria,
    coalesce(nullif(trim(ps.brand), ''), '(sem marca)') as marca,
    coalesce(nullif(trim(ps.model_family), ''), '(sem família)') as familia,
    ps.official_name as modelo,
    ps.detail_id,
    ph.ram_gb,
    ph.storage_gb,
    ph.battery_mah,
    ph.chipset,
    ph.screen_type,
    ph.refresh_rate_hz,
    ph.main_camera_mp,
    ph.is_5g,
    ph.nfc,
    ph.performance_score,
    ph.camera_score,
    ph.battery_score
  from product_specs ps
  left join phone_specs ph on ph.id = ps.detail_id and ps.detail_table = 'phone_specs'
  where coalesce(ps.is_active, true)
    and ps.category = 'phone'
),
phone_concentration as (
  select
    categoria,
    marca,
    count(*) as modelos_ativos,
    round(count(*)::numeric / nullif(sum(count(*)) over (partition by categoria), 0), 4) as pct_concentracao_categoria
  from active_phones
  group by categoria, marca
),
phone_attributes as (
  select
    'phone' as categoria,
    attr.atributo,
    count(*) as registros_totais,
    count(*) filter (where attr.preenchido) as registros_preenchidos
  from active_phones ap
  cross join lateral (
    values
      ('ram_gb', ap.ram_gb is not null),
      ('storage_gb', ap.storage_gb is not null),
      ('battery_mah', ap.battery_mah is not null),
      ('chipset', ap.chipset is not null and trim(ap.chipset) <> ''),
      ('screen_type', ap.screen_type is not null and trim(ap.screen_type) <> ''),
      ('refresh_rate_hz', ap.refresh_rate_hz is not null),
      ('main_camera_mp', ap.main_camera_mp is not null),
      ('is_5g', ap.is_5g is not null),
      ('nfc', ap.nfc is not null),
      ('performance_score', ap.performance_score is not null),
      ('camera_score', ap.camera_score is not null),
      ('battery_score', ap.battery_score is not null)
  ) as attr(atributo, preenchido)
  group by attr.atributo
),
notebook_attributes as (
  select
    'notebook' as categoria,
    attr.atributo,
    count(*) as registros_totais,
    count(*) filter (where attr.preenchido) as registros_preenchidos
  from notebook_specs nb
  cross join lateral (
    values
      ('cpu', nb.cpu is not null and trim(nb.cpu) <> ''),
      ('gpu', nb.gpu is not null and trim(nb.gpu) <> ''),
      ('ram_gb', nb.ram_gb is not null),
      ('storage_gb', nb.storage_gb is not null),
      ('screen_size_inches', nb.screen_size_inches is not null),
      ('screen_resolution', nb.screen_resolution is not null and trim(nb.screen_resolution) <> ''),
      ('battery_wh', nb.battery_wh is not null),
      ('weight_kg', nb.weight_kg is not null),
      ('performance_score', nb.performance_score is not null),
      ('battery_score', nb.battery_score is not null)
  ) as attr(atributo, preenchido)
  group by attr.atributo
),
family_model_counts as (
  select
    categoria,
    marca,
    familia,
    count(*) as modelos_ativos
  from active_phones
  group by categoria, marca, familia
)
select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'concentracao_marca' as tipo_analise,
  pc.categoria,
  pc.marca,
  null::text as familia,
  null::text as atributo,
  pc.modelos_ativos,
  pc.pct_concentracao_categoria,
  null::numeric as pct_cobertura_atributo,
  null::text as observacao
from phone_concentration pc

union all

select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'cobertura_familia_modelo' as tipo_analise,
  fmc.categoria,
  fmc.marca,
  fmc.familia,
  null::text as atributo,
  fmc.modelos_ativos,
  null::numeric as pct_concentracao_categoria,
  null::numeric as pct_cobertura_atributo,
  null::text as observacao
from family_model_counts fmc

union all

select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'cobertura_atributo' as tipo_analise,
  pa.categoria,
  null::text as marca,
  null::text as familia,
  pa.atributo,
  pa.registros_preenchidos as modelos_ativos,
  null::numeric as pct_concentracao_categoria,
  round(pa.registros_preenchidos::numeric / nullif(pa.registros_totais, 0), 4) as pct_cobertura_atributo,
  'phone · product_specs + phone_specs (runtime)' as observacao
from phone_attributes pa

union all

select
  (current_timestamp at time zone 'UTC')::date as dia_referencia,
  'cobertura_atributo' as tipo_analise,
  na.categoria,
  null::text as marca,
  null::text as familia,
  na.atributo,
  na.registros_preenchidos as modelos_ativos,
  null::numeric as pct_concentracao_categoria,
  round(na.registros_preenchidos::numeric / nullif(na.registros_totais, 0), 4) as pct_cobertura_atributo,
  'notebook · notebook_specs (inventário detail — central pode estar ausente)' as observacao
from notebook_attributes na
order by tipo_analise, categoria, modelos_ativos desc nulls last;

-- ═══════════════════════════════════════════════════════════════════════════════
-- QUERY 4 — Commercial gaps, relative coverage (objective refs only), expansion priority
-- Referência comercial: linhas declaradas explicitamente — não estimativa de mercado
-- Cobertura relativa: modelos ativos no catálogo central / inventário detail compatível (mesmo padrão marca+família)
-- Priorização: regras ordinais — sem pesos numéricos arbitrários
-- ═══════════════════════════════════════════════════════════════════════════════

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
