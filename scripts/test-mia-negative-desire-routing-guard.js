/**
 * PATCH 7.6V-K — Non-Commercial Negative Desire Routing Guard
 *
 * Local validation for emotional "nao quero..." not opening clearNewCommercialSearch.
 *
 * Usage: node scripts/test-mia-negative-desire-routing-guard.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import {
  resolveClearNewCommercialSearchForRouting,
  isNegativeNonCommercialDesire,
} from "../lib/miaRoutingSafety.js";

const SESSION = {
  lastBestProduct: {
    product_name: "Produto Recomendado Atual",
    price: "R$ 1.899",
  },
  lastRecommendation: { winner: "Produto Recomendado Atual" },
  lastProductMentioned: "Produto Recomendado Atual",
  lastProducts: [{ product_name: "Produto Recomendado Atual", price: "R$ 1.899" }],
};

const LEGACY_INTENT = "search";
const LEGACY_CONTEXT_ACTION = "search";

const BLOCK_CASES = [
  "nao quero fazer besteira",
  "nao quero jogar dinheiro fora",
  "nao quero tomar uma decisao ruim",
  "nao quero me frustrar depois",
  "nao quero escolher errado",
  "nao quero errar nessa compra",
  "nao quero me arrepender",
  "nao quero gastar errado",
  "nao quero quebrar a cara depois",
];

const ALLOW_CASES = [
  "nao quero esse, procura outro",
  "nao quero esse produto",
  "nao quero iPhone, quero Samsung",
  "nao quero celular, quero notebook",
  "nao quero gastar mais de 2000",
  "nao quero usado, quero novo",
  "nao quero opcao cara, quero barata",
];

function simulateRouting(message) {
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: LEGACY_INTENT,
    contextAction: LEGACY_CONTEXT_ACTION,
  });

  const clearNewCommercialSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: true,
    looksLikeShortPriorityFollowUp: false,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const bridgeAudit = buildCognitiveBridgeAudit(
    mapCognitiveTurnToLegacyIntent(cognitiveTurn),
    LEGACY_INTENT
  );

  const patch62WouldApply =
    cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION && !clearNewCommercialSearch;

  const contextResolution = {
    mode: clearNewCommercialSearch ? "direct" : "general_answer",
    shouldSkipProductSearch: patch62WouldApply,
    directReply: null,
    clearContext: false,
  };

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution,
    sessionContext: SESSION,
    incomingSessionContext: SESSION,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : LEGACY_INTENT,
    contextAction: LEGACY_CONTEXT_ACTION,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor: true,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewCommercialSearch,
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      isComparisonContextFollowUp: false,
      isComparisonFollowUpLocked: false,
      wantsNew: false,
    },
  });

  const openedNewSearch =
    routingDecision.mode === "new_search" || routingDecision.allowNewSearch === true;

  return {
    clearNewCommercialSearch,
    openedNewSearch,
    guardActive: isNegativeNonCommercialDesire(message),
    routingMode: routingDecision.mode || "",
  };
}

console.log("\nPATCH 7.6V-K — Non-Commercial Negative Desire Routing Guard\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false\n");

let passed = 0;
let failed = 0;
const records = [];

console.log("── Block new_search (emotional nao quero) ──\n");

for (const message of BLOCK_CASES) {
  const result = simulateRouting(message);
  const ok =
    result.clearNewCommercialSearch === false &&
    result.openedNewSearch === false &&
    result.guardActive === true;

  const record = {
    message,
    clearNewCommercialSearch: result.clearNewCommercialSearch,
    openedNewSearch: result.openedNewSearch,
    guardActive: result.guardActive,
    routingMode: result.routingMode,
    passed: ok,
  };
  records.push(record);

  if (ok) passed++;
  else failed++;

  console.log(
    `  ${ok ? "✓" : "✗"} "${message}" → clear=${result.clearNewCommercialSearch}, newSearch=${result.openedNewSearch}, guard=${result.guardActive}`
  );
}

console.log("\n── Allow commercial redirect (guard must not block) ──\n");

for (const message of ALLOW_CASES) {
  const guardActive = isNegativeNonCommercialDesire(message);
  const clearNewCommercialSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor: true,
    looksLikeShortPriorityFollowUp: false,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const ok = guardActive === false;

  if (ok) passed++;
  else failed++;

  console.log(
    `  ${ok ? "✓" : "✗"} "${message}" → guardActive=${guardActive}, clear=${clearNewCommercialSearch}`
  );
}

console.log("\n── Summary ──\n");
console.log(`Block cases: ${records.filter((r) => r.passed).length}/${BLOCK_CASES.length}`);
console.log(`Total passed: ${passed}/${BLOCK_CASES.length + ALLOW_CASES.length}`);
console.log(`\nPATCH 7.6V-K ${failed === 0 ? "PASSED" : "FAILED"}\n`);

console.log("── Records (JSON) ──\n");
for (const record of records) {
  console.log(JSON.stringify(record, null, 2));
  console.log("");
}

process.exit(failed === 0 ? 0 : 1);
