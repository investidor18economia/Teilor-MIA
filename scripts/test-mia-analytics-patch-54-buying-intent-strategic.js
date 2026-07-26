#!/usr/bin/env node
/**
 * PATCH 5.4 — Buying intent strategic analytics SQL audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-buying-intent-strategic.sql");
const STRATEGIC_DOC = join(ANALYTICS_DIR, "BUYING_INTENT_STRATEGIC_ANALYTICS.md");
const PRODUCTS_DOC = join(ANALYTICS_DIR, "PRODUCTS_CATEGORIES_DASHBOARD.md");

const REQUIRED_ALIASES = [
  "combinacao_sinais",
  "visitantes_com_sinal",
  "pct_visitantes_intencao",
  "media_perguntas_antes_intencao",
  "pct_com_recomendacao_antes_intencao",
  "pct_conversa_profunda_antes_intencao",
  "taxa_visitantes_intencao_pos_recomendacao",
  "rank_intencao",
  "taxa_intencao_cohort",
  "taxa_visitantes_com_intencao",
  "delta_taxa_intencao",
  "sinal_tendencia_intencao",
  "dia_referencia",
];

const FORBIDDEN_DUPLICATE_44 = [
  /\bas\s+total_aparicoes\b/i,
  /\bas\s+total_perguntas\b/i,
  /\bas\s+total_eventos_categoria\b/i,
  /\bas\s+sinais_fortes_de_compra\b/i,
  /\bas\s+taxa_clique_recomendacao\b/i,
  /\bas\s+taxa_intencao_pos_recomendacao\b/i,
  "eventos_perguntas",
  "eventos_recomendacoes",
  "limit 50",
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
  "patch-54-query1-signal-ranking.sql",
  "patch-54-query2-behavioral-antecedents.sql",
  "patch-54-query3-intent-strength.sql",
  "patch-54-query4-intent-trends-cohort.sql",
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

console.log("\nPATCH 5.4 — Buying intent strategic analytics audit\n");

const sql = readFileSync(SQL_FILE, "utf8");
const strategicDoc = readFileSync(STRATEGIC_DOC, "utf8");

console.log("Documentation — delta vs PATCH 4.4");
assert("BUYING_INTENT_STRATEGIC references PRODUCTS_CATEGORIES", strategicDoc.includes("PRODUCTS_CATEGORIES_DASHBOARD.md"));
assert("Delta section — o que NÃO será reimplementado", /NÃO será reimplementado/i.test(strategicDoc));
assert("Delta section — Fase 5 only", /passa a existir apenas na Fase 5/i.test(strategicDoc));
assert("Strategic doc — antecedentes", /antecedente/i.test(strategicDoc));
assert("Strategic doc — combinacao sinais", /combinacao_sinais/i.test(strategicDoc));
assert("PRODUCTS dashboard unchanged", readFileSync(PRODUCTS_DOC, "utf8").includes("PATCH 4.4"));

console.log("\nSQL structure");
assert("SQL references PATCH 4.4 non-duplication", /PATCH 4\.4/i.test(sql));
assert("SQL — intent events", /offer_click/.test(sql) && /favorite_created/.test(sql));
assert("SQL — from analytics_events", /from\s+analytics_events/i.test(sql));
assert("SQL — Query 1 signal ranking", /QUERY 1/i.test(sql));
assert("SQL — Query 2 antecedents", /QUERY 2/i.test(sql));
assert("SQL — Query 3 intent strength", /QUERY 3/i.test(sql));
assert("SQL — Query 4 trends cohort", /QUERY 4/i.test(sql));

for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}

for (const pattern of FORBIDDEN) {
  assert(`SQL — forbidden ${pattern}`, !pattern.test(sql));
}

for (const pattern of FORBIDDEN_DUPLICATE_44) {
  const re = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
  const label = typeof pattern === "string" ? pattern : pattern.toString();
  assert(`SQL — no PATCH 4.4 duplicate ${label}`, !re.test(sql));
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
  assert("DASHBOARDS.md lists buying intent strategic", dashboards.includes("analytics-buying-intent-strategic.sql"));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
