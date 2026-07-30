#!/usr/bin/env node
import { createRequire } from "module";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const URL = "https://economia-ai.vercel.app/app-mia";
const BUILD = "5ddd0eab0e41";
const COMMIT = "5ddd0ea";
const EVIDENCE = join(ROOT, "docs/conversational/audits/phase-4/evidence/patch-41i3v1");

const COMMERCIAL = /\b(celular|faixa ou produto|sem essa marca|buscando)\b/i;
const LEGACY = /\bPois é\.|direcionar a escolha\b/i;
const MIA_THANKS = /\b(obrigad\w*|que gentil)\b/i;
const PRODUCT = /\b(visual|produto|design|galaxy|iphone)\b/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createSession(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  async function send(t) {
    await sleep(2800);
    const p = page.waitForResponse(
      (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".mia-input").fill(t);
    await page.locator(".send-btn").click();
    const resp = await p;
    const data = await resp.json().catch(() => ({}));
    await sleep(800);
    return String(data?.reply || "").trim();
  }
  return { ctx, send };
}

const browser = await chromium.launch({ headless: true });
const results = [];

async function single(id, msg, check) {
  const s = await createSession(browser);
  const reply = await s.send(msg);
  await s.ctx.close();
  const ok = check(reply);
  results.push({ id, msg, reply, classification: ok ? "APROVADO" : "REPROVADO" });
  console.log(`${ok ? "APROVADO" : "REPROVADO"} ${id}: ${reply.slice(0, 90)}`);
}

async function multi(id, turns, check) {
  const s = await createSession(browser);
  let reply = "";
  for (const t of turns) reply = await s.send(t);
  await s.ctx.close();
  const ok = check(reply);
  results.push({ id, turns, reply, classification: ok ? "APROVADO" : "REPROVADO" });
  console.log(`${ok ? "APROVADO" : "REPROVADO"} ${id}: ${reply.slice(0, 90)}`);
}

await single("D6", "Estou sem assunto", (r) => !COMMERCIAL.test(r));
await single("SOC_Legal", "Legal", (r) => !LEGACY.test(r));
for (let i = 1; i <= 3; i++) {
  await multi(`B2_r${i}`, ["Oi, MIA", "Linda"], (r) => MIA_THANKS.test(r) && !PRODUCT.test(r));
}

writeFileSync(
  join(EVIDENCE, "POSTFIX_D6_B2_LEGAL.json"),
  JSON.stringify({ build: BUILD, commit: COMMIT, results, aprovado: results.filter((r) => r.classification === "APROVADO").length, total: results.length }, null, 2)
);
await browser.close();
console.log(`\nDone: ${results.filter((r) => r.classification === "APROVADO").length}/${results.length}`);
