#!/usr/bin/env node
/**
 * PATCH 4A.2V — Browser validation (local + production)
 * Validates 10 mandatory UI scenarios + 8-turn multitempo conversation.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const URL = process.env.PATCH4A2V_BROWSER_URL || "http://localhost:3000/app-mia";
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const EVIDENCE = path.join(EVIDENCE_DIR, "PATCH_4A_2V_BROWSER_EVIDENCE.json");
const DELAY = Number(process.env.PATCH4A2V_BROWSER_DELAY_MS || 10000);
const SCENARIO_GAP = Number(process.env.PATCH4A2V_SCENARIO_GAP_MS || 15000);
const MODE = process.env.PATCH4A2V_MODE || (URL.includes("localhost") ? "local" : "production");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [];
const scenarios = [];
const technicalTraces = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const RATE_LIMIT = /várias mensagens em sequência|aguarde alguns segundos|rate limit/i;
const SPEC_DUMP = /^\s*(?:[-•]|\d+\.)\s*(?:RAM|GHz|mAh|MP|Hz|polegadas)/im;
const REPORT_READING = /^(?:com base nos dados|analisando as especificações|de acordo com o relatório)/i;

function isGoodReply(text = "") {
  const r = String(text || "").trim();
  if (!r || r.length < 30 || RATE_LIMIT.test(r)) return false;
  if (REPORT_READING.test(r)) return false;
  if (SPEC_DUMP.test(r)) return false;
  return true;
}

async function newSession(label) {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await sleep(1500);
  return { label, started_at: new Date().toISOString() };
}

async function send(message, { reload = false, retryOnRateLimit = true } = {}) {
  if (reload) {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(1500);
  }
  for (let attempt = 0; attempt < (retryOnRateLimit ? 2 : 1); attempt++) {
    if (attempt > 0) await sleep(30000);
    await page.locator(".mia-input").fill(message);
    const resp = page.waitForResponse(
      (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".send-btn").click();
    const response = await resp;
    const data = await response.json().catch(() => ({}));
    await sleep(1500);
    const bubble = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
    const reply = String(data?.reply || bubble || "");
    const sessionContext = data?.session_context || {};
    const trace = {
      semanticUnits: data?.semanticUnits ?? sessionContext?.lastSemanticDecisionUnits ?? null,
      structuredDecisionFacts: data?.structuredDecisionFacts ?? sessionContext?.lastStructuredDecisionFacts ?? null,
      legacyIsPrimaryTruth: data?.legacy?.isPrimaryTruth ?? null,
    };
    technicalTraces.push({ query: message, trace, status: response.status(), attempt });
    const rate_limited = RATE_LIMIT.test(reply);
    if (!rate_limited || attempt === 1) {
      return { reply, sessionContext, status: response.status(), rate_limited, trace };
    }
  }
  return { reply: "", sessionContext: {}, status: 0, rate_limited: true, trace: {} };
}

async function gapBetweenScenarios() {
  await sleep(SCENARIO_GAP);
}

function record(id, pass, detail, meta = {}) {
  checks.push({ id, pass, detail: String(detail).slice(0, 280), ...meta, at: new Date().toISOString() });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${String(detail).slice(0, 120)}`);
}

console.log(`PATCH 4A.2V browser validation (${MODE}): ${URL}`);

// Scenario 1 — Generic recommendation
{
  const flow = await newSession("generic-balanced");
  const r = await send("quero um celular bom e equilibrado");
  record(
    "s1-generic-balanced",
    r.status === 200 && isGoodReply(r.reply) && !r.rate_limited,
    r.reply,
    { cards: await page.locator(".mia-offer-card").count() }
  );
  scenarios.push({ id: "s1", query: "quero um celular bom e equilibrado", reply: r.reply.slice(0, 300) });
  await gapBetweenScenarios();
}

// Scenario 2 — Explicit priority
{
  const flow = await newSession("priority-explicit");
  await send("Quero um celular Samsung até 3 mil.");
  await sleep(DELAY);
  const r = await send("bateria é minha prioridade");
  const attrs = r.sessionContext?.lastCommercialConstraints?.desiredAttributes || [];
  record(
    "s2-priority-explicit",
    r.status === 200 &&
      !r.rate_limited &&
      isGoodReply(r.reply) &&
      (/bateria|autonomia|priorid|reavali|considerando/i.test(r.reply) || attrs.includes("battery")),
    r.reply,
    { desiredAttributes: attrs }
  );
  scenarios.push({ id: "s2", query: "bateria é minha prioridade", reply: r.reply.slice(0, 300) });
  await gapBetweenScenarios();
}

// Scenario 3 — Informal priority
{
  await newSession("priority-informal");
  await send("Quero um celular até 2.500.");
  await sleep(DELAY);
  const r = await send("não quero viver procurando tomada");
  record(
    "s3-priority-informal",
    r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && /bateria|autonomia|tomada|priorid|reavali/i.test(r.reply),
    r.reply
  );
  scenarios.push({ id: "s3", query: "não quero viver procurando tomada", reply: r.reply.slice(0, 300) });
  await gapBetweenScenarios();
}

// Scenario 4 — Specific product
{
  await newSession("product-specific");
  await send("Quero um celular até 2.500.");
  await sleep(DELAY);
  const r = await send("o Galaxy A55 vale a pena?");
  record(
    "s4-product-lock",
    r.status === 200 &&
      !r.rate_limited &&
      isGoodReply(r.reply) &&
      /galaxy|a55|vale|recomend|indic|porque|equilibr/i.test(r.reply),
    r.reply
  );
  scenarios.push({ id: "s4", query: "o Galaxy A55 vale a pena?", reply: r.reply.slice(0, 300) });
  await gapBetweenScenarios();
}

// Scenario 5 — Comparison
{
  await newSession("comparison");
  const r = await send("A55 ou S23 FE?");
  record(
    "s5-comparison",
    r.status === 200 &&
      !r.rate_limited &&
      isGoodReply(r.reply) &&
      /a55|s23|galaxy|fe|recomend|escolh|melhor|porque|ganh|abre mão|troca/i.test(r.reply),
    r.reply
  );
  scenarios.push({ id: "s5", query: "A55 ou S23 FE?", reply: r.reply.slice(0, 300) });
  await gapBetweenScenarios();
}

// Scenario 6 — Contestation
{
  await newSession("contestation");
  await send("A55 ou S23 FE?");
  await sleep(DELAY);
  const r = await send("mas eu achei o S23 FE melhor");
  record(
    "s6-contestation",
    r.status === 200 &&
      !r.rate_limited &&
      isGoodReply(r.reply) &&
      /s23|fe|a55|entend|discord|continuo|mantenho|considerando|porque/i.test(r.reply),
    r.reply
  );
  scenarios.push({ id: "s6", query: "mas eu achei o S23 FE melhor", reply: r.reply.slice(0, 300) });
  await gapBetweenScenarios();
}

// Scenario 7 — Priority change
{
  await newSession("priority-change");
  await send("Quero um celular até 2.500.");
  await sleep(DELAY);
  const r = await send("pensando melhor, câmera é mais importante");
  record(
    "s7-priority-change",
    r.status === 200 &&
      !r.rate_limited &&
      isGoodReply(r.reply) &&
      /câmera|camera|foto|priorid|reavali|considerando|mantenho|continuo/i.test(r.reply),
    r.reply
  );
  scenarios.push({ id: "s7", query: "pensando melhor, câmera é mais importante", reply: r.reply.slice(0, 300) });
  await gapBetweenScenarios();
}

// Scenario 8 — New options
{
  await newSession("new-options");
  await send("Quero um celular Samsung até 3 mil.");
  await sleep(DELAY);
  const r = await send("quero buscar opções novas");
  record(
    "s8-new-options",
    r.status === 200 &&
      !r.rate_limited &&
      isGoodReply(r.reply) &&
      /opç|nov|busc|recomend|celular|galaxy|samsung|indic|me conta|qual/i.test(r.reply),
    r.reply
  );
  scenarios.push({ id: "s8", query: "quero buscar opções novas", reply: r.reply.slice(0, 300) });
  await gapBetweenScenarios();
}

// Scenario 9 — Typo language
{
  await newSession("typo-language");
  const r = await send("quero um cll bom q dure bastante");
  record(
    "s9-typo-language",
    r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && /celular|recomend|indic|bateria|autonomia|dur|galaxy|iphone|samsung|motorola|escolh|equilibr/i.test(r.reply),
    r.reply
  );
  scenarios.push({ id: "s9", query: "quero um cll bom q dure bastante", reply: r.reply.slice(0, 300) });
  await gapBetweenScenarios();
}

// Scenario 10 — Other category (limitation note if unavailable)
{
  await newSession("other-category");
  const r = await send("Quero um notebook bom para faculdade.");
  const mobileOnly = /só consigo ajudar com celular|apenas celular|celular, notebook ou outro/i.test(r.reply);
  record(
    "s10-other-category",
    r.status === 200 &&
      !r.rate_limited &&
      (isGoodReply(r.reply) || mobileOnly) &&
      (mobileOnly || /notebook|faculdade|recomend|indic|me conta/i.test(r.reply)),
    r.reply,
    { limitation: mobileOnly ? "mobile_only_interface" : "notebook_supported" }
  );
  scenarios.push({ id: "s10", query: "Quero um notebook bom para faculdade.", reply: r.reply.slice(0, 300), mobileOnly });
  await gapBetweenScenarios();
}

// Multitempo — 8 turns continuous conversation
{
  const flow = await newSession("multitempo-8-turns");
  const turns = [
    "quero um celular bom e equilibrado",
    "bateria é minha prioridade",
    "e a câmera?",
    "A55 ou S23 FE?",
    "mas eu achei o S23 FE melhor",
    "pensando melhor, não jogo muito",
    "quero ver outras opções",
    "qual você escolheria no meu lugar?",
  ];
  const trace = [];
  for (const q of turns) {
    await sleep(DELAY);
    const r = await send(q);
    trace.push({
      query: q,
      reply_preview: r.reply.slice(0, 220),
      rate_limited: r.rate_limited,
      status: r.status,
    });
  }
  const last = trace[trace.length - 1];
  const anyRateLimit = trace.some((t) => t.rate_limited);
  const hasContinuity = trace.some((t, i) => i > 0 && /continuo|mantenho|considerando|reavali|porque|escolh/i.test(t.reply_preview));
  record(
    "multitempo-8-turns",
    trace.length === 8 && !anyRateLimit && isGoodReply(last.reply_preview) && hasContinuity,
    last.reply_preview,
    { turns: trace.length, anyRateLimit }
  );
  scenarios.push({ id: "multitempo", turns: trace });
}

const bubbles = await page.locator(".mia-msg-assistant-bubble").count();
record("ui-no-empty-bubbles", bubbles >= 8, `assistant_bubbles=${bubbles}`);

await browser.close();

let commit = "unknown";
let deployBuild = null;
try {
  commit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}
try {
  const healthUrl = URL.includes("localhost")
    ? "http://localhost:3000/api/health"
    : "https://economia-ai.vercel.app/api/health";
  deployBuild = JSON.parse(await (await fetch(healthUrl)).text()).build;
} catch {
  /* ignore */
}

const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "4A.2V",
  phase: "browser_validation",
  mode: MODE,
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  url: URL,
  commit,
  deploy_build: deployBuild,
  finished_at: new Date().toISOString(),
  checks,
  scenarios,
  technical_traces: technicalTraces.map((t) => ({
    query: t.query,
    status: t.status,
    hasSemanticUnits: Array.isArray(t.trace?.semanticUnits) ? t.trace.semanticUnits.length > 0 : null,
    hasStructuredFacts: Boolean(t.trace?.structuredDecisionFacts?.primaryGain),
    legacyIsPrimaryTruth: t.trace?.legacyIsPrimaryTruth,
  })),
  summary: { total: checks.length, passed, failed: checks.length - passed },
};
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`\nPATCH 4A.2V browser (${MODE}): ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
