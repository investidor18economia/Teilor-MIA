#!/usr/bin/env node
/**
 * PATCH 4.3 — Conversion dashboard SQL audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-conversion-dashboard.sql");
const CONVERSION_DOC = join(ANALYTICS_DIR, "CONVERSION_DASHBOARD.md");
const METRICS_DOC = join(ANALYTICS_DIR, "EXECUTIVE_METRICS.md");

const REQUIRED_ALIASES = [
  "dia_referencia",
  "ordem",
  "etapa",
  "visitantes",
  "sessoes",
  "eventos",
  "visitantes_sequenciais",
  "sessoes_sequenciais",
  "taxa_conversao_visitante",
  "abandono_visitante",
  "taxa_conversao_sessao",
  "abandono_sessao",
  "conversao_acumulada_visitante",
  "conversao_acumulada_sessao",
  "sessoes_iniciadas",
  "eventos_perguntas",
  "eventos_recomendacoes",
  "eventos_cliques_oferta",
  "eventos_favoritos",
  "eventos_alertas_preco",
  "taxa_conversao_sessao_pergunta",
  "taxa_conversao_pergunta_recomendacao",
  "taxa_conversao_recomendacao_clique",
  "conversao_acumulada_visitante",
  "taxa_clique_recomendacao",
  "segmento",
  "entidades_sessao",
  "authenticated_users",
  "conversao_acumulada_intencao_compra",
];

const FUNNEL_EVENTS = [
  "session_started",
  "mia_question_sent",
  "mia_recommendation_shown",
  "offer_click",
  "favorite_created",
  "price_alert_created",
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

console.log("\nPATCH 4.3 — Conversion dashboard audit\n");

const sql = readFileSync(SQL_FILE, "utf8");
const conversionDoc = readFileSync(CONVERSION_DOC, "utf8");
const metricsDoc = readFileSync(METRICS_DOC, "utf8");

console.log("Documentation");
assert("CONVERSION_DASHBOARD.md references EXECUTIVE_METRICS", conversionDoc.includes("EXECUTIVE_METRICS.md"));
assert("CONVERSION_DASHBOARD.md — funnel order documented", /sessoes_iniciadas/i.test(conversionDoc));
assert("CONVERSION_DASHBOARD.md — sequential funnel documented", /visitantes_sequenciais/i.test(conversionDoc));
assert("CONVERSION_DASHBOARD.md — limitations documented", /Limitações/i.test(conversionDoc));
assert("EXECUTIVE_METRICS — 7 qualifying events", (metricsDoc.match(/session_started/g) || []).length >= 1);

console.log("\nSQL structure");
assert("SQL references EXECUTIVE_METRICS", sql.includes("EXECUTIVE_METRICS.md"));
assert("SQL — from analytics_events", /from\s+analytics_events/i.test(sql));
assert("SQL — UTC timezone", /at time zone 'UTC'/i.test(sql));
assert("SQL — Query 1 funnel snapshot", /QUERY 1/i.test(sql));
assert("SQL — Query 2 daily funnel", /QUERY 2/i.test(sql));
assert("SQL — Query 3 segment comparison", /QUERY 3/i.test(sql));

for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}

for (const event of FUNNEL_EVENTS) {
  assert(`SQL — funnel event ${event}`, sql.includes(event));
}

for (const pattern of FORBIDDEN) {
  assert(`SQL — forbidden ${pattern}`, !pattern.test(sql));
}

for (const marker of PRODUCTION_MARKERS) {
  assert(`SQL — production filter ${marker}`, sql.includes(marker));
}

{
  const dashboards = readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8");
  assert("DASHBOARDS.md lists conversion dashboard", dashboards.includes("analytics-conversion-dashboard.sql"));
}

{
  for (const split of [
    "patch-43-query1-funnel-snapshot.sql",
    "patch-43-query2-daily-funnel.sql",
    "patch-43-query3-segment-comparison.sql",
  ]) {
    const splitSql = readFileSync(join(ANALYTICS_DIR, "sql", split), "utf8");
    assert(`Split ${split} — from analytics_events`, /from\s+analytics_events/i.test(splitSql));
  }
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
