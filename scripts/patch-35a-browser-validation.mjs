#!/usr/bin/env node
/**
 * PATCH 3.5a — Browser validation (rich commercial explanation)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH35A_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = path.join(ROOT, "docs/conversational/PATCH_3_5A_BROWSER_EVIDENCE.json");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRich(text = "") {
  const r = String(text || "").trim();
  return (
    r.length >= 50 &&
    !/^(faz sentido|esse ponto pesa|entendi)\.?$/i.test(r.split("\n")[0]) &&
    /reavali|mantenho|mudaria|orçamento|marca|recomend|porque|continua/i.test(r)
  );
}

console.log(`PATCH 3.5a browser validation: ${URL}`);

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".mia-input", { timeout: 45000 });
await page.locator(".mia-input").fill("Quero um celular até R$ 2.000.");
await page.locator(".send-btn").click();
await sleep(8000);
await page.locator(".mia-input").fill("Na verdade pode ser até R$ 2.500.");
const resp = page.waitForResponse(
  (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
  { timeout: 120000 }
);
await page.locator(".send-btn").click();
const data = await (await resp).json().catch(() => ({}));
await sleep(1500);
const bubble = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
const text = String(data?.reply || bubble || "");
checks.push({
  id: "ui-budget-refinement-rich-explanation",
  pass: isRich(text),
  detail: text.slice(0, 180),
});

await browser.close();

const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "3.5a",
  phase: "browser_validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  url: URL,
  finished_at: new Date().toISOString(),
  checks,
  summary: { passed, failed: checks.length - passed },
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`\nPATCH 3.5a browser: ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
