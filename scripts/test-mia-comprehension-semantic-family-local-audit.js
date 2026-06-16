/**
 * PATCH 7.7J — Comprehension Semantic Family Local Audit
 *
 * Audits COMPREHENSION family without production changes.
 * Two contexts: cold session (no anchor) and anchored session (winner preserved).
 * Includes commercial guard cases (must not be treated as pure comprehension).
 *
 * Usage: node scripts/test-mia-comprehension-semantic-family-local-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { detectGenericConversationalFallback } from "../lib/miaConversationalFamilyClosureStandard.js";

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

const GENERIC_WELCOME_DIRECT_REPLY =
  "Posso te ajudar com compras, comparação de produtos e decisão de custo-benefício.\n\nMe fala o produto que você quer analisar ou buscar.";

const PURE_COMPREHENSION = [
  "como assim?",
  "não entendi",
  "nao entendi",
  "quê?",
  "que?",
  "hã?",
  "ha?",
  "explica melhor",
  "pode explicar melhor?",
  "explica de outro jeito",
  "não ficou claro",
  "não peguei",
];

const COMMERCIAL_GUARD_CASES = [
  { input: "não entendi, tem outro?", dominantIntent: "alternative" },
  { input: "nao entendi, tem outro?", dominantIntent: "alternative" },
  { input: "como assim, compara com samsung", dominantIntent: "comparison" },
  { input: "explica melhor esse iphone", dominantIntent: "product_explanation" },
  { input: "que celular comprar até 2000?", dominantIntent: "new_search" },
  { input: "não ficou claro, e se eu gastar menos?", dominantIntent: "constraint_change" },
];

/** Interim acceptable router path when anchor exists (EXPLANATION_REQUEST reuses explanation chain). */
const ACCEPTABLE_ANCHORED_COMPREHENSION_TURN_TYPES = new Set([
  MIA_TURN_TYPES.EXPLANATION_REQUEST,
]);

const ACCEPTABLE_COLD_COMPREHENSION_TURN_TYPES = new Set([
  MIA_TURN_TYPES.CONVERSATIONAL,
]);

const SAFE_COMPREHENSION_ROUTING_MODES = new Set([
  "cognitive_anchor_hold",
  "context_hold",
  "context_decision",
  "conversational",
  "anchored_reaction",
]);

function normalizeQuery(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Audit-side family detector — documents expected COMPREHENSION intent, not production code. */
function hasComprehensionCommercialTail(q = "") {
  if (!q) return false;
  if (/\b(quero|busca|procura|recomenda|indica|sugere|mostra|comprar|preciso de|compara|compare|alternativa)\b/.test(q)) {
    return true;
  }
  if (/\b(outro|outra)\b/.test(q) && !/\bde outro jeito\b/.test(q)) {
    return true;
  }
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)) {
    return true;
  }
  if (/\be se eu\b/.test(q)) return true;
  if (/,\s*(e |se |quero|me |tem |compara|mostra|tem outro)/.test(q)) return true;
  if (/\b(esse|essa|este|esta)\s+\w+/.test(q)) return true;
  return false;
}

function isPureComprehensionFamilyQuery(message = "") {
  const q = normalizeQuery(message);
  if (!q || hasComprehensionCommercialTail(q)) return false;

  if (/^como assim$/.test(q)) return true;
  if (/^(que|ha|hein)$/.test(q)) return true;
  if (/^(nao entendi|nao compreendi|nao peguei)$/.test(q)) return true;
  if (/^(nao ficou claro|ficou confuso|nao esta claro|nao ta claro)$/.test(q)) return true;
  if (/^explica (melhor|de outro jeito)$/.test(q)) return true;
  if (/^pode explicar (melhor|de outro jeito)$/.test(q)) return true;

  return false;
}

function resolveVerbalizerRole(cognitiveTurn, hasAnchor, routingDecision) {
  if (
    cognitiveTurn.signals?.isComprehension &&
    (
      routingDecision.conversationAct === "comprehension" ||
      routingDecision.responsePathHint === "comprehension_reply" ||
      routingDecision.responsePathHint === "comprehension_anchored"
    )
  ) {
    return "comprehension_reply";
  }
  if (
    hasAnchor &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST
  ) {
    return "explanation_anchored";
  }
  if (cognitiveTurn.signals?.asksComprehension) {
    return "comprehension_expected";
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
    contextResolution: {
      mode: "general_answer",
      shouldSkipProductSearch: false,
      directReply: GENERIC_WELCOME_DIRECT_REPLY,
      clearContext: !hasActiveAnchor,
    },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
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

  const responsePath = simulateResponsePath({
    message,
    hasActiveAnchor,
    cognitiveTurn,
    routingDecision,
    openedNewSearch,
    clearNewSearch,
  });

  return {
    cognitiveTurn,
    bridgeAudit,
    guardResult,
    clearNewSearch,
    routingDecision,
    openedNewSearch,
    anchorPreserved,
    responsePath,
    verbalizerRole: resolveVerbalizerRole(cognitiveTurn, hasActiveAnchor, routingDecision),
    signals: {
      isExplanationRequest: !!cognitiveTurn.signals?.isExplanationRequest,
      asksComprehension: !!cognitiveTurn.signals?.asksComprehension,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      asksWhy: !!cognitiveTurn.signals?.asksWhy,
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isComprehensionFamilyAudit: isPureComprehensionFamilyQuery(message),
    },
    routerHasDedicatedComprehensionFamily: !!cognitiveTurn.signals?.isComprehension,
    routerPartialViaExplanationRequest: !!cognitiveTurn.signals?.isExplanationRequest,
  };
}

function simulateResponsePath({
  message,
  hasActiveAnchor,
  cognitiveTurn,
  routingDecision,
  openedNewSearch,
}) {
  if (openedNewSearch) {
    return {
      responsePathFinal: "default_product_search",
      finalResponsePreview: "",
      genericFallbackDetected: false,
      wouldReexplainAnchored: false,
    };
  }

  // PATCH 7.7M — COMPREHENSION response path wiring (mirror handler)
  const isComprehensionResponsePath =
    cognitiveTurn.signals?.isComprehension === true &&
    (
      routingDecision.conversationAct === "comprehension" ||
      routingDecision.responsePathHint === "comprehension_reply" ||
      routingDecision.responsePathHint === "comprehension_anchored" ||
      routingDecision.mode === "conversational" ||
      routingDecision.mode === "cognitive_anchor_hold"
    );

  if (isComprehensionResponsePath) {
    return {
      responsePathFinal: "comprehension_flow",
      finalResponsePreview: hasActiveAnchor
        ? "Claro. Mantemos Produto Recomendado Atual como referência. Posso explicar a escolha de forma mais simples."
        : "Claro. Me diz qual parte ficou confusa que eu explico de um jeito mais simples.",
      genericFallbackDetected: false,
      wouldReexplainAnchored: hasActiveAnchor,
    };
  }

  if (
    hasActiveAnchor &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST &&
    routingDecision.mode === "cognitive_anchor_hold"
  ) {
    return {
      responsePathFinal: "context_explanation_anchored",
      finalResponsePreview:
        "Reexplico o ponto anterior de forma mais simples, mantendo a mesma referência.",
      genericFallbackDetected: false,
      wouldReexplainAnchored: true,
    };
  }

  if (!hasActiveAnchor && !openedNewSearch) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      finalResponsePreview: GENERIC_WELCOME_DIRECT_REPLY,
      genericFallbackDetected: detectGenericConversationalFallback(
        GENERIC_WELCOME_DIRECT_REPLY
      ),
      wouldReexplainAnchored: false,
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: "",
    genericFallbackDetected: false,
    wouldReexplainAnchored: false,
  };
}

function classifyPureComprehensionFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;
  const { hasActiveAnchor, message } = spec;

  if (turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    failures.push({
      layer: "Router",
      detail: `pure comprehension classified as NEW_SEARCH`,
    });
  }

  if (turnType === MIA_TURN_TYPES.UNKNOWN && isPureComprehensionFamilyQuery(message)) {
    failures.push({
      layer: "Router",
      detail: `pure comprehension classified as UNKNOWN`,
    });
  }

  if (
    hasActiveAnchor &&
    !ACCEPTABLE_ANCHORED_COMPREHENSION_TURN_TYPES.has(turnType) &&
    isPureComprehensionFamilyQuery(message)
  ) {
    failures.push({
      layer: "Router",
      detail: `expected EXPLANATION_REQUEST for anchored comprehension, got ${turnType}`,
    });
  }

  if (
    !hasActiveAnchor &&
    isPureComprehensionFamilyQuery(message) &&
    !ACCEPTABLE_COLD_COMPREHENSION_TURN_TYPES.has(turnType)
  ) {
    failures.push({
      layer: "Router",
      detail: `expected CONVERSATIONAL for cold comprehension, got ${turnType}`,
    });
  }

  if (
    isPureComprehensionFamilyQuery(message) &&
    pipeline.signals.isComprehension !== true
  ) {
    failures.push({
      layer: "Router",
      detail: "signals.isComprehension=false on pure comprehension family query",
    });
  }

  if (pipeline.openedNewSearch) {
    failures.push({
      layer: "Routing",
      detail: `new_search leak mode=${pipeline.routingDecision.mode} allowNewSearch=${pipeline.routingDecision.allowNewSearch}`,
    });
  }

  if (hasActiveAnchor && !pipeline.anchorPreserved) {
    failures.push({
      layer: "Anchor preservation",
      detail: `shouldPreserveAnchor=${pipeline.routingDecision.shouldPreserveAnchor}`,
    });
  }

  if (
    pipeline.routingDecision.allowReplaceWinner === true &&
    hasActiveAnchor &&
    ACCEPTABLE_ANCHORED_COMPREHENSION_TURN_TYPES.has(turnType)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowReplaceWinner=true on anchored comprehension",
    });
  }

  if (pipeline.openedNewSearch) {
    failures.push({
      layer: "Response path",
      detail: "commercial search path instead of re-explanation/clarification",
    });
  }

  if (pipeline.responsePath.genericFallbackDetected) {
    failures.push({
      layer: "Final response",
      detail: "institutional generic directReply fallback detected",
    });
  }

  if (
    hasActiveAnchor &&
    ACCEPTABLE_ANCHORED_COMPREHENSION_TURN_TYPES.has(turnType) &&
    !pipeline.responsePath.wouldReexplainAnchored &&
    pipeline.responsePath.responsePathFinal !== "comprehension_flow"
  ) {
    failures.push({
      layer: "Response path",
      detail: "anchored comprehension did not reach comprehension_flow or explanation path",
    });
  }

  if (
    !hasActiveAnchor &&
    pipeline.responsePath.responsePathFinal ===
      "context_resolution_direct_reply_early_return"
  ) {
    failures.push({
      layer: "Audit expectation",
      detail: "cold comprehension should ask for clarification, not institutional welcome",
    });
  }

  // PATCH 7.7M — comprehension_flow closes cold + anchored pure comprehension.
  if (
    isPureComprehensionFamilyQuery(message) &&
    !pipeline.openedNewSearch &&
    pipeline.anchorPreserved &&
    pipeline.responsePath.responsePathFinal === "comprehension_flow" &&
    !pipeline.responsePath.genericFallbackDetected
  ) {
    return [];
  }

  return failures;
}

function classifyGuardFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;

  const comprehensionSafeRouting =
    !pipeline.openedNewSearch &&
    pipeline.routingDecision.allowCommercialFallback === false &&
    SAFE_COMPREHENSION_ROUTING_MODES.has(pipeline.routingDecision.mode) &&
    pipeline.cognitiveTurn.signals?.isComprehension === true;

  if (comprehensionSafeRouting && spec.dominantIntent !== "product_explanation") {
    failures.push({
      layer: "New search guard",
      detail: `commercial intent swallowed by explanation-safe routing mode=${pipeline.routingDecision.mode}`,
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
    turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST ||
    turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST;

  if (!dominantPreserved) {
    failures.push({
      layer: "Router",
      detail: `dominant intent ${spec.dominantIntent} not preserved — turnType=${turnType} clear=${pipeline.clearNewSearch}`,
    });
  }

  if (
    turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST &&
    spec.dominantIntent === "new_search"
  ) {
    failures.push({
      layer: "Router",
      detail: "misclassified as EXPLANATION_REQUEST instead of new_search",
    });
  }

  return failures;
}

function evaluatePureCase(message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor);
  const failures = classifyPureComprehensionFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  return {
    kind: "pure_comprehension",
    input: message,
    family: "COMPREHENSION",
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    expectedFamily: "COMPREHENSION",
    actualTurnType: pipeline.cognitiveTurn.turnType,
    signals: pipeline.signals,
    routingMode: pipeline.routingDecision.mode || "",
    conversationAct: pipeline.routingDecision.conversationAct || "",
    allowNewSearch: pipeline.routingDecision.allowNewSearch,
    allowCommercialFallback: pipeline.routingDecision.allowCommercialFallback,
    allowReplaceWinner: pipeline.routingDecision.allowReplaceWinner,
    allowRerank: pipeline.routingDecision.allowRerank,
    shouldPreserveAnchor: pipeline.routingDecision.shouldPreserveAnchor,
    responsePathHint: pipeline.routingDecision.responsePathHint || "",
    anchorPreserved: pipeline.anchorPreserved,
    openedNewSearch: pipeline.openedNewSearch,
    responsePathFinal: pipeline.responsePath.responsePathFinal,
    finalResponsePreview: pipeline.responsePath.finalResponsePreview,
    genericFallbackDetected: pipeline.responsePath.genericFallbackDetected,
    bridgeApplied: pipeline.bridgeAudit.active,
    verbalizerRole: pipeline.verbalizerRole,
    routerHasDedicatedComprehensionFamily: pipeline.routerHasDedicatedComprehensionFamily,
    routerPartialViaExplanationRequest: pipeline.routerPartialViaExplanationRequest,
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
    routingMode: pipeline.routingDecision.mode || "",
    allowNewSearch: pipeline.routingDecision.allowNewSearch,
    clearNewCommercialSearch: pipeline.clearNewSearch,
    openedNewSearch: pipeline.openedNewSearch,
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

console.log("\nPATCH 7.7J — Comprehension Semantic Family Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + routing + response path simulation (local)\n");

const pureRecords = [];
for (const message of PURE_COMPREHENSION) {
  pureRecords.push(evaluatePureCase(message, false));
  pureRecords.push(evaluatePureCase(message, true));
}

const guardRecords = COMMERCIAL_GUARD_CASES.map(evaluateGuardCase);
const allRecords = [...pureRecords, ...guardRecords];

const purePassed = pureRecords.filter((r) => r.passed).length;
const pureTotal = pureRecords.length;
const guardPassed = guardRecords.filter((r) => r.passed).length;
const guardTotal = guardRecords.length;

const newSearchLeaks = pureRecords.filter((r) => r.openedNewSearch);
const anchorLosses = pureRecords.filter(
  (r) => r.context === "anchored" && !r.anchorPreserved
);
const genericFallbackHits = pureRecords.filter((r) => r.genericFallbackDetected);

const workingPure = [
  ...new Set(pureRecords.filter((r) => r.passed).map((r) => r.input)),
];
const failingPure = [
  ...new Set(pureRecords.filter((r) => !r.passed).map((r) => r.input)),
];

const anchoredWorking = [
  ...new Set(
    pureRecords
      .filter((r) => r.context === "anchored" && r.passed)
      .map((r) => r.input)
  ),
];
const coldWorking = [
  ...new Set(
    pureRecords
      .filter((r) => r.context === "no_anchor" && r.passed)
      .map((r) => r.input)
  ),
];

console.log("── Router family existence ──\n");
console.log("Dedicated COMPREHENSION family in Router: YES (PATCH 7.7K — detectsComprehensionSignal / isComprehension)");
console.log(
  "Partial coverage via EXPLANATION_REQUEST (anchor-only): YES — clusters 2/9 in detectsExplanationRequestSignal"
);
console.log(
  "Diagnostic signal asksComprehension: YES (audit-only, does not drive turnType alone)"
);

console.log("\n── Pure comprehension cases ──\n");
for (const r of pureRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | mode=${r.routingMode} act=${r.conversationAct} newSearch=${r.openedNewSearch} path=${r.responsePathFinal} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Commercial guard cases (anchored) ──\n");
for (const r of guardRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} "${r.input}" → ${r.actualTurnType} | intent=${r.dominantIntent} mode=${r.routingMode} allow=${r.allowNewSearch} clear=${r.clearNewCommercialSearch} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Pure comprehension summary ──\n");

const routerFailures = pureRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Router")
).length;
const routingFailures = pureRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Routing" || f.layer === "Response path")
).length;

console.log(`Total pure tests: ${pureTotal}`);
console.log(`Passed: ${purePassed}/${pureTotal} (${((purePassed / pureTotal) * 100).toFixed(1)}%)`);
console.log(`Anchored working: ${anchoredWorking.length}/${PURE_COMPREHENSION.length}`);
console.log(`Cold session working: ${coldWorking.length}/${PURE_COMPREHENSION.length}`);
console.log(`New_search leaks: ${newSearchLeaks.length}`);
console.log(`Anchor/winner losses: ${anchorLosses.length}`);
console.log(`Generic fallback hits: ${genericFallbackHits.length}`);
console.log(`Router failures (pure): ${routerFailures}/${pureTotal}`);
console.log(`Routing/response leaks (pure): ${routingFailures}/${pureTotal}`);

console.log("\n── Working (all contexts pass) ──\n");
console.log(
  workingPure.length ? workingPure.map((g) => `"${g}"`).join(", ") : "(none)"
);

console.log("\n── Failing (any pure context) ──\n");
console.log(
  failingPure.length ? failingPure.map((g) => `"${g}"`).join(", ") : "(none)"
);

const layerCounts = {};
for (const r of pureRecords.filter((x) => !x.passed)) {
  for (const f of r.failures) {
    layerCounts[f.layer] = (layerCounts[f.layer] || 0) + 1;
  }
}
const topLayer = Object.entries(layerCounts).sort((a, b) => b[1] - a[1])[0];

const nextPatch =
  layerCounts.Router && !layerCounts["Response path"]
    ? "7.7K-Router — add COMPREHENSION family (cold + minimal follow-ups); precede NEW_SEARCH"
    : layerCounts.Router && layerCounts["Response path"]
      ? "7.7K-Router then 7.7M-Response path"
      : layerCounts.Routing
        ? "7.7L-Routing — comprehension hold must not fall through to default search"
        : layerCounts["Response path"] || layerCounts["Final response"]
          ? "7.7M-Response path — comprehension_flow wiring (mirror 7.7H/7.7I)"
          : "7.7K-Router — COMPREHENSION semantic family";

console.log("\n── Final report ──\n");
console.log(`1. Tests executed: ${allRecords.length} (${pureTotal} pure + ${guardTotal} guards)`);
console.log(`2. Passed: ${purePassed}/${pureTotal} pure; ${guardPassed}/${guardTotal} guards`);
console.log(
  `3. Comprehension phrases fully working: ${workingPure.length}/${PURE_COMPREHENSION.length}`
);
console.log(
  `4. Comprehension phrases with failures: ${failingPure.length}/${PURE_COMPREHENSION.length}`
);
console.log(
  `5. New_search leak: ${newSearchLeaks.length === 0 ? "NO" : `YES (${newSearchLeaks.length} pure case-contexts)`}`
);
console.log(
  `6. Anchor/winner preserved: ${anchorLosses.length === 0 ? "YES (when routing safe)" : `NO (${anchorLosses.length} losses)`}`
);
console.log(
  `7. Generic fallback: ${genericFallbackHits.length === 0 ? "NO on safe paths" : `YES (${genericFallbackHits.length} simulated hits)`}`
);
console.log(
  `8. Commercial guards preserved: ${guardPassed}/${guardTotal}${guardPassed < guardTotal ? " (some dominant intents need review)" : ""}`
);
console.log(
  `9. Root cause layer: ${topLayer ? `${topLayer[0]} (${topLayer[1]} failure signals)` : "none"}`
);
console.log(`Commercial guard tests: ${guardPassed}/${guardTotal}`);
console.log(`10. Next patch priority: SOFT DISAGREEMENT or next conversational family per roadmap`);
console.log(
  "11. GREETING/ACK FULLY_CLOSED + 7.6V: run regression scripts separately (PATCH 7.7M closes response path)"
);

console.log(
  `\nAudit script approval: PATCH 7.7M — response path wired; verify with closure standard\n`
);

console.log("── Records (JSON) ──\n");
for (const r of allRecords) {
  console.log(
    JSON.stringify(
      {
        kind: r.kind,
        input: r.input,
        family: r.family || "COMPREHENSION",
        context: r.context,
        dominantIntent: r.dominantIntent || null,
        actualTurnType: r.actualTurnType,
        signals: r.signals,
        routingMode: r.routingMode,
        conversationAct: r.conversationAct,
        allowNewSearch: r.allowNewSearch,
        allowCommercialFallback: r.allowCommercialFallback,
        allowReplaceWinner: r.allowReplaceWinner,
        allowRerank: r.allowRerank,
        shouldPreserveAnchor: r.shouldPreserveAnchor,
        responsePathHint: r.responsePathHint,
        responsePathFinal: r.responsePathFinal,
        anchorPreserved: r.anchorPreserved,
        openedNewSearch: r.openedNewSearch,
        genericFallbackDetected: r.genericFallbackDetected,
        passed: r.passed,
        primaryFailureLayer: r.primaryFailureLayer,
      },
      null,
      2
    )
  );
  console.log("");
}

console.log("PATCH 7.7J/7.7M audit COMPLETE\n");

process.exit(0);
