#!/usr/bin/env node
/**
 * PATCH B.8 — Browser validation (desktop / tablet / mobile).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { EXECUTIVE_SECTION_ORDER } from "../lib/miaFounderExecutivePolishCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_BASE = process.env.PATCH_B8_PROD_BASE_URL || "https://economia-ai.vercel.app";
const BASE =
  process.env.PATCH_B8_BROWSER_BASE_URL ||
  (process.env.PATCH_B8_BROWSER_USE_PROD === "1" ? PROD_BASE : "http://localhost:3024");
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || loadEnvLocalAdminKey();
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-b8-browser");
const COCKPIT_PATH = "/cockpit-fundador?range=30d";
const MAX_SSR_RETRIES = 3;

const checks = [];
const diagnostics = [];

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
      executiveModules: document.querySelectorAll(".founder-executive-module").length,
      badges: document.querySelectorAll(".founder-executive-badge").length,
      headlines: document.querySelectorAll(
        ".founder-executive-growth-headline, .founder-executive-commercial-headline, .founder-executive-operational-headline, .founder-executive-summary-headline"
      ).length,
      disclaimers: document.querySelectorAll(".founder-executive-module .founder-module-disclaimer").length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      sections,
      indices,
      orderOk: monotonic,
      kpis: Boolean(document.querySelector(".founder-executive-kpis.founder-executive-module")),
      summary: Boolean(document.querySelector(".founder-executive-summary.founder-executive-module")),
      insights: Boolean(document.querySelector(".founder-insights-section")),
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

async function loadAuthenticatedCockpit(page) {
  let lastState = null;
  for (let attempt = 1; attempt <= MAX_SSR_RETRIES; attempt += 1) {
    await page.goto(`${BASE}${COCKPIT_PATH}`, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(
      () => Boolean(document.querySelector("h1")?.textContent?.includes("Cockpit")),
      { timeout: 30000 }
    );
    lastState = await readDomState(page);
    diagnostics.push({ attempt, ...lastState });
    if (lastState.executiveModules >= 6) {
      return { ok: true, state: lastState, attempt };
    }
    await sleep(2500);
  }
  return { ok: false, state: lastState, attempt: MAX_SSR_RETRIES };
}

console.log(`\nPATCH B.8 — browser validation (${BASE})\n`);

if (!ADMIN_KEY) {
  writeFileSync(
    join(ROOT, "docs/analytics/PATCH_B_8_BROWSER_EVIDENCE.json"),
    JSON.stringify({ patch: "B.8", status: "SKIPPED", reason: "no admin key" }, null, 2)
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
    ok(`${vp.id}: auth`, auth.ok, String(auth.status));
    if (!auth.ok) {
      await context.close();
      continue;
    }

    const load = await loadAuthenticatedCockpit(page);
    ok(`${vp.id}: cockpit ready`, load.ok, load.ok ? `attempt=${load.attempt}` : "modules missing");

    await page.waitForFunction(
      () => document.querySelectorAll(".founder-executive-module").length >= 6,
      { timeout: 120000 }
    );

    const state = await readDomState(page);
    ok(`${vp.id}: 6 executive modules`, state.executiveModules >= 6, `count=${state.executiveModules}`);
    ok(`${vp.id}: unified module class on KPIs`, state.kpis);
    ok(`${vp.id}: unified module class on summary`, state.summary);
    ok(`${vp.id}: section order`, state.orderOk, JSON.stringify(state.indices));
    ok(`${vp.id}: disclaimers present`, state.disclaimers >= 6, `count=${state.disclaimers}`);
    ok(`${vp.id}: badges rendered`, state.badges >= 3, `count=${state.badges}`);
    ok(`${vp.id}: headlines rendered`, state.headlines >= 2, `count=${state.headlines}`);
    ok(`${vp.id}: no horizontal overflow`, !state.overflow);
    ok(`${vp.id}: insights preserved`, state.insights);
    ok(`${vp.id}: no page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join("; "));

    const shot = join(SCREENSHOT_DIR, `executive-polish-${vp.id}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    ok(`${vp.id}: screenshot saved`, true, shot.replace(ROOT + "\\", "").replace(ROOT + "/", ""));

    await context.close();
  }
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.pass).length;
writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_8_BROWSER_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.8",
      title: "PATCH B.8 — Browser Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      base_url: BASE,
      screenshots_dir: "docs/analytics/evidence/patch-b8-browser",
      diagnostics,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

console.log(`\nResult: ${passed}/${checks.length}\n`);
process.exit(checks.length - passed ? 1 : 0);
