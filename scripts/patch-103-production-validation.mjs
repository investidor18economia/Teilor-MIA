#!/usr/bin/env node
/** PATCH 10.3 — SQL Q1-Q30 production validation */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH103_PROD_BASE_URL || "https://economia-ai.vercel.app";
const QUERIES = Array.from({ length: 30 }, (_, i) => {
  const names = [
    "requested-daily",
    "created-success",
    "creation-rate",
    "creation-failures-by-reason",
    "alert-status-distribution",
    "lifecycle-stage-distribution",
    "target-vs-current-distribution",
    "target-realism-distribution",
    "target-distance-avg-median",
    "alerts-checked-once",
    "check-frequency-volume",
    "check-failures-by-reason",
    "target-reached-alerts",
    "target-reached-rate",
    "time-to-target-avg-median",
    "checks-until-target-avg",
    "notifications-prepared",
    "notifications-sent",
    "notifications-delivered-reserved",
    "notification-failures",
    "user-return-reserved",
    "offer-opened-reserved",
    "potential-savings-avg",
    "potential-savings-total",
    "lifecycle-by-source",
    "lifecycle-by-provider",
    "lifecycle-funnel",
    "time-between-stages",
    "dedup-by-stage",
    "orphan-invalid-transitions",
  ];
  return `patch-103-query${i + 1}-${names[i]}.sql`;
});

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

console.log("\nPATCH 10.3 — SQL validation\n");
{
  const res = await fetch(`${BASE}/api/health`);
  const healthJson = await res.json().catch(() => ({}));
  ok("health", res.ok, `build=${healthJson.build}`);
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
