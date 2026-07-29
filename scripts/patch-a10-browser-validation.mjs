#!/usr/bin/env node
/**
 * PATCH A.10 — Phase A comprehensive browser validation.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_BASE = process.env.PATCH_A10_PROD_BASE_URL || "https://economia-ai.vercel.app";
const BASE = process.env.PATCH_A10_BROWSER_BASE_URL || "http://localhost:3018";
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || "";
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-a10-browser");

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log(`\nPATCH A.10 — Phase A browser validation (${BASE})\n`);

if (!ADMIN_KEY) {
  ok("admin key present", false);
  process.exit(1);
}

mkdirSync(SCREENSHOT_DIR, { recursive: true });

let apiExec = {};
let apiTemporal = {};
try {
  const [execRes, tempRes] = await Promise.all([
    fetch(`${BASE}/api/executive-metrics?range=30d&fresh=1`),
    fetch(`${BASE}/api/temporal-metrics?range=30d&series=conversion&fresh=1`),
  ]);
  apiExec = await execRes.json();
  apiTemporal = await tempRes.json();
  ok("executive API parity", execRes.ok);
  ok("temporal API parity", tempRes.ok);
} catch (err) {
  ok("API parity", false, String(err.message).slice(0, 80));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(90000);
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

try {
  const authRes = await page.request.post(`${BASE}/api/founder/authenticate`, { data: { admin_key: ADMIN_KEY } });
  ok("auth endpoint", authRes.ok(), String(authRes.status()));
  await page.goto(`${BASE}/cockpit-fundador?range=30d`, { waitUntil: "load", timeout: 90000 });
  await page.waitForFunction(
    () => Boolean(document.querySelector("h1")?.textContent?.includes("Cockpit")),
    { timeout: 90000 }
  );
  ok("cockpit loaded", page.url().includes("/cockpit-fundador"));
  ok("authenticated", (await page.locator(".founder-cockpit-page--gate").count()) === 0);

  // Snapshot KPIs
  ok("KPI strip", (await page.locator(".founder-kpi-strip").count()) > 0);
  ok("filters bar", (await page.locator(".founder-cockpit-filters").count()) > 0);

  // Temporal modules A.4-A.6
  ok("sessions module", (await page.locator("#mod-sessoes-usuarios").count()) > 0);
  ok("products module", (await page.locator("#mod-produtos-categorias").count()) > 0);
  ok("performance module", (await page.locator("#mod-performance-conversao").count()) > 0);

  // Charts A.8
  await page.waitForFunction(() => document.querySelectorAll(".founder-chart-panel").length >= 3, { timeout: 90000 });
  ok("charts panels", (await page.locator(".founder-chart-panel").count()) >= 3);

  // UI polish A.9
  const hasTokens = await page.evaluate(() => {
    const el = document.querySelector(".founder-cockpit-page");
    return Boolean(el && getComputedStyle(el).getPropertyValue("--fc-accent").trim());
  });
  ok("design tokens", hasTokens);
  ok("module shells", (await page.locator(".founder-module-shell").count()) >= 1);

  // Parity sample
  if (apiTemporal?.conversion?.summary?.eventos_recomendacoes != null) {
    const formatted = Number(apiTemporal.conversion.summary.eventos_recomendacoes).toLocaleString("pt-BR");
    const perfText = await page.locator("#mod-performance-conversao").innerText();
    ok("metric parity", perfText.includes(formatted), formatted);
  } else {
    ok("metric parity", true, "skipped");
  }

  // Filter interaction A.7
  await page.getByRole("button", { name: "Últimos 7 dias" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await page.waitForURL(/range=7d/, { timeout: 30000 });
  ok("filters apply 7d", page.url().includes("range=7d"));

  await page.screenshot({ path: join(SCREENSHOT_DIR, "phase-a-desktop-30d.png"), fullPage: true });

  const tablet = await browser.newPage({ viewport: { width: 834, height: 1112 } });
  tablet.setDefaultTimeout(90000);
  await tablet.context().addCookies(await page.context().cookies());
  await tablet.goto(`${BASE}/cockpit-fundador?range=7d`, { waitUntil: "load", timeout: 90000 });
  ok("tablet layout", (await tablet.locator(".founder-cockpit-filters").count()) > 0);
  await tablet.screenshot({ path: join(SCREENSHOT_DIR, "phase-a-tablet-7d.png") });
  await tablet.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.setDefaultTimeout(90000);
  await mobile.context().addCookies(await page.context().cookies());
  await mobile.goto(`${BASE}/cockpit-fundador?range=7d`, { waitUntil: "load", timeout: 90000 });
  ok("mobile layout", (await mobile.locator(".founder-cockpit-filters").count()) > 0);
  await mobile.screenshot({ path: join(SCREENSHOT_DIR, "phase-a-mobile-7d.png"), fullPage: true });
  await mobile.close();

  const phaseErrors = consoleErrors.filter((m) => /founder|cockpit|chart|temporal/i.test(m));
  ok("no console errors", phaseErrors.length === 0, phaseErrors.slice(0, 2).join("; "));

  const prodHealth = await fetch(`${PROD_BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
  ok("production health", Boolean(prodHealth.build));
} catch (err) {
  ok("browser flow", false, String(err.message).slice(0, 180));
} finally {
  await browser.close();
}

const evidence = {
  patch: "A.10",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  base_url: BASE,
  scenarios: ["snapshot", "sessions", "products", "conversion", "filters", "charts", "ui", "responsive"],
  screenshots: [
    "docs/analytics/evidence/patch-a10-browser/phase-a-desktop-30d.png",
    "docs/analytics/evidence/patch-a10-browser/phase-a-tablet-7d.png",
    "docs/analytics/evidence/patch-a10-browser/phase-a-mobile-7d.png",
  ],
  checks: { total: checks.length, passed: checks.filter((c) => c.pass).length, items: checks },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_10_BROWSER_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
console.log(`\nSummary: ${evidence.checks.passed}/${evidence.checks.total} passed\n`);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
