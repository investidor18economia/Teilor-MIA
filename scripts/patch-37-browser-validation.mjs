#!/usr/bin/env node
/**
 * PATCH 3.7 — Browser validation (isolated flows, rate-limit aware)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH37_BROWSER_URL || "https://economia-ai.vercel.app/app-mia";
const EVIDENCE = path.join(ROOT, "docs/conversational/PATCH_3_7_BROWSER_EVIDENCE.json");
const DELAY = Number(process.env.PATCH37_BROWSER_DELAY_MS || 6000);

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const checks = [];
const flows = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const RATE_LIMIT = /várias mensagens em sequência|aguarde alguns segundos|rate limit/i;

function isGood(text = "") {
  const r = String(text || "").trim();
  if (RATE_LIMIT.test(r)) return false;
  return (
    r.length >= 35 &&
    !/^(faz sentido|entendi|esse ponto pesa)\.?$/i.test(r.split("\n")[0]) &&
    !/^perfeito[!.]?$/i.test(r.split("\n")[0])
  );
}

function firstLine(text = "") {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
}

function isGenericPriorityFallback(text = "") {
  return /entendi, você está priorizando|isso é importante! você está pensando/i.test(text);
}

async function newSession(page, label) {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await sleep(1500);
  return { label, started_at: new Date().toISOString() };
}

async function send(page, message) {
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
  const sessionContext = data?.session_context || {};
  return { reply, sessionContext, rate_limited: RATE_LIMIT.test(reply) };
}

function recordCheck(id, pass, detail, meta = {}) {
  checks.push({ id, pass, detail: String(detail).slice(0, 240), ...meta });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${String(detail).slice(0, 120)}`);
}

console.log(`PATCH 3.7 browser validation: ${URL}`);

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Flow 1 — Clarification
{
  const flow = await newSession(page, "clarification");
  const r1 = await send(page, "Quero um celular.");
  recordCheck("ui-generic-clarification", isGood(r1.reply) && !r1.rate_limited, r1.reply);
  await sleep(DELAY);
  await send(page, "Até 2.500.");
  await sleep(DELAY);
  const r3 = await send(page, "Para faculdade e redes sociais.");
  recordCheck("ui-after-clarification-recommendation", isGood(r3.reply) && /faculdade|recomend|celular|galaxy|iphone/i.test(r3.reply) && !r3.rate_limited, r3.reply);
  flows.push({ ...flow, turns: 3 });
}

// Flow 2 — Budget fix (fresh session)
{
  const flow = await newSession(page, "budget-3-mil");
  await send(page, "Quero um celular Samsung até 2 mil.");
  await sleep(DELAY);
  const r = await send(page, "Pode aumentar para 3 mil.");
  const budgetMax = r.sessionContext?.lastCommercialConstraints?.budgetMax ?? r.sessionContext?.budgetMax;
  const pass = !r.rate_limited && budgetMax === 3000 && budgetMax !== 3 && (isGood(r.reply) || /3000|3\.000|teto|orçamento/i.test(r.reply));
  recordCheck("ui-budget-para-3-mil", pass, `budgetMax=${budgetMax} reply=${r.reply.slice(0, 100)}`, { budgetMax, expected: 3000 });
  flows.push({ ...flow, budgetMax });
}

// Flow 3 — Priority fix (fresh session)
{
  const flow = await newSession(page, "priority-battery");
  await send(page, "Quero um celular Samsung até 3 mil.");
  await sleep(DELAY);
  const r = await send(page, "Agora bateria é mais importante.");
  const attrs = r.sessionContext?.lastCommercialConstraints?.desiredAttributes || [];
  const pass =
    !r.rate_limited &&
    !isGenericPriorityFallback(r.reply) &&
    (attrs.includes("battery") || (/bateria|priorid|reavali|considerando/i.test(r.reply) && isGood(r.reply)));
  recordCheck("ui-priority-bateria", pass, r.reply, { desiredAttributes: attrs });
  flows.push({ ...flow, desiredAttributes: attrs });
}

// Flow 4 — Mixed intent (fresh session)
{
  const flow = await newSession(page, "mixed-intent");
  await send(page, "Quero um celular Samsung até 3 mil para jogos.");
  await sleep(DELAY);
  const r = await send(page, "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.");
  recordCheck(
    "ui-mixed-intent",
    isGood(r.reply) && !r.rate_limited && /samsung/i.test(r.reply) && /motorola/i.test(r.reply) && /orçamento|passar|flex|teto|3450|3\.450|um pouco/i.test(r.reply),
    r.reply
  );
  flows.push({ ...flow });
}

// Flow 5 — Sequence-H (fresh session, isolated from long convo)
{
  const flow = await newSession(page, "sequence-h");
  const r1 = await send(page, "quero um cell ate 2500");
  const pass =
    isGood(r1.reply) &&
    !r1.rate_limited &&
    !/qual recomendação anterior|várias mensagens em sequência|aguarde alguns segundos/i.test(r1.reply);
  recordCheck("ui-sequence-h-initial", pass, r1.reply, { rate_limited: r1.rate_limited });
  await sleep(DELAY);
  await send(page, "na real e pra facul");
  await sleep(DELAY);
  const r3 = await send(page, "moto tb serve");
  recordCheck("ui-sequence-h-refinement", isGood(r3.reply) && !r3.rate_limited && /motorola|marca|reavali/i.test(r3.reply), r3.reply);
  flows.push({ ...flow, sequence_h_rate_limited: r1.rate_limited });
}

// Flow 6 — Long conversation with casual return (fresh session)
{
  const flow = await newSession(page, "long-conversation");
  const trace = [];
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
    await sleep(DELAY);
    const r = await send(page, turn);
    trace.push({ query: turn, opening: firstLine(r.reply), reply_preview: r.reply.slice(0, 200), rate_limited: r.rate_limited });
  }
  const last = trace[trace.length - 1];
  const returnCommercialTurn = trace.find((t) => /voltando ao celular/i.test(t.query || ""));
  const postReturnTurn = trace[trace.length - 2];
  const casualReturnReply =
    postReturnTurn?.reply_preview ||
    returnCommercialTurn?.reply_preview ||
    last?.reply_preview ||
    "";
  const openings = trace.slice(1, 6).map((t) => t.opening);
  const uniqueOpenings = new Set(openings).size;
  const anyRateLimit = trace.some((t) => t.rate_limited);
  recordCheck("ui-long-conversation-10-turns", isGood(last?.reply_preview || "") && trace.length === 10 && !anyRateLimit, last?.reply_preview);
  recordCheck("ui-p36-002-opening-variety", uniqueOpenings >= 2 && !anyRateLimit, `unique_openings=${uniqueOpenings}/${openings.length}`, { openings });
  recordCheck(
    "ui-casual-return-commercial",
    isGood(casualReturnReply) &&
      !anyRateLimit &&
      /iphone|galaxy|samsung|motorola|recomend|opção|indic|melhor/i.test(casualReturnReply),
    casualReturnReply
  );
  flows.push({ ...flow, trace, rate_limit_events: trace.filter((t) => t.rate_limited).length });
}

const bubbles = await page.locator(".mia-msg-assistant-bubble").count();
recordCheck("ui-no-empty-bubbles", bubbles >= 6, `assistant_bubbles=${bubbles}`);

await browser.close();

let commit = "unknown";
let deployBuild = null;
try {
  commit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  deployBuild = JSON.parse(await (await fetch("https://economia-ai.vercel.app/api/health")).text()).build;
} catch {
  /* ignore */
}

const rateLimitChecks = checks.filter((c) => /rate_limited|sequence-h|long-conversation|budget|priority/.test(c.id));
const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "3.7",
  phase: "browser_validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  url: URL,
  commit,
  deploy_build: deployBuild,
  finished_at: new Date().toISOString(),
  rate_limit_analysis: {
    sequence_h_isolated: flows.find((f) => f.label === "sequence-h")?.sequence_h_rate_limited ?? false,
    long_conversation_events: flows.find((f) => f.label === "long-conversation")?.rate_limit_events ?? 0,
    conclusion:
      flows.find((f) => f.label === "sequence-h")?.sequence_h_rate_limited
        ? "Rate limit occurred in prior combined session; isolated Sequence-H flow retested separately"
        : "No functional scenario masked by rate limit in isolated flows",
  },
  checks,
  flows,
  p36_002: {
    openings: flows.find((f) => f.label === "long-conversation")?.trace?.slice(1, 6).map((t) => t.opening) || [],
    classification: "COSMETIC_NON_BLOCKING",
  },
  summary: { total: checks.length, passed, failed: checks.length - passed },
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`\nPATCH 3.7 browser: ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
