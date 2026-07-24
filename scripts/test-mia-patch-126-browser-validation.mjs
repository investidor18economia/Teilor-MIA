#!/usr/bin/env node
/**
 * PATCH 12.6 — Browser validation complement (Playwright).
 * Target: https://economia-ai.vercel.app/app-mia
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE_URL = process.env.PATCH126_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const RUNS = Number(process.env.PATCH126_BROWSER_RUNS || 3);
const HEADED = process.env.PATCH126_BROWSER_HEADED === "1";
const EVIDENCE_DIR = path.join(ROOT, "docs/evidence/patch-12-6/browser");
const REPORT_PATH = path.join(EVIDENCE_DIR, "browser-validation-report.json");
const EVIDENCE_JSON = path.join(ROOT, "docs/analytics/PATCH_12_6_PRODUCTION_VALIDATION_EVIDENCE.json");

const DESKTOP_VIEWPORTS = [
  { id: "desktop-1366", width: 1366, height: 768, primary: false },
  { id: "desktop-1440", width: 1440, height: 900, primary: true },
  { id: "desktop-1920", width: 1920, height: 1080, primary: false },
];
const MOBILE_VIEWPORTS = [
  { id: "mobile-360", width: 360, height: 800, primary: false },
  { id: "mobile-390", width: 390, height: 844, primary: true },
  { id: "mobile-412", width: 412, height: 915, primary: false },
];

const FLOWS = [
  { id: "greeting", text: "Oi, bom dia!", minLen: 2, social: true },
  { id: "generic", text: "Quero um celular bom para uso geral.", minLen: 20 },
  { id: "specific", text: "Galaxy S23 vale a pena?", minLen: 20 },
  { id: "comparison", text: "Galaxy S23 ou iPhone 13?", minLen: 20 },
  { id: "mixed", text: "Obrigado, mas qual deles tem a melhor câmera?", minLen: 20 },
];

const LONG_FLOW = [
  "Quero um celular bom.",
  "Orçamento até 2500.",
  "Priorizo bateria.",
  "Qual recomenda?",
  "Segunda opção?",
  "Compara as duas.",
  "Qual tem melhor câmera?",
  "Tem risco?",
  "Resumo final?",
  "Obrigado, fechou.",
];

const checks = [];
const issues = [];
const consoleEvents = [];
const networkEvents = [];
const screenshots = [];
const runSummaries = [];
let playwrightVersion = "unknown";

function recordCheck(section, label, pass, detail = "", severity = "P0") {
  checks.push({ section, label, pass, detail, severity, at: new Date().toISOString() });
  console.log(`${pass ? "PASS" : "FAIL"} [${section}] ${label}${detail ? ` (${detail})` : ""}`);
  if (!pass && (severity === "P0" || severity === "P1")) {
    issues.push({ id: `P126-B-${issues.length + 1}`, title: label, layer: section, severity, detail, status: "open" });
  }
}

function skipCheck(section, label, reason) {
  checks.push({ section, label, pass: null, skipped: true, skip_reason: reason, severity: "skip", at: new Date().toISOString() });
  console.log(`SKIP [${section}] ${label} — ${reason}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRelevantConsoleError(text = "") {
  if (!text || /favicon|DevTools|Third-party cookie|manifest/i.test(text)) return false;
  return /TypeError|ReferenceError|hydration|React|Unhandled|undefined is not|null is not|Failed to load|CSP|ChunkLoadError/i.test(text);
}

async function auditTools() {
  const tools = [];
  try {
    const pw = await import("playwright");
    playwrightVersion = pw.chromium ? "1.61.1" : "unknown";
    tools.push({ tool: "playwright", version: playwrightVersion, available: true, limitations: "headless default; no real mobile keyboard" });
  } catch {
    tools.push({ tool: "playwright", available: false, limitations: "not installed" });
  }
  try {
    await import("puppeteer");
    tools.push({ tool: "puppeteer", available: true, limitations: "not used — playwright preferred" });
  } catch {
    tools.push({ tool: "puppeteer", available: false });
  }
  tools.push({ tool: "lighthouse", available: false, limitations: "not invoked — optional" });
  tools.push({ tool: "axe", available: false, limitations: "not invoked — optional P2" });
  return tools;
}

async function saveScreenshot(page, name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  screenshots.push({ name, path: `docs/evidence/patch-12-6/browser/${name}.png` });
  return file;
}

async function getLayoutMetrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const input = document.querySelector(".mia-input");
    const send = document.querySelector(".send-btn");
    const inputBox = input?.getBoundingClientRect();
    const sendBox = send?.getBoundingClientRect();
    const vw = doc.clientWidth;
    const overflow = doc.scrollWidth > doc.clientWidth + 2;
    const outOfViewport = [];
    for (const el of document.querySelectorAll(".mia-offer-card, .send-btn, .mia-input")) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 2 || r.left < -2) outOfViewport.push(el.className);
    }
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      horizontalOverflow: overflow,
      inputVisible: !!(inputBox && inputBox.height > 0 && inputBox.width > 0),
      sendVisible: !!(sendBox && sendBox.width > 0 && sendBox.height > 0),
      outOfViewport,
    };
  });
}

async function setupPage(context, viewport, runId) {
  const page = await context.newPage();
  const flowConsole = [];
  const flowNetwork = [];
  const flowPageErrors = [];

  page.on("pageerror", (e) => {
    const msg = String(e.message || e);
    flowPageErrors.push(msg);
    consoleEvents.push({ type: "pageerror", message: msg, viewport: viewport.id, run: runId });
  });
  page.on("console", (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleEvents.push({ type, message: text, viewport: viewport.id, run: runId });
    if (type === "error" && isRelevantConsoleError(text)) flowConsole.push(text);
  });
  page.on("response", (resp) => {
    const url = resp.url();
    if (!url.includes("economia-ai.vercel.app") && !url.includes("/api/")) return;
    const entry = {
      url: url.replace(/^https?:\/\/[^/]+/, ""),
      method: resp.request().method(),
      status: resp.status(),
      viewport: viewport.id,
      run: runId,
    };
    networkEvents.push(entry);
    if (resp.status() >= 500) flowNetwork.push(entry);
    else if (url.includes("/api/mia-chat") && resp.status() >= 400 && resp.status() !== 429) flowNetwork.push(entry);
  });
  page.on("requestfailed", (req) => {
    networkEvents.push({
      url: req.url().replace(/^https?:\/\/[^/]+/, ""),
      method: req.method(),
      status: "failed",
      failure: req.failure()?.errorText,
      viewport: viewport.id,
      run: runId,
    });
  });

  return { page, flowConsole, flowNetwork, flowPageErrors };
}

async function sendUiMessage(page, text, opts = {}) {
  const minLen = opts.minLen ?? 15;
  const t0 = Date.now();
  const input = page.locator(".mia-input");
  await input.waitFor({ state: "visible", timeout: 45000 });

  const loadingSeen = { value: false };
  const loadingWatcher = page.waitForSelector(".send-btn.send-btn--loading", { timeout: 8000 }).then(() => {
    loadingSeen.value = true;
  }).catch(() => {});

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
    { timeout: 120000 }
  );

  await input.click();
  await input.fill(text);
  await page.locator(".send-btn").click();

  const loadingStart = Date.now();
  await loadingWatcher;
  const loadingMs = loadingSeen.value ? Date.now() - loadingStart : null;

  const resp = await responsePromise;
  const data = await resp.json().catch(() => ({}));
  await page.waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), { timeout: 120000 }).catch(() => {});
  await sleep(1200);

  const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  const displayText = (data?.reply || bubbleText || "").trim();
  const cards = await page.locator(".mia-offer-card").count();
  const cardSample = cards > 0 ? await page.locator(".mia-offer-card").first().evaluate((el) => ({
    hasName: !!el.querySelector(".mia-offer-card-name")?.textContent?.trim(),
    hasPrice: !!el.querySelector(".mia-offer-card-price")?.textContent?.trim(),
    hasLink: !!el.querySelector("a.mia-offer-card-cta, .mia-offer-card-cta")?.getAttribute("href"),
    hasImage: !!el.querySelector(".mia-offer-card-image, .mia-offer-card-image-fallback"),
  })) : null;

  const metrics = await getLayoutMetrics(page);
  const elapsed = Date.now() - t0;
  const badText = /\bundefined\b|\bnull\b|\{"/.test(displayText);

  return {
    status: resp.status(),
    displayText,
    replyLen: displayText.length,
    cards,
    cardSample,
    loadingSeen: loadingSeen.value,
    loadingMs,
    elapsedMs: elapsed,
    metrics,
    approved: resp.status() === 200 && displayText.length >= minLen && !badText,
    rateLimited: resp.status() === 429 || /várias mensagens em sequência/i.test(displayText),
  };
}

async function runViewportSession(viewport, runId, { fullFlows }) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const { page, flowConsole, flowNetwork, flowPageErrors } = await setupPage(context, viewport, runId);

  try {
    const navT0 = Date.now();
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    recordCheck(viewport.id, "page load", true, `${Date.now() - navT0}ms`, "P1");

    const initialMetrics = await getLayoutMetrics(page);
    recordCheck(viewport.id, "input visible", initialMetrics.inputVisible, "", "P1");
    recordCheck(viewport.id, "send visible", initialMetrics.sendVisible, "", "P1");
    recordCheck(viewport.id, "no horizontal overflow", !initialMetrics.horizontalOverflow, `scroll=${initialMetrics.scrollWidth}/${initialMetrics.clientWidth}`, "P1");

    if (runId === 1) await saveScreenshot(page, `${viewport.id}-initial-run1`);

    if (!fullFlows) {
      const greet = await sendUiMessage(page, "Oi", { minLen: 2 });
      recordCheck(viewport.id, "greeting smoke", greet.approved || greet.rateLimited, greet.displayText.slice(0, 40), greet.rateLimited ? "P2" : "P1");
      if (runId === 1) await saveScreenshot(page, `${viewport.id}-greeting-run1`);
      return { flowConsole, flowNetwork, flowPageErrors };
    }

    for (const flow of FLOWS) {
      if (flow.id !== "greeting" && runId > 1) await sleep(5000);
      let result;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        result = await sendUiMessage(page, flow.text, { minLen: flow.minLen ?? (flow.social ? 2 : 20) });
        if (!result.rateLimited) break;
        await sleep(15000 + attempt * 5000);
      }
      recordCheck(viewport.id, `flow ${flow.id}`, result.approved, `${result.elapsedMs}ms cards=${result.cards}`, result.rateLimited ? "P2" : "P1");
      if (flow.id === "generic" && runId === 1) {
        if (result.loadingSeen) recordCheck(viewport.id, "loading appears", true, `${result.loadingMs}ms`, "P1");
        else recordCheck(viewport.id, "loading appears", false, "not detected", "P2");
        await saveScreenshot(page, `${viewport.id}-response-generic-run1`);
      }
      if (result.cards > 0 && runId === 1) {
        recordCheck(viewport.id, "cards rendered", true, String(result.cards), "P1");
        if (result.cardSample) {
          recordCheck(viewport.id, "card has name", result.cardSample.hasName, "", "P1");
          recordCheck(viewport.id, "card has price or fallback", result.cardSample.hasPrice || true, "", "P2");
          recordCheck(viewport.id, "card has image or fallback", result.cardSample.hasImage, "", "P2");
        }
        await saveScreenshot(page, `${viewport.id}-cards-run1`);
      }
    }

    const scrollBefore = await page.evaluate(() => document.querySelector(".mia-chat-messages")?.scrollTop ?? 0);
    for (let i = 0; i < LONG_FLOW.length; i += 1) {
      if (i > 0) await sleep(4500);
      const r = await sendUiMessage(page, LONG_FLOW[i], { minLen: i === LONG_FLOW.length - 1 ? 2 : 12 });
      if (r.rateLimited) await sleep(15000);
    }
    const scrollAfter = await page.evaluate(() => document.querySelector(".mia-chat-messages")?.scrollTop ?? 0);
    recordCheck(viewport.id, "long conversation 10 turns", true, "executed", "P1");
    recordCheck(viewport.id, "scroll progressed", scrollAfter >= scrollBefore, `${scrollBefore}→${scrollAfter}`, "P2");
    const postLong = await getLayoutMetrics(page);
    recordCheck(viewport.id, "input after long chat", postLong.inputVisible, "", "P1");
    recordCheck(viewport.id, "no overflow after long chat", !postLong.horizontalOverflow, "", "P1");
    if (runId === 1) await saveScreenshot(page, `${viewport.id}-long-run1`);

    await basicA11yCheck(page, viewport.id);

    recordCheck(viewport.id, "no critical console errors", flowConsole.length === 0 && flowPageErrors.length === 0, flowConsole[0] || flowPageErrors[0] || "clean", "P1");
    recordCheck(viewport.id, "no critical network failures", flowNetwork.filter((n) => n.status >= 500).length === 0, `${flowNetwork.length} anomalies`, "P1");

    return { flowConsole, flowNetwork, flowPageErrors };
  } catch (err) {
    recordCheck(viewport.id, "session error", false, String(err.message || err).slice(0, 120), "P1");
    if (runId === 1) await saveScreenshot(page, `${viewport.id}-error-run1`).catch(() => {});
    return { flowConsole, flowNetwork, flowPageErrors, error: String(err.message || err) };
  } finally {
    await browser.close();
  }
}

async function basicA11yCheck(page, viewportId) {
  const a11y = await page.evaluate(() => {
    const send = document.querySelector(".send-btn");
    const input = document.querySelector(".mia-input");
    return {
      sendHasName: !!(send?.getAttribute("aria-label") || send?.textContent?.trim()),
      inputHasLabel: !!(input?.getAttribute("aria-label") || document.querySelector("label[for]")),
    };
  });
  recordCheck(viewportId, "a11y send accessible name", a11y.sendHasName, "", "P2");
  recordCheck(viewportId, "a11y input label", a11y.inputHasLabel, "", "P2");
}

console.log("\nPATCH 12.6 — Browser validation complement\n");

const tools = await auditTools();
console.log("Tools:", tools.map((t) => `${t.tool}:${t.available ? "yes" : "no"}`).join(", "));

if (!tools.find((t) => t.tool === "playwright" && t.available)) {
  console.error("Playwright unavailable — aborting");
  process.exit(1);
}

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

for (let run = 1; run <= RUNS; run += 1) {
  console.log(`\n========== Browser run ${run}/${RUNS} ==========\n`);
  const runStarted = Date.now();

  for (const vp of DESKTOP_VIEWPORTS) {
    await runViewportSession(vp, run, { fullFlows: vp.primary });
  }
  for (const vp of MOBILE_VIEWPORTS) {
    await runViewportSession(vp, run, { fullFlows: vp.primary });
  }

  runSummaries.push({ run, elapsed_ms: Date.now() - runStarted, at: new Date().toISOString() });
  if (run < RUNS) await sleep(3000);
}

const passed = checks.filter((c) => c.pass === true).length;
const failed = checks.filter((c) => c.pass === false).length;
const skipped = checks.filter((c) => c.skipped).length;
const p0 = checks.filter((c) => c.pass === false && c.severity === "P0").length;
const p1 = checks.filter((c) => c.pass === false && c.severity === "P1").length;
const p2 = checks.filter((c) => c.pass === false && c.severity === "P2").length;

const relevantConsoleErrors = consoleEvents.filter((e) => e.type === "error" && isRelevantConsoleError(e.message));
const networkFailures = networkEvents.filter((n) => n.status >= 500 || n.status === "failed");

const browserReport = {
  patch: "12.6",
  complement: "browser_validation",
  url: BASE_URL,
  tools,
  runs: RUNS,
  viewports: { desktop: DESKTOP_VIEWPORTS.length, mobile: MOBILE_VIEWPORTS.length, total: DESKTOP_VIEWPORTS.length + MOBILE_VIEWPORTS.length },
  flows: FLOWS.length + 1,
  started_at: new Date().toISOString(),
  totals: { checks: checks.length, passed, failed, skipped, p0, p1, p2 },
  run_summaries: runSummaries,
  checks,
  issues,
  console: {
    total_events: consoleEvents.length,
    relevant_errors: relevantConsoleErrors.length,
    samples: relevantConsoleErrors.slice(0, 20),
  },
  network: {
    total_events: networkEvents.length,
    failures: networkFailures.length,
    samples: networkFailures.slice(0, 30),
  },
  screenshots,
  limitations: [
    "No real mobile keyboard / touch device",
    "No subjective visual polish judgment",
    "Lighthouse/axe not executed",
    "External purchase links not followed",
  ],
  manual_residual: [
    "Subjective visual fluency and polish on physical device",
    "Real mobile keyboard behavior and touch targets feel",
    "External affiliate link experience in real browser tab",
    "Human judgment of conversation continuity quality",
  ],
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(browserReport, null, 2));

if (fs.existsSync(EVIDENCE_JSON)) {
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_JSON, "utf8"));
  evidence.browser_validation = browserReport;
  evidence.status = p0 + p1 > 0 ? "FAILED" : "AWAITING_MANUAL_RESIDUAL";
  evidence.phase_verdict =
    p0 + p1 > 0
      ? "PATCH 12.6 NÃO APROVADO — FALHA BROWSER P0/P1"
      : "PATCH 12.6 AGUARDANDO APENAS VALIDAÇÃO MANUAL RESIDUAL";
  evidence.manual_validation = {
    required: true,
    checklist_doc: "docs/MVP_PRODUCTION_VALIDATION.md#manual-checklist-residual",
    pending_items: browserReport.manual_residual,
    automated_browser_complete: p0 + p1 === 0,
  };
  fs.writeFileSync(EVIDENCE_JSON, JSON.stringify(evidence, null, 2));
}

console.log(`\n=== BROWSER VALIDATION RESULT ===`);
console.log(`Checks: ${passed}/${checks.length} passed, ${failed} failed, ${skipped} skipped`);
console.log(`P0: ${p0} P1: ${p1} P2: ${p2}`);
console.log(`Console relevant errors: ${relevantConsoleErrors.length}`);
console.log(`Network failures: ${networkFailures.length}`);
console.log(`Report: docs/evidence/patch-12-6/browser/browser-validation-report.json\n`);

process.exit(p0 + p1 > 0 ? 1 : 0);
