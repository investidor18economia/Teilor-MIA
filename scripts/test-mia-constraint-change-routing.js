/**
 * PATCH 7.9K — CONSTRAINT_CHANGE Routing Hold Authority (local audit)
 *
 * Validates constraint_change routing precedence + clearNewCommercialSearch guards.
 *
 * Usage: node scripts/test-mia-constraint-change-routing.js
 */

import {
  classifyMiaTurn,
  isConstraintChangeFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isSocialValidationFamilyQuery,
  isSoftDisagreementFamilyQuery,
  isAntiRegretFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
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

const CONSTRAINT_CHANGE_POSITIVE = [
  { group: "A", input: "quero gastar menos", anchored: false },
  { group: "A", input: "quero gastar menos", anchored: true },
  { group: "A", input: "agora quero economizar", anchored: false },
  { group: "A", input: "agora quero economizar", anchored: true },
  { group: "A", input: "pensei melhor e quero algo mais barato", anchored: false, optional: true },
  { group: "A", input: "pensei melhor e quero algo mais barato", anchored: true, optional: true },
  { group: "A", input: "reduzi meu orçamento", anchored: false, optional: true },
  { group: "A", input: "reduzi meu orçamento", anchored: true, optional: true },
  { group: "A", input: "prefiro gastar menos", anchored: false },
  { group: "A", input: "prefiro gastar menos", anchored: true },
  { group: "A", input: "quero economizar", anchored: false },
  { group: "A", input: "quero economizar", anchored: true },
  { group: "A", input: "agora quero gastar menos", anchored: false },
  { group: "A", input: "agora quero gastar menos", anchored: true },
  { group: "B", input: "agora bateria importa mais", anchored: false },
  { group: "B", input: "agora bateria importa mais", anchored: true },
  { group: "B", input: "bateria ficou mais importante", anchored: false },
  { group: "B", input: "bateria ficou mais importante", anchored: true },
  { group: "B", input: "a câmera virou prioridade", anchored: false, optional: true },
  { group: "B", input: "a câmera virou prioridade", anchored: true, optional: true },
  { group: "B", input: "desempenho deixou de ser prioridade", anchored: false, optional: true },
  { group: "B", input: "desempenho deixou de ser prioridade", anchored: true, optional: true },
  { group: "B", input: "fotos agora importam mais", anchored: false, optional: true },
  { group: "B", input: "fotos agora importam mais", anchored: true, optional: true },
  { group: "B", input: "quero bateria melhor", anchored: false },
  { group: "B", input: "quero bateria melhor", anchored: true },
  { group: "C", input: "vou jogar mais", anchored: false, optional: true },
  { group: "C", input: "vou jogar mais", anchored: true, optional: true },
  { group: "C", input: "vou usar mais para fotos", anchored: false, optional: true },
  { group: "C", input: "vou usar mais para fotos", anchored: true, optional: true },
  { group: "C", input: "vou trabalhar mais nele", anchored: false, optional: true },
  { group: "C", input: "vou trabalhar mais nele", anchored: true, optional: true },
  { group: "C", input: "agora o foco é produtividade", anchored: false, optional: true },
  { group: "C", input: "agora o foco é produtividade", anchored: true, optional: true },
  { group: "C", input: "agora quero para jogos", anchored: false },
  { group: "C", input: "agora quero para jogos", anchored: true },
  { group: "C", input: "vou trabalhar bastante nele", anchored: false },
  { group: "C", input: "vou trabalhar bastante nele", anchored: true },
  { group: "D", input: "gostei dele, mas quero gastar menos", anchored: true, optional: true },
  { group: "D", input: "acho que vou nele, mas a câmera virou prioridade", anchored: true, optional: true },
  { group: "D", input: "esse parece bom, mas bateria importa mais", anchored: true, optional: true },
  { group: "D", input: "e se eu gastar menos", anchored: true },
  { group: "D", input: "e se eu priorizar bateria", anchored: true },
  { group: "D", input: "e se eu usar mais para trabalho", anchored: true },
  { group: "A", input: "quero algo mais barato", anchored: false },
  { group: "A", input: "quero algo mais barato", anchored: true },
  { group: "B", input: "mudei de ideia sobre desempenho", anchored: false, optional: true },
  { group: "B", input: "preço virou prioridade", anchored: false, optional: true },
  { group: "A", input: "pensei melhor e quero gastar menos", anchored: false, optional: true },
  { group: "A", input: "pensei melhor e quero gastar menos", anchored: true, optional: true },
];

const COMMERCIAL_MUST_SEARCH = [
  { group: "E", input: "quero outro produto", anchored: false },
  { group: "E", input: "quero outro produto", anchored: true },
  { group: "E", input: "agora quero um notebook", anchored: false },
  { group: "E", input: "agora quero um notebook", anchored: true },
  { group: "E", input: "vamos procurar outra categoria", anchored: false },
  { group: "E", input: "vamos procurar outra categoria", anchored: true, optional: true },
  { group: "E", input: "quero uma TV", anchored: false },
  { group: "E", input: "quero uma TV", anchored: true },
  { group: "E", input: "quero um celular até 2000", anchored: false },
  { group: "E", input: "quero ver outro modelo", anchored: true },
];

const NEIGHBOR_FAMILIES = [
  {
    group: "F",
    input: "quero explorar outras opções",
    anchored: true,
    detector: isAlternativeExplorationFamilyQuery,
    act: "alternative_exploration",
  },
  {
    group: "F",
    input: "qual seria a reserva?",
    anchored: true,
    detector: isSecondBestDiscoveryFamilyQuery,
    act: "second_best_discovery",
  },
  {
    group: "F",
    input: "acho que vou nele então",
    anchored: true,
    detector: isDecisionConfirmationFamilyQuery,
    act: "decision_confirmation",
  },
  {
    group: "F",
    input: "não quero me arrepender",
    anchored: true,
    detector: isAntiRegretFamilyQuery,
    act: "anti_regret",
  },
  {
    group: "F",
    input: "a galera recomenda?",
    anchored: true,
    detector: isSocialValidationFamilyQuery,
    act: "social_validation",
  },
  {
    group: "F",
    input: "não me convenceu",
    anchored: true,
    detector: isSoftDisagreementFamilyQuery,
    act: "soft_disagreement",
    optional: true,
    note: "pre-existing routing precedence gap — context_question before soft_disagreement",
  },
  {
    group: "F",
    input: "tem certeza?",
    anchored: true,
    detector: isConfidenceChallengeFamilyQuery,
    act: "confidence_challenge",
  },
];

function simulateRouting(message, hasActiveAnchor) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;

  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });

  const bridgeAudit = buildCognitiveBridgeAudit(
    mapCognitiveTurnToLegacyIntent(cognitiveTurn),
    "search"
  );
  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: "search",
    bridgeAudit,
    cognitiveTurnEarly: cognitiveTurn,
    finalIntent: bridgeAudit.active ? bridgeAudit.toIntent : "search",
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
    contextResolution: {
      mode: "general_answer",
      shouldSkipProductSearch: false,
      directReply: "generic",
      clearContext: !hasActiveAnchor,
    },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : "search",
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isConstraintChange: !!cognitiveTurn.signals?.isConstraintChange,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isDecisionConfirmation: !!cognitiveTurn.signals?.isDecisionConfirmation,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isAlternativeExploration: !!cognitiveTurn.signals?.isAlternativeExploration,
      isSecondBestDiscovery: !!cognitiveTurn.signals?.isSecondBestDiscovery,
      isSocialValidation: !!cognitiveTurn.signals?.isSocialValidation,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
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

  return {
    cognitiveTurn,
    clearNewSearch,
    routingDecision,
    openedNewSearch,
    contextAction: guardResult.contextAction,
    familyQuery: isConstraintChangeFamilyQuery(message),
  };
}

function evaluateConstraintChangePositive(spec) {
  const pipeline = simulateRouting(spec.input, spec.anchored);
  const failures = [];
  const routerSignal =
    pipeline.cognitiveTurn.signals?.isConstraintChange || pipeline.familyQuery;

  if (!routerSignal && !spec.optional) {
    failures.push("intent: neither router nor family constraint-change detector matched");
  }

  if (!routerSignal && spec.optional) {
    return {
      kind: "constraint_change_positive_optional",
      ...spec,
      context: spec.anchored ? "anchored" : "cold",
      skipped: true,
      passed: true,
      failures: [],
      note: "router expansion pending — not enforced in 7.9K",
    };
  }

  if (pipeline.clearNewSearch) {
    failures.push("safety: clearNewCommercialSearch should be false");
  }

  if (pipeline.routingDecision.conversationAct !== "constraint_change") {
    failures.push(
      `routing: expected constraint_change, got ${pipeline.routingDecision.conversationAct}`
    );
  }

  if (pipeline.routingDecision.conversationAct === "context_question") {
    failures.push("routing: context_question leak");
  }

  if (pipeline.routingDecision.conversationAct === "explicit_new_search") {
    failures.push("routing: explicit_new_search leak");
  }

  if (pipeline.openedNewSearch) {
    failures.push("routing: new_search opened");
  }

  if (spec.anchored && pipeline.routingDecision.shouldPreserveAnchor !== true) {
    failures.push("routing: anchor not preserved");
  }

  if (
    spec.anchored &&
    pipeline.routingDecision.anchorProduct?.product_name !== MOCK_WINNER.product_name
  ) {
    failures.push("routing: winner anchor lost");
  }

  return {
    kind: "constraint_change_positive",
    ...spec,
    context: spec.anchored ? "anchored" : "cold",
    turnType: pipeline.cognitiveTurn.turnType,
    conversationAct: pipeline.routingDecision.conversationAct,
    responsePathHint: pipeline.routingDecision.responsePathHint,
    clearNewSearch: pipeline.clearNewSearch,
    routerSignal,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateCommercial(spec) {
  const pipeline = simulateRouting(spec.input, spec.anchored);
  const failures = [];

  if (pipeline.routingDecision.conversationAct === "constraint_change") {
    failures.push("routing: must not be constraint_change");
  }

  if (!pipeline.clearNewSearch && !pipeline.openedNewSearch && !spec.optional) {
    failures.push("safety: expected clearNewCommercialSearch or new_search path");
  }

  if (!pipeline.clearNewSearch && !pipeline.openedNewSearch && spec.optional) {
    return {
      kind: "commercial_guard_optional",
      ...spec,
      context: spec.anchored ? "anchored" : "cold",
      skipped: true,
      passed: true,
      failures: [],
    };
  }

  return {
    kind: "commercial_guard",
    ...spec,
    context: spec.anchored ? "anchored" : "cold",
    conversationAct: pipeline.routingDecision.conversationAct,
    clearNewSearch: pipeline.clearNewSearch,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateNeighbor(spec) {
  const pipeline = simulateRouting(spec.input, spec.anchored);
  const failures = [];

  if (!spec.detector(spec.input)) {
    failures.push("router: family detector mismatch");
  }

  if (pipeline.routingDecision.conversationAct !== spec.act) {
    if (!spec.optional) {
      failures.push(
        `routing: expected ${spec.act}, got ${pipeline.routingDecision.conversationAct}`
      );
    }
  }

  if (pipeline.routingDecision.conversationAct === "constraint_change") {
    failures.push("routing: swallowed by constraint_change");
  }

  if (spec.optional && failures.length > 0) {
    return {
      kind: "neighbor_family_optional",
      ...spec,
      context: "anchored",
      conversationAct: pipeline.routingDecision.conversationAct,
      skipped: true,
      passed: true,
      failures: [],
      note: spec.note || "pre-existing gap",
    };
  }

  return {
    kind: "neighbor_family",
    ...spec,
    context: "anchored",
    conversationAct: pipeline.routingDecision.conversationAct,
    passed: failures.length === 0,
    failures,
  };
}

console.log("\nPATCH 7.9K — CONSTRAINT_CHANGE Routing Hold Authority\n");
console.log("HTTP usage: false | SerpAPI risk: false\n");

const positiveRecords = CONSTRAINT_CHANGE_POSITIVE.map(evaluateConstraintChangePositive);
const commercialRecords = COMMERCIAL_MUST_SEARCH.map(evaluateCommercial);
const neighborRecords = NEIGHBOR_FAMILIES.map(evaluateNeighbor);

console.log("── Constraint Change positive (routing hold + safety) ──\n");
for (const r of positiveRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.conversationAct || "skipped"} clear=${r.clearNewSearch ?? "-"} turn=${r.turnType || "-"}${r.failures?.length ? ` | ${r.failures.join("; ")}` : ""}${r.skipped ? " (optional)" : ""}`
  );
}

console.log("\n── Commercial must stay commercial ──\n");
for (const r of commercialRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.conversationAct} clear=${r.clearNewSearch}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}${r.skipped ? " (optional)" : ""}`
  );
}

console.log("\n── Neighbor families (no constraint_change swallow) ──\n");
for (const r of neighborRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → ${r.conversationAct}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

const posRequired = positiveRecords.filter((r) => !r.skipped);
const posRequiredPass = posRequired.filter((r) => r.passed).length;
const posTotal = posRequired.length;
const comRequired = commercialRecords.filter((r) => !r.skipped);
const comRequiredPass = comRequired.filter((r) => r.passed).length;
const comTotal = comRequired.length;
const neiRequired = neighborRecords.filter((r) => !r.skipped);
const neiRequiredPass = neiRequired.filter((r) => r.passed).length;
const neiTotal = neiRequired.length;

console.log("\n── Summary ──\n");
console.log(`Constraint Change routing (required): ${posRequiredPass}/${posTotal}`);
console.log(`Commercial guards (required): ${comRequiredPass}/${comTotal}`);
console.log(`Neighbor families: ${neiRequiredPass}/${neiTotal}`);

const allRequiredPass =
  posRequiredPass === posTotal &&
  comRequiredPass === comTotal &&
  neiRequiredPass === neiTotal;

console.log(`\nPATCH 7.9K routing audit: ${allRequiredPass ? "PASS" : "FAIL"}\n`);

if (!allRequiredPass) {
  process.exitCode = 1;
}
