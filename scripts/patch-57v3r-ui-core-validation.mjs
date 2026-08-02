#!/usr/bin/env node
/** UI validation — 2 core cases with slow spacing to avoid rate limiter */
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v3r");
mkdirSync(OUT, { recursive: true });
const UI = "https://economia-ai.vercel.app/app-mia";
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const CASES = [
  { id: "UI-CORE-01", turns: ["oi", "celular até 2k", "gostei do primeiro", "e o outro?"] },
  { id: "UI-CORE-02", turns: ["quero celular", "compara A55 e M34", "discordo", "e a câmera?"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cold = (r) => /me ajuda: você se refere/i.test(r);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];

for (const c of CASES) {
  await page.goto(`${UI}?v=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await sleep(1500);
  let lastReply = "";
  for (const msg of c.turns) {
    const p = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
    await page.locator(".mia-input").fill(msg);
    await page.locator(".send-btn").click();
    await p;
    await sleep(6000);
    lastReply = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  }
  const reply = String(lastReply).replace(/^MIΛ\s*/i, "").trim();
  results.push({ id: c.id, lastTurn: c.turns.at(-1), reply: reply.slice(0, 300), coldClarification: cold(reply), pass: !!reply && !cold(reply) });
  console.log(c.id, cold(reply) ? "FAIL" : "PASS", reply.slice(0, 80));
}
await browser.close();
writeFileSync(join(OUT, "UI_CORE_VALIDATION.json"), JSON.stringify({ results, passed: results.filter(r => r.pass).length }, null, 2));
