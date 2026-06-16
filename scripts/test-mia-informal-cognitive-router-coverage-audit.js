/**
 * PATCH 7.6U-E — Informal Cognitive Router Coverage Audit
 *
 * Classifica com precisão as 8 falhas do PATCH 7.6U-D.
 * Somente leitura — não altera produção.
 *
 * Usage: node scripts/test-mia-informal-cognitive-router-coverage-audit.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "celular ate 2500";

const GENERIC_RECOMMENDATION_RES =
  /eu iria no\b[\s\S]{0,140}\b(principal motivo|equil[ií]brio geral)\b/i;

const WELCOME_RES =
  /posso te ajudar com compras|me fala o produto que voce quer analisar/i;

const CASES = [
  {
    family: "resistance",
    message: "hmm nao curti muito",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
    behaviorPatterns: [
      /\b(entendo|entendi|faz sentido|hesit|convenc|incomod|resist|duvida|curti|gostei)\b/i,
    ],
  },
  {
    family: "resistance",
    message: "acho que nao gostei",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
    behaviorPatterns: [
      /\b(entendo|entendi|faz sentido|hesit|convenc|incomod|resist|duvida|gostei)\b/i,
    ],
  },
  {
    family: "resistance",
    message: "nao sei se iria nesse",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
    behaviorPatterns: [
      /\b(entendo|entendi|faz sentido|hesit|convenc|incomod|resist|duvida|nesse|iria)\b/i,
    ],
  },
  {
    family: "projective_risk",
    message: "onde eu posso me arrepender",
    expectedTurnType: "OBJECTION",
    expectedDetector: "projectiveRisk",
    expectedSubtype: "risk_probe",
    behaviorPatterns: [
      /\b(risco|medo|errado|arrepend|limit|tradeoff|pegadinha|preocup|receio)\b/i,
    ],
  },
  {
    family: "projective_risk",
    message: "tem alguma pegadinha",
    expectedTurnType: "OBJECTION",
    expectedDetector: "projectiveRisk",
    expectedSubtype: "risk_probe",
    behaviorPatterns: [
      /\b(risco|medo|errado|arrepend|limit|tradeoff|pegadinha|preocup|receio)\b/i,
    ],
  },
  {
    family: "purchase_anxiety",
    message: "e se eu me arrepender",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "purchase_anxiety",
    behaviorPatterns: [
      /\b(medo|arrepend|besteira|receio|segur|defens|entendo|entendi|conscient|preocup)\b/i,
    ],
  },
  {
    family: "delegation",
    message: "escolhe um pra mim",
    expectedTurnType: "EXPLANATION_REQUEST",
    expectedDetector: "delegationRequest",
    expectedSubtype: "decision_delegation",
    behaviorPatterns: [
      /\b(se fosse eu|se eu fosse|se eu tivesse|escolheria|manteria|minha escolha|eu iria|seria o|recomendaria)\b/i,
    ],
  },
  {
    family: "delegation",
    message: "vai em qual",
    expectedTurnType: "EXPLANATION_REQUEST",
    expectedDetector: "delegationRequest",
    expectedSubtype: "decision_delegation",
    behaviorPatterns: [
      /\b(se fosse eu|se eu fosse|se eu tivesse|escolheria|manteria|minha escolha|eu iria|seria o|recomendaria|escolheria)\b/i,
    ],
  },
];

// 7.6U-D heuristics (stricter — for false negative detection)
const U6D_RESISTANCE = /\b(entendo|faz sentido|hesit|convenc|incomod|resist|duvida|perfeito|gostei|curti|nesse)\b/i;

function normalize(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isDetectorActive(detector, value) {
  if (!value || typeof value !== "object") return false;
  if (detector === "decisionExplanation") return !!value.active;
  return !!value.detected;
}

function extractRouterSignal(cognitiveTurn) {
  const signals = cognitiveTurn?.signals || {};
  const priority = [
    "projectiveRisk",
    "hesitationReaction",
    "delegationRequest",
    "decisionExplanation",
    "alternativeRequest",
  ];

  for (const detector of priority) {
    const value = signals[detector];
    if (!isDetectorActive(detector, value)) continue;
    return {
      turnType: cognitiveTurn.turnType,
      detector,
      subtype: value.subtype || "",
    };
  }

  return {
    turnType: cognitiveTurn?.turnType || "",
    detector: "",
    subtype: "",
  };
}

function matchesBehavior(text, patterns) {
  const n = normalize(text);
  return patterns.some((re) => re.test(n));
}

function inferFinalResponseFamily(reply) {
  const n = normalize(reply);
  if (WELCOME_RES.test(n)) return "welcome";
  if (GENERIC_RECOMMENDATION_RES.test(n)) return "generic_recommendation";
  if (/\b(se fosse eu|se eu fosse|se eu tivesse|tivesse que escolher)\b/.test(n)) return "delegation";
  if (/\b(risco|medo|errado|pegadinha|preocup)\b/.test(n)) return "projective_risk";
  if (/\b(arrepend|besteira|receio|jogar dinheiro)\b/.test(n)) return "purchase_anxiety";
  if (/\b(entendo|entendi|hesit|convenc|curti|gostei|incomod)\b/.test(n)) return "resistance";
  return "other";
}

function classifyFailure(record) {
  const {
    expectedTurnType,
    expectedDetector,
    expectedSubtype,
    staticTurnType,
    staticDetector,
    staticSubtype,
    prodTurnType,
    prodDetector,
    prodSubtype,
    openedNewSearch,
    cognitiveSignalTransported,
    behaviorInstructionInjected,
    reply,
    behaviorPatterns,
    family,
  } = record;

  const routerTurnOk =
    staticTurnType === expectedTurnType || prodTurnType === expectedTurnType;
  const routerDetectorOk =
    staticDetector === expectedDetector || prodDetector === expectedDetector;
  const routerSubtypeOk =
    (staticSubtype === expectedSubtype || prodSubtype === expectedSubtype) &&
    routerDetectorOk;

  const behaviorOk = matchesBehavior(reply, behaviorPatterns);
  const u6dBehaviorOk =
    family === "resistance"
      ? U6D_RESISTANCE.test(normalize(reply)) && !GENERIC_RECOMMENDATION_RES.test(normalize(reply))
      : behaviorOk;

  if (openedNewSearch) {
    return { failureType: "ROUTING_NEW_SEARCH_LEAK", rootCauseLayer: "routing" };
  }

  if (staticTurnType && staticTurnType !== expectedTurnType && prodTurnType !== expectedTurnType) {
    return { failureType: "ROUTER_TURNTYPE_WRONG", rootCauseLayer: "router_turntype" };
  }

  if (!staticDetector && !prodDetector) {
    return { failureType: "ROUTER_DETECTOR_MISSING", rootCauseLayer: "router_detector" };
  }

  if (
    (staticDetector === expectedDetector || prodDetector === expectedDetector) &&
    staticSubtype !== expectedSubtype &&
    prodSubtype !== expectedSubtype
  ) {
    return { failureType: "ROUTER_SUBTYPE_MISSING", rootCauseLayer: "router_subtype" };
  }

  if (staticDetector !== expectedDetector && prodDetector !== expectedDetector) {
    return { failureType: "ROUTER_DETECTOR_MISSING", rootCauseLayer: "router_detector" };
  }

  if (routerTurnOk && routerDetectorOk && routerSubtypeOk && !cognitiveSignalTransported) {
    return { failureType: "SIGNAL_TRANSPORT_MISSING", rootCauseLayer: "transport" };
  }

  if (
    routerTurnOk &&
    routerDetectorOk &&
    routerSubtypeOk &&
    cognitiveSignalTransported &&
    !behaviorInstructionInjected
  ) {
    return { failureType: "BEHAVIOR_INSTRUCTION_MISSING", rootCauseLayer: "transport" };
  }

  if (
    routerTurnOk &&
    routerDetectorOk &&
    routerSubtypeOk &&
    cognitiveSignalTransported &&
    behaviorInstructionInjected &&
    behaviorOk
  ) {
    if (!u6dBehaviorOk) {
      return { failureType: "AUDIT_HEURISTIC_FALSE_NEGATIVE", rootCauseLayer: "audit_heuristic" };
    }
    return { failureType: "NO_FAILURE", rootCauseLayer: "none" };
  }

  if (
    routerTurnOk &&
    routerDetectorOk &&
    routerSubtypeOk &&
    cognitiveSignalTransported &&
    behaviorInstructionInjected &&
    !behaviorOk
  ) {
    return { failureType: "VERBALIZER_BEHAVIOR_MISMATCH", rootCauseLayer: "verbalizer" };
  }

  if (!behaviorOk || WELCOME_RES.test(normalize(reply)) || GENERIC_RECOMMENDATION_RES.test(normalize(reply))) {
    if (routerTurnOk && routerDetectorOk) {
      return { failureType: "VERBALIZER_BEHAVIOR_MISMATCH", rootCauseLayer: "verbalizer" };
    }
    if (!staticDetector && !prodDetector) {
      return { failureType: "ROUTER_DETECTOR_MISSING", rootCauseLayer: "router_detector" };
    }
    return { failureType: "ROUTER_TURNTYPE_WRONG", rootCauseLayer: "router_turntype" };
  }

  return { failureType: "NO_FAILURE", rootCauseLayer: "none" };
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6u-e",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function extractWinner(data) {
  return (
    data?.session_context?.lastBestProduct?.product_name ||
    data?.prices?.[0]?.product_name ||
    ""
  );
}

async function auditCase(testCase) {
  const convId = `u-e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
  const winnerBefore = extractWinner(t1);

  const session = {
    ...(t1.session_context || {}),
    lastAxis: t1.session_context?.lastAxis || "equilibrio geral",
    lastMainConsequence:
      t1.session_context?.lastMainConsequence || "desempenho solido para uso diario",
    lastTradeoff: t1.session_context?.lastTradeoff || "nao e o mais barato da lista",
  };

  const msgs = [
    { role: "user", content: PRIOR_QUERY },
    { role: "assistant", content: t1.reply || "" },
  ];

  const staticTurn = classifyMiaTurn({
    query: testCase.message,
    originalQuery: testCase.message,
    resolvedQuery: testCase.message,
    sessionContext: session,
    hasActiveAnchor: !!winnerBefore,
    detectedIntent: "decision",
    contextAction: "decision",
  });

  const staticSig = extractRouterSignal(staticTurn);

  const t2 = await httpPost(testCase.message, session, msgs, convId);
  const trace = t2.mia_debug?.pipelineTrace || {};
  const transport = trace.cognitive_signal_transport || {};
  const rd = trace.routingDecision || {};
  const reply = t2.reply || "";

  const prodEarly = trace.cognitive_turn_early || {};
  const prodSig = extractRouterSignal({
    turnType: prodEarly.turnType || transport.turnType,
    signals: prodEarly.signals || {},
  });

  const openedNewSearch =
    rd.mode === "new_search" ||
    rd.allowNewSearch === true ||
    String(trace.response_path || rd.responsePathHint || "").includes("new_search");

  const cognitiveSignalTransported = !!(
    transport.turnType &&
    transport.detector &&
    transport.subtype
  );

  const behaviorInstructionInjected = !!trace.cognitive_signal_behavior_instruction;

  const record = {
    family: testCase.family,
    message: testCase.message,
    expectedTurnType: testCase.expectedTurnType,
    actualTurnType: prodEarly.turnType || transport.turnType || staticSig.turnType,
    expectedDetector: testCase.expectedDetector,
    actualDetector: transport.detector || prodSig.detector || staticSig.detector,
    expectedSubtype: testCase.expectedSubtype,
    actualSubtype: transport.subtype || prodSig.subtype || staticSig.subtype,
    staticTurnType: staticSig.turnType,
    staticDetector: staticSig.detector,
    staticSubtype: staticSig.subtype,
    prodTurnType: prodEarly.turnType || transport.turnType || "",
    prodDetector: transport.detector || prodSig.detector || "",
    prodSubtype: transport.subtype || prodSig.subtype || "",
    hasActiveAnchor: !!winnerBefore,
    contextAction: trace.context_action || rd.contextAction || "",
    routingDecision: rd.mode || "",
    responsePath: trace.response_path || rd.responsePathHint || rd.mode || "",
    openedNewSearch,
    cognitiveSignalTransported,
    behaviorInstructionInjected,
    finalResponseFamily: inferFinalResponseFamily(reply),
    replyPreview: reply.replace(/\n/g, " ").slice(0, 160),
    reply,
    behaviorPatterns: testCase.behaviorPatterns,
    familyKey: testCase.family,
  };

  const { failureType, rootCauseLayer } = classifyFailure(record);
  record.failureType = failureType;
  record.rootCauseLayer = rootCauseLayer;
  record.notes = [
    `static=${staticSig.turnType}/${staticSig.detector}/${staticSig.subtype}`,
    `prod=${record.prodTurnType}/${record.prodDetector}/${record.prodSubtype}`,
    `transport=${cognitiveSignalTransported}`,
    `behaviorInstr=${behaviorInstructionInjected}`,
    `responseFamily=${record.finalResponseFamily}`,
  ].join(" | ");

  return record;
}

function pad(s, n) {
  return String(s ?? "—").slice(0, n).padEnd(n);
}

console.log("\n  PATCH 7.6U-E — Informal Cognitive Router Coverage Audit\n");
console.log(`  Base: "${PRIOR_QUERY}" | Cases: ${CASES.length}\n`);

const results = [];
for (const c of CASES) {
  try {
    const r = await auditCase(c);
    results.push(r);
    const icon =
      r.failureType === "NO_FAILURE"
        ? "✓"
        : r.failureType === "AUDIT_HEURISTIC_FALSE_NEGATIVE"
        ? "○"
        : "✗";
    console.log(`  ${icon} [${r.family}] "${r.message}" → ${r.failureType}`);
  } catch (e) {
    results.push({ message: c.message, failureType: "EXEC_ERROR", rootCauseLayer: "none", notes: e.message });
    console.log(`  ✗ "${c.message}" EXEC_ERROR: ${e.message}`);
  }
}

console.log("\n  ── Diagnóstico por caso ──\n");
console.log(
  `  ${pad("message", 28)} ${pad("expected", 22)} ${pad("actual", 22)} ${pad("failureType", 32)} rootCauseLayer`
);
console.log(`  ${"─".repeat(115)}`);

for (const r of results) {
  const expected = `${r.expectedTurnType}/${r.expectedDetector}/${r.expectedSubtype}`;
  const actual = `${r.actualTurnType || "—"}/${r.actualDetector || "—"}/${r.actualSubtype || "—"}`;
  console.log(
    `  ${pad(r.message, 28)} ${pad(expected, 22)} ${pad(actual, 22)} ${pad(r.failureType, 32)} ${r.rootCauseLayer || "—"}`
  );
}

console.log("\n  ── Registro JSON (amostra) ──\n");
for (const r of results) {
  console.log(
    JSON.stringify(
      {
        family: r.family,
        message: r.message,
        expectedTurnType: r.expectedTurnType,
        actualTurnType: r.actualTurnType,
        expectedDetector: r.expectedDetector,
        actualDetector: r.actualDetector,
        expectedSubtype: r.expectedSubtype,
        actualSubtype: r.actualSubtype,
        hasActiveAnchor: r.hasActiveAnchor,
        contextAction: r.contextAction,
        routingDecision: r.routingDecision,
        responsePath: r.responsePath,
        openedNewSearch: r.openedNewSearch,
        cognitiveSignalTransported: r.cognitiveSignalTransported,
        behaviorInstructionInjected: r.behaviorInstructionInjected,
        finalResponseFamily: r.finalResponseFamily,
        failureType: r.failureType,
        notes: r.notes,
      },
      null,
      2
    )
  );
  console.log("");
}

const counts = {
  router_detector: 0,
  router_subtype: 0,
  router_turntype: 0,
  routing: 0,
  transport: 0,
  verbalizer: 0,
  audit_heuristic: 0,
  none: 0,
};

const failureTypeCounts = {};

for (const r of results) {
  failureTypeCounts[r.failureType] = (failureTypeCounts[r.failureType] || 0) + 1;
  if (r.rootCauseLayer && counts[r.rootCauseLayer] !== undefined) {
    counts[r.rootCauseLayer]++;
  }
}

console.log("  ── Respostas às perguntas do audit ──\n");
console.log(`  Quantas falhas são realmente do Router?`);
console.log(
  `    → ${counts.router_detector + counts.router_subtype + counts.router_turntype} ` +
    `(detector=${counts.router_detector}, subtype=${counts.router_subtype}, turnType=${counts.router_turntype})`
);
console.log(`  Quantas são de Routing?`);
console.log(`    → ${counts.routing}`);
console.log(`  Quantas são falso negativo da auditoria anterior (7.6U-D)?`);
console.log(`    → ${counts.audit_heuristic}`);
console.log(`  Quantas são do Verbalizer?`);
console.log(`    → ${counts.verbalizer}`);
console.log(`  Quantas não são falha real?`);
console.log(`    → ${counts.none}`);

console.log("\n  failureType breakdown:");
for (const [k, v] of Object.entries(failureTypeCounts).sort()) {
  console.log(`    ${k}: ${v}`);
}

console.log("\n  ── Próximo patch sugerido ──\n");
if (counts.router_detector >= counts.routing && counts.router_detector >= counts.verbalizer) {
  console.log("  Prioridade: PATCH 7.6U-F — expandir detectores informais no Router (hesitation/projective/delegation).");
} else if (counts.routing > 0) {
  console.log("  Prioridade: PATCH 7.6U-G — guard routing para follow-ups delegados curtos com âncora.");
} else {
  console.log("  Prioridade: revisar verbalizer / Decision Engine override para sinais já classificados.");
}

const success =
  results.length === 8 && results.every((r) => r.failureType && r.failureType !== "EXEC_ERROR");

console.log(`\n  Audit ${success ? "COMPLETE" : "INCOMPLETE"} (${results.length}/8 cases)\n`);

process.exit(success ? 0 : 1);
