#!/usr/bin/env node
/**
 * PATCH 3.3 — Browser validation (production UI product resolution)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH33_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = path.join(ROOT, "docs/conversational/PATCH_3_3_BROWSER_EVIDENCE.json");

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
  await page
    .waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), {
      timeout: 120000,
    })
    .catch(() => {});
  await sleep(1200);

  const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  const displayText = String(data?.reply || bubbleText || "").trim();
  const cards = await page.locator(".mia-offer-card").count();

  return {
    status: resp.status(),
    displayText,
    cards,
    session: data?.session_context || {},
    prices: data?.prices || [],
  };
}

console.log(`PATCH 3.3 browser validation: ${URL}`);

const r1 = await sendUiMessage("iPhone 15");
checks.push({
  id: "ui-iphone-15-lock",
  pass:
    r1.status === 200 &&
    (r1.cards > 0 || /iphone\s*15/i.test(r1.displayText) || /iphone\s*15/i.test(r1.session?.lastBestProduct?.product_name || "")),
  cards: r1.cards,
  winner: r1.session?.lastBestProduct?.product_name || null,
});

const r2 = await sendUiMessage("S24 com boa bateria", { reload: true });
checks.push({
  id: "ui-s24-constraint",
  pass:
    r2.status === 200 &&
    (r2.cards > 0 ||
      /s24|galaxy s24/i.test(r2.displayText) ||
      /s24|galaxy s24/i.test(r2.session?.lastProductMentioned || "")),
  cards: r2.cards,
  mention: r2.session?.lastProductMentioned || null,
});

const r3 = await sendUiMessage("compare iPhone 13 e Galaxy A54", { reload: true });
checks.push({
  id: "ui-comparison-flow",
  pass: r3.status === 200 && r3.displayText.length >= 20,
  cards: r3.cards,
  comparisonLocked: !!r3.session?.comparisonContextLocked,
});

await browser.close();

const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "3.3",
  phase: "browser_validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  url: URL,
  finished_at: new Date().toISOString(),
  checks,
  summary: { passed, failed: checks.length - passed },
};

fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));

console.log(`\nPATCH 3.3 browser: ${passed}/${checks.length} passed`);
console.log(`Evidence: ${EVIDENCE}`);
process.exit(passed === checks.length ? 0 : 1);
