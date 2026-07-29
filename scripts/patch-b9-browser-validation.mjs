#!/usr/bin/env node
/**
 * PATCH B.9 — Phase B final browser validation (desktop / tablet / mobile).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { EXECUTIVE_SECTION_ORDER } from "../lib/miaFounderExecutivePolishCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_BASE = process.env.PATCH_B9_PROD_BASE_URL || "https://economia-ai.vercel.app";
const BASE =
  process.env.PATCH_B9_BROWSER_BASE_URL ||
  (process.env.PATCH_B9_BROWSER_USE_PROD === "1" ? PROD_BASE : "http://localhost:3024");
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || loadEnvLocalAdminKey();
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/phase-b-final");
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
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      gate: Boolean(document.querySelector(".founder-cockpit-page--gate")),
      fetchError: document.body.textContent.includes("temporariamente indispon"),
      filterError: document.body.textContent.includes("Filtros inválidos"),
      executiveModules: document.querySelectorAll(".founder-executive-module").length,
      kpis: Boolean(document.querySelector(".founder-executive-kpis.founder-executive-module")),
      growth: Boolean(document.querySelector(".founder-executive-growth.founder-executive-module")),
      health: Boolean(document.querySelector(".founder-executive-product-health.founder-executive-module")),
      commercial: Boolean(document.querySelector(".founder-executive-commercial.founder-executive-module")),
      operational: Boolean(document.querySelector(".founder-executive-operational.founder-executive-module")),
      summary: Boolean(document.querySelector(".founder-executive-summary.founder-executive-module")),
      summaryHeadline: Boolean(document.querySelector(".founder-executive-summary-headline")),
      summaryPriorities: document.querySelectorAll(".founder-executive-summary-block--priorities .founder-executive-summary-list-item").length,
      summaryOpportunities: document.querySelectorAll(".founder-executive-summary-block--opportunities .founder-executive-summary-list-item").length,
      summaryRisks: document.querySelectorAll(".founder-executive-summary-block--risks .founder-executive-summary-list-item").length,
      insights: Boolean(document.querySelector(".founder-insights-section")),
      filters: Boolean(document.querySelector(".founder-cockpit-filters")),
      kpiStrip: Boolean(document.querySelector(".founder-kpi-strip")),
      badges: document.querySelectorAll(".founder-executive-badge").length,
      disclaimers: document.querySelectorAll(".founder-executive-module .founder-module-disclaimer").length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      sections,
      indices,
      orderOk: monotonic,
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
    diagnostics.push({ attempt, viewport: page.viewportSize(), ...lastState });
    if (lastState.gate) return { ok: false, reason: "login_gate", state: lastState, attempt };
    if (lastState.filterError) return { ok: false, reason: "filter_error", state: lastState, attempt };
    if (lastState.fetchError && attempt < MAX_SSR_RETRIES) {
      await sleep(2500);
      continue;
    }
    if (lastState.fetchError) return { ok: false, reason: "ssr_fetch_error", state: lastState, attempt };
    if (lastState.executiveModules >= 6 && lastState.summary) {
      return { ok: true, reason: "ready", state: lastState, attempt };
    }
    await sleep(2500);
  }
  return { ok: false, reason: "modules_incomplete", state: lastState, attempt: MAX_SSR_RETRIES };
}

console.log(`\nPATCH B.9 — Phase B browser validation (${BASE})\n`);

if (!ADMIN_KEY) {
  writeFileSync(
    join(ROOT, "docs/analytics/PHASE_B_BROWSER_FINAL_EVIDENCE.json"),
    JSON.stringify({ patch: "B.9", status: "SKIPPED", reason: "no admin key" }, null, 2)
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

    const load = await loadAuthenticatedCockpit(page);
    ok(`${vp.id}: SSR cockpit loaded`, load.ok, load.ok ? `attempt=${load.attempt}` : load.reason);

    if (load.ok) {
      await page.waitForFunction(
        () => document.querySelectorAll(".founder-executive-module").length >= 6,
        { timeout: 120000 }
      );
    }

    const state = load.state ?? (await readDomState(page));
    ok(`${vp.id}: 6 executive modules`, state.executiveModules >= 6, `count=${state.executiveModules}`);
    ok(`${vp.id}: B.2 KPIs`, state.kpis);
    ok(`${vp.id}: B.3 growth`, state.growth);
    ok(`${vp.id}: B.4 product health`, state.health);
    ok(`${vp.id}: B.5 commercial`, state.commercial);
    ok(`${vp.id}: B.6 operational`, state.operational);
    ok(`${vp.id}: B.7 summary`, state.summary);
    ok(`${vp.id}: B.7 headline`, state.summaryHeadline);
    ok(`${vp.id}: B.7 priorities block`, state.summaryPriorities >= 0, `items=${state.summaryPriorities}`);
    ok(`${vp.id}: insights section`, state.insights);
    ok(`${vp.id}: section order`, state.orderOk, JSON.stringify(state.indices));
    ok(`${vp.id}: B.8 disclaimers`, state.disclaimers >= 6, `count=${state.disclaimers}`);
    ok(`${vp.id}: filters preserved`, state.filters);
    ok(`${vp.id}: no horizontal overflow`, !state.overflow);
    ok(`${vp.id}: no page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join("; "));

    const shot = join(SCREENSHOT_DIR, `phase-b-final-${vp.id}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    ok(`${vp.id}: screenshot saved`, true, shot.replace(ROOT + "\\", "").replace(ROOT + "/", ""));

    await context.close();
  }
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.pass).length;
writeFileSync(
  join(ROOT, "docs/analytics/PHASE_B_BROWSER_FINAL_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.9",
      title: "PATCH B.9 — Phase B Browser Final Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      base_url: BASE,
      screenshots_dir: "docs/analytics/evidence/phase-b-final",
      diagnostics,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

console.log(`\nResult: ${passed}/${checks.length}\n`);
process.exit(checks.length - passed ? 1 : 0);
