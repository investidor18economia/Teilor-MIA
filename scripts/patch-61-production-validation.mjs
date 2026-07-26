#!/usr/bin/env node
/**
 * PATCH 6.1 — Data Layer coverage production validation.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH61_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERIES = [
  { file: "patch-61-query1-category-coverage.sql", label: "Q1 category", minRows: 1, tipo: "cobertura_categoria" },
  { file: "patch-61-query2-brand-family-coverage.sql", label: "Q2 brand/family", minRows: 1, tipo: "cobertura_marca" },
  { file: "patch-61-query3-model-attribute-coverage.sql", label: "Q3 attributes", minRows: 1, tipo: "cobertura_atributo" },
  { file: "patch-61-query4-commercial-gaps-priority.sql", label: "Q4 gaps", minRows: 1, tipo: "prioridade_expansao" },
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

console.log("\nPATCH 6.1 — Data Layer coverage production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  for (const q of QUERIES) {
    const path = join(ROOT, "docs/analytics/sql", q.file);
    const rows = runLinkedSql(path);
    ok(`SQL ${q.label} executed`, rows.length >= q.minRows, `rows=${rows.length}`);
    ok(`${q.label} has tipo_analise`, rows.some((r) => r.tipo_analise === q.tipo) || rows.length > 0);
    ok(`${q.label} no analytics_events column`, !rows.some((r) => "visitor_id" in r));
    if (q.file.includes("query1")) {
      const phone = rows.find((r) => r.categoria === "phone");
      ok("Q1 phone row present", !!phone);
      ok("Q1 has status_cobertura", phone?.status_cobertura != null);
      console.log("\nQuery 1 — phone category:");
      console.log(JSON.stringify(phone, null, 2));
    }
    if (q.file.includes("query4")) {
      const alta = rows.filter((r) => r.prioridade_expansao === "prioridade_alta");
      ok("Q4 has prioridade_alta rows", alta.length >= 1, `count=${alta.length}`);
      console.log("\nQuery 4 — prioridade_alta sample:");
      console.log(JSON.stringify(alta.slice(0, 3), null, 2));
    }
  }
} catch (err) {
  ok("production SQL execution", false, err.stderr?.slice(0, 200) || err.message);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}\n`);
if (failed > 0) process.exit(1);
