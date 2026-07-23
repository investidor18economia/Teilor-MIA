#!/usr/bin/env node
/** Generates PATCH 10.6 cross-audit SQL queries Q1–Q30 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs/analytics/sql");
mkdirSync(OUT, { recursive: true });

const PHASE10_EVENTS = `
  select id, created_at, event_name, category, session_id, user_id,
    metadata->>'request_id' as request_id,
    metadata->>'decision_request_id' as decision_request_id,
    metadata->>'event_version' as event_version,
    metadata->>'alert_id' as alert_id,
    metadata
  from analytics_events
  where event_name in (
    'mia_price_intelligence',
    'mia_savings_estimation',
    'mia_price_alert_lifecycle',
    'mia_anti_regret_foundation',
    'mia_user_value_outcome'
  )
  and category not like '%_test'
`;

const queries = [
  {
    file: "patch-106-query1-events-by-version.sql",
    title: "Q1 Eventos por versão",
    body: `${PHASE10_EVENTS}\nselect event_name, event_version, count(*)::bigint as eventos from phase10 group by 1, 2 order by eventos desc;`.replace("phase10 group", "(\n" + PHASE10_EVENTS.trim() + "\n) phase10 group"),
  },
];

// Fix approach - use WITH clause
const BASE = `-- PATCH 10.6 cross-audit base
with phase10 as (
  select
    id,
    created_at,
    event_name,
    category,
    session_id,
    user_id,
    metadata->>'request_id' as request_id,
    metadata->>'decision_request_id' as decision_request_id,
    metadata->>'event_version' as event_version,
    metadata->>'alert_id' as alert_id,
    metadata->>'lifecycle_stage' as lifecycle_stage,
    metadata->>'value_status' as value_status,
    metadata->>'savings_type' as savings_type,
    coalesce((metadata->>'purchase_confirmed')::boolean, false) as purchase_confirmed,
    coalesce((metadata->>'value_verified')::boolean, false) as value_verified,
    coalesce((metadata->>'roi_assumed')::boolean, false) as roi_assumed,
    coalesce((metadata->>'regret_confirmed')::boolean, false) as regret_confirmed,
    coalesce((metadata->>'satisfaction_assumed')::boolean, false) as satisfaction_assumed,
    nullif(metadata->>'potential_value_amount', '')::numeric as potential_value_amount,
    nullif(metadata->>'observed_value_amount', '')::numeric as observed_value_amount,
    nullif(metadata->>'verified_value_amount', '')::numeric as verified_value_amount,
    nullif(metadata->>'user_value_score', '')::numeric as user_value_score,
    nullif(metadata->>'anti_regret_score', '')::numeric as anti_regret_score,
    metadata
  from analytics_events
  where event_name in (
    'mia_price_intelligence',
    'mia_savings_estimation',
    'mia_price_alert_lifecycle',
    'mia_anti_regret_foundation',
    'mia_user_value_outcome'
  )
  and coalesce(category, '') not like '%_test'
)`;

const QUERY_DEFS = [
  { file: "patch-106-query1-events-by-version.sql", title: "Q1 Eventos por versão", body: "select event_name, event_version, count(*)::bigint as eventos from phase10 group by 1, 2 order by eventos desc;" },
  { file: "patch-106-query2-events-by-day.sql", title: "Q2 Eventos por dia", body: "select (created_at at time zone 'UTC')::date as dia, event_name, count(*)::bigint as eventos from phase10 group by 1, 2 order by 1 desc, 3 desc limit 60;" },
  { file: "patch-106-query3-events-by-request.sql", title: "Q3 Eventos por request", body: "select request_id, count(distinct event_name)::int as tipos, count(*)::bigint as eventos from phase10 where request_id is not null group by 1 order by eventos desc limit 50;" },
  { file: "patch-106-query4-events-by-decision.sql", title: "Q4 Eventos por decisão", body: "select decision_request_id, count(distinct event_name)::int as tipos, count(*)::bigint as eventos from phase10 where decision_request_id is not null group by 1 order by eventos desc limit 50;" },
  { file: "patch-106-query5-funnel-101-102-104-105.sql", title: "Q5 Funil 10.1→10.2→10.4→10.5", body: `by_decision as (
  select decision_request_id,
    bool_or(event_name = 'mia_price_intelligence') as has_101,
    bool_or(event_name = 'mia_savings_estimation') as has_102,
    bool_or(event_name = 'mia_anti_regret_foundation') as has_104,
    bool_or(event_name = 'mia_user_value_outcome') as has_105
  from phase10 where decision_request_id is not null group by 1
)
select count(*)::bigint as decisoes,
  count(*) filter (where has_101)::bigint as com_101,
  count(*) filter (where has_101 and has_102)::bigint as com_101_102,
  count(*) filter (where has_101 and has_102 and has_104)::bigint as com_101_102_104,
  count(*) filter (where has_101 and has_102 and has_104 and has_105)::bigint as cadeia_completa
from by_decision;` },
  { file: "patch-106-query6-missing-chain-events.sql", title: "Q6 Missing events na cadeia", body: `by_decision as (
  select decision_request_id,
    bool_or(event_name = 'mia_price_intelligence') as has_101,
    bool_or(event_name = 'mia_savings_estimation') as has_102,
    bool_or(event_name = 'mia_anti_regret_foundation') as has_104,
    bool_or(event_name = 'mia_user_value_outcome') as has_105
  from phase10 where decision_request_id is not null group by 1
)
select 'missing_102' as gap, count(*)::bigint as decisoes from by_decision where has_101 and not has_102
union all select 'missing_104', count(*)::bigint from by_decision where has_101 and has_102 and not has_104
union all select 'missing_105', count(*)::bigint from by_decision where has_101 and has_102 and has_104 and not has_105;` },
  { file: "patch-106-query7-duplicates-by-decision.sql", title: "Q7 Duplicações por decisão", body: `select event_name, decision_request_id, event_version, count(*)::bigint as ocorrencias
from phase10 where decision_request_id is not null
group by 1, 2, 3 having count(*) > 1
order by ocorrencias desc limit 50;` },
  { file: "patch-106-query8-orphan-ids.sql", title: "Q8 IDs órfãos", body: `select 'no_request_id' as tipo, count(*)::bigint as eventos from phase10 where request_id is null and event_name <> 'mia_price_alert_lifecycle'
union all select 'no_decision_request_id', count(*)::bigint from phase10 where decision_request_id is null and event_name in ('mia_anti_regret_foundation','mia_user_value_outcome')
union all select 'alert_no_alert_id', count(*)::bigint from phase10 where event_name = 'mia_price_alert_lifecycle' and (alert_id is null or alert_id = '');` },
  { file: "patch-106-query9-invalid-monetary-fields.sql", title: "Q9 Monetary fields inválidos", body: `select event_name, count(*) filter (where potential_value_amount < 0)::bigint as potential_neg,
  count(*) filter (where observed_value_amount < 0)::bigint as observed_neg,
  count(*) filter (where verified_value_amount is not null)::bigint as verified_non_null
from phase10 group by 1;` },
  { file: "patch-106-query10-percent-out-of-range.sql", title: "Q10 Percentuais fora da faixa", body: `select event_name, count(*)::bigint as eventos
from phase10
where (metadata->>'savings_percent') is not null
  and ((metadata->>'savings_percent')::numeric > 100 or (metadata->>'savings_percent')::numeric < -100)
group by 1;` },
  { file: "patch-106-query11-verified-indevido.sql", title: "Q11 VERIFIED indevido", body: `select event_name, count(*)::bigint as eventos from phase10
where value_status = 'VERIFIED' or savings_type = 'VERIFIED' or verified_value_amount is not null
group by 1;` },
  { file: "patch-106-query12-purchase-confirmed-indevido.sql", title: "Q12 Purchase confirmed indevido", body: "select event_name, count(*)::bigint as eventos from phase10 where purchase_confirmed = true group by 1;" },
  { file: "patch-106-query13-roi-assumed-indevido.sql", title: "Q13 ROI assumed indevido", body: "select event_name, count(*)::bigint as eventos from phase10 where roi_assumed = true group by 1;" },
  { file: "patch-106-query14-regret-confirmed-indevido.sql", title: "Q14 Regret confirmed indevido", body: "select event_name, count(*)::bigint as eventos from phase10 where regret_confirmed = true group by 1;" },
  { file: "patch-106-query15-satisfaction-assumed-indevido.sql", title: "Q15 Satisfaction assumed indevido", body: "select event_name, count(*)::bigint as eventos from phase10 where satisfaction_assumed = true group by 1;" },
  { file: "patch-106-query16-alert-invalid-transitions.sql", title: "Q16 Alert transitions inválidas", body: `alerts as (
  select alert_id, array_agg(lifecycle_stage order by created_at) as stages
  from phase10 where event_name = 'mia_price_alert_lifecycle' and alert_id is not null
  group by 1
)
select count(*) filter (where 'NOTIFICATION_SENT' = any(stages) and not ('NOTIFICATION_PREPARED' = any(stages)))::bigint as sent_without_prepared,
  count(*) filter (where 'TARGET_REACHED' = any(stages) and not ('CHECKED' = any(stages) or 'ACTIVE' = any(stages)))::bigint as target_without_check
from alerts;` },
  { file: "patch-106-query17-pii-suspect-metadata.sql", title: "Q17 PII suspeita", body: `select event_name, count(*)::bigint as eventos
from phase10
where metadata::text ~* '(product_name|https://|query_text|user_email|@gmail|bearer )'
group by 1;` },
  { file: "patch-106-query18-unexpected-versions.sql", title: "Q18 Versões inesperadas", body: `select event_name, event_version, count(*)::bigint as eventos from phase10
where event_version not in ('10.1.0','10.2.0','10.3.0','10.4.0','10.5.0')
group by 1, 2 order by eventos desc;` },
  { file: "patch-106-query19-missing-required-fields.sql", title: "Q19 Campos obrigatórios ausentes", body: `select event_name,
  count(*) filter (where event_version is null or event_version = '')::bigint as missing_version,
  count(*) filter (where request_id is null and event_name <> 'mia_price_alert_lifecycle')::bigint as missing_request
from phase10 group by 1;` },
  { file: "patch-106-query20-score-confidence-consistency.sql", title: "Q20 Score vs confidence", body: `select event_name,
  coalesce(metadata->>'value_confidence', metadata->>'anti_regret_confidence', 'UNKNOWN') as confidence,
  round(avg(coalesce(user_value_score, anti_regret_score)), 2) as score_medio,
  count(*)::bigint as eventos
from phase10
where user_value_score is not null or anti_regret_score is not null
group by 1, 2 order by eventos desc;` },
  { file: "patch-106-query21-price-quality-savings.sql", title: "Q21 Price quality vs savings", body: `select p.metadata->>'price_quality' as price_quality,
  s.metadata->>'savings_type' as savings_type,
  count(*)::bigint as pares
from phase10 p
join phase10 s on s.decision_request_id = p.decision_request_id
  and p.event_name = 'mia_price_intelligence' and s.event_name = 'mia_savings_estimation'
group by 1, 2 order by pares desc limit 30;` },
  { file: "patch-106-query22-anti-regret-user-value.sql", title: "Q22 Anti-regret vs user value", body: `select round(corr(a.anti_regret_score, u.user_value_score)::numeric, 4) as correlacao,
  count(*)::bigint as pares
from phase10 a
join phase10 u on u.decision_request_id = a.decision_request_id
  and a.event_name = 'mia_anti_regret_foundation' and u.event_name = 'mia_user_value_outcome'
where a.anti_regret_score is not null and u.user_value_score is not null;` },
  { file: "patch-106-query23-fanout-by-request.sql", title: "Q23 Fan-out por request", body: `select request_id, count(*)::bigint as eventos, count(distinct event_name)::int as tipos
from phase10 where request_id is not null
group by 1 having count(*) > 10
order by eventos desc limit 30;` },
  { file: "patch-106-query24-chain-coverage-rate.sql", title: "Q24 Cobertura da cadeia", body: `d as (
  select decision_request_id from phase10 where decision_request_id is not null group by 1
), full_chain as (
  select decision_request_id from phase10 where decision_request_id is not null
  group by 1
  having bool_or(event_name='mia_price_intelligence')
    and bool_or(event_name='mia_savings_estimation')
    and bool_or(event_name='mia_anti_regret_foundation')
    and bool_or(event_name='mia_user_value_outcome')
)
select count(*)::bigint as decisoes_total,
  (select count(*)::bigint from full_chain) as cadeia_completa,
  round(100.0 * (select count(*) from full_chain) / nullif(count(*), 0), 2) as cobertura_pct
from d;` },
  { file: "patch-106-query25-events-before-upstream.sql", title: "Q25 Eventos antes do upstream", body: `select u.decision_request_id, u.created_at as user_value_at, o.created_at as offer_set_at
from phase10 u
join analytics_events o on o.event_name = 'mia_offer_set'
  and o.metadata->>'request_id' = u.decision_request_id
where u.event_name = 'mia_user_value_outcome'
  and u.created_at < o.created_at
limit 20;` },
  { file: "patch-106-query26-invalid-timestamps.sql", title: "Q26 Timestamps inválidos", body: "select event_name, count(*)::bigint as eventos from phase10 where created_at > now() + interval '5 minutes' group by 1;" },
  { file: "patch-106-query27-negative-monetary-values.sql", title: "Q27 Valores monetários negativos", body: `select event_name, count(*)::bigint as eventos from phase10
where coalesce(potential_value_amount, 0) < 0
   or coalesce(observed_value_amount, 0) < 0
   or coalesce(verified_value_amount, 0) < 0
group by 1;` },
  { file: "patch-106-query28-unknown-excessive.sql", title: "Q28 UNKNOWN excessivo", body: `select event_name,
  count(*) filter (where coalesce(metadata->>'value_type','UNKNOWN') = 'UNKNOWN')::bigint as unknown_type,
  count(*) filter (where coalesce(metadata->>'value_status','UNKNOWN') = 'UNKNOWN')::bigint as unknown_status,
  count(*)::bigint as total
from phase10 where event_name = 'mia_user_value_outcome'
group by 1;` },
  { file: "patch-106-query29-fallback-proportion.sql", title: "Q29 Proporção fallback", body: `select metadata->>'search_path' as search_path, count(*)::bigint as eventos
from phase10 where event_name in ('mia_price_intelligence','mia_user_value_outcome')
group by 1 order by eventos desc;` },
  { file: "patch-106-query30-phase10-integrity-summary.sql", title: "Q30 Integridade geral Fase 10", body: `select
  (select count(*)::bigint from phase10) as total_eventos,
  (select count(distinct decision_request_id)::bigint from phase10 where decision_request_id is not null) as decisoes_distintas,
  (select count(*)::bigint from phase10 where purchase_confirmed = true) as purchase_confirmed_count,
  (select count(*)::bigint from phase10 where value_verified = true) as value_verified_count,
  (select count(*)::bigint from phase10 where verified_value_amount is not null) as verified_amount_count,
  (select count(*)::bigint from phase10 where metadata::text ~* '(product_name|https://|query_text)') as pii_suspect_count;` },
];

const EXTRA_CTE_FILES = new Set([
  "patch-106-query5-funnel-101-102-104-105.sql",
  "patch-106-query6-missing-chain-events.sql",
  "patch-106-query16-alert-invalid-transitions.sql",
  "patch-106-query24-chain-coverage-rate.sql",
]);

for (const q of QUERY_DEFS) {
  const sqlBody = EXTRA_CTE_FILES.has(q.file)
    ? `${BASE.trimEnd().replace(/\)\s*$/, "),\n")}${q.body}`
    : `${BASE}\n${q.body}`;
  writeFileSync(join(OUT, q.file), `-- PATCH 10.6 — ${q.title}\n${sqlBody}\n`, "utf8");
  console.log("wrote", q.file);
}
console.log(`\nGenerated ${QUERY_DEFS.length} cross-audit SQL files.`);
