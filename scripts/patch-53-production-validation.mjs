#!/usr/bin/env node
/**
 * PATCH 5.3 — Production validation (conversion strategic funnel SQL).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH53_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERY1 = join(ROOT, "docs/analytics/sql/patch-53-query1-dropoff-bottleneck.sql");
const QUERY2 = join(ROOT, "docs/analytics/sql/patch-53-query2-cohort-funnel.sql");
const QUERY3 = join(ROOT, "docs/analytics/sql/patch-53-query3-segment-modifiers.sql");
const QUERY4 = join(ROOT, "docs/analytics/sql/patch-53-query4-funnel-trend-comparison.sql");

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

console.log("\nPATCH 5.3 — conversion strategic funnel production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  const dropoff = runLinkedSql(QUERY1);
  ok("SQL Query 1 executed", dropoff.length >= 1, `transitions=${dropoff.length}`);
  ok(
    "Query 1 has exactly one gargalo",
    dropoff.filter((r) => r.is_gargalo_principal === true).length === 1
  );
  ok("Query 1 no visitantes_sequenciais column", !dropoff.some((r) => "visitantes_sequenciais" in r));
  if (dropoff.length > 0) {
    console.log("\nQuery 1 — drop-off:");
    console.log(JSON.stringify(dropoff, null, 2));
  }

  const cohorts = runLinkedSql(QUERY2);
  ok("SQL Query 2 executed", cohorts.length >= 0, `cohorts=${cohorts.length}`);
  if (cohorts.length > 0) {
    console.log("\nQuery 2 — cohort funnel:");
    console.log(JSON.stringify(cohorts[0], null, 2));
  }

  const segments = runLinkedSql(QUERY3);
  ok("SQL Query 3 executed", segments.length >= 1, `rows=${segments.length}`);
  ok(
    "Query 3 has segmento_autenticacao",
    segments.some((r) => r.tipo_analise === "segmento_autenticacao")
  );
  ok(
    "Query 3 has profundidade or modalidade",
    segments.some((r) => r.tipo_analise === "profundidade_conversa")
      || segments.some((r) => r.tipo_analise === "modalidade_pergunta")
  );
  console.log("\nQuery 3 — segments:");
  console.log(JSON.stringify(segments, null, 2));

  const trends = runLinkedSql(QUERY4);
  ok("SQL Query 4 executed", trends.length >= 0, `windows=${trends.length}`);
  ok(
    "Query 4 janela_recente or empty young base",
    trends.length === 0 || trends.some((r) => r.janela === "janela_recente")
  );
  if (trends.length > 0) {
    console.log("\nQuery 4 — funnel trends:");
    console.log(JSON.stringify(trends, null, 2));
  }
} catch (err) {
  ok("supabase SQL execution", false, err.message?.slice(0, 200));
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
