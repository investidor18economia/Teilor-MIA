#!/usr/bin/env node
/**
 * PATCH 3.4a — Browser validation (Clarification Gates)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH34A_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = path.join(ROOT, "docs/conversational/PATCH_3_4A_BROWSER_EVIDENCE.json");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isClarification(text = "") {
  const r = String(text || "").toLowerCase();
  return /me conta|me fala|me diz|qual faixa|uso principal|celular, notebook/.test(r);
}

async function send(text, { reload = true } = {}) {
  if (reload) {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
  }
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
    { timeout: 120000 }
  );
  await page.locator(".mia-input").fill(text);
  await page.locator(".send-btn").click();
  const resp = await responsePromise;
  const data = await resp.json().catch(() => ({}));
  await sleep(1200);
  const bubble = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  return { status: resp.status(), text: String(data?.reply || bubble || ""), cards: await page.locator(".mia-offer-card").count() };
}

console.log(`PATCH 3.4a browser validation: ${URL}`);

const r1 = await send("Quero um celular.");
checks.push({ id: "ui-clarify-vague-celular", pass: r1.status === 200 && isClarification(r1.text) && r1.cards === 0 });

const r2 = await send("Quero um celular até R$ 2.000.");
checks.push({ id: "ui-proceed-with-budget", pass: r2.status === 200 && !isClarification(r2.text) });

const r3 = await send("Entre S24 e iPhone 15.");
checks.push({ id: "ui-comparison-no-clarify", pass: r3.status === 200 && !isClarification(r3.text) });

await browser.close();

const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "3.4a",
  phase: "browser_validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  url: URL,
  finished_at: new Date().toISOString(),
  checks,
  summary: { passed, failed: checks.length - passed },
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`\nPATCH 3.4a browser: ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
