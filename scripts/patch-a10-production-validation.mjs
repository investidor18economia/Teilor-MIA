#!/usr/bin/env node
/**
 * PATCH A.10 — Phase A production validation.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A10_PROD_BASE_URL || "https://economia-ai.vercel.app";

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\nPATCH A.10 — Phase A production validation\n");

let health = {};
let gitHead = "";
try {
  gitHead = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim().slice(0, 12);
} catch {
  gitHead = "unknown";
}

{
  const res = await fetch(`${BASE}/api/health`);
  health = await res.json().catch(() => ({}));
  ok("health 200", res.ok, `build=${health.build}`);
}

{
  const res = await fetch(`${BASE}/api/executive-metrics?range=30d&fresh=1`);
  const json = await res.json().catch(() => ({}));
  ok("executive-metrics 200", res.ok);
  ok("executive platform group", Boolean(json.platform));
  ok("executive system group", Boolean(json.system));
}

{
  const res = await fetch(`${BASE}/api/temporal-metrics?range=30d&series=growth,platform_activity,products,categories,conversion&fresh=1`);
  const json = await res.json().catch(() => ({}));
  ok("temporal-metrics 200", res.ok);
  ok("temporal_version A.7.0", json.temporal_version === "A.7.0");
  ok("growth group", Boolean(json.growth));
  ok("conversion group", Boolean(json.conversion));
}

{
  const gateRes = await fetch(`${BASE}/cockpit-fundador`);
  const html = await gateRes.text();
  ok("cockpit gate 200", gateRes.status === 200);
  ok("robots noindex", html.includes("noindex"));
  const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]);
  const chunk = chunks.find((u) => u.includes("cockpit-fundador"));
  if (chunk) {
    const text = await (await fetch(`${BASE}${chunk}`)).text();
    ok("bundle charts layer", text.includes("founder-chart") || text.includes("FounderChart"));
    ok("bundle filters layer", text.includes("founder-cockpit-filters") || text.includes("FounderCockpitFilters"));
    ok("bundle skeleton UI", text.includes("founder-skeleton") || text.includes("FounderSkeleton"));
  } else {
    ok("bundle scan", false, "cockpit chunk missing");
  }
}

const evidence = {
  patch: "A.10",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  production: { base_url: BASE, build: health.build ?? null, git_head_local: gitHead },
  checks: { total: checks.length, passed: checks.filter((c) => c.pass).length, items: checks },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_10_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
console.log(`\nSummary: ${evidence.checks.passed}/${evidence.checks.total} passed\n`);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
