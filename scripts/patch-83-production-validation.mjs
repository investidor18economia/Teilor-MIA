#!/usr/bin/env node
/** PATCH 8.3 — SQL Q1-Q7 production validation */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH83_PROD_BASE_URL || "https://economia-ai.vercel.app";
const QUERIES = [
  "patch-83-query1-offer-funnel.sql",
  "patch-83-query2-offer-price-winner.sql",
  "patch-83-query3-offer-diversity.sql",
  "patch-83-query4-offer-quality.sql",
  "patch-83-query5-offer-interactions.sql",
  "patch-83-query6-offer-correlation.sql",
  "patch-83-query7-offer-loss-diagnostic.sql",
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

console.log("\nPATCH 8.3 — SQL validation\n");
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
