#!/usr/bin/env node
/** PATCH 9.4 — SQL Q1-Q12 production validation */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH94_PROD_BASE_URL || "https://economia-ai.vercel.app";
const QUERIES = [
  "patch-94-query1-runner-up-availability.sql",
  "patch-94-query2-score-gap-competitiveness.sql",
  "patch-94-query3-display-delivery-funnel.sql",
  "patch-94-query4-interactions.sql",
  "patch-94-query5-alternative-requests.sql",
  "patch-94-query6-runner-up-selection.sql",
  "patch-94-query7-non-runner-up-alternatives.sql",
  "patch-94-query8-recovery.sql",
  "patch-94-query9-diversity.sql",
  "patch-94-query10-decision-source.sql",
  "patch-94-query11-runner-up-quality.sql",
  "patch-94-query12-quality-fanout.sql",
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

console.log("\nPATCH 9.4 — SQL validation\n");
{
  const res = await fetch(`${BASE}/api/health`);
  ok("health", res.ok, `status=${res.status}`);
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
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
