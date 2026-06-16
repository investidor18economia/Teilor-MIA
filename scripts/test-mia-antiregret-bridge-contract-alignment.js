/**
 * PATCH 7.9X-D.3 — ANTI_REGRET Bridge Contract Alignment (local audit)
 *
 * Usage: node scripts/test-mia-antiregret-bridge-contract-alignment.js
 */

import {
  classifyMiaTurn,
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

const ANTI_REGRET_POSITIVE = [
  { group: "A", input: "não quero errar nessa compra", anchored: false },
  { group: "A", input: "não quero errar nessa compra", anchored: true },
  { group: "A", input: "não quero me arrepender", anchored: false },
  { group: "A", input: "não quero me arrepender", anchored: true },
  { group: "A", input: "tenho medo de escolher errado", anchored: false },
  { group: "A", input: "tenho medo de escolher errado", anchored: true },
  { group: "A", input: "quero evitar dor de cabeça", anchored: false },
  { group: "A", input: "quero evitar dor de cabeça", anchored: true },
  { group: "A", input: "quero comprar sem me arrepender", anchored: false, optional: true },
  { group: "A", input: "quero comprar sem me arrepender", anchored: true, optional: true },
  { group: "A", input: "quero ficar tranquilo depois da compra", anchored: false, optional: true },
  { group: "A", input: "quero ficar tranquilo depois da compra", anchored: true, optional: true },
  { group: "A", input: "não quero fazer besteira", anchored: false },
  { group: "A", input: "não quero fazer besteira", anchored: true },
  { group: "A", input: "quero uma escolha tranquila", anchored: false },
  { group: "A", input: "quero uma escolha tranquila", anchored: true },
];

const ANCHORED_COMPOSITE = [
  { group: "B", input: "acho que vou nele, mas tenho medo de errar", optional: true },
  { group: "B", input: "esse é o melhor mesmo ou vou me arrepender?", optional: true },
  { group: "B", input: "vale ir nele sem medo?", optional: true },
  { group: "B", input: "você compraria esse sem receio?", optional: true },
];

const COMMON_OBJECTION = [
  { group: "C", input: "não gostei desse", anchored: true },
  { group: "C", input: "achei caro", anchored: true },
  { group: "C", input: "prefiro outra marca", anchored: true },
  { group: "C", input: "não quero esse modelo", anchored: true },
  { group: "C", input: "esse não me convenceu", anchored: true },
];

const COMMON_DECISION = [
  { group: "D", input: "esse é melhor?", anchored: true },
  { group: "D", input: "qual você escolheria?", anchored: true },
  { group: "D", input: "vale mais a pena esse ou aquele?", anchored: true },
  { group: "D", input: "posso comprar esse?", anchored: true },
];

const NEIGHBOR_FAMILIES = [
  {
    group: "E",
    input: "não me convenceu",
    act: "soft_disagreement",
    detector: isSoftDisagreementFamilyQuery,
  },
  {
    group: "E",
    input: "tem certeza?",
    act: "confidence_challenge",
    detector: isConfidenceChallengeFamilyQuery,
  },
  {
    group: "E",
    input: "acho que vou nele então",
    act: "decision_confirmation",
    detector: isDecisionConfirmationFamilyQuery,
  },
  {
    group: "E",
    input: "quero explorar outras opções",
    act: "alternative_exploration",
    detector: isAlternativeExplorationFamilyQuery,
  },
  {
    group: "E",
    input: "qual seria a reserva?",
    act: "second_best_discovery",
    detector: isSecondBestDiscoveryFamilyQuery,
  },
  {
    group: "E",
    input: "a galera recomenda?",
    act: "social_validation",
    detector: isSocialValidationFamilyQuery,
  },
];

function simulateBridgeContract(message, hasActiveAnchor) {
  const sessionContext = hasActiveAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR;
  const legacyIntent = "search";

  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor,
    detectedIntent: legacyIntent,
    contextAction: "search",
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, legacyIntent);
  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: legacyIntent,
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
    intent: bridgeAudit.active ? bridgeAudit.toIntent : legacyIntent,
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
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

  return {
    cognitiveTurn,
    bridgeAudit,
    guardResult,
    routingDecision,
    clearNewSearch,
  };
}

function evaluateAntiRegretPositive(spec) {
  const pipeline = simulateBridgeContract(spec.input, spec.anchored);
  const routerRecognized =
    !!pipeline.cognitiveTurn.signals?.isAntiRegret ||
    isAntiRegretFamilyQuery(spec.input);

  if (spec.optional && !routerRecognized) {
    return {
      ...spec,
      context: spec.anchored ? "anchored" : "cold",
      skipped: true,
      passed: true,
      failures: [],
      note: "router expansion pending (7.9X-D.4)",
    };
  }

  const failures = [];

  if (!routerRecognized) {
    failures.push("router: ANTI_REGRET not recognized");
  }

  if (!pipeline.bridgeAudit.active) {
    failures.push("bridge: not active");
  }

  if (pipeline.bridgeAudit.toIntent !== "anti_regret") {
    failures.push(`bridge intent=${pipeline.bridgeAudit.toIntent || "none"}`);
  }

  if (pipeline.guardResult.contextAction !== "anti_regret") {
    failures.push(`contextAction=${pipeline.guardResult.contextAction}`);
  }

  if (pipeline.guardResult.contextAction === "decision") {
    failures.push("contextAction still generic decision");
  }

  if (pipeline.routingDecision.conversationAct !== "anti_regret") {
    failures.push(`routing act=${pipeline.routingDecision.conversationAct}`);
  }

  if (spec.anchored) {
    if (pipeline.routingDecision.shouldPreserveAnchor !== true) {
      failures.push("anchor not preserved in routing");
    }
    if (pipeline.routingDecision.allowReplaceWinner === true) {
      failures.push("winner replace allowed");
    }
  }

  return {
    ...spec,
    context: spec.anchored ? "anchored" : "cold",
    bridgeIntent: pipeline.bridgeAudit.toIntent,
    contextAction: pipeline.guardResult.contextAction,
    routingAct: pipeline.routingDecision.conversationAct,
    passed: failures.length === 0,
    failures,
  };
}

function evaluateAntiRegretNegative(spec) {
  const pipeline = simulateBridgeContract(spec.input, spec.anchored);
  const failures = [];

  if (pipeline.bridgeAudit.toIntent === "anti_regret") {
    failures.push("bridge incorrectly mapped to anti_regret");
  }

  if (pipeline.guardResult.contextAction === "anti_regret") {
    failures.push("contextAction incorrectly anti_regret");
  }

  if (pipeline.routingDecision.conversationAct === "anti_regret") {
    failures.push("routing incorrectly anti_regret");
  }

  return {
    ...spec,
    context: "anchored",
    passed: failures.length === 0,
    failures,
  };
}

function evaluateNeighbor(spec) {
  const pipeline = simulateBridgeContract(spec.input, true);
  const failures = [];

  if (!spec.detector(spec.input)) {
    failures.push("detector mismatch");
  }

  if (pipeline.bridgeAudit.toIntent === "anti_regret") {
    failures.push("bridge swallowed by anti_regret");
  }

  if (pipeline.routingDecision.conversationAct === "anti_regret") {
    failures.push("routing swallowed by anti_regret");
  }

  if (pipeline.routingDecision.conversationAct !== spec.act) {
    failures.push(`expected routing ${spec.act}, got ${pipeline.routingDecision.conversationAct}`);
  }

  return {
    ...spec,
    passed: failures.length === 0,
    failures,
  };
}

console.log("\nPATCH 7.9X-D.3 — ANTI_REGRET Bridge Contract Alignment\n");

const positiveRecords = [
  ...ANTI_REGRET_POSITIVE.map(evaluateAntiRegretPositive),
  ...ANCHORED_COMPOSITE.map((s) =>
    evaluateAntiRegretPositive({ ...s, anchored: true })
  ),
];
const negativeRecords = [
  ...COMMON_OBJECTION.map(evaluateAntiRegretNegative),
  ...COMMON_DECISION.map(evaluateAntiRegretNegative),
];
const neighborRecords = NEIGHBOR_FAMILIES.map(evaluateNeighbor);

console.log("── Grupo A/B — must align to anti_regret contract ──\n");
for (const r of positiveRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}/${r.context}] "${r.input}" → intent=${r.bridgeIntent || "-"} ctx=${r.contextAction || "-"} route=${r.routingAct || "-"}${r.skipped ? " (optional)" : ""}${r.failures?.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Grupo C/D — must NOT become anti_regret ──\n");
for (const r of negativeRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}"${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
}

console.log("\n── Grupo E — neighbor families ──\n");
for (const r of neighborRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.group}] "${r.input}" → ${r.failures.length ? r.failures.join("; ") : "ok"}`
  );
}

const requiredPositive = positiveRecords.filter((r) => !r.skipped);
const requiredPass = requiredPositive.filter((r) => r.passed).length;
const negativePass = negativeRecords.filter((r) => r.passed).length;
const neighborPass = neighborRecords.filter((r) => r.passed).length;

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

let expansionContractPass = 0;
let expansionContractTotal = 0;
for (const phrase of expansion7xD) {
  for (const anchored of [false, true]) {
    expansionContractTotal++;
    const p = simulateBridgeContract(phrase, anchored);
    if (
      p.bridgeAudit.toIntent === "anti_regret" &&
      p.guardResult.contextAction === "anti_regret" &&
      p.routingDecision.conversationAct === "anti_regret"
    ) {
      expansionContractPass++;
    }
  }
}

console.log("\n── Summary ──\n");
console.log(
  `Required anti_regret contract: ${requiredPass}/${requiredPositive.length} (${((requiredPass / requiredPositive.length) * 100).toFixed(1)}%)`
);
console.log(`Negative guards: ${negativePass}/${negativeRecords.length}`);
console.log(`Neighbor families: ${neighborPass}/${neighborRecords.length}`);
console.log(
  `7.9X-D expansion contract: ${expansionContractPass}/${expansionContractTotal} (${((expansionContractPass / expansionContractTotal) * 100).toFixed(1)}%)`
);

const auditPass =
  requiredPass / requiredPositive.length >= 0.9 &&
  negativePass === negativeRecords.length &&
  neighborPass >= neighborRecords.length - 1 &&
  expansionContractPass / expansionContractTotal >= 1;

console.log(`\nPATCH 7.9X-D.3 audit ${auditPass ? "PASSED" : "GAPS FOUND"}\n`);
process.exit(auditPass ? 0 : 1);
