#!/usr/bin/env node
/** Generates PATCH 10.5 SQL queries Q1–Q20 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "docs/analytics/sql");
mkdirSync(OUT, { recursive: true });

const BASE_CTE = `-- PATCH 10.5 base filter
with outcomes as (
  select
    id,
    created_at,
    session_id,
    metadata->>'request_id' as request_id,
    metadata->>'decision_request_id' as decision_request_id,
    coalesce(metadata->>'event_version', '') as event_version,
    nullif(metadata->>'user_value_score', '')::numeric as user_value_score,
    coalesce(metadata->>'value_status', 'UNKNOWN') as value_status,
    coalesce(metadata->>'value_layer', 'UNKNOWN') as value_layer,
    coalesce(metadata->>'value_type', 'UNKNOWN') as value_type,
    coalesce(metadata->>'value_confidence', 'UNKNOWN') as value_confidence,
    coalesce(metadata->>'primary_value_source', 'UNKNOWN') as primary_value_source,
    coalesce(metadata->>'primary_evidence', 'UNKNOWN') as primary_evidence,
    coalesce((metadata->>'supporting_evidence_count')::int, 0) as supporting_evidence_count,
    coalesce((metadata->>'value_component_count')::int, 0) as value_component_count,
    nullif(metadata->>'potential_value_amount', '')::numeric as potential_value_amount,
    nullif(metadata->>'observed_value_amount', '')::numeric as observed_value_amount,
    nullif(metadata->>'verified_value_amount', '')::numeric as verified_value_amount,
    coalesce(metadata->>'verified_value_status', 'NOT_AVAILABLE') as verified_value_status,
    coalesce(metadata->>'time_saved_bucket', 'UNKNOWN') as time_saved_bucket,
    coalesce(metadata->>'price_quality', 'UNKNOWN') as price_quality,
    coalesce(metadata->>'price_confidence', 'UNKNOWN') as price_confidence,
    coalesce(metadata->>'savings_type', 'UNKNOWN') as savings_type,
    nullif(metadata->>'anti_regret_score', '')::numeric as anti_regret_score,
    coalesce(metadata->>'search_path', 'UNKNOWN') as search_path,
    coalesce(metadata->>'winner_provider_id', 'UNKNOWN') as winner_provider_id,
    coalesce((metadata->>'purchase_confirmed')::boolean, false) as purchase_confirmed,
    coalesce((metadata->>'value_verified')::boolean, false) as value_verified
  from analytics_events
  where event_name = 'mia_user_value_outcome'
    and coalesce(metadata->>'event_version', '') = '10.5.0'
    and category not in ('user_value_test')
)`;

const queries = [
  { file: "patch-105-query1-potential-value-avg.sql", title: "Q1 Valor potencial médio", body: `select round(avg(potential_value_amount), 2) as potential_avg, count(*)::bigint as eventos from outcomes where potential_value_amount is not null;` },
  { file: "patch-105-query2-observed-value-avg.sql", title: "Q2 Valor observado médio", body: `select round(avg(observed_value_amount), 2) as observed_avg, count(*)::bigint as eventos from outcomes where observed_value_amount is not null;` },
  { file: "patch-105-query3-value-by-layer.sql", title: "Q3 Valor por categoria/layer", body: `select value_layer, round(avg(potential_value_amount), 2) as potential_avg, count(*)::bigint as eventos from outcomes group by 1 order by eventos desc;` },
  { file: "patch-105-query4-score-distribution.sql", title: "Q4 Distribuição do score", body: `select width_bucket(user_value_score, 0, 100, 10) as bucket, count(*)::bigint as eventos from outcomes where user_value_score is not null group by 1 order by 1;` },
  { file: "patch-105-query5-confidence-distribution.sql", title: "Q5 Distribuição confidence", body: `select value_confidence, count(*)::bigint as eventos from outcomes group by 1 order by eventos desc;` },
  { file: "patch-105-query6-value-type.sql", title: "Q6 Value Type", body: `select value_type, count(*)::bigint as eventos, round(avg(user_value_score), 2) as score_medio from outcomes group by 1 order by eventos desc;` },
  { file: "patch-105-query7-outcome-status.sql", title: "Q7 Outcome Status", body: `select value_status, count(*)::bigint as eventos from outcomes group by 1 order by eventos desc;` },
  { file: "patch-105-query8-time-saved-bucket.sql", title: "Q8 Tempo economizado bucket", body: `select time_saved_bucket, count(*)::bigint as eventos from outcomes group by 1 order by eventos desc;` },
  { file: "patch-105-query9-value-components.sql", title: "Q9 Componentes do score", body: `select value_component_count, round(avg(user_value_score), 2) as score_medio, count(*)::bigint as eventos from outcomes group by 1 order by 1;` },
  { file: "patch-105-query10-price-intelligence-correlation.sql", title: "Q10 Correlação Price Intelligence", body: `select price_quality, price_confidence, round(avg(user_value_score), 2) as score_medio, count(*)::bigint as eventos from outcomes group by 1, 2 order by eventos desc;` },
  { file: "patch-105-query11-savings-correlation.sql", title: "Q11 Correlação Savings", body: `select savings_type, round(avg(potential_value_amount), 2) as potential_avg, count(*)::bigint as eventos from outcomes group by 1 order by eventos desc;` },
  { file: "patch-105-query12-anti-regret-correlation.sql", title: "Q12 Correlação Anti-Regret", body: `select round(corr(anti_regret_score, user_value_score)::numeric, 4) as correlacao, count(*)::bigint as eventos from outcomes where anti_regret_score is not null and user_value_score is not null;` },
  { file: "patch-105-query13-acceptance-correlation.sql", title: "Q13 Correlação Acceptance", body: `select o.decision_request_id, o.user_value_score, count(a.id)::bigint as acceptance_signals from outcomes o left join analytics_events a on a.event_name = 'mia_recommendation_acceptance_signal' and a.metadata->>'decision_request_id' = o.decision_request_id group by 1, 2 limit 50;` },
  { file: "patch-105-query14-rejection-correlation.sql", title: "Q14 Correlação Rejection", body: `select o.decision_request_id, o.user_value_score, count(r.id)::bigint as rejection_signals from outcomes o left join analytics_events r on r.event_name = 'mia_recommendation_rejection_signal' and r.metadata->>'decision_request_id' = o.decision_request_id group by 1, 2 limit 50;` },
  { file: "patch-105-query15-alerts-correlation.sql", title: "Q15 Correlação Alerts", body: `select o.decision_request_id, o.user_value_score, count(l.id)::bigint as alert_events from outcomes o left join analytics_events l on l.event_name = 'mia_price_alert_lifecycle' and l.metadata->>'decision_request_id' = o.decision_request_id group by 1, 2 limit 50;` },
  { file: "patch-105-query16-score-vs-confidence.sql", title: "Q16 Score vs confidence", body: `select value_confidence, round(avg(user_value_score), 2) as score_medio, count(*)::bigint as eventos from outcomes group by 1 order by score_medio desc nulls last;` },
  { file: "patch-105-query17-temporal-evolution.sql", title: "Q17 Evolução temporal", body: `select (created_at at time zone 'UTC')::date as dia, round(avg(user_value_score), 2) as score_medio, count(*)::bigint as eventos from outcomes group by 1 order by 1 desc limit 30;` },
  { file: "patch-105-query18-search-path.sql", title: "Q18 Distribuição search_path", body: `select search_path, round(avg(user_value_score), 2) as score_medio, count(*)::bigint as eventos from outcomes group by 1 order by eventos desc;` },
  { file: "patch-105-query19-provider-distribution.sql", title: "Q19 Distribuição provider", body: `select winner_provider_id as provider_id, round(avg(user_value_score), 2) as score_medio, count(*)::bigint as eventos from outcomes where winner_provider_id <> 'UNKNOWN' group by 1 order by eventos desc limit 30;` },
  { file: "patch-105-query20-verified-rate.sql", title: "Q20 Taxa VERIFIED", body: `select value_status, count(*) filter (where verified_value_amount is not null)::bigint as com_verified_amount, count(*)::bigint as total from outcomes group by 1 order by 1;` },
];

for (const q of queries) {
  writeFileSync(join(OUT, q.file), `-- PATCH 10.5 — ${q.title}\n${BASE_CTE}\n${q.body}\n`, "utf8");
  console.log("wrote", q.file);
}
console.log(`\nGenerated ${queries.length} SQL files.`);
