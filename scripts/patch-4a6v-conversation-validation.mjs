#!/usr/bin/env node
/**
 * PATCH 4A.6V — Full conversation surface validation (local + production)
 * Captures COMPLETE replies — no truncation.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  detectArtificialBecauseFragment,
  detectDominantOpeningTemplate,
} from "../lib/miaVerbalizationStyleGovernor.js";
import {
  computeRepetitionMetrics,
  detectBrokenSurfaceGrammar,
  validateComposedSurface,
} from "../lib/miaVerbalizationCompositionGuard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MODE = process.env.PATCH4A6V_MODE || "local";
const BASE =
  MODE === "production"
    ? process.env.PATCH4A6V_PROD_BASE_URL || "https://economia-ai.vercel.app"
    : process.env.PATCH4A6V_LOCAL_BASE_URL || "http://localhost:3007";
const CHAT_URL = `${BASE}/api/mia-chat`;
const DELAY = Number(process.env.PATCH4A6V_CHAT_DELAY_MS || 8000);
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const EVIDENCE = path.join(EVIDENCE_DIR, "PATCH_4A_6V_ROOT_CAUSE_EVIDENCE.json");
const STUB_CONTINUATION = /^(?:claro,?\s*(?:sigo aqui|posso continuar|vamos lá)|pode continuar)\.?$/i;

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
    if (res.status === 200 && reply.length >= 25) return result;
    if (attempt === 0 && (res.status >= 500 || reply.length < 25)) {
      await sleep(DELAY);
      continue;
    }
    return result;
  }
  return { status: 500, reply: "", sessionContext: {} };
}

function analyzeReply(reply = "", userMessage = "") {
  const artificial = detectArtificialBecauseFragment(reply);
  const dominantOpening = detectDominantOpeningTemplate(reply);
  const grammar = detectBrokenSurfaceGrammar(reply);
  const repetition = computeRepetitionMetrics(reply);
  const surface = validateComposedSurface(reply);
  const stubContinuation =
    /continua|explica melhor|segue/i.test(userMessage) && STUB_CONTINUATION.test(reply.trim());
  return {
    artificialBecause: artificial,
    dominantOpeningTemplate: dominantOpening,
    grammar,
    repetition,
    surface,
    stubContinuation,
    pass:
      !artificial.detected &&
      !dominantOpening.detected &&
      !grammar.detected &&
      surface.pass &&
      !stubContinuation,
  };
}

const scenarios = [];

async function runScenario(id, title, turns) {
  const conversationId = randomUUID();
  let session = {};
  const transcript = [];
  let scenarioPass = true;
  const messageHistory = [];

  for (const turn of turns) {
    if (turn.delay) await sleep(turn.delay);
    else await sleep(DELAY);
    messageHistory.push({ role: "user", content: turn.message });
    const result = await sendChat(turn.message, session, messageHistory, conversationId);
    session = result.sessionContext || session;
    const analysis = analyzeReply(result.reply, turn.message);
    const minLen = /continua|explica melhor|segue/i.test(turn.message) ? 40 : 25;
    const turnPass = result.status === 200 && analysis.pass && result.reply.length >= minLen;
    if (!turnPass) scenarioPass = false;
    transcript.push({
      turn: transcript.length + 1,
      user: turn.message,
      assistant: result.reply,
      analysis,
      httpStatus: result.status,
      pass: turnPass,
    });
  }

  scenarios.push({
    id,
    title,
    environment: MODE,
    pass: scenarioPass,
    transcript,
  });
  console.log(`${scenarioPass ? "PASS" : "FAIL"} [${id}] ${title}`);
  return scenarioPass;
}

console.log(`\nPATCH 4A.6V — Surface validation (${MODE})\nBase: ${BASE}\n`);

let localCommit = "unknown";
try {
  localCommit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const results = [];

results.push(
  await runScenario("c1-budget-explore", "Cenário 1 — recomendação até 2 mil + follow-ups", [
    { message: "Qual celular você recomenda até 2 mil?" },
    { message: "Por quê?" },
    { message: "E o lado ruim?" },
    { message: "Continua." },
    { message: "Mas se câmera for prioridade?" },
  ])
);

results.push(
  await runScenario("c2-product-lock-why", "Cenário 2 — product lock repetido", [
    { message: "o Galaxy A55 vale a pena?" },
    { message: "Por que escolheu esse?" },
    { message: "Por que escolheu esse?" },
    { message: "Por que escolheu esse?" },
  ])
);

results.push(
  await runScenario("c3-comparison", "Cenário 3 — comparação A56 vs Edge 60", [
    { message: "Galaxy A56 vs Motorola Edge 60, qual você prefere?" },
    { message: "e na prática, qual leva vantagem?" },
  ])
);

results.push(
  await runScenario("c4-priority-change", "Cenário 4 — mudança de prioridade", [
    { message: "quero um celular até 2500" },
    { message: "bateria é minha prioridade" },
    { message: "na verdade câmera importa mais" },
  ])
);

results.push(
  await runScenario("c5-contestation", "Cenário 5 — contestação", [
    { message: "o Galaxy A55 vale a pena?" },
    { message: "mas eu achei o S23 FE melhor" },
  ])
);

results.push(
  await runScenario("c6-long-continuity", "Cenário 6 — continuidade 8 turnos", [
    { message: "quero um celular até 2000" },
    { message: "uso muito fora de casa" },
    { message: "e mais barato?" },
    { message: "quem ficou logo atrás?" },
    { message: "e a bateria dele?" },
    { message: "continua" },
    { message: "pode ser Motorola também" },
    { message: "então qual fica?" },
  ])
);

results.push(
  await runScenario("c7-continuity-10", "Cenário 7 — continuidade 10 turnos", [
    { message: "o Galaxy A55 vale a pena?" },
    { message: "por quê?" },
    { message: "continua" },
    { message: "explica melhor" },
    { message: "e a câmera?" },
    { message: "e a bateria?" },
    { message: "mas discordo" },
    { message: "continua" },
    { message: "e o lado ruim?" },
    { message: "conclusão" },
  ])
);

const passed = results.filter(Boolean).length;
const failed = results.length - passed;
const payload = {
  patch: "4A.6V",
  phase: "root_cause_surface_validation",
  status: failed === 0 ? "APROVADA" : "BLOQUEADA",
  mode: MODE,
  base_url: BASE,
  commit: localCommit,
  finished_at: new Date().toISOString(),
  summary: { passed, failed, total: results.length },
  scenarios,
};

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(payload, null, 2));

console.log(`\nPATCH 4A.6V (${MODE}): ${passed}/${results.length} scenarios passed`);
console.log(`Evidence: ${EVIDENCE}`);
process.exit(failed ? 1 : 0);
