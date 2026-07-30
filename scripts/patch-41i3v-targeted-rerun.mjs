#!/usr/bin/env node
/** Targeted re-validation for PATCH 4.1I.3.V critical failures */
import { createRequire } from "module";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const URL = process.env.MIA_VALIDATION_URL || "https://economia-ai.vercel.app/app-mia";
const BUILD = process.env.MIA_VALIDATION_BUILD || "8f59803a6d0b";
const COMMIT = process.env.MIA_VALIDATION_COMMIT || "8f59803";
const EVIDENCE = join(ROOT, "docs/conversational/audits/phase-4/evidence/patch-41i3v");
mkdirSync(join(EVIDENCE, "rerun"), { recursive: true });

const LEGACY = [
  "Isso ajuda bastante a direcionar a escolha.",
  "Com esse contexto, consigo ser mais precisa.",
  "Me conta o que você está buscando",
  "celular, notebook ou outro produto",
];
const COMMERCIAL_REDIRECT = /\b(celular,\s*notebook|faixa ou produto|me conta o que voc[eê] est[aá] buscando|direcionar a escolha)\b/i;
const MIA_THANKS = /\b(obrigad\w*|valeu pelo elogio|fico feliz|que gentil)\b/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function classify(reply, checks) {
  const legacy = LEGACY.some((l) => reply.includes(l));
  const commercialRedirect = COMMERCIAL_REDIRECT.test(reply);
  const miaThanks = MIA_THANKS.test(reply);
  const reasons = [];
  if (!reply || reply.startsWith("[ERROR")) reasons.push("empty_or_error");
  if (checks.forbidLegacy !== false && legacy) reasons.push("legacy_phrase");
  if (checks.forbidCommercialRedirect !== false && commercialRedirect) reasons.push("commercial_redirect");
  if (checks.forbidMiaThanks && miaThanks) reasons.push("mia_thanks");
  if (checks.expectProductTalk && !/\b(design|visual|iphone|galaxy|celular|produto|aparelho|câmera|camera|acabamento|premium)\b/i.test(reply))
    reasons.push("missing_product_talk");
  if (checks.expectMiaThanks && !miaThanks) reasons.push("missing_mia_thanks");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, legacy, commercialRedirect, miaThanks };
}

async function createSession(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });

  async function send(text) {
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".mia-input").fill(text);
    await page.locator(".send-btn").click();
    try {
      const resp = await responsePromise;
      const data = await resp.json().catch(() => ({}));
      await page
        .waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), {
          timeout: 120000,
        })
        .catch(() => {});
      await sleep(800);
      const bubbleText = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
      return String(data?.reply || bubbleText || "").trim();
    } catch (e) {
      return `[ERROR: ${e.message}]`;
    }
  }

  return { ctx, send };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  async function runSingle(id, msg, checks = {}) {
    const s = await createSession(browser);
    try {
      const reply = await s.send(msg);
      const verdict = classify(reply, checks);
      results.push({ id, msg, reply, ...verdict });
      console.log(`${verdict.classification} ${id}: ${reply.slice(0, 100)}`);
    } finally {
      await s.ctx.close();
    }
  }

  async function runMulti(id, turns, finalChecks = {}) {
    const s = await createSession(browser);
    try {
      const history = [];
      let reply = "";
      for (let i = 0; i < turns.length; i++) {
        reply = await s.send(turns[i]);
        history.push({ turn: i + 1, msg: turns[i], reply });
      }
      const verdict = classify(reply, finalChecks);
      results.push({ id, turns: history, reply, ...verdict });
      console.log(`${verdict.classification} ${id}: ${reply.slice(0, 100)}`);
    } finally {
      await s.ctx.close();
    }
  }

  await runSingle("A4", "Gostei dessa conversa");
  await runSingle("D1", "Quero conversar sobre música");
  await runSingle("A8", "Ele é lindo");
  await runSingle("A10", "Isso foi complicado");
  await runSingle("D6", "Estou sem assunto");
  await runMulti("B1", ["O que você acha do design do Galaxy A55?", "Linda"], { forbidMiaThanks: true, expectProductTalk: true });
  await runMulti("B2", ["Oi, MIA", "Linda"], { expectMiaThanks: true });
  await runMulti("B3", ["Estou olhando o iPhone 15 azul", "Bonito demais"], { forbidMiaThanks: true, expectProductTalk: true });
  await runMulti("B4", ["Me explique a diferença entre OLED e AMOLED", "Muito boa"]);
  await runMulti("I1", ["Qual a diferença entre LCD e OLED?", "Essa resposta ficou ótima"]);
  await runMulti("B6", ["O Galaxy A55 tem um design bonito?", "Linda", "Estou falando do celular"], { forbidMiaThanks: true });

  const summary = {
    build: BUILD,
    commit: COMMIT,
    url: URL,
    timestamp: new Date().toISOString(),
    total: results.length,
    aprovado: results.filter((r) => r.classification === "APROVADO").length,
    reprovado: results.filter((r) => r.classification === "REPROVADO").length,
    results,
  };
  writeFileSync(join(EVIDENCE, "PATCH_4_1I3V_TARGETED_RERUN.json"), JSON.stringify(summary, null, 2));
  console.log(`\nTargeted rerun (${BUILD}): ${summary.aprovado}/${summary.total} APROVADO`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
