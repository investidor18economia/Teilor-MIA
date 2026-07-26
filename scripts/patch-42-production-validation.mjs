#!/usr/bin/env node
/**
 * PATCH 4.2 — Production validation (growth dashboard SQL).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH42_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERY1 = join(ROOT, "docs/analytics/sql/patch-42-query1-daily-growth.sql");
const QUERY2 = join(ROOT, "docs/analytics/sql/patch-42-query2-period-comparison.sql");
const QUERY3 = join(ROOT, "docs/analytics/sql/patch-42-query3-acquisition.sql");

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function runLinkedSql(filePath) {
  const out = execSync(`npx supabase db query --linked -f "${filePath}" -o json`, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(out).rows || [];
}

console.log("\nPATCH 4.2 — growth dashboard production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  const daily = runLinkedSql(QUERY1);
  ok("SQL Query 1 executed", daily.length >= 1, `days=${daily.length}`);

  let dailyCoherent = true;
  for (const row of daily) {
    const sum = Number(row.new_visitors) + Number(row.returning_visitors);
    if (sum !== Number(row.dau_visitors)) {
      dailyCoherent = false;
      ok(`daily coherence ${row.dia}`, false, `${row.new_visitors}+${row.returning_visitors}!=${row.dau_visitors}`);
    }
    if (Number(row.wau_visitors) < Number(row.dau_visitors)) {
      dailyCoherent = false;
      ok(`wau >= dau on ${row.dia}`, false);
    }
    if (Number(row.mau_visitors) < Number(row.wau_visitors)) {
      dailyCoherent = false;
      ok(`mau >= wau on ${row.dia}`, false);
    }
  }
  if (dailyCoherent) {
    ok("daily growth coherence (all days)", true, `${daily.length} day(s)`);
  }

  if (daily.length > 0) {
    console.log("\nQuery 1 — latest day:");
    console.log(JSON.stringify(daily[0], null, 2));
  }

  const periods = runLinkedSql(QUERY2);
  ok("SQL Query 2 executed", periods.length >= 1, `rows=${periods.length}`);
  ok("Query 2 has atual period", periods.some((r) => r.periodo === "atual"));
  ok(
    "Query 2 has dia_anterior or single-day data",
    periods.some((r) => r.periodo === "dia_anterior") || periods.length === 1
  );

  if (periods.length >= 2) {
    console.log("\nQuery 2 — period comparison:");
    console.log(JSON.stringify(periods, null, 2));
  }

  const acquisition = runLinkedSql(QUERY3);
  ok("SQL Query 3 executed", acquisition.length >= 1, `days=${acquisition.length}`);

  let cumulativeOk = true;
  const sorted = [...acquisition].sort((a, b) => String(a.dia).localeCompare(String(b.dia)));
  for (let i = 1; i < sorted.length; i++) {
    if (Number(sorted[i].new_visitors_acumulado) < Number(sorted[i - 1].new_visitors_acumulado)) {
      cumulativeOk = false;
      ok(`cumulative monotonic ${sorted[i].dia}`, false);
    }
  }
  if (cumulativeOk) {
    ok("acquisition cumulative monotonic", true, `${acquisition.length} cohort day(s)`);
  }

  const totalNew = acquisition.reduce((s, r) => s + Number(r.new_visitors), 0);
  ok("acquisition total new_visitors > 0", totalNew > 0, `total=${totalNew}`);
} catch (err) {
  ok("production SQL execution", false, err.message);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
