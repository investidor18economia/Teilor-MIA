#!/usr/bin/env node
/**
 * PATCH 4.4 — Products & categories dashboard SQL audit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-products-categories-dashboard.sql");
const DOC_FILE = join(ANALYTICS_DIR, "PRODUCTS_CATEGORIES_DASHBOARD.md");

const REQUIRED_ALIASES = [
  "product_name",
  "product_id",
  "product_brand",
  "total_aparicoes",
  "total_recomendacoes",
  "total_cliques",
  "total_favoritos",
  "total_alertas",
  "sinais_intencao_compra",
  "visitantes_distintos",
  "taxa_clique_recomendacao",
  "category",
  "total_perguntas",
  "total_eventos_categoria",
  "taxa_conversao_pergunta_recomendacao",
  "taxa_conversao_recomendacao_clique",
  "taxa_intencao_pos_recomendacao",
  "dia",
  "eventos_perguntas",
  "eventos_recomendacoes",
  "eventos_cliques",
  "eventos_favoritos",
  "eventos_alertas",
  "total_eventos",
];

const PRODUCT_EVENTS = [
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

console.log("\nPATCH 4.4 — Products & categories dashboard audit\n");

const sql = readFileSync(SQL_FILE, "utf8");
const doc = readFileSync(DOC_FILE, "utf8");

console.log("Documentation");
assert("PRODUCTS_CATEGORIES_DASHBOARD.md references EXECUTIVE_METRICS", doc.includes("EXECUTIVE_METRICS.md"));
assert("PRODUCTS_CATEGORIES_DASHBOARD.md — product_name dimension", /product_name/i.test(doc));
assert("PRODUCTS_CATEGORIES_DASHBOARD.md — category dimension", /category/i.test(doc));
assert("PRODUCTS_CATEGORIES_DASHBOARD.md — limitations documented", /Limitações/i.test(doc));

console.log("\nSQL structure");
assert("SQL references EXECUTIVE_METRICS", sql.includes("EXECUTIVE_METRICS.md"));
assert("SQL — from analytics_events", /from\s+analytics_events/i.test(sql));
assert("SQL — UTC timezone", /at time zone 'UTC'/i.test(sql));
assert("SQL — Query 1 product ranking", /QUERY 1/i.test(sql));
assert("SQL — Query 2 category intelligence", /QUERY 2/i.test(sql));
assert("SQL — Query 3 daily category", /QUERY 3/i.test(sql));
assert("SQL — Query 4 daily product", /QUERY 4/i.test(sql));

for (const alias of REQUIRED_ALIASES) {
  assert(`SQL — alias ${alias}`, new RegExp(`\\bas\\s+${alias}\\b`, "i").test(sql));
}

for (const event of PRODUCT_EVENTS) {
  assert(`SQL — product event ${event}`, sql.includes(event));
}

assert("SQL — excludes server-side category price_alert_email", sql.includes("'price_alert_email'"));

for (const pattern of FORBIDDEN) {
  assert(`SQL — forbidden ${pattern}`, !pattern.test(sql));
}

for (const marker of PRODUCTION_MARKERS) {
  assert(`SQL — production filter ${marker}`, sql.includes(marker));
}

{
  const dashboards = readFileSync(join(ANALYTICS_DIR, "DASHBOARDS.md"), "utf8");
  assert("DASHBOARDS.md lists products-categories dashboard", dashboards.includes("analytics-products-categories-dashboard.sql"));
}

for (const split of [
  "patch-44-query1-product-ranking.sql",
  "patch-44-query2-category-intelligence.sql",
  "patch-44-query3-daily-category.sql",
  "patch-44-query4-daily-product.sql",
]) {
  const splitSql = readFileSync(join(ANALYTICS_DIR, "sql", split), "utf8");
  assert(`Split ${split} — from analytics_events`, /from\s+analytics_events/i.test(splitSql));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
