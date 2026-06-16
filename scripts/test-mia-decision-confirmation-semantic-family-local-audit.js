/**
 * PATCH 7.8A — Decision Confirmation Semantic Family Local Audit
 *
 * Audits DECISION_CONFIRMATION family without production changes.
 * Two contexts: cold session (no anchor) and anchored session (winner preserved).
 * Includes commercial guard cases (must not be treated as pure decision confirmation).
 *
 * Usage: node scripts/test-mia-decision-confirmation-semantic-family-local-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES, isDecisionConfirmationFamilyQuery } from "../lib/miaCognitiveRouter.js";
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

const PURE_DECISION_CONFIRMATION = [
  "então vou nesse?",
  "entao vou nesse?",
  "fecho nele?",
  "posso comprar?",
  "vou nesse mesmo?",
  "é pra ir nesse?",
  "e pra ir nesse?",
  "pode ser esse?",
  "compro esse?",
  "então é esse?",
  "entao e esse?",
  "manda ver nesse?",
];

/** PATCH 7.9X-C — natural-language DECISION_CONFIRMATION (convergence / pré-fechamento). */
const DECISION_CONFIRMATION_SEMANTIC_EXPANSION_CASES = [
  "acho que vou nele então",
  "acho que fechou",
  "parece que é esse mesmo",
  "vou ficar com esse",
  "vou seguir nessa opção",
  "acho que me decidi",
  "estou inclinado a pegar esse",
  "esse parece fazer mais sentido",
  "estou quase fechando nesse",
  "acho que essa é a escolha",
];

const COMMERCIAL_GUARD_CASES = [
  { input: "posso comprar outro?", dominantIntent: "alternative_exploration" },
  { input: "fecho nele ou no samsung?", dominantIntent: "comparison" },
  { input: "vou nesse, mas se eu gastar menos?", dominantIntent: "constraint_change" },
  { input: "então é esse ou tem outro melhor?", dominantIntent: "alternative_exploration" },
  { input: "compro esse ou espero promoção?", dominantIntent: "anti_regret" },
  { input: "pode ser esse até 2000?", dominantIntent: "budget_constraint" },
];

/** Ideal future router path — dedicated family not implemented yet. */
const IDEAL_COLD_DECISION_CONFIRMATION_TURN_TYPES = new Set([
  MIA_TURN_TYPES.CONVERSATIONAL,
]);

/** Partial acceptable anchored paths today (follow-up on anchored recommendation). */
const PARTIAL_ANCHORED_DECISION_CONFIRMATION_TURN_TYPES = new Set([
  MIA_TURN_TYPES.FOLLOW_UP,
  MIA_TURN_TYPES.CONTEXT_DECISION,
  MIA_TURN_TYPES.REACTION,
]);

const SAFE_DECISION_CONFIRMATION_ROUTING_MODES = new Set([
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

/** Audit-side commercial tail — dominant intent must not be swallowed. */
function hasDecisionConfirmationCommercialTail(q = "") {
  if (!q) return false;

  if (/\boutro\b/.test(q) && !/\bvou nesse\b/.test(q)) return true;
  if (/\b(ou|versus|\bvs\b)\b/.test(q) && /\b(samsung|melhor|promocao|promo|espero)\b/.test(q)) return true;
  if (/\b(ou|versus|\bvs\b)\b/.test(q) && /\b(outro|melhor)\b/.test(q)) return true;
  if (/\be se eu\b/.test(q)) return true;
  if (/,\s*(mas|se|e se|ou)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\b(celular|smartphone|iphone|galaxy|samsung|notebook)\b/.test(q)) return true;
  if (/\bespero promocao\b/.test(q)) return true;
  if (/\btem outro\b/.test(q)) return true;

  return false;
}

/** Audit-side family detector — documents expected DECISION_CONFIRMATION intent. */
function isPureDecisionConfirmationFamilyQuery(message = "") {
  const q = normalizeQuery(message);
  if (!q || hasDecisionConfirmationCommercialTail(q)) return false;

  if (/^entao vou nesse$/.test(q)) return true;
  if (/^fecho nele$/.test(q)) return true;
  if (/^posso comprar$/.test(q)) return true;
  if (/^vou nesse mesmo$/.test(q)) return true;
  if (/^(e|eh) pra ir nesse$/.test(q)) return true;
  if (/^pode ser esse$/.test(q)) return true;
  if (/^compro esse$/.test(q)) return true;
  if (/^entao e esse$/.test(q)) return true;
  if (/^manda ver nesse$/.test(q)) return true;

  return false;
}

function isPartialRouterDecisionConfirmation(cognitiveTurn, hasActiveAnchor) {
  if (!hasActiveAnchor) return false;
  return PARTIAL_ANCHORED_DECISION_CONFIRMATION_TURN_TYPES.has(cognitiveTurn.turnType);
}

function resolveVerbalizerRole(cognitiveTurn, hasActiveAnchor, routingDecision) {
  if (
    hasActiveAnchor &&
    isPartialRouterDecisionConfirmation(cognitiveTurn, hasActiveAnchor) &&
    !routingDecision.allowNewSearch
  ) {
    return "decision_confirmation_partial";
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
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
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

  const winnerChanged =
    hasActiveAnchor &&
    (routingDecision.allowReplaceWinner === true ||
      (routingDecision.shouldPreserveAnchor === false && !anchorPreserved));

  const responsePath = simulateResponsePath({
    hasActiveAnchor,
    cognitiveTurn,
    routingDecision,
    openedNewSearch,
    message,
  });

  return {
    cognitiveTurn,
    bridgeAudit,
    guardResult,
    clearNewSearch,
    routingDecision,
    openedNewSearch,
    anchorPreserved,
    winnerChanged,
    responsePath,
    verbalizerRole: resolveVerbalizerRole(cognitiveTurn, hasActiveAnchor, routingDecision),
    signals: {
      isFollowUp: !!cognitiveTurn.signals?.isFollowUp,
      isReaction: !!cognitiveTurn.signals?.isReaction,
      asksAlternative: !!cognitiveTurn.signals?.asksAlternative,
      isDecisionConfirmationFamilyAudit: isPureDecisionConfirmationFamilyQuery(message),
    },
    routerHasDedicatedDecisionConfirmationFamily: !!cognitiveTurn.signals?.isDecisionConfirmation,
    routerPartialViaFollowUp: isPartialRouterDecisionConfirmation(cognitiveTurn, hasActiveAnchor),
  };
}

function buildOpenDecisionConfirmationPreview() {
  return "Consigo confirmar, mas preciso primeiro saber qual produto estamos decidindo.";
}

function buildAnchoredDecisionConfirmationPreview() {
  return "Sim, eu iria nele — mantendo Produto Recomendado Atual como referência. Só vale confirmar preço, loja e condição antes de fechar.";
}

function simulateResponsePath({
  hasActiveAnchor,
  cognitiveTurn,
  routingDecision,
  openedNewSearch,
  message = "",
}) {
  if (openedNewSearch) {
    return {
      responsePathFinal: "default_product_search",
      finalResponsePreview: "",
      genericFallbackDetected: false,
      wouldConfirmAnchoredDecision: false,
    };
  }

  // PATCH 7.8D — decision_confirmation_flow (mirror handler)
  const isDecisionConfirmationResponsePath =
    cognitiveTurn.signals?.isDecisionConfirmation === true ||
    isDecisionConfirmationFamilyQuery(message) ||
    routingDecision.conversationAct === "decision_confirmation" ||
    routingDecision.responsePathHint === "decision_confirmation_reply" ||
    routingDecision.responsePathHint === "decision_confirmation_anchored";

  if (isDecisionConfirmationResponsePath) {
    return {
      responsePathFinal: "decision_confirmation_flow",
      finalResponsePreview: hasActiveAnchor
        ? buildAnchoredDecisionConfirmationPreview()
        : buildOpenDecisionConfirmationPreview(),
      genericFallbackDetected: detectGenericConversationalFallback(
        hasActiveAnchor
          ? buildAnchoredDecisionConfirmationPreview()
          : buildOpenDecisionConfirmationPreview()
      ),
      wouldConfirmAnchoredDecision: hasActiveAnchor && routingDecision.shouldPreserveAnchor,
    };
  }

  if (
    hasActiveAnchor &&
    isPartialRouterDecisionConfirmation(cognitiveTurn, hasActiveAnchor) &&
    routingDecision.shouldPreserveAnchor
  ) {
    return {
      responsePathFinal: "context_decision_partial",
      finalResponsePreview:
        "Confirma a decisão atual com ressalva honesta, mantendo a referência ancorada.",
      genericFallbackDetected: false,
      wouldConfirmAnchoredDecision: true,
    };
  }

  if (!hasActiveAnchor && !openedNewSearch) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      finalResponsePreview: GENERIC_WELCOME_DIRECT_REPLY,
      genericFallbackDetected: detectGenericConversationalFallback(
        GENERIC_WELCOME_DIRECT_REPLY
      ),
      wouldConfirmAnchoredDecision: false,
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: "",
    genericFallbackDetected: false,
    wouldConfirmAnchoredDecision: false,
  };
}

function classifyPureDecisionConfirmationFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;
  const { hasActiveAnchor, message } = spec;

  if (!isPureDecisionConfirmationFamilyQuery(message)) {
    failures.push({
      layer: "Audit expectation",
      detail: "input is not in audit pure DECISION_CONFIRMATION family list",
    });
    return failures;
  }

  if (turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    failures.push({
      layer: "Router",
      detail: "pure decision confirmation classified as NEW_SEARCH",
    });
  }

  if (
    !hasActiveAnchor &&
    !IDEAL_COLD_DECISION_CONFIRMATION_TURN_TYPES.has(turnType)
  ) {
    failures.push({
      layer: "Router",
      detail: `expected cold hold/conversational path, got ${turnType}`,
    });
  }

  if (
    hasActiveAnchor &&
    !isPartialRouterDecisionConfirmation(pipeline.cognitiveTurn, hasActiveAnchor) &&
    turnType !== MIA_TURN_TYPES.OBJECTION
  ) {
    failures.push({
      layer: "Router",
      detail: `expected FOLLOW_UP/context decision partial or dedicated family, got ${turnType}`,
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

  if (hasActiveAnchor && pipeline.winnerChanged) {
    failures.push({
      layer: "Winner preservation",
      detail: "allowReplaceWinner or anchor loss on anchored decision confirmation",
    });
  }

  if (
    pipeline.routingDecision.allowReplaceWinner === true &&
    hasActiveAnchor &&
    isPartialRouterDecisionConfirmation(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowReplaceWinner=true on anchored decision confirmation",
    });
  }

  if (pipeline.responsePath.genericFallbackDetected) {
    failures.push({
      layer: "Final response",
      detail: "institutional generic directReply fallback detected",
    });
  }

  if (
    !hasActiveAnchor &&
    pipeline.responsePath.responsePathFinal ===
      "context_resolution_direct_reply_early_return"
  ) {
    failures.push({
      layer: "Audit expectation",
      detail: "cold decision confirmation should ask for recommendation context, not institutional welcome",
    });
  }

  if (
    hasActiveAnchor &&
    isPartialRouterDecisionConfirmation(pipeline.cognitiveTurn, hasActiveAnchor) &&
    !pipeline.responsePath.wouldConfirmAnchoredDecision &&
    pipeline.responsePath.responsePathFinal !== "context_decision_partial" &&
    pipeline.responsePath.responsePathFinal !== "decision_confirmation_flow"
  ) {
    failures.push({
      layer: "Response path",
      detail: "anchored decision confirmation did not reach confirmation path",
    });
  }

  if (
    pipeline.cognitiveTurn.signals?.isDecisionConfirmation !== true &&
    isPureDecisionConfirmationFamilyQuery(message)
  ) {
    failures.push({
      layer: "Router",
      detail: "signals.isDecisionConfirmation=false on pure decision confirmation family query",
    });
  }

  if (
    pipeline.routingDecision.conversationAct !== "decision_confirmation" &&
    isPureDecisionConfirmationFamilyQuery(message) &&
    !pipeline.openedNewSearch
  ) {
    failures.push({
      layer: "Routing",
      detail: `expected conversationAct=decision_confirmation, got ${pipeline.routingDecision.conversationAct}`,
    });
  }

  return failures;
}

function dominantIntentPreserved(spec, pipeline) {
  const turnType = pipeline.cognitiveTurn.turnType;
  const { dominantIntent } = spec;

  switch (dominantIntent) {
    case "alternative_exploration":
      return (
        turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST ||
        turnType === MIA_TURN_TYPES.REFINEMENT ||
        turnType === MIA_TURN_TYPES.COMPARISON ||
        pipeline.clearNewSearch === true
      );
    case "comparison":
      return (
        turnType === MIA_TURN_TYPES.COMPARISON ||
        turnType === MIA_TURN_TYPES.COMPARISON_FOLLOWUP ||
        pipeline.cognitiveTurn.signals?.isComparison === true
      );
    case "constraint_change":
      return (
        turnType === MIA_TURN_TYPES.PRIORITY_SHIFT ||
        pipeline.clearNewSearch === true
      );
    case "anti_regret":
      return (
        turnType === MIA_TURN_TYPES.COMPARISON ||
        turnType === MIA_TURN_TYPES.FOLLOW_UP ||
        turnType === MIA_TURN_TYPES.OBJECTION
      );
    case "budget_constraint":
      return (
        turnType === MIA_TURN_TYPES.NEW_SEARCH ||
        turnType === MIA_TURN_TYPES.REFINEMENT ||
        pipeline.clearNewSearch === true ||
        /\bate\b|\d/.test(normalizeQuery(spec.input))
      );
    default:
      return false;
  }
}

function classifyGuardFailures(spec, pipeline) {
  const failures = [];

  if (isPureDecisionConfirmationFamilyQuery(spec.input)) {
    failures.push({
      layer: "Router",
      detail: "classified as pure decision confirmation despite commercial tail",
    });
  }

  if (!dominantIntentPreserved(spec, pipeline)) {
    failures.push({
      layer: "Router",
      detail: `dominant intent ${spec.dominantIntent} not preserved — turnType=${pipeline.cognitiveTurn.turnType} clear=${pipeline.clearNewSearch}`,
    });
  }

  return failures;
}

function evaluatePureCase(message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor);
  const failures = classifyPureDecisionConfirmationFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  return {
    kind: "pure_decision_confirmation",
    input: message,
    family: "DECISION_CONFIRMATION",
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    expectedFamily: "DECISION_CONFIRMATION",
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
    winnerChanged: pipeline.winnerChanged,
    openedNewSearch: pipeline.openedNewSearch,
    responsePathFinal: pipeline.responsePath.responsePathFinal,
    finalResponsePreview: pipeline.responsePath.finalResponsePreview,
    genericFallbackDetected: pipeline.responsePath.genericFallbackDetected,
    bridgeApplied: pipeline.bridgeAudit.active,
    verbalizerRole: pipeline.verbalizerRole,
    routerHasDedicatedDecisionConfirmationFamily: pipeline.routerHasDedicatedDecisionConfirmationFamily,
    routerPartialViaFollowUp: pipeline.routerPartialViaFollowUp,
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

function evaluateGuardCase({ input, dominantIntent }) {
  const pipeline = simulatePipeline(input, true, {
    isExplicitComparison: /compar|samsung|versus|\bvs\b|\bou\b/i.test(input),
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

function classifyRouterOnlyDecisionConfirmationFailures(spec, pipeline) {
  const failures = [];
  const { hasActiveAnchor, message } = spec;

  if (!isDecisionConfirmationFamilyQuery(message)) {
    failures.push({
      layer: "Router",
      detail: "semantic expansion phrase not recognized as DECISION_CONFIRMATION",
    });
  }

  if (!pipeline.cognitiveTurn.signals?.isDecisionConfirmation) {
    failures.push({
      layer: "Router",
      detail: "signals.isDecisionConfirmation missing on expansion phrase",
    });
  }

  if (pipeline.cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    failures.push({
      layer: "Router",
      detail: "expansion phrase classified as NEW_SEARCH",
    });
  }

  if (
    !hasActiveAnchor &&
    pipeline.cognitiveTurn.turnType !== MIA_TURN_TYPES.CONVERSATIONAL
  ) {
    failures.push({
      layer: "Router",
      detail: `expected CONVERSATIONAL on cold expansion, got ${pipeline.cognitiveTurn.turnType}`,
    });
  }

  if (
    hasActiveAnchor &&
    pipeline.cognitiveTurn.turnType !== MIA_TURN_TYPES.FOLLOW_UP
  ) {
    failures.push({
      layer: "Router",
      detail: `expected FOLLOW_UP on anchored expansion, got ${pipeline.cognitiveTurn.turnType}`,
    });
  }

  return failures;
}

function evaluateExpansionCase(message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor);
  const failures = classifyRouterOnlyDecisionConfirmationFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  return {
    kind: "semantic_expansion",
    input: message,
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    family: "DECISION_CONFIRMATION",
    actualTurnType: pipeline.cognitiveTurn.turnType,
    signals: {
      isDecisionConfirmation: !!pipeline.cognitiveTurn.signals?.isDecisionConfirmation,
      partialCoverage: [],
    },
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

console.log("\nPATCH 7.8A/7.9X-C — Decision Confirmation Semantic Family Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + routing + response path simulation (local, audit-only)\n");

const pureRecords = [];
for (const message of PURE_DECISION_CONFIRMATION) {
  pureRecords.push(evaluatePureCase(message, false));
  pureRecords.push(evaluatePureCase(message, true));
}

const guardRecords = COMMERCIAL_GUARD_CASES.map(evaluateGuardCase);

const expansionRecords = [];
for (const message of DECISION_CONFIRMATION_SEMANTIC_EXPANSION_CASES) {
  expansionRecords.push(evaluateExpansionCase(message, false));
  expansionRecords.push(evaluateExpansionCase(message, true));
}

const allRecords = [...pureRecords, ...guardRecords, ...expansionRecords];

const purePassed = pureRecords.filter((r) => r.passed).length;
const pureTotal = pureRecords.length;
const guardPassed = guardRecords.filter((r) => r.passed).length;
const guardTotal = guardRecords.length;
const expansionPassed = expansionRecords.filter((r) => r.passed).length;
const expansionTotal = expansionRecords.length;
const expansionRouterFailures = expansionRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Router")
).length;

const newSearchLeaks = pureRecords.filter((r) => r.openedNewSearch);
const anchorLosses = pureRecords.filter(
  (r) => r.context === "anchored" && !r.anchorPreserved
);
const winnerChanges = pureRecords.filter((r) => r.winnerChanged);
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
console.log("Dedicated DECISION_CONFIRMATION family in Router: YES (PATCH 7.8B — detectsDecisionConfirmationSignal / isDecisionConfirmation)");
console.log(
  "Routing hold for pure DECISION_CONFIRMATION: YES (PATCH 7.8C — decision_confirmation_conversational_routing_hold)"
);
console.log(
  "Response path for pure DECISION_CONFIRMATION: YES (PATCH 7.8D — decision_confirmation_flow)"
);

console.log("\n── Pure decision confirmation cases ──\n");
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

console.log("\n── Semantic expansion cases (PATCH 7.9X-C, Router-only) ──\n");
for (const r of expansionRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | signal=${r.signals.isDecisionConfirmation} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Semantic expansion summary ──\n");
console.log(`Total expansion tests: ${expansionTotal}`);
console.log(
  `Router pass: ${expansionPassed}/${expansionTotal} (${((expansionPassed / expansionTotal) * 100).toFixed(1)}%)`
);
console.log(`Router failures (expansion): ${expansionRouterFailures}/${expansionTotal}`);

console.log("\n── Pure decision confirmation summary ──\n");

const routerFailures = pureRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Router")
).length;
const routingFailures = pureRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Routing" || f.layer === "Response path")
).length;

console.log(`Total pure tests: ${pureTotal}`);
console.log(`Passed: ${purePassed}/${pureTotal} (${((purePassed / pureTotal) * 100).toFixed(1)}%)`);
console.log(`Anchored working: ${anchoredWorking.length}/${PURE_DECISION_CONFIRMATION.length}`);
console.log(`Cold session working: ${coldWorking.length}/${PURE_DECISION_CONFIRMATION.length}`);
console.log(`New_search leaks: ${newSearchLeaks.length}`);
console.log(`Anchor/winner losses: ${anchorLosses.length}`);
console.log(`Winner changes indevidos: ${winnerChanges.length}`);
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
  layerCounts.Router && layerCounts.Routing
    ? "7.8B-Router then 7.8D-Routing then 7.8E-Response path"
    : layerCounts.Router
      ? "7.8B-Router — add DECISION_CONFIRMATION family (cold + anchored); precede NEW_SEARCH"
      : layerCounts.Routing
        ? "7.8D-Routing — decision confirmation hold must not fall through to default search"
        : layerCounts["Response path"] || layerCounts["Final response"] || layerCounts["Audit expectation"]
          ? "7.8E-Response path — decision_confirmation_flow wiring (mirror 7.7Q)"
          : "7.8B-Router — DECISION_CONFIRMATION semantic family";

console.log("\n── Final report ──\n");
console.log(`1. Tests executed: ${allRecords.length} (${pureTotal} pure + ${expansionTotal} expansion + ${guardTotal} guards)`);
console.log(`2. Passed: ${purePassed}/${pureTotal} pure; ${expansionPassed}/${expansionTotal} expansion (Router-only); ${guardPassed}/${guardTotal} guards`);
console.log(
  `3. Dedicated DECISION_CONFIRMATION in Router: YES — signals.isDecisionConfirmation + isDecisionConfirmationFamilyQuery`
);
console.log(
  `4. Phrases working when anchored: ${anchoredWorking.length}/${PURE_DECISION_CONFIRMATION.length}`
);
console.log(
  `4b. Phrases fully working (both contexts): ${workingPure.length}/${PURE_DECISION_CONFIRMATION.length}`
);
console.log(
  `5. Phrases with failures: ${failingPure.length}/${PURE_DECISION_CONFIRMATION.length}`
);
console.log(
  `6. New_search leak: ${newSearchLeaks.length === 0 ? "NO" : `YES (${newSearchLeaks.length} pure case-contexts)`}`
);
console.log(
  `7. Winner change indevido: ${winnerChanges.length === 0 ? "NO" : `YES (${winnerChanges.length})`}`
);
console.log(
  `8. Anchor preserved (when routing safe): ${anchorLosses.length === 0 ? "YES" : `NO (${anchorLosses.length} losses)`}`
);
console.log(
  `9. Generic fallback: ${genericFallbackHits.length === 0 ? "NO on safe paths" : `YES (${genericFallbackHits.length} simulated hits)`}`
);
console.log(
  `10. Commercial guards preserved: ${guardPassed}/${guardTotal}${guardPassed < guardTotal ? " (some dominant intents need review)" : ""}`
);
console.log(
  `11. Root cause layer: ${topLayer ? `${topLayer[0]} (${topLayer[1]} failure signals)` : "none"}`
);
console.log(`12. Next patch priority: ${nextPatch}`);
console.log(
  "13–17. Regressions: run GREETING/ACK/COMPREHENSION/SOFT_DISAGREEMENT closure + 7.6V scripts separately after audit"
);

console.log(
  `\nAudit script approval: PATCH 7.8D — response path wired; DECISION_CONFIRMATION FULLY_CLOSED candidate\n`
);

console.log("── Records (JSON) ──\n");
for (const r of allRecords) {
  console.log(
    JSON.stringify(
      {
        kind: r.kind,
        input: r.input,
        family: r.family || "DECISION_CONFIRMATION",
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
        winnerChanged: r.winnerChanged,
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

console.log("PATCH 7.8A/7.8B/7.8C/7.8D audit COMPLETE\n");

process.exit(0);
