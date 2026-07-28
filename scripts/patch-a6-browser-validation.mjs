#!/usr/bin/env node
/**
 * PATCH A.6 — Browser validation for Performance & Conversion section.
 * Usage:
 *   PATCH_A6_BROWSER_BASE_URL=http://localhost:3005 node --env-file=.env.local scripts/patch-a6-browser-validation.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { mapTemporalMetricsToFounderPerformanceConversion } from "../lib/miaFounderPerformanceDisplay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A6_BROWSER_BASE_URL || "http://localhost:3005";
const PROD_BASE = process.env.PATCH_A6_PROD_BASE_URL || "https://economia-ai.vercel.app";
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || "";
const EVIDENCE_PATH = join(ROOT, "docs/analytics/PATCH_A_6_BROWSER_UI_EVIDENCE.json");
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-a6-browser");

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log(`\nPATCH A.6 — browser UI validation (${BASE})\n`);

if (!ADMIN_KEY) {
  ok("admin key present", false, "MIA_ADMIN_API_KEY required");
  process.exit(1);
}

mkdirSync(SCREENSHOT_DIR, { recursive: true });

let prodTemporal = {};
let expectedView = null;
try {
  const prodRes = await fetch(`${PROD_BASE}/api/temporal-metrics?days=30&series=conversion&fresh=1`);
  prodTemporal = await prodRes.json();
  expectedView = mapTemporalMetricsToFounderPerformanceConversion(prodTemporal);
  ok("production API fetched", prodRes.ok && prodTemporal.temporal_version === "A.6.0");
} catch (err) {
  ok("production API fetched", false, String(err.message).slice(0, 120));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
const a6NetworkFailures = [];
const apiResponses = [];

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("response", (res) => {
  const url = res.url();
  if (url.includes("/api/temporal-metrics") && url.includes("conversion")) {
    apiResponses.push({ url, status: res.status() });
  }
});
page.on("requestfailed", (req) => {
  const url = req.url();
  if (url.includes("temporal-metrics") && url.includes("conversion")) {
    a6NetworkFailures.push(`${url} — ${req.failure()?.errorText || "failed"}`);
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

  await page.waitForSelector("#mod-performance-conversao", { timeout: 25000 });
  ok("performance section visible", await page.isVisible("#mod-performance-conversao"));

  await page.waitForFunction(
    () => {
      const el = document.querySelector("#mod-performance-conversao");
      return el && !el.innerText.includes("Carregando performance e conversão");
    },
    { timeout: 25000 }
  );
  ok("loading finished", true);

  const text = await page.locator("#mod-performance-conversao").innerText();

  ok("section title", text.includes("Performance e Conversão"));
  ok("period summary", text.includes("Resumo do período"));
  ok("recommendations label", text.includes("Recomendações exibidas (período)"));
  ok("clicks label", text.includes("Cliques em ofertas (período)"));
  ok("ctr label", text.includes("CTR geral"));
  ok("favorites rate label", text.includes("Taxa de favoritos"));
  ok("alerts rate label", text.includes("Taxa de alertas"));
  ok("accumulated conversion label", text.includes("Conversão acumulada (visitante)"));
  ok("funnel table header", text.includes("Funil de conversão"));
  ok("funnel stage column", text.includes("Etapa"));
  ok("bottleneck section", text.includes("Gargalo principal") || text.includes("Transições do funil"));
  ok("daily evolution", text.includes("Evolução diária recente"));
  ok("snapshot reference", text.includes("Referência snapshot"));
  ok("unavailable metrics doc", text.includes("Métricas indisponíveis"));

  ok("real numeric data", /\d/.test(text) && !text.includes("Carregando"));

  if (expectedView?.funnelTable?.[0]) {
    const stage = expectedView.funnelTable[0];
    ok("parity funnel stage", text.includes(String(stage.etapa)));
  } else {
    ok("parity funnel skipped", true, "no funnel in prod API");
  }

  if (expectedView?.summaryMetrics?.[0]) {
    const rec = expectedView.summaryMetrics.find((m) => m.id === "eventos_recomendacoes");
    if (rec?.value != null) {
      const formatted = Number(rec.value).toLocaleString("pt-BR");
      ok("parity recommendations total", text.includes(formatted));
    }
  }

  screenshotDesktop = join(SCREENSHOT_DIR, `performance-conversion-desktop-${Date.now()}.png`);
  await page.locator("#mod-performance-conversao").screenshot({ path: screenshotDesktop });

  const productsStillVisible = await page.isVisible("#mod-produtos-categorias");
  ok("A.5 section intact", productsStillVisible);
  const sessionsStillVisible = await page.isVisible("#mod-sessoes-usuarios");
  ok("A.4 section intact", sessionsStillVisible);

  ok("temporal conversion API 200", apiResponses.some((r) => r.status === 200));
  const a6ConsoleErrors = consoleErrors.filter((msg) =>
    /temporal-metrics|performance-conversao|series=conversion/i.test(msg)
  );
  ok(
    "no A.6 console errors",
    a6ConsoleErrors.length === 0,
    a6ConsoleErrors.slice(0, 2).join("; ") ||
      (consoleErrors.length ? `ignored ${consoleErrors.length} non-A.6 errors` : "")
  );
  ok("no A.6 network failures", a6NetworkFailures.length === 0);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.context().addCookies(await page.context().cookies());
  await mobile.goto(`${BASE}/cockpit-fundador`, { waitUntil: "networkidle" });
  await mobile.waitForSelector("#mod-performance-conversao", { timeout: 25000 });
  await mobile.waitForFunction(
    () => {
      const el = document.querySelector("#mod-performance-conversao");
      return el && !el.innerText.includes("Carregando");
    },
    { timeout: 25000 }
  );
  ok("mobile section visible", await mobile.isVisible("#mod-performance-conversao"));
  screenshotMobile = join(SCREENSHOT_DIR, `performance-conversion-mobile-${Date.now()}.png`);
  await mobile.locator("#mod-performance-conversao").screenshot({ path: screenshotMobile });
  await mobile.close();
} catch (err) {
  ok("browser flow", false, String(err.message).slice(0, 200));
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.pass).length;
const relPath = (p) => (p ? p.replace(ROOT + "\\", "docs/analytics/").replace(ROOT + "/", "docs/analytics/") : null);

const evidence = {
  patch: "A.6",
  title: "Founder Performance & Conversion — Browser UI Validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  base_url: BASE,
  production_api_url: `${PROD_BASE}/api/temporal-metrics?days=30&series=conversion`,
  environment: "local_production_build_with_production_api_parity",
  screenshots: {
    desktop: relPath(screenshotDesktop),
    mobile: relPath(screenshotMobile),
  },
  parity: {
    production_temporal_version: prodTemporal.temporal_version ?? null,
    first_funnel_stage: expectedView?.funnelTable?.[0]?.etapa ?? null,
    recommendations: expectedView?.summaryMetrics?.find((m) => m.id === "eventos_recomendacoes")?.value ?? null,
  },
  console_errors_ignored_non_a6: consoleErrors.filter(
    (msg) => !/temporal-metrics|performance-conversao|series=conversion/i.test(msg)
  ).slice(0, 10),
  api_responses: apiResponses,
  checks: { total: checks.length, passed, failed: checks.length - passed, items: checks },
};

writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));

console.log(`\nSummary: ${passed}/${checks.length} passed`);
console.log("Evidence: docs/analytics/PATCH_A_6_BROWSER_UI_EVIDENCE.json\n");
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
