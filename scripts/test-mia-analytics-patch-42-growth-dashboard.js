#!/usr/bin/env node
/**
 * PATCH 4.2 — Growth dashboard SQL audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-growth-dashboard.sql");
const GROWTH_DOC = join(ANALYTICS_DIR, "GROWTH_DASHBOARD.md");
const METRICS_DOC = join(ANALYTICS_DIR, "EXECUTIVE_METRICS.md");

const REQUIRED_ALIASES = [
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
  "crescimento_dau_visitors_pct",
  "crescimento_wau_visitors_pct",
  "crescimento_mau_visitors_pct",
  "new_visitors_acumulado",
  "periodo",
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

console.log("\nPATCH 4.2 — Growth dashboard audit\n");

const sql = readFileSync(SQL_FILE, "utf8");
const growthDoc = readFileSync(GROWTH_DOC, "utf8");

console.log("Documentation");
assert("GROWTH_DASHBOARD.md references EXECUTIVE_METRICS", growthDoc.includes("EXECUTIVE_METRICS.md"));
assert("GROWTH_DASHBOARD.md — no new metric definitions claim", /reutilização obrigatória|sem novas definições/i.test(growthDoc));
assert("GROWTH_DASHBOARD.md — rolling weekly documented", /wau_visitors/i.test(growthDoc));
assert("GROWTH_DASHBOARD.md — rolling monthly documented", /mau_visitors/i.test(growthDoc));

console.log("\nSQL structure");
assert("SQL references EXECUTIVE_METRICS", sql.includes("EXECUTIVE_METRICS.md"));
assert("SQL — from analytics_events", /from\s+analytics_events/i.test(sql));
assert("SQL — UTC timezone", /at time zone 'UTC'/i.test(sql));
assert("SQL — Query 1 daily growth", /QUERY 1/i.test(sql));
assert("SQL — Query 2 period comparison", /QUERY 2/i.test(sql));
assert("SQL — Query 3 acquisition", /QUERY 3/i.test(sql));

for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}

for (const pattern of FORBIDDEN) {
  assert(`SQL — forbidden ${pattern}`, !pattern.test(sql));
}

for (const marker of PRODUCTION_MARKERS) {
  assert(`SQL — production filter ${marker}`, sql.includes(marker));
}

{
  const dashboards = readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8");
  assert("DASHBOARDS.md lists growth dashboard", dashboards.includes("analytics-growth-dashboard.sql"));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
