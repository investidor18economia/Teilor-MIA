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
