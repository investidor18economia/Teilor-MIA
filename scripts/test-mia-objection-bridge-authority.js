/**
 * PATCH 7.6S-B — OBJECTION Bridge Authority
 *
 * Valida que OBJECTION com âncora ativa recebe autoridade na Cognitive Bridge:
 *   bridgeApplied = true
 *   finalIntent     = decision
 *   contextAction   = decision (via guard quando legacy era search)
 *
 * Usage: node scripts/test-mia-objection-bridge-authority.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
  COGNITIVE_BRIDGE_ALLOWLIST,
  COGNITIVE_TO_LEGACY_INTENT_MAP,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";

const MOCK_WINNER = {
  product_name: "Produto Recomendado Atual",
  price: "R$ 1.899",
};

const SESSION_WITH_ANCHOR = {
  lastBestProduct: MOCK_WINNER,
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER],
  lastCategory: "eletronicos",
};

const LEGACY_INTENT = "search";
const LEGACY_CONTEXT_ACTION = "search";

const SCENARIOS = [
  { id: "O.1", query: "nao quero fazer besteira", family: "purchase_anxiety" },
  { id: "O.2", query: "nao sei se gostei", family: "not_convinced" },
  { id: "O.3", query: "algo me incomoda", family: "lack_confidence" },
  { id: "O.4", query: "tenho medo de me arrepender", family: "purchase_anxiety" },
  { id: "O.5", query: "qual seria seu medo nessa compra", family: "risk_probe" },
];

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed++;
    const msg = `  ✗ ${label}\n      → ${err.message}`;
    console.log(msg);
    failures.push(msg);
  }
}

function expect(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${label ? ` [${label}]` : ""}`);
  }
}

function simulateBridgePipeline(query) {
  const cognitiveTurn = classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: SESSION_WITH_ANCHOR,
    hasActiveAnchor: true,
    detectedIntent: LEGACY_INTENT,
    contextAction: LEGACY_CONTEXT_ACTION,
  });

  const bridgeResult = mapCognitiveTurnToLegacyIntent(cognitiveTurn);
  const bridgeAudit = buildCognitiveBridgeAudit(bridgeResult, LEGACY_INTENT);

  const guardResult = guardContextActionWithCognitiveBridge({
    contextAction: LEGACY_CONTEXT_ACTION,
    bridgeAudit,
    cognitiveTurnEarly: cognitiveTurn,
    finalIntent: bridgeAudit.active ? bridgeAudit.toIntent : LEGACY_INTENT,
  });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query,
    resolvedQuery: query,
    hasAnchor: true,
    looksLikeShortPriorityFollowUp: false,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => "",
    wantsNewProduct: () => false,
  });

  const routingDecision = buildRoutingDecision({
    userMessage: query,
    resolvedQuery: query,
    contextResolution: { mode: "general_answer", shouldSkipProductSearch: false },
    sessionContext: SESSION_WITH_ANCHOR,
    incomingSessionContext: SESSION_WITH_ANCHOR,
    intent: bridgeAudit.active ? bridgeAudit.toIntent : LEGACY_INTENT,
    contextAction: guardResult.contextAction,
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor: true,
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

console.log("\n── PATCH 7.6S-B — Mapa e allowlist ──────────────────────────────────────");

test("M.1 OBJECTION mapeado para decision", () => {
  expect(COGNITIVE_TO_LEGACY_INTENT_MAP.OBJECTION, "decision");
});

test("M.2 OBJECTION na COGNITIVE_BRIDGE_ALLOWLIST", () => {
  expect(COGNITIVE_BRIDGE_ALLOWLIST.has("OBJECTION"), true);
});

console.log("\n── PATCH 7.6S-B — Bridge authority (5 cenários audit) ───────────────────");

for (const s of SCENARIOS) {
  test(`${s.id} bridge: "${s.query}"`, () => {
    const r = simulateBridgePipeline(s.query);

    expect(r.cognitiveTurn.turnType, MIA_TURN_TYPES.OBJECTION, "turnType");
    expect(r.bridgeAudit.active, true, "bridgeApplied");
    expect(r.bridgeAudit.toIntent, "decision", "toIntent");
    expect(r.bridgeAudit.reason, "safe_cognitive_turn_authority", "bridgeReason");
    expect(r.guardResult.contextAction, "decision", "contextAction after guard");
    expect(r.guardResult.applied, true, "guard applied");
    expect(r.routingDecision.allowNewSearch, false, "allowNewSearch");
    expect(r.routingDecision.shouldPreserveAnchor, true, "shouldPreserveAnchor");
    expect(r.routingDecision.allowReplaceWinner, false, "allowReplaceWinner");
  });
}

console.log("\n── PATCH 7.6S-B — Regressão: turnTypes existentes na bridge ────────────");

test("R.1 PRIORITY_SHIFT ainda bridgeia para decision", () => {
  const r = mapCognitiveTurnToLegacyIntent({ turnType: "PRIORITY_SHIFT", confidence: 0.8 });
  expect(r.active, true);
  expect(r.intent, "decision");
});

test("R.2 EXPLANATION_REQUEST ainda bridgeia para decision", () => {
  const r = mapCognitiveTurnToLegacyIntent({ turnType: "EXPLANATION_REQUEST", confidence: 0.83 });
  expect(r.active, true);
  expect(r.intent, "decision");
});

test("R.3 CONVERSATIONAL continua fora da allowlist", () => {
  const r = mapCognitiveTurnToLegacyIntent({ turnType: "CONVERSATIONAL", confidence: 0.9 });
  expect(r.active, false);
  expect(r.reason, "turn_type_not_in_allowlist");
});

console.log("\n── PATCH 7.6S-B — Resumo ───────────────────────────────────────────────");
console.log(`  Total : ${passed + failed}`);
console.log(`  Passou: ${passed}`);
console.log(`  Falhou: ${failed}`);

if (failures.length) {
  console.log("\n── Falhas ─────────────────────────────────────────────────────────────");
  failures.forEach((f) => console.log(f));
  process.exit(1);
}

console.log("\n  ✓ PATCH 7.6S-B — OBJECTION Bridge Authority — todos os testes passaram.\n");
process.exit(0);
