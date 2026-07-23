#!/usr/bin/env node
/** PATCH 11.2 — production smoke for /teilor-em-numeros */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanPublicMetricsForbiddenContent } from "../lib/miaPublicMetricsDisplay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH112_PROD_BASE_URL || "https://economia-ai.vercel.app";

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\nPATCH 11.2 — Teilor em Números production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const apiRes = await fetch(`${BASE}/api/executive-metrics`);
const apiJson = await apiRes.json().catch(() => ({}));
ok("executive-metrics 200", apiRes.status === 200);
ok("api metrics_version", apiJson.metrics_version === "11.1.0");

const t0 = Date.now();
const pageRes = await fetch(`${BASE}/teilor-em-numeros`, {
  headers: { Accept: "text/html" },
});
const elapsed = Date.now() - t0;
const html = await pageRes.text();

ok("page HTTP 200", pageRes.status === 200, `status=${pageRes.status}`);
ok("hero title in HTML", html.includes("Teilor em Números"));
ok("transparency section", html.includes("Como calculamos estes números?"));
ok("API source label", html.includes("API Executiva de Métricas"));
ok("economia disclaimer", html.includes("Não representa economia efetivamente realizada") || html.includes("Não representa economia"));
ok("canonical link", html.includes('rel="canonical"'));
ok("og:title", html.includes('property="og:title"'));
ok("schema.org Organization", html.includes('"@type":"Organization"') || html.includes('"@type": "Organization"'));
ok("no forbidden content", scanPublicMetricsForbiddenContent(html).length === 0);
ok("no private metrics words", !/\b(CAC|LTV|margem|receita|lucro)\b/i.test(html));
ok("performance under 15s", elapsed < 15_000, `${elapsed}ms`);

const sectionIds = ["plataforma", "recomendacoes", "inteligencia-comercial", "economia", "sistema", "transparencia"];
for (const id of sectionIds) {
  ok(`section #${id}`, html.includes(`id="${id}"`) || html.includes(`id='${id}'`));
}

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_11_2_PUBLIC_METRICS_PAGE_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "11.2",
      title: "Página Pública Teilor em Números",
      status: "PENDING",
      validated_at: new Date().toISOString(),
      production: {
        base_url: BASE,
        build: healthJson.build ?? null,
        page_path: "/teilor-em-numeros",
        api_path: "/api/executive-metrics",
      },
      performance: {
        page_load_ms: elapsed,
      },
      checks: {
        total: checks.length,
        passed: checks.filter((c) => c.pass).length,
        failed: checks.filter((c) => !c.pass).length,
        items: checks,
      },
    },
    null,
    2
  )
);

process.exit(checks.some((c) => !c.pass) ? 1 : 0);
