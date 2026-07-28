#!/usr/bin/env node
/**
 * PATCH A.5 / A.5.1 — Browser validation for Products & Categories section.
 * Usage:
 *   PATCH_A5_BROWSER_BASE_URL=http://localhost:3001 node --env-file=.env.local scripts/patch-a5-browser-validation.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mapTemporalMetricsToFounderProductsCategories } from "../lib/miaFounderProductsDisplay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A5_BROWSER_BASE_URL || "http://localhost:3001";
const PROD_BASE = process.env.PATCH_A5_PROD_BASE_URL || "https://economia-ai.vercel.app";
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || "";
const EVIDENCE_PATH = join(ROOT, "docs/analytics/PATCH_A_5_BROWSER_UI_EVIDENCE.json");
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-a5-browser");

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log(`\nPATCH A.5 — browser UI validation (${BASE})\n`);

if (!ADMIN_KEY) {
  ok("admin key present", false, "MIA_ADMIN_API_KEY required");
  process.exit(1);
}

mkdirSync(SCREENSHOT_DIR, { recursive: true });

let prodTemporal = {};
let expectedView = null;
try {
  const prodRes = await fetch(`${PROD_BASE}/api/temporal-metrics?days=30&series=products,categories&fresh=1`);
  prodTemporal = await prodRes.json();
  expectedView = mapTemporalMetricsToFounderProductsCategories(prodTemporal);
  ok("production API fetched", prodRes.ok && prodTemporal.temporal_version === "A.5.0");
} catch (err) {
  ok("production API fetched", false, String(err.message).slice(0, 120));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
const a5NetworkFailures = [];
const apiResponses = [];

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("response", (res) => {
  const url = res.url();
  if (url.includes("/api/temporal-metrics") && url.includes("products")) {
    apiResponses.push({ url, status: res.status() });
  }
});
page.on("requestfailed", (req) => {
  const url = req.url();
  if (url.includes("temporal-metrics") && url.includes("products")) {
    a5NetworkFailures.push(`${url} — ${req.failure()?.errorText || "failed"}`);
  }
});

let screenshotDesktop = null;
let screenshotMobile = null;

try {
  const authRes = await page.request.post(`${BASE}/api/founder/authenticate`, {
    data: { admin_key: ADMIN_KEY },
  });
  ok("authenticate 200", authRes.status() === 200, `status=${authRes.status()}`);

  await page.goto(`${BASE}/cockpit-fundador`, { waitUntil: "networkidle" });
  ok("cockpit loaded", page.url().includes("/cockpit-fundador"));

  await page.waitForSelector("#mod-produtos-categorias", { timeout: 25000 });
  ok("products section visible", await page.isVisible("#mod-produtos-categorias"));

  await page.waitForFunction(
    () => {
      const el = document.querySelector("#mod-produtos-categorias");
      return el && !el.innerText.includes("Carregando inteligência de produtos");
    },
    { timeout: 25000 }
  );
  ok("loading finished", true);

  const text = await page.locator("#mod-produtos-categorias").innerText();

  ok("section title", text.includes("Produtos e Categorias"));
  ok("products subsection", text.includes("Produtos — visão do período"));
  ok("distinct products label", text.includes("Produtos distintos"));
  ok("appearances label", text.includes("Aparições de produto"));
  ok("recommendations label", text.includes("Recomendações exibidas"));
  ok("clicks label", text.includes("Cliques em ofertas"));
  ok("favorites label", text.includes("Favoritos"));
  ok("alerts label", text.includes("Alertas de preço"));
  ok("click rate label", text.includes("Taxa clique / recomendação"));
  ok("product ranking header", text.includes("Produtos com maior interação"));
  ok("categories subsection", text.includes("Categorias — visão do período"));
  ok("distinct categories label", text.includes("Categorias distintas"));
  ok("questions label", text.includes("Perguntas por categoria"));
  ok("category events label", text.includes("Eventos de categoria"));
  ok("question to rec rate", text.includes("Taxa pergunta → recomendação"));
  ok("rec to click rate", text.includes("Taxa recomendação → clique"));
  ok("category ranking header", text.includes("Categorias com maior interação"));
  ok("distribution title", text.includes("Participação relativa entre categorias"));
  ok("recent activity table", text.includes("Atividade recente por categoria"));
  ok("snapshot reference", text.includes("Referência snapshot"));
  ok("unavailable metrics doc", text.includes("Métricas indisponíveis"));

  ok("real numeric data", /\d/.test(text) && !text.includes("Carregando"));

  if (expectedView?.topProducts?.[0]) {
    const top = expectedView.topProducts[0];
    ok("parity top product label", text.includes(String(top.product_label)));
    ok("parity top product appearances", text.includes(top.total_aparicoes_formatted));
  } else {
    ok("parity top product skipped", true, "no ranking in prod API");
  }

  if (expectedView?.topCategories?.[0]) {
    const cat = expectedView.topCategories[0];
    ok("parity top category", text.includes(String(cat.category)));
    ok("parity top category events", text.includes(cat.total_eventos_formatted));
  } else {
    ok("parity top category skipped", true, "no ranking in prod API");
  }

  if (expectedView?.productSummaryMetrics?.[0]) {
    const distinct = expectedView.productSummaryMetrics.find((m) => m.id === "distinct_products");
    if (distinct?.value != null) {
      const formatted = Number(distinct.value).toLocaleString("pt-BR");
      ok("parity distinct products total", text.includes(formatted));
    }
  }

  screenshotDesktop = join(SCREENSHOT_DIR, `products-categories-desktop-${Date.now()}.png`);
  await page.locator("#mod-produtos-categorias").screenshot({ path: screenshotDesktop });

  const sessionsStillVisible = await page.isVisible("#mod-sessoes-usuarios");
  ok("A.4 section intact", sessionsStillVisible);

  ok("temporal products API 200", apiResponses.some((r) => r.status === 200));
  const a5ConsoleErrors = consoleErrors.filter((msg) =>
    /temporal-metrics|produtos-categorias|products,categories/i.test(msg)
  );
  ok(
    "no A.5 console errors",
    a5ConsoleErrors.length === 0,
    a5ConsoleErrors.slice(0, 2).join("; ") ||
      (consoleErrors.length ? `ignored ${consoleErrors.length} non-A.5 errors` : "")
  );
  ok("no A.5 network failures", a5NetworkFailures.length === 0);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.context().addCookies(await page.context().cookies());
  await mobile.goto(`${BASE}/cockpit-fundador`, { waitUntil: "networkidle" });
  await mobile.waitForSelector("#mod-produtos-categorias", { timeout: 25000 });
  await mobile.waitForFunction(
    () => {
      const el = document.querySelector("#mod-produtos-categorias");
      return el && !el.innerText.includes("Carregando");
    },
    { timeout: 25000 }
  );
  ok("mobile section visible", await mobile.isVisible("#mod-produtos-categorias"));
  screenshotMobile = join(SCREENSHOT_DIR, `products-categories-mobile-${Date.now()}.png`);
  await mobile.locator("#mod-produtos-categorias").screenshot({ path: screenshotMobile });
  await mobile.close();
} catch (err) {
  ok("browser flow", false, String(err.message).slice(0, 200));
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.pass).length;
const relPath = (p) => (p ? p.replace(ROOT + "\\", "docs/analytics/").replace(ROOT + "/", "docs/analytics/") : null);

const evidence = {
  patch: "A.5.1",
  title: "Founder Products & Categories — Browser UI Validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  base_url: BASE,
  production_api_url: `${PROD_BASE}/api/temporal-metrics?days=30&series=products,categories`,
  environment: "local_production_build_with_production_api_parity",
  screenshots: {
    desktop: relPath(screenshotDesktop),
    mobile: relPath(screenshotMobile),
  },
  parity: {
    production_temporal_version: prodTemporal.temporal_version ?? null,
    top_product: expectedView?.topProducts?.[0]?.product_label ?? null,
    top_category: expectedView?.topCategories?.[0]?.category ?? null,
  },
  console_errors_ignored_non_a5: consoleErrors.filter(
    (msg) => !/temporal-metrics|produtos-categorias|products,categories/i.test(msg)
  ).slice(0, 10),
  api_responses: apiResponses,
  checks: { total: checks.length, passed, failed: checks.length - passed, items: checks },
};

writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));

console.log(`\nSummary: ${passed}/${checks.length} passed`);
console.log("Evidence: docs/analytics/PATCH_A_5_BROWSER_UI_EVIDENCE.json\n");
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
