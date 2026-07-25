#!/usr/bin/env node
/**
 * PATCH 3.2 — Browser validation (production UI continuity)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH32_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = path.join(ROOT, "docs/conversational/PATCH_3_2_BROWSER_EVIDENCE.json");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const checks = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendUiMessage(text, { reload = true } = {}) {
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
    session: data?.session_context || {},
  };
}

console.log(`PATCH 3.2 browser validation: ${URL}`);

const r1 = await sendUiMessage("quero um celular ate 2 mil");
checks.push({
  id: "ui-establish-search",
  pass: r1.status === 200 && r1.displayText.length >= 20,
  cards: r1.cards,
  winner: r1.session?.lastBestProduct?.product_name || null,
});

const r2 = await sendUiMessage("e mais barato?", { reload: false });
checks.push({
  id: "ui-follow-up-price",
  pass: r2.status === 200 && r2.displayText.length >= 10,
  cards: r2.cards,
  winner: r2.session?.lastBestProduct?.product_name || null,
});

const r3 = await sendUiMessage("oi", { reload: false });
checks.push({
  id: "ui-social",
  pass: r3.status === 200 && r3.cards === 0,
  cards: r3.cards,
});

await browser.close();

const evidence = {
  patch: "3.2",
  url: URL,
  at: new Date().toISOString(),
  checks,
  passed: checks.filter((c) => c.pass).length,
  failed: checks.filter((c) => !c.pass).length,
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
};

fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`Evidence: ${EVIDENCE}`);
for (const c of checks) {
  console.log(`${c.pass ? "PASS" : "FAIL"} [${c.id}] cards=${c.cards} winner=${c.winner || "-"}`);
}
process.exit(evidence.failed > 0 ? 1 : 0);
