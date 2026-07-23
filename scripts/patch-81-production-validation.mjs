#!/usr/bin/env node
/**
 * PATCH 8.1 — Commercial Search production SQL validation.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH81_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERIES = [
  { file: "patch-81-query1-search-volume.sql", label: "Q1 volume", minRows: 1 },
  { file: "patch-81-query2-query-extraction.sql", label: "Q2 extraction", minRows: 1 },
  { file: "patch-81-query3-search-paths.sql", label: "Q3 paths", minRows: 1 },
  { file: "patch-81-query4-search-results.sql", label: "Q4 results", minRows: 1 },
  { file: "patch-81-query5-correlation-diagnostic.sql", label: "Q5 correlation", minRows: 1 },
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

console.log("\nPATCH 8.1 — Commercial Search production validation\n");

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
    ok(`${q.label} has tipo_analise`, rows.every((r) => "tipo_analise" in r));
    ok(`${q.label} has registros_total`, rows.every((r) => "registros_total" in r));
    ok(`${q.label} has valor_absoluto`, rows.every((r) => "valor_absoluto" in r));
    ok(`${q.label} has referencia_denominador`, rows.every((r) => "referencia_denominador" in r));
    if (q.file.includes("query1")) {
      console.log("\nQuery 1 sample:");
      console.log(JSON.stringify(rows.slice(0, 8), null, 2));
    }
  }
} catch (err) {
  ok("SQL validation", false, String(err.message || err).slice(0, 200));
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nValidation: ${checks.length - failed}/${checks.length}\n`);
process.exit(failed === 0 ? 0 : 1);
