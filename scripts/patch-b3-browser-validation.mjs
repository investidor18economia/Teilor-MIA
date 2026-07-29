#!/usr/bin/env node
/**
 * PATCH B.3 — Browser validation (desktop / tablet / mobile).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_BASE = process.env.PATCH_B3_PROD_BASE_URL || "https://economia-ai.vercel.app";
const BASE =
  process.env.PATCH_B3_BROWSER_BASE_URL ||
  (process.env.PATCH_B3_BROWSER_USE_PROD === "1" ? PROD_BASE : "http://localhost:3018");
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || loadEnvLocalAdminKey();
const SCREENSHOT_DIR = join(ROOT, "docs/analytics/evidence/patch-b3-browser");
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
  return page.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent?.trim() ?? null,
    gate: Boolean(document.querySelector(".founder-cockpit-page--gate")),
    fetchError: document.body.textContent.includes("temporariamente indispon"),
    filterError: document.body.textContent.includes("Filtros inválidos"),
    executiveKpis: Boolean(document.querySelector(".founder-executive-kpis")),
    executiveGrowth: Boolean(document.querySelector(".founder-executive-growth")),
    growthHeadline: document.querySelector(".founder-executive-growth-headline")?.textContent?.trim() ?? null,
    growthItems: document.querySelectorAll(".founder-executive-growth-item").length,
    growthBadges: document.querySelectorAll(".founder-executive-growth .founder-executive-badge").length,
    insights: Boolean(document.querySelector(".founder-insights-section")),
    kpiStrip: Boolean(document.querySelector(".founder-kpi-strip")),
  }));
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
    if (lastState.executiveKpis && lastState.executiveGrowth) {
      return { ok: true, reason: "ready", state: lastState, attempt };
    }
    if (lastState.fetchError && attempt < MAX_SSR_RETRIES) {
      await sleep(2500);
      continue;
    }
    return {
      ok: false,
      reason: lastState.fetchError ? "ssr_fetch_error" : "growth_section_missing",
      state: lastState,
      attempt,
    };
  }
  return { ok: false, reason: "ssr_retries_exhausted", state: lastState, attempt: MAX_SSR_RETRIES };
}

console.log(`\nPATCH B.3 — browser validation (${BASE})\n`);

if (!ADMIN_KEY) {
  ok("admin key present", false, "MIA_ADMIN_API_KEY required");
  writeFileSync(
    join(ROOT, "docs/analytics/PATCH_B_3_BROWSER_EVIDENCE.json"),
    JSON.stringify({ patch: "B.3", status: "SKIPPED", reason: "no admin key" }, null, 2)
  );
  process.exit(1);
}

if (BASE.includes("localhost:3018")) {
  console.log(
    "Note: local SSR fetches executive-metrics from PUBLIC_METRICS_API_BASE_URL / NEXT_PUBLIC_SITE_URL / http://localhost:3000 — ensure that target matches your running server.\n"
  );
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
      () => document.querySelectorAll(".founder-executive-growth-item").length >= 6,
      { timeout: 120000 }
    );

    const state = await readDomState(page);
    ok(`${vp.id}: B.2 KPIs preserved`, state.executiveKpis);
    ok(`${vp.id}: B.3 growth section visible`, state.executiveGrowth);
    ok(`${vp.id}: growth headline rendered`, Boolean(state.growthHeadline), state.growthHeadline ?? "");
    ok(`${vp.id}: growth indicator items`, state.growthItems >= 6, `items=${state.growthItems}`);
    ok(`${vp.id}: growth badges rendered`, state.growthBadges >= 1, `badges=${state.growthBadges}`);
    ok(`${vp.id}: insights below growth`, state.insights);
    ok(`${vp.id}: legacy KPI strip preserved`, state.kpiStrip);

    const shot = join(SCREENSHOT_DIR, `executive-growth-${vp.id}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    ok(`${vp.id}: screenshot saved`, true, shot.replace(ROOT + "\\", "").replace(ROOT + "/", ""));

    await context.close();
  }
} finally {
  await browser.close();
}

const passed = checks.filter((c) => c.pass).length;
writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_3_BROWSER_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.3",
      title: "PATCH B.3 — Browser Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      base_url: BASE,
      screenshots_dir: "docs/analytics/evidence/patch-b3-browser",
      diagnostics,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

console.log(`\nResult: ${passed}/${checks.length}\n`);
process.exit(checks.length - passed ? 1 : 0);
