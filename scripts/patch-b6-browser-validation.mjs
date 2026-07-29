#!/usr/bin/env node
/**
 * PATCH B.6 — Browser validation (desktop / tablet / mobile).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_BASE = process.env.PATCH_B6_PROD_BASE_URL || "https://economia-ai.vercel.app";
const BASE =
  process.env.PATCH_B6_BROWSER_BASE_URL ||
  (process.env.PATCH_B6_BROWSER_USE_PROD === "1" ? PROD_BASE : "http://localhost:3022");
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || loadEnvLocalAdminKey();
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-b6-browser");
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
  return page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll("section[id]")).map((el) => el.id);
    const commercialIdx = sections.indexOf("mod-performance-comercial");
    const operationalIdx = sections.indexOf("mod-indicadores-operacionais");
    const insightsIdx = sections.findIndex((id) => id.includes("insight") || id.includes("executive-insight"));
    return {
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      gate: Boolean(document.querySelector(".founder-cockpit-page--gate")),
      fetchError: document.body.textContent.includes("temporariamente indispon"),
      filterError: document.body.textContent.includes("Filtros inválidos"),
      executiveKpis: Boolean(document.querySelector(".founder-executive-kpis")),
      executiveGrowth: Boolean(document.querySelector(".founder-executive-growth")),
      productHealth: Boolean(document.querySelector(".founder-executive-product-health")),
      commercial: Boolean(document.querySelector(".founder-executive-commercial")),
      operational: Boolean(document.querySelector(".founder-executive-operational")),
      operationalHeadline: document.querySelector(".founder-executive-operational-headline")?.textContent?.trim() ?? null,
      operationalItems: document.querySelectorAll(".founder-executive-operational-item").length,
      operationalBadges: document.querySelectorAll(".founder-executive-operational .founder-executive-badge").length,
      insights: Boolean(document.querySelector(".founder-insights-section")),
      kpiStrip: Boolean(document.querySelector(".founder-kpi-strip")),
      sectionOrder: { commercialIdx, operationalIdx, insightsIdx, sections },
      pageErrors: window.__FOUNDER_PAGE_ERRORS__ ?? [],
    };
  });
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

    if (lastState.gate) {
      return { ok: false, reason: "login_gate", state: lastState, attempt };
    }
    if (lastState.filterError) {
      return { ok: false, reason: "filter_error", state: lastState, attempt };
    }
    if (lastState.executiveKpis && lastState.operational) {
      return { ok: true, reason: "ready", state: lastState, attempt };
    }
    if (lastState.fetchError && attempt < MAX_SSR_RETRIES) {
      await sleep(2500);
      continue;
    }
    return {
      ok: false,
      reason: lastState.fetchError ? "ssr_fetch_error" : "operational_section_missing",
      state: lastState,
      attempt,
    };
  }
  return { ok: false, reason: "ssr_retries_exhausted", state: lastState, attempt: MAX_SSR_RETRIES };
}

console.log(`\nPATCH B.6 — browser validation (${BASE})\n`);

if (!ADMIN_KEY) {
  ok("admin key present", false, "MIA_ADMIN_API_KEY required");
  writeFileSync(
    join(ROOT, "docs/analytics/PATCH_B_6_BROWSER_EVIDENCE.json"),
    JSON.stringify({ patch: "B.6", status: "SKIPPED", reason: "no admin key" }, null, 2)
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
  const probeContext = await browser.newContext();
  const probeAuth = await authenticateContext(probeContext);
  ok("auth endpoint", probeAuth.ok, String(probeAuth.status));
  await probeContext.close();

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);

    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));

    const auth = await authenticateContext(context);
    ok(`${vp.id}: auth in context`, auth.ok, String(auth.status));
    if (!auth.ok) {
      await context.close();
      continue;
    }

    const load = await loadAuthenticatedCockpit(page);
    ok(
      `${vp.id}: cockpit SSR ready`,
      load.ok,
      load.ok ? `attempt=${load.attempt}` : `${load.reason} attempt=${load.attempt}`
    );

    if (!load.ok) {
      await context.close();
      continue;
    }

    await page.waitForFunction(
      () => document.querySelectorAll(".founder-executive-operational-item").length >= 6,
      { timeout: 120000 }
    );

    const state = await readDomState(page);
    ok(`${vp.id}: B.2 KPIs preserved`, state.executiveKpis);
    ok(`${vp.id}: B.3 growth preserved`, state.executiveGrowth);
    ok(`${vp.id}: B.4 product health preserved`, state.productHealth);
    ok(`${vp.id}: B.5 commercial preserved`, state.commercial);
    ok(`${vp.id}: B.6 operational visible`, state.operational);
    ok(`${vp.id}: operational headline rendered`, Boolean(state.operationalHeadline), state.operationalHeadline ?? "");
    ok(`${vp.id}: operational indicator items`, state.operationalItems >= 6, `items=${state.operationalItems}`);
    ok(`${vp.id}: operational badges rendered`, state.operationalBadges >= 1, `badges=${state.operationalBadges}`);
    ok(
      `${vp.id}: layout order commercial→operational→insights`,
      state.sectionOrder.commercialIdx >= 0 &&
        state.sectionOrder.operationalIdx > state.sectionOrder.commercialIdx &&
        (state.sectionOrder.insightsIdx < 0 || state.sectionOrder.insightsIdx > state.sectionOrder.operationalIdx),
      JSON.stringify(state.sectionOrder)
    );
    ok(`${vp.id}: insights section present`, state.insights);
    ok(`${vp.id}: legacy KPI strip preserved`, state.kpiStrip);
    ok(`${vp.id}: no page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join("; "));

    const shot = join(SCREENSHOT_DIR, `executive-operational-${vp.id}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    ok(`${vp.id}: screenshot saved`, true, shot.replace(ROOT + "\\", "").replace(ROOT + "/", ""));

    await context.close();
  }
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.pass).length;
writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_6_BROWSER_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.6",
      title: "PATCH B.6 — Browser Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      base_url: BASE,
      screenshots_dir: "docs/analytics/evidence/patch-b6-browser",
      diagnostics,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

console.log(`\nResult: ${passed}/${checks.length}\n`);
process.exit(checks.length - passed ? 1 : 0);
