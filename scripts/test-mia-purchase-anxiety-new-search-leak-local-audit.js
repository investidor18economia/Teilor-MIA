/**
 * PATCH 7.6V-I — Purchase Anxiety / New Search Leak Local Audit
 *
 * Separates router vs routing root cause for Purchase Anxiety family gaps.
 * PATCH 7.6V-L — "estou inseguro com essa compra" is concern; see stress-expectation audit.
 * Audit only — no production changes, no HTTP, no SerpAPI.
 *
 * Usage: node scripts/test-mia-purchase-anxiety-new-search-leak-local-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";

const SESSION = {
  lastBestProduct: {
    product_name: "Produto Recomendado Atual",
    price: "R$ 1.899",
  },
  lastRecommendation: {
    winner: "Produto Recomendado Atual",
  },
  lastProductMentioned: "Produto Recomendado Atual",
  lastProducts: [{ product_name: "Produto Recomendado Atual", price: "R$ 1.899" }],
  lastAxis: "equilibrio geral",
  lastMainConsequence: "desempenho solido para uso diario",
  lastTradeoff: "nao e o mais barato da lista",
};

const LEGACY_INTENT = "search";
const LEGACY_CONTEXT_ACTION = "search";

const FAMILY_EXPECTATIONS = {
  purchase_anxiety: {
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "purchase_anxiety",
  },
  concern: {
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "concern",
  },
  not_convinced: {
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
  },
};

/**
 * Semantic family assignment (evidence-based), independent of 7.6V-E stress label.
 */
const CASES = [
  {
    message: "nao quero fazer besteira",
    expectedFamily: "purchase_anxiety",
    stressAuditFamily: "purchase_anxiety",
    rationale: "medo explicito de errar a compra (besteira)",
  },
  {
    message: "tenho medo de me arrepender",
    expectedFamily: "purchase_anxiety",
    stressAuditFamily: "purchase_anxiety",
    rationale: "medo de arrependimento pos-compra",
  },
  {
    message: "e se eu me arrepender?",
    expectedFamily: "purchase_anxiety",
    stressAuditFamily: "purchase_anxiety",
    rationale: "condicional de arrependimento",
  },
  {
    message: "nao quero jogar dinheiro fora",
    expectedFamily: "purchase_anxiety",
    stressAuditFamily: "purchase_anxiety",
    rationale: "medo de desperdicar dinheiro",
  },
  {
    message: "estou receoso",
    expectedFamily: "purchase_anxiety",
    stressAuditFamily: "purchase_anxiety",
    rationale: "estado de receio sobre a decisao/compra atual",
  },
  {
    message: "e se eu errar?",
    expectedFamily: "purchase_anxiety",
    stressAuditFamily: "purchase_anxiety",
    rationale: "condicional de erro na compra",
  },
  {
    message: "nao quero tomar uma decisao ruim",
    expectedFamily: "purchase_anxiety",
    stressAuditFamily: "purchase_anxiety",
    rationale: "medo de tomar decisao ruim",
  },
  {
    message: "nao quero me frustrar depois",
    expectedFamily: "purchase_anxiety",
    stressAuditFamily: "purchase_anxiety",
    rationale: "medo de frustracao pos-compra",
  },
  {
    message: "tenho medo de escolher errado",
    expectedFamily: "purchase_anxiety",
    stressAuditFamily: "purchase_anxiety",
    rationale: "medo explicito de escolher errado",
  },
];

function extractActualSignal(cognitiveTurn) {
  const hr = cognitiveTurn?.signals?.hesitationReaction;
  if (hr?.detected) {
    return {
      turnType: cognitiveTurn.turnType,
      detector: "hesitationReaction",
      subtype: hr.subtype || "",
    };
  }
  return {
    turnType: cognitiveTurn?.turnType || "",
    detector: "",
    subtype: "",
  };
}

function simulateLocalRouting(message, cognitiveTurn) {
  const hasActiveAnchor = true;

  const bridgeAudit = buildCognitiveBridgeAudit(
    mapCognitiveTurnToLegacyIntent(cognitiveTurn),
    LEGACY_INTENT
  );

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

  const patch62WouldApply =
    cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION &&
    hasActiveAnchor &&
    !clearNewSearch;

  const contextResolution = {
    mode: "general_answer",
    shouldSkipProductSearch: false,
    directReply: null,
    clearContext: false,
  };

  if (clearNewSearch) {
    contextResolution.shouldSkipProductSearch = false;
    contextResolution.mode = "direct";
  } else if (patch62WouldApply) {
    contextResolution.shouldSkipProductSearch = true;
  }

  const finalIntent = bridgeAudit.active ? bridgeAudit.toIntent : LEGACY_INTENT;

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution,
    sessionContext: SESSION,
    incomingSessionContext: SESSION,
    intent: finalIntent,
    contextAction: LEGACY_CONTEXT_ACTION,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
    },
    signals: {
      hasClearNewCommercialSearch: clearNewSearch,
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

  const wouldTriggerNewSearchLocally =
    routingDecision.mode === "new_search" ||
    routingDecision.allowNewSearch === true;

  return {
    routingAvailable: true,
    clearNewSearch,
    patch62WouldApply,
    bridgeApplied: !!bridgeAudit.active,
    routingMode: routingDecision.mode || "",
    allowNewSearch: !!routingDecision.allowNewSearch,
    wouldTriggerNewSearchLocally,
    routingNote: clearNewSearch
      ? "resolveClearNewCommercialSearchForRouting=true (quero/search verb leak risk)"
      : patch62WouldApply
        ? "PATCH 6.2 would skip search for OBJECTION+anchor"
        : `mode=${routingDecision.mode}`,
  };
}

function matchesFamily(actual, familyKey) {
  const exp = FAMILY_EXPECTATIONS[familyKey];
  return (
    actual.turnType === exp.expectedTurnType &&
    actual.detector === exp.expectedDetector &&
    actual.subtype === exp.expectedSubtype
  );
}

function classifyFailure(record) {
  if (record.routerPassed && !record.wouldTriggerNewSearchLocally) {
    return { failureType: "NO_FAILURE", rootCauseLayer: "none" };
  }

  if (record.wouldTriggerNewSearchLocally) {
    const layer = record.routerPassed ? "routing" : "router+routing";
    let notes = record.notes;
    if (record.clearNewSearch && !record.routerPassed) {
      notes = `${notes}; clearNewSearch triggered by 'quero' substring — router UNKNOWN cascades to new_search`;
    }
    return {
      failureType: "ROUTING_NEW_SEARCH_RISK",
      rootCauseLayer: layer,
      notes,
    };
  }

  if (record.actualTurnType !== record.expectedTurnType || !record.actualDetector) {
    return {
      failureType: "ROUTER_FAILURE",
      rootCauseLayer: "router",
      notes: record.notes,
    };
  }

  if (record.actualSubtype !== record.expectedSubtype) {
    return {
      failureType: "ROUTER_SUBTYPE_MISMATCH",
      rootCauseLayer: "router",
      notes: `${record.notes}; got subtype=${record.actualSubtype || "(none)"}`,
    };
  }

  return { failureType: "NO_FAILURE", rootCauseLayer: "none" };
}

function auditCase(testCase) {
  const exp = FAMILY_EXPECTATIONS[testCase.expectedFamily];

  const cognitiveTurn = classifyMiaTurn({
    query: testCase.message,
    originalQuery: testCase.message,
    resolvedQuery: testCase.message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: LEGACY_INTENT,
    contextAction: LEGACY_CONTEXT_ACTION,
  });

  const actual = extractActualSignal(cognitiveTurn);
  const routing = simulateLocalRouting(testCase.message, cognitiveTurn);

  const routerPassed = matchesFamily(actual, testCase.expectedFamily);
  const stressFamilyMismatch =
    testCase.stressAuditFamily !== testCase.expectedFamily;

  let notes = testCase.rationale;
  if (stressFamilyMismatch) {
    notes += `; 7.6V-E stress audit assumed ${testCase.stressAuditFamily}`;
  }
  if (routing.routingNote) {
    notes += `; routing: ${routing.routingNote}`;
  }

  const record = {
    message: testCase.message,
    expectedFamily: testCase.expectedFamily,
    expectedTurnType: exp.expectedTurnType,
    actualTurnType: actual.turnType,
    expectedDetector: exp.expectedDetector,
    actualDetector: actual.detector,
    expectedSubtype: exp.expectedSubtype,
    actualSubtype: actual.subtype,
    routerPassed,
    wouldTriggerNewSearchLocally: routing.wouldTriggerNewSearchLocally,
    clearNewSearch: routing.clearNewSearch,
    routingMode: routing.routingMode,
    allowNewSearch: routing.allowNewSearch,
    bridgeApplied: routing.bridgeApplied,
    patch62WouldApply: routing.patch62WouldApply,
    stressAuditFamily: testCase.stressAuditFamily,
    semanticStressMismatch: stressFamilyMismatch,
    failureType: "",
    rootCauseLayer: "",
    notes,
  };

  const failure = classifyFailure(record);
  record.failureType = failure.failureType;
  record.rootCauseLayer = failure.rootCauseLayer;
  if (failure.notes) record.notes = failure.notes;

  if (
    record.failureType === "NO_FAILURE" &&
    record.semanticStressMismatch
  ) {
    record.failureType = "FAMILY_EXPECTATION_MISMATCH";
    record.rootCauseLayer = "audit_expectation";
    record.notes += "; router semantically OK — stress audit label was purchase_anxiety";
  }

  record.passed = record.failureType === "NO_FAILURE";

  return record;
}

console.log("\nPATCH 7.6V-I — Purchase Anxiety / New Search Leak Local Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + buildRoutingDecision (local)\n");

const records = CASES.map(auditCase);

let routerFailuresByType = 0;
let routerFailuresBySignal = 0;
let subtypeMismatches = 0;
let newSearchRisk = 0;
let familyMismatches = 0;
let passed = 0;

for (const r of records) {
  if (r.passed) passed++;
  if (r.failureType === "ROUTER_FAILURE") routerFailuresByType++;
  if (!r.routerPassed) routerFailuresBySignal++;
  if (r.failureType === "ROUTER_SUBTYPE_MISMATCH") subtypeMismatches++;
  if (r.failureType === "ROUTING_NEW_SEARCH_RISK") newSearchRisk++;
  if (r.failureType === "FAMILY_EXPECTATION_MISMATCH") familyMismatches++;

  console.log(
    `  ${r.passed ? "✓" : "✗"} "${r.message}" → ${r.actualTurnType}:${r.actualSubtype || "(none)"} | ${r.failureType}`
  );
}

console.log("\n── Summary ──\n");
console.log(`Total cases: ${records.length}`);
console.log(`Passed: ${passed}`);
console.log(`Router failures (signal): ${routerFailuresBySignal}`);
console.log(`Router failures (type ROUTER_FAILURE only): ${routerFailuresByType}`);
console.log(`Subtype mismatches: ${subtypeMismatches}`);
console.log(`New search risk: ${newSearchRisk}`);
console.log(`Family expectation mismatches: ${familyMismatches}`);

const routerOk = records.filter((r) => r.routerPassed).length;
console.log(`\nQuantos casos já classificam corretamente (semantic router)? ${routerOk}/${records.length}`);

console.log("\n── Diagnóstico obrigatório ──\n");

const routerFailMsgs = records
  .filter((r) => !r.routerPassed)
  .map((r) => `"${r.message}" (${r.actualTurnType}:${r.actualSubtype || "none"})`);
console.log(
  `Router failures (${routerFailuresBySignal}): ${routerFailMsgs.length ? routerFailMsgs.join(", ") : "(none)"}`
);

const subtypeMsgs = records
  .filter((r) => r.failureType === "ROUTER_SUBTYPE_MISMATCH")
  .map((r) => `"${r.message}" (got ${r.actualSubtype})`);
console.log(
  `Subtype mismatches (${subtypeMismatches}): ${subtypeMsgs.length ? subtypeMsgs.join(", ") : "(none)"}`
);

const searchMsgs = records
  .filter((r) => r.wouldTriggerNewSearchLocally)
  .map(
    (r) =>
      `"${r.message}" (mode=${r.routingMode}, clear=${r.clearNewSearch}, router=${r.actualTurnType})`
  );
console.log(
  `New search risk local (${newSearchRisk} classified, ${searchMsgs.length} total with allowNewSearch/new_search): ${searchMsgs.join("; ") || "(none)"}`
);

const truePA = records.filter((r) => r.expectedFamily === "purchase_anxiety");
const trueConcern = records.filter((r) => r.expectedFamily === "concern");
console.log(
  `\nFrases que pertencem a purchase_anxiety (${truePA.length}): ${truePA.map((r) => `"${r.message}"`).join(", ")}`
);
console.log(
  `Frases que deveriam ser concern/not_convinced: concern (${trueConcern.length}): ${trueConcern.map((r) => `"${r.message}"`).join(", ") || "(none)"}; not_convinced: (none)`
);

const nextPatchParts = [];
if (routerFailuresBySignal + subtypeMismatches > 0) {
  nextPatchParts.push("7.6V-J — expand purchase_anxiety in Router (estou receoso, errar, frustrar, escolher errado, decisao ruim)");
}
if (newSearchRisk > 0) {
  nextPatchParts.push("7.6V-K — Routing guard: exclude purchase_anxiety 'nao quero...' from clearNewCommercialSearch quero false-positive");
}
if (familyMismatches > 0) {
  nextPatchParts.push("7.6V-L — align stress audit expectations (estou inseguro com essa compra → concern, not purchase_anxiety)");
}
if (!nextPatchParts.length) {
  nextPatchParts.push("none — semantic router + local routing OK");
}

console.log(`\nRecommended next patch:\n${nextPatchParts.map((p) => `- ${p}`).join("\n")}`);

console.log("\n── Records (JSON) ──\n");
for (const r of records) {
  console.log(
    JSON.stringify(
      {
        message: r.message,
        expectedFamily: r.expectedFamily,
        expectedTurnType: r.expectedTurnType,
        actualTurnType: r.actualTurnType,
        expectedDetector: r.expectedDetector,
        actualDetector: r.actualDetector,
        expectedSubtype: r.expectedSubtype,
        actualSubtype: r.actualSubtype,
        routerPassed: r.routerPassed,
        wouldTriggerNewSearchLocally: r.wouldTriggerNewSearchLocally,
        failureType: r.failureType,
        rootCauseLayer: r.rootCauseLayer,
        notes: r.notes,
      },
      null,
      2
    )
  );
  console.log("");
}

const auditSuccess =
  records.length === CASES.length &&
  !records.some((r) => r.failureType === "LOCAL_ROUTING_SIMULATION_UNAVAILABLE");

console.log(`\nPATCH 7.6V-I audit ${auditSuccess ? "COMPLETE" : "INCOMPLETE"}\n`);

process.exit(auditSuccess ? 0 : 1);
