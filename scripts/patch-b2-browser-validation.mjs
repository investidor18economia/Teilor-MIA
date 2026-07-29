#!/usr/bin/env node
/**
 * PATCH B.2 — Browser validation (desktop / tablet / mobile).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_BASE = process.env.PATCH_B2_PROD_BASE_URL || "https://economia-ai.vercel.app";
const BASE =
  process.env.PATCH_B2_BROWSER_BASE_URL ||
  (process.env.PATCH_B2_BROWSER_USE_PROD === "1" ? PROD_BASE : "http://localhost:3018");
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || "";
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-b2-browser");

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log(`\nPATCH B.2 — browser validation (${BASE})\n`);

if (!ADMIN_KEY) {
  ok("admin key present", false, "MIA_ADMIN_API_KEY required");
  writeFileSync(
    join(ROOT, "docs/analytics/PATCH_B_2_BROWSER_EVIDENCE.json"),
    JSON.stringify({ patch: "B.2", status: "SKIPPED", reason: "no admin key" }, null, 2)
  );
  process.exit(1);
}

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const viewports = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "mobile", width: 390, height: 844 },
];

try {
  const authRes = await browser.newContext().then((ctx) =>
    ctx.request.post(`${BASE}/api/founder/authenticate`, { data: { admin_key: ADMIN_KEY } })
  );
  ok("auth endpoint", authRes.ok(), String(authRes.status()));

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);

    await page.request.post(`${BASE}/api/founder/authenticate`, { data: { admin_key: ADMIN_KEY } });
    await page.goto(`${BASE}/cockpit-fundador?range=30d`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(
      () => Boolean(document.querySelector(".founder-executive-kpis")),
      { timeout: 90000 }
    );

    const kpiCount = await page.locator(".founder-executive-kpi-item").count();
    ok(`${vp.id}: executive section visible`, kpiCount >= 8, `items=${kpiCount}`);

    const badgeCount = await page.locator(".founder-executive-badge").count();
    ok(`${vp.id}: badges rendered`, badgeCount >= 1, `badges=${badgeCount}`);

    const legacyStrip = await page.locator(".founder-kpi-strip").count();
    ok(`${vp.id}: legacy KPI strip preserved`, legacyStrip === 1);

    const shot = join(SCREENSHOT_DIR, `executive-kpis-${vp.id}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    ok(`${vp.id}: screenshot saved`, true, shot.replace(ROOT + "\\", "").replace(ROOT + "/", ""));

    await context.close();
  }
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.pass).length;
writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_2_BROWSER_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.2",
      title: "PATCH B.2 — Browser Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      base_url: BASE,
      screenshots_dir: "docs/analytics/evidence/patch-b2-browser",
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

console.log(`\nResult: ${passed}/${checks.length}\n`);
process.exit(checks.length - passed ? 1 : 0);
