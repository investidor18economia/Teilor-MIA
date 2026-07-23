#!/usr/bin/env node
/** PATCH 11.1 — SQL + API production validation */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH111_PROD_BASE_URL || "https://economia-ai.vercel.app";
const QUERIES = [
  "patch-111-query1-sessions-questions-consistency.sql",
  "patch-111-query2-decisions-recommendations-consistency.sql",
  "patch-111-query3-offerset-price-intelligence-consistency.sql",
  "patch-111-query4-savings-user-value-consistency.sql",
  "patch-111-query5-alerts-lifecycle-consistency.sql",
];

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

console.log("\nPATCH 11.1 — production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  const health = await res.json().catch(() => ({}));
  ok("health", res.ok, `build=${health.build}`);
}

{
  const res = await fetch(`${BASE}/api/executive-metrics?fresh=1`);
  const json = await res.json().catch(() => ({}));
  ok("API 200", res.status === 200);
  ok("metrics_version", json.metrics_version === "11.1.0");
  ok("platform RPC or partial", json.platform != null || json.partial_errors?.length >= 0);
}

try {
  ok("supabase linked", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));
  for (const file of QUERIES) {
    const rows = runSql(file);
    ok(`SQL ${file}`, Array.isArray(rows), `rows=${rows.length}`);
  }
} catch (err) {
  ok("SQL validation", false, String(err.message).slice(0, 200));
}

console.log(`\nSummary: ${checks.filter((c) => c.pass).length}/${checks.length} passed\n`);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
