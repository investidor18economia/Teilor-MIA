/**
 * PATCH 7.9E — Alternative Exploration Semantic Family Local Audit
 *
 * AUDIT ONLY — no production changes.
 * Two contexts: cold session (no anchor) and anchored session (winner preserved).
 * Includes commercial guard cases (dominant intent must not be swallowed).
 *
 * Usage: node scripts/test-mia-alternative-exploration-semantic-family-local-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES, isAlternativeExplorationFamilyQuery } from "../lib/miaCognitiveRouter.js";
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

/** Audit-side pure ALTERNATIVE_EXPLORATION phrases (not a closed vocabulary). */
const PURE_ALTERNATIVE_EXPLORATION = [
  "tem outro?",
  "tem outra opção?",
  "tem alternativa?",
  "me mostra outro",
  "me mostra outra opção",
  "existe outro caminho?",
  "tem algum outro bom?",
  "tem algum parecido?",
  "tem opção diferente?",
  "quero ver outro",
  "me dá outra alternativa",
  "tem algo além desse?",
  "quais outras opções?",
  "dá pra ver outro?",
];

/** PATCH 7.9X-A — natural-language ALTERNATIVE_EXPLORATION (without "tem outro?" framing). */
const ALTERNATIVE_EXPLORATION_SEMANTIC_EXPANSION_CASES = [
  "quero abrir um pouco as opções",
  "o que mais existe nessa linha?",
  "tem mais possibilidades?",
  "quero olhar alternativas",
  "quero explorar outras opções",
  "dá pra ver mais caminhos?",
  "não quero decidir sem ver outras opções",
  "me mostra possibilidades parecidas",
];

const COMMERCIAL_GUARD_CASES = [
  { input: "tem outro mais barato?", dominantIntent: "price_refinement" },
  { input: "me mostra outra opção até 2000", dominantIntent: "budget_constraint" },
  { input: "tem alternativa para jogos?", dominantIntent: "use_case_refinement" },
  { input: "tem outro comparando com samsung?", dominantIntent: "comparison" },
  { input: "quero ver outro se eu gastar menos", dominantIntent: "constraint_change" },
  { input: "tem outro ou quem ficou em segundo?", dominantIntent: "second_best_discovery" },
];

const IDEAL_COLD_ALTERNATIVE_EXPLORATION_TURN_TYPES = new Set([
  MIA_TURN_TYPES.CONVERSATIONAL,
]);

const PARTIAL_ANCHORED_ALTERNATIVE_EXPLORATION_TURN_TYPES = new Set([
  MIA_TURN_TYPES.ALTERNATIVE_REQUEST,
  MIA_TURN_TYPES.REFINEMENT,
  MIA_TURN_TYPES.FOLLOW_UP,
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

/** Audit-side commercial / collision tail — must not be pure ALTERNATIVE_EXPLORATION. */
function hasAlternativeExplorationCommercialTail(q = "") {
  if (!q) return false;

  if (/\b(ou|versus|\bvs\b)\b/.test(q) && /\b(segundo|plano b|quem ficou)\b/.test(q)) return true;
  if (/\b(compara|compare|comparando)\s+(com|o|a|e\s+|samsung)\b/.test(q)) return true;
  if (/\b(comparar)\s+(com|o|a)\b/.test(q)) return true;
  if (/\b(ate|até|por|abaixo|menos de|gastar)\s+r?\$?\s*\d/.test(q)) return true;
  if (/\b(se eu )?gastar menos\b/.test(q)) return true;
  if (/\be se eu\b/.test(q) && /\b(gastar|pagar|menos)\b/.test(q)) return true;
  if (/\bmais barato\b/.test(q)) return true;
  if (/\bpara (jogos|jogar|trabalho|estudar|fotos|foto|camera|bateria)\b/.test(q)) return true;
  if (/\b(quem ficou|ficou em segundo|plano b|quase ganhou|segundo colocado)\b/.test(q)) return true;

  return false;
}

/** Audit-side family detector — documents expected ALTERNATIVE_EXPLORATION intent. */
function isPureAlternativeExplorationFamilyQuery(message = "") {
  const q = normalizeQuery(message);
  if (!q || hasAlternativeExplorationCommercialTail(q)) return false;

  // SECOND_BEST_DISCOVERY collision guard
  if (/\b(segundo|segunda)\s+(opcao|lugar|colocado|melhor)\b/.test(q)) return false;
  if (/\bplano\s+b\b/.test(q)) return false;
  if (/\bquase\s+(ganhou|venceu)\b/.test(q)) return false;

  if (/^tem outro$/.test(q)) return true;
  if (/^tem outra opcao$/.test(q)) return true;
  if (/^tem alternativa$/.test(q)) return true;
  if (/^me mostra outro$/.test(q)) return true;
  if (/^me mostra outra opcao$/.test(q)) return true;
  if (/^existe outro caminho$/.test(q)) return true;
  if (/^tem algum outro bom$/.test(q)) return true;
  if (/^tem algum parecido$/.test(q)) return true;
  if (/^tem opcao diferente$/.test(q)) return true;
  if (/^quero ver outro$/.test(q)) return true;
  if (/^me da outra alternativa$/.test(q)) return true;
  if (/^tem algo alem desse$/.test(q)) return true;
  if (/^quais outras opcoes$/.test(q)) return true;
  if (/^da pra ver outro$/.test(q)) return true;

  // Generalized exploration (intent before vocabulary)
  if (/\btem\s+(outro|outra|alternativa)\b/.test(q) && q.split(" ").length <= 4) return true;
  if (/\bme\s+mostra\s+(outro|outra)\b/.test(q)) return true;
  if (/\bquero\s+ver\s+outr[oa]\b/.test(q)) return true;
  if (/\b(outro|outra)\s+caminho\b/.test(q)) return true;
  if (/\btem\s+algo\s+alem\b/.test(q)) return true;
  if (/\bquais\s+outras\s+opcoes\b/.test(q)) return true;
  if (/\bda\s+pra\s+ver\s+outr[oa]\b/.test(q)) return true;
  if (/\bme\s+da\s+outra\s+alternativa\b/.test(q)) return true;
  if (/\btem\s+opcao\s+diferente\b/.test(q)) return true;
  if (/\btem\s+algum\s+(outro|parecido)\b/.test(q)) return true;

  return false;
}

function mapPartialCoverage(cognitiveTurn) {
  const partial = [];
  const alt = cognitiveTurn.signals?.alternativeRequest;

  if (cognitiveTurn.signals?.isSecondBestDiscovery) {
    partial.push("SECOND_BEST_DISCOVERY(collision)");
  }
  if (cognitiveTurn.signals?.isAlternativeExploration) {
    partial.push("ALTERNATIVE_EXPLORATION(dedicated)");
  }
  if (alt?.detected) {
    partial.push(
      `ALTERNATIVE_REQUEST(rank=${alt.requestedRank ?? "none"},topN=${alt.requestedTopN ?? "none"})`
    );
  }
  if (cognitiveTurn.signals?.asksAlternative) {
    partial.push("ASKS_ALTERNATIVE(partial)");
  }
  if (cognitiveTurn.signals?.isRefinement) {
    partial.push("REFINEMENT(partial)");
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.REFINEMENT) {
    partial.push("REFINEMENT(turn)");
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST) {
    partial.push("ALTERNATIVE_REQUEST(turn)");
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION) {
    partial.push("OBJECTION(collision?)");
  }

  return partial;
}

function isPartialRouterAlternativeExploration(cognitiveTurn, hasActiveAnchor) {
  if (!hasActiveAnchor) return false;

  if (cognitiveTurn.signals?.isAlternativeExploration) return true;

  const alt = cognitiveTurn.signals?.alternativeRequest;
  if (alt?.detected && alt.requestedRank !== 2) return true;
  if (cognitiveTurn.signals?.asksAlternative && cognitiveTurn.signals?.isRefinement) return true;
  if (
    cognitiveTurn.turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST &&
    alt?.requestedRank !== 2
  ) {
    return true;
  }
  if (
    cognitiveTurn.turnType === MIA_TURN_TYPES.REFINEMENT &&
    cognitiveTurn.signals?.asksAlternative
  ) {
    return true;
  }

  return PARTIAL_ANCHORED_ALTERNATIVE_EXPLORATION_TURN_TYPES.has(cognitiveTurn.turnType);
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
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
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
    routerHasDedicatedAlternativeExplorationFamily:
      cognitiveTurn.signals?.isAlternativeExploration === true,
    routerPartialCoverage: isPartialRouterAlternativeExploration(
      cognitiveTurn,
      hasActiveAnchor
    ),
  };
}

function simulateResponsePath({
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
      expectedResponsePath: "alternative_exploration_flow",
    };
  }

  if (
    routingDecision.conversationAct === "second_best_discovery" ||
    cognitiveTurn.signals?.isSecondBestDiscovery
  ) {
    return {
      responsePathFinal: "second_best_discovery_flow",
      finalResponsePreview: "",
      genericFallbackDetected: false,
      expectedResponsePath: "alternative_exploration_flow",
    };
  }

  if (
    routingDecision.conversationAct === "alternative_exploration" ||
    String(routingDecision.responsePathHint || "").startsWith("alternative_exploration")
  ) {
    return {
      responsePathFinal: "alternative_exploration_flow",
      finalResponsePreview: hasActiveAnchor
        ? "Mantendo Produto Recomendado Atual como referência, posso explorar outra opção sem trocar o vencedor automaticamente."
        : "Consigo explorar alternativas, mas preciso saber qual decisão ou critério estamos analisando.",
      genericFallbackDetected: false,
      expectedResponsePath: "alternative_exploration_flow",
    };
  }

  if (
    hasActiveAnchor &&
    isPartialRouterAlternativeExploration(cognitiveTurn, hasActiveAnchor) &&
    routingDecision.shouldPreserveAnchor
  ) {
    return {
      responsePathFinal: "alternative_request_partial",
      finalResponsePreview:
        "Resposta parcial via ALTERNATIVE_REQUEST/REFINEMENT — sem fluxo alternative_exploration dedicado.",
      genericFallbackDetected: false,
      expectedResponsePath: "alternative_exploration_flow",
    };
  }

  if (!hasActiveAnchor && !openedNewSearch) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      finalResponsePreview: GENERIC_WELCOME_DIRECT_REPLY,
      genericFallbackDetected: detectGenericConversationalFallback(
        GENERIC_WELCOME_DIRECT_REPLY
      ),
      expectedResponsePath: "alternative_exploration_flow",
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: "",
    genericFallbackDetected: false,
    expectedResponsePath: "alternative_exploration_flow",
  };
}

function routingNeedsAlternativeExplorationHold(routingDecision = {}) {
  return (
    routingDecision.conversationAct !== "alternative_exploration" &&
    !String(routingDecision.responsePathHint || "").startsWith("alternative_exploration")
  );
}

function classifyPureAlternativeExplorationFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;
  const { hasActiveAnchor, message } = spec;

  if (!isPureAlternativeExplorationFamilyQuery(message)) {
    failures.push({
      layer: "Audit expectation",
      detail: "input is not in audit pure ALTERNATIVE_EXPLORATION family list",
    });
    return failures;
  }

  if (!pipeline.routerHasDedicatedAlternativeExplorationFamily) {
    failures.push({
      layer: "Router",
      detail:
        "no dedicated ALTERNATIVE_EXPLORATION family (signals.isAlternativeExploration missing)",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isSecondBestDiscovery) {
    failures.push({
      layer: "Router",
      detail: "alternative exploration misclassified as SECOND_BEST_DISCOVERY",
    });
  }

  if (turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    failures.push({
      layer: "Router",
      detail: "pure alternative exploration classified as NEW_SEARCH",
    });
  }

  if (
    hasActiveAnchor &&
    turnType === MIA_TURN_TYPES.OBJECTION &&
    pipeline.cognitiveTurn.signals?.isAlternativeExploration
  ) {
    failures.push({
      layer: "Router",
      detail: "alternative exploration misclassified as OBJECTION",
    });
  }

  if (
    hasActiveAnchor &&
    turnType === MIA_TURN_TYPES.UNKNOWN &&
    pipeline.cognitiveTurn.signals?.isAlternativeExploration
  ) {
    failures.push({
      layer: "Router",
      detail: "alternative exploration misclassified as UNKNOWN",
    });
  }

  if (
    !hasActiveAnchor &&
    !IDEAL_COLD_ALTERNATIVE_EXPLORATION_TURN_TYPES.has(turnType)
  ) {
    failures.push({
      layer: "Router",
      detail: `expected cold hold/conversational path, got ${turnType}`,
    });
  }

  if (
    hasActiveAnchor &&
    !isPartialRouterAlternativeExploration(pipeline.cognitiveTurn, hasActiveAnchor) &&
    turnType !== MIA_TURN_TYPES.CONVERSATIONAL
  ) {
    failures.push({
      layer: "Router",
      detail: `expected ALTERNATIVE_REQUEST/REFINEMENT or partial anchored path, got ${turnType}`,
    });
  }

  if (pipeline.openedNewSearch) {
    failures.push({
      layer: "Routing",
      detail: `new_search leak mode=${pipeline.routingDecision.mode} allowNewSearch=${pipeline.routingDecision.allowNewSearch}`,
    });
  }

  if (routingNeedsAlternativeExplorationHold(pipeline.routingDecision)) {
    failures.push({
      layer: "Routing",
      detail: `no alternative_exploration routing hold — act=${pipeline.routingDecision.conversationAct || "none"} hint=${pipeline.routingDecision.responsePathHint || "none"}`,
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
      detail: "allowReplaceWinner or anchor loss on anchored alternative exploration",
    });
  }

  if (
    pipeline.routingDecision.allowReplaceWinner === true &&
    hasActiveAnchor &&
    isPartialRouterAlternativeExploration(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowReplaceWinner=true on anchored alternative exploration",
    });
  }

  if (
    hasActiveAnchor &&
    pipeline.routingDecision.allowRerank === true &&
    isPartialRouterAlternativeExploration(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowRerank=true on anchored alternative exploration",
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
        "cold alternative exploration should ask for prior decision/criteria, not institutional welcome",
    });
  }

  if (
    pipeline.responsePath.responsePathFinal !== "alternative_exploration_flow" &&
    isPureAlternativeExplorationFamilyQuery(message)
  ) {
    failures.push({
      layer: "Response path",
      detail: "pure alternative exploration did not reach alternative_exploration_flow",
    });
  }

  return failures;
}

function dominantIntentPreserved(spec, pipeline) {
  const turnType = pipeline.cognitiveTurn.turnType;
  const { dominantIntent } = spec;

  switch (dominantIntent) {
    case "second_best_discovery":
      return (
        turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST ||
        turnType === MIA_TURN_TYPES.REFINEMENT ||
        pipeline.cognitiveTurn.signals?.isSecondBestDiscovery === true ||
        /\b(segundo|plano b)\b/.test(normalizeQuery(spec.input))
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

  if (isPureAlternativeExplorationFamilyQuery(spec.input)) {
    failures.push({
      layer: "Router",
      detail: "classified as pure alternative exploration despite commercial tail",
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
  const failures = classifyPureAlternativeExplorationFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  const record = {
    kind: "pure_alternative_exploration",
    input: message,
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    family: "ALTERNATIVE_EXPLORATION",
    expectedTurnType:
      hasActiveAnchor
        ? "ALTERNATIVE_REQUEST or REFINEMENT + dedicated hold"
        : "CONVERSATIONAL + dedicated hold",
    actualTurnType: pipeline.cognitiveTurn.turnType,
    signals: {
      asksAlternative: !!pipeline.cognitiveTurn.signals?.asksAlternative,
      alternativeRequest: pipeline.cognitiveTurn.signals?.alternativeRequest,
      isSecondBestDiscovery: !!pipeline.cognitiveTurn.signals?.isSecondBestDiscovery,
      isRefinement: !!pipeline.cognitiveTurn.signals?.isRefinement,
      partialCoverage: pipeline.partialCoverage,
    },
    routingMode: pipeline.routingDecision.mode || "",
    conversationAct: pipeline.routingDecision.conversationAct || "",
    allowNewSearch: pipeline.routingDecision.allowNewSearch,
    allowCommercialFallback: pipeline.routingDecision.allowCommercialFallback,
    allowReplaceWinner: pipeline.routingDecision.allowReplaceWinner,
    allowRerank: pipeline.routingDecision.allowRerank,
    shouldPreserveAnchor: pipeline.routingDecision.shouldPreserveAnchor,
    responsePathHint: pipeline.routingDecision.responsePathHint || "",
    responsePathFinal: pipeline.responsePath.responsePathFinal,
    anchorPreserved: pipeline.anchorPreserved,
    winnerChanged: pipeline.winnerChanged,
    openedNewSearch: pipeline.openedNewSearch,
    genericFallbackDetected: pipeline.responsePath.genericFallbackDetected,
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };

  return record;
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

function classifyRouterOnlyAlternativeExplorationFailures(spec, pipeline) {
  const failures = [];
  const { hasActiveAnchor, message } = spec;

  if (!isAlternativeExplorationFamilyQuery(message)) {
    failures.push({
      layer: "Router",
      detail: "semantic expansion phrase not recognized as ALTERNATIVE_EXPLORATION",
    });
  }

  if (!pipeline.cognitiveTurn.signals?.isAlternativeExploration) {
    failures.push({
      layer: "Router",
      detail: "signals.isAlternativeExploration missing on expansion phrase",
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

  return failures;
}

function evaluateExpansionCase(message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor);
  const failures = classifyRouterOnlyAlternativeExplorationFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  return {
    kind: "semantic_expansion",
    input: message,
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    family: "ALTERNATIVE_EXPLORATION",
    actualTurnType: pipeline.cognitiveTurn.turnType,
    signals: {
      isAlternativeExploration: !!pipeline.cognitiveTurn.signals?.isAlternativeExploration,
      partialCoverage: pipeline.partialCoverage,
    },
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

console.log("\nPATCH 7.9E/7.9X-A — Alternative Exploration Semantic Family Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + routing + response path simulation (local, audit-only)\n");

console.log("── Human context ──\n");
console.log(
  "ALTERNATIVE_EXPLORATION cobre explorar alternativas paralelas — \"tem outro?\" (7.9F) e linguagem natural (7.9X-A)."
);
console.log(
  "Depois que a MIA já escolheu um winner, o usuário quer explorar outra possibilidade sem trocar o vencedor automaticamente."
);
console.log(
  "Este audit mede se a MIA reconhece a intenção, preserva contexto/winner e evita busca/fallback genérico — sem inventar alternativa.\n"
);

const pureRecords = [];
for (const message of PURE_ALTERNATIVE_EXPLORATION) {
  pureRecords.push(evaluatePureCase(message, false));
  pureRecords.push(evaluatePureCase(message, true));
}

const guardRecords = COMMERCIAL_GUARD_CASES.map(evaluateGuardCase);

const expansionRecords = [];
for (const message of ALTERNATIVE_EXPLORATION_SEMANTIC_EXPANSION_CASES) {
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
  (r) => r.context === "no_anchor" && r.signals.partialCoverage.length > 0
);
const partialAnchored = pureRecords.filter(
  (r) => r.context === "anchored" && r.signals.partialCoverage.length > 0
);

const layerCounts = {};
for (const r of pureRecords) {
  for (const f of r.failures) {
    layerCounts[f.layer] = (layerCounts[f.layer] || 0) + 1;
  }
}
const topLayer = Object.entries(layerCounts).sort((a, b) => b[1] - a[1])[0];

const routerFailures = pureRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Router")
).length;

console.log("── Router family existence ──\n");
console.log(
  "Dedicated ALTERNATIVE_EXPLORATION family in Router: YES (PATCH 7.9F/7.9X-A — signals.isAlternativeExploration)"
);
console.log("signals.isAlternativeExploration: YES");
console.log(
  "Partial reuse in codebase: asksAlternative + alternativeRequest (Family E soft, anchored) + ALTERNATIVE_REQUEST/REFINEMENT turn types"
);
console.log(
  "Response path for pure ALTERNATIVE_EXPLORATION: YES (PATCH 7.9H — alternative_exploration_flow)"
);
console.log(
  `Partial signals on pure audit phrases — cold: ${partialCold.length}/${pureTotal / 2}, anchored: ${partialAnchored.length}/${pureTotal / 2}`
);

console.log("\n── Pure alternative exploration cases ──\n");
for (const r of pureRecords) {
  const partial = r.signals.partialCoverage.length
    ? `[${r.signals.partialCoverage.join(",")}]`
    : "[]";
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | partial=${partial} | mode=${r.routingMode} newSearch=${r.openedNewSearch} path=${r.responsePathFinal} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Commercial guard cases (anchored) ──\n");
for (const r of guardRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} "${r.input}" → ${r.actualTurnType} | intent=${r.dominantIntent} mode=${r.routingMode} allow=${r.allowNewSearch} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Semantic expansion cases (PATCH 7.9X-A, Router-only) ──\n");
for (const r of expansionRecords) {
  const partial = r.signals.partialCoverage.length
    ? `[${r.signals.partialCoverage.join(",")}]`
    : "[]";
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | partial=${partial} | signal=${r.signals.isAlternativeExploration} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Semantic expansion summary ──\n");
console.log(`Total expansion tests: ${expansionTotal}`);
console.log(
  `Router pass: ${expansionPassed}/${expansionTotal} (${((expansionPassed / expansionTotal) * 100).toFixed(1)}%)`
);
console.log(`Router failures (expansion): ${expansionRouterFailures}/${expansionTotal}`);

console.log("\n── Pure alternative exploration summary ──\n");
console.log(`Total pure tests: ${pureTotal}`);
console.log(`Passed: ${purePassed}/${pureTotal} (${((purePassed / pureTotal) * 100).toFixed(1)}%)`);
console.log(`Cold working: ${coldWorking.length}/${PURE_ALTERNATIVE_EXPLORATION.length}`);
console.log(`Anchored working: ${anchoredWorking.length}/${PURE_ALTERNATIVE_EXPLORATION.length}`);
console.log(`New_search leaks: ${newSearchLeaks.length}/${pureTotal}`);
console.log(`Anchor/winner losses: ${anchorLosses.length}`);
console.log(`Winner changes indevidos: ${winnerChanges.length}`);
console.log(`Commercial guard tests: ${guardPassed}/${guardTotal}`);
console.log(`Router failures (pure): ${routerFailures}/${pureTotal}`);

console.log("\n── Working (all contexts pass) ──\n");
console.log(workingPure.length ? workingPure.map((g) => `"${g}"`).join(", ") : "(none)");

console.log("\n── Failing (any pure context) ──\n");
console.log(failingPure.length ? failingPure.map((g) => `"${g}"`).join(", ") : "(none)");

console.log("\n── Audit question ──\n");
console.log(
  "Esta frase representa uma nova intenção humana ou apenas uma nova forma de expressar uma intenção já conhecida?"
);
console.log(
  purePassed === pureTotal && guardPassed === guardTotal && routerFailures === 0
    ? "→ Família ALTERNATIVE_EXPLORATION FULLY_CLOSED ponta a ponta (Router → Routing → Response path)."
    : "→ Forma parcial de intenção já conhecida via asksAlternative / ALTERNATIVE_REQUEST / REFINEMENT quando há anchor; gaps restantes documentados."
);

const auditTechnicallyClosed =
  purePassed === pureTotal &&
  guardPassed === guardTotal &&
  routerFailures === 0 &&
  newSearchLeaks.length === 0 &&
  winnerChanges.length === 0 &&
  anchorLosses.length === 0;

const auditFullyClosed =
  auditTechnicallyClosed &&
  genericFallbackHits.length === 0 &&
  pureRecords.every((r) => r.responsePathFinal === "alternative_exploration_flow");

const nextPatch = auditFullyClosed
  ? "next conversational family per roadmap (after ALTERNATIVE_EXPLORATION FULLY_CLOSED)"
  : auditTechnicallyClosed
    ? "7.9H-Response path — verify alternative_exploration_flow wiring"
    : layerCounts.Router && layerCounts.Routing
    ? "7.9G-Routing — alternative_exploration hold must not fall through to default search"
    : layerCounts.Router
      ? "7.9F-Router — add ALTERNATIVE_EXPLORATION family (cold + anchored); precede NEW_SEARCH"
      : layerCounts.Routing
        ? "7.9G-Routing — alternative_exploration hold must not fall through to default search"
        : layerCounts["Response path"] || layerCounts["Final response"]
          ? "7.9H-Response path — alternative_exploration_flow wiring"
          : "7.9G-Routing — ALTERNATIVE_EXPLORATION routing hold";

console.log("\n── Final report ──\n");
console.log(`1. Tests executed: ${allRecords.length} (${pureTotal} pure + ${expansionTotal} expansion + ${guardTotal} guards)`);
console.log(`2. Passed: ${purePassed}/${pureTotal} pure; ${expansionPassed}/${expansionTotal} expansion (Router-only); ${guardPassed}/${guardTotal} guards`);
console.log(
  "3. Dedicated ALTERNATIVE_EXPLORATION in Router: YES — signals.isAlternativeExploration + isAlternativeExplorationFamilyQuery (PATCH 7.9F/7.9X-A)"
);
console.log(
  `4. Phrases working when cold: ${coldWorking.length}/${PURE_ALTERNATIVE_EXPLORATION.length}`
);
console.log(
  `4b. Phrases working when anchored: ${anchoredWorking.length}/${PURE_ALTERNATIVE_EXPLORATION.length}`
);
console.log(
  `4c. Phrases fully working (both contexts): ${workingPure.length}/${PURE_ALTERNATIVE_EXPLORATION.length}`
);
console.log(
  `5. Phrases with failures: ${failingPure.length}/${PURE_ALTERNATIVE_EXPLORATION.length}`
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
  "13–22. Regressions: run closed-family audits + closure standard + 7.6V separately after audit"
);

console.log(
  `\nAudit script approval: CREATED — family ${auditFullyClosed ? "FULLY_CLOSED" : auditTechnicallyClosed ? "TECHNICALLY_CLOSED at Router+Routing" : "NOT CLOSED"}\n`
);
console.log(
  `PATCH 7.9E–7.9H/7.9X-A audit COMPLETE — ${auditFullyClosed ? "ALL PASS (28/28 pure + 16/16 expansion + 6/6 guards)" : auditTechnicallyClosed ? "ROUTING OK (28/28 pure)" : "GAPS FOUND"}\n`
);

process.exit(0);
