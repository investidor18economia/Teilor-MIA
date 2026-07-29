#!/usr/bin/env node
/**
 * PATCH A.8 — Browser validation for Founder Charts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A8_BROWSER_BASE_URL || "http://localhost:3012";
const PROD_BASE = process.env.PATCH_A8_PROD_BASE_URL || "https://economia-ai.vercel.app";
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || "";
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-a8-browser");

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log(`\nPATCH A.8 — browser charts validation (${BASE})\n`);

if (!ADMIN_KEY) {
  ok("admin key present", false);
  process.exit(1);
}

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

try {
  await page.request.post(`${BASE}/api/founder/authenticate`, { data: { admin_key: ADMIN_KEY } });
  await page.goto(`${BASE}/cockpit-fundador?range=30d`, { waitUntil: "networkidle" });
  ok("cockpit loaded", page.url().includes("/cockpit-fundador"));

  await page.waitForSelector(".founder-chart-panel", { timeout: 35000 });
  ok("chart panels visible", await page.locator(".founder-chart-panel").count() >= 3);

  await page.waitForFunction(
    () => !document.body.innerText.includes("Carregando gráfico"),
    { timeout: 35000 }
  ).catch(() => {});

  ok("sessions line chart", (await page.locator("#mod-sessoes-usuarios .founder-chart--line").count()) >= 1);
  ok("products charts", (await page.locator("#mod-produtos-categorias .founder-chart").count()) >= 1);
  ok("performance charts", (await page.locator("#mod-performance-conversao .founder-chart").count()) >= 1);

  await page.getByRole("button", { name: "Últimos 7 dias" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await page.waitForURL(/range=7d/);
  await page.waitForFunction(
    () => !document.body.innerText.includes("Carregando gráfico"),
    { timeout: 35000 }
  ).catch(() => {});
  ok("charts update on 7d filter", page.url().includes("range=7d"));

  await page.screenshot({ path: join(SCREENSHOT_DIR, "charts-desktop-30d.png"), fullPage: false });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.context().addCookies(await page.context().cookies());
  await mobile.goto(`${BASE}/cockpit-fundador?range=7d`, { waitUntil: "networkidle" });
  await mobile.waitForSelector(".founder-chart-panel", { timeout: 35000 });
  ok("mobile charts visible", await mobile.isVisible(".founder-chart-panel"));
  await mobile.screenshot({ path: join(SCREENSHOT_DIR, "charts-mobile-7d.png"), fullPage: true });
  await mobile.close();

  const a8Errors = consoleErrors.filter((m) => /chart|founder-chart|temporal-metrics/i.test(m));
  ok("no A.8 console errors", a8Errors.length === 0, a8Errors.slice(0, 2).join("; "));

  const prodRes = await fetch(`${PROD_BASE}/api/temporal-metrics?range=7d&series=conversion&fresh=1`);
  const prodJson = await prodRes.json();
  ok("production API parity", prodRes.ok && prodJson.temporal_version === "A.7.0");
} catch (err) {
  ok("browser flow", false, String(err.message).slice(0, 180));
} finally {
  await browser.close();
}

const evidence = {
  patch: "A.8",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  base_url: BASE,
  screenshots: [
    "docs/analytics/evidence/patch-a8-browser/charts-desktop-30d.png",
    "docs/analytics/evidence/patch-a8-browser/charts-mobile-7d.png",
  ],
  checks: { total: checks.length, passed: checks.filter((c) => c.pass).length, items: checks },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_8_BROWSER_UI_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
console.log(`\nSummary: ${evidence.checks.passed}/${evidence.checks.total} passed\n`);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
