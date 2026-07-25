#!/usr/bin/env node
/**
 * PATCH 3.6 — Browser validation (real UI integrated flows)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH36_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = path.join(ROOT, "docs/conversational/PATCH_3_6_BROWSER_EVIDENCE.json");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isGood(text = "") {
  const r = String(text || "").trim();
  return (
    r.length >= 40 &&
    !/^(faz sentido|entendi|esse ponto pesa)\.?$/i.test(r.split("\n")[0]) &&
    !/^perfeito[!.]?$/i.test(r.split("\n")[0])
  );
}

console.log(`PATCH 3.6 browser validation: ${URL}`);

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".mia-input", { timeout: 45000 });

async function send(message) {
  await page.locator(".mia-input").fill(message);
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
    { timeout: 120000 }
  );
  await page.locator(".send-btn").click();
  const data = await (await resp).json().catch(() => ({}));
  await sleep(1500);
  const bubble = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  return String(data?.reply || bubble || "");
}

const genericReply = await send("Quero um celular.");
checks.push({ id: "ui-generic-clarification", pass: isGood(genericReply), detail: genericReply.slice(0, 160) });
await sleep(5000);
await send("Até 2.500.");
await sleep(6000);
const refinedReply = await send("Para faculdade e redes sociais.");
checks.push({
  id: "ui-after-clarification-recommendation",
  pass: isGood(refinedReply) && /faculdade|recomend|celular|galaxy|iphone/i.test(refinedReply),
  detail: refinedReply.slice(0, 160),
});

await sleep(4000);
await send("Quero um celular Samsung até 3 mil para jogos.");
await sleep(6000);
const colloquialReply = await send("motorola tbm serve");
checks.push({
  id: "ui-colloquial-brand-refinement",
  pass: isGood(colloquialReply) && /motorola|marca|reavali|continuo|considerando/i.test(colloquialReply),
  detail: colloquialReply.slice(0, 160),
});

await sleep(4000);
await send("Quero um celular até 2.000.");
await sleep(6000);
const budgetReply = await send("pode aumentar pra 2500");
checks.push({
  id: "ui-colloquial-budget-increase",
  pass: isGood(budgetReply) && /2500|2\.500|orçamento|teto|reavali/i.test(budgetReply),
  detail: budgetReply.slice(0, 160),
});

await sleep(4000);
await send("Quero um celular Samsung até 3 mil.");
await sleep(6000);
const multiReply = await send("Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.");
checks.push({
  id: "ui-mixed-intent",
  pass:
    isGood(multiReply) &&
    /samsung/i.test(multiReply) &&
    /motorola/i.test(multiReply) &&
    /orçamento|passar|flex|teto|3450|3\.450|um pouco/i.test(multiReply),
  detail: multiReply.slice(0, 200),
});

await sleep(4000);
const iphoneReply = await send("Quero um celular até 3 mil.");
checks.push({ id: "ui-commercial-entry", pass: isGood(iphoneReply), detail: iphoneReply.slice(0, 120) });
await sleep(6000);
const iphoneEval = await send("Vale a pena comprar o iPhone 15?");
checks.push({
  id: "ui-specific-product",
  pass: isGood(iphoneEval) && /iphone/i.test(iphoneEval),
  detail: iphoneEval.slice(0, 160),
});

const bubbles = await page.locator(".mia-msg-assistant-bubble").count();
checks.push({
  id: "ui-no-empty-bubbles",
  pass: bubbles >= 5,
  detail: `assistant_bubbles=${bubbles}`,
});

await browser.close();

const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "3.6",
  phase: "browser_validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  url: URL,
  finished_at: new Date().toISOString(),
  checks,
  summary: { passed, failed: checks.length - passed },
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`\nPATCH 3.6 browser: ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
