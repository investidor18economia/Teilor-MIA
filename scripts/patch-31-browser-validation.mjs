#!/usr/bin/env node
/**
 * PATCH 3.1 — Browser validation (production UI)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH31_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = path.join(ROOT, "docs/conversational/PATCH_3_1_BROWSER_EVIDENCE.json");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const checks = [];
const consoleErrors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendUiMessage(text, minLen = 10) {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
    { timeout: 120000 }
  );

  await page.locator(".mia-input").fill(text);
  await page.locator(".send-btn").click();

  const resp = await responsePromise;
  const data = await resp.json().catch(() => ({}));
  await page.waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), {
    timeout: 120000,
  }).catch(() => {});
  await sleep(1200);

  const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  const displayText = String(data?.reply || bubbleText || "").trim();
  const cards = await page.locator(".mia-offer-card").count();

  return {
    status: resp.status(),
    displayText,
    cards,
    pass: resp.status() === 200 && displayText.length >= minLen && !/\bundefined\b/.test(displayText),
  };
}

console.log(`PATCH 3.1 browser validation: ${URL}`);

const flows = [
  { id: "ui-commercial-direct", text: "quero um celular ate 2 mil", minLen: 20, expectCards: true },
  { id: "ui-social", text: "oi", minLen: 2, expectCards: false },
  { id: "ui-mixed", text: "to nervoso, preciso de um notebook", minLen: 15, expectCards: false },
  { id: "ui-post-purchase", text: "comprei o celular, obrigado", minLen: 5, expectCards: false },
];

for (const flow of flows) {
  const result = await sendUiMessage(flow.text, flow.minLen);
  const pass =
    result.pass &&
    (flow.expectCards ? result.cards > 0 : result.cards === 0);
  checks.push({
    id: flow.id,
    pass,
    status: result.status,
    cards: result.cards,
    reply_preview: result.displayText.slice(0, 220),
  });
  console.log(`${pass ? "PASS" : "FAIL"} [${flow.id}] cards=${result.cards}`);
}

await browser.close();

const evidence = {
  patch: "3.1",
  url: URL,
  at: new Date().toISOString(),
  checks,
  console_errors_relevant: consoleErrors.filter((e) =>
    /TypeError|ReferenceError|React|hydration|ChunkLoadError/i.test(e)
  ),
  passed: checks.filter((c) => c.pass).length,
  failed: checks.filter((c) => !c.pass).length,
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
};

fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`Evidence: ${EVIDENCE}`);
process.exit(evidence.failed > 0 ? 1 : 0);
