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

const BASE = process.env.MIA_VALIDATION_URL || "http://localhost:3000/app-mia";
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

async function sendMessage(page, msg) {
  await page.fill(".mia-input", msg);
  await page.click(".send-btn");
  await sleep(3500);
  const bubbles = await page.locator(".mia-message-assistant").allTextContents();
  return (bubbles[bubbles.length - 1] || "").trim();
}

async function newChat(page) {
  const btn = page.locator('button:has-text("Nova conversa"), button:has-text("New chat")').first();
  if (await btn.count()) {
    await btn.click();
    await sleep(800);
  } else {
    await page.reload();
    await sleep(1500);
  }
}

function classify(id, reply, checks) {
  const legacy = LEGACY.some((l) => reply.includes(l));
  const commercialRedirect = COMMERCIAL_REDIRECT.test(reply);
  const miaThanks = MIA_THANKS.test(reply);
  const reasons = [];
  if (checks.forbidLegacy !== false && legacy) reasons.push("legacy_phrase");
  if (checks.forbidCommercialRedirect !== false && commercialRedirect) reasons.push("commercial_redirect");
  if (checks.forbidMiaThanks && miaThanks) reasons.push("mia_thanks");
  if (checks.expectProductTalk && !/\b(design|visual|iphone|galaxy|celular|produto|aparelho|câmera|camera)\b/i.test(reply))
    reasons.push("missing_product_talk");
  if (checks.expectMiaThanks && !miaThanks) reasons.push("missing_mia_thanks");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons, legacy, commercialRedirect, miaThanks };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  const results = [];

  async function runSingle(id, msg, checks = {}) {
    await newChat(page);
    const reply = await sendMessage(page, msg);
    const verdict = classify(id, reply, checks);
    results.push({ id, msg, reply, ...verdict });
    console.log(`${verdict.classification} ${id}: ${reply.slice(0, 90)}`);
  }

  async function runMulti(id, turns, finalChecks = {}) {
    await newChat(page);
    const history = [];
    let reply = "";
    for (let i = 0; i < turns.length; i++) {
      reply = await sendMessage(page, turns[i]);
      history.push({ turn: i + 1, msg: turns[i], reply });
      if (i < turns.length - 1) await sleep(500);
    }
    const verdict = classify(id, reply, finalChecks);
    results.push({ id, turns: history, reply, ...verdict });
    console.log(`${verdict.classification} ${id}: ${reply.slice(0, 90)}`);
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
    url: BASE,
    timestamp: new Date().toISOString(),
    total: results.length,
    aprovado: results.filter((r) => r.classification === "APROVADO").length,
    reprovado: results.filter((r) => r.classification === "REPROVADO").length,
    results,
  };
  writeFileSync(join(EVIDENCE, "PATCH_4_1I3V_TARGETED_RERUN.json"), JSON.stringify(summary, null, 2));
  console.log(`\nTargeted rerun: ${summary.aprovado}/${summary.total} APROVADO`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
