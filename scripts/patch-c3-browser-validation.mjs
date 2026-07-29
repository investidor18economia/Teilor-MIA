#!/usr/bin/env node
/**
 * PATCH C.3 — Browser regression (cockpit unchanged — lib-only insights).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { EXECUTIVE_SECTION_ORDER } from "../lib/miaFounderExecutivePolishCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_BASE = process.env.PATCH_C3_PROD_BASE_URL || "https://economia-ai.vercel.app";
const BASE =
  process.env.PATCH_C3_BROWSER_BASE_URL ||
  (process.env.PATCH_C3_BROWSER_USE_PROD === "1" ? PROD_BASE : "http://localhost:3024");
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || loadEnvLocalAdminKey();
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-c3-browser");
const COCKPIT_PATH = "/cockpit-fundador?range=30d";
const MAX_SSR_RETRIES = 3;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readDomState(page) {
  return page.evaluate((expectedOrder) => {
    const sections = Array.from(document.querySelectorAll("section[id]")).map((el) => el.id);
    const indices = expectedOrder.map((id) => sections.indexOf(id));
    const monotonic = indices.every((idx, i) => i === 0 || idx < 0 || indices[i - 1] < 0 || idx > indices[i - 1]);
    return {
      fetchError: document.body.textContent.includes("temporariamente indispon"),
      executiveModules: document.querySelectorAll(".founder-executive-module").length,
      summary: Boolean(document.querySelector(".founder-executive-summary.founder-executive-module")),
      insights: Boolean(document.querySelector(".founder-insights-section")),
      analystUi: Boolean(document.querySelector(".founder-executive-analyst")),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      orderOk: monotonic,
      indices,
    };
  }, EXECUTIVE_SECTION_ORDER);
}

async function authenticateContext(context) {
  const res = await context.request.post(`${BASE}/api/founder/authenticate`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    data: { admin_key: ADMIN_KEY },
  });
  return { ok: res.ok(), status: res.status() };
}

async function loadCockpit(page) {
  for (let attempt = 1; attempt <= MAX_SSR_RETRIES; attempt += 1) {
    await page.goto(`${BASE}${COCKPIT_PATH}`, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(
      () => Boolean(document.querySelector("h1")?.textContent?.includes("Cockpit")),
      { timeout: 30000 }
    );
    const state = await readDomState(page);
    if (!state.fetchError && state.executiveModules >= 6) return { ok: true, state, attempt };
    await sleep(2500);
  }
  return { ok: false, state: await readDomState(page), attempt: MAX_SSR_RETRIES };
}

console.log(`\nPATCH C.3 — browser regression (${BASE})\n`);

if (!ADMIN_KEY) {
  writeFileSync(
    join(ROOT, "docs/analytics/PATCH_C_3_BROWSER_EVIDENCE.json"),
    JSON.stringify({ patch: "C.3", status: "SKIPPED", reason: "no admin key" }, null, 2)
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
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));

    const auth = await authenticateContext(context);
    ok(`${vp.id}: authentication`, auth.ok, String(auth.status));
    if (!auth.ok) {
      await context.close();
      continue;
    }

    const load = await loadCockpit(page);
    ok(`${vp.id}: cockpit SSR loaded`, load.ok, load.ok ? `attempt=${load.attempt}` : "failed");
    ok(`${vp.id}: layout intact (6 modules)`, load.state.executiveModules >= 6, `count=${load.state.executiveModules}`);
    ok(`${vp.id}: section order preserved`, load.state.orderOk, JSON.stringify(load.state.indices));
    ok(`${vp.id}: B.7 summary present`, load.state.summary);
    ok(`${vp.id}: insights section present`, load.state.insights);
    ok(`${vp.id}: no analyst UI yet (C.3 lib-only)`, !load.state.analystUi);
    ok(`${vp.id}: no horizontal overflow`, !load.state.overflow);
    ok(`${vp.id}: no page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join("; "));

    await page.screenshot({ path: join(SCREENSHOT_DIR, `cockpit-regression-${vp.id}.png`), fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.pass).length;
writeFileSync(
  join(ROOT, "docs/analytics/PATCH_C_3_BROWSER_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "C.3",
      title: "PATCH C.3 — Browser Regression Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      base_url: BASE,
      note: "C.3 adds lib-only insight generator — validates Baseline B cockpit preserved",
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

console.log(`\nResult: ${passed}/${checks.length}\n`);
process.exit(checks.length - passed ? 1 : 0);
