#!/usr/bin/env node
/**
 * PATCH 6.2 — Data Layer quality analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-data-layer-quality.sql");
const QUALITY_DOC = join(ANALYTICS_DIR, "DATA_QUALITY_ANALYTICS.md");
const COVERAGE_DOC = join(ANALYTICS_DIR, "COVERAGE_ANALYTICS.md");
const DATA_QUALITY_DASHBOARD = join(ANALYTICS_DIR, "DATA_QUALITY_DASHBOARD.md");

const REQUIRED_ALIASES = [
  "dia_referencia",
  "tipo_analise",
  "dimensao_qualidade",
  "registros_total",
  "registros_afetados",
  "pct_registros_afetados",
  "referencia_denominador",
  "severidade",
  "prioridade_correcao",
];

const FORBIDDEN = [
  /from\s+analytics_events/i,
  /\bcreate\s+table\b/i,
  /\bmaterialized\s+view\b/i,
  /\bupdate\s+/i,
  /\bdelete\s+from\b/i,
  /\binsert\s+into\b/i,
];

const FORBIDDEN_DUPLICATE_45 = [
  /\bcobertura_visitor_id\b/i,
  /\bcobertura_session_id\b/i,
  /eventos_fora_catalogo/i,
];

const FORBIDDEN_DUPLICATE_61 = [
  /\bstatus_cobertura\b/i,
  /\bprioridade_expansao\b/i,
  /\bpct_exposicao_runtime_sobre_detail\b/i,
  /\breferencia_comercial\b/i,
  /\bmodelos_ativos\b/i,
];

const FORBIDDEN_ARBITRARY_SCORE = [
  /\bas\s+nota_geral\b/i,
  /\bas\s+quality_score\b/i,
  /\bas\s+score_qualidade\b/i,
];

const SPLIT_FILES = [
  "patch-62-query1-completeness.sql",
  "patch-62-query2-duplications-aliases.sql",
  "patch-62-query3-integrity-invalid-conflicts.sql",
  "patch-62-query4-provenance-panel-ranking.sql",
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
const doc = readFileSync(QUALITY_DOC, "utf8");

console.log("\nPATCH 6.2 — Data Layer quality analytics audit\n");

console.log("Documentation");
assert("DATA_QUALITY_ANALYTICS exists", existsSync(QUALITY_DOC));
assert("Delta vs PATCH 4.5", doc.includes("4.5"));
assert("Delta vs PATCH 6.1", doc.includes("6.1"));
assert("Delta vs PATCH 6.3/6.4", doc.includes("6.3") && doc.includes("6.4"));
assert("Fase 6 absolute+relative rule", doc.includes("registros_total") && doc.includes("pct_registros_afetados"));
assert("No arbitrary single score", /sem score único|nunca média ponderada/i.test(doc));
assert("Read-only scope", /read-only/i.test(doc));
assert("COVERAGE_ANALYTICS still references 6.2 boundary", readFileSync(COVERAGE_DOC, "utf8").includes("6.2"));
assert("DATA_QUALITY_DASHBOARD unchanged (Analytics domain)", readFileSync(DATA_QUALITY_DASHBOARD, "utf8").includes("analytics_events") || readFileSync(DATA_QUALITY_DASHBOARD, "utf8").includes("Analytics"));

console.log("\nSQL structure");
assert("SQL references searchUniversalDataLayer", /searchUniversalDataLayer/i.test(sql));
for (const table of REQUIRED_TABLES) {
  assert(`SQL — ${table}`, sql.includes(table));
}
assert("SQL — Query 1 completeness", /QUERY 1/i.test(sql));
assert("SQL — Query 2 duplications", /QUERY 2/i.test(sql));
assert("SQL — Query 3 integrity", /QUERY 3/i.test(sql));
assert("SQL — Query 4 panel ranking", /QUERY 4/i.test(sql));
assert("SQL — completude_campo", sql.includes("completude_campo"));
assert("SQL — duplicacao", sql.includes("duplicacao"));
assert("SQL — integridade_referencial", sql.includes("integridade_referencial"));
assert("SQL — valor_invalido", sql.includes("valor_invalido"));
assert("SQL — conflito_dados", sql.includes("conflito_dados"));
assert("SQL — painel_dimensional", sql.includes("painel_dimensional"));
assert("SQL — ranking_problema", sql.includes("ranking_problema"));
assert("SQL — nullif division guard", /nullif\s*\(\s*c\.registros_total/i.test(sql) || /registros_total\s*=\s*0\s+then\s+null/i.test(sql));

for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}
for (const rule of FORBIDDEN) {
  assert(`SQL — forbidden ${rule}`, !rule.test(sql));
}
for (const rule of FORBIDDEN_DUPLICATE_45) {
  assert(`SQL — no PATCH 4.5 duplicate ${rule}`, !rule.test(sql));
}
for (const rule of FORBIDDEN_DUPLICATE_61) {
  assert(`SQL — no PATCH 6.1 duplicate ${rule}`, !rule.test(sql));
}
for (const rule of FORBIDDEN_ARBITRARY_SCORE) {
  assert(`SQL — no arbitrary score ${rule}`, !rule.test(sql));
}

console.log("\nSplit SQL files");
const dashboards = readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8");
assert("DASHBOARDS.md lists data layer quality", dashboards.includes("analytics-data-layer-quality"));

for (const file of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", file);
  const content = readFileSync(path, "utf8");
  assert(`${file} — exists`, existsSync(path));
  assert(`${file} — catalog table`, REQUIRED_TABLES.some((t) => content.includes(t)));
  assert(`${file} — no analytics_events`, !/from\s+analytics_events/i.test(content));
  assert(`${file} — no destructive`, !/\b(update|delete|insert)\b/i.test(content));
}

console.log("\nSplit consistency with main SQL");
const norm = (s) => s.replace(/\r\n/g, "\n");
for (const file of SPLIT_FILES) {
  const split = readFileSync(join(ANALYTICS_DIR, "sql", file), "utf8").trim();
  assert(`${file} — contained in main SQL`, norm(sql).includes(norm(split).slice(0, 120)));
}

console.log(`\nResultado: ${passed}/${passed + failed}\n`);
if (failed > 0) process.exit(1);
