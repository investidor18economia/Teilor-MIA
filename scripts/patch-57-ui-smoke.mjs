#!/usr/bin/env node
/** PATCH 5.7 — Production UI smoke (Playwright) */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57");
mkdirSync(OUT, { recursive: true });

const UI = "https://economia-ai.vercel.app/app-mia";

const { measureVerbalizationQuality } = await import(
  pathToFileURL(join(ROOT, "lib/miaConversationalObservability.js")).href
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendTurn(page, text) {
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
    { timeout: 120000 }
  );
  await page.locator(".mia-input").fill(text);
  await page.locator(".send-btn").click();
  const resp = await responsePromise;
  const data = await resp.json().catch(() => ({}));
  await sleep(2000);
  const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  const reply = String(data?.reply || bubbleText || "").trim();
  return { status: resp.status(), reply, response_path: data?.latency_analytics?.response_path || null };
}

const scenarios = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function freshSession() {
  await page.goto(`${UI}?v=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await sleep(800);
}

await freshSession();
const oi = await sendTurn(page, "oi");
scenarios.push({ id: "ui_oi", ...oi, quality: measureVerbalizationQuality(oi.reply, {}).overall, cold: /me diz rapidinho/i.test(oi.reply) });

await freshSession();
const show = await sendTurn(page, "show");
scenarios.push({ id: "ui_show", ...show, quality: measureVerbalizationQuality(show.reply, {}).overall, cold: /me diz rapidinho/i.test(show.reply) });

await freshSession();
await sendTurn(page, "oi");
await sleep(1500);
const seca = await sendTurn(page, "seca");
scenarios.push({ id: "ui_seca_multiturn", ...seca, quality: measureVerbalizationQuality(seca.reply, {}).overall, cold: /me diz rapidinho/i.test(seca.reply) });

await freshSession();
const commercial = await sendTurn(page, "Quero um celular até 2000");
scenarios.push({ id: "ui_commercial", ...commercial, commercialOk: !/me diz rapidinho|fico por aqui no papo/i.test(commercial.reply) && commercial.reply.length > 20 });

await browser.close();

const summary = {
  patch: "5.7",
  timestamp: new Date().toISOString(),
  scenarios,
  metrics: {
    coldClarification: scenarios.filter((s) => s.cold).length,
    avgQuality: scenarios.filter((s) => s.quality).reduce((a, s) => a + s.quality, 0) / scenarios.filter((s) => s.quality).length,
    commercialOk: scenarios.find((s) => s.id === "ui_commercial")?.commercialOk ?? false,
  },
};

writeFileSync(join(OUT, "PRODUCTION_UI_SMOKE.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
