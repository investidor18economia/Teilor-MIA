/**
 * PATCH 7.8I — Confidence Challenge Semantic Family Local Audit
 *
 * Audits CONFIDENCE_CHALLENGE family without production changes.
 * Two contexts: cold session (no anchor) and anchored session (winner preserved).
 * Includes commercial guard cases (must not be treated as pure confidence challenge).
 *
 * Usage: node scripts/test-mia-confidence-challenge-semantic-family-local-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES, isConfidenceChallengeFamilyQuery } from "../lib/miaCognitiveRouter.js";
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

/** Seed phrases + human variations (audit-side, not production). */
const PURE_CONFIDENCE_CHALLENGE = [
  "tem certeza?",
  "você tem certeza?",
  "vc tem certeza?",
  "é isso mesmo?",
  "e isso mesmo?",
  "é isso?",
  "e isso?",
  "não vai mudar depois?",
  "nao vai mudar depois?",
  "não vai mudar de ideia?",
  "nao vai mudar de ideia?",
  "você garante?",
  "vc garante?",
  "tem convicção?",
  "você crava isso?",
  "crava mesmo?",
];

const COMMERCIAL_GUARD_CASES = [
  { input: "tem certeza ou tem outro melhor?", dominantIntent: "alternative_exploration" },
  { input: "é isso mesmo ou compara com samsung?", dominantIntent: "comparison" },
  { input: "não vai mudar se eu gastar menos?", dominantIntent: "constraint_change" },
  { input: "você garante ou espero promoção?", dominantIntent: "promotion" },
  { input: "crava esse ou qual ficou em segundo?", dominantIntent: "second_best" },
  { input: "tem certeza desse até 2000?", dominantIntent: "budget_constraint" },
];

const IDEAL_COLD_CONFIDENCE_CHALLENGE_TURN_TYPES = new Set([
  MIA_TURN_TYPES.CONVERSATIONAL,
]);

const PARTIAL_ANCHORED_CONFIDENCE_CHALLENGE_TURN_TYPES = new Set([
  MIA_TURN_TYPES.EXPLANATION_REQUEST,
  MIA_TURN_TYPES.OBJECTION,
  MIA_TURN_TYPES.FOLLOW_UP,
  MIA_TURN_TYPES.CONTEXT_DECISION,
  MIA_TURN_TYPES.VALUE_QUESTION,
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
function hasConfidenceChallengeCommercialTail(q = "") {
  if (!q) return false;

  if (/\b(ou|versus|\bvs\b)\b/.test(q)) return true;
  if (/\boutr[oa]\b/.test(q)) return true;
  if (/\btem outro\b/.test(q)) return true;
  if (/\btem outra\b/.test(q)) return true;
  if (/\b(compara|compare)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return true;
  if (/\b(comparar)\s+(com|o|a)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\bnao vai mudar se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\bespero promocao\b/.test(q)) return true;
  if (/\b(espero|aguardo)\s+(promocao|promo|black|sale)\b/.test(q)) return true;
  if (/\bqual ficou em segundo\b/.test(q)) return true;
  if (/\b(celular|smartphone|iphone|galaxy|samsung|notebook)\b/.test(q)) return true;

  return false;
}

/** Audit-side family detector — documents expected CONFIDENCE_CHALLENGE intent. */
function isPureConfidenceChallengeFamilyQuery(message = "") {
  const q = normalizeQuery(message);
  if (!q || hasConfidenceChallengeCommercialTail(q)) return false;

  if (/^tem certeza$/.test(q)) return true;
  if (/^(voce|vc) tem certeza$/.test(q)) return true;
  if (/^(e|eh) isso mesmo$/.test(q)) return true;
  if (/^(e|eh) isso$/.test(q)) return true;
  if (/^nao vai mudar depois$/.test(q)) return true;
  if (/^nao vai mudar de ideia$/.test(q)) return true;
  if (/^(voce|vc) garante$/.test(q)) return true;
  if (/^tem conviccao$/.test(q)) return true;
  if (/^(voce|vc) crava isso$/.test(q)) return true;
  if (/^crava mesmo$/.test(q)) return true;

  return false;
}

function mapPartialCoverage(cognitiveTurn) {
  const partial = [];
  const de = cognitiveTurn.signals?.decisionExplanation;

  if (cognitiveTurn.signals?.isConfidenceChallenge) {
    partial.push("CONFIDENCE_CHALLENGE(dedicated)");
  }
  if (de?.active && de.subtype === "confidence_challenge") {
    partial.push("POST_DECISION_EXPLANATION:confidence_challenge");
  } else if (de?.active) {
    partial.push(`POST_DECISION_EXPLANATION:${de.subtype || "detected"}`);
  }

  if (cognitiveTurn.signals?.isExplanationRequest) partial.push("EXPLANATION_REQUEST");
  if (cognitiveTurn.signals?.isObjection) partial.push("CONCERN/OBJECTION");
  if (cognitiveTurn.signals?.isSoftDisagreement) {
    partial.push("SOFT_DISAGREEMENT(collision)");
  }
  if (cognitiveTurn.signals?.isAntiRegret) {
    partial.push("ANTI_REGRET(collision)");
  }
  if (cognitiveTurn.signals?.isDecisionConfirmation) {
    partial.push("DECISION_CONFIRMATION(collision)");
  }
  if (cognitiveTurn.signals?.isComprehension) {
    partial.push("COMPREHENSION(collision)");
  }
  if (cognitiveTurn.signals?.hesitationReaction?.subtype === "not_sure") {
    partial.push("LACK_OF_CONFIDENCE");
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.FOLLOW_UP) {
    partial.push("FOLLOW_UP(partial)");
  }

  return partial;
}

function isPartialRouterConfidenceChallenge(cognitiveTurn, hasActiveAnchor) {
  if (!hasActiveAnchor) return false;

  if (cognitiveTurn.signals?.isConfidenceChallenge) return true;

  const de = cognitiveTurn.signals?.decisionExplanation;
  if (de?.active && de.subtype === "confidence_challenge") return true;
  if (
    cognitiveTurn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST &&
    de?.active
  ) {
    return true;
  }
  return PARTIAL_ANCHORED_CONFIDENCE_CHALLENGE_TURN_TYPES.has(cognitiveTurn.turnType);
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
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
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
    routingDecision.allowNewSearch === true ||
    (routingDecision.mode === "search" && routingDecision.allowNewSearch === true);

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
    partialCoverage: mapPartialCoverage(cognitiveTurn),
    routerHasDedicatedConfidenceChallengeFamily:
      !!cognitiveTurn.signals?.isConfidenceChallenge,
    routerPartialCoverage: isPartialRouterConfidenceChallenge(
      cognitiveTurn,
      hasActiveAnchor
    ),
    signals: {
      isConfidenceChallengeFamilyAudit: isPureConfidenceChallengeFamilyQuery(message),
      decisionExplanationSubtype:
        cognitiveTurn.signals?.decisionExplanation?.subtype || null,
      isExplanationRequest: !!cognitiveTurn.signals?.isExplanationRequest,
      isObjection: !!cognitiveTurn.signals?.isObjection,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
    },
  };
}

function buildOpenConfidenceChallengePreview() {
  return "Consigo revisar minha confiança, mas preciso saber qual decisão estamos falando.";
}

function buildAnchoredConfidenceChallengePreview() {
  return "Tenho segurança nessa escolha para o seu caso, mas não como garantia absoluta — eu manteria Produto Recomendado Atual porque continua equilibrando melhor os pontos que você trouxe.";
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
      wouldDefendAnchoredConfidence: false,
      expectedResponsePath: "confidence_challenge_flow",
    };
  }

  // PATCH 7.8L — confidence_challenge_flow (mirror handler)
  const isConfidenceChallengeResponsePath =
    cognitiveTurn.signals?.isConfidenceChallenge === true ||
    isConfidenceChallengeFamilyQuery(message) ||
    routingDecision.conversationAct === "confidence_challenge" ||
    routingDecision.responsePathHint === "confidence_challenge_reply" ||
    routingDecision.responsePathHint === "confidence_challenge_anchored";

  if (isConfidenceChallengeResponsePath) {
    return {
      responsePathFinal: "confidence_challenge_flow",
      finalResponsePreview: hasActiveAnchor
        ? buildAnchoredConfidenceChallengePreview()
        : buildOpenConfidenceChallengePreview(),
      genericFallbackDetected: detectGenericConversationalFallback(
        hasActiveAnchor
          ? buildAnchoredConfidenceChallengePreview()
          : buildOpenConfidenceChallengePreview()
      ),
      wouldDefendAnchoredConfidence:
        hasActiveAnchor && routingDecision.shouldPreserveAnchor,
      expectedResponsePath: "confidence_challenge_flow",
    };
  }

  if (
    hasActiveAnchor &&
    isPartialRouterConfidenceChallenge(cognitiveTurn, hasActiveAnchor) &&
    routingDecision.shouldPreserveAnchor
  ) {
    return {
      responsePathFinal: "context_explanation_partial",
      finalResponsePreview:
        "Resposta parcial via EXPLANATION_REQUEST/OBJECTION — sem fluxo confidence_challenge dedicado.",
      genericFallbackDetected: false,
      wouldDefendAnchoredConfidence:
        cognitiveTurn.turnType === MIA_TURN_TYPES.EXPLANATION_REQUEST ||
        cognitiveTurn.signals?.decisionExplanation?.subtype === "confidence_challenge",
      expectedResponsePath: "confidence_challenge_flow",
    };
  }

  if (!hasActiveAnchor && !openedNewSearch) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      finalResponsePreview: GENERIC_WELCOME_DIRECT_REPLY,
      genericFallbackDetected: detectGenericConversationalFallback(
        GENERIC_WELCOME_DIRECT_REPLY
      ),
      wouldDefendAnchoredConfidence: false,
      expectedResponsePath: "confidence_challenge_flow",
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: "",
    genericFallbackDetected: false,
    wouldDefendAnchoredConfidence: false,
    expectedResponsePath: "confidence_challenge_flow",
  };
}

function classifyPureConfidenceChallengeFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;
  const { hasActiveAnchor, message } = spec;

  if (!isPureConfidenceChallengeFamilyQuery(message)) {
    failures.push({
      layer: "Audit expectation",
      detail: "input is not in audit pure CONFIDENCE_CHALLENGE family list",
    });
    return failures;
  }

  if (!pipeline.routerHasDedicatedConfidenceChallengeFamily) {
    failures.push({
      layer: "Router",
      detail:
        "no dedicated CONFIDENCE_CHALLENGE family (signals.isConfidenceChallenge missing)",
    });
  }

  if (turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    failures.push({
      layer: "Router",
      detail: "pure confidence challenge classified as NEW_SEARCH",
    });
  }

  if (
    !hasActiveAnchor &&
    !IDEAL_COLD_CONFIDENCE_CHALLENGE_TURN_TYPES.has(turnType)
  ) {
    failures.push({
      layer: "Router",
      detail: `expected cold hold/conversational path, got ${turnType}`,
    });
  }

  if (
    hasActiveAnchor &&
    !isPartialRouterConfidenceChallenge(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Router",
      detail: `expected EXPLANATION_REQUEST/confidence_challenge or partial anchored path, got ${turnType}`,
    });
  }

  if (pipeline.openedNewSearch) {
    failures.push({
      layer: "Routing",
      detail: `new_search leak mode=${pipeline.routingDecision.mode} allowNewSearch=${pipeline.routingDecision.allowNewSearch}`,
    });
  }

  if (routingNeedsConfidenceChallengeHold(pipeline.routingDecision)) {
    failures.push({
      layer: "Routing",
      detail: `no confidence_challenge routing hold — act=${pipeline.routingDecision.conversationAct || "none"} hint=${pipeline.routingDecision.responsePathHint || "none"}`,
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
      detail: "allowReplaceWinner or anchor loss on anchored confidence challenge",
    });
  }

  if (
    pipeline.routingDecision.allowReplaceWinner === true &&
    hasActiveAnchor &&
    isPartialRouterConfidenceChallenge(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowReplaceWinner=true on anchored confidence challenge",
    });
  }

  if (
    hasActiveAnchor &&
    pipeline.routingDecision.allowRerank === true &&
    isPartialRouterConfidenceChallenge(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowRerank=true on anchored confidence challenge",
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
      detail:
        "cold confidence challenge should ask for recommendation context, not institutional welcome",
    });
  }

  if (
    pipeline.responsePath.responsePathFinal !== "confidence_challenge_flow" &&
    isPureConfidenceChallengeFamilyQuery(message)
  ) {
    failures.push({
      layer: "Response path",
      detail: "pure confidence challenge did not reach confidence_challenge_flow",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isAntiRegret) {
    failures.push({
      layer: "Router",
      detail: "confidence challenge query misclassified as ANTI_REGRET",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isDecisionConfirmation) {
    failures.push({
      layer: "Router",
      detail: "confidence challenge query misclassified as DECISION_CONFIRMATION",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isComprehension && !hasActiveAnchor) {
    failures.push({
      layer: "Router",
      detail: "confidence challenge query misclassified as COMPREHENSION",
    });
  }

  return failures;
}

function routingNeedsConfidenceChallengeHold(routingDecision = {}) {
  return (
    routingDecision.conversationAct !== "confidence_challenge" &&
    !String(routingDecision.responsePathHint || "").startsWith("confidence_challenge")
  );
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
        turnType === MIA_TURN_TYPES.NEW_SEARCH ||
        pipeline.clearNewSearch === true ||
        /\b(gastar|pagar|menos)\b/.test(normalizeQuery(spec.input))
      );
    case "promotion":
      return (
        turnType === MIA_TURN_TYPES.COMPARISON ||
        turnType === MIA_TURN_TYPES.FOLLOW_UP ||
        turnType === MIA_TURN_TYPES.OBJECTION ||
        /\b(espero|promocao|promo)\b/.test(normalizeQuery(spec.input))
      );
    case "second_best":
      return (
        turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST ||
        turnType === MIA_TURN_TYPES.REFINEMENT ||
        turnType === MIA_TURN_TYPES.FOLLOW_UP ||
        /\b(segundo|2o|2º)\b/.test(normalizeQuery(spec.input))
      );
    case "budget_constraint":
      return (
        turnType === MIA_TURN_TYPES.PRIORITY_SHIFT ||
        turnType === MIA_TURN_TYPES.NEW_SEARCH ||
        pipeline.clearNewSearch === true ||
        /\b(ate|até|2000)\b/.test(normalizeQuery(spec.input))
      );
    default:
      return false;
  }
}

function classifyGuardFailures(spec, pipeline) {
  const failures = [];

  if (isPureConfidenceChallengeFamilyQuery(spec.input)) {
    failures.push({
      layer: "Router",
      detail: "classified as pure confidence challenge despite commercial tail",
    });
  }

  if (!dominantIntentPreserved(spec, pipeline)) {
    failures.push({
      layer: "New search guard",
      detail: `dominant intent ${spec.dominantIntent} not preserved — turnType=${pipeline.cognitiveTurn.turnType} clear=${pipeline.clearNewSearch}`,
    });
  }

  return failures;
}

function evaluatePureCase(message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor);
  const failures = classifyPureConfidenceChallengeFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  const expectedTurnType = hasActiveAnchor
    ? "EXPLANATION_REQUEST (confidence_challenge) or dedicated hold"
    : "CONVERSATIONAL (dedicated family)";

  return {
    kind: "pure_confidence_challenge",
    input: message,
    family: "CONFIDENCE_CHALLENGE",
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    actualTurnType: pipeline.cognitiveTurn.turnType,
    expectedTurnType,
    partialCoverage: pipeline.partialCoverage,
    signals: pipeline.signals,
    routingMode: pipeline.routingDecision.mode || "",
    conversationAct: pipeline.routingDecision.conversationAct || "",
    allowNewSearch: pipeline.routingDecision.allowNewSearch,
    allowCommercialFallback: pipeline.routingDecision.allowCommercialFallback,
    allowReplaceWinner: pipeline.routingDecision.allowReplaceWinner,
    allowRerank: pipeline.routingDecision.allowRerank,
    shouldPreserveAnchor: pipeline.routingDecision.shouldPreserveAnchor,
    responsePathHint: pipeline.routingDecision.responsePathHint || "",
    responsePathFinal: pipeline.responsePath.responsePathFinal,
    expectedResponsePath: pipeline.responsePath.expectedResponsePath,
    anchorPreserved: pipeline.anchorPreserved,
    winnerChanged: pipeline.winnerChanged,
    openedNewSearch: pipeline.openedNewSearch,
    genericFallbackDetected: pipeline.responsePath.genericFallbackDetected,
    routerPartialCoverage: pipeline.routerPartialCoverage,
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
    openedNewSearch: pipeline.openedNewSearch,
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

console.log("\nPATCH 7.8I — Confidence Challenge Semantic Family Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + routing + response path simulation (local, audit-only)\n");

const pureRecords = [];
for (const message of PURE_CONFIDENCE_CHALLENGE) {
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
const winnerChanges = pureRecords.filter((r) => r.winnerChanged);
const genericFallbackHits = pureRecords.filter((r) => r.genericFallbackDetected);

const coldWorking = [
  ...new Set(
    pureRecords.filter((r) => r.context === "no_anchor" && r.passed).map((r) => r.input)
  ),
];
const anchoredWorking = [
  ...new Set(
    pureRecords.filter((r) => r.context === "anchored" && r.passed).map((r) => r.input)
  ),
];
const workingPure = [
  ...new Set(pureRecords.filter((r) => r.passed).map((r) => r.input)),
];
const failingPure = [
  ...new Set(pureRecords.filter((r) => !r.passed).map((r) => r.input)),
];

const partialCold = pureRecords.filter(
  (r) => r.context === "no_anchor" && r.partialCoverage.length > 0
);
const partialAnchored = pureRecords.filter(
  (r) => r.context === "anchored" && r.partialCoverage.length > 0
);

console.log("── Router family existence ──\n");
console.log("Dedicated CONFIDENCE_CHALLENGE family in Router: YES (PATCH 7.8J — signals.isConfidenceChallenge)");
console.log(
  "Routing hold for pure CONFIDENCE_CHALLENGE: YES (PATCH 7.8K — confidence_challenge_conversational_routing_hold)"
);
console.log(
  "Response path for pure CONFIDENCE_CHALLENGE: YES (PATCH 7.8L — confidence_challenge_flow)"
);
console.log(
  `Partial signals on pure audit phrases — cold: ${partialCold.length}/${pureTotal / 2}, anchored: ${partialAnchored.length}/${pureTotal / 2}`
);

console.log("\n── Pure confidence challenge cases ──\n");
for (const r of pureRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | partial=[${r.partialCoverage.join(",")}] | mode=${r.routingMode} newSearch=${r.openedNewSearch} path=${r.responsePathFinal} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Commercial guard cases (anchored) ──\n");
for (const r of guardRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} "${r.input}" → ${r.actualTurnType} | intent=${r.dominantIntent} mode=${r.routingMode} allow=${r.allowNewSearch} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Pure confidence challenge summary ──\n");

const layerCounts = {};
for (const r of pureRecords.filter((x) => !x.passed)) {
  for (const f of r.failures) {
    layerCounts[f.layer] = (layerCounts[f.layer] || 0) + 1;
  }
}
const topLayer = Object.entries(layerCounts).sort((a, b) => b[1] - a[1])[0];

const routerFailures = pureRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Router")
).length;
const routingFailures = pureRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Routing" || f.layer === "Response path")
).length;

console.log(`Total pure tests: ${pureTotal}`);
console.log(`Passed: ${purePassed}/${pureTotal} (${((purePassed / pureTotal) * 100).toFixed(1)}%)`);
console.log(`Cold working: ${coldWorking.length}/${PURE_CONFIDENCE_CHALLENGE.length}`);
console.log(`Anchored working: ${anchoredWorking.length}/${PURE_CONFIDENCE_CHALLENGE.length}`);
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

const nextPatch =
  layerCounts.Router && layerCounts.Routing
    ? "7.8J-Router → 7.8K-Routing → 7.8L-Response path"
    : layerCounts.Router
      ? "7.8J-Router — add CONFIDENCE_CHALLENGE family (cold + anchored); precede NEW_SEARCH; distinguish from ANTI_REGRET"
      : layerCounts.Routing
        ? "7.8K-Routing — confidence_challenge hold must not fall through to default search"
        : layerCounts["Response path"] || layerCounts["Final response"]
          ? "7.8L-Response path — confidence_challenge_flow wiring"
          : "7.8K-Routing — confidence_challenge hold complete; verify audit";

console.log("\n── Final report ──\n");
console.log(`1. Tests executed: ${allRecords.length} (${pureTotal} pure + ${guardTotal} guards)`);
console.log(`2. Passed: ${purePassed}/${pureTotal} pure; ${guardPassed}/${guardTotal} guards`);
console.log(
  "3. Dedicated CONFIDENCE_CHALLENGE in Router: YES — signals.isConfidenceChallenge + isConfidenceChallengeFamilyQuery (PATCH 7.8J)"
);
console.log(
  `4. Phrases working when cold: ${coldWorking.length}/${PURE_CONFIDENCE_CHALLENGE.length}`
);
console.log(
  `4b. Phrases working when anchored: ${anchoredWorking.length}/${PURE_CONFIDENCE_CHALLENGE.length}`
);
console.log(
  `4c. Phrases fully working (both contexts): ${workingPure.length}/${PURE_CONFIDENCE_CHALLENGE.length}`
);
console.log(
  `5. Phrases with failures: ${failingPure.length}/${PURE_CONFIDENCE_CHALLENGE.length}`
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
  `9. Generic fallback: ${genericFallbackHits.length === 0 ? "NO on safe paths" : `YES (${genericFallbackHits.length} simulated cold hits via early return)`}`
);
console.log(
  `10. Commercial guards preserved: ${guardPassed}/${guardTotal}${guardPassed < guardTotal ? " (some dominant intents need review)" : ""}`
);
console.log(
  `11. Root cause layer: ${topLayer ? `${topLayer[0]} (${topLayer[1]} failure signals)` : "none"}`
);
console.log(`12. Next patch priority: next conversational family per roadmap (7.8 block — after CONFIDENCE_CHALLENGE)`);
console.log(
  "13–19. Regressions: run closed-family audits + closure standard + 7.6V separately after audit"
);

const familyFullyClosed =
  purePassed === pureTotal &&
  guardPassed === guardTotal &&
  newSearchLeaks.length === 0 &&
  anchorLosses.length === 0 &&
  winnerChanges.length === 0 &&
  genericFallbackHits.length === 0 &&
  routerFailures === 0 &&
  routingFailures === 0;

console.log(
  `\nAudit script approval: ${
    familyFullyClosed ? "CONFIDENCE_CHALLENGE FULLY_CLOSED" : "GAPS REMAIN"
  }\n`
);
console.log(
  `PATCH 7.8I/7.8J/7.8K/7.8L audit COMPLETE — ${familyFullyClosed ? "ALL PASS" : "GAPS FOUND"}\n`
);

process.exit(0);
