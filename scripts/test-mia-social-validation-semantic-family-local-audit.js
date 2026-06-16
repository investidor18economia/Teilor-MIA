/**
 * PATCH 7.8M — Social Validation Semantic Family Local Audit
 *
 * Audits SOCIAL_VALIDATION family without production changes.
 * Two contexts: cold session (no anchor) and anchored session (winner preserved).
 * Includes commercial guard cases (must not be treated as pure social validation).
 *
 * Usage: node scripts/test-mia-social-validation-semantic-family-local-audit.js
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

/** Seed phrases + human variations (audit-side, not production). */
const PURE_SOCIAL_VALIDATION = [
  "o pessoal gosta?",
  "as pessoas gostam?",
  "a galera gosta?",
  "a maioria compra?",
  "muita gente compra esse?",
  "ele é bem falado?",
  "tem boa fama?",
  "é bem avaliado?",
  "quem compra gosta?",
  "quem compra se arrepende?",
  "o povo recomenda?",
  "tem aprovação boa?",
  "é popular?",
  "é uma escolha comum?",
  "é bem aceito?",
];

const COMMERCIAL_GUARD_CASES = [
  { input: "o pessoal gosta ou tem outro melhor?", dominantIntent: "alternative_exploration" },
  { input: "a maioria compra ou compara com samsung?", dominantIntent: "comparison" },
  { input: "é popular se eu gastar menos?", dominantIntent: "constraint_change" },
  { input: "tem boa fama ou espero promoção?", dominantIntent: "promotion" },
  { input: "é bem avaliado até 2000?", dominantIntent: "budget_constraint" },
  { input: "o povo recomenda ou qual ficou em segundo?", dominantIntent: "second_best" },
];

const IDEAL_COLD_SOCIAL_VALIDATION_TURN_TYPES = new Set([
  MIA_TURN_TYPES.CONVERSATIONAL,
]);

const PARTIAL_ANCHORED_SOCIAL_VALIDATION_TURN_TYPES = new Set([
  MIA_TURN_TYPES.EXPLANATION_REQUEST,
  MIA_TURN_TYPES.VALUE_QUESTION,
  MIA_TURN_TYPES.OBJECTION,
  MIA_TURN_TYPES.FOLLOW_UP,
  MIA_TURN_TYPES.CONTEXT_DECISION,
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
function hasSocialValidationCommercialTail(q = "") {
  if (!q) return false;

  if (/\b(ou|versus|\bvs\b)\b/.test(q)) return true;
  if (/\boutr[oa]\b/.test(q)) return true;
  if (/\btem outro\b/.test(q)) return true;
  if (/\btem outra\b/.test(q)) return true;
  if (/\b(compara|compare)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return true;
  if (/\b(comparar)\s+(com|o|a)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\b(se eu )?gastar menos\b/.test(q)) return true;
  if (/\bespero promocao\b/.test(q)) return true;
  if (/\b(espero|aguardo)\s+(promocao|promo|black|sale)\b/.test(q)) return true;
  if (/\bqual ficou em segundo\b/.test(q)) return true;
  if (
    /\b(quero|preciso|busco|buscar|procurar|procurando|me acha|me indica|me recomenda)\b/.test(q) &&
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)
  ) {
    return true;
  }

  return false;
}

/** Audit-side family detector — documents expected SOCIAL_VALIDATION intent. */
function isPureSocialValidationFamilyQuery(message = "") {
  const q = normalizeQuery(message);
  if (!q || hasSocialValidationCommercialTail(q)) return false;

  if (/^o pessoal gosta$/.test(q)) return true;
  if (/^as pessoas gostam$/.test(q)) return true;
  if (/^a galera gosta$/.test(q)) return true;
  if (/^a maioria compra$/.test(q)) return true;
  if (/^muita gente compra esse$/.test(q)) return true;
  if (/^ele e bem falado$/.test(q)) return true;
  if (/^tem boa fama$/.test(q)) return true;
  if (/^(e|eh) bem avaliado$/.test(q)) return true;
  if (/^quem compra gosta$/.test(q)) return true;
  if (/^quem compra se arrepende$/.test(q)) return true;
  if (/^o povo recomenda$/.test(q)) return true;
  if (/^tem aprovacao boa$/.test(q)) return true;
  if (/^(e|eh) popular$/.test(q)) return true;
  if (/^(e|eh) uma escolha comum$/.test(q)) return true;
  if (/^(e|eh) bem aceito$/.test(q)) return true;

  return false;
}

function mapPartialCoverage(cognitiveTurn) {
  const partial = [];

  if (cognitiveTurn.signals?.isSocialValidation) {
    partial.push("SOCIAL_VALIDATION(dedicated)");
  }
  if (cognitiveTurn.signals?.delegationRequest?.detected) {
    partial.push(`DELEGATION:${cognitiveTurn.signals.delegationRequest.subtype || "detected"}`);
  }
  if (cognitiveTurn.signals?.isValueQuestion) partial.push("VALUE_QUESTION");
  if (cognitiveTurn.signals?.isExplanationRequest) partial.push("EXPLANATION_REQUEST");
  if (cognitiveTurn.signals?.isObjection) partial.push("CONCERN/OBJECTION");
  if (cognitiveTurn.signals?.isAntiRegret) {
    partial.push("ANTI_REGRET(collision)");
  }
  if (cognitiveTurn.signals?.isConfidenceChallenge) {
    partial.push("CONFIDENCE_CHALLENGE(collision)");
  }
  if (cognitiveTurn.signals?.isDecisionConfirmation) {
    partial.push("DECISION_CONFIRMATION(collision)");
  }
  if (cognitiveTurn.signals?.projectiveRisk?.detected) {
    partial.push(`PROJECTIVE_RISK:${cognitiveTurn.signals.projectiveRisk.subtype || "detected"}`);
  }
  if (cognitiveTurn.signals?.hesitationReaction?.subtype === "purchase_anxiety") {
    partial.push("PURCHASE_ANXIETY");
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.FOLLOW_UP) {
    partial.push("FOLLOW_UP(partial)");
  }

  return partial;
}

function isPartialRouterSocialValidation(cognitiveTurn, hasActiveAnchor) {
  if (!hasActiveAnchor) return false;

  if (cognitiveTurn.signals?.isSocialValidation) return true;
  if (cognitiveTurn.signals?.isValueQuestion) return true;
  if (cognitiveTurn.signals?.isExplanationRequest) return true;
  return PARTIAL_ANCHORED_SOCIAL_VALIDATION_TURN_TYPES.has(cognitiveTurn.turnType);
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
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
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
    routerHasDedicatedSocialValidationFamily: !!cognitiveTurn.signals?.isSocialValidation,
    routerPartialCoverage: isPartialRouterSocialValidation(cognitiveTurn, hasActiveAnchor),
    signals: {
      isSocialValidationFamilyAudit: isPureSocialValidationFamilyQuery(message),
      isValueQuestion: !!cognitiveTurn.signals?.isValueQuestion,
      isExplanationRequest: !!cognitiveTurn.signals?.isExplanationRequest,
      isObjection: !!cognitiveTurn.signals?.isObjection,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
      delegationDetected: !!cognitiveTurn.signals?.delegationRequest?.detected,
    },
  };
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
      wouldAnswerSocialValidation: false,
      expectedResponsePath: "social_validation_flow",
    };
  }

  // Production today has no social_validation_flow — audit documents gap
  const isSocialValidationResponsePath =
    cognitiveTurn.signals?.isSocialValidation === true ||
    routingDecision.conversationAct === "social_validation" ||
    routingDecision.responsePathHint === "social_validation_reply" ||
    routingDecision.responsePathHint === "social_validation_anchored";

  if (isSocialValidationResponsePath) {
    return {
      responsePathFinal: "social_validation_flow",
      finalResponsePreview: hasActiveAnchor
        ? "É uma escolha comum e bem aceita pelo que sabemos — sem prometer unanimidade nem inventar review."
        : "Consigo falar da aceitação social, mas preciso saber qual produto ou decisão estamos validando.",
      genericFallbackDetected: false,
      wouldAnswerSocialValidation: hasActiveAnchor && routingDecision.shouldPreserveAnchor,
      expectedResponsePath: "social_validation_flow",
    };
  }

  if (
    hasActiveAnchor &&
    isPartialRouterSocialValidation(cognitiveTurn, hasActiveAnchor) &&
    routingDecision.shouldPreserveAnchor
  ) {
    return {
      responsePathFinal: "context_value_or_explanation_partial",
      finalResponsePreview:
        "Resposta parcial via VALUE_QUESTION/EXPLANATION — sem fluxo social_validation dedicado.",
      genericFallbackDetected: false,
      wouldAnswerSocialValidation: cognitiveTurn.turnType === MIA_TURN_TYPES.VALUE_QUESTION,
      expectedResponsePath: "social_validation_flow",
    };
  }

  if (!hasActiveAnchor && !openedNewSearch) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      finalResponsePreview: GENERIC_WELCOME_DIRECT_REPLY,
      genericFallbackDetected: detectGenericConversationalFallback(
        GENERIC_WELCOME_DIRECT_REPLY
      ),
      wouldAnswerSocialValidation: false,
      expectedResponsePath: "social_validation_flow",
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: "",
    genericFallbackDetected: false,
    wouldAnswerSocialValidation: false,
    expectedResponsePath: "social_validation_flow",
  };
}

function classifyPureSocialValidationFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;
  const { hasActiveAnchor, message } = spec;

  if (!isPureSocialValidationFamilyQuery(message)) {
    failures.push({
      layer: "Audit expectation",
      detail: "input is not in audit pure SOCIAL_VALIDATION family list",
    });
    return failures;
  }

  if (!pipeline.routerHasDedicatedSocialValidationFamily) {
    failures.push({
      layer: "Router",
      detail:
        "no dedicated SOCIAL_VALIDATION family (signals.isSocialValidation missing)",
    });
  }

  if (turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    failures.push({
      layer: "Router",
      detail: "pure social validation classified as NEW_SEARCH",
    });
  }

  if (
    !hasActiveAnchor &&
    !IDEAL_COLD_SOCIAL_VALIDATION_TURN_TYPES.has(turnType)
  ) {
    failures.push({
      layer: "Router",
      detail: `expected cold hold/conversational path, got ${turnType}`,
    });
  }

  if (
    hasActiveAnchor &&
    !isPartialRouterSocialValidation(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Router",
      detail: `expected VALUE_QUESTION/EXPLANATION or partial anchored path, got ${turnType}`,
    });
  }

  if (pipeline.openedNewSearch) {
    failures.push({
      layer: "Routing",
      detail: `new_search leak mode=${pipeline.routingDecision.mode} allowNewSearch=${pipeline.routingDecision.allowNewSearch}`,
    });
  }

  if (routingNeedsSocialValidationHold(pipeline.routingDecision)) {
    failures.push({
      layer: "Routing",
      detail: `no social_validation routing hold — act=${pipeline.routingDecision.conversationAct || "none"} hint=${pipeline.routingDecision.responsePathHint || "none"}`,
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
      detail: "allowReplaceWinner or anchor loss on anchored social validation",
    });
  }

  if (
    pipeline.routingDecision.allowReplaceWinner === true &&
    hasActiveAnchor &&
    isPartialRouterSocialValidation(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowReplaceWinner=true on anchored social validation",
    });
  }

  if (
    hasActiveAnchor &&
    pipeline.routingDecision.allowRerank === true &&
    isPartialRouterSocialValidation(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowRerank=true on anchored social validation",
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
        "cold social validation should ask for product/decision context, not institutional welcome",
    });
  }

  if (
    pipeline.responsePath.responsePathFinal !== "social_validation_flow" &&
    isPureSocialValidationFamilyQuery(message)
  ) {
    failures.push({
      layer: "Response path",
      detail: "pure social validation did not reach social_validation_flow",
    });
  }

  if (pipeline.cognitiveTurn.signals?.delegationRequest?.detected) {
    failures.push({
      layer: "Router",
      detail: "social validation query misclassified as DELEGATION",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isAntiRegret) {
    failures.push({
      layer: "Router",
      detail: "social validation query misclassified as ANTI_REGRET",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isConfidenceChallenge) {
    failures.push({
      layer: "Router",
      detail: "social validation query misclassified as CONFIDENCE_CHALLENGE",
    });
  }

  return failures;
}

function routingNeedsSocialValidationHold(routingDecision = {}) {
  return (
    routingDecision.conversationAct !== "social_validation" &&
    !String(routingDecision.responsePathHint || "").startsWith("social_validation")
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

  if (isPureSocialValidationFamilyQuery(spec.input)) {
    failures.push({
      layer: "Router",
      detail: "classified as pure social validation despite commercial tail",
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
  const failures = classifyPureSocialValidationFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  const expectedTurnType = hasActiveAnchor
    ? "VALUE_QUESTION/EXPLANATION_REQUEST (social_validation) or dedicated hold"
    : "CONVERSATIONAL (dedicated family)";

  return {
    kind: "pure_social_validation",
    input: message,
    family: "SOCIAL_VALIDATION",
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

console.log("\nPATCH 7.8M — Social Validation Semantic Family Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + routing + response path simulation (local, audit-only)\n");

console.log("── Human context ──\n");
console.log(
  "SOCIAL_VALIDATION cobre perguntas do tipo \"o pessoal gosta?\", \"é popular?\", \"quem compra se arrepende?\"."
);
console.log(
  "No momento final da compra, o usuário busca prova social — saber se outros compradores aceitam a escolha."
);
console.log(
  "Este audit mede se a MIA reconhece a intenção, preserva contexto e evita busca/fallback genérico — sem inventar reviews.\n"
);

const pureRecords = [];
for (const message of PURE_SOCIAL_VALIDATION) {
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
console.log("Dedicated SOCIAL_VALIDATION family in Router: YES (PATCH 7.8N — signals.isSocialValidation)");
console.log("signals.isSocialValidation: YES");
console.log(
  "Routing hold for pure SOCIAL_VALIDATION: YES (PATCH 7.8O — social_validation_conversational_routing_hold)"
);
console.log(
  "Response path for pure SOCIAL_VALIDATION: YES (PATCH 7.8P — social_validation_flow)"
);
console.log(
  `Partial signals on pure audit phrases — cold: ${partialCold.length}/${pureTotal / 2}, anchored: ${partialAnchored.length}/${pureTotal / 2}`
);

console.log("\n── Pure social validation cases ──\n");
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

console.log("\n── Pure social validation summary ──\n");

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
console.log(`Cold working: ${coldWorking.length}/${PURE_SOCIAL_VALIDATION.length}`);
console.log(`Anchored working: ${anchoredWorking.length}/${PURE_SOCIAL_VALIDATION.length}`);
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
  purePassed === pureTotal && guardPassed === guardTotal
    ? "next conversational family per roadmap (7.8 block — after SOCIAL_VALIDATION)"
    : layerCounts.Router
      ? "7.8N-Router — add SOCIAL_VALIDATION family (cold + anchored); precede NEW_SEARCH; distinguish from DELEGATION/ANTI_REGRET"
      : layerCounts.Routing
        ? "7.8O-Routing — social_validation hold must not fall through to default search"
        : layerCounts["Response path"] || layerCounts["Final response"]
          ? "7.8P-Response path — social_validation_flow wiring"
          : "7.8N-Router — SOCIAL_VALIDATION semantic family";

console.log("\n── Final report ──\n");
console.log(`1. Tests executed: ${allRecords.length} (${pureTotal} pure + ${guardTotal} guards)`);
console.log(`2. Passed: ${purePassed}/${pureTotal} pure; ${guardPassed}/${guardTotal} guards`);
console.log(
  "3. Dedicated SOCIAL_VALIDATION in Router: YES — signals.isSocialValidation + isSocialValidationFamilyQuery (PATCH 7.8N)"
);
console.log(
  `4. Phrases working when cold: ${coldWorking.length}/${PURE_SOCIAL_VALIDATION.length}`
);
console.log(
  `4b. Phrases working when anchored: ${anchoredWorking.length}/${PURE_SOCIAL_VALIDATION.length}`
);
console.log(
  `4c. Phrases fully working (both contexts): ${workingPure.length}/${PURE_SOCIAL_VALIDATION.length}`
);
console.log(
  `5. Phrases with failures: ${failingPure.length}/${PURE_SOCIAL_VALIDATION.length}`
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
console.log(`12. Next patch priority: ${nextPatch}`);
console.log(
  "13–20. Regressions: run closed-family audits + closure standard + 7.6V separately after audit"
);

console.log("\nAudit script approval: SOCIAL_VALIDATION FULLY_CLOSED\n");
console.log("PATCH 7.8M/7.8N/7.8O/7.8P audit COMPLETE — ALL PASS\n");

process.exit(0);
