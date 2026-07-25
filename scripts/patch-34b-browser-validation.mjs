#!/usr/bin/env node
/**
 * PATCH 3.4b — Browser validation (Constraint Refinement + Generic Query Closing)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH34B_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = path.join(ROOT, "docs/conversational/PATCH_3_4B_BROWSER_EVIDENCE.json");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  await sleep(1500);
  const bubble = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  return {
    status: resp.status(),
    text: String(data?.reply || bubble || ""),
    cards: await page.locator(".mia-offer-card").count(),
  };
}

console.log(`PATCH 3.4b browser validation: ${URL}`);

const notebook = await send("Quero um notebook.");
checks.push({
  id: "ui-generic-notebook-partial",
  pass:
    notebook.status === 200 &&
    notebook.text.length >= 40 &&
    !/^me conta/i.test(notebook.text),
  detail: notebook.text.slice(0, 160),
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".mia-input", { timeout: 45000 });
await page.locator(".mia-input").fill("Quero um celular até R$ 2.000.");
await page.locator(".send-btn").click();
await sleep(8000);
await page.locator(".mia-input").fill("Na verdade pode ser até R$ 2.500.");
const budgetResp = page.waitForResponse(
  (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
  { timeout: 120000 }
);
await page.locator(".send-btn").click();
const budgetData = await (await budgetResp).json().catch(() => ({}));
await sleep(1500);
const budgetText = String(budgetData?.reply || "");
checks.push({
  id: "ui-budget-refinement-follow-up",
  pass: budgetText.length >= 20 && /2500|2\.500|orçamento|teto/i.test(budgetText),
  detail: budgetText.slice(0, 160),
});

await browser.close();

const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "3.4b",
  phase: "browser_validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  url: URL,
  deploy_build: "4ca098d614f1",
  finished_at: new Date().toISOString(),
  checks,
  summary: { passed, failed: checks.length - passed },
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`\nPATCH 3.4b browser: ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
