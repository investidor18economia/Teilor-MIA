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
