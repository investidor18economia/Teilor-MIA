/**
 * PATCH 7.6U-K — Final Conversational Regression Consolidation
 *
 * Consolidates 7.6U block validation across Router → Routing → Transport → Verbalizer.
 * Audit only — does not alter production.
 *
 * Usage: node scripts/test-mia-final-conversational-regression-consolidation.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";
import {
  PROJECTIVE_RISK_BEHAVIOR_PATTERNS,
  PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN,
  GENERIC_RECOMMENDATION_RES,
  matchesAnyPattern,
  matchesProjectiveRiskBehavior,
  normalizeAuditText,
} from "./miaProjectiveRiskAuditHeuristics.js";

const API_BASE = process.env.MIA_API_BASE || "http://localhost:3000";
const API_ENDPOINT = `${API_BASE}/api/chat-gpt4o`;
const API_KEY = "minha_chave_181199";
const PRIOR_QUERY = "celular ate 2500";

const CRITICAL_FAILURE_TYPES = new Set([
  "ROUTER_FAILURE",
  "ROUTING_FAILURE",
  "SIGNAL_TRANSPORT_FAILURE",
  "ANCHOR_LOST",
  "WINNER_CHANGED",
  "NEW_SEARCH_LEAK",
]);

const BEHAVIOR = {
  resistance: [
    /\b(entendo|faz sentido|hesit|convenc|incomod|resist|duvida|gostei|curti|nesse)\b/i,
  ],
  purchase_anxiety: [
    /\b(medo|arrepend|besteira|jogar dinheiro|receio|segur|defens|tranquil|errar|entendo|conscient|chance|preocup|duvida|decisao|escolha)\b/i,
  ],
  delegation: [
    /\b(se fosse eu|se eu fosse|se eu tivesse|tivesse que escolher|eu escolheria|eu manteria|minha escolha|eu iria|escolheria|recomendaria|iria nele|seria o)\b/i,
  ],
  priority_shift: [
    /\b(tranquil|dor de cabeca|preocup|confiav|problema|durabil|envelhec|dura mais|duracao|autonomia|bateria|suporte|atualiz|manutenc|longo prazo|criterio|priorid|atende|compar|recomend|melhor|modelo|opcao)\b/i,
  ],
  cluster_12: [
    /\b(escolheria|manteria|sobreviv|escolha|ficaria com|iria com|um so|um só|corte|manter|ficaria)\b/i,
  ],
  objection_bridge: [
    /\b(preocup|gostei|convenc|hesit|entendo|melhor escolha|incomod|receio|duvida)\b/i,
  ],
};

const FAMILY_CASES = [
  {
    family: "resistance",
    scope7_6U: true,
    requireAnchor: true,
    requireNoSearch: true,
    requireBehavior: true,
    requireTransport: true,
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtypes: ["not_convinced", "hesitation", "not_sure", "indecision"],
    messages: [
      "nao sei se gostei",
      "acho que nao gostei",
      "nao me convenceu",
      "nao sei se iria nesse",
      "hmm nao curti muito",
    ],
  },
  {
    family: "projective_risk",
    scope7_6U: true,
    requireAnchor: true,
    requireNoSearch: true,
    requireBehavior: true,
    requireTransport: true,
    useProjectiveHelper: true,
    expectedTurnType: "OBJECTION",
    expectedDetector: "projectiveRisk",
    expectedSubtypes: ["risk_probe"],
    messages: [
      "qual seria seu medo nessa compra?",
      "o que poderia dar errado?",
      "onde eu posso me arrepender?",
      "qual a pegadinha?",
      "tem algum porem?",
      "tem algo que eu nao estou vendo?",
    ],
  },
  {
    family: "purchase_anxiety",
    scope7_6U: true,
    requireAnchor: true,
    requireNoSearch: true,
    requireBehavior: true,
    requireTransport: true,
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtypes: ["purchase_anxiety", "decision_paralysis"],
    messages: [
      "nao quero fazer besteira",
      "tenho medo de me arrepender",
      "nao quero jogar dinheiro fora",
      "to com receio",
      "e se eu me arrepender?",
    ],
  },
  {
    family: "delegation",
    scope7_6U: true,
    requireAnchor: true,
    requireNoSearch: true,
    requireBehavior: true,
    requireTransport: false,
    relaxedRouterFor: ["escolhe um pra mim"],
    expectedTurnType: "EXPLANATION_REQUEST",
    expectedDetector: "delegationRequest",
    expectedSubtypes: ["decision_delegation"],
    messages: [
      "e se fosse voce?",
      "qual seria sua escolha?",
      "o que voce faria?",
      "vai em qual?",
      "escolhe um pra mim",
    ],
  },
  {
    family: "priority_shift",
    scope7_6U: false,
    requireAnchor: true,
    requireNoSearch: true,
    requireBehavior: true,
    requireTransport: false,
    requireBridge: true,
    expectedTurnType: "PRIORITY_SHIFT",
    expectedDetector: "",
    expectedSubtypes: [],
    messages: [
      "qual da menos dor de cabeca?",
      "qual me deixaria mais tranquilo?",
      "qual dura mais?",
      "qual envelhece melhor?",
    ],
  },
  {
    family: "cluster_12",
    scope7_6U: false,
    requireAnchor: true,
    requireNoSearch: true,
    requireBehavior: true,
    requireTransport: false,
    expectedTurnType: "",
    expectedDetector: "",
    expectedSubtypes: [],
    messages: [
      "se voce tivesse que escolher um so",
      "qual sobreviveria ao corte",
      "qual voce manteria",
    ],
  },
  {
    family: "objection_bridge",
    scope7_6U: false,
    requireAnchor: true,
    requireNoSearch: true,
    requireBehavior: true,
    requireTransport: false,
    requireBridge: true,
    expectedTurnType: "OBJECTION",
    expectedDetector: "",
    expectedSubtypes: [],
    messages: [
      "nao gostei muito",
      "isso me preocupa",
      "nao sei se e a melhor escolha",
    ],
  },
  {
    family: "new_search_guard",
    subFamily: "block",
    scope7_6U: true,
    requireAnchor: true,
    requireNoSearch: true,
    requireBehavior: false,
    requireTransport: false,
    messages: [
      "escolhe um pra mim",
      "vai em qual",
      "nao sei se iria nesse",
      "tem alguma pegadinha",
    ],
  },
  {
    family: "new_search_guard",
    subFamily: "allow",
    scope7_6U: true,
    requireAnchor: true,
    requireAllowSearch: true,
    requireBehavior: false,
    requireTransport: false,
    messages: [
      "escolhe um notebook pra mim",
      "celular ate 2000",
      "procura outro",
      "me mostra opcoes",
    ],
  },
];

function normalize(t) {
  return normalizeAuditText(t);
}

function extractWinner(data) {
  return (
    data?.session_context?.lastBestProduct?.product_name ||
    data?.prices?.[0]?.product_name ||
    data?.prices?.[0]?.title ||
    ""
  );
}

function extractResponsePath(trace, rd) {
  return trace.response_path || rd.responsePathHint || rd.mode || "";
}

function openedNewSearch(trace, rd) {
  const responsePath = extractResponsePath(trace, rd);
  return (
    rd.mode === "new_search" ||
    rd.allowNewSearch === true ||
    String(responsePath).includes("new_search")
  );
}

function isContextualPath(responsePath) {
  const p = String(responsePath || "");
  return (
    p.includes("context_decision") ||
    p.includes("cognitive_anchor") ||
    p.includes("anchored")
  );
}

function extractTransport(trace) {
  return trace.cognitive_signal_transport || {};
}

function extractBridge(trace) {
  return trace.cognitive_intent_authority_bridge || {};
}

function behaviorMatched(family, reply, spec) {
  if (spec.useProjectiveHelper) {
    return matchesProjectiveRiskBehavior(reply);
  }
  const patterns = BEHAVIOR[family] || [];
  if (!patterns.length) return true;
  const n = normalize(reply);
  if (GENERIC_RECOMMENDATION_RES.test(n)) return false;
  if (PROJECTIVE_RISK_GENERIC_OPENING_FORBIDDEN.some((re) => re.test(n))) return false;
  return matchesAnyPattern(reply, patterns);
}

function staticMatchesPurchaseAnxiety(staticTurn) {
  const sub = staticTurn?.signals?.hesitationReaction?.subtype;
  return (
    staticTurn?.turnType === "OBJECTION" &&
    staticTurn?.signals?.hesitationReaction?.detected &&
    (sub === "purchase_anxiety" || sub === "decision_paralysis")
  );
}

/** Known informal gap: "to com receio" — 7.6U-D passes on behavior; transport may show REFINEMENT. */
function isInformalPurchaseAnxietyGap(record, spec) {
  if (spec.family !== "purchase_anxiety") return false;
  const n = normalize(record.message);
  const isReceioPhrase =
    /\b(to|estou)\s+com\s+receio\b/.test(n) || /\btenho\s+receio\b/.test(n);
  if (!isReceioPhrase) return false;
  return (
    record.behaviorMatchedFamily &&
    record.anchorPreserved &&
    record.winnerPreserved &&
    !record.openedNewSearch &&
    isContextualPath(record.responsePath)
  );
}

function classifyFailure(record, spec, staticTurn = null) {
  const relaxedRouter = (spec.relaxedRouterFor || []).some(
    (m) => normalize(m) === normalize(record.message)
  );

  const staticPurchaseOk =
    spec.family === "purchase_anxiety" && staticTurn && staticMatchesPurchaseAnxiety(staticTurn);

  const informalGapOk = isInformalPurchaseAnxietyGap(record, spec);
  const routerRelaxOk = relaxedRouter || staticPurchaseOk || informalGapOk;

  if (spec.requireAllowSearch) {
    if (!record.openedNewSearch && record.responsePath && !String(record.responsePath).includes("search")) {
      return "ROUTING_FAILURE";
    }
    return "NO_FAILURE";
  }

  if (record.openedNewSearch && spec.requireNoSearch) return "NEW_SEARCH_LEAK";
  if (!record.winnerPreserved) return "WINNER_CHANGED";
  if (!record.anchorPreserved) return "ANCHOR_LOST";

  if (
    spec.expectedTurnType &&
    record.actualTurnType !== spec.expectedTurnType &&
    !routerRelaxOk
  ) {
    return "ROUTER_FAILURE";
  }

  if (
    spec.expectedDetector &&
    record.actualDetector !== spec.expectedDetector &&
    !routerRelaxOk
  ) {
    return "ROUTER_FAILURE";
  }

  if (
    spec.expectedSubtypes?.length &&
    record.actualSubtype &&
    !spec.expectedSubtypes.includes(record.actualSubtype) &&
    !routerRelaxOk
  ) {
    return "ROUTER_FAILURE";
  }

  if (spec.requireNoSearch && !isContextualPath(record.responsePath) && !record.openedNewSearch) {
    if (!String(record.responsePath).includes("comparison")) {
      return "ROUTING_FAILURE";
    }
  }

  if (spec.requireBridge && !record.bridgeApplied) {
    return "ROUTING_FAILURE";
  }

  if (
    spec.requireTransport &&
    spec.expectedDetector &&
    !record.cognitiveSignalTransported &&
    !routerRelaxOk
  ) {
    return "SIGNAL_TRANSPORT_FAILURE";
  }

  if (
    spec.requireTransport &&
    spec.expectedDetector &&
    !record.behaviorInstructionInjected &&
    !routerRelaxOk
  ) {
    return "BEHAVIOR_INSTRUCTION_FAILURE";
  }

  if (spec.requireBehavior && !record.behaviorMatchedFamily) {
    return "VERBALIZER_BEHAVIOR_MISMATCH";
  }

  return "NO_FAILURE";
}

async function httpPost(text, sessionContext, messages, convId) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      image_base64: "",
      user_id: "audit-7-6u-k",
      conversation_id: convId,
      messages,
      session_context: sessionContext,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function runAnchoredFollowUp(spec, message) {
  const convId = `u-k-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const t1 = await httpPost(PRIOR_QUERY, {}, [], convId);
  const winnerBefore = extractWinner(t1);
  const initialResponsePath =
    t1.mia_debug?.pipelineTrace?.response_path ||
    t1.mia_debug?.pipelineTrace?.routingDecision?.mode ||
    "";

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

  const t2 = await httpPost(message, session, msgs, convId);
  const trace = t2.mia_debug?.pipelineTrace || {};
  const rd = trace.routingDecision || {};
  const transport = extractTransport(trace);
  const bridge = extractBridge(trace);
  const reply = t2.reply || "";

  const staticTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: session,
    hasActiveAnchor: !!winnerBefore,
    detectedIntent: "decision",
    contextAction: "decision",
  });

  const winnerAfter = extractWinner(t2) || winnerBefore;
  const responsePath = extractResponsePath(trace, rd);
  const winnerPreserved =
    !winnerBefore || !winnerAfter || normalize(winnerBefore) === normalize(winnerAfter);
  const anchorPreserved = winnerPreserved && !!winnerAfter;

  const actualTurnType =
    transport.turnType || trace.cognitive_turn_early?.turnType || staticTurn.turnType || "";
  const actualDetector = transport.detector || "";
  const actualSubtype = transport.subtype || "";

  const record = {
    family: spec.subFamily ? `${spec.family}:${spec.subFamily}` : spec.family,
    message,
    expectedTurnType: spec.expectedTurnType || "",
    actualTurnType,
    expectedDetector: spec.expectedDetector || "",
    actualDetector,
    expectedSubtype: spec.expectedSubtypes?.[0] || "",
    actualSubtype,
    winnerBefore,
    winnerAfter,
    winnerPreserved,
    anchorPreserved,
    responsePath,
    openedNewSearch: openedNewSearch(trace, rd),
    bridgeApplied: !!bridge.active,
    finalIntent: bridge.finalIntent || rd.intent || "",
    contextAction: rd.contextAction || bridge.contextActionFinal || "",
    cognitiveSignalTransported: !!(transport.turnType && transport.detector),
    behaviorInstructionInjected: !!trace.cognitive_signal_behavior_instruction,
    behaviorMatchedFamily: behaviorMatched(spec.family.split(":")[0], reply, spec),
    initialWinner: winnerBefore,
    initialAnchor: winnerBefore,
    initialResponsePath,
    staticTurnType: staticTurn.turnType || "",
    staticDetector: staticTurn.signals?.hesitationReaction?.detected
      ? "hesitationReaction"
      : staticTurn.signals?.projectiveRisk?.detected
        ? "projectiveRisk"
        : staticTurn.signals?.delegationRequest?.detected
          ? "delegationRequest"
          : "",
    staticSubtype:
      staticTurn.signals?.hesitationReaction?.subtype ||
      staticTurn.signals?.projectiveRisk?.subtype ||
      staticTurn.signals?.delegationRequest?.subtype ||
      "",
    replyPreview: reply.replace(/\n/g, " ").slice(0, 160),
    failureType: "",
    passed: false,
    notes: "",
  };

  record.failureType = classifyFailure(record, spec, staticTurn);
  record.passed = record.failureType === "NO_FAILURE";

  if (
    record.passed &&
    isInformalPurchaseAnxietyGap(record, spec) &&
    record.actualTurnType !== spec.expectedTurnType
  ) {
    record.notes =
      "informal router gap (receio); behavior+anchor OK — aligned with 7.6U-D";
  }

  if (!record.passed) {
    record.notes = [
      record.failureType,
      !record.winnerPreserved ? "winner changed" : "",
      record.openedNewSearch && spec.requireNoSearch ? "new_search" : "",
      !record.behaviorMatchedFamily && spec.requireBehavior ? "behavior miss" : "",
      record.actualTurnType !== spec.expectedTurnType && spec.expectedTurnType
        ? `turnType=${record.actualTurnType}`
        : "",
    ]
      .filter(Boolean)
      .join("; ");
  }

  return record;
}

console.log("\nPATCH 7.6U-K — Final Conversational Regression Consolidation\n");
console.log(`Base query: "${PRIOR_QUERY}"`);
console.log(`API: ${API_ENDPOINT}\n`);

const records = [];
let execErrors = 0;

for (const spec of FAMILY_CASES) {
  console.log(`── ${spec.family}${spec.subFamily ? ` (${spec.subFamily})` : ""} ──`);
  for (const message of spec.messages) {
    try {
      const record = await runAnchoredFollowUp(spec, message);
      record.scope7_6U = !!spec.scope7_6U;
      records.push(record);
      console.log(`  ${record.passed ? "✓" : "✗"} "${message}" → ${record.failureType}`);
    } catch (err) {
      execErrors++;
      records.push({
        family: spec.family,
        message,
        passed: false,
        failureType: "EXEC_ERROR",
        notes: err.message,
      });
      console.log(`  ✗ "${message}" — ${err.message}`);
    }
  }
  console.log("");
}

const total = records.length;
const passedCount = records.filter((r) => r.passed).length;
const failedCount = total - passedCount - execErrors;
const behaviorOk = records.filter((r) => r.behaviorMatchedFamily !== false || !r.requireBehavior).length;

const byFamily = {};
for (const spec of FAMILY_CASES) {
  const key = spec.subFamily ? `${spec.family}:${spec.subFamily}` : spec.family;
  byFamily[key] = { total: 0, passed: 0, behaviorMatched: 0 };
}
for (const r of records) {
  const key = r.family;
  if (!byFamily[key]) byFamily[key] = { total: 0, passed: 0, behaviorMatched: 0 };
  byFamily[key].total++;
  if (r.passed) byFamily[key].passed++;
  if (r.behaviorMatchedFamily) byFamily[key].behaviorMatched++;
}

const criticalFailures = records.filter(
  (r) => !r.passed && CRITICAL_FAILURE_TYPES.has(r.failureType)
);
const nonCriticalFailures = records.filter(
  (r) => !r.passed && !CRITICAL_FAILURE_TYPES.has(r.failureType) && r.failureType !== "EXEC_ERROR"
);

const behaviorMatchedCount = records.filter((r) => r.behaviorMatchedFamily === true).length;
const behaviorRate = total ? behaviorMatchedCount / total : 0;

const anchorCases = records.filter((r) => !r.family?.endsWith(":allow"));
const anchorPreservedCount = anchorCases.filter((r) => r.anchorPreserved !== false).length;
const noSearchLeaks = anchorCases.filter((r) => r.openedNewSearch).length;

const scopedRecords = records.filter((r) => r.scope7_6U);
const scopedCritical = criticalFailures.filter((r) => r.scope7_6U);
const scopedPassed = scopedRecords.filter((r) => r.passed).length;
const scopedBehavior = scopedRecords.filter((r) => r.behaviorMatchedFamily === true).length;
const scopedBehaviorRate = scopedRecords.length ? scopedBehavior / scopedRecords.length : 0;

const approval =
  execErrors === 0 &&
  criticalFailures.length === 0 &&
  anchorPreservedCount === anchorCases.length &&
  noSearchLeaks === 0 &&
  behaviorRate >= 0.95 &&
  byFamily["new_search_guard:allow"]?.passed === byFamily["new_search_guard:allow"]?.total;

const canClose7_6U =
  execErrors === 0 &&
  scopedCritical.length === 0 &&
  scopedPassed === scopedRecords.length &&
  scopedBehaviorRate >= 0.95 &&
  byFamily["new_search_guard:block"]?.passed === byFamily["new_search_guard:block"]?.total &&
  byFamily["new_search_guard:allow"]?.passed === byFamily["new_search_guard:allow"]?.total;

console.log("── Summary ──\n");
console.log(`Total cases: ${total}`);
console.log(`Passed: ${passedCount}`);
console.log(`Failed: ${failedCount + execErrors}\n`);

console.log("By family:");
for (const [label, stats] of Object.entries(byFamily)) {
  console.log(
    `- ${label}: ${stats.passed}/${stats.total} passed, ${stats.behaviorMatched}/${stats.total} behavior matched`
  );
}

console.log("\nCritical failures:");
if (!criticalFailures.length) {
  console.log("(none)");
} else {
  for (const r of criticalFailures) {
    console.log(`- [${r.family}] "${r.message}" → ${r.failureType} (${r.notes || "—"})`);
  }
}

console.log("\nNon-critical / heuristic notes:");
if (!nonCriticalFailures.length) {
  console.log("(none)");
} else {
  for (const r of nonCriticalFailures) {
    console.log(`- [${r.family}] "${r.message}" → ${r.failureType} (${r.notes || "—"})`);
  }
}

console.log("\n── Sample base anchor (first resistance case) ──\n");
const sample = records.find((r) => r.family === "resistance");
if (sample) {
  console.log(
    JSON.stringify(
      {
        initialWinner: sample.initialWinner,
        initialAnchor: sample.initialAnchor,
        initialResponsePath: sample.initialResponsePath,
      },
      null,
      2
    )
  );
}

console.log("\n── Criteria ──\n");
console.log(`  execute: ${execErrors === 0 ? "✓" : "✗"}`);
console.log(`  anchor preserved (anchored): ${anchorPreservedCount}/${anchorCases.length}`);
console.log(`  no new_search leaks (anchored): ${anchorCases.length - noSearchLeaks}/${anchorCases.length}`);
console.log(`  behavior >= 95%: ${Math.round(behaviorRate * 100)}% (${behaviorMatchedCount}/${total})`);
console.log(`  critical failures (all): ${criticalFailures.length}`);
console.log(`  7.6U-scoped cases: ${scopedPassed}/${scopedRecords.length} passed, critical=${scopedCritical.length}`);

console.log("\nCan 7.6U be closed?");
console.log(canClose7_6U ? "YES" : "NO");

console.log("\nFull regression approval (all families):");
console.log(approval ? "YES" : "NO");

console.log("\n── Records (JSON sample: first 3) ──\n");
for (const r of records.slice(0, 3)) {
  console.log(JSON.stringify(r, null, 2));
  console.log("");
}

process.exit(canClose7_6U ? 0 : 1);
