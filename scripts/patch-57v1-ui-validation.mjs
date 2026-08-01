#!/usr/bin/env node
/** PATCH 5.7V.1 — Production UI validation (negative feedback) */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v1");
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
    .trim();
}

function parityOk(apiReply, uiReply) {
  const a = normalizeUi(apiReply);
  const u = normalizeUi(uiReply);
  if (!a || !u) return false;
  if (a === u) return true;
  return u.includes(a.slice(0, Math.min(35, a.length))) || a.includes(u.slice(0, Math.min(35, u.length)));
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
  await sleep(3500);
  const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  return {
    status: resp.status(),
    reply: String(data?.reply || bubbleText || "").trim(),
    apiReply: String(data?.reply || "").trim(),
    uiReply: bubbleText.trim(),
    response_path: data?.latency_analytics?.response_path || null,
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const scenarios = [];

async function fresh() {
  await page.goto(`${UI}?v=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await sleep(1200);
}

const defs = [
  ["ui_voce_errou", ["oi", "você errou"]],
  ["ui_ficou_pessimo", ["oi", "ficou péssimo"]],
  ["ui_discordo", ["me fala do A55", "discordo"]],
  ["ui_nao_gostei", ["não gostei"]],
  ["ui_rejection_product", ["não gostei desse celular"]],
  ["ui_commercial", ["Quero um celular até 2000"]],
];

for (const [id, turns] of defs) {
  await fresh();
  let last = null;
  for (const t of turns) last = await sendTurn(page, t);
  scenarios.push({
    id,
    ...last,
    parity: parityOk(last.apiReply, last.uiReply),
    quality: measureVerbalizationQuality(last.reply, {}).overall,
    cold: /me diz rapidinho/i.test(last.reply),
    irony: /pego a ironia/i.test(last.reply),
  });
  await sleep(2000);
}

await browser.close();

writeFileSync(
  join(OUT, "UI_VALIDATION.json"),
  JSON.stringify(
    {
      scenarios,
      metrics: {
        parityOk: scenarios.filter((s) => s.parity).length,
        total: scenarios.length,
        cold: scenarios.filter((s) => s.cold).length,
        irony: scenarios.filter((s) => s.irony).length,
      },
    },
    null,
    2
  )
);

writeFileSync(
  join(OUT, "API_UI_PARITY.json"),
  JSON.stringify({ scenarios: scenarios.map((s) => ({ id: s.id, parity: s.parity, apiReply: s.apiReply?.slice(0, 80), uiReply: s.uiReply?.slice(0, 80) })) }, null, 2)
);

console.log(JSON.stringify({ parity: `${scenarios.filter((s) => s.parity).length}/${scenarios.length}` }));
process.exit(scenarios.every((s) => s.parity && !s.cold && !s.irony) ? 0 : 1);
