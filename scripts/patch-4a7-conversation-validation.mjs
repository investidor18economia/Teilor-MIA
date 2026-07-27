#!/usr/bin/env node
/**
 * PATCH 4A.7 — Practical consequence conversation validation (local + production)
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MODE = process.env.PATCH4A7_MODE || "local";
const BASE =
  MODE === "production"
    ? process.env.PATCH4A7_PROD_BASE_URL || "https://economia-ai.vercel.app"
    : process.env.PATCH4A7_LOCAL_BASE_URL || "http://localhost:3008";
const CHAT_URL = `${BASE}/api/mia-chat`;
const DELAY = Number(process.env.PATCH4A7_CHAT_DELAY_MS || 8000);
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const EVIDENCE = path.join(EVIDENCE_DIR, "PATCH_4A_7_PRACTICAL_CONSEQUENCE_EVIDENCE.json");

const BANNED_ABSOLUTE = /\b(sempre|com certeza|garante|vai rodar tudo|vai durar o dia inteiro)\b/i;
const INVENTED_CHARGING_MINUTES = /\b\d+\s*minutos?\s*(?:para|de)\s*carregar/i;

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

function analyzeReply(reply = "", options = {}) {
  const minLen = options.minLen ?? 40;
  const hasPracticalFraming =
    /\b(no dia a dia|na prática|tende a|pode pedir|uso real|fora de casa|multitarefa|fluidez|autonomia|recarga|entendi)\b/i.test(
      reply
    );
  return {
    bannedAbsolute: BANNED_ABSOLUTE.test(reply),
    inventedChargingMinutes: INVENTED_CHARGING_MINUTES.test(reply),
    hasPracticalFraming,
    pass:
      !BANNED_ABSOLUTE.test(reply) &&
      !INVENTED_CHARGING_MINUTES.test(reply) &&
      reply.length >= minLen,
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
    await sleep(turn.delay ?? DELAY);
    messageHistory.push({ role: "user", content: turn.message });
    const result = await sendChat(turn.message, session, messageHistory, conversationId);
    session = result.sessionContext || session;
    const minLen = /achei.*melhor|discordo|contesta/i.test(turn.message) ? 25 : 40;
    const analysis = analyzeReply(result.reply, { minLen });
    const turnPass = result.status === 200 && analysis.pass;
    if (!turnPass) scenarioPass = false;
    transcript.push({
      turn: transcript.length + 1,
      user: turn.message,
      assistant: result.reply,
      analysis,
      hasPracticalConsequences: Array.isArray(session?.lastPracticalConsequences)
        ? session.lastPracticalConsequences.length > 0
        : false,
      httpStatus: result.status,
      pass: turnPass,
    });
  }

  scenarios.push({ id, title, environment: MODE, pass: scenarioPass, transcript });
  console.log(`${scenarioPass ? "PASS" : "FAIL"} [${id}] ${title}`);
  return scenarioPass;
}

console.log(`\nPATCH 4A.7 — Practical consequence validation (${MODE})\nBase: ${BASE}\n`);

let localCommit = "unknown";
try {
  localCommit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const results = [];

results.push(
  await runScenario("c1-midrange-spec-why", "Cenário 1 — intermediário + por quê + bateria", [
    { message: "o Galaxy A55 vale a pena?" },
    { message: "por quê?" },
    { message: "e a bateria dele?" },
  ])
);

results.push(
  await runScenario("c2-flagship-explore", "Cenário 2 — topo de linha até 2500", [
    { message: "quero um celular até 2500" },
    { message: "bateria é minha prioridade" },
    { message: "e a câmera?" },
  ])
);

results.push(
  await runScenario("c3-comparison-practical", "Cenário 3 — comparação prática", [
    { message: "Galaxy A56 vs Motorola Edge 60, qual você prefere?" },
    { message: "e na prática, qual leva vantagem?" },
  ])
);

results.push(
  await runScenario("c4-contestation", "Cenário 4 — contestação sem exagero", [
    { message: "o Galaxy A55 vale a pena?" },
    { message: "mas eu achei o S23 FE melhor" },
  ])
);

results.push(
  await runScenario("c5-followup-spec", "Cenário 5 — follow-up técnico", [
    { message: "o Galaxy A55 vale a pena?" },
    { message: "e a tela?" },
    { message: "e o carregamento?" },
  ])
);

const passed = results.filter(Boolean).length;
const failed = results.length - passed;
const payload = {
  patch: "4A.7",
  phase: "practical_consequence_validation",
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

console.log(`\nPATCH 4A.7 (${MODE}): ${passed}/${results.length} scenarios passed`);
console.log(`Evidence: ${EVIDENCE}`);
process.exit(failed ? 1 : 0);
