#!/usr/bin/env node
/**
 * PATCH B.9 — Phase B production validation.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_B9_PROD_BASE_URL || "https://economia-ai.vercel.app";

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchExecutiveMetricsFresh() {
  const res = await fetch(`${BASE}/api/executive-metrics?range=30d&fresh=1`);
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

console.log("\nPATCH B.9 — Phase B production validation\n");

let health = {};
let gitHead = "";
try {
  gitHead = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  gitHead = "unknown";
}

{
  const res = await fetch(`${BASE}/api/health`);
  health = await res.json().catch(() => ({}));
  ok("health 200", res.ok, `build=${health.build}`);
}

{
  let platformOk = false;
  let lastJson = {};
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { res, json } = await fetchExecutiveMetricsFresh();
    lastJson = json;
    lastStatus = res.status;
    platformOk =
      res.ok &&
      json.platform != null &&
      typeof json.platform === "object" &&
      Object.keys(json.platform).length > 0;
    if (platformOk) break;
    if (attempt < 3) await sleep(2500);
  }
  ok("executive-metrics 200", lastStatus === 200, `status=${lastStatus}`);
  ok("executive platform group", platformOk);
  ok("executive system group", Boolean(lastJson.system));
  ok("executive conversation group", Boolean(lastJson.conversation));
  ok("executive commerce group", Boolean(lastJson.commerce));
}

{
  const res = await fetch(
    `${BASE}/api/temporal-metrics?range=30d&series=growth,platform_activity,products,categories,conversion&fresh=1`
  );
  const json = await res.json().catch(() => ({}));
  ok("temporal-metrics 200", res.ok);
  ok("temporal_version A.7.0", json.temporal_version === "A.7.0");
  ok("growth group", Boolean(json.growth));
  ok("platform_activity group", Boolean(json.platform_activity));
  ok("conversion group", Boolean(json.conversion));
}

{
  const gateRes = await fetch(`${BASE}/cockpit-fundador`);
  const html = await gateRes.text();
  ok("cockpit SSR 200", gateRes.status === 200);
  ok("robots noindex", html.includes("noindex"));
  ok("login gate or cockpit shell", html.includes("Cockpit") || html.includes("founder"));
  const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]);
  const chunk = chunks.find((u) => u.includes("cockpit-fundador"));
  if (chunk) {
    const text = await (await fetch(`${BASE}${chunk}`)).text();
    ok("bundle executive KPIs", text.includes("founder-executive-kpis") || text.includes("FounderExecutiveKpis"));
    ok("bundle executive summary", text.includes("founder-executive-summary") || text.includes("FounderExecutiveSummary"));
    ok("bundle polish module class", text.includes("founder-executive-module"));
    ok("bundle filters layer", text.includes("founder-cockpit-filters") || text.includes("FounderCockpitFilters"));
  } else {
    ok("bundle scan", false, "cockpit chunk missing");
  }
}

const evidence = {
  patch: "B.9",
  title: "PATCH B.9 — Phase B Production Final Evidence",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  production: { base_url: BASE, build: health.build ?? null, git_head_local: gitHead.slice(0, 12) },
  checks: { total: checks.length, passed: checks.filter((c) => c.pass).length, items: checks },
};

writeFileSync(join(ROOT, "docs/analytics/PHASE_B_PRODUCTION_FINAL_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
console.log(`\nSummary: ${evidence.checks.passed}/${evidence.checks.total} passed\n`);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
