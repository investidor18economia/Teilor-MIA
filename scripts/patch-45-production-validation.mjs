#!/usr/bin/env node
/**
 * PATCH 4.5 — Production validation (data quality dashboard SQL).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH45_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERY1 = join(ROOT, "docs/analytics/sql/patch-45-query1-volume-snapshot.sql");
const QUERY2 = join(ROOT, "docs/analytics/sql/patch-45-query2-field-coverage.sql");
const QUERY3 = join(ROOT, "docs/analytics/sql/patch-45-query3-daily-evolution.sql");
const QUERY4 = join(ROOT, "docs/analytics/sql/patch-45-query4-integrity-anomalies.sql");

const MIA_EVENTS = new Set([
  "session_started",
  "user_authenticated",
  "mia_question_sent",
  "mia_recommendation_shown",
  "offer_click",
  "favorite_created",
  "price_alert_created",
]);

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

console.log("\nPATCH 4.5 — data quality dashboard production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  const volume = runLinkedSql(QUERY1);
  ok("SQL Query 1 executed", volume.length >= 1, `events=${volume.length}`);

  const sumTotal = volume.reduce((s, r) => s + Number(r.total_eventos || 0), 0);
  const headerTotal = volume.length > 0 ? Number(volume[0].total_geral) : 0;
  ok(
    "Query 1 — volume sums match total_geral",
    sumTotal === headerTotal,
    `sum=${sumTotal} total_geral=${headerTotal}`
  );

  const foraCatalogo = volume.length > 0 ? Number(volume[0].eventos_fora_catalogo_total) : 0;
  ok("Query 1 — eventos_fora_catalogo_total reported", foraCatalogo >= 0, `fora=${foraCatalogo}`);

  console.log("\nQuery 1 — volume snapshot (top 5):");
  console.log(JSON.stringify(volume.slice(0, 5), null, 2));

  const coverage = runLinkedSql(QUERY2);
  ok("SQL Query 2 executed", coverage.length >= 1, `rows=${coverage.length}`);
  ok(
    "Query 2 — MIA events present",
    coverage.some((r) => MIA_EVENTS.has(r.event_name)),
    `rows=${coverage.length}`
  );

  const tsOk = coverage.every((r) => Number(r.cobertura_timestamp_valido) === 1);
  ok("Query 2 — cobertura_timestamp_valido = 1 for all events", tsOk, `${coverage.length} event type(s)`);

  if (coverage.length > 0) {
    console.log("\nQuery 2 — field coverage:");
    console.log(JSON.stringify(coverage, null, 2));
  }

  const daily = runLinkedSql(QUERY3);
  ok("SQL Query 3 executed", daily.length >= 1, `rows=${daily.length}`);

  const anomalies = runLinkedSql(QUERY4);
  ok("SQL Query 4 executed", anomalies.length === 5, `checks=${anomalies.length}`);

  const foraCheck = anomalies.find((r) => r.verificacao === "eventos_fora_catalogo");
  ok(
    "Query 4 — fora catalogo aligned with Query 1",
    Number(foraCheck?.ocorrencias || 0) === foraCatalogo,
    `q4=${foraCheck?.ocorrencias} q1=${foraCatalogo}`
  );

  console.log("\nQuery 4 — integrity anomalies:");
  console.log(JSON.stringify(anomalies, null, 2));
} catch (err) {
  ok("production SQL execution", false, err.message);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
