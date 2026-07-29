#!/usr/bin/env node
/**
 * PATCH A.8 — Production validation for charts bundle.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A8_PROD_BASE_URL || "https://economia-ai.vercel.app";

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\nPATCH A.8 — Charts production validation\n");

let healthJson = {};
{
  const res = await fetch(`${BASE}/api/health`);
  healthJson = await res.json().catch(() => ({}));
  ok("health 200", res.ok, `build=${healthJson.build}`);
}

{
  const res = await fetch(`${BASE}/api/temporal-metrics?range=30d&series=growth,platform_activity,conversion,products,categories&fresh=1`);
  const json = await res.json().catch(() => ({}));
  ok("temporal multi-series 200", res.status === 200);
  ok("growth series present", Array.isArray(json.growth?.series));
  ok("conversion daily present", Array.isArray(json.conversion?.daily));
  ok("categories daily present", Array.isArray(json.categories?.daily));
}

{
  const gateRes = await fetch(`${BASE}/cockpit-fundador`);
  const html = await gateRes.text();
  ok("cockpit gate 200", gateRes.status === 200);
  const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]);
  const cockpitChunk = chunks.find((u) => u.includes("cockpit-fundador"));
  if (cockpitChunk) {
    const chunkRes = await fetch(`${BASE}${cockpitChunk}`);
    const text = await chunkRes.text().catch(() => "");
    ok("bundle includes FounderLineChart", text.includes("founder-chart--line") || text.includes("FounderLineChart"));
    ok("bundle includes chart panel", text.includes("founder-chart-panel") || text.includes("FounderChartPanel"));
    ok("bundle includes charts mapper", text.includes("miaFounderChartsDisplay") || text.includes("A.8.0"));
  } else {
    ok("bundle scan", false, "cockpit chunk not found");
  }
}

const evidence = {
  patch: "A.8",
  title: "Founder Charts — Production Validation",
  status: checks.some((c) => !c.pass) ? "PENDING" : "APPROVED",
  validated_at: new Date().toISOString(),
  production: { base_url: BASE, build: healthJson.build ?? null },
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    items: checks,
  },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_8_CHARTS_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
console.log(`\nSummary: ${evidence.checks.passed}/${evidence.checks.total} passed\n`);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
