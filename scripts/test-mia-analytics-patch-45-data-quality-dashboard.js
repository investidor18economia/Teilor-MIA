#!/usr/bin/env node
/**
 * PATCH 4.5 — Data quality dashboard SQL audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-data-quality-dashboard.sql");
const DOC_FILE = join(ANALYTICS_DIR, "DATA_QUALITY_DASHBOARD.md");

const REQUIRED_ALIASES = [
  "event_name",
  "total_eventos",
  "total_eventos_producao",
  "total_eventos_qa",
  "eventos_fora_catalogo",
  "eventos_fora_catalogo_total",
  "cobertura_visitor_id",
  "cobertura_session_id",
  "cobertura_conversation_id",
  "cobertura_query_text",
  "cobertura_category",
  "cobertura_product_name",
  "cobertura_user_id",
  "cobertura_timestamp_valido",
  "dia",
  "variacao_volume_pct",
  "verificacao",
  "ocorrencias",
  "detalhe",
];

const CATALOG_EVENTS = [
  "session_started",
  "user_authenticated",
  "mia_question_sent",
  "price_drop_email_sent",
];

const FORBIDDEN = [
  /\bas\s+dau\b/i,
  /\bas\s+wau\b/i,
  /\bas\s+mau\b/i,
  /\bas\s+usuarios_ativos\b/i,
  /create\s+table/i,
  /materialized\s+view/i,
];

const PRODUCTION_MARKERS = [
  "price_alert_email_test",
  "price_alert_e2e_test",
  "price_drop_email_test_%",
  "price_drop_email_e2e_%",
  "test-agent",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

console.log("\nPATCH 4.5 — Data quality dashboard audit\n");

const sql = readFileSync(SQL_FILE, "utf8");
const doc = readFileSync(DOC_FILE, "utf8");

console.log("Documentation");
assert("DATA_QUALITY_DASHBOARD.md references EVENT_CONTRACT", doc.includes("EVENT_CONTRACT.md"));
assert("DATA_QUALITY_DASHBOARD.md — coverage not violation principle", /cobertura|opcionais/i.test(doc));
assert("DATA_QUALITY_DASHBOARD.md — 17 events catalog", /17 eventos/i.test(doc));
assert("DATA_QUALITY_DASHBOARD.md — limitations documented", /Limitações/i.test(doc));

console.log("\nSQL structure");
assert("SQL references EVENT_CONTRACT", sql.includes("EVENT_CONTRACT.md"));
assert("SQL references EVENT_FIELD_SPECIFICATION", sql.includes("EVENT_FIELD_SPECIFICATION.md"));
assert("SQL — from analytics_events", /from\s+analytics_events/i.test(sql));
assert("SQL — UTC timezone", /at time zone 'UTC'/i.test(sql));
assert("SQL — Query 1 volume snapshot", /QUERY 1/i.test(sql));
assert("SQL — Query 2 field coverage", /QUERY 2/i.test(sql));
assert("SQL — Query 3 daily evolution", /QUERY 3/i.test(sql));
assert("SQL — Query 4 integrity anomalies", /QUERY 4/i.test(sql));
assert("SQL — catalogo_oficial CTE", /catalogo_oficial/i.test(sql));

for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}

for (const event of CATALOG_EVENTS) {
  assert(`SQL — catalog event ${event}`, sql.includes(event));
}

assert("SQL — session_started duplicate check", /session_started_duplicado_por_sessao/i.test(sql));
assert("SQL — conversation_id semantic check", /session_started_com_conversation_id/i.test(sql));

for (const pattern of FORBIDDEN) {
  assert(`SQL — forbidden ${pattern}`, !pattern.test(sql));
}

for (const marker of PRODUCTION_MARKERS) {
  assert(`SQL — production filter ${marker}`, sql.includes(marker));
}

{
  const dashboards = readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8");
  assert("DASHBOARDS.md lists data quality dashboard", dashboards.includes("analytics-data-quality-dashboard.sql"));
}

for (const split of [
  "patch-45-query1-volume-snapshot.sql",
  "patch-45-query2-field-coverage.sql",
  "patch-45-query3-daily-evolution.sql",
  "patch-45-query4-integrity-anomalies.sql",
]) {
  const splitSql = readFileSync(join(ANALYTICS_DIR, "sql", split), "utf8");
  assert(`Split ${split} — from analytics_events`, /from\s+analytics_events/i.test(splitSql));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
