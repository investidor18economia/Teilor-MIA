#!/usr/bin/env node
/** PATCH 5.8.8.1 — Minimal real UI stability (core only) */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-5881");
const UI = "https://economia-ai.vercel.app/app-mia";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCENARIOS = [
  "oi", "ok", "certo", "obrigado", "tudo bem?", "quem é você?", "quero celular",
  "hm", "beleza", "valeu", "bom dia", "boa noite", "e você?", "como vai?",
  "legal", "show", "sim", "nao to legal", "preciso ir", "até logo",
];

async function main() {
  const require = createRequire(join(ROOT, "package.json"));
  const { chromium } = require("playwright");
  mkdirSync(join(OUT, "screenshots"), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];
  const errors = [];

  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => {
    if (r.url().includes("/api/mia-chat") && r.status() >= 500) {
      errors.push(`network ${r.status()} ${r.url()}`);
    }
  });

  for (let i = 0; i < SCENARIOS.length; i += 1) {
    const msg = SCENARIOS[i];
    await page.goto(`${UI}?v=5881-${i}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(3000);
    const wait = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
    await page.locator(".mia-input").fill(msg);
    await page.locator(".send-btn").click();
    const resp = await wait;
    await sleep(4000);
    const reply = String(await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "")).replace(/^MIΛ\s*/i, "").trim();
    const internal = /Não consegui concluir essa resposta agora/i.test(reply);
    results.push({ id: `UI-${i + 1}`, msg, httpStatus: resp.status(), reply: reply.slice(0, 120), internal_error: internal, empty: !reply });
    await sleep(5000);
  }

  // 5-turn conversation
  await page.goto(`${UI}?v=5881-mt`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  const chain = ["oi", "tudo bem?", "ok", "obrigado", "tchau"];
  const turns = [];
  for (const msg of chain) {
    await sleep(5000);
    const wait = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
    await page.locator(".mia-input").fill(msg);
    await page.locator(".send-btn").click();
    const resp = await wait;
    await sleep(4000);
    const reply = String(await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "")).replace(/^MIΛ\s*/i, "").trim();
    turns.push({ msg, httpStatus: resp.status(), reply: reply.slice(0, 120), internal_error: /Não consegui concluir/i.test(reply) });
  }

  await browser.close();
  const payload = {
    scenarios: results,
    multiturn5: turns,
    consoleErrors: errors,
    pass: results.every((r) => r.httpStatus === 200 && !r.internal_error && !r.empty) && turns.every((t) => t.httpStatus === 200 && !t.internal_error && t.reply),
  };
  writeFileSync(join(OUT, "PRODUCTION_UI_VALIDATION.json"), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ pass: payload.pass, ui: results.length, errors: errors.length }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
