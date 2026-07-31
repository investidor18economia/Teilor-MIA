#!/usr/bin/env node
/**
 * PATCH 5.2 — Production UI validation via /app-mia (Playwright)
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-52");
mkdirSync(OUT, { recursive: true });

const URL = process.env.MIA_UI_BASE || "https://economia-ai.vercel.app/app-mia";
const HEALTH = "https://economia-ai.vercel.app/api/health";

const CASES = [
  { id: "UI01", msg: "Oi", family: "greeting" },
  { id: "UI02", msg: "Oi, MIA", family: "greeting_then_b2_setup" },
  { id: "UI03", msg: "Linda", family: "b2_turn2", requiresPrior: true },
  { id: "UI04", msg: "Quero um Galaxy A55", family: "b1_setup" },
  { id: "UI05", msg: "Bonito demais", family: "b1_turn2", requiresPrior: true },
  { id: "UI06", msg: "Quem é você?", family: "about_mia", fresh: true },
  { id: "UI07", msg: "Quero um celular até 2000", family: "commercial", fresh: true },
  { id: "UI08", msg: "Compare iPhone 13 com Galaxy A55", family: "comparison", fresh: true },
  { id: "UI09", msg: "Você é ótima, mas quero um celular", family: "mixed", fresh: true },
  { id: "UI10", msg: "Show", family: "short", fresh: true },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendUiMessage(page, text) {
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
    { timeout: 120000 }
  );
  await page.locator(".mia-input").fill(text);
  await page.locator(".send-btn").click();
  const resp = await responsePromise;
  const data = await resp.json().catch(() => ({}));
  await page
    .waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), {
      timeout: 120000,
    })
    .catch(() => {});
  await sleep(1500);
  const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  const displayText = String(bubbleText || data?.reply || "").trim();
  const leaksJson =
    displayText.includes("pipelineTrace") ||
    displayText.includes("universal_conversation") ||
    displayText.includes('"mia_debug"');
  return {
    status: resp.status(),
    displayText: displayText.slice(0, 200),
    display_empty: !displayText,
    response_path: data?.latency_analytics?.response_path || null,
    has_mia_debug_in_payload: !!data?.mia_debug,
    leaks_internal_json: leaksJson,
    approved: resp.status() === 200 && !leaksJson && !data?.mia_debug,
  };
}

const health = await (await fetch(HEALTH)).json();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];
let priorLoaded = false;

for (const c of CASES) {
  try {
    if (c.fresh || !priorLoaded) {
      await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForSelector(".mia-input", { timeout: 45000 });
      priorLoaded = c.id === "UI02" || c.id === "UI04";
    }
    const r = await sendUiMessage(page, c.msg);
    results.push({ id: c.id, msg: c.msg, family: c.family, ...r });
  } catch (err) {
    results.push({ id: c.id, msg: c.msg, family: c.family, error: err.message, approved: false });
  }
  await sleep(2000);
}

await browser.close();

const payload = {
  patch: "5.2-closure-production-ui",
  timestamp: new Date().toISOString(),
  url: URL,
  build: health.build,
  scenarios: results,
  summary: {
    total: results.length,
    approved: results.filter((r) => r.approved).length,
    http_200: results.filter((r) => r.status === 200).length,
    no_debug_leak: results.every((r) => !r.has_mia_debug_in_payload && !r.leaks_internal_json),
  },
};

writeFileSync(join(OUT, "PATCH_52_PRODUCTION_UI_VALIDATION.json"), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload.summary, null, 2));
process.exit(results.every((r) => r.approved) ? 0 : 1);
