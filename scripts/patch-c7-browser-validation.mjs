#!/usr/bin/env node
/**
 * PATCH C.7 — Browser regression (cockpit unchanged — lib-only explainability).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { EXECUTIVE_SECTION_ORDER } from "../lib/miaFounderExecutivePolishCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_BASE = process.env.PATCH_C7_PROD_BASE_URL || "https://economia-ai.vercel.app";
const BASE =
  process.env.PATCH_C7_BROWSER_BASE_URL ||
  (process.env.PATCH_C7_BROWSER_USE_PROD === "1" ? PROD_BASE : "http://localhost:3024");
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || loadEnvLocalAdminKey();
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-c7-browser");
const COCKPIT_PATH = "/cockpit-fundador?range=30d";

const checks = [];

function loadEnvLocalAdminKey() {
  try {
    const line = readFileSync(join(ROOT, ".env.local"), "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("MIA_ADMIN_API_KEY="));
    return line ? line.slice("MIA_ADMIN_API_KEY=".length).trim() : "";
  } catch {
    return "";
  }
}

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

async function readDomState(page) {
  return page.evaluate((expectedOrder) => {
    const sections = Array.from(document.querySelectorAll("section[id]")).map((el) => el.id);
    const indices = expectedOrder.map((id) => sections.indexOf(id));
    const monotonic = indices.every((idx, i) => i === 0 || idx < 0 || indices[i - 1] < 0 || idx > indices[i - 1]);
    return {
      fetchError: document.body.textContent.includes("temporariamente indispon"),
      executiveModules: document.querySelectorAll(".founder-executive-module").length,
      analystUi: Boolean(document.querySelector(".founder-executive-analyst")),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      orderOk: monotonic,
    };
  }, EXECUTIVE_SECTION_ORDER);
}

console.log(`\nPATCH C.7 — browser regression (${BASE})\n`);

if (!ADMIN_KEY) {
  writeFileSync(
    join(ROOT, "docs/analytics/PATCH_C_7_BROWSER_EVIDENCE.json"),
    JSON.stringify({ patch: "C.7", status: "SKIPPED", reason: "no admin key" }, null, 2)
  );
  console.log("SKIPPED — no MIA_ADMIN_API_KEY\n");
  process.exit(0);
}

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const viewports = [
  { name: "desktop", width: 1440, height: 900, screenshot: "cockpit-regression-desktop.png" },
  { name: "tablet", width: 834, height: 1112, screenshot: "cockpit-regression-tablet.png" },
  { name: "mobile", width: 390, height: 844, screenshot: "cockpit-regression-mobile.png" },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
let pageErrors = [];

page.on("pageerror", (err) => pageErrors.push(String(err.message)));

for (const vp of viewports) {
  pageErrors = [];
  await page.setViewportSize({ width: vp.width, height: vp.height });

  const authRes = await page.request.post(`${BASE}/api/founder/authenticate`, {
    data: { api_key: ADMIN_KEY },
  });
  ok(`${vp.name}: authentication`, authRes.status() === 200, String(authRes.status()));

  await page.goto(`${BASE}${COCKPIT_PATH}`, { waitUntil: "networkidle" });
  const state = await readDomState(page);

  ok(`${vp.name}: layout intact`, state.executiveModules >= 6, `count=${state.executiveModules}`);
  ok(`${vp.name}: section order preserved`, state.orderOk);
  ok(`${vp.name}: no analyst UI yet (C.7 lib-only)`, !state.analystUi);
  ok(`${vp.name}: no page errors`, pageErrors.length === 0 && !state.fetchError);

  await page.screenshot({ path: join(SCREENSHOT_DIR, vp.screenshot), fullPage: true }).catch(() => {});
}

await browser.close();

const evidence = {
  patch: "C.7",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  validated_at: new Date().toISOString(),
  base_url: BASE,
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    items: checks,
  },
};
writeFileSync(join(ROOT, "docs/analytics/PATCH_C_7_BROWSER_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} checks passed\n`);
process.exit(checks.every((c) => c.pass) ? 0 : 1);
