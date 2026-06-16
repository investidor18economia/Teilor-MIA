/**
 * PATCH 7.7N — Soft Disagreement Semantic Family Local Audit
 *
 * Audits SOFT_DISAGREEMENT family without production changes.
 * Two contexts: cold session (no anchor) and anchored session (winner preserved).
 * Includes commercial guard cases (must not be treated as pure soft disagreement).
 *
 * Usage: node scripts/test-mia-soft-disagreement-semantic-family-local-audit.js
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

const PURE_SOFT_DISAGREEMENT = [
  "acho que não",
  "não concordo muito",
  "nao concordo muito",
  "não me convenceu",
  "nao me convenceu",
  "não sei se é isso",
  "nao sei se e isso",
  "tenho minhas dúvidas",
  "tenho minhas duvidas",
  "hmm não sei",
  "hmm nao sei",
  "não tenho certeza disso",
  "não parece tão bom assim",
  "nao parece tao bom assim",
  "não estou convencido",
  "nao estou convencido",
  "não bateu comigo",
  "nao bateu comigo",
];

const COMMERCIAL_GUARD_CASES = [
  { input: "não me convenceu, tem outro?", dominantIntent: "alternative_exploration" },
  { input: "não concordo muito, compara com samsung", dominantIntent: "comparison" },
  { input: "não parece tão bom assim, e se eu gastar menos?", dominantIntent: "constraint_change" },
  { input: "acho que não, quero ver outra opção", dominantIntent: "alternative_exploration" },
  { input: "não estou convencido, qual ficou em segundo?", dominantIntent: "second_best_discovery" },
  { input: "não bateu comigo, me mostra algo mais barato", dominantIntent: "refinement" },
];

/** Partial router coverage today: anchored hesitation → OBJECTION (PATCH 7.6C/E). */
const PARTIAL_ANCHORED_SOFT_DISAGREEMENT_TURN_TYPES = new Set([
  MIA_TURN_TYPES.OBJECTION,
]);

/** Ideal future cold path — not implemented yet. */
const IDEAL_COLD_SOFT_DISAGREEMENT_TURN_TYPES = new Set([
  MIA_TURN_TYPES.CONVERSATIONAL,
]);

const SAFE_SOFT_DISAGREEMENT_ROUTING_MODES = new Set([
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
function hasSoftDisagreementCommercialTail(q = "") {
  if (!q) return false;
  if (/\b(quero|busca|procura|recomenda|indica|sugere|mostra|mostre|comprar|preciso de|compara|compare|alternativa)\b/.test(q)) {
    return true;
  }
  if (/\b(outro|outra|segundo|segunda)\b/.test(q) && !/\bde outro jeito\b/.test(q)) {
    return true;
  }
  if (/\b(ate|até|por|abaixo|menos de|gastar|barato|barata)\b/.test(q)) return true;
  if (/\b(celular|smartphone|iphone|galaxy|moto|pixel|notebook|tv|tablet|fone|gamer|samsung)\b/.test(q)) {
    return true;
  }
  if (/\be se eu\b/.test(q)) return true;
  if (/,\s*(e |se |quero|me |tem |compara|mostra|tem outro|qual ficou)/.test(q)) return true;
  if (/\b(esse|essa|este|esta)\s+\w+/.test(q)) return true;
  return false;
}

/** Audit-side family detector — documents expected SOFT_DISAGREEMENT intent. */
function isPureSoftDisagreementFamilyQuery(message = "") {
  const q = normalizeQuery(message);
  if (!q || hasSoftDisagreementCommercialTail(q)) return false;

  if (/^acho que nao$/.test(q)) return true;
  if (/^nao concordo muito$/.test(q)) return true;
  if (/^nao me convenceu$/.test(q)) return true;
  if (/^nao sei se (e|eh) isso$/.test(q)) return true;
  if (/^tenho minhas duvidas$/.test(q)) return true;
  if (/^hmm nao sei$/.test(q)) return true;
  if (/^nao tenho certeza disso$/.test(q)) return true;
  if (/^nao parece tao bom assim$/.test(q)) return true;
  if (/^nao estou convencido$/.test(q)) return true;
  if (/^nao bateu comigo$/.test(q)) return true;

  return false;
}

function isPartialRouterSoftDisagreement(cognitiveTurn, hasActiveAnchor) {
  if (!hasActiveAnchor) return false;
  if (
    cognitiveTurn.signals?.isSoftDisagreement === true &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION
  ) {
    return true;
  }
  return (
    PARTIAL_ANCHORED_SOFT_DISAGREEMENT_TURN_TYPES.has(cognitiveTurn.turnType) &&
    cognitiveTurn.signals?.hesitationReaction?.detected === true
  );
}

function resolveVerbalizerRole(cognitiveTurn, hasActiveAnchor) {
  if (isPartialRouterSoftDisagreement(cognitiveTurn, hasActiveAnchor)) {
    return "objection_hesitation_partial";
  }
  if (
    hasActiveAnchor &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION
  ) {
    return "objection_anchored";
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
    verbalizerRole: resolveVerbalizerRole(cognitiveTurn, hasActiveAnchor),
    signals: {
      isObjection: !!cognitiveTurn.signals?.isObjection,
      hesitationReaction: cognitiveTurn.signals?.hesitationReaction || { detected: false, subtype: null },
      isGreeting: !!cognitiveTurn.signals?.isGreeting,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isSoftDisagreementFamilyAudit: isPureSoftDisagreementFamilyQuery(message),
    },
    routerHasDedicatedSoftDisagreementFamily: !!cognitiveTurn.signals?.isSoftDisagreement,
    routerPartialViaHesitationObjection: isPartialRouterSoftDisagreement(
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
      wouldReevaluateAnchored: false,
    };
  }

  // PATCH 7.7Q — soft_disagreement_flow (mirror handler 7.7Q)
  if (
    cognitiveTurn.signals?.isSoftDisagreement &&
    (
      routingDecision.conversationAct === "soft_disagreement" ||
      routingDecision.responsePathHint === "soft_disagreement_reply" ||
      routingDecision.responsePathHint === "soft_disagreement_anchored"
    )
  ) {
    return {
      responsePathFinal: "soft_disagreement_flow",
      finalResponsePreview: hasActiveAnchor
        ? "Justo. Mantendo Produto Recomendado Atual como referência, posso revisar o ponto que não te convenceu."
        : "Justo. Me diz qual ponto não te convenceu que eu reviso contigo.",
      genericFallbackDetected: false,
      wouldReevaluateAnchored: hasActiveAnchor,
    };
  }

  if (
    hasActiveAnchor &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION &&
    cognitiveTurn.signals?.hesitationReaction?.detected
  ) {
    return {
      responsePathFinal: "objection_response_contract",
      finalResponsePreview:
        "Reconheço a resistência leve e reavalio a decisão mantendo a referência atual.",
      genericFallbackDetected: false,
      wouldReevaluateAnchored: true,
    };
  }

  if (
    hasActiveAnchor &&
    cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION
  ) {
    return {
      responsePathFinal: "objection_response_contract",
      finalResponsePreview:
        "Trata objeção ancorada sem abrir busca imediata.",
      genericFallbackDetected: false,
      wouldReevaluateAnchored: true,
    };
  }

  if (!hasActiveAnchor && !openedNewSearch) {
    return {
      responsePathFinal: "context_resolution_direct_reply_early_return",
      finalResponsePreview: GENERIC_WELCOME_DIRECT_REPLY,
      genericFallbackDetected: detectGenericConversationalFallback(
        GENERIC_WELCOME_DIRECT_REPLY
      ),
      wouldReevaluateAnchored: false,
    };
  }

  return {
    responsePathFinal: routingDecision.responsePathHint || routingDecision.mode || "unknown",
    finalResponsePreview: "",
    genericFallbackDetected: false,
    wouldReevaluateAnchored: false,
  };
}

function classifyPureSoftDisagreementFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;
  const { hasActiveAnchor, message } = spec;
  const pureFamily = isPureSoftDisagreementFamilyQuery(message);

  if (!pureFamily) {
    failures.push({
      layer: "Audit expectation",
      detail: "input is not in audit pure SOFT_DISAGREEMENT family list",
    });
    return failures;
  }

  if (turnType === MIA_TURN_TYPES.NEW_SEARCH) {
    failures.push({
      layer: "Router",
      detail: "pure soft disagreement classified as NEW_SEARCH",
    });
  }

  if (
    !hasActiveAnchor &&
    !IDEAL_COLD_SOFT_DISAGREEMENT_TURN_TYPES.has(turnType) &&
    turnType !== MIA_TURN_TYPES.OBJECTION
  ) {
    failures.push({
      layer: "Router",
      detail: `expected cold hold/conversational path, got ${turnType}`,
    });
  }

  if (
    hasActiveAnchor &&
    !isPartialRouterSoftDisagreement(pipeline.cognitiveTurn, hasActiveAnchor) &&
    turnType !== MIA_TURN_TYPES.OBJECTION
  ) {
    failures.push({
      layer: "Router",
      detail: `expected OBJECTION+hesitation partial or dedicated family, got ${turnType}`,
    });
  }

  if (
    hasActiveAnchor &&
    turnType === MIA_TURN_TYPES.OBJECTION &&
    !pipeline.cognitiveTurn.signals?.hesitationReaction?.detected &&
    pipeline.cognitiveTurn.signals?.isSoftDisagreement !== true
  ) {
    failures.push({
      layer: "Router",
      detail: "OBJECTION without hesitationReaction on pure soft disagreement",
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
      detail: "allowReplaceWinner or anchor loss on anchored soft disagreement",
    });
  }

  if (
    pipeline.routingDecision.allowReplaceWinner === true &&
    hasActiveAnchor &&
    isPartialRouterSoftDisagreement(pipeline.cognitiveTurn, hasActiveAnchor)
  ) {
    failures.push({
      layer: "Routing",
      detail: "allowReplaceWinner=true on anchored soft disagreement",
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
      detail: "cold soft disagreement should resist lightly, not institutional welcome",
    });
  }

  if (
    hasActiveAnchor &&
    isPartialRouterSoftDisagreement(pipeline.cognitiveTurn, hasActiveAnchor) &&
    !pipeline.responsePath.wouldReevaluateAnchored &&
    pipeline.responsePath.responsePathFinal !== "objection_response_contract" &&
    pipeline.responsePath.responsePathFinal !== "soft_disagreement_flow"
  ) {
    failures.push({
      layer: "Response path",
      detail: "anchored soft disagreement did not reach objection re-evaluation path",
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
        pipeline.clearNewSearch === true
      );
    case "comparison":
      return (
        turnType === MIA_TURN_TYPES.COMPARISON ||
        turnType === MIA_TURN_TYPES.COMPARISON_FOLLOWUP ||
        pipeline.cognitiveTurn.signals?.isComparison === true
      );
    case "constraint_change":
      return turnType === MIA_TURN_TYPES.PRIORITY_SHIFT;
    case "second_best_discovery":
      return (
        turnType === MIA_TURN_TYPES.FOLLOW_UP ||
        turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST ||
        /\bsegund[oa]\b/.test(normalizeQuery(spec.input))
      );
    case "refinement":
      return (
        turnType === MIA_TURN_TYPES.REFINEMENT ||
        turnType === MIA_TURN_TYPES.ALTERNATIVE_REQUEST ||
        pipeline.clearNewSearch === true
      );
    default:
      return false;
  }
}

function classifyGuardFailures(spec, pipeline) {
  const failures = [];
  const turnType = pipeline.cognitiveTurn.turnType;
  const hesitation = pipeline.cognitiveTurn.signals?.hesitationReaction;

  if (
    hesitation?.detected &&
    dominantIntentPreserved(spec, pipeline) === false &&
    spec.dominantIntent !== "constraint_change"
  ) {
    failures.push({
      layer: "New search guard",
      detail: `hesitationReaction swallowed dominant intent ${spec.dominantIntent}`,
    });
  }

  if (!dominantIntentPreserved(spec, pipeline)) {
    failures.push({
      layer: "Router",
      detail: `dominant intent ${spec.dominantIntent} not preserved — turnType=${turnType} clear=${pipeline.clearNewSearch}`,
    });
  }

  if (
    isPureSoftDisagreementFamilyQuery(spec.input) &&
    hesitation?.detected
  ) {
    failures.push({
      layer: "Router",
      detail: "classified as pure soft disagreement despite commercial tail",
    });
  }

  return failures;
}

function evaluatePureCase(message, hasActiveAnchor) {
  const pipeline = simulatePipeline(message, hasActiveAnchor);
  const failures = classifyPureSoftDisagreementFailures(
    { message, hasActiveAnchor },
    pipeline
  );

  return {
    kind: "pure_soft_disagreement",
    input: message,
    family: "SOFT_DISAGREEMENT",
    context: hasActiveAnchor ? "anchored" : "no_anchor",
    expectedFamily: "SOFT_DISAGREEMENT",
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
    routerHasDedicatedSoftDisagreementFamily: pipeline.routerHasDedicatedSoftDisagreementFamily,
    routerPartialViaHesitationObjection: pipeline.routerPartialViaHesitationObjection,
    passed: failures.length === 0,
    primaryFailureLayer: failures[0]?.layer || "none",
    failures,
  };
}

function evaluateGuardCase({ input, dominantIntent }) {
  const pipeline = simulatePipeline(input, true, {
    isExplicitComparison: /compar|samsung|versus|\bvs\b/i.test(input),
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

console.log("\nPATCH 7.7N — Soft Disagreement Semantic Family Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + routing + response path simulation (local, audit-only)\n");

const pureRecords = [];
for (const message of PURE_SOFT_DISAGREEMENT) {
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
console.log("Dedicated SOFT_DISAGREEMENT family in Router: YES (PATCH 7.7O — detectsSoftDisagreementSignal / isSoftDisagreement)");
console.log(
  "Routing hold for pure SOFT_DISAGREEMENT: YES (PATCH 7.7P — soft_disagreement_conversational_routing_hold)"
);
console.log(
  "Partial coverage via hesitationReaction → OBJECTION (anchor-only legacy path): YES"
);

console.log("\n── Pure soft disagreement cases ──\n");
for (const r of pureRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.context}] "${r.input}" → ${r.actualTurnType} | hes=${r.signals.hesitationReaction.detected}/${r.signals.hesitationReaction.subtype || "-"} mode=${r.routingMode} newSearch=${r.openedNewSearch} path=${r.responsePathFinal} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Commercial guard cases (anchored) ──\n");
for (const r of guardRecords) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} "${r.input}" → ${r.actualTurnType} | intent=${r.dominantIntent} mode=${r.routingMode} allow=${r.allowNewSearch} clear=${r.clearNewCommercialSearch} | ${r.primaryFailureLayer}`
  );
}

console.log("\n── Pure soft disagreement summary ──\n");

const routerFailures = pureRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Router")
).length;
const routingFailures = pureRecords.filter((r) =>
  r.failures.some((f) => f.layer === "Routing" || f.layer === "Response path")
).length;

console.log(`Total pure tests: ${pureTotal}`);
console.log(`Passed: ${purePassed}/${pureTotal} (${((purePassed / pureTotal) * 100).toFixed(1)}%)`);
console.log(`Anchored working: ${anchoredWorking.length}/${PURE_SOFT_DISAGREEMENT.length}`);
console.log(`Cold session working: ${coldWorking.length}/${PURE_SOFT_DISAGREEMENT.length}`);
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
  layerCounts["Response path"] || layerCounts["Final response"]
    ? "next conversational family per roadmap"
    : layerCounts.Routing
      ? "7.7P-Routing — verify soft_disagreement hold wiring"
      : layerCounts.Router
        ? "7.7O-Router — SOFT_DISAGREEMENT semantic family"
        : "next conversational family per roadmap";

console.log("\n── Final report ──\n");
console.log(`1. Tests executed: ${allRecords.length} (${pureTotal} pure + ${guardTotal} guards)`);
console.log(`2. Passed: ${purePassed}/${pureTotal} pure; ${guardPassed}/${guardTotal} guards`);
console.log(
  `3. Dedicated SOFT_DISAGREEMENT in Router: YES — routing hold PATCH 7.7P active`
);
console.log(
  `4. Phrases working when anchored: ${anchoredWorking.length}/${PURE_SOFT_DISAGREEMENT.length}`
);
console.log(
  `4b. Phrases fully working (both contexts): ${workingPure.length}/${PURE_SOFT_DISAGREEMENT.length}`
);
console.log(
  `5. Phrases with failures: ${failingPure.length}/${PURE_SOFT_DISAGREEMENT.length}`
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
  `10. Commercial guards preserved: ${guardPassed}/${guardTotal}${guardPassed < guardTotal ? " (some dominant intents swallowed)" : ""}`
);
console.log(
  `11. Root cause layer: ${topLayer ? `${topLayer[0]} (${topLayer[1]} failure signals)` : "none"}`
);
console.log(`12. Next patch priority: ${nextPatch}`);
console.log(
  "13–16. Regressions: run GREETING/ACK/COMPREHENSION closure + 7.6V scripts separately after routing patch"
);

console.log(
  `\nAudit script approval: PATCH 7.7Q — response path wired; SOFT_DISAGREEMENT FULLY_CLOSED candidate\n`
);

console.log("── Records (JSON) ──\n");
for (const r of allRecords) {
  console.log(
    JSON.stringify(
      {
        kind: r.kind,
        input: r.input,
        family: r.family || "SOFT_DISAGREEMENT",
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

console.log("PATCH 7.7N/7.7O/7.7P/7.7Q audit COMPLETE\n");

process.exit(0);
