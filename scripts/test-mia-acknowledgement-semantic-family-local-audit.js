/**
 * PATCH 7.7D — Acknowledgement Semantic Family Local Audit
 *
 * Audits ACKNOWLEDGEMENT / REACTION family without production changes.
 * Two contexts: cold session (no anchor) and anchored session (winner preserved).
 * Includes commercial guard cases (must not be treated as pure acknowledgement).
 *
 * Usage: node scripts/test-mia-acknowledgement-semantic-family-local-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";

const MOCK_WINNER = {
  product_name: "Produto Recomendado Atual",
  price: "R$ 1.899",
};

const SESSION_WITH_ANCHOR = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER],
};

const SESSION_NO_ANCHOR = {};

const PURE_ACKNOWLEDGEMENTS = [
  "entendi",
  "faz sentido",
  "verdade",
  "justo",
  "ok",
  "blz",
  "show",
  "beleza",
  "certo",
  "ta bom",
  "saquei",
  "ah sim",
];

const COMMERCIAL_GUARD_CASES = [
  { input: "ok quero comprar", dominantIntent: "purchase" },
  { input: "beleza me mostra outro", dominantIntent: "alternative" },
  { input: "show, tem opcao mais barata?", dominantIntent: "alternative" },
  { input: "certo, compara com samsung", dominantIntent: "comparison" },
  { input: "entendi, e se eu gastar menos?", dominantIntent: "constraint_change" },
];

const ACCEPTABLE_ACK_TURN_TYPES = new Set([
  MIA_TURN_TYPES.REACTION,
  MIA_TURN_TYPES.CONVERSATIONAL,
]);

const SAFE_ACK_ROUTING_MODES = new Set([
  "conversational",
  "anchored_reaction",
  "context_hold",
  "context_decision",
  "cognitive_anchor_hold",
]);

const APPROVAL = {
  minPassRate: 0.9,
  maxNewSearchLeaks: 0,
  maxAnchorLoss: 0,
};

function resolveVerbalizerRole(cognitiveTurnType) {
  if (
    cognitiveTurnType === MIA_TURN_TYPES.REACTION ||
    cognitiveTurnType === MIA_TURN_TYPES.CONVERSATIONAL
  ) {
    return "acknowledgement_or_conversational";
  }
  return "decision_generic";
}

function simulatePipeline(message, hasActiveAnchor, options = {}) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  const legacyIntent = "search";
  const legacyContextAction = "search";
  const isExplicitComparison = options.isExplicitComparison ?? false;

  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor,
    detectedIntent: legacyIntent,
    contextAction: legacyContextAction,
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, legacyIntent);
  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: legacyContextAction,
    bridgeAudit,
    cognitiveTurnEarly: cognitiveTurn,
    finalIntent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: hasActiveAnchor,
    looksLikeShortPriorityFollowUp: false,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: { mode: "general_answer", shouldSkipProductSearch: false },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  const openedNewSearch =
    routingDecision.mode === "new_search" ||
    routingDecision.allowNewSearch === true;

  const anchorPreserved =
    !hasActiveAnchor ||
    (routingDecision.shouldPreserveAnchor === true &&
      routingDecision.anchorProduct?.product_name === MOCK_WINNER.product_name);

  const unsolicitedCommercialPath =
    openedNewSearch &&
    !clearNewSearch &&
    routingDecision.mode === "search";

  return {
    cognitiveTurn,
    bridgeAudit,
    guardResult,
    clearNewSearch,
    routingDecision,
    openedNewSearch,
    anchorPreserved,
    unsolicitedCommercialPath,
    verbalizerRole: resolveVerbalizerRole(cognitiveTurn.turnType),
    signals: {
      isReaction: !!cognitiveTurn.signals?.isReaction,
      isConversational: !!cognitiveTurn.signals?.isConversational,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
    },
  };
}

function classifyPureAckFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;

  if (!ACCEPTABLE_ACK_TURN_TYPES.has(turnType)) {
    failures.push({
      layer: turnType === MIA_TURN_TYPES.NEW_SEARCH ? "Router" : "Router",
      detail: `expected REACTION or CONVERSATIONAL, got ${turnType}`,
    });
  }

  if (
    spec.hasActiveAnchor &&
    ACCEPTABLE_ACK_TURN_TYPES.has(turnType) &&
    !pipeline.signals.isReaction &&
    !pipeline.signals.isConversational
  ) {
    failures.push({
      layer: "Router",
      detail: "ack turnType without isReaction/isConversational signal",
    });
  }

  if (pipeline.openedNewSearch) {
    const layer =
      ACCEPTABLE_ACK_TURN_TYPES.has(turnType) ? "Routing" : "Router";
    failures.push({
      layer,
      detail: `new_search leak mode=${pipeline.routingDecision.mode} allowNewSearch=${pipeline.routingDecision.allowNewSearch}`,
    });
  }

  if (spec.hasActiveAnchor && !pipeline.anchorPreserved) {
    failures.push({
      layer: "Anchor preservation",
      detail: `shouldPreserveAnchor=${pipeline.routingDecision.shouldPreserveAnchor}`,
    });
  }

  if (
    pipeline.routingDecision.allowCommercialFallback === true &&
    ACCEPTABLE_ACK_TURN_TYPES.has(turnType)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowCommercialFallback=true on pure acknowledgement",
    });
  }

  if (pipeline.bridgeAudit.active) {
    failures.push({
      layer: "Contract",
      detail: "bridge incorrectly applied to acknowledgement",
    });
  }

  if (
    ACCEPTABLE_ACK_TURN_TYPES.has(turnType) &&
    !pipeline.openedNewSearch &&
    !SAFE_ACK_ROUTING_MODES.has(pipeline.routingDecision.mode) &&
    pipeline.routingDecision.mode !== "conversational"
  ) {
    failures.push({
      layer: "Routing",
      detail: `unexpected safe mode=${pipeline.routingDecision.mode}`,
    });
  }

  return failures;
}

function classifyGuardFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;

  const ackSafeRouting =
    !pipeline.openedNewSearch &&
    pipeline.routingDecision.allowCommercialFallback === false &&
    SAFE_ACK_ROUTING_MODES.has(pipeline.routingDecision.mode);

  if (ackSafeRouting) {
    failures.push({
      layer: "New search guard",
      detail: `commercial intent swallowed by ack-safe routing mode=${pipeline.routingDecision.mode}`,
    });
  }

  const dominantPreserved =
    pipeline.clearNewSearch === true ||
    pipeline.openedNewSearch === true ||
    turnType === MIA_TURN_TYPES.NEW_SEARCH ||
    turnType === MIA_TURN_TYPES.REFINEMENT ||
    turnType === MIA_TURN_TYPES.COMPARISON ||
    turnType === MIA_TURN_TYPES.FOLLOW_UP ||
    turnType === MIA_TURN_TYPES.PRIORITY_SHIFT ||
    turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST;

  if (!dominantPreserved) {
    failures.push({
      layer: "Router",
      detail: `dominant intent ${spec.dominantIntent} not preserved — turnType=${turnType} clear=${pipeline.clearNewSearch}`,
    });
  }

  if (
    turnType === MIA_TURN_TYPES.REACTION &&
    spec.dominantIntent !== "acknowledgement"
  ) {
    failures.push({
      layer: "Router",
      detail: `misclassified as REACTION instead of ${spec.dominantIntent}`,
    });
  }

  return failures;
}

function evaluatePureCase(message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor);
  const failures = classifyPureAckFailures({ message, hasActiveAnchor }, pipeline);

  return {
    kind: "pure_ack",
    input: message,
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    expectedFamily: "ACKNOWLEDGEMENT",
    expectedTurnTypes: [...ACCEPTABLE_ACK_TURN_TYPES],
    actualTurnType: pipeline.cognitiveTurn.turnType,
    signals: pipeline.signals,
    routingMode: pipeline.routingDecision.mode || "",
    conversationAct: pipeline.routingDecision.conversationAct || "",
    allowNewSearch: pipeline.routingDecision.allowNewSearch,
    allowCommercialFallback: pipeline.routingDecision.allowCommercialFallback,
    shouldPreserveAnchor: pipeline.routingDecision.shouldPreserveAnchor,
    anchorPreserved: pipeline.anchorPreserved,
    openedNewSearch: pipeline.openedNewSearch,
    bridgeApplied: pipeline.bridgeAudit.active,
    verbalizerRole: pipeline.verbalizerRole,
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

function evaluateGuardCase({ input, dominantIntent }) {
  const pipeline = simulatePipeline(input, true, {
    isExplicitComparison: /compar|samsung|versus|\bvs\b/i.test(input),
  });
  const failures = classifyGuardFailures({ input, dominantIntent }, pipeline);

  return {
    kind: "commercial_guard",
    input,
    context: "anchored",
    dominantIntent,
    actualTurnType: pipeline.cognitiveTurn.turnType,
    signals: pipeline.signals,
    routingMode: pipeline.routingDecision.mode || "",
    conversationAct: pipeline.routingDecision.conversationAct || "",
    allowNewSearch: pipeline.routingDecision.allowNewSearch,
    clearNewCommercialSearch: pipeline.clearNewSearch,
    openedNewSearch: pipeline.openedNewSearch,
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

console.log("\nPATCH 7.7D — Acknowledgement Semantic Family Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + routing simulation (local)\n");

const pureRecords = [];
for (const message of PURE_ACKNOWLEDGEMENTS) {
  pureRecords.push(evaluatePureCase(message, false));
  pureRecords.push(evaluatePureCase(message, true));
}

const guardRecords = COMMERCIAL_GUARD_CASES.map(evaluateGuardCase);
const allRecords = [...pureRecords, ...guardRecords];

const purePassed = pureRecords.filter((r) => r.passed).length;
const pureTotal = pureRecords.length;
const purePassRate = purePassed / pureTotal;

const guardPassed = guardRecords.filter((r) => r.passed).length;
const guardTotal = guardRecords.length;

const newSearchLeaks = pureRecords.filter((r) => r.openedNewSearch);
const anchorLosses = pureRecords.filter(
  (r) => r.context === "anchored" && !r.anchorPreserved
);
const commercialFallbackLeaks = pureRecords.filter(
  (r) => r.allowCommercialFallback === true && r.passed === false
);

const workingPure = [
  ...new Set(pureRecords.filter((r) => r.passed).map((r) => r.input)),
];
const failingPure = [
  ...new Set(pureRecords.filter((r) => !r.passed).map((r) => r.input)),
];

console.log("── Pure acknowledgement cases ──\n");
for (const r of pureRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | mode=${r.routingMode} act=${r.conversationAct} newSearch=${r.openedNewSearch} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Commercial guard cases (anchored) ──\n");
for (const r of guardRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} "${r.input}" → ${r.actualTurnType} | intent=${r.dominantIntent} mode=${r.routingMode} allow=${r.allowNewSearch} clear=${r.clearNewCommercialSearch} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Pure acknowledgement summary ──\n");
console.log(`Total pure tests: ${pureTotal}`);
console.log(`Passed: ${purePassed}/${pureTotal} (${(purePassRate * 100).toFixed(1)}%)`);
console.log(`New_search leaks: ${newSearchLeaks.length}`);
console.log(`Anchor/winner losses: ${anchorLosses.length}`);
console.log(`Commercial guard tests: ${guardPassed}/${guardTotal}`);

console.log("\n── Working (all contexts pass) ──\n");
console.log(
  workingPure.length
    ? workingPure.map((g) => `"${g}"`).join(", ")
    : "(none)"
);

console.log("\n── Failing (any pure context) ──\n");
console.log(
  failingPure.length
    ? failingPure.map((g) => `"${g}"`).join(", ")
    : "(none)"
);

const criteriaOk =
  purePassRate >= APPROVAL.minPassRate &&
  newSearchLeaks.length <= APPROVAL.maxNewSearchLeaks &&
  anchorLosses.length <= APPROVAL.maxAnchorLoss;

const layerCounts = {};
for (const r of pureRecords.filter((x) => !x.passed)) {
  for (const f of r.failures) {
    layerCounts[f.layer] = (layerCounts[f.layer] || 0) + 1;
  }
}
const topLayer = Object.entries(layerCounts).sort((a, b) => b[1] - a[1])[0];

console.log("\n── Final report ──\n");
console.log(`1. Tests executed: ${allRecords.length} (${pureTotal} pure + ${guardTotal} guards)`);
console.log(`2. Passed: ${purePassed}/${pureTotal} pure; ${guardPassed}/${guardTotal} guards`);
console.log(
  `3. Acknowledgements fully working: ${workingPure.length}/${PURE_ACKNOWLEDGEMENTS.length}`
);
console.log(
  `4. Acknowledgements with failures: ${failingPure.length}/${PURE_ACKNOWLEDGEMENTS.length}`
);
console.log(
  `5. New_search leak: ${newSearchLeaks.length === 0 ? "NO" : `YES (${newSearchLeaks.length} pure case-contexts)`}`
);
console.log(
  `6. Anchor/winner preserved: ${anchorLosses.length === 0 ? "YES" : `NO (${anchorLosses.length} losses)`}`
);
console.log(
  `7. Unsolicited recommendation path (pure ack + default search): ${newSearchLeaks.length === 0 ? "NO" : `YES (${newSearchLeaks.length})`}`
);
console.log(
  `8. Commercial guards preserved: ${guardPassed}/${guardTotal}${guardPassed < guardTotal ? " (router misclassification on some guards)" : ""}`
);
console.log(
  `9. Root cause layer: ${topLayer ? `${topLayer[0]} (${topLayer[1]} failure signals)` : "none"}`
);

const nextSteps = [];
if (layerCounts.Router) {
  nextSteps.push(
    "7.7E-Router — expand ACKNOWLEDGEMENT family (justo, ta bom, ah sim); enable reaction/ack without anchor; block NEW_SEARCH precedence for pure ack"
  );
}
if (layerCounts.Routing) {
  nextSteps.push(
    "7.7F-Routing — REACTION/ACK turn must not fall through to default search (allowNewSearch=false, context hold)"
  );
}
if (layerCounts.Contract) {
  nextSteps.push("7.7G-Contract — ensure acknowledgement never bridges to decision/search");
}
if (layerCounts["New search guard"]) {
  nextSteps.push("7.7H-Router — commercial tail must override acknowledgement prefix patterns");
}
if (!nextSteps.length) {
  nextSteps.push("none — acknowledgement family OK locally");
}
console.log(`10. Recommended next patch: ${nextSteps.join("; ")}`);

console.log(
  `\nAudit approval: ${criteriaOk ? "PASSED" : "NOT PASSED (audit-only — gaps documented)"}\n`
);

console.log("── Records (JSON) ──\n");
for (const r of allRecords) {
  console.log(
    JSON.stringify(
      {
        kind: r.kind,
        input: r.input,
        context: r.context,
        expectedFamily: r.expectedFamily || "ACKNOWLEDGEMENT_GUARD",
        dominantIntent: r.dominantIntent || null,
        actualTurnType: r.actualTurnType,
        signals: r.signals,
        routingMode: r.routingMode,
        conversationAct: r.conversationAct,
        allowNewSearch: r.allowNewSearch,
        allowCommercialFallback: r.allowCommercialFallback,
        shouldPreserveAnchor: r.shouldPreserveAnchor,
        anchorPreserved: r.anchorPreserved,
        openedNewSearch: r.openedNewSearch,
        clearNewCommercialSearch: r.clearNewCommercialSearch,
        passed: r.passed,
        primaryFailureLayer: r.primaryFailureLayer,
      },
      null,
      2
    )
  );
  console.log("");
}

console.log(`PATCH 7.7D audit ${criteriaOk ? "COMPLETE" : "COMPLETE — GAPS FOUND"}\n`);

process.exit(0);
