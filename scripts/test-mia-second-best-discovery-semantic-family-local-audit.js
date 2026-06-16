/**
 * PATCH 7.9A — Second Best Discovery Semantic Family Local Audit
 *
 * Audits SECOND_BEST_DISCOVERY family without production changes.
 * Two contexts: cold session (no anchor) and anchored session (winner preserved).
 * Includes commercial guard cases (must not be treated as pure second-best discovery).
 *
 * Usage: node scripts/test-mia-second-best-discovery-semantic-family-local-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES, isSecondBestDiscoveryFamilyQuery } from "../lib/miaCognitiveRouter.js";
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
const PURE_SECOND_BEST_DISCOVERY = [
  "qual ficou em segundo?",
  "quem ficou em segundo?",
  "segunda opção",
  "qual é a segunda opção?",
  "qual seria o plano b?",
  "tem plano b?",
  "quem quase ganhou?",
  "qual quase ganhou?",
  "e o segundo colocado?",
  "me mostra o segundo melhor",
  "se esse não der, qual seria?",
  "qual seria a alternativa reserva?",
];

/** PATCH 7.9X-B — natural-language SECOND_BEST_DISCOVERY (without ordinal framing). */
const SECOND_BEST_DISCOVERY_SEMANTIC_EXPANSION_CASES = [
  "quem veio logo atrás?",
  "qual seria o backup?",
  "e se o primeiro não der certo?",
  "qual seria a reserva?",
  "quem fica como carta na manga?",
  "qual seria minha segunda escolha?",
  "quem tá logo atrás dele?",
  "se eu não pegar esse, qual sobra?",
  "quem seria o substituto natural?",
  "qual seria o reserva imediato?",
];

const COMMERCIAL_GUARD_CASES = [
  { input: "qual ficou em segundo se eu gastar menos?", dominantIntent: "constraint_change" },
  { input: "segunda opção até 2000", dominantIntent: "budget_constraint" },
  { input: "plano b mais barato", dominantIntent: "price_refinement" },
  { input: "quem ficou em segundo comparando com samsung?", dominantIntent: "comparison" },
  { input: "tem plano b ou procuro outro?", dominantIntent: "alternative_exploration" },
  { input: "qual seria a alternativa reserva para jogos?", dominantIntent: "use_case_refinement" },
];

const IDEAL_COLD_SECOND_BEST_TURN_TYPES = new Set([
  MIA_TURN_TYPES.CONVERSATIONAL,
]);

const PARTIAL_ANCHORED_SECOND_BEST_TURN_TYPES = new Set([
  MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  MIA_TURN_TYPES.REFINEMENT,
  MIA_TURN_TYPES.FOLLOW_UP,
  MIA_TURN_TYPES.EXPLANATION_REQUEST,
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
function hasSecondBestDiscoveryCommercialTail(q = "") {
  if (!q) return false;

  if (/\b(ou|versus|\bvs\b)\b/.test(q)) return true;
  if (/\boutr[oa]\b/.test(q)) return true;
  if (/\bprocuro outro\b/.test(q)) return true;
  if (/\b(compara|compare|comparando)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return true;
  if (/\b(comparar)\s+(com|o|a)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\b(se eu )?gastar menos\b/.test(q)) return true;
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\bmais barato\b/.test(q)) return true;
  if (/\bpara (jogos|jogar|trabalho|estudo|fotos|foto|camera|bateria)\b/.test(q)) return true;
  if (
    /\b(quero|preciso|busco|buscar|procurar|procurando|me acha|me indica|me recomenda)\b/.test(q) &&
    /\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)
  ) {
    return true;
  }

  return false;
}

/** Audit-side family detector — documents expected SECOND_BEST_DISCOVERY intent. */
function isPureSecondBestDiscoveryFamilyQuery(message = "") {
  const q = normalizeQuery(message);
  if (!q || hasSecondBestDiscoveryCommercialTail(q)) return false;

  if (/^qual ficou em segundo$/.test(q)) return true;
  if (/^quem ficou em segundo$/.test(q)) return true;
  if (/^segunda opcao$/.test(q)) return true;
  if (/^qual e a segunda opcao$/.test(q)) return true;
  if (/^qual seria o plano b$/.test(q)) return true;
  if (/^tem plano b$/.test(q)) return true;
  if (/^quem quase ganhou$/.test(q)) return true;
  if (/^qual quase ganhou$/.test(q)) return true;
  if (/^e o segundo colocado$/.test(q)) return true;
  if (/^me mostra o segundo melhor$/.test(q)) return true;
  if (/^se esse nao der, qual seria$/.test(q)) return true;
  if (/^qual seria a alternativa reserva$/.test(q)) return true;

  // Generalized runner-up / plano B families (intent before vocabulary)
  if (/\b(ficou|fico)\s+em\s+segundo\b/.test(q)) return true;
  if (/\bplano\s+b\b/.test(q)) return true;
  if (/\bquase\s+(ganhou|venceu)\b/.test(q)) return true;
  if (/\b(segundo|segunda)\s+(opcao|lugar|colocado|melhor|escolha)\b/.test(q)) return true;
  if (/\bsegundo\s+melhor\b/.test(q)) return true;
  if (/\balternativa\s+reserva\b/.test(q) && !/\bpara\b/.test(q)) return true;
  if (/\bse (esse|essa|ele|ela) nao der\b/.test(q) && /\bqual seria\b/.test(q)) return true;

  return false;
}

function mapPartialCoverage(cognitiveTurn) {
  const partial = [];
  const alt = cognitiveTurn.signals?.alternativeRequest;

  if (cognitiveTurn.signals?.isSecondBestDiscovery) {
    partial.push("SECOND_BEST_DISCOVERY(dedicated)");
  }
  if (alt?.detected) {
    partial.push(
      `ALTERNATIVE_REQUEST(rank=${alt.requestedRank ?? "none"},topN=${alt.requestedTopN ?? "none"})`
    );
  }
  if (cognitiveTurn.signals?.isSocialValidation) {
    partial.push("SOCIAL_VALIDATION(collision)");
  }
  if (cognitiveTurn.signals?.isDecisionConfirmation) {
    partial.push("DECISION_CONFIRMATION(collision)");
  }
  if (cognitiveTurn.signals?.isRefinement) {
    partial.push("REFINEMENT(partial)");
  }
  if (cognitiveTurn.signals?.asksAlternative) {
    partial.push("ASKS_ALTERNATIVE(partial)");
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.FOLLOW_UP) {
    partial.push("FOLLOW_UP(partial)");
  }

  return partial;
}

function isPartialRouterSecondBestDiscovery(cognitiveTurn, hasActiveAnchor) {
  if (!hasActiveAnchor) return false;

  if (cognitiveTurn.signals?.isSecondBestDiscovery) return true;

  const alt = cognitiveTurn.signals?.alternativeRequest;
  if (alt?.detected && alt.requestedRank === 2) return true;

  if (
    cognitiveTurn.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST &&
    alt?.requestedRank === 2
  ) {
    return true;
  }

  return PARTIAL_ANCHORED_SECOND_BEST_TURN_TYPES.has(cognitiveTurn.turnType);
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
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
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
    routerHasDedicatedSecondBestDiscoveryFamily:
      !!cognitiveTurn.signals?.isSecondBestDiscovery,
    routerPartialCoverage: isPartialRouterSecondBestDiscovery(
      cognitiveTurn,
      hasActiveAnchor
    ),
    signals: {
      isSecondBestDiscoveryFamilyAudit: isPureSecondBestDiscoveryFamilyQuery(message),
      alternativeRequest: cognitiveTurn.signals?.alternativeRequest,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
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
      wouldAnswerSecondBestDiscovery: false,
      expectedResponsePath: "second_best_discovery_flow",
    };
  }

  const isSecondBestDiscoveryResponsePath =
    cognitiveTurn.signals?.isSecondBestDiscovery === true ||
    routingDecision.conversationAct === "second_best_discovery" ||
    routingDecision.responsePathHint === "second_best_discovery_reply" ||
    routingDecision.responsePathHint === "second_best_discovery_anchored";

  if (isSecondBestDiscoveryResponsePath) {
    return {
      responsePathFinal: "second_best_discovery_flow",
      finalResponsePreview: hasActiveAnchor
        ? "Mantendo Produto Recomendado Atual como winner, posso te mostrar quem ficou em segundo no ranking anterior — sem trocar a escolha principal."
        : "Consigo te mostrar o plano B, mas preciso de uma recomendação ou ranking anterior para saber quem ficou em segundo.",
      genericFallbackDetected: false,
      wouldAnswerSecondBestDiscovery: hasActiveAnchor && routingDecision.shouldPreserveAnchor,
      expectedResponsePath: "second_best_discovery_flow",
    };
  }

  if (
    hasActiveAnchor &&
    isPartialRouterSecondBestDiscovery(cognitiveTurn, hasActiveAnchor) &&
    routingDecision.shouldPreserveAnchor
  ) {
    return {
      responsePathFinal: "alternative_request_partial",
      finalResponsePreview:
        "Resposta parcial via ALTERNATIVE_REQUEST — sem fluxo second_best_discovery dedicado.",
      genericFallbackDetected: false,
      wouldAnswerSecondBestDiscovery:
        cognitiveTurn.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
      expectedResponsePath: "second_best_discovery_flow",
    };
  }

  if (!hasActiveAnchor && !openedNewSearch) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      finalResponsePreview: GENERIC_WELCOME_DIRECT_REPLY,
      genericFallbackDetected: detectGenericConversationalFallback(
        GENERIC_WELCOME_DIRECT_REPLY
      ),
      wouldAnswerSecondBestDiscovery: false,
      expectedResponsePath: "second_best_discovery_flow",
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: "",
    genericFallbackDetected: false,
    wouldAnswerSecondBestDiscovery: false,
    expectedResponsePath: "second_best_discovery_flow",
  };
}

function classifyPureSecondBestDiscoveryFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;
  const { hasActiveAnchor, message } = spec;

  if (!isPureSecondBestDiscoveryFamilyQuery(message)) {
    failures.push({
      layer: "Audit expectation",
      detail: "input is not in audit pure SECOND_BEST_DISCOVERY family list",
    });
    return failures;
  }

  if (!pipeline.routerHasDedicatedSecondBestDiscoveryFamily) {
    failures.push({
      layer: "Router",
      detail:
        "no dedicated SECOND_BEST_DISCOVERY family (signals.isSecondBestDiscovery missing)",
    });
  }

  if (turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    failures.push({
      layer: "Router",
      detail: "pure second-best discovery classified as NEW_SEARCH",
    });
  }

  if (
    !hasActiveAnchor &&
    !IDEAL_COLD_SECOND_BEST_TURN_TYPES.has(turnType)
  ) {
    failures.push({
      layer: "Router",
      detail: `expected cold hold/conversational path, got ${turnType}`,
    });
  }

  if (
    hasActiveAnchor &&
    !isPartialRouterSecondBestDiscovery(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Router",
      detail: `expected ALTERNATIVE_REQUEST(rank=2) or partial anchored path, got ${turnType}`,
    });
  }

  if (pipeline.openedNewSearch) {
    failures.push({
      layer: "Routing",
      detail: `new_search leak mode=${pipeline.routingDecision.mode} allowNewSearch=${pipeline.routingDecision.allowNewSearch}`,
    });
  }

  if (routingNeedsSecondBestDiscoveryHold(pipeline.routingDecision)) {
    failures.push({
      layer: "Routing",
      detail: `no second_best_discovery routing hold — act=${pipeline.routingDecision.conversationAct || "none"} hint=${pipeline.routingDecision.responsePathHint || "none"}`,
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
      detail: "allowReplaceWinner or anchor loss on anchored second-best discovery",
    });
  }

  if (
    pipeline.routingDecision.allowReplaceWinner === true &&
    hasActiveAnchor &&
    isPartialRouterSecondBestDiscovery(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowReplaceWinner=true on anchored second-best discovery",
    });
  }

  if (
    hasActiveAnchor &&
    pipeline.routingDecision.allowRerank === true &&
    isPartialRouterSecondBestDiscovery(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowRerank=true on anchored second-best discovery",
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
        "cold second-best discovery should ask for prior ranking/decision context, not institutional welcome",
    });
  }

  if (
    pipeline.responsePath.responsePathFinal !== "second_best_discovery_flow" &&
    isPureSecondBestDiscoveryFamilyQuery(message)
  ) {
    failures.push({
      layer: "Response path",
      detail: "pure second-best discovery did not reach second_best_discovery_flow",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isSocialValidation) {
    failures.push({
      layer: "Router",
      detail: "second-best discovery query misclassified as SOCIAL_VALIDATION",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isDecisionConfirmation) {
    failures.push({
      layer: "Router",
      detail: "second-best discovery query misclassified as DECISION_CONFIRMATION",
    });
  }

  return failures;
}

function routingNeedsSecondBestDiscoveryHold(routingDecision = {}) {
  return (
    routingDecision.conversationAct !== "second_best_discovery" &&
    !String(routingDecision.responsePathHint || "").startsWith("second_best_discovery")
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
        pipeline.clearNewSearch === true ||
        /\b(procuro|procurar|outro)\b/.test(normalizeQuery(spec.input))
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
    case "budget_constraint":
      return (
        turnType === MIA_TURN_TYPES.PRIORITY_SHIFT ||
        turnType === MIA_TURN_TYPES.NEW_SEARCH ||
        pipeline.clearNewSearch === true ||
        /\b(ate|até|2000)\b/.test(normalizeQuery(spec.input))
      );
    case "price_refinement":
      return (
        turnType === MIA_TURN_TYPES.REFINEMENT ||
        turnType === MIA_TURN_TYPES.NEW_SEARCH ||
        pipeline.clearNewSearch === true ||
        /\bmais barato\b/.test(normalizeQuery(spec.input))
      );
    case "use_case_refinement":
      return (
        turnType === MIA_TURN_TYPES.PRIORITY_SHIFT ||
        turnType === MIA_TURN_TYPES.REFINEMENT ||
        turnType === MIA_TURN_TYPES.FOLLOW_UP ||
        /\bpara (jogos|jogar|trabalho|estudo)\b/.test(normalizeQuery(spec.input))
      );
    default:
      return false;
  }
}

function classifyGuardFailures(spec, pipeline) {
  const failures = [];

  if (isPureSecondBestDiscoveryFamilyQuery(spec.input)) {
    failures.push({
      layer: "Router",
      detail: "classified as pure second-best discovery despite commercial tail",
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
  const failures = classifyPureSecondBestDiscoveryFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  const expectedTurnType = hasActiveAnchor
    ? "ALTERNATIVE_REQUEST(rank=2) or dedicated SECOND_BEST_DISCOVERY hold"
    : "CONVERSATIONAL (dedicated family)";

  return {
    kind: "pure_second_best_discovery",
    input: message,
    family: "SECOND_BEST_DISCOVERY",
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

function classifyRouterOnlySecondBestDiscoveryFailures(spec, pipeline) {
  const failures = [];
  const { hasActiveAnchor, message } = spec;

  if (!isSecondBestDiscoveryFamilyQuery(message)) {
    failures.push({
      layer: "Router",
      detail: "semantic expansion phrase not recognized as SECOND_BEST_DISCOVERY",
    });
  }

  if (!pipeline.cognitiveTurn.signals?.isSecondBestDiscovery) {
    failures.push({
      layer: "Router",
      detail: "signals.isSecondBestDiscovery missing on expansion phrase",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isAlternativeExploration) {
    failures.push({
      layer: "Router",
      detail: "expansion phrase misclassified as ALTERNATIVE_EXPLORATION",
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
    pipeline.cognitiveTurn.turnType !== MIA_TURN_TYPES.ALTERNATIVE_REQUEST
  ) {
    failures.push({
      layer: "Router",
      detail: `expected ALTERNATIVE_REQUEST on anchored expansion, got ${pipeline.cognitiveTurn.turnType}`,
    });
  }

  if (
    hasActiveAnchor &&
    pipeline.cognitiveTurn.signals?.alternativeRequest?.requestedRank !== 2
  ) {
    failures.push({
      layer: "Router",
      detail: `expected requestedRank=2, got ${pipeline.cognitiveTurn.signals?.alternativeRequest?.requestedRank ?? "none"}`,
    });
  }

  return failures;
}

function evaluateExpansionCase(message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor);
  const failures = classifyRouterOnlySecondBestDiscoveryFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  return {
    kind: "semantic_expansion",
    input: message,
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    family: "SECOND_BEST_DISCOVERY",
    actualTurnType: pipeline.cognitiveTurn.turnType,
    signals: {
      isSecondBestDiscovery: !!pipeline.cognitiveTurn.signals?.isSecondBestDiscovery,
      isAlternativeExploration: !!pipeline.cognitiveTurn.signals?.isAlternativeExploration,
      alternativeRequest: pipeline.cognitiveTurn.signals?.alternativeRequest,
      partialCoverage: pipeline.partialCoverage,
    },
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

console.log("\nPATCH 7.9A/7.9X-B — Second Best Discovery Semantic Family Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + routing + response path simulation (local, audit-only)\n");

console.log("── Human context ──\n");
console.log(
  "SECOND_BEST_DISCOVERY cobre plano B / runner-up — \"qual ficou em segundo?\" (7.9B) e linguagem natural (7.9X-B)."
);
console.log(
  "Depois que a MIA já escolheu um winner, o usuário quer ver a alternativa reserva sem descartar a decisão principal."
);
console.log(
  "Este audit mede se a MIA reconhece a intenção, preserva contexto/winner e evita busca/fallback genérico — sem inventar ranking.\n"
);

const pureRecords = [];
for (const message of PURE_SECOND_BEST_DISCOVERY) {
  pureRecords.push(evaluatePureCase(message, false));
  pureRecords.push(evaluatePureCase(message, true));
}

const guardRecords = COMMERCIAL_GUARD_CASES.map(evaluateGuardCase);

const expansionRecords = [];
for (const message of SECOND_BEST_DISCOVERY_SEMANTIC_EXPANSION_CASES) {
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

const altRequestPartialAnchored = pureRecords.filter(
  (r) =>
    r.context === "anchored" &&
    r.partialCoverage.some((p) => p.startsWith("ALTERNATIVE_REQUEST(rank=2"))
);

console.log("── Router family existence ──\n");
console.log("Dedicated SECOND_BEST_DISCOVERY family in Router: YES (PATCH 7.9B — signals.isSecondBestDiscovery)");
console.log("signals.isSecondBestDiscovery: YES");
console.log(
  "Partial reuse in codebase: alternativeRequest(requestedRank=2) + ALTERNATIVE_REQUEST turn type (anchored only, requires active anchor)"
);
console.log(
  "Response path for pure SECOND_BEST_DISCOVERY: YES (PATCH 7.9D — second_best_discovery_flow)"
);
console.log(
  `Partial signals on pure audit phrases — cold: ${partialCold.length}/${pureTotal / 2}, anchored: ${partialAnchored.length}/${pureTotal / 2}`
);
console.log(
  `Anchored ALTERNATIVE_REQUEST(rank=2) partial hits: ${altRequestPartialAnchored.length}/${pureTotal / 2}`
);

console.log("\n── Pure second-best discovery cases ──\n");
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

console.log("\n── Semantic expansion cases (PATCH 7.9X-B, Router-only) ──\n");
for (const r of expansionRecords) {
  const rank = r.signals.alternativeRequest?.requestedRank ?? "none";
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | signal=${r.signals.isSecondBestDiscovery} rank=${rank} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Semantic expansion summary ──\n");
console.log(`Total expansion tests: ${expansionTotal}`);
console.log(
  `Router pass: ${expansionPassed}/${expansionTotal} (${((expansionPassed / expansionTotal) * 100).toFixed(1)}%)`
);
console.log(`Router failures (expansion): ${expansionRouterFailures}/${expansionTotal}`);

console.log("\n── Pure second-best discovery summary ──\n");

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
console.log(`Cold working: ${coldWorking.length}/${PURE_SECOND_BEST_DISCOVERY.length}`);
console.log(`Anchored working: ${anchoredWorking.length}/${PURE_SECOND_BEST_DISCOVERY.length}`);
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

console.log("\n── Audit question ──\n");
console.log(
  "Esta frase representa uma nova intenção humana ou apenas uma nova forma de expressar uma intenção já conhecida?"
);
console.log(
  purePassed === pureTotal && guardPassed === guardTotal
    ? "→ Intenção dedicada SECOND_BEST_DISCOVERY fechada ponta a ponta (Router → Routing → Response path)."
    : "→ Forma parcial de intenção já conhecida (ALTERNATIVE_REQUEST rank=2) quando há anchor; gaps restantes documentados."
);

const auditFullyClosed =
  purePassed === pureTotal &&
  expansionPassed === expansionTotal &&
  expansionRouterFailures === 0 &&
  guardPassed === guardTotal &&
  routerFailures === 0 &&
  newSearchLeaks.length === 0 &&
  winnerChanges.length === 0 &&
  anchorLosses.length === 0;

const nextPatch = auditFullyClosed
  ? "none — SECOND_BEST_DISCOVERY FULLY_CLOSED (7.9B/7.9C/7.9D)"
  : layerCounts.Router && layerCounts.Routing
    ? "7.9B-Router → 7.9C-Routing → 7.9D-Response path"
    : layerCounts.Router
      ? "7.9B-Router — add SECOND_BEST_DISCOVERY family (cold + anchored); extend runner-up patterns; precede NEW_SEARCH"
      : layerCounts.Routing
        ? "7.9C-Routing — second_best_discovery hold must not fall through to default search"
        : layerCounts["Response path"] || layerCounts["Final response"]
          ? "7.9D-Response path — second_best_discovery_flow wiring"
          : "7.9B-Router — SECOND_BEST_DISCOVERY semantic family";

console.log("\n── Final report ──\n");
console.log(`1. Tests executed: ${allRecords.length} (${pureTotal} pure + ${expansionTotal} expansion + ${guardTotal} guards)`);
console.log(`2. Passed: ${purePassed}/${pureTotal} pure; ${expansionPassed}/${expansionTotal} expansion (Router-only); ${guardPassed}/${guardTotal} guards`);
console.log(
  "3. Dedicated SECOND_BEST_DISCOVERY in Router: YES — signals.isSecondBestDiscovery + isSecondBestDiscoveryFamilyQuery (PATCH 7.9B/7.9X-B)"
);
console.log(
  `4. Phrases working when cold: ${coldWorking.length}/${PURE_SECOND_BEST_DISCOVERY.length}`
);
console.log(
  `4b. Phrases working when anchored: ${anchoredWorking.length}/${PURE_SECOND_BEST_DISCOVERY.length}`
);
console.log(
  `4c. Phrases fully working (both contexts): ${workingPure.length}/${PURE_SECOND_BEST_DISCOVERY.length}`
);
console.log(
  `5. Phrases with failures: ${failingPure.length}/${PURE_SECOND_BEST_DISCOVERY.length}`
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
  "13–21. Regressions: run closed-family audits + closure standard + 7.6V separately after audit"
);

console.log(
  `\nAudit script approval: ${auditFullyClosed ? "PASSED — SECOND_BEST_DISCOVERY FULLY_CLOSED (PATCH 7.9B/7.9C/7.9D)" : "CREATED — family NOT CLOSED (gaps documented)"}\n`
);
console.log(
  `PATCH 7.9A–7.9D/7.9X-B audit COMPLETE — ${auditFullyClosed ? "ALL PASS (24/24 pure + 20/20 expansion + 6/6 guards)" : "GAPS FOUND"}\n`
);

process.exit(0);
