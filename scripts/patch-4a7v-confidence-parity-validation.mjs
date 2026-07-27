#!/usr/bin/env node
/**
 * PATCH 4A.7V — Confidence governance + LOCAL × REAL parity validation
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  containsAbsoluteClaim,
  validateConfidenceReplyAlignment,
} from "../lib/miaAbsoluteClaimGovernance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MODE = process.env.PATCH4A7V_MODE || "local";
const RUNS = Math.max(1, Number(process.env.PATCH4A7V_RUNS || 2));
const BASE =
  MODE === "production"
    ? process.env.PATCH4A7V_PROD_BASE_URL || "https://economia-ai.vercel.app"
    : process.env.PATCH4A7V_LOCAL_BASE_URL || "http://localhost:3008";
const CHAT_URL = `${BASE}/api/mia-chat`;
const DELAY = Number(process.env.PATCH4A7V_CHAT_DELAY_MS || 8000);
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const EVIDENCE = path.join(
  EVIDENCE_DIR,
  MODE === "production"
    ? "PATCH_4A_7V_PRODUCTION_CONFIDENCE_PARITY_EVIDENCE.json"
    : "PATCH_4A_7V_LOCAL_CONFIDENCE_PARITY_EVIDENCE.json"
);

const INVENTED_CHARGING_MINUTES = /\b\d+\s*minutos?\s*(?:para|de)\s*carregar/i;
const HEDGED_MARKERS =
  /\b(tende a|pode|costuma|em geral|depende|evidências limitadas|não posso afirmar|não encontrei|informação insuficiente|não existem dados|veredito seguro|preciso de|opção válida|confirmar preço|uso real|catálogo|com segurança)\b/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendChat(message, sessionContext = {}, messages = [], conversationId = "") {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        messages,
        session_context: sessionContext,
        conversation_id: conversationId,
      }),
    });
    const json = await res.json().catch(() => ({}));
    const reply = String(json?.reply || json?.message || "").trim();
    const result = {
      status: res.status,
      reply,
      sessionContext: json?.session_context || {},
    };
    if (res.status === 200 && reply.length >= 20) return result;
    if (attempt === 0 && (res.status >= 500 || reply.length < 20)) {
      await sleep(DELAY);
      continue;
    }
    return result;
  }
  return { status: 500, reply: "", sessionContext: {} };
}

function extractPracticalSnapshot(session = {}) {
  const list = Array.isArray(session?.lastPracticalConsequences)
    ? session.lastPracticalConsequences
    : [];
  return list.map((entry) => ({
    category: entry?.category || null,
    confidence: entry?.confidence || null,
    practicalMeaning: entry?.practicalMeaning || null,
    limitations: entry?.limitations || [],
    source: entry?.source?.primary || null,
  }));
}

function analyzeTurn(reply = "", session = {}, options = {}) {
  const minLen = options.minLen ?? 40;
  const consequences = extractPracticalSnapshot(session);
  const confidenceAlignment = validateConfidenceReplyAlignment(reply, consequences);
  const bannedAbsolute = containsAbsoluteClaim(reply);
  const inventedChargingMinutes = INVENTED_CHARGING_MINUTES.test(reply);
  const hasPracticalConsequences = consequences.length > 0;
  const requiresHedging = options.expectHedging === true;
  const hasHedging = HEDGED_MARKERS.test(reply);

  const pass =
    options.httpStatus === 200 &&
    !bannedAbsolute &&
    !inventedChargingMinutes &&
    reply.length >= minLen &&
    confidenceAlignment.pass &&
    (!requiresHedging || hasHedging);

  return {
    bannedAbsolute,
    inventedChargingMinutes,
    confidenceAlignment,
    hasPracticalConsequences,
    practicalConsequences: consequences,
    hasHedging,
    pass,
  };
}

const SCENARIO_DEFS = [
  {
    id: "c1-midrange-spec-why",
    title: "Cenário 1 — intermediário + por quê + bateria",
    turns: [
      { message: "o Galaxy A55 vale a pena?" },
      { message: "por quê?" },
      { message: "e a bateria dele?" },
    ],
  },
  {
    id: "c2-flagship-explore",
    title: "Cenário 2 — topo de linha até 2500",
    turns: [
      { message: "quero um celular até 2500" },
      { message: "bateria é minha prioridade" },
      { message: "e a câmera?" },
    ],
  },
  {
    id: "c3-comparison-practical",
    title: "Cenário 3 — comparação prática",
    turns: [
      { message: "Galaxy A56 vs Motorola Edge 60, qual você prefere?" },
      { message: "e na prática, qual leva vantagem?" },
    ],
  },
  {
    id: "c4-contestation",
    title: "Cenário 4 — contestação sem exagero",
    turns: [
      { message: "o Galaxy A55 vale a pena?" },
      { message: "mas eu achei o S23 FE melhor" },
    ],
  },
  {
    id: "c5-followup-spec",
    title: "Cenário 5 — follow-up técnico",
    turns: [
      { message: "o Galaxy A55 vale a pena?" },
      { message: "e a tela?" },
      { message: "e o carregamento?" },
    ],
  },
  {
    id: "n1-sparse-unknown",
    title: "Negativo 1 — produto desconhecido / dados limitados",
    turns: [{ message: "o Celular XYZ999 desconhecido vale a pena?", expectHedging: true, minLen: 25 }],
  },
  {
    id: "n2-entry-budget",
    title: "Negativo 2 — entrada / evidência limitada",
    turns: [
      {
        message: "quero um celular bem barato de entrada, até 600 reais",
        expectHedging: true,
        minLen: 30,
      },
    ],
  },
];

async function runScenarioOnce(def) {
  const conversationId = randomUUID();
  let session = {};
  const transcript = [];
  let scenarioPass = true;
  const messageHistory = [];

  for (const turn of def.turns) {
    await sleep(turn.delay ?? DELAY);
    messageHistory.push({ role: "user", content: turn.message });
    const result = await sendChat(turn.message, session, messageHistory, conversationId);
    session = result.sessionContext || session;
    const minLen =
      turn.minLen ??
      (/achei.*melhor|discordo|contesta|desconhecido|na prática/i.test(turn.message) ? 25 : 40);
    const analysis = analyzeTurn(result.reply, session, {
      minLen,
      expectHedging: turn.expectHedging === true,
      httpStatus: result.status,
    });
    const turnPass = result.status === 200 && analysis.pass;
    if (!turnPass) scenarioPass = false;
    transcript.push({
      turn: transcript.length + 1,
      user: turn.message,
      assistant: result.reply,
      analysis,
      winner: session?.lastBestProduct?.product_name || null,
      httpStatus: result.status,
      pass: turnPass,
    });
  }

  return { ...def, pass: scenarioPass, transcript };
}

async function runScenarioWithVariability(def) {
  const runs = [];
  let passCount = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const run = await runScenarioOnce(def);
    runs.push({ run: i + 1, pass: run.pass, transcript: run.transcript });
    if (run.pass) passCount += 1;
  }
  const pass = passCount === RUNS;
  console.log(`${pass ? "PASS" : "FAIL"} [${def.id}] ${def.title} (${passCount}/${RUNS} runs)`);
  return { id: def.id, title: def.title, environment: MODE, pass, runs, variability: { runs: RUNS, passCount } };
}

console.log(`\nPATCH 4A.7V — Confidence + parity validation (${MODE})\nBase: ${BASE} | Runs/scenario: ${RUNS}\n`);

let localCommit = "unknown";
try {
  localCommit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const scenarios = [];
for (const def of SCENARIO_DEFS) {
  scenarios.push(await runScenarioWithVariability(def));
}

const positive = scenarios.filter((s) => !s.id.startsWith("n"));
const negative = scenarios.filter((s) => s.id.startsWith("n"));
const passedPositive = positive.filter((s) => s.pass).length;
const passedNegative = negative.filter((s) => s.pass).length;
const allPositivePass = passedPositive === positive.length;
const allNegativePass = passedNegative === negative.length;

const payload = {
  patch: "4A.7V",
  phase: "confidence_parity_validation",
  status: allPositivePass && allNegativePass ? "APROVADA" : "BLOQUEADA",
  mode: MODE,
  base_url: BASE,
  commit: localCommit,
  finished_at: new Date().toISOString(),
  variability: { runs_per_scenario: RUNS },
  summary: {
    positive_passed: passedPositive,
    positive_total: positive.length,
    negative_passed: passedNegative,
    negative_total: negative.length,
    all_positive_pass: allPositivePass,
    all_negative_pass: allNegativePass,
  },
  scenarios,
};

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(payload, null, 2));

console.log(
  `\nPATCH 4A.7V (${MODE}): positive ${passedPositive}/${positive.length}, negative ${passedNegative}/${negative.length}`
);
console.log(`Evidence: ${EVIDENCE}`);
process.exit(allPositivePass && allNegativePass ? 0 : 1);
