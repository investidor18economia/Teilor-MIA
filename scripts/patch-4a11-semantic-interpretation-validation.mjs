#!/usr/bin/env node
/**
 * PATCH 4A.11 — Semantic interpretation validation (LOCAL / REAL)
 *
 * Usage:
 *   node scripts/patch-4a11-semantic-interpretation-validation.mjs
 *   PATCH4A11_MODE=production node scripts/patch-4a11-semantic-interpretation-validation.mjs
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  auditInterpretationChain,
  buildInterpretationTraceFromSession,
  validateInterpretationTrace,
} from "../lib/miaInterpretationTrace.js";
import { detectAbsoluteClaimsOnSurface } from "../lib/miaAbsoluteClaimGovernance.js";
import {
  detectBrokenSurfaceGrammar,
  validateComposedSurface,
} from "../lib/miaVerbalizationCompositionGuard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MODE = process.env.PATCH4A11_MODE || "local";
const BASE =
  MODE === "production"
    ? process.env.PATCH4A11_PROD_BASE_URL || "https://economia-ai.vercel.app"
    : process.env.PATCH4A11_LOCAL_BASE_URL || "http://localhost:3008";
const CHAT_URL = `${BASE}/api/mia-chat`;
const DELAY = Number(process.env.PATCH4A11_CHAT_DELAY_MS || 6000);
const FIDELITY_SAMPLE_SIZE = Number(process.env.PATCH4A11_FIDELITY_SAMPLE_SIZE || 20);
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const EVIDENCE = path.join(
  EVIDENCE_DIR,
  MODE === "production"
    ? "PATCH_4A_11_PRODUCTION_SEMANTIC_INTERPRETATION_EVIDENCE.json"
    : "PATCH_4A_11_LOCAL_SEMANTIC_INTERPRETATION_EVIDENCE.json"
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
    if (res.status === 200 && reply.length >= 20) return result;
    if (attempt === 0 && (res.status >= 500 || reply.length < 20)) {
      await sleep(DELAY);
      continue;
    }
    return result;
  }
  return { status: 500, reply: "", sessionContext: {} };
}

function buildFidelityEntry(reply, session, scenarioId) {
  const trace = buildInterpretationTraceFromSession(session, reply);
  const validation = validateInterpretationTrace(trace);
  const primaryClaim = trace.claims[0] || null;
  return {
    scenarioId,
    renderedSentence: reply.slice(0, 220),
    claim: primaryClaim?.claim || null,
    evidence: primaryClaim?.evidence || [],
    interpreter: primaryClaim?.interpreter || null,
    reasoning: primaryClaim?.reasoning || null,
    confidence: primaryClaim?.confidence || null,
    limitations: primaryClaim?.limitations || [],
    traceValid: validation.valid,
    traceReasons: validation.reasons,
    couldExistWithoutPCE: !trace.cognitiveChain.practicalConsequenceEngine?.count,
    couldExistWithoutDomain: !trace.cognitiveChain.domainAdapter?.itemCount,
    dependsOnlyOnLlm: validation.reasons.includes("llm_as_interpreter"),
    limitationsDeclared: trace.limitationsDeclared,
  };
}

const POSITIVE_SCENARIOS = {
  battery: {
    title: "Bateria — interpretação rica",
    expectedDominant: "battery",
    requireArchitecture: true,
    requireClaims: true,
    variations: [
      "qual celular dura mais ate 2500?",
      "nao quero carregar toda hora, qual celular ate 2000?",
    ],
  },
  camera: {
    title: "Câmera — interpretação rica",
    expectedDominant: "camera",
    requireArchitecture: true,
    requireClaims: true,
    variations: ["quero celular com camera boa ate 2500", "qual tira foto melhor ate 2000?"],
  },
  games: {
    title: "Desempenho / jogos",
    expectedDominant: "processor",
    requireArchitecture: true,
    requireClaims: true,
    variations: ["quero celular pra jogar ate 3000", "quero celular bom para jogos pesados ate 2800"],
  },
  value: {
    title: "Custo-benefício",
    expectedDominant: "value",
    requireArchitecture: true,
    requireClaims: true,
    variations: ["qual tem melhor custo beneficio ate 2000?", "bang for buck celular ate 1800"],
  },
  updates: {
    title: "Atualizações / longevidade",
    expectedDominant: "longevity",
    requireArchitecture: true,
    requireClaims: true,
    flexibleDominant: true,
    variations: ["qual celular recebe update por mais tempo ate 2500?"],
  },
  comparison: {
    title: "Comparação",
    requireArchitecture: true,
    requireClaims: true,
    variations: [
      "compara galaxy a55 com iphone 13",
      "o Galaxy A55 vale mais que o iPhone 13?",
    ],
  },
  contestation: {
    title: "Contestation",
    requireArchitecture: true,
    requireClaims: true,
    multiTurn: [
      { message: "o Galaxy A55 vale a pena?" },
      { message: "mas eu achei o S23 FE melhor" },
    ],
  },
  tradeoff: {
    title: "Tradeoffs",
    requireArchitecture: true,
    requireClaims: true,
    variations: ["Galaxy A55 vale a pena?"],
  },
};

const NEGATIVE_SCENARIOS = {
  insufficient_data: {
    title: "Dados insuficientes",
    requireLimitations: true,
    clarificationOk: true,
    variations: ["quero um celular bom"],
  },
  incomplete_specs: {
    title: "Specs incompletas / produto genérico",
    requireLimitations: true,
    clarificationOk: true,
    variations: ["me fala as specs do Celular Fantasma Pro 2026"],
  },
  unknown_product: {
    title: "Produto inexistente",
    requireLimitations: true,
    clarificationOk: true,
    variations: ["o Smartphone Fantasma Pro Max vale a pena?"],
  },
  unknown_category: {
    title: "Categoria desconhecida",
    requireLimitations: true,
    clarificationOk: true,
    variations: ["qual o melhor foguete espacial ate 5000?"],
  },
  missing_knowledge: {
    title: "Conhecimento ausente",
    requireLimitations: true,
    clarificationOk: true,
    variations: ["qual celular tem melhor refrigeracao liquida ate 4000?"],
  },
};

const scenarios = [];
const fidelityClaims = [];
let totalTurns = 0;
let auditedClaims = 0;
let tracedChains = 0;
const componentsAudited = new Set([
  "ConsequenceTranslationLayer",
  "PracticalConsequenceEngine",
  "ContextualPriorityEngine",
  "DomainKnowledgeAdapter",
  "StructuredDecisionFacts",
  "NarrativePlanner",
  "SemanticVerbalizer",
  "AbsoluteClaimGovernance",
  "VerbalizationCompositionGuard",
]);

function recordScenario(entry) {
  scenarios.push(entry);
  if (entry.interpretation?.claimCount) auditedClaims += entry.interpretation.claimCount;
  if (entry.interpretation?.hasArchitecture) tracedChains += 1;
}

async function runVariation(familyId, def, message, index) {
  const id = `${familyId}-v${index + 1}`;
  const scenarioType = def.requireLimitations ? "negative" : "positive";
  const chat = await sendChat(message);
  totalTurns += 1;
  await sleep(DELAY);

  const interpretation = auditInterpretationChain(chat.sessionContext, chat.reply, {
    requireArchitecture: def.requireArchitecture,
    requireClaims: def.requireClaims,
    requireLimitations: def.requireLimitations,
    clarificationOk: def.clarificationOk,
    minLen: 30,
  });

  const absolute = detectAbsoluteClaimsOnSurface(chat.reply);
  const surface = validateComposedSurface(chat.reply);
  const grammar = detectBrokenSurfaceGrammar(chat.reply);

  const dominant = interpretation.trace?.cognitiveChain?.priorityEngine?.dominantCriterion;
  const intentMatch =
    !def.expectedDominant ||
    dominant === def.expectedDominant ||
    def.flexibleDominant ||
    (def.clarificationOk && interpretation.clarificationReply);

  const pass =
    chat.status === 200 &&
    interpretation.pass &&
    intentMatch &&
    !absolute.detected &&
    surface.pass &&
    !grammar.detected;

  if (fidelityClaims.length < FIDELITY_SAMPLE_SIZE) {
    fidelityClaims.push(buildFidelityEntry(chat.reply, chat.sessionContext, id));
  }

  recordScenario({
    id,
    family: familyId,
    type: scenarioType,
    environment: MODE,
    message,
    pass,
    replyPreview: chat.reply.slice(0, 180),
    interpretation: {
      claimCount: interpretation.claimCount,
      hasArchitecture: interpretation.hasArchitecture,
      limitationsDeclared: interpretation.limitationsDeclared,
      validationReasons: interpretation.validation.reasons,
      dominantCriterion: dominant,
    },
    narrative: {
      absoluteClaims: absolute.detected,
      surfaceValid: surface.pass,
      brokenGrammar: grammar.detected,
    },
    cognitiveChain: interpretation.trace?.cognitiveChain || null,
  });

  return pass;
}

async function runMultiTurn(familyId, def) {
  const id = `${familyId}-multi`;
  let session = {};
  const messages = [];
  const conversationId = randomUUID();
  let lastReply = "";
  let lastInterpretation = null;

  for (const turn of def.multiTurn) {
    const chat = await sendChat(turn.message, session, messages, conversationId);
    session = chat.sessionContext;
    messages.push({ role: "user", content: turn.message });
    messages.push({ role: "assistant", content: chat.reply });
    lastReply = chat.reply;
    lastInterpretation = auditInterpretationChain(session, chat.reply, {
      requireArchitecture: def.requireArchitecture,
      requireClaims: def.requireClaims,
      clarificationOk: def.clarificationOk,
    });
    totalTurns += 1;
    await sleep(DELAY);
  }

  const absolute = detectAbsoluteClaimsOnSurface(lastReply);
  const surface = validateComposedSurface(lastReply);
  const pass =
    lastInterpretation.pass &&
    !absolute.detected &&
    surface.pass;

  if (fidelityClaims.length < FIDELITY_SAMPLE_SIZE) {
    fidelityClaims.push(buildFidelityEntry(lastReply, session, id));
  }

  recordScenario({
    id,
    family: familyId,
    type: "positive",
    environment: MODE,
    turns: def.multiTurn.length,
    pass,
    replyPreview: lastReply.slice(0, 180),
    interpretation: {
      claimCount: lastInterpretation.claimCount,
      hasArchitecture: lastInterpretation.hasArchitecture,
      validationReasons: lastInterpretation.validation.reasons,
    },
    narrative: { absoluteClaims: absolute.detected, surfaceValid: surface.pass },
    cognitiveChain: lastInterpretation.trace?.cognitiveChain || null,
  });

  return pass;
}

console.log(`\nPATCH 4A.11 — Semantic interpretation validation (${MODE})\n`);
console.log(`Base: ${BASE}\n`);

const results = [];

for (const [familyId, def] of Object.entries(POSITIVE_SCENARIOS)) {
  if (def.multiTurn) {
    results.push(await runMultiTurn(familyId, def));
  } else {
    for (let i = 0; i < def.variations.length; i += 1) {
      results.push(await runVariation(familyId, def, def.variations[i], i));
    }
  }
}

for (const [familyId, def] of Object.entries(NEGATIVE_SCENARIOS)) {
  for (let i = 0; i < def.variations.length; i += 1) {
    results.push(await runVariation(familyId, def, def.variations[i], i));
  }
}

const passed = results.filter(Boolean).length;
const failed = results.length - passed;

let localCommit = "unknown";
try {
  localCommit = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const payload = {
  patch: "4A.11",
  phase: "semantic_interpretation_audit",
  status: failed === 0 ? "APROVADA" : "BLOQUEADA",
  mode: MODE,
  base_url: BASE,
  commit: localCommit,
  finished_at: new Date().toISOString(),
  summary: {
    passed,
    failed,
    total: results.length,
    turns: totalTurns,
    auditedClaims,
    tracedChains,
    componentsAudited: [...componentsAudited],
    fidelitySampleSize: fidelityClaims.length,
  },
  coverage: {
    absolute: {
      claimsAudited: auditedClaims,
      chainsTraced: tracedChains,
      componentsAudited: componentsAudited.size,
      scenarios: scenarios.length,
      turns: totalTurns,
      fidelityClaims: fidelityClaims.length,
    },
    relative: {
      coveragePercent: null,
      coveragePercentNote:
        "NULL — não existe denominador objetivo para 'todas as afirmações possíveis da MIA'; amostra de fidelidade fixada em 20 respostas reais.",
      limitations: [
        "Auditoria cobre mobile como domínio principal",
        "Cadeia offline validada separadamente no unit audit",
        "LLM surface rendering avaliado indiretamente via Composition Guard + confidence alignment",
      ],
    },
  },
  fidelityClaims,
  scenarios,
};

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(payload, null, 2));

console.log(`\nEvidence: ${EVIDENCE}`);
console.log(`Result: ${passed}/${results.length} passed — ${payload.status}\n`);
if (failed) process.exit(1);
