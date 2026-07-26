#!/usr/bin/env node
/**
 * PATCH 4.3 — Production validation (conversion dashboard SQL).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH43_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERY1 = join(ROOT, "docs/analytics/sql/patch-43-query1-funnel-snapshot.sql");
const QUERY2 = join(ROOT, "docs/analytics/sql/patch-43-query2-daily-funnel.sql");
const QUERY3 = join(ROOT, "docs/analytics/sql/patch-43-query3-segment-comparison.sql");
const EXEC_Q2 = join(ROOT, "docs/analytics/sql/patch-41-query2-daily.sql");

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

console.log("\nPATCH 4.3 — conversion dashboard production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  const funnel = runLinkedSql(QUERY1);
  ok("SQL Query 1 executed", funnel.length === 6, `steps=${funnel.length}`);

  const ordered = [...funnel].sort((a, b) => Number(a.ordem) - Number(b.ordem));
  ok("Query 1 — all funnel etapas present", ordered.every((r) => r.etapa && r.event_name));

  let reachCoherent = true;
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    if (Number(prev.visitantes) > 0 && Number(curr.visitantes) > Number(prev.visitantes)) {
      reachCoherent = false;
      ok(`reach funnel visitantes step ${curr.ordem}`, false, `${curr.visitantes} > ${prev.visitantes}`);
    }
  }
  if (reachCoherent) {
    ok("reach funnel coherence (when prior step > 0)", true);
  }

  const step1Seq = Number(ordered[0]?.visitantes_sequenciais || 0);
  if (step1Seq > 0) {
    let seqCoherent = true;
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const curr = ordered[i];
      if (Number(curr.visitantes_sequenciais) > Number(prev.visitantes_sequenciais)) {
        seqCoherent = false;
        ok(`sequential funnel step ${curr.ordem}`, false);
      }
    }
    if (seqCoherent) {
      ok("sequential funnel monotonic", true);
    }
  } else {
    ok(
      "sequential funnel skipped (no session_started on ref day)",
      true,
      "documented limitation — see CONVERSION_DASHBOARD.md §7"
    );
  }

  console.log("\nQuery 1 — funnel snapshot:");
  console.log(JSON.stringify(ordered, null, 2));

  const daily = runLinkedSql(QUERY2);
  ok("SQL Query 2 executed", daily.length >= 1, `days=${daily.length}`);

  if (daily.length > 0) {
    const latest = daily[0];
    ok(
      "daily visitantes_pergunta <= visitantes_recomendacao or zero reco",
      Number(latest.visitantes_recomendacao) <= Number(latest.visitantes_pergunta)
        || Number(latest.visitantes_recomendacao) === 0,
      `pergunta=${latest.visitantes_pergunta} reco=${latest.visitantes_recomendacao}`
    );
    console.log("\nQuery 2 — latest day:");
    console.log(JSON.stringify(latest, null, 2));
  }

  const segments = runLinkedSql(QUERY3);
  ok("SQL Query 3 executed", segments.length === 2, `rows=${segments.length}`);
  ok("Query 3 has visitante segment", segments.some((r) => r.segmento === "visitante"));
  ok("Query 3 has usuario_autenticado segment", segments.some((r) => r.segmento === "usuario_autenticado"));

  console.log("\nQuery 3 — segment comparison:");
  console.log(JSON.stringify(segments, null, 2));

  const execDaily = runLinkedSql(EXEC_Q2);
  if (execDaily.length >= 1 && daily.length >= 1) {
    const exec = execDaily[0];
    const conv = daily[0];
    ok(
      "cross-check visitantes_pergunta <= dau_visitors (PATCH 4.1)",
      Number(conv.visitantes_pergunta) <= Number(exec.dau_visitors),
      `pergunta=${conv.visitantes_pergunta} dau=${exec.dau_visitors}`
    );
  }
} catch (err) {
  ok("production SQL execution", false, err.message);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
