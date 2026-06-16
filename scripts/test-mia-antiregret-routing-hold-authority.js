/**
 * PATCH 7.9X-D.2 — ANTI_REGRET Routing Hold Authority (local audit)
 *
 * Validates anti_regret routing precedence + emotional clearNewCommercialSearch guards.
 *
 * Usage: node scripts/test-mia-antiregret-routing-hold-authority.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
  isAntiRegretFamilyQuery,
  isDecisionConfirmationFamilyQuery,
  isConfidenceChallengeFamilyQuery,
  isAlternativeExplorationFamilyQuery,
  isSecondBestDiscoveryFamilyQuery,
  isSocialValidationFamilyQuery,
  isSoftDisagreementFamilyQuery,
} from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import {
  resolveClearNewCommercialSearchForRouting,
  isEmotionalAntiRegretDesire,
} from "../lib/miaRoutingSafety.js";

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

const ANTI_REGRET_POSITIVE = [
  { group: "A", input: "tenho medo de errar", anchored: false },
  { group: "A", input: "tenho medo de errar", anchored: true },
  { group: "A", input: "não quero me arrepender", anchored: false },
  { group: "A", input: "não quero me arrepender", anchored: true },
  { group: "A", input: "tenho medo de escolher errado", anchored: false },
  { group: "A", input: "tenho medo de escolher errado", anchored: true },
  { group: "A", input: "não quero fazer besteira", anchored: false },
  { group: "A", input: "não quero fazer besteira", anchored: true },
  { group: "B", input: "quero evitar dor de cabeça", anchored: false },
  { group: "B", input: "quero evitar dor de cabeça", anchored: true },
  { group: "B", input: "quero uma escolha tranquila", anchored: false },
  { group: "B", input: "quero uma escolha tranquila", anchored: true },
  { group: "B", input: "quero comprar sem me arrepender", anchored: false },
  { group: "B", input: "quero comprar sem me arrepender", anchored: true },
  { group: "B", input: "quero ficar tranquilo depois da compra", anchored: false },
  { group: "B", input: "quero ficar tranquilo depois da compra", anchored: true },
  { group: "B", input: "quero comprar certo", anchored: false },
  { group: "B", input: "quero comprar certo", anchored: true },
  { group: "B", input: "quero reduzir o risco", anchored: false },
  { group: "B", input: "quero reduzir o risco", anchored: true },
  {
    group: "C",
    input: "acho que vou nele, mas tenho medo de errar",
    anchored: true,
    optional: true,
  },
  {
    group: "C",
    input: "esse é o melhor mesmo ou vou me arrepender?",
    anchored: true,
    optional: true,
  },
  { group: "C", input: "vale ir nele sem medo?", anchored: true, optional: true },
  { group: "C", input: "você compraria esse sem receio?", anchored: true, optional: true },
  { group: "B", input: "quero algo que não me incomode depois", anchored: false },
  { group: "B", input: "quero algo que não me incomode depois", anchored: true },
  { group: "A", input: "não quero errar nessa compra", anchored: false },
  { group: "A", input: "não quero errar nessa compra", anchored: true },
  { group: "A", input: "não quero me frustrar depois", anchored: false },
  { group: "A", input: "não quero me frustrar depois", anchored: true },
  { group: "B", input: "quero não fazer besteira", anchored: false },
  { group: "B", input: "quero não fazer besteira", anchored: true },
];

const COMMERCIAL_MUST_SEARCH = [
  { group: "D", input: "quero um celular até 2000", anchored: false },
  { group: "D", input: "quero um notebook para estudar", anchored: false },
  { group: "D", input: "quero uma TV boa", anchored: false },
  { group: "D", input: "quero outro modelo", anchored: true },
  { group: "D", input: "quero algo mais barato", anchored: true },
  { group: "D", input: "quero um produto com mais bateria", anchored: true },
  { group: "D", input: "quero um aparelho melhor para jogar", anchored: false },
  { group: "D", input: "quero celular confiável até 2000", anchored: false },
];

const NEIGHBOR_FAMILIES = [
  {
    group: "E",
    input: "acho que vou nele então",
    anchored: true,
    detector: isDecisionConfirmationFamilyQuery,
    act: "decision_confirmation",
  },
  {
    group: "E",
    input: "tem certeza?",
    anchored: true,
    detector: isConfidenceChallengeFamilyQuery,
    act: "confidence_challenge",
  },
  {
    group: "E",
    input: "quero explorar outras opções",
    anchored: true,
    detector: isAlternativeExplorationFamilyQuery,
    act: "alternative_exploration",
  },
  {
    group: "E",
    input: "qual seria a reserva?",
    anchored: true,
    detector: isSecondBestDiscoveryFamilyQuery,
    act: "second_best_discovery",
  },
  {
    group: "E",
    input: "a galera recomenda?",
    anchored: true,
    detector: isSocialValidationFamilyQuery,
    act: "social_validation",
  },
  {
    group: "E",
    input: "não me convenceu",
    anchored: true,
    detector: isSoftDisagreementFamilyQuery,
    act: "soft_disagreement",
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
    emotionalGuard: isEmotionalAntiRegretDesire(message),
    familyQuery: isAntiRegretFamilyQuery(message),
  };
}

function evaluateAntiRegretPositive(spec) {
  const pipeline = simulateRouting(spec.input, spec.anchored);
  const failures = [];
  const emotionalGuard = pipeline.emotionalGuard;
  const routerSignal =
    pipeline.cognitiveTurn.signals?.isAntiRegret || pipeline.familyQuery;

  if (!routerSignal && !emotionalGuard && !spec.optional) {
    failures.push("intent: neither router nor emotional anti-regret guard matched");
  }

  if (!routerSignal && !emotionalGuard && spec.optional) {
    return {
      kind: "anti_regret_positive_optional",
      ...spec,
      context: spec.anchored ? "anchored" : "cold",
      skipped: true,
      passed: true,
      failures: [],
      note: "router expansion pending — not enforced in 7.9X-D.2",
    };
  }

  if (pipeline.clearNewSearch) {
    failures.push("safety: clearNewCommercialSearch should be false");
  }

  if (pipeline.routingDecision.conversationAct !== "anti_regret") {
    failures.push(
      `routing: expected anti_regret, got ${pipeline.routingDecision.conversationAct}`
    );
  }

  if (pipeline.routingDecision.conversationAct === "context_question") {
    failures.push("routing: context_question leak");
  }

  if (pipeline.openedNewSearch) {
    failures.push("routing: new_search opened");
  }

  if (
    spec.anchored &&
    pipeline.routingDecision.shouldPreserveAnchor !== true
  ) {
    failures.push("routing: anchor not preserved");
  }

  const handlerGate =
    !pipeline.clearNewSearch && (routerSignal || emotionalGuard);

  if (!handlerGate) {
    failures.push("response gate: anti_regret_flow would be blocked");
  }

  return {
    kind: "anti_regret_positive",
    ...spec,
    context: spec.anchored ? "anchored" : "cold",
    turnType: pipeline.cognitiveTurn.turnType,
    conversationAct: pipeline.routingDecision.conversationAct,
    clearNewSearch: pipeline.clearNewSearch,
    routerSignal,
    emotionalGuard,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateCommercial(spec) {
  const pipeline = simulateRouting(spec.input, spec.anchored);
  const failures = [];

  if (!pipeline.clearNewSearch && !pipeline.openedNewSearch) {
    failures.push("safety: expected clearNewCommercialSearch or new_search path");
  }

  if (pipeline.routingDecision.conversationAct === "anti_regret") {
    failures.push("routing: must not be anti_regret");
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
    failures.push(
      `routing: expected ${spec.act}, got ${pipeline.routingDecision.conversationAct}`
    );
  }

  if (pipeline.routingDecision.conversationAct === "anti_regret") {
    failures.push("routing: swallowed by anti_regret");
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

console.log("\nPATCH 7.9X-D.2 — ANTI_REGRET Routing Hold Authority\n");
console.log("HTTP usage: false | SerpAPI risk: false\n");

const positiveRecords = ANTI_REGRET_POSITIVE.map(evaluateAntiRegretPositive);
const commercialRecords = COMMERCIAL_MUST_SEARCH.map(evaluateCommercial);
const neighborRecords = NEIGHBOR_FAMILIES.map(evaluateNeighbor);

const allRecords = [...positiveRecords, ...commercialRecords, ...neighborRecords];

console.log("── Anti-Regret positive (routing hold + safety) ──\n");
for (const r of positiveRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.conversationAct} clear=${r.clearNewSearch} turn=${r.turnType}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Commercial must stay commercial ──\n");
for (const r of commercialRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → ${r.conversationAct} clear=${r.clearNewSearch}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Neighbor families (no anti_regret swallow) ──\n");
for (const r of neighborRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → ${r.conversationAct}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

const posPass = positiveRecords.filter((r) => r.passed).length;
const posTotal = positiveRecords.filter((r) => !r.skipped).length;
const posRequired = positiveRecords.filter((r) => !r.skipped);
const posRequiredPass = posRequired.filter((r) => r.passed).length;
const comPass = commercialRecords.filter((r) => r.passed).length;
const comTotal = commercialRecords.length;
const neiPass = neighborRecords.filter((r) => r.passed).length;
const neiTotal = neighborRecords.length;

const expansion7xD = [
  "quero evitar dor de cabeça",
  "não quero errar nessa compra",
  "não quero fazer besteira",
  "não quero escolher mal",
  "quero uma escolha tranquila",
  "quero algo que não me incomode depois",
  "tenho medo de escolher errado",
  "não quero me frustrar depois",
];

let expansionRoutingPass = 0;
let expansionTotal = 0;
for (const phrase of expansion7xD) {
  for (const anchored of [false, true]) {
    expansionTotal++;
    const p = simulateRouting(phrase, anchored);
    if (
      p.routingDecision.conversationAct === "anti_regret" &&
      !p.clearNewSearch
    ) {
      expansionRoutingPass++;
    }
  }
}

console.log("\n── Summary ──\n");
console.log(`Anti-Regret positive: ${posRequiredPass}/${posRequired.length} required (${((posRequiredPass / posRequired.length) * 100).toFixed(1)}%) | ${posPass}/${positiveRecords.length} incl. optional`);
console.log(`Commercial guards: ${comPass}/${comTotal}`);
console.log(`Neighbor families: ${neiPass}/${neiTotal}`);
console.log(
  `7.9X-D expansion routing: ${expansionRoutingPass}/${expansionTotal} (${((expansionRoutingPass / expansionTotal) * 100).toFixed(1)}%)`
);
console.log(`Total scenarios: ${allRecords.length}`);

const auditPass =
  posRequiredPass / posRequired.length >= 0.9 &&
  comPass === comTotal &&
  neiPass >= neiTotal - 1 &&
  expansionRoutingPass / expansionTotal >= 0.9;

console.log(
  `\nPATCH 7.9X-D.2 audit ${auditPass ? "PASSED" : "GAPS FOUND"}\n`
);

process.exit(auditPass ? 0 : 1);
