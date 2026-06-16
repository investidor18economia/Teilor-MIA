/**
 * PATCH 7.7A — Greeting Semantic Family Local Audit
 *
 * Audits GREETING / CONVERSATIONAL family without production changes.
 * Two contexts: cold session (no anchor) and anchored session (winner preserved).
 *
 * Usage: node scripts/test-mia-greeting-semantic-family-local-audit.js
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

const GREETINGS = [
  "oi",
  "ola",
  "opa",
  "eae",
  "fala mia",
  "bom dia",
  "boa tarde",
  "boa noite",
  "salve",
  "alo",
];

const APPROVAL = {
  minPassRate: 0.9,
  maxNewSearchLeaks: 0,
  maxAnchorLoss: 0,
};

function resolveVerbalizerRole(cognitiveTurnType) {
  if (cognitiveTurnType === MIA_TURN_TYPES.CONVERSATIONAL) {
    return "greeting_reply";
  }
  return "decision_generic";
}

function simulatePipeline(message, hasActiveAnchor) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  const legacyIntent = "search";
  const legacyContextAction = "search";

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
    isExplicitComparison: false,
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

  const openedNewSearch =
    routingDecision.mode === "new_search" ||
    routingDecision.allowNewSearch === true;

  const anchorPreserved =
    !hasActiveAnchor ||
    (routingDecision.shouldPreserveAnchor === true &&
      routingDecision.anchorProduct?.product_name === MOCK_WINNER.product_name);

  const verbalizerRole = resolveVerbalizerRole(cognitiveTurn.turnType);

  return {
    cognitiveTurn,
    bridgeAudit,
    guardResult,
    clearNewSearch,
    routingDecision,
    openedNewSearch,
    anchorPreserved,
    verbalizerRole,
    isConversationalSignal: !!cognitiveTurn.signals?.isConversational,
  };
}

function classifyFailures(spec, pipeline) {
  const failures = [];
  const expectedTurnType = MIA_TURN_TYPES.CONVERSATIONAL;

  if (pipeline.cognitiveTurn.turnType !== expectedTurnType) {
    failures.push({
      layer: "Router",
      detail: `expected ${expectedTurnType}, got ${pipeline.cognitiveTurn.turnType}`,
    });
  }

  if (!pipeline.isConversationalSignal && pipeline.cognitiveTurn.turnType !== expectedTurnType) {
    failures.push({
      layer: "Router",
      detail: "isConversational signal false — greeting family not recognized",
    });
  }

  if (pipeline.openedNewSearch) {
    failures.push({
      layer: pipeline.cognitiveTurn.turnType === expectedTurnType ? "Routing" : "Router",
      detail: `openedNewSearch mode=${pipeline.routingDecision.mode} allowNewSearch=${pipeline.routingDecision.allowNewSearch}`,
    });
  }

  if (spec.hasActiveAnchor && !pipeline.anchorPreserved) {
    failures.push({
      layer: "Anchor preservation",
      detail: `shouldPreserveAnchor=${pipeline.routingDecision.shouldPreserveAnchor} anchor=${pipeline.routingDecision.anchorProduct?.product_name || "(none)"}`,
    });
  }

  if (pipeline.bridgeAudit.active) {
    failures.push({
      layer: "Contract",
      detail: "bridge incorrectly applied to greeting — should stay conversational legacy path",
    });
  }

  if (
    pipeline.cognitiveTurn.turnType === expectedTurnType &&
    !pipeline.openedNewSearch &&
    pipeline.verbalizerRole !== "greeting_reply"
  ) {
    failures.push({
      layer: "Verbalizer",
      detail: `expected greeting_reply, got ${pipeline.verbalizerRole}`,
    });
  }

  if (
    pipeline.cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH &&
    spec.hasActiveAnchor
  ) {
    failures.push({
      layer: "Router",
      detail: "greeting classified as NEW_SEARCH with active anchor",
    });
  }

  return failures;
}

function evaluateCase(message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor);
  const failures = classifyFailures({ message, hasActiveAnchor }, pipeline);
  const passed = failures.length === 0;

  return {
    input: message,
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    expectedTurnType: MIA_TURN_TYPES.CONVERSATIONAL,
    actualTurnType: pipeline.cognitiveTurn.turnType,
    expectedFamily: "GREETING",
    cognitiveSignal: {
      isConversational: pipeline.isConversationalSignal,
      detectedIntentWouldBe: "greeting",
    },
    routingMode: pipeline.routingDecision.mode || "",
    allowNewSearch: pipeline.routingDecision.allowNewSearch,
    shouldPreserveAnchor: pipeline.routingDecision.shouldPreserveAnchor,
    anchorPreserved: pipeline.anchorPreserved,
    bridgeApplied: pipeline.bridgeAudit.active,
    expectedVerbalizerRole: "greeting_reply",
    actualVerbalizerRole: pipeline.verbalizerRole,
    openedNewSearch: pipeline.openedNewSearch,
    passed,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

console.log("\nPATCH 7.7A — Greeting Semantic Family Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + routing simulation (local)\n");

const records = [];
for (const message of GREETINGS) {
  records.push(evaluateCase(message, false));
  records.push(evaluateCase(message, true));
}

const passed = records.filter((r) => r.passed).length;
const total = records.length;
const passRate = passed / total;

const newSearchLeaks = records.filter((r) => r.openedNewSearch);
const anchorLosses = records.filter((r) => r.context === "anchored" && !r.anchorPreserved);
const routerFailures = records.filter((r) =>
  r.failures.some((f) => f.layer === "Router")
);
const routingFailures = records.filter((r) =>
  r.failures.some((f) => f.layer === "Routing")
);

const working = [...new Set(records.filter((r) => r.passed).map((r) => r.input))];
const failing = [...new Set(records.filter((r) => !r.passed).map((r) => r.input))];

console.log("── Per-case ──\n");
for (const r of records) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | mode=${r.routingMode} newSearch=${r.openedNewSearch} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Summary ──\n");
console.log(`Total tests: ${total}`);
console.log(`Passed: ${passed}/${total} (${(passRate * 100).toFixed(1)}%)`);
console.log(`New_search leaks: ${newSearchLeaks.length}`);
console.log(`Anchor/winner losses: ${anchorLosses.length}`);
console.log(`Router-layer failures (cases): ${routerFailures.length}`);
console.log(`Routing-layer failures (cases): ${routingFailures.length}`);

console.log("\n── Greetings working (all contexts pass) ──\n");
console.log(working.length ? working.map((g) => `"${g}"`).join(", ") : "(none)");

console.log("\n── Greetings failing (any context) ──\n");
console.log(failing.length ? failing.map((g) => `"${g}"`).join(", ") : "(none)");

const criteriaOk =
  passRate >= APPROVAL.minPassRate &&
  newSearchLeaks.length <= APPROVAL.maxNewSearchLeaks &&
  anchorLosses.length <= APPROVAL.maxAnchorLoss;

console.log("\n── Final report ──\n");
console.log(`1. Tests executed: ${total}`);
console.log(`2. Passed: ${passed}/${total}`);
console.log(`3. Greetings fully working: ${working.length}/${GREETINGS.length}`);
console.log(`4. Greetings with failures: ${failing.length}/${GREETINGS.length}`);
console.log(
  `5. New_search leak: ${newSearchLeaks.length === 0 ? "NO" : `YES (${newSearchLeaks.length} case-contexts)`}`
);
console.log(
  `6. Anchor/winner preserved: ${anchorLosses.length === 0 ? "YES (no losses)" : `NO (${anchorLosses.length} losses)`}`
);

const layerCounts = {};
for (const r of records.filter((x) => !x.passed)) {
  for (const f of r.failures) {
    layerCounts[f.layer] = (layerCounts[f.layer] || 0) + 1;
  }
}
const topLayer = Object.entries(layerCounts).sort((a, b) => b[1] - a[1])[0];
console.log(
  `7. Root cause layer: ${topLayer ? `${topLayer[0]} (${topLayer[1]} failure signals)` : "none"}`
);

const nextSteps = [];
if (layerCounts.Router) {
  nextSteps.push(
    "7.7B-Router — expand greeting patterns (eae, salve, alo, fala mia) and block NEW_SEARCH when isConversational"
  );
}
if (layerCounts.Routing) {
  nextSteps.push(
    "7.7C-Routing — CONVERSATIONAL turn must not fall through to default search (allowNewSearch=false, context hold)"
  );
}
if (layerCounts.Contract) {
  nextSteps.push("7.7D-Contract — ensure greeting never bridges to decision/search intent");
}
if (!nextSteps.length) {
  nextSteps.push("none — greeting family OK locally");
}
console.log(`8. Recommended next patch: ${nextSteps.join("; ")}`);

console.log(`\nAudit approval: ${criteriaOk ? "PASSED" : "NOT PASSED (audit-only — gaps documented)"}\n`);

console.log("── Records (JSON) ──\n");
for (const r of records) {
  console.log(
    JSON.stringify(
      {
        input: r.input,
        context: r.context,
        expectedFamily: r.expectedFamily,
        expectedTurnType: r.expectedTurnType,
        actualTurnType: r.actualTurnType,
        cognitiveSignal: r.cognitiveSignal,
        routingMode: r.routingMode,
        allowNewSearch: r.allowNewSearch,
        shouldPreserveAnchor: r.shouldPreserveAnchor,
        anchorPreserved: r.anchorPreserved,
        openedNewSearch: r.openedNewSearch,
        expectedVerbalizerRole: r.expectedVerbalizerRole,
        actualVerbalizerRole: r.actualVerbalizerRole,
        passed: r.passed,
        primaryFailureLayer: r.primaryFailureLayer,
      },
      null,
      2
    )
  );
  console.log("");
}

console.log(`PATCH 7.7A audit ${criteriaOk ? "COMPLETE" : "COMPLETE — GAPS FOUND"}\n`);

process.exit(0);
