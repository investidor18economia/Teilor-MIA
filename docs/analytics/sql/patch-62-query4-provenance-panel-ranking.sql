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
