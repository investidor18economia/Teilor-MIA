/**
 * PATCH 7.6U-B — Cognitive Signal Transport Audit
 *
 * Valida que turnType + detector + subtype chegam ao metadata e ao verbalizer.
 *
 * Usage: node scripts/test-mia-cognitive-signal-transport.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "produto ate 2000";

// Mirror chat-gpt4o.js PATCH 7.6U-B helpers
function buildMiaContractMetadata(metadata = {}) {
  return {
    source: metadata.source || "unknown",
    isFollowUp: !!metadata.isFollowUp,
    category: metadata.category || "",
    priority: metadata.priority || "",
    productCount: Number(metadata.productCount || 0),
    hasProducts: !!metadata.hasProducts,
    cognitiveSignal: metadata.cognitiveSignal || null,
    createdAt: metadata.createdAt || new Date().toISOString(),
  };
}

function isCognitiveDetectorActive(detector, value) {
  if (value === true) return true;
  if (!value || typeof value !== "object") return false;
  if (detector === "decisionExplanation") return !!value.active;
  return !!value.detected;
}

function resolveCognitiveDetectorSubtype(detector, value) {
  if (!value || typeof value !== "object") return "";
  if (value.subtype) return value.subtype;
  if (detector === "alternativeRequest") {
    if (value.requestedRank != null) return `rank:${value.requestedRank}`;
    if (value.requestedTopN != null) return `topN:${value.requestedTopN}`;
  }
  return value.type || value.reason || "";
}

function buildCognitiveSignalForVerbalizer(cognitiveTurnEarly) {
  if (!cognitiveTurnEarly) return null;

  const signals = cognitiveTurnEarly.signals || {};
  const detectorPriority = [
    "projectiveRisk",
    "hesitationReaction",
    "delegationRequest",
    "decisionExplanation",
    "alternativeRequest",
  ];

  let activeDetector = "";
  let activeSubtype = "";

  for (const detector of detectorPriority) {
    const value = signals[detector];
    if (!isCognitiveDetectorActive(detector, value)) continue;

    activeDetector = detector;
    activeSubtype = resolveCognitiveDetectorSubtype(detector, value);
    break;
  }

  return {
    turnType: cognitiveTurnEarly.turnType || "",
    detector: activeDetector,
    subtype: activeSubtype,
    reasons: Array.isArray(cognitiveTurnEarly.reasons)
      ? cognitiveTurnEarly.reasons.filter(Boolean).slice(0, 8)
      : [],
  };
}

function formatCognitiveSignalVerbalizerContext(cognitiveSignal) {
  if (!cognitiveSignal?.turnType) return "";
  return (
    `\nCOGNITIVE SIGNAL (architecture-owned):\n` +
    `turnType=${cognitiveSignal.turnType}\n` +
    `detector=${cognitiveSignal.detector || ""}\n` +
    `subtype=${cognitiveSignal.subtype || ""}\n`
  );
}

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual", price: "R$ 1.899" },
  lastAxis: "equilibrio geral",
  lastMainConsequence: "desempenho solido para uso diario",
  lastTradeoff: "nao e o mais barato da lista",
};

const CASES = [
  {
    message: "nao sei se gostei",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
  },
  {
    message: "qual seria seu medo nessa compra",
    expectedTurnType: "OBJECTION",
    expectedDetector: "projectiveRisk",
    expectedSubtype: "risk_probe",
  },
  {
    message: "o que poderia dar errado",
    expectedTurnType: "OBJECTION",
    expectedDetector: "projectiveRisk",
    expectedSubtype: "risk_probe",
  },
  {
    message: "e se fosse voce",
    expectedTurnType: "EXPLANATION_REQUEST",
    expectedDetector: "delegationRequest",
    expectedSubtype: "decision_delegation",
  },
  {
    message: "nao quero fazer besteira",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "purchase_anxiety",
  },
];

function simulateTransport(message) {
  const ct = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: "decision",
    contextAction: "decision",
  });

  const cognitiveSignal = buildCognitiveSignalForVerbalizer(ct);
  const normalized = buildMiaContractMetadata({
    source: "context_followup_flow",
    isFollowUp: true,
    contextAction: "decision",
    activePriority: "equilibrio geral",
    cognitiveSignal,
  });
  const verbalizerContext = formatCognitiveSignalVerbalizerContext(cognitiveSignal);

  return { ct, cognitiveSignal, normalized, verbalizerContext };
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6u-b",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runProductionCase(message) {
  const convId = `u-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
  const s1 = {
    ...(t1.session_context || {}),
    lastAxis: SESSION.lastAxis,
    lastMainConsequence: SESSION.lastMainConsequence,
    lastTradeoff: SESSION.lastTradeoff,
  };
  const msgs = [
    { role: "user", content: PRIOR_QUERY },
    { role: "assistant", content: t1.reply || "" },
  ];
  return httpPost(message, s1, msgs, convId);
}

let passed = 0;
let failed = 0;

console.log("\n  PATCH 7.6U-B — Cognitive Signal Transport\n");

for (const c of CASES) {
  const { cognitiveSignal, normalized, verbalizerContext } = simulateTransport(c.message);

  const reachesMetadata =
    normalized.cognitiveSignal?.turnType === c.expectedTurnType &&
    normalized.cognitiveSignal?.detector === c.expectedDetector &&
    normalized.cognitiveSignal?.subtype === c.expectedSubtype;

  const reachesVerbalizer =
    verbalizerContext.includes(`turnType=${c.expectedTurnType}`) &&
    verbalizerContext.includes(`detector=${c.expectedDetector}`) &&
    verbalizerContext.includes(`subtype=${c.expectedSubtype}`);

  const record = {
    message: c.message,
    turnType: cognitiveSignal?.turnType || "",
    detector: cognitiveSignal?.detector || "",
    subtype: cognitiveSignal?.subtype || "",
    reachesMetadata,
    reachesVerbalizer,
  };

  const ok = reachesMetadata && reachesVerbalizer;
  if (ok) {
    passed++;
    console.log(`  ✓ "${c.message}"`);
  } else {
    failed++;
    console.log(`  ✗ "${c.message}"`);
  }
  console.log(`    ${JSON.stringify(record)}`);
}

console.log("\n  ── Produção (smoke + trace quando MIA_DEBUG=true) ──\n");

let prodOk = 0;
for (const c of CASES) {
  try {
    const t2 = await runProductionCase(c.message);
    const trace = t2.mia_debug?.pipelineTrace?.cognitive_signal_transport;
    const staticSim = simulateTransport(c.message).cognitiveSignal;

    if (trace) {
      const match =
        trace.turnType === staticSim.turnType &&
        trace.detector === staticSim.detector &&
        trace.subtype === staticSim.subtype;
      console.log(
        `  ${match ? "✓" : "⚠"} "${c.message}" trace=${JSON.stringify(trace)}`
      );
      if (match) prodOk++;
    } else {
      console.log(`  ○ "${c.message}" — produção OK (trace ausente; set MIA_DEBUG=true)`);
      prodOk++;
    }
  } catch (e) {
    failed++;
    console.log(`  ✗ "${c.message}" produção falhou: ${e.message}`);
  }
}

console.log(`\n  Estático: ${passed}/${CASES.length} pass`);
console.log(`  Produção smoke: ${prodOk}/${CASES.length} ok`);
console.log(`  Falhas: ${failed}\n`);

process.exit(failed > 0 || passed < CASES.length ? 1 : 0);
