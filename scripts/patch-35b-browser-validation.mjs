#!/usr/bin/env node
/**
 * PATCH 3.5b — Browser validation (humanized verbalization)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH35B_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = path.join(ROOT, "docs/conversational/PATCH_3_5B_BROWSER_EVIDENCE.json");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const ROBOTIC_OPENING =
  /^(faz sentido|entendi|boa observa[cç][aã]o|agora mudou um detalhe importante|faz sentido pelo que voc[eê] trouxe|esse ponto pesa na decis[aã]o)\.?$/i;

function isHumanized(text = "") {
  const r = String(text || "").trim();
  const opening = r.split("\n")[0].trim();
  return (
    r.length >= 50 &&
    !ROBOTIC_OPENING.test(opening) &&
    /reavali|considerando|continuo|mantenho|orçamento|marca|recomend|porque|conversamos|refin|teto/i.test(r)
  );
}

console.log(`PATCH 3.5b browser validation: ${URL}`);

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".mia-input", { timeout: 45000 });

async function sendAndCapture(message) {
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

await sendAndCapture("Quero um celular até R$ 2.000.");
await sleep(6000);
const budgetReply = await sendAndCapture("Na verdade pode ser até R$ 2.500.");
checks.push({
  id: "ui-budget-refinement-humanized",
  pass: isHumanized(budgetReply),
  detail: budgetReply.slice(0, 180),
  opening: budgetReply.split("\n")[0]?.slice(0, 80) || "",
});

await sleep(4000);
await sendAndCapture("Quero um celular Samsung até R$ 3.000.");
await sleep(6000);
const brandReply = await sendAndCapture("Pode ser Motorola também.");
checks.push({
  id: "ui-brand-refinement-humanized",
  pass: isHumanized(brandReply),
  detail: brandReply.slice(0, 180),
  opening: brandReply.split("\n")[0]?.slice(0, 80) || "",
});

await browser.close();

const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "3.5b",
  phase: "browser_validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  url: URL,
  finished_at: new Date().toISOString(),
  checks,
  summary: { passed, failed: checks.length - passed },
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`\nPATCH 3.5b browser: ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
