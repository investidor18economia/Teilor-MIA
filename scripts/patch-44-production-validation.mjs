#!/usr/bin/env node
/**
 * PATCH 4.4 — Production validation (products & categories dashboard SQL).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH44_PROD_BASE_URL || "https://economia-ai.vercel.app";

const QUERY1 = join(ROOT, "docs/analytics/sql/patch-44-query1-product-ranking.sql");
const QUERY2 = join(ROOT, "docs/analytics/sql/patch-44-query2-category-intelligence.sql");
const QUERY3 = join(ROOT, "docs/analytics/sql/patch-44-query3-daily-category.sql");
const QUERY4 = join(ROOT, "docs/analytics/sql/patch-44-query4-daily-product.sql");

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

console.log("\nPATCH 4.4 — products & categories dashboard production validation\n");

{
  const res = await fetch(`${BASE}/api/health`);
  ok("production health endpoint", res.ok, `status=${res.status}`);
}

try {
  ok("supabase linked project", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));

  const products = runLinkedSql(QUERY1);
  ok("SQL Query 1 executed", Array.isArray(products), `products=${products.length}`);

  if (products.length > 0) {
    const top = products[0];
    ok("Query 1 — product_name present", Boolean(top.product_name));
    ok(
      "Query 1 — total_aparicoes >= total_recomendacoes",
      Number(top.total_aparicoes) >= Number(top.total_recomendacoes),
      `aparicoes=${top.total_aparicoes} reco=${top.total_recomendacoes}`
    );
    console.log("\nQuery 1 — top product:");
    console.log(JSON.stringify(top, null, 2));
  } else {
    ok("Query 1 — empty result acceptable (no product_name data)", true);
  }

  const categories = runLinkedSql(QUERY2);
  ok("SQL Query 2 executed", categories.length >= 1, `categories=${categories.length}`);

  let catCoherent = true;
  for (const row of categories) {
    if (Number(row.total_eventos_categoria) < Number(row.total_perguntas)) {
      catCoherent = false;
      ok(`category ${row.category} total_eventos coherence`, false);
    }
  }
  if (catCoherent) {
    ok("category event totals coherent", true, `${categories.length} category(ies)`);
  }

  if (categories.length > 0) {
    console.log("\nQuery 2 — categories:");
    console.log(JSON.stringify(categories.slice(0, 5), null, 2));
  }

  const dailyCat = runLinkedSql(QUERY3);
  ok("SQL Query 3 executed", dailyCat.length >= 1, `rows=${dailyCat.length}`);

  const dailyProd = runLinkedSql(QUERY4);
  ok("SQL Query 4 executed", dailyProd.length >= 0, `rows=${dailyProd.length}`);

  if (dailyCat.length > 0) {
    const row = dailyCat[0];
    ok(
      "Query 3 — total_eventos sums event types",
      Number(row.total_eventos) >= Number(row.eventos_perguntas),
      `total=${row.total_eventos} perguntas=${row.eventos_perguntas}`
    );
  }

  if (products.length > 0) {
    const sumReco = products.reduce((s, r) => s + Number(r.total_recomendacoes || 0), 0);
    ok("Query 1 — sum total_recomendacoes > 0", sumReco > 0, `sum=${sumReco}`);
  }
} catch (err) {
  ok("production SQL execution", false, err.message);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nResultado: ${checks.length - failed}/${checks.length}`);
process.exit(failed > 0 ? 1 : 0);
