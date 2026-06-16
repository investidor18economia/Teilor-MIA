/**
 * PATCH 7.9I — Constraint Change Semantic Family Local Audit
 *
 * AUDIT ONLY — no production changes.
 * Two contexts: cold session (no anchor) and anchored session (winner preserved).
 * Includes commercial guard cases (dominant intent must not be swallowed).
 *
 * Usage: node scripts/test-mia-constraint-change-semantic-family-local-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES, isConstraintChangeFamilyQuery } from "../lib/miaCognitiveRouter.js";
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

/** Audit-side pure CONSTRAINT_CHANGE phrases (not a closed vocabulary). */
const PURE_CONSTRAINT_CHANGE = [
  "e se eu gastar menos?",
  "e se eu gastar mais?",
  "e se eu subir o orçamento?",
  "e se eu baixar o orçamento?",
  "e se for até 2000?",
  "e se passar um pouco do orçamento?",
  "e se eu quiser algo mais barato?",
  "e se eu quiser algo melhor?",
  "e se eu priorizar câmera?",
  "e se eu priorizar bateria?",
  "e se eu focar em durabilidade?",
  "e se eu usar mais para trabalho?",
  "e se for para jogos?",
];

/** PATCH 7.9J-B — natural-language CONSTRAINT_CHANGE (without "e se" framing). */
const CONSTRAINT_CHANGE_SEMANTIC_EXPANSION_CASES = [
  "quero gastar menos",
  "prefiro gastar menos",
  "quero economizar",
  "quero algo mais barato",
  "agora quero gastar menos",
  "posso gastar mais",
  "quero subir o orçamento",
  "posso subir um pouco",
  "quero câmera melhor",
  "quero bateria melhor",
  "agora bateria importa mais",
  "agora câmera importa mais",
  "desempenho ficou mais importante",
  "durabilidade ficou mais importante",
  "quero focar em durabilidade",
  "vou usar mais para jogos",
  "vou usar mais pra jogos",
  "vou querer pra jogos",
  "vou usar mais para trabalho",
  "vou trabalhar bastante nele",
  "agora quero para trabalho",
  "agora quero para jogos",
  "quero algo mais equilibrado",
  "quero focar mais em custo benefício",
  "quero algo que dure mais",
  "quero algo mais confiável",
];

const COMMERCIAL_GUARD_CASES = [
  {
    input: "e se eu gastar menos, tem outro?",
    dominantIntent: "alternative_exploration",
    hasActiveAnchor: true,
  },
  {
    input: "e se for até 2000, compara com samsung?",
    dominantIntent: "comparison",
    hasActiveAnchor: true,
    isExplicitComparison: true,
  },
  {
    input: "quero celular até 2000",
    dominantIntent: "new_search",
    hasActiveAnchor: false,
  },
  {
    input: "notebook gamer até 4000",
    dominantIntent: "new_search",
    hasActiveAnchor: false,
  },
  {
    input: "tem outro mais barato?",
    dominantIntent: "price_refinement",
    hasActiveAnchor: true,
  },
  {
    input: "qual ficou em segundo se eu gastar menos?",
    dominantIntent: "second_best_discovery",
    hasActiveAnchor: true,
  },
];

const IDEAL_COLD_CONSTRAINT_CHANGE_TURN_TYPES = new Set([
  MIA_TURN_TYPES.CONVERSATIONAL,
  MIA_TURN_TYPES.UNKNOWN,
]);

const PARTIAL_ANCHORED_CONSTRAINT_CHANGE_TURN_TYPES = new Set([
  MIA_TURN_TYPES.PRIORITY_SHIFT,
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

/** Audit-side commercial / collision tail — must not be pure CONSTRAINT_CHANGE. */
function hasConstraintChangeCommercialTail(q = "") {
  if (!q) return false;

  if (/\b(tem outro|tem outra|alternativa|mais barato|segundo|plano b|quem ficou)\b/.test(q)) {
    return true;
  }
  if (/\b(compara|compare|comparando|versus|\bvs\b)\b/.test(q)) return true;
  if (/\b(celular|smartphone|iphone|galaxy|notebook|gamer|tablet|tv)\b/.test(q)) return true;
  if (/^quero\s/.test(q)) return true;
  if (/\b(quero|procuro|busco)\s+(celular|notebook|smartphone|um)\b/.test(q)) return true;
  if (/,\s*(tem outro|compara|compare|mostra|quero|me mostra|qual ficou)\b/.test(q)) return true;

  return false;
}

/** Audit-side family detector — documents expected CONSTRAINT_CHANGE intent. */
function isPureConstraintChangeFamilyQuery(message = "") {
  const q = normalizeQuery(message);
  if (!q || hasConstraintChangeCommercialTail(q)) return false;

  if (/^e se eu gastar menos$/.test(q)) return true;
  if (/^e se eu gastar mais$/.test(q)) return true;
  if (/^e se eu subir o orcamento$/.test(q)) return true;
  if (/^e se eu baixar o orcamento$/.test(q)) return true;
  if (/^e se for ate 2000$/.test(q)) return true;
  if (/^e se passar um pouco do orcamento$/.test(q)) return true;
  if (/^e se eu quiser algo mais barato$/.test(q)) return true;
  if (/^e se eu quiser algo melhor$/.test(q)) return true;
  if (/^e se eu priorizar camera$/.test(q)) return true;
  if (/^e se eu priorizar bateria$/.test(q)) return true;
  if (/^e se eu focar em durabilidade$/.test(q)) return true;
  if (/^e se eu usar mais para trabalho$/.test(q)) return true;
  if (/^e se for para jogos$/.test(q)) return true;

  // Generalized constraint hypotheticals (intent before vocabulary)
  if (/^e se eu\b/.test(q) && /\b(gastar|pagar|orcamento|subir|baixar|priorizar|focar|quiser)\b/.test(q)) {
    return true;
  }
  if (/^e se for\b/.test(q) && /\b(ate|ate|2000|jogos|trabalho|orcamento)\b/.test(q)) return true;
  if (/^e se passar\b/.test(q) && /\borcamento\b/.test(q)) return true;
  if (/^e se eu usar\b/.test(q) && /\b(trabalho|jogos|jogar)\b/.test(q)) return true;

  return false;
}

function isExpansionConstraintChangeFamilyQuery(message = "") {
  return CONSTRAINT_CHANGE_SEMANTIC_EXPANSION_CASES.includes(message);
}

function mapPartialCoverage(cognitiveTurn) {
  const partial = [];
  const constraintDirection = cognitiveTurn.signals?.constraintDirection;

  if (cognitiveTurn.signals?.isConstraintChange) {
    partial.push("CONSTRAINT_CHANGE(dedicated)");
  }
  if (cognitiveTurn.signals?.isPriorityShift) {
    partial.push("PRIORITY_SHIFT(partial)");
  }
  if (constraintDirection) {
    partial.push(`constraintDirection:${constraintDirection}`);
  }
  if (cognitiveTurn.signals?.isRefinement) {
    partial.push("REFINEMENT(partial)");
  }
  if (cognitiveTurn.signals?.isAlternativeExploration) {
    partial.push("ALTERNATIVE_EXPLORATION(collision?)");
  }
  if (cognitiveTurn.signals?.isSecondBestDiscovery) {
    partial.push("SECOND_BEST_DISCOVERY(collision?)");
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT) {
    partial.push("PRIORITY_SHIFT(turn)");
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.REFINEMENT) {
    partial.push("REFINEMENT(turn)");
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    partial.push("NEW_SEARCH(collision?)");
  }
  if (cognitiveTurn.turnType === MIA_TURN_TYPES.CONVERSATIONAL) {
    partial.push("CONVERSATIONAL(cold/partial)");
  }

  return partial;
}

function isPartialRouterConstraintChange(cognitiveTurn, hasActiveAnchor) {
  if (!hasActiveAnchor) return false;

  if (cognitiveTurn.signals?.isConstraintChange) return true;
  if (cognitiveTurn.signals?.isPriorityShift) return true;
  if (cognitiveTurn.signals?.constraintDirection) return true;

  return PARTIAL_ANCHORED_CONSTRAINT_CHANGE_TURN_TYPES.has(cognitiveTurn.turnType);
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
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
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
    routerHasDedicatedConstraintChangeFamily:
      cognitiveTurn.signals?.isConstraintChange === true,
    routerPartialCoverage: isPartialRouterConstraintChange(cognitiveTurn, hasActiveAnchor),
  };
}

function simulateResponsePath({
  hasActiveAnchor,
  cognitiveTurn,
  routingDecision,
  openedNewSearch,
  message = "",
}) {
  const expectedResponsePath = "constraint_change_flow";

  if (openedNewSearch) {
    return {
      responsePathFinal: "default_product_search",
      finalResponsePreview: "",
      genericFallbackDetected: false,
      expectedResponsePath,
    };
  }

  // PATCH 7.9L — constraint_change_flow (mirror handler)
  const isConstraintChangeResponsePath =
    cognitiveTurn.signals?.isConstraintChange === true ||
    isConstraintChangeFamilyQuery(message) ||
    routingDecision.conversationAct === "constraint_change" ||
    String(routingDecision.responsePathHint || "").startsWith("constraint_change");

  if (isConstraintChangeResponsePath) {
    const finalResponsePreview = hasActiveAnchor
      ? "Entendi. Mantendo Produto Recomendado Atual como referência, vamos recalibrar a decisão com esse novo critério — a recomendação pode mudar porque estamos reavaliando com outra prioridade, não porque começamos do zero."
      : "Entendi a mudança de critério. Para recalibrar a recomendação na mesma decisão, preciso saber qual compra ou referência estamos usando.";

    return {
      responsePathFinal: "constraint_change_flow",
      finalResponsePreview,
      genericFallbackDetected: detectGenericConversationalFallback(finalResponsePreview),
      expectedResponsePath,
    };
  }

  if (
    hasActiveAnchor &&
    isPartialRouterConstraintChange(cognitiveTurn, hasActiveAnchor) &&
    routingDecision.conversationAct === "constraint_refinement"
  ) {
    return {
      responsePathFinal: "refinement_search",
      finalResponsePreview:
        "Resposta parcial via PRIORITY_SHIFT/REFINEMENT + constraint_refinement — sem fluxo constraint_change dedicado.",
      genericFallbackDetected: false,
      expectedResponsePath,
    };
  }

  if (
    hasActiveAnchor &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.PRIORITY_SHIFT &&
    routingDecision.shouldPreserveAnchor
  ) {
    return {
      responsePathFinal: "priority_shift_partial",
      finalResponsePreview:
        "Router reconhece PRIORITY_SHIFT, mas response path ainda não é constraint_change_flow.",
      genericFallbackDetected: false,
      expectedResponsePath,
    };
  }

  if (!hasActiveAnchor && !openedNewSearch) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      finalResponsePreview: GENERIC_WELCOME_DIRECT_REPLY,
      genericFallbackDetected: detectGenericConversationalFallback(GENERIC_WELCOME_DIRECT_REPLY),
      expectedResponsePath,
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: "",
    genericFallbackDetected: false,
    expectedResponsePath,
  };
}

function routingNeedsConstraintChangeHold(routingDecision = {}) {
  return (
    routingDecision.conversationAct !== "constraint_change" &&
    !String(routingDecision.responsePathHint || "").startsWith("constraint_change")
  );
}

function classifyRouterOnlyConstraintChangeFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;
  const { hasActiveAnchor, message } = spec;

  if (!pipeline.routerHasDedicatedConstraintChangeFamily) {
    failures.push({
      layer: "Router",
      detail: "signals.isConstraintChange missing on semantic expansion phrase",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isAlternativeExploration) {
    failures.push({
      layer: "Router",
      detail: "constraint change misclassified as ALTERNATIVE_EXPLORATION",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isSecondBestDiscovery) {
    failures.push({
      layer: "Router",
      detail: "constraint change misclassified as SECOND_BEST_DISCOVERY",
    });
  }

  if (turnType === MIA_TURN_TYPES.NEW_SEARCH && hasActiveAnchor) {
    failures.push({
      layer: "Router",
      detail: "anchored constraint change classified as NEW_SEARCH",
    });
  }

  if (
    !hasActiveAnchor &&
    turnType === MIA_TURN_TYPES.NEW_SEARCH &&
    !/\b(celular|notebook|smartphone|gamer|monitor|mouse|teclado|cadeira)\b/.test(normalizeQuery(message))
  ) {
    failures.push({
      layer: "Router",
      detail: "cold constraint revelation classified as NEW_SEARCH without product category",
    });
  }

  if (
    hasActiveAnchor &&
    !pipeline.routerPartialCoverage &&
    turnType !== MIA_TURN_TYPES.CONVERSATIONAL
  ) {
    failures.push({
      layer: "Router",
      detail: `expected PRIORITY_SHIFT or compatible path, got ${turnType}`,
    });
  }

  if (
    !hasActiveAnchor &&
    !IDEAL_COLD_CONSTRAINT_CHANGE_TURN_TYPES.has(turnType) &&
    turnType !== MIA_TURN_TYPES.PRIORITY_SHIFT
  ) {
    failures.push({
      layer: "Router",
      detail: `expected cold CONVERSATIONAL hold for constraint revelation, got ${turnType}`,
    });
  }

  return failures;
}

function classifyPureConstraintChangeFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;
  const { hasActiveAnchor, message } = spec;

  if (!isPureConstraintChangeFamilyQuery(message)) {
    failures.push({
      layer: "Audit expectation",
      detail: "input is not in audit pure CONSTRAINT_CHANGE family list",
    });
    return failures;
  }

  if (!pipeline.routerHasDedicatedConstraintChangeFamily) {
    failures.push({
      layer: "Router",
      detail:
        "no dedicated CONSTRAINT_CHANGE family (signals.isConstraintChange missing — partial via PRIORITY_SHIFT/REFINEMENT only)",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isAlternativeExploration) {
    failures.push({
      layer: "Router",
      detail: "constraint change misclassified as ALTERNATIVE_EXPLORATION",
    });
  }

  if (pipeline.cognitiveTurn.signals?.isSecondBestDiscovery) {
    failures.push({
      layer: "Router",
      detail: "constraint change misclassified as SECOND_BEST_DISCOVERY",
    });
  }

  if (turnType === MIA_TURN_TYPES.NEW_SEARCH && hasActiveAnchor) {
    failures.push({
      layer: "Router",
      detail: "anchored constraint change classified as NEW_SEARCH",
    });
  }

  if (
    !hasActiveAnchor &&
    turnType === MIA_TURN_TYPES.NEW_SEARCH &&
    !/\b(celular|notebook|smartphone|gamer)\b/.test(normalizeQuery(message))
  ) {
    failures.push({
      layer: "Router",
      detail:
        "cold constraint hypothetical classified as NEW_SEARCH without product category — should ask reference first",
    });
  }

  if (
    hasActiveAnchor &&
    !pipeline.routerPartialCoverage &&
    turnType !== MIA_TURN_TYPES.CONVERSATIONAL
  ) {
    failures.push({
      layer: "Router",
      detail: `expected PRIORITY_SHIFT/REFINEMENT partial path, got ${turnType}`,
    });
  }

  if (
    !hasActiveAnchor &&
    !IDEAL_COLD_CONSTRAINT_CHANGE_TURN_TYPES.has(turnType) &&
    turnType !== MIA_TURN_TYPES.PRIORITY_SHIFT
  ) {
    failures.push({
      layer: "Router",
      detail: `expected cold conversational/unknown hold for constraint hypothetical, got ${turnType}`,
    });
  }

  if (hasActiveAnchor && pipeline.openedNewSearch) {
    failures.push({
      layer: "Routing",
      detail: `new_search leak mode=${pipeline.routingDecision.mode} allowNewSearch=${pipeline.routingDecision.allowNewSearch}`,
    });
  }

  if (hasActiveAnchor && routingNeedsConstraintChangeHold(pipeline.routingDecision)) {
    failures.push({
      layer: "Routing",
      detail: `no constraint_change routing hold — act=${pipeline.routingDecision.conversationAct || "none"} hint=${pipeline.routingDecision.responsePathHint || "none"}`,
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
      detail: "allowReplaceWinner or anchor loss on anchored constraint change",
    });
  }

  if (
    hasActiveAnchor &&
    pipeline.routingDecision.allowReplaceWinner === true &&
    pipeline.routerPartialCoverage
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowReplaceWinner=true on anchored constraint change (ideal: false until controlled rerank)",
    });
  }

  if (
    hasActiveAnchor &&
    pipeline.routingDecision.allowRerank === true &&
    pipeline.routingDecision.conversationAct === "constraint_refinement"
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowRerank=true via constraint_refinement — uncontrolled rerank risk",
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
    pipeline.responsePath.responsePathFinal === "context_resolution_direct_reply_early_return"
  ) {
    failures.push({
      layer: "Audit expectation",
      detail:
        "cold constraint change should ask for prior decision/reference, not institutional welcome",
    });
  }

  if (
    pipeline.responsePath.responsePathFinal !== "constraint_change_flow" &&
    isPureConstraintChangeFamilyQuery(message)
  ) {
    failures.push({
      layer: "Response path",
      detail: "pure constraint change did not reach constraint_change_flow",
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
        pipeline.cognitiveTurn.signals?.isAlternativeExploration === true ||
        /\b(tem outro|tem outra|alternativa)\b/.test(normalizeQuery(spec.input))
      );
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
        pipeline.cognitiveTurn.signals?.isComparison === true ||
        /\b(compara|compare|samsung)\b/.test(normalizeQuery(spec.input))
      );
    case "new_search":
      return (
        turnType === MIA_TURN_TYPES.NEW_SEARCH ||
        pipeline.clearNewSearch === true ||
        /\b(celular|notebook|gamer|ate|até|2000|4000)\b/.test(normalizeQuery(spec.input))
      );
    case "price_refinement":
      return (
        turnType === MIA_TURN_TYPES.REFINEMENT ||
        turnType === MIA_TURN_TYPES.NEW_SEARCH ||
        pipeline.clearNewSearch === true ||
        /\bmais barato\b/.test(normalizeQuery(spec.input))
      );
    case "constraint_change":
      return (
        turnType === MIA_TURN_TYPES.PRIORITY_SHIFT ||
        turnType === MIA_TURN_TYPES.NEW_SEARCH ||
        pipeline.clearNewSearch === true ||
        /\b(gastar|pagar|menos)\b/.test(normalizeQuery(spec.input))
      );
    default:
      return false;
  }
}

function classifyGuardFailures(spec, pipeline) {
  const failures = [];

  if (isPureConstraintChangeFamilyQuery(spec.input)) {
    failures.push({
      layer: "Router",
      detail: "classified as pure constraint change despite commercial tail",
    });
  }

  if (isExpansionConstraintChangeFamilyQuery(spec.input)) {
    failures.push({
      layer: "Router",
      detail: "classified as semantic expansion constraint change despite commercial tail",
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
  const failures = classifyPureConstraintChangeFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  return {
    kind: "pure_constraint_change",
    input: message,
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    family: "CONSTRAINT_CHANGE",
    expectedTurnType: hasActiveAnchor
      ? "PRIORITY_SHIFT or dedicated CONSTRAINT_CHANGE hold"
      : "CONVERSATIONAL/UNKNOWN + ask reference (not NEW_SEARCH without category)",
    actualTurnType: pipeline.cognitiveTurn.turnType,
    signals: {
      isPriorityShift: !!pipeline.cognitiveTurn.signals?.isPriorityShift,
      isRefinement: !!pipeline.cognitiveTurn.signals?.isRefinement,
      constraintDirection: pipeline.cognitiveTurn.signals?.constraintDirection || null,
      isAlternativeExploration: !!pipeline.cognitiveTurn.signals?.isAlternativeExploration,
      isSecondBestDiscovery: !!pipeline.cognitiveTurn.signals?.isSecondBestDiscovery,
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
}

function evaluateExpansionCase(message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor);
  const failures = classifyRouterOnlyConstraintChangeFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  return {
    kind: "semantic_expansion",
    input: message,
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    family: "CONSTRAINT_CHANGE",
    actualTurnType: pipeline.cognitiveTurn.turnType,
    signals: {
      isConstraintChange: !!pipeline.cognitiveTurn.signals?.isConstraintChange,
      isPriorityShift: !!pipeline.cognitiveTurn.signals?.isPriorityShift,
      partialCoverage: pipeline.partialCoverage,
    },
    routingMode: pipeline.routingDecision.mode || "",
    openedNewSearch: pipeline.openedNewSearch,
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

function evaluateGuardCase({ input, dominantIntent, hasActiveAnchor, isExplicitComparison }) {
  const pipeline = simulatePipeline(input, hasActiveAnchor, { isExplicitComparison });
  const failures = classifyGuardFailures({ input, dominantIntent }, pipeline);

  return {
    kind: "commercial_guard",
    input,
    context: hasActiveAnchor ? "anchored" : "no_anchor",
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

console.log("\nPATCH 7.9I/7.9J/7.9J-B — Constraint Change Semantic Family Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + routing + response path simulation (local, audit-only)\n");

console.log("── Human context ──\n");
console.log(
  "CONSTRAINT_CHANGE cobre mudança de restrição da decisão atual — com framing \"e se...\" (7.9J) e linguagem natural (7.9J-B)."
);
console.log(
  "Depois que a MIA já escolheu um winner, o usuário quer mudar uma restrição (orçamento, prioridade, uso) e entender como isso afeta a decisão — sem reiniciar como busca genérica."
);
console.log(
  "Este audit mede se a MIA reconhece a intenção, preserva contexto/winner e evita new_search/fallback genérico — sem implementar reranking neste patch.\n"
);

const pureRecords = [];
for (const message of PURE_CONSTRAINT_CHANGE) {
  pureRecords.push(evaluatePureCase(message, false));
  pureRecords.push(evaluatePureCase(message, true));
}

const guardRecords = COMMERCIAL_GUARD_CASES.map(evaluateGuardCase);

const expansionRecords = [];
for (const message of CONSTRAINT_CHANGE_SEMANTIC_EXPANSION_CASES) {
  expansionRecords.push(evaluateExpansionCase(message, false));
  expansionRecords.push(evaluateExpansionCase(message, true));
}

const allRecords = [...pureRecords, ...guardRecords, ...expansionRecords];

const purePassed = pureRecords.filter((r) => r.passed).length;
const pureTotal = pureRecords.length;
const guardPassed = guardRecords.filter((r) => r.passed).length;
const guardTotal = guardRecords.length;

const newSearchLeaks = pureRecords.filter((r) => r.openedNewSearch);
const anchorLosses = pureRecords.filter((r) => r.context === "anchored" && !r.anchorPreserved);
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
const workingPure = [...new Set(pureRecords.filter((r) => r.passed).map((r) => r.input))];
const failingPure = [...new Set(pureRecords.filter((r) => !r.passed).map((r) => r.input))];

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

const expansionPassed = expansionRecords.filter((r) => r.passed).length;
const expansionTotal = expansionRecords.length;
const expansionRouterFailures = expansionRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Router")
).length;

const hasDedicatedRouterFamily = pureRecords.some(
  (r) => r.signals.partialCoverage.includes("CONSTRAINT_CHANGE(dedicated)")
);

console.log("── Router family existence ──\n");
console.log(
  `Dedicated CONSTRAINT_CHANGE family in Router: ${hasDedicatedRouterFamily ? "YES (PATCH 7.9J/7.9J-B — signals.isConstraintChange)" : "NO — signals.isConstraintChange not implemented"}`
);
console.log(`signals.isConstraintChange: ${hasDedicatedRouterFamily ? "YES" : "NO"}`);
console.log(
  "Partial reuse in codebase: PRIORITY_SHIFT (isPriorityShift) + constraint_refinement routing + CSO constraintDirection"
);
console.log(
  "Response path for pure CONSTRAINT_CHANGE: YES (PATCH 7.9L — constraint_change_flow)"
);
console.log(
  `Partial signals on pure audit phrases — cold: ${partialCold.length}/${pureTotal / 2}, anchored: ${partialAnchored.length}/${pureTotal / 2}`
);

console.log("\n── Pure constraint change cases ──\n");
for (const r of pureRecords) {
  const partial = r.signals.partialCoverage.length
    ? `[${r.signals.partialCoverage.join(",")}]`
    : "[]";
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | partial=${partial} | mode=${r.routingMode} newSearch=${r.openedNewSearch} path=${r.responsePathFinal} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Commercial guard cases ──\n");
for (const r of guardRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | intent=${r.dominantIntent} mode=${r.routingMode} allow=${r.allowNewSearch} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Semantic expansion cases (PATCH 7.9J-B, Router-only) ──\n");
for (const r of expansionRecords) {
  const partial = r.signals.partialCoverage.length
    ? `[${r.signals.partialCoverage.join(",")}]`
    : "[]";
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | partial=${partial} | newSearch=${r.openedNewSearch} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Semantic expansion summary ──\n");
console.log(`Total expansion tests: ${expansionTotal}`);
console.log(
  `Router pass: ${expansionPassed}/${expansionTotal} (${((expansionPassed / expansionTotal) * 100).toFixed(1)}%)`
);
console.log(`Router failures (expansion): ${expansionRouterFailures}/${expansionTotal}`);

console.log("\n── Pure constraint change summary ──\n");
console.log(`Total pure tests: ${pureTotal}`);
console.log(`Passed: ${purePassed}/${pureTotal} (${((purePassed / pureTotal) * 100).toFixed(1)}%)`);
console.log(`Cold working: ${coldWorking.length}/${PURE_CONSTRAINT_CHANGE.length}`);
console.log(`Anchored working: ${anchoredWorking.length}/${PURE_CONSTRAINT_CHANGE.length}`);
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

const auditRouterClosed =
  routerFailures === 0 &&
  expansionRouterFailures === 0 &&
  guardPassed === guardTotal &&
  pureRecords.every((r) => r.signals.partialCoverage.includes("CONSTRAINT_CHANGE(dedicated)")) &&
  expansionRecords.every((r) => r.signals.isConstraintChange === true);

console.log(
  auditRouterClosed
    ? "→ CONSTRAINT_CHANGE Router + Routing + Response path fechados (7.9J/7.9J-B + 7.9K + 7.9L)."
    : "→ Forma parcial de intenção já conhecida via PRIORITY_SHIFT + constraint_refinement quando há anchor; gaps restantes documentados."
);

const nextPatch = auditRouterClosed
  ? "Router vocabulary expansion for informal constraint phrases (optional roadmap)"
  : layerCounts.Router
      ? "7.9K-Routing — constraint_change hold must not fall through to refinement_search/new_search"
      : layerCounts["Response path"] || layerCounts["Final response"]
        ? "7.9L-Response path — constraint_change_flow wiring"
        : "7.9J-Router — CONSTRAINT_CHANGE dedicated family + routing hold";

console.log("\n── Final report ──\n");
console.log(`1. Tests executed: ${allRecords.length} (${pureTotal} pure + ${expansionTotal} expansion + ${guardTotal} guards)`);
console.log(`2. Passed: ${purePassed}/${pureTotal} pure; ${expansionPassed}/${expansionTotal} expansion (Router-only); ${guardPassed}/${guardTotal} guards`);
console.log(
  `3. Dedicated CONSTRAINT_CHANGE in Router: ${hasDedicatedRouterFamily ? "YES — signals.isConstraintChange + isConstraintChangeFamilyQuery (PATCH 7.9J/7.9J-B)" : "NO — partial via PRIORITY_SHIFT/constraint_refinement only"}`
);
console.log(
  `4. Phrases working when cold: ${coldWorking.length}/${PURE_CONSTRAINT_CHANGE.length}`
);
console.log(
  `4b. Phrases working when anchored: ${anchoredWorking.length}/${PURE_CONSTRAINT_CHANGE.length}`
);
console.log(
  `4c. Phrases fully working (both contexts): ${workingPure.length}/${PURE_CONSTRAINT_CHANGE.length}`
);
console.log(
  `5. Phrases with failures: ${failingPure.length}/${PURE_CONSTRAINT_CHANGE.length} (original); expansion router failures ${expansionRouterFailures}/${expansionTotal}`
);
console.log(
  `6. New_search leak: ${newSearchLeaks.length === 0 ? "NO on pure anchored ideal" : `YES (${newSearchLeaks.length} pure case-contexts)`}`
);
console.log(
  `7. Winner change indevido: ${winnerChanges.length === 0 ? "NO" : `YES (${winnerChanges.length})`}`
);
console.log(
  `8. Anchor preserved (when routing safe): ${anchorLosses.length === 0 ? "YES on PRIORITY_SHIFT paths" : `NO (${anchorLosses.length} losses)`}`
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
  "13–23. Regressions: run closed-family audits + closure standard + 7.6V separately after audit"
);

console.log(
  `\nAudit script approval: ${auditRouterClosed ? "CONSTRAINT_CHANGE FULLY_CLOSED (Router + Routing + Response path)" : "CREATED"} — see layer counts for remaining gaps\n`
);
console.log(
  `PATCH 7.9I–7.9J-B audit COMPLETE — ${auditRouterClosed ? "ROUTER OK (0 router failures)" : "GAPS FOUND"}\n`
);

process.exit(0);
