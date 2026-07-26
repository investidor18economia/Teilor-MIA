#!/usr/bin/env node
/**
 * PATCH 6.3 — Data Layer statistics production validation.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH63_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERIES = [
  { file: "patch-63-query1-inventory-category.sql", label: "Q1 inventory", minRows: 1, tipos: ["inventario_consolidado", "distribuicao_categoria", "exposicao_central_detail"] },
  { file: "patch-63-query2-brand-family-concentration.sql", label: "Q2 brand/family", minRows: 1, tipos: ["distribuicao_marca", "distribuicao_familia", "concentracao", "diversidade"] },
  { file: "patch-63-query3-technical-attributes.sql", label: "Q3 attributes", minRows: 1, tipos: ["estatistica_atributo", "faixa_tecnica", "variantes_modelo"] },
  { file: "patch-63-query4-temporal-panel-insights.sql", label: "Q4 temporal", minRows: 1, tipos: ["estatistica_temporal", "capacidade_historica", "proveniencia_distribuicao", "painel_estatistico", "insight_estatistico"] },
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

console.log("\nPATCH 6.3 — Data Layer statistics production validation\n");

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
    ok(`${q.label} has tipo_analise`, rows.some((r) => q.tipos.includes(r.tipo_analise)));
    ok(`${q.label} has registros_total`, rows.every((r) => "registros_total" in r));
    ok(`${q.label} has valor_absoluto`, rows.every((r) => "valor_absoluto" in r));
    ok(`${q.label} no analytics_events`, !rows.some((r) => "visitor_id" in r));

    if (q.file.includes("query1")) {
      const inv = rows.find((r) => r.metrica === "total_registros" && r.entidade_nome === "product_specs");
      const expo = rows.find((r) => r.metrica === "detail_nao_ligado_central" && r.categoria === "phone");
      ok("Q1 central total present", inv?.valor_absoluto === 47 || inv?.valor_absoluto > 0);
      ok("Q1 phone unlinked detail", expo?.valor_absoluto === 458 || expo?.valor_absoluto >= 0);
      console.log("\nQuery 1 — inventory sample:");
      console.log(JSON.stringify(rows.filter((r) => r.tipo_analise === "inventario_consolidado").slice(0, 4), null, 2));
    }

    if (q.file.includes("query2")) {
      const conc = rows.find((r) => r.metrica === "top1_participacao" && r.categoria === "phone");
      ok("Q2 concentration top1 phone", !!conc);
      console.log("\nQuery 2 — concentration phone:");
      console.log(JSON.stringify(rows.filter((r) => r.tipo_analise === "concentracao" && r.categoria === "phone"), null, 2));
    }

    if (q.file.includes("query4")) {
      const cap = rows.find((r) => r.tipo_analise === "capacidade_historica");
      ok("Q4 historical capacity classified", cap?.limitacao === "apenas_timestamps_estado_atual");
      console.log("\nQuery 4 — capacity + insights:");
      console.log(JSON.stringify(rows.filter((r) => ["capacidade_historica", "insight_estatistico", "painel_estatistico"].includes(r.tipo_analise)), null, 2));
    }
  }
} catch (err) {
  ok("production SQL execution", false, err.stderr?.slice(0, 300) || err.message);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}\n`);
if (failed > 0) process.exit(1);
