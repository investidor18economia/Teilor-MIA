#!/usr/bin/env node
/**
 * PATCH 5.1 — Growth strategic analytics SQL audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-growth-strategic.sql");
const STRATEGIC_DOC = join(ANALYTICS_DIR, "GROWTH_STRATEGIC_ANALYTICS.md");
const GROWTH_DASHBOARD_DOC = join(ANALYTICS_DIR, "GROWTH_DASHBOARD.md");
const METRICS_DOC = join(ANALYTICS_DIR, "EXECUTIVE_METRICS.md");

const REQUIRED_ALIASES = [
  "cohort_day",
  "cohort_size",
  "retention_d1_pct",
  "retention_d7_pct",
  "retention_d30_pct",
  "stickiness_dau_mau_visitors",
  "participacao_novos_visitantes",
  "participacao_recorrentes",
  "media_retention_d7_cohorts_maduros_pct",
  "aceleracao_crescimento_dau_pct",
  "sinal_tendencia_crescimento",
  "retention_d7_agregada_pct",
  "retention_d7_segmento_autenticou_pct",
  "retention_d7_segmento_anonimo_pct",
  "delta_retention_d7_janelas_pct",
  "dia_referencia",
];

const FORBIDDEN_DUPLICATE_42 = [
  "new_visitors_acumulado",
  "crescimento_wau_visitors_pct",
  "crescimento_mau_visitors_pct",
  "crescimento_wau_users_pct",
  "crescimento_mau_users_pct",
  /periodo\s*=\s*'atual'/i,
  /periodo\s*=\s*'dia_anterior'/i,
];

const FORBIDDEN = [
  /\bas\s+dau\b/i,
  /\bas\s+wau\b/i,
  /\bas\s+mau\b/i,
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

const SPLIT_FILES = [
  "patch-51-query1-visitor-cohort-retention.sql",
  "patch-51-query2-user-cohort-retention.sql",
  "patch-51-query3-strategic-health-snapshot.sql",
  "patch-51-query4-retention-trends-comparison.sql",
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

console.log("\nPATCH 5.1 — Growth strategic analytics audit\n");

const sql = readFileSync(SQL_FILE, "utf8");
const strategicDoc = readFileSync(STRATEGIC_DOC, "utf8");
const growthDoc = readFileSync(GROWTH_DASHBOARD_DOC, "utf8");

console.log("Documentation — delta vs PATCH 4.2");
assert("GROWTH_STRATEGIC_ANALYTICS.md references EXECUTIVE_METRICS", strategicDoc.includes("EXECUTIVE_METRICS.md"));
assert("GROWTH_STRATEGIC_ANALYTICS.md references GROWTH_DASHBOARD", strategicDoc.includes("GROWTH_DASHBOARD.md"));
assert("Delta section — o que NÃO será reimplementado", /NÃO será reimplementado/i.test(strategicDoc));
assert("Delta section — o que passa a existir na Fase 5", /passa a existir apenas na Fase 5/i.test(strategicDoc));
assert("Strategic doc — retention D1/D7/D30", /retention_d7_pct|retention_dN_pct/i.test(strategicDoc));
assert("Strategic doc — stickiness", /stickiness_dau_mau_visitors/i.test(strategicDoc));
assert("GROWTH_DASHBOARD unchanged as operational source", growthDoc.includes("PATCH 4.2"));

console.log("\nSQL structure");
assert("SQL references EXECUTIVE_METRICS", sql.includes("EXECUTIVE_METRICS.md"));
assert("SQL references PATCH 4.2 non-duplication", /PATCH 4.2/i.test(sql));
assert("SQL — from analytics_events", /from\s+analytics_events/i.test(sql));
assert("SQL — UTC timezone", /at time zone 'UTC'/i.test(sql));
assert("SQL — Query 1 visitor cohort retention", /QUERY 1/i.test(sql));
assert("SQL — Query 2 user cohort retention", /QUERY 2/i.test(sql));
assert("SQL — Query 3 strategic health", /QUERY 3/i.test(sql));
assert("SQL — Query 4 retention trends", /QUERY 4/i.test(sql));

for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}

for (const pattern of FORBIDDEN) {
  assert(`SQL — forbidden ${pattern}`, !pattern.test(sql));
}

for (const pattern of FORBIDDEN_DUPLICATE_42) {
  const re = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
  const label = typeof pattern === "string" ? pattern : pattern.toString();
  assert(`SQL — no PATCH 4.2 duplicate ${label}`, !re.test(sql));
}

for (const marker of PRODUCTION_MARKERS) {
  assert(`SQL — production filter ${marker}`, sql.includes(marker));
}

console.log("\nSplit SQL files");
for (const file of SPLIT_FILES) {
  const splitSql = readFileSync(join(ANALYTICS_DIR, "sql", file), "utf8");
  assert(`${file} — from analytics_events`, /from\s+analytics_events/i.test(splitSql));
  assert(`${file} — production filter`, splitSql.includes("price_alert_email_test"));
}

{
  const dashboards = readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8");
  assert("DASHBOARDS.md lists growth strategic analytics", dashboards.includes("analytics-growth-strategic.sql"));
}

{
  assert("EXECUTIVE_METRICS still canonical", readFileSync(METRICS_DOC, "utf8").includes("PATCH 4.1"));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
