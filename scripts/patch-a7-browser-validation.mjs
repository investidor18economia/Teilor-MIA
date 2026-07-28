#!/usr/bin/env node
/**
 * PATCH A.7 — Browser validation for Advanced Filters.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A7_BROWSER_BASE_URL || "http://localhost:3008";
const PROD_BASE = process.env.PATCH_A7_PROD_BASE_URL || "https://economia-ai.vercel.app";
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || "";

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

if (!ADMIN_KEY) {
  ok("admin key present", false);
  process.exit(1);
}

mkdirSync(join(ROOT, "docs/analytics/evidence/patch-a7-browser"), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.request.post(`${BASE}/api/founder/authenticate`, { data: { admin_key: ADMIN_KEY } });
  await page.goto(`${BASE}/cockpit-fundador?range=30d`, { waitUntil: "networkidle" });
  ok("cockpit loaded", page.url().includes("/cockpit-fundador"));
  ok("filters section visible", await page.isVisible(".founder-cockpit-filters"));

  await page.getByRole("button", { name: "Últimos 7 dias" }).click();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await page.waitForURL(/range=7d/);
  ok("apply 7d updates URL", page.url().includes("range=7d"));

  await page.waitForFunction(
    () => !document.body.innerText.includes("Carregando performance e conversão"),
    { timeout: 25000 }
  );
  ok("sections reloaded after filter", true);

  await page.selectOption(".founder-cockpit-filter-select", "smartphones");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await page.waitForURL(/category=smartphones/);
  ok("category in URL", page.url().includes("category=smartphones"));

  const text = await page.locator(".founder-cockpit-filters").innerText();
  ok("filters UI labels", text.includes("Filtros") && text.includes("Categoria"));

  await page.screenshot({ path: join(ROOT, "docs/analytics/evidence/patch-a7-browser/filters-desktop.png") });
} catch (err) {
  ok("browser flow", false, String(err.message).slice(0, 160));
} finally {
  await browser.close();
}

const prodRes = await fetch(`${PROD_BASE}/api/temporal-metrics?range=7d&category=smartphones&series=conversion&fresh=1`).catch(() => null);
const prodJson = prodRes ? await prodRes.json().catch(() => ({})) : {};
ok("production API parity", prodRes?.ok && prodJson.temporal_version === "A.7.0");

const evidence = {
  patch: "A.7",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  base_url: BASE,
  checks: { total: checks.length, passed: checks.filter((c) => c.pass).length, items: checks },
};
writeFileSync(join(ROOT, "docs/analytics/PATCH_A_7_BROWSER_UI_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
