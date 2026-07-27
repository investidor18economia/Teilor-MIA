#!/usr/bin/env node
/**
 * PATCH 4A.8 — Priority personalization conversation validation
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MODE = process.env.PATCH4A8_MODE || "local";
const BASE =
  MODE === "production"
    ? process.env.PATCH4A8_PROD_BASE_URL || "https://economia-ai.vercel.app"
    : process.env.PATCH4A8_LOCAL_BASE_URL || "http://localhost:3008";
const CHAT_URL = `${BASE}/api/mia-chat`;
const DELAY = Number(process.env.PATCH4A8_CHAT_DELAY_MS || 8000);
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const EVIDENCE = path.join(
  EVIDENCE_DIR,
  MODE === "production"
    ? "PATCH_4A_8_PRODUCTION_PRIORITY_EVIDENCE.json"
    : "PATCH_4A_8_LOCAL_PRIORITY_EVIDENCE.json"
);

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

function extractPrioritySnapshot(session = {}) {
  const model = session?.lastContextualPriorityModel;
  if (!model?.criteria?.length) return null;
  return {
    dominantCriterion: model.dominantCriterion || null,
    personalized: !!model.personalized,
    conservativeFallback: !!model.conservativeFallback,
    confidence: model.confidence || null,
    topCriteria: model.criteria.slice(0, 3).map((entry) => ({
      criterion: entry.criterion,
      finalWeight: entry.finalWeight,
      origin: entry.origin,
      confidence: entry.confidence,
    })),
  };
}

function analyzeTurn(reply = "", session = {}, expectations = {}) {
  const priority = extractPrioritySnapshot(session);
  const minLen = expectations.minLen ?? 40;
  const hasModel = !!priority;
  const pass =
    expectations.httpStatus === 200 &&
    reply.length >= minLen &&
    (!expectations.requireModel || hasModel) &&
    (!expectations.requirePersonalized || priority?.personalized === true) &&
    (!expectations.expectedDominant ||
      priority?.dominantCriterion === expectations.expectedDominant) &&
    (!expectations.requireConservative ||
      priority?.conservativeFallback === true ||
      (hasModel && !priority?.personalized));

  return { priority, pass, hasModel };
}

const scenarios = [];

async function runScenario(def) {
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
    const analysis = analyzeTurn(result.reply, session, {
      ...turn,
      httpStatus: result.status,
      minLen: turn.minLen ?? (/contesta|na verdade|prefiro/i.test(turn.message) ? 25 : 40),
    });
    const turnPass = result.status === 200 && analysis.pass;
    if (!turnPass) scenarioPass = false;
    transcript.push({
      turn: transcript.length + 1,
      user: turn.message,
      assistant: result.reply,
      priority: analysis.priority,
      winner: session?.lastBestProduct?.product_name || null,
      pass: turnPass,
    });
  }

  scenarios.push({ id: def.id, title: def.title, environment: MODE, pass: scenarioPass, transcript });
  console.log(`${scenarioPass ? "PASS" : "FAIL"} [${def.id}] ${def.title}`);
  return scenarioPass;
}

console.log(`\nPATCH 4A.8 — Priority validation (${MODE})\nBase: ${BASE}\n`);

let localCommit = "unknown";
try {
  localCommit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const defs = [
  {
    id: "p1-gamer",
    title: "Positivo — gamer / desempenho",
    turns: [
      {
        message: "quero um celular para jogar até 2500, desempenho é o mais importante",
        requireModel: true,
        requirePersonalized: true,
        expectedDominant: "processor",
      },
    ],
  },
  {
    id: "p2-photographer",
    title: "Positivo — fotógrafo",
    turns: [
      {
        message: "quero um celular bom para fotografia até 2500",
        requireModel: true,
        requirePersonalized: true,
        expectedDominant: "camera",
      },
    ],
  },
  {
    id: "p3-student",
    title: "Positivo — estudante / custo-benefício",
    turns: [
      {
        message: "quero um celular para estudar até 2500, gastar pouco é o mais importante",
        requireModel: true,
        requirePersonalized: true,
        expectedDominant: "value",
      },
    ],
  },
  {
    id: "p4-basic-use",
    title: "Positivo — uso básico",
    turns: [
      {
        message: "o Galaxy A55 vale a pena para uso básico no dia a dia?",
        requireModel: true,
        requirePersonalized: true,
      },
    ],
  },
  {
    id: "p5-priority-shift",
    title: "Mudança dinâmica de prioridade",
    turns: [
      { message: "quero um celular até 2500" },
      {
        message: "bateria é minha prioridade",
        requireModel: true,
        requirePersonalized: true,
        expectedDominant: "battery",
      },
      {
        message: "na verdade câmera importa mais",
        requireModel: true,
        requirePersonalized: true,
        expectedDominant: "camera",
      },
    ],
  },
  {
    id: "n1-no-priority",
    title: "Negativo — sem prioridade explícita",
    turns: [
      {
        message: "o Galaxy A55 vale a pena?",
        requireModel: true,
        requireConservative: true,
        minLen: 40,
      },
    ],
  },
  {
    id: "n2-conflict",
    title: "Negativo — prioridades conflitantes",
    turns: [
      {
        message: "quero o mais barato possível mas também o mais potente com a melhor câmera até 2500",
        minLen: 30,
      },
    ],
  },
];

const results = [];
for (const def of defs) {
  results.push(await runScenario(def));
}

const passed = results.filter(Boolean).length;
const payload = {
  patch: "4A.8",
  phase: "contextual_priority_validation",
  status: passed === results.length ? "APROVADA" : "BLOQUEADA",
  mode: MODE,
  base_url: BASE,
  commit: localCommit,
  finished_at: new Date().toISOString(),
  summary: { passed, failed: results.length - passed, total: results.length },
  scenarios,
};

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(payload, null, 2));

console.log(`\nPATCH 4A.8 (${MODE}): ${passed}/${results.length} scenarios passed`);
console.log(`Evidence: ${EVIDENCE}`);
process.exit(passed === results.length ? 0 : 1);
