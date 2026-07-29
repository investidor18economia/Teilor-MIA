#!/usr/bin/env node
/**
 * PATCH C.9 — Browser regression (Phase C lib-only — cockpit unchanged).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { EXECUTIVE_SECTION_ORDER } from "../lib/miaFounderExecutivePolishCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_C9_BROWSER_BASE_URL || "http://localhost:3024";
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || loadEnvLocalAdminKey();
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/phase-c-final-audit-browser");
const COCKPIT_PATH = "/cockpit-fundador?range=30d";
const checks = [];

function loadEnvLocalAdminKey() {
  try {
    const line = readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("MIA_ADMIN_API_KEY="));
    return line ? line.slice("MIA_ADMIN_API_KEY=".length).trim() : "";
  } catch {
    return "";
  }
}

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log(`\nPATCH C.9 — browser regression (${BASE})\n`);
if (!ADMIN_KEY) {
  writeFileSync(join(ROOT, "docs/analytics/PATCH_C_9_BROWSER_EVIDENCE.json"), JSON.stringify({ patch: "C.9", status: "SKIPPED" }, null, 2));
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
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));

    const auth = await context.request.post(`${BASE}/api/founder/authenticate`, {
      headers: { "Content-Type": "application/json" },
      data: { admin_key: ADMIN_KEY },
    });
    ok(`${vp.id}: authentication`, auth.ok(), String(auth.status()));
    if (!auth.ok()) {
      await context.close();
      continue;
    }

    await page.goto(`${BASE}${COCKPIT_PATH}`, { waitUntil: "load", timeout: 120000 });
    const state = await page.evaluate((order) => {
      const sections = Array.from(document.querySelectorAll("section[id]")).map((el) => el.id);
      const indices = order.map((id) => sections.indexOf(id));
      const monotonic = indices.every((idx, i) => i === 0 || idx < 0 || indices[i - 1] < 0 || idx > indices[i - 1]);
      return {
        executiveModules: document.querySelectorAll(".founder-executive-module").length,
        analystUi: Boolean(document.querySelector(".founder-executive-analyst")),
        orderOk: monotonic,
      };
    }, EXECUTIVE_SECTION_ORDER);

    ok(`${vp.id}: layout intact`, state.executiveModules >= 6, `count=${state.executiveModules}`);
    ok(`${vp.id}: section order preserved`, state.orderOk);
    ok(`${vp.id}: no analyst UI (Phase C lib-only)`, !state.analystUi);
    ok(`${vp.id}: no page errors`, pageErrors.length === 0);
    await page.screenshot({ path: join(SCREENSHOT_DIR, `cockpit-regression-${vp.id}.png`), fullPage: true }).catch(() => {});
    await context.close();
  }
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.pass).length;
writeFileSync(
  join(ROOT, "docs/analytics/PATCH_C_9_BROWSER_EVIDENCE.json"),
  JSON.stringify({ patch: "C.9", status: passed === checks.length ? "APPROVED" : "REJECTED", validated_at: new Date().toISOString(), base_url: BASE, checks: { total: checks.length, passed, items: checks } }, null, 2)
);
process.exit(checks.length - passed ? 1 : 0);
