/**
 * PATCH 7.9X-E.3 — CONFIDENCE_CHALLENGE Routing Safety Hold Authority
 *
 * Validates clearNewCommercialSearch guard for CC sustain semantics vs commercial "recomenda".
 *
 * Usage: node scripts/test-mia-confidence-challenge-routing-safety-hold.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";

const MOCK_WINNER = { product_name: "Produto Recomendado Atual" };
const SESSION_WITH_ANCHOR = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
  lastProducts: [MOCK_WINNER],
};

const CC_RECOMENDA = [
  "ainda recomenda esse?",
  "você ainda recomenda?",
  "continua recomendando ele?",
  "ainda recomenda essa escolha?",
  "mantém essa recomendação?",
  "você manteria essa recomendação?",
];

const CC_OTHER = [
  "você tem certeza?",
  "continua achando isso?",
  "ainda sustenta essa escolha?",
  "dá pra confiar nessa escolha?",
  "você compraria mesmo?",
];

const COMMERCIAL = [
  "me recomenda um produto",
  "recomenda um notebook",
  "recomenda uma TV",
  "recomenda algo barato",
  "recomenda um modelo para jogar",
  "quero que você recomende algo",
  "me indica um produto",
];

function simulateRouting(message, hasAnchor) {
  const sessionContext = hasAnchor ? SESSION_WITH_ANCHOR : {};
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext,
    hasActiveAnchor: hasAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query: message,
    resolvedQuery: message,
    hasAnchor,
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
      directReply: "welcome",
      clearContext: !hasAnchor,
    },
    sessionContext,
    incomingSessionContext: sessionContext,
    intent: "search",
    contextAction: "search",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor: hasAnchor,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
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

  const ccHold =
    routingDecision.conversationAct === "confidence_challenge" ||
    routingDecision.responsePathHint === "confidence_challenge_reply" ||
    routingDecision.responsePathHint === "confidence_challenge_anchored";

  return {
    clearNewSearch,
    ccHold,
    conversationAct: routingDecision.conversationAct,
    responsePathHint: routingDecision.responsePathHint,
    isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
    turnType: cognitiveTurn.turnType,
  };
}

function evaluateCcRecomendaSafety(input, hasAnchor) {
  const r = simulateRouting(input, hasAnchor);
  const failures = [];
  if (r.clearNewSearch) {
    failures.push("clearNewCommercialSearch should be false (routing safety)");
  }
  if (r.isConfidenceChallenge && !r.ccHold) {
    failures.push(
      `routing hold missing (act=${r.conversationAct}, hint=${r.responsePathHint})`
    );
  }
  return { input, hasAnchor, ...r, passed: failures.length === 0, failures };
}

function evaluateCcCase(input, hasAnchor) {
  const r = simulateRouting(input, hasAnchor);
  const failures = [];
  if (r.clearNewSearch) failures.push("clearNewCommercialSearch should be false");
  if (!r.isConfidenceChallenge) failures.push("router: isConfidenceChallenge missing");
  if (!r.ccHold) {
    failures.push(
      `routing hold missing (act=${r.conversationAct}, hint=${r.responsePathHint})`
    );
  }
  return { input, hasAnchor, ...r, passed: failures.length === 0, failures };
}

function evaluateCommercialCase(input) {
  const r = simulateRouting(input, false);
  const failures = [];
  if (!r.clearNewSearch) failures.push("clearNewCommercialSearch should be true");
  if (r.conversationAct === "confidence_challenge") {
    failures.push("must not route as confidence_challenge");
  }
  return { input, ...r, passed: failures.length === 0, failures };
}

console.log("\nPATCH 7.9X-E.3 — CONFIDENCE_CHALLENGE Routing Safety Hold\n");

let failed = 0;

console.log("── Grupo A — CC com recomenda (routing safety + hold when router CC) ──\n");
for (const input of CC_RECOMENDA) {
  const r = evaluateCcRecomendaSafety(input, true);
  console.log(
    `  ${r.passed ? "✓" : "✗"} "${input}" clear=${r.clearNewSearch} act=${r.conversationAct}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
  if (!r.passed) failed++;
}

console.log("\n── Grupo B — CC sem recomenda (anchored) ──\n");
for (const input of CC_OTHER) {
  const r = evaluateCcCase(input, true);
  console.log(
    `  ${r.passed ? "✓" : "✗"} "${input}" clear=${r.clearNewSearch} act=${r.conversationAct}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
  if (!r.passed) failed++;
}

console.log("\n── Grupo C — busca comercial real (cold) ──\n");
for (const input of COMMERCIAL) {
  const r = evaluateCommercialCase(input);
  console.log(
    `  ${r.passed ? "✓" : "✗"} "${input}" clear=${r.clearNewSearch}${r.failures.length ? ` | ${r.failures.join("; ")}` : ""}`
  );
  if (!r.passed) failed++;
}

console.log("\n── Grupo D — CC cold anchor case ──\n");
const coldAnchor = evaluateCcRecomendaSafety("ainda recomenda esse?", false);
console.log(
  `  ${coldAnchor.passed ? "✓" : "✗"} [cold] "ainda recomenda esse?" clear=${coldAnchor.clearNewSearch} act=${coldAnchor.conversationAct}${coldAnchor.failures.length ? ` | ${coldAnchor.failures.join("; ")}` : ""}`
);
if (!coldAnchor.passed) failed++;

const total = CC_RECOMENDA.length + CC_OTHER.length + COMMERCIAL.length + 1;
const passed = total - failed;

console.log(`\nResult: ${passed}/${total} passed\n`);

if (failed > 0) {
  console.log("PATCH 7.9X-E.3 routing safety hold: FAIL\n");
  process.exit(1);
}

console.log("PATCH 7.9X-E.3 routing safety hold: PASS\n");
