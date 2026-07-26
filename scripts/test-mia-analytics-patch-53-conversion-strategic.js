#!/usr/bin/env node
/**
 * PATCH 5.3 — Conversion strategic funnel SQL audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-conversion-strategic.sql");
const STRATEGIC_DOC = join(ANALYTICS_DIR, "CONVERSION_STRATEGIC_ANALYTICS.md");
const CONVERSION_DOC = join(ANALYTICS_DIR, "CONVERSION_DASHBOARD.md");

const REQUIRED_ALIASES = [
  "transicao",
  "perda_absoluta_visitantes",
  "rank_abandono",
  "is_gargalo_principal",
  "cohort_day",
  "conversao_acumulada_intencao_cohort",
  "tipo_analise",
  "subsegmento",
  "conversao_acumulada_intencao",
  "abandono_topo_pergunta",
  "janela",
  "delta_conversao_acumulada_intencao",
  "sinal_tendencia_funil",
  "dia_referencia",
];

const FORBIDDEN_DUPLICATE_43 = [
  /\bas\s+visitantes_sequenciais\b/i,
  /\bas\s+sessoes_sequenciais\b/i,
  /\bas\s+abandono_visitante\b/i,
  /\bas\s+abandono_sessao\b/i,
  /\bas\s+taxa_conversao_sessao\b/i,
  "entidades_sessao",
  "entidades_pergunta",
  "eventos_perguntas",
  "visitantes_sessao",
  "taxa_clique_recomendacao",
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
  "patch-53-query1-dropoff-bottleneck.sql",
  "patch-53-query2-cohort-funnel.sql",
  "patch-53-query3-segment-modifiers.sql",
  "patch-53-query4-funnel-trend-comparison.sql",
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

console.log("\nPATCH 5.3 — Conversion strategic funnel audit\n");

const sql = readFileSync(SQL_FILE, "utf8");
const strategicDoc = readFileSync(STRATEGIC_DOC, "utf8");

console.log("Documentation — delta vs PATCH 4.3");
assert("Strategic doc references CONVERSION_DASHBOARD", strategicDoc.includes("CONVERSION_DASHBOARD.md"));
assert("Delta section — o que NÃO será reimplementado", /NÃO será reimplementado/i.test(strategicDoc));
assert("Delta section — Fase 5 only", /passa a existir apenas na Fase 5/i.test(strategicDoc));
assert("Strategic doc — gargalo", /is_gargalo_principal|gargalo/i.test(strategicDoc));
assert("Strategic doc — cohort funnel", /cohort/i.test(strategicDoc));
assert("CONVERSION_DASHBOARD unchanged", readFileSync(CONVERSION_DOC, "utf8").includes("PATCH 4.3"));

console.log("\nSQL structure");
assert("SQL references CONVERSION_DASHBOARD / PATCH 4.3", /CONVERSION_DASHBOARD|PATCH 4\.3/i.test(sql));
assert("SQL — from analytics_events", /from\s+analytics_events/i.test(sql));
assert("SQL — sequential MIN(created_at)", /min\(created_at\)/i.test(sql));
assert("SQL — Query 1 drop-off", /QUERY 1/i.test(sql));
assert("SQL — Query 2 cohort", /QUERY 2/i.test(sql));
assert("SQL — Query 3 segment", /QUERY 3/i.test(sql));
assert("SQL — Query 4 trend", /QUERY 4/i.test(sql));

for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}

for (const pattern of FORBIDDEN) {
  assert(`SQL — forbidden ${pattern}`, !pattern.test(sql));
}

for (const pattern of FORBIDDEN_DUPLICATE_43) {
  const re = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
  const label = typeof pattern === "string" ? pattern : pattern.toString();
  assert(`SQL — no PATCH 4.3 duplicate ${label}`, !re.test(sql));
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
  assert("DASHBOARDS.md lists conversion strategic", dashboards.includes("analytics-conversion-strategic.sql"));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
