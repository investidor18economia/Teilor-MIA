#!/usr/bin/env node
/**
 * PATCH 5.1 — Production validation (growth strategic analytics SQL).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH51_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERY1 = join(ROOT, "docs/analytics/sql/patch-51-query1-visitor-cohort-retention.sql");
const QUERY2 = join(ROOT, "docs/analytics/sql/patch-51-query2-user-cohort-retention.sql");
const QUERY3 = join(ROOT, "docs/analytics/sql/patch-51-query3-strategic-health-snapshot.sql");
const QUERY4 = join(ROOT, "docs/analytics/sql/patch-51-query4-retention-trends-comparison.sql");

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

console.log("\nPATCH 5.1 — growth strategic analytics production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  const cohorts = runLinkedSql(QUERY1);
  ok("SQL Query 1 executed", cohorts.length >= 0, `cohorts=${cohorts.length}`);

  for (const row of cohorts) {
    if (row.retention_d1_pct != null) {
      const pct = Number(row.retention_d1_pct);
      if (pct < 0 || pct > 1) {
        ok(`retention_d1_pct in [0,1] cohort ${row.cohort_day}`, false, String(pct));
      }
    }
    if (row.retention_d7_pct != null && row.retained_d7 != null) {
      const expected = Number(row.cohort_size) > 0
        ? Math.round((Number(row.retained_d7) / Number(row.cohort_size)) * 10000) / 10000
        : null;
      if (expected != null && Number(row.retention_d7_pct) !== expected) {
        ok(`retention_d7 coherence ${row.cohort_day}`, false);
      }
    }
  }
  if (cohorts.length > 0) {
    ok("Query 1 cohort retention coherence", true, `${cohorts.length} cohort(s)`);
    console.log("\nQuery 1 — latest cohort:");
    console.log(JSON.stringify(cohorts[0], null, 2));
  }

  const userCohorts = runLinkedSql(QUERY2);
  ok("SQL Query 2 executed", userCohorts.length >= 0, `user_cohorts=${userCohorts.length}`);

  const health = runLinkedSql(QUERY3);
  ok("SQL Query 3 executed", health.length === 1, `rows=${health.length}`);

  if (health.length === 1) {
    const h = health[0];
    const mix =
      Number(h.participacao_novos_visitantes || 0) + Number(h.participacao_recorrentes || 0);
    if (Number(h.dau_visitors) > 0 && Math.abs(mix - 1) > 0.0001) {
      ok("participacao mix sums to 1", false, `mix=${mix}`);
    } else if (Number(h.dau_visitors) > 0) {
      ok("participacao mix sums to 1", true);
    }
    if (h.stickiness_dau_mau_visitors != null) {
      const stick = Number(h.stickiness_dau_mau_visitors);
      ok("stickiness_dau_mau in [0,1]", stick >= 0 && stick <= 1, String(stick));
    }
    ok(
      "sinal_tendencia_crescimento valid",
      h.sinal_tendencia_crescimento == null ||
        ["acelerando", "desacelerando", "estavel"].includes(h.sinal_tendencia_crescimento)
    );
    console.log("\nQuery 3 — strategic health:");
    console.log(JSON.stringify(h, null, 2));
  }

  const trends = runLinkedSql(QUERY4);
  ok("SQL Query 4 executed", trends.length >= 0, `windows=${trends.length}`);
  ok(
    "Query 4 has janela_recente or empty (young base)",
    trends.length === 0 || trends.some((r) => r.janela === "janela_recente")
  );

  if (trends.length > 0) {
    console.log("\nQuery 4 — retention trends:");
    console.log(JSON.stringify(trends, null, 2));
  }
} catch (err) {
  ok("supabase SQL execution", false, err.message?.slice(0, 200));
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
