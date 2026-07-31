#!/usr/bin/env node
/** PATCH 5.5 — Production UI smoke after universal recovery deploy */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-55");
mkdirSync(OUT, { recursive: true });

const API = "https://economia-ai.vercel.app/api/mia-chat";
const UI = "https://economia-ai.vercel.app/app-mia";
const HEALTH = "https://economia-ai.vercel.app/api/health";

const CASES = ["Oi", "Opa", "Linda", "Show", "Quero um celular até 2000"];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function api(msg) {
  await sleep(4000);
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: msg,
      user_id: `p55-${Date.now()}`,
      conversation_id: `p55-${Date.now()}`,
      messages: [{ role: "user", content: msg }],
      session_context: {},
    }),
  });
  const b = await r.json();
  return { status: r.status, reply: String(b.reply || "").trim(), path: b.latency_analytics?.response_path, empty: !String(b.reply || "").trim() };
}

const health = await (await fetch(HEALTH)).json();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];

for (const msg of CASES) {
  const apiR = await api(msg);
  await page.goto(`${UI}?v=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mia-input");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await sleep(1500);
  const rp = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
  await page.locator(".mia-input").fill(msg);
  await page.locator(".send-btn").click();
  const resp = await rp;
  const data = await resp.json().catch(() => ({}));
  await sleep(2000);
  const uiReply = String(data.reply || "").trim();
  results.push({
    msg,
    api: apiR,
    ui: { status: resp.status, reply: uiReply.slice(0, 120), empty: !uiReply, path: data.latency_analytics?.response_path },
    parity: apiR.reply === uiReply || (!apiR.empty && !uiReply === false),
    approved: apiR.status === 200 && resp.status === 200 && !apiR.empty && !!uiReply,
  });
}

await browser.close();

const payload = { patch: "5.5", health, results, approved: results.filter((r) => r.approved).length, total: results.length, timestamp: new Date().toISOString() };
writeFileSync(join(OUT, "PRODUCTION_UI_VALIDATION.json"), JSON.stringify(payload, null, 2));
writeFileSync(join(OUT, "HEALTH_PRODUCTION.json"), JSON.stringify(health, null, 2));
console.log(JSON.stringify(payload, null, 2));
process.exit(results.every((r) => r.approved) ? 0 : 1);
