#!/usr/bin/env node
/**
 * PATCH 6.3 — Data Layer statistics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-data-layer-statistics.sql");
const STATS_DOC = join(ANALYTICS_DIR, "DATA_LAYER_STATISTICS.md");

const REQUIRED_ALIASES = [
  "dia_referencia",
  "tipo_analise",
  "dimensao_estatistica",
  "valor_absoluto",
  "valor_relativo",
  "registros_total",
  "referencia_denominador",
  "amostra_analisavel",
];

const FORBIDDEN = [
  /from\s+analytics_events/i,
  /\bcreate\s+table\b/i,
  /\bmaterialized\s+view\b/i,
  /\bupdate\s+/i,
  /\bdelete\s+from\b/i,
  /\binsert\s+into\b/i,
];

const FORBIDDEN_DUPLICATE_61 = [
  /\bstatus_cobertura\b/i,
  /\bprioridade_expansao\b/i,
  /\bpct_exposicao_runtime_sobre_detail\b/i,
  /\breferencia_comercial\b/i,
];

const FORBIDDEN_DUPLICATE_62 = [
  /\bseveridade\b/i,
  /\bprioridade_correcao\b/i,
  /\bdimensao_qualidade\b/i,
  /\bduplicacao_confirmada\b/i,
];

const FORBIDDEN_MARKET = [
  /\bmarket_share\b/i,
  /\bdominio_de_mercado\b/i,
  /\bnota_diversidade\b/i,
  /\bas\s+score_estatistico\b/i,
];

const SPLIT_FILES = [
  "patch-63-query1-inventory-category.sql",
  "patch-63-query2-brand-family-concentration.sql",
  "patch-63-query3-technical-attributes.sql",
  "patch-63-query4-temporal-panel-insights.sql",
];

const REQUIRED_TABLES = ["product_specs", "phone_specs", "notebook_specs"];

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
const doc = readFileSync(STATS_DOC, "utf8");

console.log("\nPATCH 6.3 — Data Layer statistics audit\n");

console.log("Documentation");
assert("DATA_LAYER_STATISTICS exists", existsSync(STATS_DOC));
assert("Delta vs PATCH 6.1", doc.includes("6.1"));
assert("Delta vs PATCH 6.2", doc.includes("6.2"));
assert("Delta vs PATCH 6.4", doc.includes("6.4"));
assert("Fase 6 absolute+relative rule", doc.includes("valor_absoluto") && doc.includes("valor_relativo"));
assert("No market share claim", /Participação no Data Layer.*market share/i.test(doc));
assert("No arbitrary score", /sem score|não.*score agregado/i.test(doc));
assert("Historical limitation", /timestamps|histórico/i.test(doc));

console.log("\nSQL structure");
assert("SQL references searchUniversalDataLayer", /searchUniversalDataLayer/i.test(sql));
for (const table of REQUIRED_TABLES) {
  assert(`SQL — ${table}`, sql.includes(table));
}
assert("SQL — Query 1 inventory", /QUERY 1/i.test(sql));
assert("SQL — Query 2 brand", /QUERY 2/i.test(sql));
assert("SQL — Query 3 attributes", /QUERY 3/i.test(sql));
assert("SQL — Query 4 temporal", /QUERY 4/i.test(sql));
assert("SQL — inventario_consolidado", sql.includes("inventario_consolidado"));
assert("SQL — concentracao", sql.includes("concentracao"));
assert("SQL — percentile_cont", /percentile_cont/i.test(sql));
assert("SQL — top3_participacao", sql.includes("top3_participacao"));
assert("SQL — entidades_para_50pct", sql.includes("entidades_para_50pct"));
assert("SQL — capacidade_historica", sql.includes("capacidade_historica"));
assert("SQL — nullif guard", /nullif/i.test(sql));

for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}
for (const rule of FORBIDDEN) {
  assert(`SQL — forbidden ${rule}`, !rule.test(sql));
}
for (const rule of FORBIDDEN_DUPLICATE_61) {
  assert(`SQL — no PATCH 6.1 duplicate ${rule}`, !rule.test(sql));
}
for (const rule of FORBIDDEN_DUPLICATE_62) {
  assert(`SQL — no PATCH 6.2 duplicate ${rule}`, !rule.test(sql));
}
for (const rule of FORBIDDEN_MARKET) {
  assert(`SQL — no market/score ${rule}`, !rule.test(sql));
}

console.log("\nSplit SQL files");
assert("DASHBOARDS.md lists statistics", readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8").includes("analytics-data-layer-statistics"));
for (const file of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", file);
  const content = readFileSync(path, "utf8");
  assert(`${file} — exists`, existsSync(path));
  assert(`${file} — catalog table`, REQUIRED_TABLES.some((t) => content.includes(t)));
  assert(`${file} — no analytics_events`, !/from\s+analytics_events/i.test(content));
}

console.log("\nSplit consistency");
const norm = (s) => s.replace(/\r\n/g, "\n");
for (const file of SPLIT_FILES) {
  const split = readFileSync(join(ANALYTICS_DIR, "sql", file), "utf8").trim();
  assert(`${file} — in main SQL`, norm(sql).includes(norm(split).slice(0, 100)));
}

console.log(`\nResultado: ${passed}/${passed + failed}\n`);
if (failed > 0) process.exit(1);
