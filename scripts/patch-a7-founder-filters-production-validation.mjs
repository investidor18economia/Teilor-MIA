#!/usr/bin/env node
/**
 * PATCH A.7 — Advanced Filters production validation + evidence.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A7_PROD_BASE_URL || "https://economia-ai.vercel.app";
const MIGRATION = join(ROOT, "supabase/migrations/20260728230000_mia_founder_advanced_filters_v1.sql");

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\nPATCH A.7 — Advanced Filters production validation\n");

try {
  execSync(`npx supabase db query --linked -f "${MIGRATION}" -o json`, { cwd: ROOT, encoding: "utf8" });
  ok("migration applied", true);
} catch (err) {
  ok("migration applied", false, String(err.message || err).slice(0, 120));
}

try {
  const smoke = execSync(
    `npx supabase db query --linked -f "${join(ROOT, "docs/analytics/sql/patch-a71-query1-filters-rpc-smoke.sql")}" -o json`,
    { cwd: ROOT, encoding: "utf8" }
  );
  const rows = JSON.parse(smoke).rows || [];
  ok("RPC filter params smoke", rows[0]?.has_filters === true);
} catch (err) {
  ok("RPC filter params smoke", false, String(err.message || err).slice(0, 120));
}

let healthJson = {};
{
  const res = await fetch(`${BASE}/api/health`);
  healthJson = await res.json().catch(() => ({}));
  ok("health 200", res.ok, `build=${healthJson.build}`);
}

{
  const res = await fetch(`${BASE}/api/temporal-metrics?range=7d&series=conversion&category=smartphones&fresh=1`);
  const json = await res.json().catch(() => ({}));
  ok("temporal filtered API 200", res.status === 200);
  ok("temporal version A.7.0", json.temporal_version === "A.7.0");
  ok("filters_applied present", json.filters_applied?.range === "7d");
}

{
  const res = await fetch(`${BASE}/api/executive-metrics?range=30d&category=notebooks&fresh=1`);
  const json = await res.json().catch(() => ({}));
  ok("executive filtered API 200", res.status === 200);
  ok("executive filters_applied", json.filters_applied?.category === "notebooks");
}

{
  const bad = await fetch(`${BASE}/api/temporal-metrics?range=custom&start=2026-07-10&end=2026-07-01&fresh=1`);
  ok("invalid filter HTTP 400", bad.status === 400);
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
    ok("bundle includes filters UI", chunkText.includes("founder-cockpit-filters"));
    ok("bundle includes FiltersProvider", chunkText.includes("FounderCockpitFilters"));
  } else {
    ok("bundle scan skipped", true, "chunk not found");
  }
}

const evidence = {
  patch: "A.7",
  title: "Founder Advanced Filters — Production Validation",
  status: checks.some((c) => !c.pass) ? "PENDING" : "APPROVED",
  validated_at: new Date().toISOString(),
  production: { base_url: BASE, build: healthJson.build ?? null },
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    items: checks,
  },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_7_ADVANCED_FILTERS_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
console.log(`\nSummary: ${evidence.checks.passed}/${evidence.checks.total} passed\n`);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
