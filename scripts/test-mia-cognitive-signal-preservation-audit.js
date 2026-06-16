/**
 * PATCH 7.6U — Cognitive Signal Preservation Audit
 *
 * Inventaria sinais cognitivos do Router, rastreia transporte até o verbalizer,
 * e responde qual unidade mínima deve sobreviver. Somente leitura.
 *
 * Usage: node scripts/test-mia-cognitive-signal-preservation-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES, POST_DECISION_EXPLANATION_CATEGORY } from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { shouldUseRichExplanationPath } from "../lib/miaCognitiveExplanationPath.js";

// ── Inventário estático extraído de buildTurnSignals (miaCognitiveRouter.js ~1595-1662)
//    + outputs de classifyMiaTurn (~1974-1980). Não assumido — espelha o código.

const ROUTER_SIGNAL_INVENTORY = [
  {
    signal: "turnType",
    producedBy: "classifyMiaTurn → resolveTurnTypeFromSignals",
    firstAppearance: "lib/miaCognitiveRouter.js classifyMiaTurn() return",
    kind: "classification",
    hasSubtype: false,
    usedBy: [
      "lib/miaCognitiveBridge.js (mapCognitiveTurnToLegacyIntent)",
      "lib/miaRoutingDecisionContract.js (cognitiveRoutingSignal.turnType)",
      "pages/api/chat-gpt4o.js contract resolution (~27160-27192)",
      "pages/api/chat-gpt4o.js routing interceptors (~25436+)",
    ],
    contractInput: true,
    payloadInput: false,
  },
  {
    signal: "confidence",
    producedBy: "classifyMiaTurn → resolveTurnTypeFromSignals",
    firstAppearance: "lib/miaCognitiveRouter.js classifyMiaTurn() return",
    kind: "classification",
    hasSubtype: false,
    usedBy: [
      "lib/miaCognitiveBridge.js (confidence gate)",
      "lib/miaRoutingDecisionContract.js (cognitive_anchor_hold threshold)",
    ],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "reasons",
    producedBy: "classifyMiaTurn → resolveTurnTypeFromSignals (+ CSO enrich)",
    firstAppearance: "lib/miaCognitiveRouter.js classifyMiaTurn() return",
    kind: "diagnostic",
    hasSubtype: true,
    subtypePattern: "hesitation_subtype:*, projective_risk_subtype:*, delegation_subtype:*, decision_explanation_subtype:*",
    usedBy: ["pages/api/chat-gpt4o.js MIA_DEBUG compliance audit (~27957)"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "hesitationReaction",
    producedBy: "buildTurnSignals → detectsHesitationSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "structured",
    hasSubtype: true,
    subtypes: ["hesitation", "indecision", "not_sure", "not_convinced", "decision_paralysis", "purchase_anxiety"],
    usedBy: [
      "resolveTurnTypeFromSignals → OBJECTION (collapses turnType)",
      "reasons: hesitation_subtype:{subtype}",
    ],
    contractInput: false,
    payloadInput: false,
    note: "Router comment: subtype for audit tracing; routing contract unchanged",
  },
  {
    signal: "projectiveRisk",
    producedBy: "buildTurnSignals → detectsProjectiveRiskSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "structured",
    hasSubtype: true,
    subtypes: ["risk_probe"],
    usedBy: [
      "resolveTurnTypeFromSignals → OBJECTION",
      "reasons: projective_risk_subtype:{subtype}",
    ],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "delegationRequest",
    producedBy: "buildTurnSignals → detectsDelegationSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "structured",
    hasSubtype: true,
    subtypes: ["decision_delegation"],
    usedBy: [
      "resolveTurnTypeFromSignals → EXPLANATION_REQUEST",
      "reasons: delegation_subtype:{subtype}",
    ],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "decisionExplanation",
    producedBy: "buildTurnSignals → detectsPostDecisionExplanationSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "structured",
    hasSubtype: true,
    subtypes: ["consequence", "benefit", "tradeoff", "decision_defense", "confidence_challenge"],
    category: POST_DECISION_EXPLANATION_CATEGORY,
    usedBy: [
      "resolveTurnTypeFromSignals → EXPLANATION_REQUEST",
      "pages/api/chat-gpt4o.js _isConfidenceChallenge (~27153-27154)",
      "pages/api/chat-gpt4o.js MIA_DEBUG audits (~27892+)",
    ],
    contractInput: true,
    contractUsage: "subtype === confidence_challenge → confidence_challenge_defense",
    payloadInput: false,
  },
  {
    signal: "alternativeRequest",
    producedBy: "buildTurnSignals → detectsAlternativeRequestSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "structured",
    hasSubtype: true,
    subtypes: ["requestedRank", "requestedTopN (numeric fields, not string subtypes)"],
    usedBy: [
      "resolveTurnTypeFromSignals → ALTERNATIVE_REQUEST",
      "pages/api/chat-gpt4o.js resolveRankingRequest (~27179-27183)",
    ],
    contractInput: true,
    contractUsage: "injected into refinement_followup_response_contract prompt",
    payloadInput: false,
  },
  {
    signal: "isObjection",
    producedBy: "buildTurnSignals → detectsObjectionSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: ["resolveTurnTypeFromSignals → OBJECTION (precedes hesitation/projective)"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "isPriorityShift",
    producedBy: "buildTurnSignals → detectsPriorityShiftSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: [
      "resolveTurnTypeFromSignals → PRIORITY_SHIFT",
      "pages/api/chat-gpt4o.js _isPriorityShiftWithAnchor (~27191)",
    ],
    contractInput: true,
    contractUsage: "turnType PRIORITY_SHIFT → priority_shift_response_contract",
    payloadInput: false,
  },
  {
    signal: "isExplanationRequest",
    producedBy: "buildTurnSignals → detectsExplanationRequestSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: ["resolveTurnTypeFromSignals → EXPLANATION_REQUEST"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "isRefinement",
    producedBy: "buildTurnSignals → detectsRefinementSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: [
      "resolveTurnTypeFromSignals → REFINEMENT",
      "pages/api/chat-gpt4o.js _isRefinementWithAnchor (~27172)",
    ],
    contractInput: true,
    contractUsage: "turnType REFINEMENT → refinement_followup_response_contract",
    payloadInput: false,
  },
  {
    signal: "isValueQuestion",
    producedBy: "buildTurnSignals → detectsValueQuestionSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: ["resolveTurnTypeFromSignals → VALUE_QUESTION"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "isComparison",
    producedBy: "buildTurnSignals → detectsComparisonSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: ["resolveTurnTypeFromSignals → COMPARISON"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "isComparisonFollowUp",
    producedBy: "buildTurnSignals → detectsComparisonFollowUpSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: ["resolveTurnTypeFromSignals → COMPARISON_FOLLOWUP"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "isFollowUp",
    producedBy: "buildTurnSignals → detectsFollowUpSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: ["resolveTurnTypeFromSignals → FOLLOW_UP"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "isReaction",
    producedBy: "buildTurnSignals → detectsReactionSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: ["resolveTurnTypeFromSignals → REACTION"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "isConversational",
    producedBy: "buildTurnSignals → detectsConversationalSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: ["resolveTurnTypeFromSignals → CONVERSATIONAL"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "isCommercialQuestion",
    producedBy: "buildTurnSignals → detectsCommercialQuestionSignal",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean",
    hasSubtype: false,
    usedBy: ["resolveTurnTypeFromSignals → COMMERCIAL_QUESTION"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "asksWhy",
    producedBy: "buildTurnSignals (regex)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean_diagnostic",
    hasSubtype: false,
    usedBy: ["audit/diagnostic only in signals object"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "asksValue",
    producedBy: "buildTurnSignals (regex)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean_diagnostic",
    hasSubtype: false,
    usedBy: ["audit/diagnostic only"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "asksAlternative",
    producedBy: "buildTurnSignals (regex)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean_diagnostic",
    hasSubtype: false,
    usedBy: ["resolveTurnTypeFromSignals REFINEMENT reasons"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "asksComprehension",
    producedBy: "buildTurnSignals (regex)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean_diagnostic",
    hasSubtype: false,
    usedBy: ["audit/diagnostic only"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "hasDecisionReference",
    producedBy: "buildTurnSignals (regex)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "boolean_diagnostic",
    hasSubtype: false,
    usedBy: ["audit/diagnostic only"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "hasActiveAnchor",
    producedBy: "buildTurnSignals",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "context",
    hasSubtype: false,
    usedBy: ["signal guards in detectors"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "hasBudget",
    producedBy: "buildTurnSignals (regex)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "context",
    hasSubtype: false,
    usedBy: ["NEW_SEARCH reasons"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "mentionsProduct",
    producedBy: "buildTurnSignals (regex)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "context",
    hasSubtype: false,
    usedBy: ["NEW_SEARCH/COMPARISON reasons"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "mentionsLink",
    producedBy: "buildTurnSignals (regex on rawQuery)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "context",
    hasSubtype: false,
    usedBy: ["COMMERCIAL_QUESTION"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "contextResolutionMode",
    producedBy: "buildTurnSignals (from contextResolution)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "context",
    hasSubtype: false,
    usedBy: ["audit in signals object"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "detectedIntent",
    producedBy: "buildTurnSignals (passthrough)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "context",
    hasSubtype: false,
    usedBy: ["multiple detectors as input"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "hasComparisonContext",
    producedBy: "buildTurnSignals",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "context",
    hasSubtype: false,
    usedBy: ["audit in signals object"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "hasLastBestProduct",
    producedBy: "buildTurnSignals",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "context",
    hasSubtype: false,
    usedBy: ["audit in signals object"],
    contractInput: false,
    payloadInput: false,
  },
  {
    signal: "cso",
    producedBy: "buildTurnSignals (optional CSO passthrough)",
    firstAppearance: "lib/miaCognitiveRouter.js buildTurnSignals()",
    kind: "context",
    hasSubtype: false,
    usedBy: ["reasons enrichment when CSO present"],
    contractInput: false,
    payloadInput: false,
  },
];

// Taxonomias existentes no código (não inventadas)
const EXISTING_TAXONOMIES = [
  {
    name: "MIA_TURN_TYPES (turnType)",
    type: "primary_classification",
    location: "lib/miaCognitiveRouter.js MIA_TURN_TYPES",
    children: Object.values(MIA_TURN_TYPES),
    note: "Unidade superior de routing/bridge/contract — colapsa subtipos comportamentais",
  },
  {
    name: "POST_DECISION_EXPLANATION_CATEGORY",
    type: "explanation_cluster",
    location: "lib/miaCognitiveRouter.js POST_DECISION_EXPLANATION_CATEGORY",
    children: ["consequence", "benefit", "tradeoff", "decision_defense", "confidence_challenge"],
    note: "Agrupa decisionExplanation.subtype — única taxonomia explícita além de turnType",
  },
  {
    name: "hesitationReaction subtypes (documented families A–H)",
    type: "behavioral_subtype",
    location: "lib/miaCognitiveRouter.js detectsHesitationSignal",
    children: ["hesitation", "indecision", "not_sure", "not_convinced", "decision_paralysis", "purchase_anxiety"],
    note: "Nove famílias semânticas documentadas; todas resolvem para OBJECTION",
  },
  {
    name: "projectiveRisk subtypes",
    type: "behavioral_subtype",
    location: "lib/miaCognitiveRouter.js detectsProjectiveRiskSignal",
    children: ["risk_probe"],
    note: "Resolve para OBJECTION",
  },
  {
    name: "delegationRequest subtypes",
    type: "behavioral_subtype",
    location: "lib/miaCognitiveRouter.js detectsDelegationSignal",
    children: ["decision_delegation"],
    note: "Resolve para EXPLANATION_REQUEST",
  },
];

function buildMiaContractMetadata(metadata = {}) {
  return {
    source: metadata.source || "unknown",
    isFollowUp: !!metadata.isFollowUp,
    category: metadata.category || "",
    priority: metadata.priority || "",
    productCount: Number(metadata.productCount || 0),
    hasProducts: !!metadata.hasProducts,
    createdAt: metadata.createdAt || new Date().toISOString(),
  };
}

function resolveContract(cognitiveTurn, routingDecision, contextAction, hasAnchor) {
  const rich = shouldUseRichExplanationPath(routingDecision);
  const sub = cognitiveTurn?.signals?.decisionExplanation?.subtype || null;
  if (contextAction === "analysis") return "analysis";
  if (sub === "confidence_challenge" && rich) return "confidence_challenge_defense";
  if (cognitiveTurn?.turnType === MIA_TURN_TYPES.OBJECTION && hasAnchor) return "objection_response_contract";
  if (
    (cognitiveTurn?.turnType === MIA_TURN_TYPES.REFINEMENT ||
      cognitiveTurn?.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST) &&
    hasAnchor
  )
    return "refinement_followup_response_contract";
  if (cognitiveTurn?.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT && hasAnchor)
    return "priority_shift_response_contract";
  if (rich) return "explanation_anchored";
  return "decision_generic";
}

function traceSignalLifecycle(cognitiveTurn, contract) {
  const sig = cognitiveTurn.signals || {};
  const records = [];

  const structured = [
    { key: "hesitationReaction", path: "signals.hesitationReaction" },
    { key: "projectiveRisk", path: "signals.projectiveRisk" },
    { key: "delegationRequest", path: "signals.delegationRequest" },
    { key: "decisionExplanation", path: "signals.decisionExplanation", activeField: "active" },
    { key: "alternativeRequest", path: "signals.alternativeRequest" },
  ];

  for (const s of structured) {
    const obj = sig[s.key];
    const detected = s.activeField ? obj?.active : obj?.detected;
    if (!detected) continue;

    const subtype =
      obj?.subtype ??
      (obj?.requestedRank != null ? `rank:${obj.requestedRank}` : null) ??
      (obj?.requestedTopN != null ? `topN:${obj.requestedTopN}` : null) ??
      null;

    const reachesContract =
      s.key === "decisionExplanation"
        ? subtype === "confidence_challenge"
        : s.key === "alternativeRequest"
        ? cognitiveTurn.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST
        : false;

    records.push({
      signal: s.key,
      subtype,
      producedBy: `buildTurnSignals → ${s.key}`,
      firstAppearance: "classifyMiaTurn().signals",
      usedBy: reachesContract ? ["contract resolution"] : ["turnType collapse only"],
      discardedAt: reachesContract ? null : "Contract",
      reachesContract,
      reachesPayload: false,
      reachesVerbalizer: reachesContract,
      verbalizerVia: reachesContract ? "system prompt template" : "user message text only",
    });
  }

  records.push({
    signal: "turnType",
    subtype: cognitiveTurn.turnType,
    producedBy: "resolveTurnTypeFromSignals",
    firstAppearance: "classifyMiaTurn().turnType",
    usedBy: ["bridge", "routing", "contract resolution"],
    discardedAt: "Payload",
    reachesContract: true,
    reachesPayload: false,
    reachesVerbalizer: true,
    verbalizerVia: "system prompt template selection",
  });

  return records;
}

function simulateCase(message) {
  const SESSION = {
    lastBestProduct: { product_name: "Produto X" },
    lastAxis: "equilibrio geral",
    lastMainConsequence: "desempenho solido",
    lastTradeoff: "nao e o mais barato",
  };

  const ct = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: "decision",
    contextAction: "decision",
  });

  const bridge = mapCognitiveTurnToLegacyIntent(ct);
  const bridgeAudit = buildCognitiveBridgeAudit(bridge, "decision");
  const guard = guardContextActionWithCognitiveBridge({
    contextAction: "decision",
    bridgeAudit,
    cognitiveTurnEarly: ct,
    finalIntent: bridgeAudit.active ? bridgeAudit.toIntent : "decision",
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: true,
    looksLikeShortPriorityFollowUp: false,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const rd = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: { mode: "general_answer", shouldSkipProductSearch: !clearNewSearch },
    sessionContext: SESSION,
    incomingSessionContext: SESSION,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : "decision",
    contextAction: guard.contextAction,
    cognitiveRoutingSignal: {
      turnType: ct.turnType,
      confidence: ct.confidence,
      hasActiveAnchor: true,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  const contract = resolveContract(ct, rd, guard.contextAction, true);
  const rawMeta = {
    source: "context_followup_flow",
    isFollowUp: true,
    contextAction: guard.contextAction,
    activePriority: "equilibrio geral",
  };
  const normalizedMeta = buildMiaContractMetadata(rawMeta);

  return {
    message,
    cognitiveTurn: ct,
    contract,
    routingMode: rd.mode,
    lifecycle: traceSignalLifecycle(ct, contract),
    payload: {
      role: "context_reply",
      intent: guard.contextAction,
      metadataRaw: rawMeta,
      metadataNormalized: normalizedMeta,
      contractInSystemPrompt: contract,
    },
  };
}

const CONVERSATIONAL_CASES = [
  "nao sei se gostei",
  "qual seria seu medo nessa compra",
  "o que poderia dar errado",
  "e se fosse voce",
  "nao quero fazer besteira",
];

function pad(s, n) {
  return String(s ?? "—").slice(0, n).padEnd(n);
}

console.log("\n  PATCH 7.6U — Cognitive Signal Preservation Audit\n");

// ── Parte 1: Inventário ──
console.log("  ── Parte 1: Inventário completo de sinais cognitivos ──\n");
console.log(`  Total de entradas inventariadas: ${ROUTER_SIGNAL_INVENTORY.length}\n`);

for (const entry of ROUTER_SIGNAL_INVENTORY) {
  const record = {
    signal: entry.signal,
    producedBy: entry.producedBy,
    firstAppearance: entry.firstAppearance,
    usedBy: entry.usedBy,
    discardedAt: entry.payloadInput
      ? null
      : entry.contractInput
      ? "Payload (contract usa parcialmente)"
      : "Contract + Payload",
    reachesContract: !!entry.contractInput,
    reachesPayload: !!entry.payloadInput,
    reachesVerbalizer: !!entry.contractInput,
  };
  if (entry.subtypes) record.subtypes = entry.subtypes;
  if (entry.subtypePattern) record.subtypePattern = entry.subtypePattern;
  if (entry.note) record.note = entry.note;
  console.log(JSON.stringify(record, null, 2));
  console.log("");
}

// ── Agrupamento ──
console.log("  ── Auditoria de Agrupamento ──\n");
console.log("  Taxonomias cognitivas encontradas no código:\n");
for (const t of EXISTING_TAXONOMIES) {
  console.log(JSON.stringify({ family: t.name, type: t.type, children: t.children, note: t.note }, null, 2));
  console.log("");
}
console.log('  NÃO existe campo "cognitiveFamily" ou "behaviorFamily" em código de produção.');
console.log('  "behaviorFamily" aparece apenas em scripts de audit (rótulos de teste).\n');

// ── Parte 2 & 3: Casos conversacionais ──
console.log("  ── Parte 2: Mapa Signal → Contract → Payload → Verbalizer (5 casos) ──\n");

const caseResults = CONVERSATIONAL_CASES.map(simulateCase);

for (const r of caseResults) {
  console.log(`  Mensagem: "${r.message}"`);
  console.log(`    turnType=${r.cognitiveTurn.turnType} | contract=${r.contract} | routingMode=${r.routingMode}`);
  console.log(`    payload.intent=${r.payload.intent} | metadataNormalized=${JSON.stringify(r.payload.metadataNormalized)}`);
  for (const lc of r.lifecycle) {
    console.log(
      `    ${lc.signal}${lc.subtype ? `[${lc.subtype}]` : ""}: contract=${lc.reachesContract} payload=${lc.reachesPayload} verbalizer=${lc.reachesVerbalizer} (${lc.verbalizerVia || lc.discardedAt})`
    );
  }
  console.log("");
}

console.log("  ── Parte 3: Onde cada sinal comportamental morre (casos 7.6T) ──\n");
console.log(
  `  ${pad("Signal", 22)} ${pad("Subtype", 22)} ${pad("Contract", 10)} ${pad("Payload", 10)} ${pad("Verbalizer", 12)} Morte`
);
console.log(`  ${"─".repeat(95)}`);

for (const r of caseResults) {
  for (const lc of r.lifecycle.filter((x) => x.signal !== "turnType" || x.subtype === r.cognitiveTurn.turnType)) {
    if (lc.signal === "turnType") continue;
    console.log(
      `  ${pad(lc.signal, 22)} ${pad(lc.subtype || "—", 22)} ${pad(lc.reachesContract ? "SIM" : "NÃO", 10)} ${pad(lc.reachesPayload ? "SIM" : "NÃO", 10)} ${pad(lc.reachesVerbalizer ? "SIM" : "NÃO", 12)} ${lc.discardedAt || "—"}`
    );
  }
}

// ── Parte 4 & 5 ──
console.log("\n  ── Parte 4: Existe unidade cognitiva superior preservável genericamente? ──\n");
console.log("  Resposta: NÃO (como campo único universal)");
console.log("");
console.log("  Evidência:");
console.log("  • turnType (MIA_TURN_TYPES) é a única classificação superior usada downstream.");
console.log("  • turnType COLAPSA hesitation/projective/anxiety → OBJECTION (perda de subtipo).");
console.log("  • POST_DECISION_EXPLANATION_CATEGORY agrupa só decisionExplanation — não cobre");
console.log("    hesitationReaction, projectiveRisk, delegationRequest.");
console.log("  • Não há cognitiveFamily/behaviorFamily em produção.");
console.log("  • Hipótese C parcialmente confirmada: estrutura existe (classifyMiaTurn return)");
console.log("    mas transporte ao verbalizer descarta signals/reasons.");

console.log("\n  ── Parte 5: Menor artefato que precisa sobreviver até o verbalizer ──\n");
console.log("  Resposta (baseada em evidência, sem criar sinais novos):");
console.log("");
console.log("  classifyMiaTurn() return — especificamente:");
console.log("    { turnType, signals.{active structured detector}.subtype }");
console.log("");
console.log("  Equivalente já produzido hoje em `reasons`:");
console.log("    hesitation_subtype:* | projective_risk_subtype:* | delegation_subtype:*");
console.log("");
console.log("  turnType SOZINHO é insuficiente para comportamentos conversacionais distintos");
console.log("  dentro de OBJECTION (3 famílias → 1 contract).");
console.log("");
console.log("  O menor GRÃO já existente no Router é o par:");
console.log("    signalKey + subtype  (ex: hesitationReaction + not_convinced)");
console.log("  — não um cognitiveFamily unificado.");

console.log("\n  ── Critério de sucesso ──\n");
console.log("  Informação que deve ser preservada até o verbalizer:");
console.log("  • turnType (routing/contract grosso)");
console.log("  • + subtype do detector estruturado ativo (hesitationReaction | projectiveRisk |");
console.log("    delegationRequest | decisionExplanation) já presente em cognitiveTurnEarly.signals");
console.log("  Isso permite divergir comportamento sem depender de frases — os detectores já");
console.log("  são agnósticos de categoria e baseados em famílias semânticas.");
console.log("");
console.log("  Forma correta arquiteturalmente: restaurar transporte de cognitiveTurnEarly");
console.log("  (ou subset signals+reasons) ao payload — Hipótese C — sem inventar taxonomia nova.\n");

console.log("  Arquivos auditados:");
console.log("  • lib/miaCognitiveRouter.js — produção (buildTurnSignals, classifyMiaTurn)");
console.log("  • lib/miaCognitiveBridge.js — transporte turnType → legacy intent");
console.log("  • lib/miaRoutingDecisionContract.js — cognitiveRoutingSignal (turnType only)");
console.log("  • pages/api/chat-gpt4o.js ~27145-27747 — contract inputs + runMiaBrainTask");
console.log("  • pages/api/chat-gpt4o.js ~180-189 — buildMiaContractMetadata (normalização)\n");

process.exit(0);
