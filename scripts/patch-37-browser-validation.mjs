#!/usr/bin/env node
/**
 * PATCH 3.7 — Browser validation (real UI + long conversation)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH37_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = path.join(ROOT, "docs/conversational/PATCH_3_7_BROWSER_EVIDENCE.json");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [];
const longConversationTrace = [];

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

function firstLine(text = "") {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
}

console.log(`PATCH 3.7 browser validation: ${URL}`);

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".mia-input", { timeout: 45000 });

async function send(message, trackLong = false) {
  await page.locator(".mia-input").fill(message);
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
    { timeout: 120000 }
  );
  await page.locator(".send-btn").click();
  const data = await (await resp).json().catch(() => ({}));
  await sleep(1500);
  const bubble = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
  const reply = String(data?.reply || bubble || "");
  if (trackLong) {
    longConversationTrace.push({
      query: message,
      reply_preview: reply.slice(0, 200),
      opening: firstLine(reply),
    });
  }
  return reply;
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
const multiReply = await send(
  "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola."
);
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
const seqHReply = await send("quero um cell ate 2500");
checks.push({
  id: "ui-sequence-h-initial",
  pass: isGood(seqHReply) && !/qual recomendação anterior|várias mensagens em sequência|aguarde alguns segundos/i.test(seqHReply),
  detail: seqHReply.slice(0, 160),
});

const LONG_TURNS = [
  "Quero um celular até 2.500 para jogos.",
  "Pode subir para 2.800.",
  "Motorola também serve.",
  "Agora prioriza bateria.",
  "Câmera não importa tanto.",
  "Obrigado.",
  "Você é uma IA?",
  "Voltando ao celular, tira Xiaomi.",
  "Qual ficou sendo a melhor opção?",
  "E a segunda?",
];
for (const turn of LONG_TURNS) {
  await sleep(5500);
  await send(turn, true);
}
const lastLong = longConversationTrace[longConversationTrace.length - 1]?.reply_preview || "";
const openings = longConversationTrace.slice(1, 6).map((t) => t.opening);
const uniqueOpenings = new Set(openings).size;
checks.push({
  id: "ui-long-conversation-10-turns",
  pass: isGood(lastLong) && longConversationTrace.length === 10,
  detail: lastLong.slice(0, 180),
});
checks.push({
  id: "ui-p36-002-opening-variety",
  pass: uniqueOpenings >= 2,
  detail: `unique_openings=${uniqueOpenings}/${openings.length}`,
});

const bubbles = await page.locator(".mia-msg-assistant-bubble").count();
checks.push({
  id: "ui-no-empty-bubbles",
  pass: bubbles >= 8,
  detail: `assistant_bubbles=${bubbles}`,
});

await browser.close();

let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "3.7",
  phase: "browser_validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  url: URL,
  commit,
  finished_at: new Date().toISOString(),
  checks,
  long_conversation: longConversationTrace,
  p36_002: {
    openings,
    unique_openings: uniqueOpenings,
    classification: uniqueOpenings >= 2 ? "COSMETIC_NON_BLOCKING" : "REVIEW",
  },
  summary: { passed, failed: checks.length - passed },
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`\nPATCH 3.7 browser: ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
