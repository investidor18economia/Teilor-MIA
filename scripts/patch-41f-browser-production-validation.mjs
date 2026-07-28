#!/usr/bin/env node
/**
 * PATCH 4.1F — Browser validation (REAL / production)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createBrowserSession,
  runLongConversation,
  runUiScenarioSuite,
  runVisualIntegrityChecks,
  writeJson,
} from "./patch-41f-browser-e2e-scenarios.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PRODUCTION_BASE = process.env.PATCH41F_PRODUCTION_BASE_URL || "https://economia-ai.vercel.app";
const DELAY = Number(process.env.PATCH41F_BROWSER_DELAY_MS || 7000);
const SCREENSHOT_DIR = path.join(
  ROOT,
  "docs/conversational/audits/phase-4/evidence/patch-4-1f/production"
);
const EVIDENCE = path.join(
  ROOT,
  "docs/conversational/audits/phase-4/evidence/PATCH_4_1F_PRODUCTION_BROWSER_E2E_EVIDENCE.json"
);

const { chromium } = await import("playwright");
const health = await (await fetch(`${PRODUCTION_BASE}/api/health`)).json().catch(() => null);
if (!health) {
  console.error("Production /api/health unavailable");
  process.exit(1);
}

console.log(`PATCH 4.1F PRODUCTION browser validation: ${PRODUCTION_BASE}/app-mia`);

async function runIsolated(label, runner) {
  const session = createBrowserSession({
    chromium,
    baseUrl: PRODUCTION_BASE,
    screenshotDir: path.join(SCREENSHOT_DIR, label),
    delayMs: DELAY,
    headless: true,
  });
  const { browser, page } = await session.launch();
  const traceDir = path.join(SCREENSHOT_DIR, label, "trace");
  fs.mkdirSync(traceDir, { recursive: true });
  await page.context().tracing.start({ screenshots: true, snapshots: true });
  try {
    await runner(session, page);
    await page.context().tracing.stop({ path: path.join(traceDir, `${label}-success.zip`) });
  } catch (error) {
    session.recordCheck("ui-fatal-error", false, error.message);
    await page.context().tracing.stop({ path: path.join(traceDir, `${label}-failure.zip`) });
    await browser.close();
    throw error;
  }
  await browser.close();
  return session;
}

const longSession = await runIsolated("long-conversation", async (session, page) => {
  await runLongConversation(session, page, { delayMs: Math.max(DELAY, 8000) });
});

console.log("Cooldown 60s between isolated browser flows...");
await new Promise((resolve) => setTimeout(resolve, 60000));

const scenarioSession = createBrowserSession({
  chromium,
  baseUrl: PRODUCTION_BASE,
  screenshotDir: SCREENSHOT_DIR,
  delayMs: DELAY,
  headless: true,
});
const { browser, page } = await scenarioSession.launch();
const traceDir = path.join(SCREENSHOT_DIR, "trace");
fs.mkdirSync(traceDir, { recursive: true });
await page.context().tracing.start({ screenshots: true, snapshots: true });

try {
  const activePage = await runUiScenarioSuite(scenarioSession, page, { delayMs: Math.max(DELAY, 7000) });
  await runVisualIntegrityChecks(scenarioSession, activePage);
} catch (error) {
  scenarioSession.recordCheck("ui-fatal-error", false, error.message);
  await page.context().tracing.stop({ path: path.join(traceDir, "scenarios-failure.zip") });
  await browser.close();
  throw error;
}

await page.context().tracing.stop({ path: path.join(traceDir, "scenarios-success.zip") });
await browser.close();

const mergedChecks = [...longSession.checks, ...scenarioSession.checks];
const mergedFlows = [...longSession.flows, ...scenarioSession.flows];
const mergedScreenshots = [...longSession.screenshots, ...scenarioSession.screenshots];
const mergedConsoleErrors = [...longSession.consoleErrors, ...scenarioSession.consoleErrors];
const mergedNetworkErrors = [...longSession.networkErrors, ...scenarioSession.networkErrors];

let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const passed = mergedChecks.filter((entry) => entry.pass).length;
const evidence = {
  patch: "4.1F",
  phase: "production_browser_e2e",
  status: passed === mergedChecks.length ? "APPROVED" : "REJECTED",
  base_url: PRODUCTION_BASE,
  mia_url: `${PRODUCTION_BASE}/app-mia`,
  commit,
  deploy_build: health?.build || null,
  health,
  finished_at: new Date().toISOString(),
  isolated_flows: ["long-conversation", "ui-scenarios"],
  cooldown_ms: 60000,
  checks: mergedChecks,
  flows: mergedFlows,
  console_errors: mergedConsoleErrors.slice(0, 40),
  network_errors: mergedNetworkErrors,
  screenshots: mergedScreenshots,
  trace: traceDir,
  summary: {
    total: mergedChecks.length,
    passed,
    failed: mergedChecks.length - passed,
  },
};

writeJson(EVIDENCE, evidence);
console.log(`\nPATCH 4.1F PRODUCTION browser: ${passed}/${mergedChecks.length} passed`);
console.log(`Evidence: ${EVIDENCE}`);
process.exit(passed === mergedChecks.length ? 0 : 1);
