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

