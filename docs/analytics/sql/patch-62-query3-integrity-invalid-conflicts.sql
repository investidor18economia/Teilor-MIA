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
