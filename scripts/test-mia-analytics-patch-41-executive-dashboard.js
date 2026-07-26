#!/usr/bin/env node
/**
 * PATCH 4.1 — Executive metrics governance + SQL dashboard audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const METRICS_DOC = join(ANALYTICS_DIR, "EXECUTIVE_METRICS.md");
const SQL_FILE = join(ANALYTICS_DIR, "analytics-executive-dashboard.sql");

const REQUIRED_METRIC_ALIASES = [
  "dau_visitors",
  "dau_users",
  "wau_visitors",
  "wau_users",
  "mau_visitors",
  "mau_users",
  "new_visitors",
  "returning_visitors",
  "anonymous_visitors",
  "authenticated_users",
  "taxa_autenticacao",
  "sessoes_unicas",
  "conversas_unicas",
];

const REQUIRED_EVENTS = [
  "session_started",
  "user_authenticated",
  "mia_question_sent",
  "mia_recommendation_shown",
  "offer_click",
  "favorite_created",
  "price_alert_created",
];

const FORBIDDEN_BARE_ALIASES = [
  /\bas\s+dau\b/i,
  /\bas\s+wau\b/i,
  /\bas\s+mau\b/i,
  /\bas\s+usuarios_ativos\b/i,
  /\bas\s+active_users\b/i,
];

const REQUIRED_METRICS_SECTIONS = [
  "DAU Visitors",
  "DAU Users",
  "WAU Visitors",
  "WAU Users",
  "MAU Visitors",
  "MAU Users",
  "New Visitor",
  "Returning Visitor",
  "Anonymous Visitor",
  "Active Visitor",
  "Active User",
  "Taxa de autenticação",
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

console.log("\nPATCH 4.1 — Executive Dashboard audit\n");

const metricsDoc = readFileSync(METRICS_DOC, "utf8");
const sql = readFileSync(SQL_FILE, "utf8");

console.log("Documentation (EXECUTIVE_METRICS.md)");
for (const section of REQUIRED_METRICS_SECTIONS) {
  assert(`EXECUTIVE_METRICS.md — section "${section}"`, metricsDoc.includes(section));
}
assert("EXECUTIVE_METRICS.md — UTC timezone rule", /UTC/i.test(metricsDoc));
assert("EXECUTIVE_METRICS.md — rolling WAU/MAU", /rolling/i.test(metricsDoc));
assert("EXECUTIVE_METRICS.md — dau_visitors nomenclature", metricsDoc.includes("dau_visitors"));
assert("EXECUTIVE_METRICS.md — dau_users nomenclature", metricsDoc.includes("dau_users"));
assert("EXECUTIVE_METRICS.md — analytics_events source", metricsDoc.includes("analytics_events"));
assert("EXECUTIVE_METRICS.md — no snapshots rule", /snapshot/i.test(metricsDoc));

console.log("\nSQL (analytics-executive-dashboard.sql)");
assert("SQL — references EXECUTIVE_METRICS.md", sql.includes("EXECUTIVE_METRICS.md"));
assert("SQL — from analytics_events", /from\s+analytics_events/i.test(sql));
assert("SQL — UTC activity_day", /at time zone 'UTC'/i.test(sql));

for (const alias of REQUIRED_METRIC_ALIASES) {
  assert(`SQL — metric alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}

for (const event of REQUIRED_EVENTS) {
  assert(`SQL — qualifying event ${event}`, sql.includes(`'${event}'`));
}

for (const pattern of FORBIDDEN_BARE_ALIASES) {
  assert(`SQL — no forbidden alias ${pattern}`, !pattern.test(sql));
}

for (const marker of PRODUCTION_MARKERS) {
  assert(`SQL — production filter ${marker}`, sql.includes(marker));
}

assert("SQL — Query 1 snapshot section", /QUERY 1/i.test(sql));
assert("SQL — Query 2 daily evolution", /QUERY 2/i.test(sql));
assert("SQL — no materialized view", !/materialized\s+view/i.test(sql));
assert("SQL — no create table", !/create\s+table/i.test(sql));

console.log("\nCross-artifacts");
{
  const dashboards = readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8");
  assert("DASHBOARDS.md — links EXECUTIVE_METRICS", dashboards.includes("EXECUTIVE_METRICS.md"));
  assert("DASHBOARDS.md — executive SQL listed", dashboards.includes("analytics-executive-dashboard.sql"));
  assert("DASHBOARDS.md — 7 eventos", /7 eventos/i.test(dashboards));
}

{
  const scope = readFileSync(join(ANALYTICS_DIR, "analytics-production-scope.sql"), "utf8");
  assert("production-scope — user_authenticated listed", scope.includes("user_authenticated"));
  assert("production-scope — 7 eventos", /7 eventos/i.test(scope));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
