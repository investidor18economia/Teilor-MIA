#!/usr/bin/env node
/**
 * PATCH 6.1 — Data Layer coverage analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-data-layer-coverage.sql");
const COVERAGE_DOC = join(ANALYTICS_DIR, "COVERAGE_ANALYTICS.md");
const DATA_QUALITY_DOC = join(ANALYTICS_DIR, "DATA_QUALITY_DASHBOARD.md");

const REQUIRED_ALIASES = [
  "dia_referencia",
  "tipo_analise",
  "categoria",
  "status_cobertura",
  "modelos_ativos",
  "registros_detail",
  "pct_hidratacao_detail_central",
  "pct_detail_exposto_ao_runtime",
  "marca",
  "familia",
  "pct_modelos_na_categoria",
  "pct_cobertura_atributo",
  "prioridade_expansao",
  "pct_exposicao_runtime_sobre_detail",
  "justificativa_prioridade",
];

const FORBIDDEN = [
  /from\s+analytics_events/i,
  /create\s+table/i,
  /materialized\s+view/i,
  /\bas\s+dau\b/i,
  /\bas\s+wau\b/i,
  /\bas\s+mau\b/i,
];

const FORBIDDEN_DUPLICATE_45 = [
  /\bcobertura_visitor_id\b/i,
  /\bcobertura_session_id\b/i,
  /eventos_fora_catalogo/i,
  /price_alert_email_test/,
];

const REQUIRED_TABLES = ["product_specs", "phone_specs", "notebook_specs"];

const SPLIT_FILES = [
  "patch-61-query1-category-coverage.sql",
  "patch-61-query2-brand-family-coverage.sql",
  "patch-61-query3-model-attribute-coverage.sql",
  "patch-61-query4-commercial-gaps-priority.sql",
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

const sql = readFileSync(SQL_FILE, "utf8");
const doc = readFileSync(COVERAGE_DOC, "utf8");

console.log("\nPATCH 6.1 — Data Layer coverage analytics audit\n");

console.log("Documentation — delta vs PATCH 4.5");
assert("COVERAGE_ANALYTICS references DATA_QUALITY", doc.includes("DATA_QUALITY"));
assert("Delta section — o que NÃO reimplementa", /NÃO reimplementa/i.test(doc));
assert("Delta section — PATCH 6.2/6.3/6.4 boundaries", doc.includes("6.2") && doc.includes("6.4"));
assert("Strategic doc — cobertura relativa", doc.includes("Cobertura relativa") || doc.includes("cobertura relativa"));
assert("Strategic doc — read-only", /read-only/i.test(doc));
assert("DATA_QUALITY unchanged scope claim", readFileSync(DATA_QUALITY_DOC, "utf8").includes("sistema de Analytics"));

console.log("\nSQL structure");
assert("SQL references searchUniversalDataLayer", /searchUniversalDataLayer/i.test(sql));
assert("SQL — product_specs", sql.includes("product_specs"));
assert("SQL — phone_specs", sql.includes("phone_specs"));
assert("SQL — notebook_specs", sql.includes("notebook_specs"));
assert("SQL — Query 1 category", /QUERY 1/i.test(sql));
assert("SQL — Query 2 brand family", /QUERY 2/i.test(sql));
assert("SQL — Query 3 attribute", /QUERY 3/i.test(sql));
assert("SQL — Query 4 commercial gaps", /QUERY 4/i.test(sql));
for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}
for (const rule of FORBIDDEN) {
  assert(`SQL — forbidden ${rule}`, !rule.test(sql));
}
for (const rule of FORBIDDEN_DUPLICATE_45) {
  assert(`SQL — no PATCH 4.5 duplicate ${rule}`, !rule.test(sql));
}
assert("SQL — referencia_comercial CTE", /referencia_comercial/i.test(sql));
assert("SQL — no analytics production filter needed", !sql.includes("price_alert_email_test"));

console.log("\nSplit SQL files");
assert("DASHBOARDS.md lists data layer coverage", readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8").includes("analytics-data-layer-coverage"));
for (const file of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", file);
  const content = readFileSync(path, "utf8");
  assert(`${file} — exists`, existsSync(path));
  for (const table of REQUIRED_TABLES) {
    if (file.includes("query2") || file.includes("query4")) {
      if (table === "product_specs") assert(`${file} — ${table}`, content.includes(table));
    } else {
      assert(`${file} — from catalog table`, REQUIRED_TABLES.some((t) => content.includes(t)));
    }
  }
  assert(`${file} — no analytics_events`, !/from\s+analytics_events/i.test(content));
}

console.log(`\nResultado: ${passed}/${passed + failed}\n`);
if (failed > 0) process.exit(1);
