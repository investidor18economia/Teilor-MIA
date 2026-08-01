#!/usr/bin/env node
/** PATCH 5.7V — Production UI validation */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v");
mkdirSync(OUT, { recursive: true });
const UI = "https://economia-ai.vercel.app/app-mia";

const { measureVerbalizationQuality } = await import(
  pathToFileURL(join(ROOT, "lib/miaConversationalObservability.js")).href
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeUi(text = "") {
  return String(text || "")
    .replace(/^MIΛ\s*/i, "")
    .replace(/^MIA\s*/i, "")
    .replace(/RECOMENDAÇÃO[\s\S]*?(?=A escolha|Com esse)/i, "")
    .trim();
}

function parityOk(apiReply, uiReply) {
  const a = normalizeUi(apiReply);
  const u = normalizeUi(uiReply);
  if (!a || !u) return false;
  if (a === u) return true;
  return u.includes(a.slice(0, Math.min(40, a.length)));
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
  return { status: resp.status(), reply, response_path: data?.latency_analytics?.response_path || null, apiReply: String(data?.reply || "").trim(), uiReply: bubbleText.trim() };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const scenarios = [];

async function fresh() {
  await page.goto(`${UI}?v=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await sleep(800);
}

const defs = [
  ["ui_oi", ["oi"]],
  ["ui_rejection", ["não gostei"]],
  ["ui_rejection_product", ["não gostei desse celular"]],
  ["ui_show", ["show"]],
  ["ui_commercial", ["Quero um celular até 2000"]],
];

for (const [id, turns] of defs) {
  await fresh();
  let last = null;
  for (const t of turns) last = await sendTurn(page, t);
  const parity = parityOk(last.apiReply, last.uiReply);
  scenarios.push({
    id,
    ...last,
    parity,
    quality: measureVerbalizationQuality(last.reply, {}).overall,
    understandsRejection: /(resposta|sugest|opção|recomenda|produto|incomodou|pesou|gostou|gostei)/i.test(last.reply),
    cold: /me diz rapidinho/i.test(last.reply),
  });
}

await fresh();
await sendTurn(page, "oi");
await sleep(1000);
const seca = await sendTurn(page, "seca");
scenarios.push({ id: "ui_seca_mt", ...seca, parity: parityOk(seca.apiReply, seca.uiReply), quality: measureVerbalizationQuality(seca.reply, {}).overall, cold: /me diz rapidinho/i.test(seca.reply) });

await browser.close();

const summary = {
  patch: "5.7V",
  timestamp: new Date().toISOString(),
  scenarios,
  metrics: {
    parityOk: scenarios.filter((s) => s.parity).length,
    cold: scenarios.filter((s) => s.cold).length,
    avgQuality: scenarios.reduce((a, s) => a + (s.quality || 0), 0) / scenarios.length,
  },
};

writeFileSync(join(OUT, "PRODUCTION_UI_VALIDATION.json"), JSON.stringify(summary, null, 2));
writeFileSync(join(OUT, "API_UI_PARITY.json"), JSON.stringify(scenarios.map(({ id, parity, apiReply, uiReply, reply }) => ({ id, parity, apiReply, uiReply, reply })), null, 2));
console.log(JSON.stringify(summary.metrics, null, 2));
