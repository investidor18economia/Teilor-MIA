#!/usr/bin/env node
/**
 * PATCH 4A.3V — Local browser validation (official closure of 4A.3)
 * Validates semantic families via real UI interaction — no API substitution.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = process.env.PATCH4A3V_LOCAL_PORT || "3002";
const URL = process.env.PATCH4A3V_BROWSER_URL || `http://localhost:${PORT}/app-mia`;
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const EVIDENCE = path.join(EVIDENCE_DIR, "PATCH_4A_3_LOCAL_BROWSER_EVIDENCE.json");
const SCREENSHOT_DIR = path.join(EVIDENCE_DIR, "screenshots-4a3v");
const DELAY = Number(process.env.PATCH4A3V_BROWSER_DELAY_MS || 9000);
const SCENARIO_GAP = Number(process.env.PATCH4A3V_SCENARIO_GAP_MS || 12000);

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
const SHALLOW = /^(?:faz sentido|entendi\.?$|ok\.?$)/i;

function isGoodReply(text = "") {
  const r = String(text || "").trim();
  if (!r || r.length < 25 || RATE_LIMIT.test(r)) return false;
  if (REPORT_READING.test(r) || SHALLOW.test(r)) return false;
  if (SPEC_DUMP.test(r)) return false;
  return true;
}

async function newSession(label) {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await sleep(1500);
  return { label, started_at: new Date().toISOString() };
}

async function send(message, { reload = false } = {}) {
  if (reload) {
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(1500);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
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
      legacyIsPrimaryTruth: data?.legacy?.isPrimaryTruth ?? sessionContext?.legacy?.isPrimaryTruth ?? null,
      winner: sessionContext?.lastBestProduct?.name || sessionContext?.lastWinnerName || null,
    };
    technicalTraces.push({ query: message, trace, status: response.status(), attempt });
    const rate_limited = RATE_LIMIT.test(reply);
    if (!rate_limited || attempt === 1) {
      return { reply, sessionContext, status: response.status(), rate_limited, trace, data };
    }
  }
  return { reply: "", sessionContext: {}, status: 0, rate_limited: true, trace: {}, data: {} };
}

async function gap() {
  await sleep(SCENARIO_GAP);
}

function record(id, pass, detail, meta = {}) {
  checks.push({ id, pass, detail: String(detail).slice(0, 320), family: meta.family || null, ...meta, at: new Date().toISOString() });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${String(detail).slice(0, 100)}`);
}

async function screenshot(name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}

console.log(`PATCH 4A.3V local browser validation: ${URL}\n`);

// ── 1. Produto específico ──
{
  const queries = [
    { q: "o Galaxy A55 compensa?", re: /a55|galaxy|compens|recomend|indic|porque|vale/i },
    { q: "você recomenda o Moto G84?", re: /moto|g84|recomend|indic|porque|escolh/i },
    { q: "acha bom o iPhone 15?", re: /iphone|15|bom|recomend|indic|porque|escolh/i },
    { q: "vc compraria o Redmi Note 13?", re: /redmi|note|13|compr|recomend|indic|porque/i },
  ];
  for (const { q, re } of queries) {
    await newSession("specific-product");
    const r = await send(q);
    record(`specific-${q.slice(0, 20).replace(/\W+/g, "-")}`, r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && re.test(r.reply), r.reply, { family: "produto_especifico", query: q });
    scenarios.push({ family: "produto_especifico", query: q, reply: r.reply.slice(0, 280) });
    await gap();
  }
}

// ── 2. Busca genérica ──
{
  const queries = [
    { q: "celular até 2500 com boa bateria", re: /celular|recomend|indic|bateria|2500|galaxy|iphone|samsung|motorola/i },
    { q: "notebook pra estudar até 4 mil", re: /notebook|faculdade|estud|recomend|indic|4\s?mil|lenovo|asus/i },
    { q: "monitor gamer bom custo benefício", re: /monitor|gamer|custo|benef|recomend|indic|me conta/i },
    { q: "fone bluetooth barato e bom", re: /fone|bluetooth|recomend|indic|barat|audio|me conta/i },
  ];
  for (const { q, re } of queries) {
    await newSession("generic-search");
    const r = await send(q);
    record(`generic-${q.slice(0, 18).replace(/\W+/g, "-")}`, r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && re.test(r.reply), r.reply, { family: "busca_generica", query: q });
    scenarios.push({ family: "busca_generica", query: q, reply: r.reply.slice(0, 280) });
    await gap();
  }
}

// ── 3. Comparação ──
{
  const queries = [
    { q: "Galaxy A55 ou S23 FE, qual prefere?", re: /a55|s23|fe|galaxy|prefere|escolh|recomend|melhor|porque/i },
    { q: "iPhone 15 vs Galaxy S24 qual escolher?", re: /iphone|15|s24|galaxy|escolh|recomend|melhor|porque/i },
    { q: "Moto G84 ou Galaxy A35?", re: /moto|g84|a35|galaxy|recomend|escolh|melhor|porque/i },
  ];
  for (const { q, re } of queries) {
    await newSession("comparison");
    const r = await send(q);
    record(`compare-${q.slice(0, 18).replace(/\W+/g, "-")}`, r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && re.test(r.reply), r.reply, { family: "comparacao", query: q });
    scenarios.push({ family: "comparacao", query: q, reply: r.reply.slice(0, 280) });
    await gap();
  }
}

// ── 4. Prioridade ──
{
  const flows = [
    { setup: "Quero celular Samsung até 3 mil.", q: "bateria é minha prioridade", re: /bateria|autonomia|priorid|reavali|considerando/i },
    { setup: "celular até 2800", q: "câmera importa mais pra mim", re: /câmera|camera|foto|priorid|reavali|considerando/i },
    { setup: "quero um celular bom", q: "desempenho em primeiro lugar", re: /desempenho|performance|priorid|reavali|considerando|jogo/i },
    { setup: "preciso trocar de celular", q: "quero economizar o máximo possível", re: /econom|barat|orçament|priorid|reavali|considerando|preço/i },
  ];
  for (const { setup, q, re } of flows) {
    await newSession("priority");
    await send(setup);
    await sleep(DELAY);
    const r = await send(q);
    record(`priority-${q.slice(0, 18).replace(/\W+/g, "-")}`, r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && re.test(r.reply), r.reply, { family: "prioridade", query: q });
    scenarios.push({ family: "prioridade", setup, query: q, reply: r.reply.slice(0, 280) });
    await gap();
  }
}

// ── 5. Mudança de preferência ──
{
  await newSession("preference-change");
  await send("Quero celular Samsung até 2500.");
  await sleep(DELAY);
  let r = await send("mudei de ideia, agora quero iPhone");
  record("pref-change-iphone", r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && /iphone|mudei|reavali|considerando|apple/i.test(r.reply), r.reply, { family: "mudanca_preferencia" });
  scenarios.push({ family: "mudanca_preferencia", query: "mudei de ideia, agora quero iPhone", reply: r.reply.slice(0, 280) });
  await gap();

  await newSession("preference-rethink");
  await send("Galaxy A55 ou S23 FE?");
  await sleep(DELAY);
  r = await send("pensei melhor, desconsidere o anterior e foca no A55");
  record("pref-rethink-a55", r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && /a55|pensei|reavali|considerando|foc/i.test(r.reply), r.reply, { family: "mudanca_preferencia" });
  scenarios.push({ family: "mudanca_preferencia", query: "pensei melhor, desconsidere o anterior", reply: r.reply.slice(0, 280) });
  await gap();
}

// ── 6. Contestação ──
{
  const flows = [
    { setup: "A55 ou S23 FE?", q: "discordo, prefiro o S23 FE", re: /s23|fe|discord|entend|continuo|mantenho|considerando/i },
    { setup: "Galaxy A55 vale a pena?", q: "mas vi um review diferente, achei o A35 melhor", re: /a35|a55|review|entend|considerando|continuo/i },
    { setup: "iPhone 15 vs S24", q: "prefiro esse da Samsung na real", re: /samsung|s24|prefere|entend|considerando|continuo/i },
  ];
  for (const { setup, q, re } of flows) {
    await newSession("contestation");
    await send(setup);
    await sleep(DELAY);
    const r = await send(q);
    record(`contest-${q.slice(0, 16).replace(/\W+/g, "-")}`, r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && re.test(r.reply), r.reply, { family: "contestacao", query: q });
    scenarios.push({ family: "contestacao", setup, query: q, reply: r.reply.slice(0, 280) });
    await gap();
  }
}

// ── 7. Continuidade ──
{
  await newSession("continuity");
  await send("A55 ou S23 FE?");
  await sleep(DELAY);
  const turns = [
    { q: "e o outro?", re: /a55|s23|fe|outro|segundo|alternativ|runner|quase/i },
    { q: "explica melhor por quê?", re: /porque|por quê|motivo|ganh|abre mão|troca|considerando/i },
    { q: "continua", re: /a55|s23|fe|continu|mantenho|recomend|escolh/i },
  ];
  const trace = [];
  for (const { q, re } of turns) {
    await sleep(DELAY);
    const r = await send(q);
    const pass = r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && re.test(r.reply);
    record(`continuity-${q.replace(/\W+/g, "-")}`, pass, r.reply, { family: "continuidade", query: q });
    trace.push({ query: q, reply: r.reply.slice(0, 220), pass });
  }
  scenarios.push({ family: "continuidade", turns: trace });
  await screenshot("continuity-flow");
  await gap();
}

// ── 8. Casual + Comercial ──
{
  await newSession("casual-commercial");
  await send("bom dia, tudo bem?");
  await sleep(DELAY);
  const r = await send("obrigado! agora me indica um celular até 2 mil");
  record("casual-then-commercial", r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && /celular|recomend|indic|2000|2\s?mil|galaxy|iphone|samsung/i.test(r.reply), r.reply, { family: "casual_comercial" });
  scenarios.push({ family: "casual_comercial", turns: ["bom dia", "celular até 2 mil"], reply: r.reply.slice(0, 280) });
  await gap();
}

// ── 9. Digitação imperfeita ──
{
  const typos = [
    { q: "quero um celuar bom até 2 mil", re: /celular|recomend|indic|galaxy|iphone|samsung|motorola/i },
    { q: "preciso de baterai forte", re: /bateria|autonomia|recomend|indic|priorid|celular/i },
    { q: "iphne 15 vale?", re: /iphone|15|vale|recomend|indic|porque/i },
    { q: "samsug a55 compensa?", re: /samsung|a55|galaxy|compens|recomend|indic/i },
  ];
  for (const { q, re } of typos) {
    await newSession("typo");
    const r = await send(q);
    record(`typo-${q.slice(0, 14).replace(/\W+/g, "-")}`, r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && re.test(r.reply), r.reply, { family: "digitacao_imperfeita", query: q });
    scenarios.push({ family: "digitacao_imperfeita", query: q, reply: r.reply.slice(0, 280) });
    await gap();
  }
}

// ── 10. Fragmentação ──
{
  await newSession("fragmentation");
  const fragments = ["até 2500", "samsung", "boa bateria", "e câmera também"];
  const trace = [];
  for (const q of fragments) {
    await sleep(DELAY);
    const r = await send(q);
    trace.push({ query: q, reply: r.reply.slice(0, 200), status: r.status });
  }
  const last = trace[trace.length - 1];
  const hasContext = trace.some((t) => /bateria|samsung|2500|câmera|reavali|considerando|recomend/i.test(t.reply));
  record("fragmentation-4-turns", trace.every((t) => t.status === 200) && hasContext && isGoodReply(last.reply), last.reply, { family: "fragmentacao", turns: fragments.length });
  scenarios.push({ family: "fragmentacao", turns: trace });
  await gap();
}

// ── 11. Mudança de contexto (categorias) ──
{
  await newSession("context-switch");
  const categories = [
    { q: "celular bom até 3 mil", re: /celular|recomend|indic|galaxy|iphone|samsung/i },
    { q: "agora notebook para trabalho", re: /notebook|trabalho|recomend|indic|lenovo|asus|dell/i },
    { q: "e um monitor 27 polegadas?", re: /monitor|27|polegad|recomend|indic|me conta/i },
    { q: "voltando pro celular, qual você escolheria?", re: /celular|escolh|recomend|indic|galaxy|iphone|samsung|considerando/i },
  ];
  const trace = [];
  for (const { q, re } of categories) {
    await sleep(DELAY);
    const r = await send(q);
    const pass = r.status === 200 && !r.rate_limited && isGoodReply(r.reply) && re.test(r.reply);
    record(`ctx-${q.slice(0, 16).replace(/\W+/g, "-")}`, pass, r.reply, { family: "mudanca_contexto", query: q });
    trace.push({ query: q, reply: r.reply.slice(0, 200), pass });
  }
  scenarios.push({ family: "mudanca_contexto", turns: trace });
  await screenshot("context-switch");
}

// ── Structured facts observability ──
{
  const withFacts = technicalTraces.filter((t) => t.trace?.structuredDecisionFacts?.primaryGain);
  const withUnits = technicalTraces.filter((t) => Array.isArray(t.trace?.semanticUnits) && t.trace.semanticUnits.length > 0);
  const legacyPrimary = technicalTraces.filter((t) => t.trace?.legacyIsPrimaryTruth === true);
  record("structured-facts-present", withFacts.length >= 3, `structured_facts_turns=${withFacts.length}`, { family: "observability" });
  record("semantic-units-present", withUnits.length >= 3, `semantic_units_turns=${withUnits.length}`, { family: "observability" });
  record("legacy-not-primary-truth", legacyPrimary.length === 0, `legacy_primary_count=${legacyPrimary.length}`, { family: "observability" });
}

const bubbles = await page.locator(".mia-msg-assistant-bubble").count();
record("ui-assistant-bubbles", bubbles >= 10, `assistant_bubbles=${bubbles}`, { family: "ui" });

await browser.close();

let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const passed = checks.filter((c) => c.pass).length;
const families = [...new Set(checks.map((c) => c.family).filter(Boolean))];
const evidence = {
  patch: "4A.3V",
  parent_patch: "4A.3",
  phase: "local_browser_validation",
  status: passed === checks.length ? "APROVADA" : "BLOQUEADA",
  url: URL,
  commit,
  finished_at: new Date().toISOString(),
  families_covered: families,
  checks,
  scenarios,
  technical_traces: technicalTraces.map((t) => ({
    query: t.query,
    status: t.status,
    hasSemanticUnits: Array.isArray(t.trace?.semanticUnits) ? t.trace.semanticUnits.length > 0 : false,
    hasStructuredFacts: Boolean(t.trace?.structuredDecisionFacts?.primaryGain),
    legacyIsPrimaryTruth: t.trace?.legacyIsPrimaryTruth,
    winner: t.trace?.winner,
  })),
  summary: { total: checks.length, passed, failed: checks.length - passed },
  screenshots: fs.existsSync(SCREENSHOT_DIR) ? fs.readdirSync(SCREENSHOT_DIR).map((f) => `screenshots-4a3v/${f}`) : [],
};
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`\nPATCH 4A.3V local browser: ${passed}/${checks.length} passed`);
console.log(`Evidence: ${EVIDENCE}`);
process.exit(passed === checks.length ? 0 : 1);
