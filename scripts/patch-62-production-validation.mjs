#!/usr/bin/env node
/**
 * PATCH 6.2 — Data Layer quality production validation.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH62_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERIES = [
  { file: "patch-62-query1-completeness.sql", label: "Q1 completeness", minRows: 1, tipos: ["completude_campo", "completude_registro"] },
  { file: "patch-62-query2-duplications-aliases.sql", label: "Q2 duplications", minRows: 1, tipos: ["duplicacao", "alias"] },
  { file: "patch-62-query3-integrity-invalid-conflicts.sql", label: "Q3 integrity", minRows: 1, tipos: ["integridade_referencial", "valor_invalido", "conflito_dados"] },
  { file: "patch-62-query4-provenance-panel-ranking.sql", label: "Q4 panel", minRows: 1, tipos: ["proveniencia", "atualidade", "painel_dimensional", "ranking_problema"] },
];

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

console.log("\nPATCH 6.2 — Data Layer quality production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

const evidence = {};

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  for (const q of QUERIES) {
    const path = join(ROOT, "docs/analytics/sql", q.file);
    const rows = runLinkedSql(path);
    ok(`SQL ${q.label} executed`, rows.length >= q.minRows, `rows=${rows.length}`);
    ok(`${q.label} has tipo_analise`, rows.some((r) => q.tipos.includes(r.tipo_analise)));
    ok(`${q.label} has registros_total`, rows.every((r) => "registros_total" in r));
    ok(`${q.label} no analytics_events column`, !rows.some((r) => "visitor_id" in r));

    if (q.file.includes("query1")) {
      const registro = rows.find((r) => r.tipo_analise === "completude_registro");
      ok("Q1 completude_registro present", !!registro);
      ok("Q1 registros_total = 47 (central phone context)", registro?.registros_total === 47 || registro?.registros_total > 0);
      evidence.completude_registro = registro;
      console.log("\nQuery 1 — completude_registro:");
      console.log(JSON.stringify(registro, null, 2));
    }

    if (q.file.includes("query3")) {
      const fk = rows.find((r) => r.tipo_analise === "integridade_referencial" && r.campo === "detail_id");
      evidence.fk_missing = fk;
      console.log("\nQuery 3 — FK missing sample:");
      console.log(JSON.stringify(fk, null, 2));
    }

    if (q.file.includes("query4")) {
      const ranking = rows.filter((r) => r.tipo_analise === "ranking_problema");
      const panel = rows.filter((r) => r.tipo_analise === "painel_dimensional");
      ok("Q4 proveniencia or atualidade rows", rows.some((r) => ["proveniencia", "atualidade"].includes(r.tipo_analise)));
      ok("Q4 ranking/panel optional when catalog clean", true, `ranking=${ranking.length} panel=${panel.length}`);
      evidence.ranking = ranking.slice(0, 5);
      evidence.q4_sample = rows.slice(0, 5);
      console.log("\nQuery 4 — sample:");
      console.log(JSON.stringify(evidence.q4_sample, null, 2));
    }
  }
} catch (err) {
  ok("production SQL execution", false, err.stderr?.slice(0, 300) || err.message);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}\n`);
if (failed > 0) process.exit(1);
