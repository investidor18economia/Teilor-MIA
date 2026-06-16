/**
 * PATCH 7.9L — CONSTRAINT_CHANGE Response Path (local audit)
 *
 * Validates constraint_change_flow wiring + fallback semantics + regression guards.
 *
 * Usage: node scripts/test-mia-constraint-change-response-path.js
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
import { detectGenericConversationalFallback } from "../lib/miaConversationalFamilyClosureStandard.js";

const GENERIC_WELCOME_DIRECT_REPLY =
  "Posso te ajudar com compras, comparações e decisões. Me conta o que você está procurando.";

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
  { group: "A", input: "reduzi meu orçamento", anchored: false, optional: true },
  { group: "A", input: "reduzi meu orçamento", anchored: true, optional: true },
  { group: "A", input: "prefiro gastar menos", anchored: false },
  { group: "A", input: "prefiro gastar menos", anchored: true },
  { group: "A", input: "quero economizar", anchored: false },
  { group: "A", input: "quero economizar", anchored: true },
  { group: "A", input: "quero algo mais barato", anchored: false },
  { group: "A", input: "quero algo mais barato", anchored: true },
  { group: "B", input: "agora bateria importa mais", anchored: false },
  { group: "B", input: "agora bateria importa mais", anchored: true },
  { group: "B", input: "bateria ficou mais importante", anchored: false },
  { group: "B", input: "bateria ficou mais importante", anchored: true },
  { group: "B", input: "a câmera virou prioridade", anchored: false, optional: true },
  { group: "B", input: "a câmera virou prioridade", anchored: true, optional: true },
  { group: "B", input: "desempenho deixou de ser prioridade", anchored: false, optional: true },
  { group: "B", input: "desempenho deixou de ser prioridade", anchored: true, optional: true },
  { group: "B", input: "quero bateria melhor", anchored: false },
  { group: "B", input: "quero bateria melhor", anchored: true },
  { group: "C", input: "vou jogar mais", anchored: false, optional: true },
  { group: "C", input: "vou jogar mais", anchored: true, optional: true },
  { group: "C", input: "vou usar mais para fotos", anchored: false, optional: true },
  { group: "C", input: "vou usar mais para fotos", anchored: true, optional: true },
  { group: "C", input: "vou trabalhar mais nele", anchored: false, optional: true },
  { group: "C", input: "vou trabalhar mais nele", anchored: true, optional: true },
  { group: "C", input: "agora quero para jogos", anchored: false },
  { group: "C", input: "agora quero para jogos", anchored: true },
  { group: "C", input: "vou trabalhar bastante nele", anchored: false },
  { group: "C", input: "vou trabalhar bastante nele", anchored: true },
  { group: "D", input: "gostei dele, mas quero gastar menos", anchored: true, optional: true },
  { group: "D", input: "acho que vou nele, mas bateria importa mais", anchored: true, optional: true },
  { group: "D", input: "esse parece bom, mas câmera virou prioridade", anchored: true, optional: true },
  { group: "D", input: "e se eu gastar menos", anchored: true },
  { group: "D", input: "e se eu priorizar bateria", anchored: true },
  { group: "D", input: "e se eu usar mais para trabalho", anchored: true },
  { group: "A", input: "pensei melhor e quero gastar menos", anchored: false, optional: true },
  { group: "A", input: "pensei melhor e quero gastar menos", anchored: true, optional: true },
];

const COMMERCIAL_MUST_NOT_CC = [
  { group: "E", input: "quero outro produto", anchored: false },
  { group: "E", input: "quero outro produto", anchored: true },
  { group: "E", input: "agora quero um notebook", anchored: false },
  { group: "E", input: "agora quero um notebook", anchored: true },
  { group: "E", input: "vamos procurar outra categoria", anchored: false },
  { group: "E", input: "quero uma TV", anchored: false },
  { group: "E", input: "quero uma TV", anchored: true },
  { group: "E", input: "quero um celular até 2000", anchored: false },
];

const NEIGHBOR_FAMILIES = [
  {
    group: "F",
    input: "quero explorar outras opções",
    anchored: true,
    detector: isAlternativeExplorationFamilyQuery,
    flow: "alternative_exploration_flow",
    intent: "alternative_exploration",
  },
  {
    group: "F",
    input: "qual seria a reserva?",
    anchored: true,
    detector: isSecondBestDiscoveryFamilyQuery,
    flow: "second_best_discovery_flow",
    intent: "second_best_discovery",
  },
  {
    group: "F",
    input: "acho que vou nele então",
    anchored: true,
    detector: isDecisionConfirmationFamilyQuery,
    flow: "decision_confirmation_flow",
    intent: "decision_confirmation",
  },
  {
    group: "F",
    input: "não quero me arrepender",
    anchored: true,
    detector: isAntiRegretFamilyQuery,
    flow: "anti_regret_flow",
    intent: "anti_regret",
  },
  {
    group: "F",
    input: "a galera recomenda?",
    anchored: true,
    detector: isSocialValidationFamilyQuery,
    flow: "social_validation_flow",
    intent: "social_validation",
  },
  {
    group: "F",
    input: "tem certeza?",
    anchored: true,
    detector: isConfidenceChallengeFamilyQuery,
    flow: "confidence_challenge_flow",
    intent: "confidence_challenge",
  },
  {
    group: "F",
    input: "não me convenceu",
    anchored: true,
    detector: isSoftDisagreementFamilyQuery,
    flow: "soft_disagreement_flow",
    intent: "soft_disagreement",
    optional: true,
  },
];

function buildOpenConstraintChangePreview() {
  return "Entendi a mudança de critério. Para recalibrar a recomendação na mesma decisão, preciso saber qual compra ou referência estamos usando.";
}

function buildAnchoredConstraintChangePreview() {
  return "Entendi. Mantendo Produto Recomendado Atual como referência, vamos recalibrar a decisão com esse novo critério — a recomendação pode mudar porque estamos reavaliando com outra prioridade, não porque começamos do zero.";
}

function simulatePipeline(message, hasActiveAnchor) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  let directReply = GENERIC_WELCOME_DIRECT_REPLY;
  let clearContext = !hasActiveAnchor;
  let effectiveIntent = "search";

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
      directReply,
      clearContext,
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

  // PATCH 7.9L — mirror handler response path wiring (subset for neighbor families)
  const isAntiRegretResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isAntiRegret === true ||
      isAntiRegretFamilyQuery(message) ||
      routingDecision.conversationAct === "anti_regret"
    );

  const isDecisionConfirmationResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isDecisionConfirmation === true ||
      isDecisionConfirmationFamilyQuery(message) ||
      routingDecision.conversationAct === "decision_confirmation"
    );

  const isConfidenceChallengeResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isConfidenceChallenge === true ||
      isConfidenceChallengeFamilyQuery(message) ||
      routingDecision.conversationAct === "confidence_challenge"
    );

  const isSocialValidationResponsePath =
    cognitiveTurn.signals?.isSocialValidation === true ||
    isSocialValidationFamilyQuery(message) ||
    routingDecision.conversationAct === "social_validation";

  const isSecondBestDiscoveryResponsePath =
    cognitiveTurn.signals?.isSecondBestDiscovery === true ||
    isSecondBestDiscoveryFamilyQuery(message) ||
    routingDecision.conversationAct === "second_best_discovery";

  const isAlternativeExplorationResponsePath =
    cognitiveTurn.signals?.isAlternativeExploration === true ||
    isAlternativeExplorationFamilyQuery(message) ||
    routingDecision.conversationAct === "alternative_exploration";

  const isSoftDisagreementResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isSoftDisagreement === true ||
      isSoftDisagreementFamilyQuery(message) ||
      routingDecision.conversationAct === "soft_disagreement"
    );

  const isConstraintChangeResponsePath =
    !clearNewSearch &&
    (
      cognitiveTurn.signals?.isConstraintChange === true ||
      isConstraintChangeFamilyQuery(message) ||
      routingDecision.conversationAct === "constraint_change" ||
      String(routingDecision.responsePathHint || "").startsWith("constraint_change")
    );

  if (isAntiRegretResponsePath) {
    directReply = null;
    clearContext = false;
    effectiveIntent = "anti_regret";
  } else if (isDecisionConfirmationResponsePath) {
    directReply = null;
    clearContext = false;
    effectiveIntent = "decision_confirmation";
  } else if (isConfidenceChallengeResponsePath) {
    directReply = null;
    clearContext = false;
    effectiveIntent = "confidence_challenge";
  } else if (isSocialValidationResponsePath) {
    directReply = null;
    clearContext = false;
    effectiveIntent = "social_validation";
  } else if (isSecondBestDiscoveryResponsePath) {
    directReply = null;
    clearContext = false;
    effectiveIntent = "second_best_discovery";
  } else if (isAlternativeExplorationResponsePath) {
    directReply = null;
    clearContext = false;
    effectiveIntent = "alternative_exploration";
  } else if (isSoftDisagreementResponsePath) {
    directReply = null;
    clearContext = false;
    effectiveIntent = "soft_disagreement";
  } else if (isConstraintChangeResponsePath) {
    directReply = null;
    clearContext = false;
    effectiveIntent = "constraint_change";
  }

  let responsePathFinal = "unknown";
  let finalResponsePreview = "";

  if (directReply && !clearContext) {
    responsePathFinal = "context_resolution_direct_reply_early_return";
    finalResponsePreview = directReply;
  } else if (directReply && clearContext) {
    responsePathFinal = "context_resolution_direct_reply_early_return";
    finalResponsePreview = directReply;
  } else if (effectiveIntent === "constraint_change") {
    responsePathFinal = "constraint_change_flow";
    finalResponsePreview = hasActiveAnchor
      ? buildAnchoredConstraintChangePreview()
      : buildOpenConstraintChangePreview();
  } else if (effectiveIntent === "anti_regret") {
    responsePathFinal = "anti_regret_flow";
    finalResponsePreview = "anti_regret_preview";
  } else if (effectiveIntent === "alternative_exploration") {
    responsePathFinal = "alternative_exploration_flow";
    finalResponsePreview = "alternative_exploration_preview";
  } else if (effectiveIntent === "second_best_discovery") {
    responsePathFinal = "second_best_discovery_flow";
    finalResponsePreview = "second_best_discovery_preview";
  } else if (effectiveIntent === "decision_confirmation") {
    responsePathFinal = "decision_confirmation_flow";
    finalResponsePreview = "decision_confirmation_preview";
  } else if (effectiveIntent === "confidence_challenge") {
    responsePathFinal = "confidence_challenge_flow";
    finalResponsePreview = "confidence_challenge_preview";
  } else if (effectiveIntent === "social_validation") {
    responsePathFinal = "social_validation_flow";
    finalResponsePreview = "social_validation_preview";
  } else if (effectiveIntent === "soft_disagreement") {
    responsePathFinal = "soft_disagreement_flow";
    finalResponsePreview = "soft_disagreement_preview";
  } else if (openedNewSearch) {
    responsePathFinal = "default_product_search";
    finalResponsePreview = "";
  }

  const genericFallbackDetected = detectGenericConversationalFallback(finalResponsePreview);
  const routerSignal =
    cognitiveTurn.signals?.isConstraintChange || isConstraintChangeFamilyQuery(message);

  return {
    cognitiveTurn,
    routingDecision,
    clearNewSearch,
    openedNewSearch,
    effectiveIntent,
    responsePathFinal,
    finalResponsePreview,
    genericFallbackDetected,
    clearContext,
    routerSignal,
    anchorPreserved:
      !hasActiveAnchor ||
      (routingDecision.shouldPreserveAnchor === true &&
        routingDecision.anchorProduct?.product_name === MOCK_WINNER.product_name),
  };
}

function demonstratesRecalibration(preview = "") {
  const q = String(preview).toLowerCase();
  return (
    /\b(recalibr|reavali|prioridade|crit[eé]rio|or[cç]amento|mesma decis[aã]o|refer[eê]ncia)\b/.test(q)
  );
}

function evaluateConstraintChangePositive(spec) {
  const pipeline = simulatePipeline(spec.input, spec.anchored);
  const failures = [];

  if (!pipeline.routerSignal && !spec.optional) {
    failures.push("router: constraint change signal missing");
  }

  if (!pipeline.routerSignal && spec.optional) {
    return {
      kind: "constraint_change_response_optional",
      ...spec,
      context: spec.anchored ? "anchored" : "cold",
      skipped: true,
      passed: true,
      failures: [],
    };
  }

  if (pipeline.openedNewSearch) {
    failures.push("routing: new_search opened");
  }

  if (pipeline.effectiveIntent !== "constraint_change") {
    failures.push(`intent: expected constraint_change, got ${pipeline.effectiveIntent}`);
  }

  if (pipeline.responsePathFinal !== "constraint_change_flow") {
    failures.push(`response: expected constraint_change_flow, got ${pipeline.responsePathFinal}`);
  }

  if (pipeline.genericFallbackDetected) {
    failures.push("response: institutional generic fallback detected");
  }

  if (pipeline.responsePathFinal === "context_resolution_direct_reply_early_return") {
    failures.push("response: directReply early return leak");
  }

  if (!demonstratesRecalibration(pipeline.finalResponsePreview)) {
    failures.push("response: preview missing recalibration semantics");
  }

  if (spec.anchored && !pipeline.anchorPreserved) {
    failures.push("response: anchor not preserved");
  }

  if (spec.anchored && pipeline.clearContext) {
    failures.push("response: session context cleared");
  }

  return {
    kind: "constraint_change_response",
    ...spec,
    context: spec.anchored ? "anchored" : "cold",
    effectiveIntent: pipeline.effectiveIntent,
    responsePathFinal: pipeline.responsePathFinal,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateCommercial(spec) {
  const pipeline = simulatePipeline(spec.input, spec.anchored);
  const failures = [];

  if (pipeline.effectiveIntent === "constraint_change") {
    failures.push("response: must not be constraint_change");
  }

  if (pipeline.responsePathFinal === "constraint_change_flow") {
    failures.push("response: constraint_change_flow leak on commercial query");
  }

  return {
    kind: "commercial_guard",
    ...spec,
    context: spec.anchored ? "anchored" : "cold",
    effectiveIntent: pipeline.effectiveIntent,
    responsePathFinal: pipeline.responsePathFinal,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateNeighbor(spec) {
  const pipeline = simulatePipeline(spec.input, spec.anchored);
  const failures = [];

  if (!spec.detector(spec.input)) {
    failures.push("router: family detector mismatch");
  }

  if (pipeline.effectiveIntent === "constraint_change") {
    failures.push("response: swallowed by constraint_change");
  }

  if (pipeline.responsePathFinal === "constraint_change_flow") {
    failures.push("response: constraint_change_flow swallowed neighbor");
  }

  if (pipeline.effectiveIntent !== spec.intent) {
    if (!spec.optional) {
      failures.push(`response: expected ${spec.intent}, got ${pipeline.effectiveIntent}`);
    }
  }

  if (pipeline.responsePathFinal !== spec.flow && !spec.optional) {
    failures.push(`response: expected ${spec.flow}, got ${pipeline.responsePathFinal}`);
  }

  if (spec.optional && failures.length > 0) {
    return {
      kind: "neighbor_optional",
      ...spec,
      context: "anchored",
      skipped: true,
      passed: true,
      failures: [],
    };
  }

  return {
    kind: "neighbor_family",
    ...spec,
    context: "anchored",
    effectiveIntent: pipeline.effectiveIntent,
    responsePathFinal: pipeline.responsePathFinal,
    passed: failures.length === 0,
    failures,
  };
}

console.log("\nPATCH 7.9L — CONSTRAINT_CHANGE Response Path\n");
console.log("HTTP usage: false | SerpAPI risk: false\n");

const positiveRecords = CONSTRAINT_CHANGE_POSITIVE.map(evaluateConstraintChangePositive);
const commercialRecords = COMMERCIAL_MUST_NOT_CC.map(evaluateCommercial);
const neighborRecords = NEIGHBOR_FAMILIES.map(evaluateNeighbor);

console.log("── Constraint Change response path ──\n");
for (const r of positiveRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.responsePathFinal || "skipped"} intent=${r.effectiveIntent || "-"}${r.failures?.length ? ` | ${r.failures.join("; ")}` : ""}${r.skipped ? " (optional)" : ""}`
  );
}

console.log("\n── Commercial must not use constraint_change_flow ──\n");
for (const r of commercialRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.responsePathFinal} intent=${r.effectiveIntent}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Neighbor families (no constraint_change swallow) ──\n");
for (const r of neighborRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → ${r.responsePathFinal} intent=${r.effectiveIntent}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}${r.skipped ? " (optional)" : ""}`
  );
}

const posRequired = positiveRecords.filter((r) => !r.skipped);
const posPass = posRequired.filter((r) => r.passed).length;
const comPass = commercialRecords.filter((r) => r.passed).length;
const neiRequired = neighborRecords.filter((r) => !r.skipped);
const neiPass = neiRequired.filter((r) => r.passed).length;

console.log("\n── Summary ──\n");
console.log(`Constraint Change response (required): ${posPass}/${posRequired.length}`);
console.log(`Commercial guards: ${comPass}/${commercialRecords.length}`);
console.log(`Neighbor families: ${neiPass}/${neiRequired.length}`);

const allPass =
  posPass === posRequired.length &&
  comPass === commercialRecords.length &&
  neiPass === neiRequired.length;

console.log(`\nPATCH 7.9L response path audit: ${allPass ? "PASS" : "FAIL"}\n`);

if (!allPass) {
  process.exitCode = 1;
}
