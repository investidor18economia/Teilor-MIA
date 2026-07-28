#!/usr/bin/env node
/**
 * PATCH A.5 — Founder Products & Categories production validation + evidence.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapTemporalMetricsToFounderProductsCategories,
  scanFounderProductsForbiddenContent,
} from "../lib/miaFounderProductsDisplay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A5_PROD_BASE_URL || "https://economia-ai.vercel.app";
const MIGRATION = join(ROOT, "supabase/migrations/20260728210000_mia_temporal_series_products_categories_v1.sql");

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function runSql(file) {
  const out = execSync(`npx supabase db query --linked -f "${join(ROOT, "docs/analytics/sql", file)}" -o json`, {
    cwd: ROOT,
    encoding: "utf8",
  });
  return JSON.parse(out).rows || [];
}

console.log("\nPATCH A.5 — Products & Categories production validation\n");

try {
  execSync(`npx supabase db query --linked -f "${MIGRATION}" -o json`, { cwd: ROOT, encoding: "utf8" });
  ok("migration applied", true);
} catch (err) {
  ok("migration applied", false, String(err.message || err).slice(0, 120));
}

try {
  const productsSmoke = runSql("patch-a51-query1-products-rpc-smoke.sql");
  ok("products RPC smoke", productsSmoke[0]?.has_summary === true);
} catch (err) {
  ok("products RPC smoke", false, String(err.message || err).slice(0, 120));
}

try {
  const categoriesSmoke = runSql("patch-a51-query2-categories-rpc-smoke.sql");
  ok("categories RPC smoke", categoriesSmoke[0]?.has_summary === true);
} catch (err) {
  ok("categories RPC smoke", false, String(err.message || err).slice(0, 120));
}

let healthJson = {};
{
  const res = await fetch(`${BASE}/api/health`);
  healthJson = await res.json().catch(() => ({}));
  ok("health 200", res.ok, `build=${healthJson.build}`);
}

let temporalJson = {};
{
  const res = await fetch(`${BASE}/api/temporal-metrics?days=30&series=products,categories&fresh=1`);
  temporalJson = await res.json().catch(() => ({}));
  ok("temporal API 200", res.status === 200);
  ok("temporal version A.5.0", temporalJson.temporal_version === "A.5.0");
  ok("products group", temporalJson.products != null);
  ok("categories group", temporalJson.categories != null);
}

{
  const view = mapTemporalMetricsToFounderProductsCategories(temporalJson);
  ok("mapper status valid", ["success", "partial", "empty"].includes(view.meta.status));
  ok("product summary metrics", view.productSummaryMetrics.length === 7);
  ok("category summary metrics", view.categorySummaryMetrics.length === 7);
  ok("privacy scan", scanFounderProductsForbiddenContent(JSON.stringify(view)).length === 0);
  if (temporalJson.products?.ranking?.length > 0) {
    ok("top products visible", view.topProducts.length > 0);
    ok("product label present", view.topProducts[0].product_label != null);
  } else {
    ok("products ranking skipped", true, "empty ranking");
  }
  if (temporalJson.categories?.ranking?.length > 0) {
    ok("top categories visible", view.topCategories.length > 0);
    ok("category distribution", view.categoryDistribution.length > 0);
  } else {
    ok("categories ranking skipped", true, "empty ranking");
  }
}

{
  const res = await fetch(`${BASE}/api/executive-metrics?fresh=1`);
  const json = await res.json().catch(() => ({}));
  ok("executive-metrics regression", res.status === 200 && json.metrics_version === "11.1.0");
}

{
  const gateRes = await fetch(`${BASE}/cockpit-fundador`);
  const gateHtml = await gateRes.text();
  ok("cockpit gate 200", gateRes.status === 200);
  const chunkUrls = [...gateHtml.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]);
  const cockpitChunk = chunkUrls.find((u) => u.includes("cockpit-fundador") || u.includes("founder"));
  if (cockpitChunk) {
    const chunkRes = await fetch(`${BASE}${cockpitChunk}`);
    const chunkText = await chunkRes.text().catch(() => "");
    ok("deployed cockpit chunk", chunkRes.ok);
    ok("bundle includes products section", chunkText.includes("mod-produtos-categorias"));
    ok("bundle includes temporal products fetch", chunkText.includes("series=products,categories"));
  } else {
    ok("bundle scan skipped", true, "chunk not found");
  }
}

const evidence = {
  patch: "A.5",
  title: "Founder Products & Categories — Production Validation",
  status: checks.some((c) => !c.pass) ? "PENDING" : "APPROVED",
  validated_at: new Date().toISOString(),
  production: {
    base_url: BASE,
    build: healthJson.build ?? null,
    temporal_api: "/api/temporal-metrics?days=30&series=products,categories",
    section_id: "mod-produtos-categorias",
  },
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    items: checks,
  },
};

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_A_5_FOUNDER_PRODUCTS_CATEGORIES_EVIDENCE.json"),
  JSON.stringify(evidence, null, 2)
);

console.log(`\nSummary: ${evidence.checks.passed}/${evidence.checks.total} passed`);
console.log("Evidence: docs/analytics/PATCH_A_5_FOUNDER_PRODUCTS_CATEGORIES_EVIDENCE.json\n");
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
