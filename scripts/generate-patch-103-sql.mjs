#!/usr/bin/env node
/** Generates PATCH 10.3 SQL queries Q1–Q30 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "docs/analytics/sql");
mkdirSync(OUT, { recursive: true });

const BASE_CTE = `-- PATCH 10.3 base filter
with lifecycle as (
  select
    id,
    created_at,
    user_id,
    metadata->>'alert_id' as alert_id,
    coalesce(metadata->>'lifecycle_stage', 'UNKNOWN') as lifecycle_stage,
    coalesce(metadata->>'alert_status', 'UNKNOWN') as alert_status,
    coalesce(metadata->>'alert_source', 'UNKNOWN') as alert_source,
    coalesce(metadata->>'target_realism', 'UNKNOWN') as target_realism,
    coalesce(metadata->>'creation_failure_reason', 'UNKNOWN') as creation_failure_reason,
    coalesce(metadata->>'check_failure_reason', 'UNKNOWN') as check_failure_reason,
    coalesce(metadata->>'notification_failure_reason', 'UNKNOWN') as notification_failure_reason,
    coalesce(metadata->>'check_source', 'UNKNOWN') as check_source,
    coalesce(metadata->>'provider_id', 'UNKNOWN') as provider_id,
    coalesce(metadata->>'lifecycle_occurrence_key', '') as lifecycle_occurrence_key,
    nullif(metadata->>'current_price', '')::numeric as current_price,
    nullif(metadata->>'target_price', '')::numeric as target_price,
    nullif(metadata->>'target_delta_percent', '')::numeric as target_delta_percent,
    nullif(metadata->>'potential_savings_amount', '')::numeric as potential_savings_amount,
    nullif(metadata->>'checks_until_target', '')::numeric as checks_until_target,
    coalesce((metadata->>'creation_success')::boolean, false) as creation_success,
    coalesce((metadata->>'target_reached')::boolean, false) as target_reached,
    coalesce((metadata->>'check_success')::boolean, false) as check_success,
    coalesce((metadata->>'notification_success')::boolean, false) as notification_success,
    coalesce((metadata->>'duplicate_existing')::boolean, false) as duplicate_existing
  from analytics_events
  where event_name = 'mia_price_alert_lifecycle'
    and coalesce(metadata->>'event_version', '') = '10.3.0'
    and category not in ('price_alert_lifecycle_test')
),
reference_day as (
  select coalesce(max((created_at at time zone 'UTC')::date), current_date) as dia_referencia
  from lifecycle
)`;

const queries = [
  {
    file: "patch-103-query1-requested-daily.sql",
    title: "Q1 Alertas solicitados por dia",
    body: `${BASE_CTE}
select
  (l.created_at at time zone 'UTC')::date as dia,
  count(*)::bigint as eventos_requested,
  count(distinct l.alert_id) filter (where l.alert_id is not null)::bigint as alertas_distintos
from lifecycle l
where l.lifecycle_stage = 'REQUESTED'
group by 1
order by 1 desc;`,
  },
  {
    file: "patch-103-query2-created-success.sql",
    title: "Q2 Alertas criados com sucesso",
    body: `${BASE_CTE}
select
  r.dia_referencia,
  count(distinct l.alert_id)::bigint as alertas_criados_sucesso
from lifecycle l
cross join reference_day r
where l.lifecycle_stage = 'CREATED'
  and l.creation_success = true
  and l.duplicate_existing = false
group by 1;`,
  },
  {
    file: "patch-103-query3-creation-rate.sql",
    title: "Q3 Taxa de criação por solicitação",
    body: `${BASE_CTE},
requested as (
  select count(distinct coalesce(alert_id, id::text))::numeric as total from lifecycle where lifecycle_stage = 'REQUESTED'
),
created as (
  select count(distinct alert_id)::numeric as total from lifecycle
  where lifecycle_stage = 'CREATED' and creation_success = true and duplicate_existing = false
)
select
  r.total as solicitacoes,
  c.total as criados,
  round(100.0 * c.total / nullif(r.total, 0), 2) as taxa_criacao_pct
from requested r, created c;`,
  },
  {
    file: "patch-103-query4-creation-failures-by-reason.sql",
    title: "Q4 Falhas de criação por motivo",
    body: `${BASE_CTE}
select
  l.creation_failure_reason,
  count(*)::bigint as eventos,
  count(distinct coalesce(l.alert_id, l.id::text))::bigint as entidades
from lifecycle l
where l.lifecycle_stage in ('CREATED', 'FAILED')
  and (l.creation_success = false or l.lifecycle_stage = 'FAILED')
group by 1
order by eventos desc;`,
  },
  {
    file: "patch-103-query5-alert-status-distribution.sql",
    title: "Q5 Status funcional do alerta",
    body: `${BASE_CTE},
latest as (
  select distinct on (alert_id) alert_id, alert_status, lifecycle_stage, created_at
  from lifecycle
  where alert_id is not null
  order by alert_id, created_at desc
)
select alert_status, count(*)::bigint as alertas
from latest
group by 1
order by alertas desc;`,
  },
  {
    file: "patch-103-query6-lifecycle-stage-distribution.sql",
    title: "Q6 Distribuição lifecycle stage",
    body: `${BASE_CTE}
select lifecycle_stage, count(*)::bigint as eventos, count(distinct alert_id)::bigint as alertas
from lifecycle
where alert_id is not null
group by 1
order by eventos desc;`,
  },
  {
    file: "patch-103-query7-target-vs-current-distribution.sql",
    title: "Q7 Preço-alvo vs preço atual",
    body: `${BASE_CTE}
select
  case
    when target_delta_percent is null then 'UNKNOWN'
    when target_delta_percent <= 2 then '0-2%'
    when target_delta_percent <= 10 then '2-10%'
    when target_delta_percent <= 25 then '10-25%'
    else '25%+'
  end as faixa_delta_pct,
  count(distinct alert_id)::bigint as alertas
from lifecycle
where lifecycle_stage = 'CREATED' and alert_id is not null
group by 1
order by 1;`,
  },
  {
    file: "patch-103-query8-target-realism-distribution.sql",
    title: "Q8 Target realism",
    body: `${BASE_CTE}
select target_realism, count(distinct alert_id)::bigint as alertas
from lifecycle
where lifecycle_stage in ('REQUESTED', 'CREATED', 'ACTIVE') and alert_id is not null
group by 1
order by alertas desc;`,
  },
  {
    file: "patch-103-query9-target-distance-avg-median.sql",
    title: "Q9 Distância média/mediana até alvo",
    body: `${BASE_CTE}
select
  round(avg(target_delta_percent), 2) as media_delta_pct,
  round((percentile_cont(0.5) within group (order by target_delta_percent))::numeric, 2) as mediana_delta_pct,
  round(avg(current_price - target_price), 2) as media_delta_amount
from lifecycle
where lifecycle_stage = 'CREATED' and target_delta_percent is not null;`,
  },
  {
    file: "patch-103-query10-alerts-checked-once.sql",
    title: "Q10 Alertas verificados ao menos uma vez",
    body: `${BASE_CTE}
select count(distinct alert_id)::bigint as alertas_com_check
from lifecycle
where lifecycle_stage = 'CHECKED' and alert_id is not null;`,
  },
  {
    file: "patch-103-query11-check-frequency-volume.sql",
    title: "Q11 Frequência e volume de checks",
    body: `${BASE_CTE}
select
  (created_at at time zone 'UTC')::date as dia,
  count(*)::bigint as checks,
  count(distinct alert_id)::bigint as alertas
from lifecycle
where lifecycle_stage = 'CHECKED'
group by 1
order by 1 desc;`,
  },
  {
    file: "patch-103-query12-check-failures-by-reason.sql",
    title: "Q12 Falhas de verificação",
    body: `${BASE_CTE}
select check_failure_reason, count(*)::bigint as eventos
from lifecycle
where lifecycle_stage = 'CHECKED' and check_success = false
group by 1
order by eventos desc;`,
  },
  {
    file: "patch-103-query13-target-reached-alerts.sql",
    title: "Q13 Alertas que atingiram alvo",
    body: `${BASE_CTE}
select count(distinct alert_id)::bigint as alertas_target_reached
from lifecycle
where lifecycle_stage = 'TARGET_REACHED' and target_reached = true;`,
  },
  {
    file: "patch-103-query14-target-reached-rate.sql",
    title: "Q14 Taxa target reached",
    body: `${BASE_CTE},
active as (
  select count(distinct alert_id)::numeric as n from lifecycle where lifecycle_stage = 'ACTIVE'
),
reached as (
  select count(distinct alert_id)::numeric as n from lifecycle where lifecycle_stage = 'TARGET_REACHED'
)
select active.n as alertas_ativos, reached.n as target_reached,
  round(100.0 * reached.n / nullif(active.n, 0), 2) as taxa_pct
from active, reached;`,
  },
  {
    file: "patch-103-query15-time-to-target-avg-median.sql",
    title: "Q15 Tempo até target (placeholder — campo time_to_target_seconds reservado)",
    body: `${BASE_CTE}
-- time_to_target_seconds emitido quando disponível no fluxo funcional
select
  count(distinct alert_id)::bigint as alertas_com_target_reached,
  null::numeric as media_segundos,
  null::numeric as mediana_segundos
from lifecycle
where lifecycle_stage = 'TARGET_REACHED';`,
  },
  {
    file: "patch-103-query16-checks-until-target-avg.sql",
    title: "Q16 Checks até target",
    body: `${BASE_CTE}
select
  round(avg(checks_until_target), 2) as media_checks,
  round((percentile_cont(0.5) within group (order by checks_until_target))::numeric, 2) as mediana_checks
from lifecycle
where lifecycle_stage = 'TARGET_REACHED' and checks_until_target is not null;`,
  },
  {
    file: "patch-103-query17-notifications-prepared.sql",
    title: "Q17 Notificações preparadas",
    body: `${BASE_CTE}
select count(*)::bigint as eventos, count(distinct alert_id)::bigint as alertas
from lifecycle
where lifecycle_stage = 'NOTIFICATION_PREPARED';`,
  },
  {
    file: "patch-103-query18-notifications-sent.sql",
    title: "Q18 Notificações enviadas",
    body: `${BASE_CTE}
select count(*)::bigint as eventos, count(distinct alert_id)::bigint as alertas
from lifecycle
where lifecycle_stage = 'NOTIFICATION_SENT' and notification_success = true;`,
  },
  {
    file: "patch-103-query19-notifications-delivered-reserved.sql",
    title: "Q19 Notificações entregues (RESERVADO — sem webhook)",
    body: `${BASE_CTE}
-- NOTIFICATION_DELIVERED reservado até confirmação real de entrega
select count(*)::bigint as eventos_entregues
from lifecycle
where lifecycle_stage = 'NOTIFICATION_DELIVERED';`,
  },
  {
    file: "patch-103-query20-notification-failures.sql",
    title: "Q20 Falhas de notificação",
    body: `${BASE_CTE}
select notification_failure_reason, count(*)::bigint as eventos
from lifecycle
where lifecycle_stage = 'NOTIFICATION_FAILED'
group by 1
order by eventos desc;`,
  },
  {
    file: "patch-103-query21-user-return-reserved.sql",
    title: "Q21 Retorno após notificação (RESERVADO)",
    body: `${BASE_CTE}
-- USER_RETURNED reservado — sem correlação confiável hoje
select count(*)::bigint as eventos
from lifecycle
where lifecycle_stage = 'USER_RETURNED';`,
  },
  {
    file: "patch-103-query22-offer-opened-reserved.sql",
    title: "Q22 Oferta aberta após alerta (RESERVADO)",
    body: `${BASE_CTE}
-- OFFER_OPENED reservado — requer correlação alert_id + offer_click
select count(*)::bigint as eventos
from lifecycle
where lifecycle_stage = 'OFFER_OPENED';`,
  },
  {
    file: "patch-103-query23-potential-savings-avg.sql",
    title: "Q23 Oportunidade potencial média",
    body: `${BASE_CTE}
select
  round(avg(potential_savings_amount), 2) as media_oportunidade,
  round((percentile_cont(0.5) within group (order by potential_savings_amount))::numeric, 2) as mediana
from lifecycle
where lifecycle_stage in ('CREATED', 'TARGET_REACHED')
  and potential_savings_amount is not null
  and potential_savings_amount > 0;`,
  },
  {
    file: "patch-103-query24-potential-savings-total.sql",
    title: "Q24 Oportunidade potencial total (não economia realizada)",
    body: `${BASE_CTE},
first_created as (
  select distinct on (alert_id) alert_id, potential_savings_amount
  from lifecycle
  where lifecycle_stage = 'CREATED' and creation_success = true and potential_savings_amount is not null
  order by alert_id, created_at asc
)
select round(sum(potential_savings_amount), 2) as total_oportunidade_observada
from first_created;`,
  },
  {
    file: "patch-103-query25-lifecycle-by-source.sql",
    title: "Q25 Lifecycle por origem",
    body: `${BASE_CTE}
select alert_source, lifecycle_stage, count(distinct alert_id)::bigint as alertas
from lifecycle
where alert_id is not null
group by 1, 2
order by 1, 3 desc;`,
  },
  {
    file: "patch-103-query26-lifecycle-by-provider.sql",
    title: "Q26 Lifecycle por provider",
    body: `${BASE_CTE}
select provider_id, lifecycle_stage, count(*)::bigint as eventos
from lifecycle
where lifecycle_stage in ('CHECKED', 'TARGET_REACHED', 'NOTIFICATION_SENT')
group by 1, 2
order by eventos desc;`,
  },
  {
    file: "patch-103-query27-lifecycle-funnel.sql",
    title: "Q27 Funil oficial",
    body: `${BASE_CTE},
stages as (
  select unnest(array[
    'REQUESTED','CREATED','ACTIVE','CHECKED','TARGET_REACHED','NOTIFICATION_SENT'
  ]) as stage
),
counts as (
  select lifecycle_stage, count(distinct alert_id) as alertas
  from lifecycle where alert_id is not null group by 1
)
select s.stage,
  coalesce(c.alertas, 0)::bigint as alertas_unicos
from stages s
left join counts c on c.lifecycle_stage = s.stage
order by array_position(array['REQUESTED','CREATED','ACTIVE','CHECKED','TARGET_REACHED','NOTIFICATION_SENT'], s.stage);`,
  },
  {
    file: "patch-103-query28-time-between-stages.sql",
    title: "Q28 Tempo entre etapas",
    body: `${BASE_CTE},
ordered as (
  select alert_id, lifecycle_stage, created_at,
    lag(created_at) over (partition by alert_id order by created_at) as prev_at
  from lifecycle
  where alert_id is not null
)
select lifecycle_stage,
  round(avg(extract(epoch from (created_at - prev_at))), 2) as media_segundos_desde_anterior
from ordered
where prev_at is not null
group by 1
order by media_segundos_desde_anterior desc nulls last;`,
  },
  {
    file: "patch-103-query29-dedup-by-stage.sql",
    title: "Q29 Duplicações por stage",
    body: `${BASE_CTE}
select lifecycle_stage, alert_id, lifecycle_occurrence_key, count(*)::bigint as ocorrencias
from lifecycle
where alert_id is not null and lifecycle_occurrence_key <> ''
group by 1, 2, 3
having count(*) > 1
order by ocorrencias desc
limit 100;`,
  },
  {
    file: "patch-103-query30-orphan-invalid-transitions.sql",
    title: "Q30 Alertas órfãos / transições inválidas",
    body: `${BASE_CTE},
first_stage as (
  select alert_id, min(created_at) as first_at,
    (array_agg(lifecycle_stage order by created_at))[1] as first_stage
  from lifecycle where alert_id is not null group by 1
)
select
  count(*) filter (where first_stage <> 'REQUESTED')::bigint as alertas_sem_requested,
  count(*) filter (where first_stage = 'REQUESTED')::bigint as alertas_ok
from first_stage;`,
  },
];

for (const q of queries) {
  writeFileSync(join(OUT, q.file), `-- PATCH 10.3 — ${q.title}\n${q.body}\n`, "utf8");
}
console.log(`Wrote ${queries.length} SQL files to ${OUT}`);
