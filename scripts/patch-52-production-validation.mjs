#!/usr/bin/env node
/**
 * PATCH 5.2 — Production validation (conversation strategic analytics SQL).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH52_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERY1 = join(ROOT, "docs/analytics/sql/patch-52-query1-depth-snapshot.sql");
const QUERY2 = join(ROOT, "docs/analytics/sql/patch-52-query2-depth-distribution.sql");
const QUERY3 = join(ROOT, "docs/analytics/sql/patch-52-query3-recurrence-segments.sql");
const QUERY4 = join(ROOT, "docs/analytics/sql/patch-52-query4-daily-engagement-trends.sql");

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

console.log("\nPATCH 5.2 — conversation strategic analytics production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  const depth = runLinkedSql(QUERY1);
  ok("SQL Query 1 executed", depth.length === 1, `rows=${depth.length}`);

  if (depth.length === 1) {
    const d = depth[0];
    ok("Query 1 has amostra_conversas", d.amostra_conversas != null);
    ok("Query 1 no conversas_unicas column", d.conversas_unicas === undefined);
    if (Number(d.amostra_conversas) > 0) {
      const pct =
        Number(d.pct_conversas_profundas || 0) +
        (1 - Number(d.pct_conversas_profundas || 0));
      ok("pct_conversas_profundas in [0,1]", Number(d.pct_conversas_profundas) >= 0 && Number(d.pct_conversas_profundas) <= 1);
    }
    console.log("\nQuery 1 — depth snapshot:");
    console.log(JSON.stringify(d, null, 2));
  }

  const distribution = runLinkedSql(QUERY2);
  ok("SQL Query 2 executed", distribution.length >= 0, `buckets=${distribution.length}`);
  if (distribution.length > 0) {
    const sumPct = distribution.reduce((s, r) => s + Number(r.pct_conversas_na_faixa || 0), 0);
    ok("distribution pct sums ~1", Math.abs(sumPct - 1) < 0.0002, `sum=${sumPct}`);
    console.log("\nQuery 2 — depth distribution:");
    console.log(JSON.stringify(distribution, null, 2));
  }

  const recurrence = runLinkedSql(QUERY3);
  ok("SQL Query 3 executed", recurrence.length >= 1, `rows=${recurrence.length}`);
  ok(
    "Query 3 has recorrencia_visitante",
    recurrence.some((r) => r.tipo_analise === "recorrencia_visitante")
  );
  ok(
    "Query 3 has segment rows or empty user recurrence",
    recurrence.some((r) => r.tipo_analise === "segmento_conversa") || recurrence.length >= 2
  );
  console.log("\nQuery 3 — recurrence & segments:");
  console.log(JSON.stringify(recurrence, null, 2));

  const trends = runLinkedSql(QUERY4);
  ok("SQL Query 4 executed", trends.length >= 0, `days=${trends.length}`);
  ok("Query 4 no raw perguntas volume column", !trends.some((r) => "perguntas_recebidas" in r));
  if (trends.length > 0) {
    console.log("\nQuery 4 — daily trends:");
    console.log(JSON.stringify(trends[0], null, 2));
  }
} catch (err) {
  ok("supabase SQL execution", false, err.message?.slice(0, 200));
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
