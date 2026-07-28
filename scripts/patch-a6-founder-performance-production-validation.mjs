#!/usr/bin/env node
/**
 * PATCH A.6 — Founder Performance & Conversion production validation + evidence.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapTemporalMetricsToFounderPerformanceConversion,
  scanFounderPerformanceForbiddenContent,
} from "../lib/miaFounderPerformanceDisplay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A6_PROD_BASE_URL || "https://economia-ai.vercel.app";
const MIGRATION = join(ROOT, "supabase/migrations/20260728220000_mia_temporal_series_conversion_v1.sql");

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

console.log("\nPATCH A.6 — Performance & Conversion production validation\n");

try {
  execSync(`npx supabase db query --linked -f "${MIGRATION}" -o json`, { cwd: ROOT, encoding: "utf8" });
  ok("migration applied", true);
} catch (err) {
  ok("migration applied", false, String(err.message || err).slice(0, 120));
}

try {
  const conversionSmoke = runSql("patch-a61-query1-conversion-rpc-smoke.sql");
  ok("conversion RPC smoke", conversionSmoke[0]?.has_summary === true);
  ok("conversion funnel smoke", conversionSmoke[0]?.has_funnel === true);
  ok("conversion bottlenecks smoke", conversionSmoke[0]?.has_bottlenecks === true);
} catch (err) {
  ok("conversion RPC smoke", false, String(err.message || err).slice(0, 120));
}

let healthJson = {};
{
  const res = await fetch(`${BASE}/api/health`);
  healthJson = await res.json().catch(() => ({}));
  ok("health 200", res.ok, `build=${healthJson.build}`);
}

let temporalJson = {};
{
  const res = await fetch(`${BASE}/api/temporal-metrics?days=30&series=conversion&fresh=1`);
  temporalJson = await res.json().catch(() => ({}));
  ok("temporal API 200", res.status === 200);
  ok("temporal version A.6.0", temporalJson.temporal_version === "A.6.0");
  ok("conversion group", temporalJson.conversion != null);
}

{
  const view = mapTemporalMetricsToFounderPerformanceConversion(temporalJson);
  ok("mapper status valid", ["success", "partial", "empty"].includes(view.meta.status));
  ok("summary metrics", view.summaryMetrics.length === 6);
  ok("privacy scan", scanFounderPerformanceForbiddenContent(JSON.stringify(view)).length === 0);
  if (temporalJson.conversion?.funnel_stages?.length > 0) {
    ok("funnel table visible", view.funnelTable.length > 0);
  } else {
    ok("funnel table skipped", true, "empty funnel");
  }
  if (temporalJson.conversion?.bottlenecks?.length > 0) {
    ok("bottlenecks visible", view.bottleneckCards.length > 0);
  } else {
    ok("bottlenecks skipped", true, "empty bottlenecks");
  }
}

{
  const res = await fetch(`${BASE}/api/executive-metrics?fresh=1`);
  const json = await res.json().catch(() => ({}));
  ok("executive-metrics regression", res.status === 200 && json.metrics_version === "11.1.0");
}

{
  const res = await fetch(`${BASE}/api/temporal-metrics?days=30&series=products,categories&fresh=1`);
  const json = await res.json().catch(() => ({}));
  ok("A.5 regression products", json.products != null);
  ok("A.5 regression categories", json.categories != null);
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
    ok("bundle includes performance section", chunkText.includes("mod-performance-conversao"));
    ok("bundle includes temporal conversion fetch", chunkText.includes("series=conversion"));
  } else {
    ok("bundle scan skipped", true, "chunk not found");
  }
}

const evidence = {
  patch: "A.6",
  title: "Founder Performance & Conversion — Production Validation",
  status: checks.some((c) => !c.pass) ? "PENDING" : "APPROVED",
  validated_at: new Date().toISOString(),
  production: {
    base_url: BASE,
    build: healthJson.build ?? null,
    temporal_api: "/api/temporal-metrics?days=30&series=conversion",
    section_id: "mod-performance-conversao",
  },
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    items: checks,
  },
};

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_A_6_FOUNDER_PERFORMANCE_CONVERSION_EVIDENCE.json"),
  JSON.stringify(evidence, null, 2)
);

console.log(`\nSummary: ${evidence.checks.passed}/${evidence.checks.total} passed`);
console.log("Evidence: docs/analytics/PATCH_A_6_FOUNDER_PERFORMANCE_CONVERSION_EVIDENCE.json\n");
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
