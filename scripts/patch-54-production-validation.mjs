#!/usr/bin/env node
/**
 * PATCH 5.4 — Production validation (buying intent strategic SQL).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH54_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERY1 = join(ROOT, "docs/analytics/sql/patch-54-query1-signal-ranking.sql");
const QUERY2 = join(ROOT, "docs/analytics/sql/patch-54-query2-behavioral-antecedents.sql");
const QUERY3 = join(ROOT, "docs/analytics/sql/patch-54-query3-intent-strength.sql");
const QUERY4 = join(ROOT, "docs/analytics/sql/patch-54-query4-intent-trends-cohort.sql");

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

console.log("\nPATCH 5.4 — buying intent strategic production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  const signals = runLinkedSql(QUERY1);
  ok("SQL Query 1 executed", signals.length >= 0, `rows=${signals.length}`);
  ok("Query 1 no total_aparicoes column", !signals.some((r) => "total_aparicoes" in r));
  ok(
    "Query 1 has ranking or empty",
    signals.length === 0 || signals.some((r) => r.tipo_analise === "ranking_sinal")
  );
  if (signals.length > 0) {
    console.log("\nQuery 1 — signals:");
    console.log(JSON.stringify(signals, null, 2));
  }

  const antecedents = runLinkedSql(QUERY2);
  ok("SQL Query 2 executed", antecedents.length >= 1, `rows=${antecedents.length}`);
  ok(
    "Query 2 has antecedentes_gerais or empty intent base",
    antecedents.some((r) => r.tipo_analise === "antecedentes_gerais") || antecedents.length === 0
  );
  console.log("\nQuery 2 — antecedents:");
  console.log(JSON.stringify(antecedents, null, 2));

  const strength = runLinkedSql(QUERY3);
  ok("SQL Query 3 executed", strength.length >= 0, `rows=${strength.length}`);
  ok("Query 3 no taxa_clique_recomendacao", !strength.some((r) => "taxa_clique_recomendacao" in r));
  if (strength.length > 0) {
    console.log("\nQuery 3 — intent strength:");
    console.log(JSON.stringify(strength.slice(0, 5), null, 2));
  }

  const trends = runLinkedSql(QUERY4);
  ok("SQL Query 4 executed", trends.length >= 1, `rows=${trends.length}`);
  ok(
    "Query 4 has cohort or trend rows",
    trends.some((r) => r.tipo_analise === "cohort_intencao")
      || trends.some((r) => r.tipo_analise === "tendencia_janela")
  );
  console.log("\nQuery 4 — trends/cohort:");
  console.log(JSON.stringify(trends, null, 2));
} catch (err) {
  ok("supabase SQL execution", false, err.message?.slice(0, 200));
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
