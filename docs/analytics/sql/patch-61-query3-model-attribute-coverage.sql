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
