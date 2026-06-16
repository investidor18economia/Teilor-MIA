/**
 * PATCH 7.6V-M — V-Series Local Closure Audit
 *
 * Consolidates local validation for the 7.6V cognitive family block before 7.7A.
 * Audit only — no production changes, no HTTP, no SerpAPI.
 *
 * Usage: node scripts/test-mia-v-series-local-closure-audit.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import {
  mapCognitiveTurnToLegacyIntent,
  buildCognitiveBridgeAudit,
  guardContextActionWithCognitiveBridge,
} from "../lib/miaCognitiveBridge.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import {
  resolveClearNewCommercialSearchForRouting,
  isNegativeNonCommercialDesire,
} from "../lib/miaRoutingSafety.js";

const MOCK_WINNER = {
  product_name: "Produto Recomendado Atual",
  price: "R$ 1.899",
};

const SESSION = {
  lastBestProduct: MOCK_WINNER,
  lastRecommendation: { winner: MOCK_WINNER.product_name },
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER],
  lastAxis: "equilibrio geral",
  lastMainConsequence: "desempenho solido para uso diario",
  lastTradeoff: "nao e o mais barato da lista",
};

const LEGACY_INTENT = "search";
const LEGACY_CONTEXT_ACTION = "search";

const APPROVAL = {
  minPassRate: 0.9,
  maxAnchoredNewSearchLeaks: 0,
  maxAnchorLoss: 0,
  maxGraveMismatch: 0,
};

function resolveContextModeSelected({
  cognitiveTurnType,
  contextAction,
  hasAnchorForRouting,
}) {
  const isObjectionWithAnchor =
    cognitiveTurnType === MIA_TURN_TYPES.OBJECTION && hasAnchorForRouting;
  const isPriorityShiftWithAnchor =
    cognitiveTurnType === MIA_TURN_TYPES.PRIORITY_SHIFT && hasAnchorForRouting;

  if (contextAction === "analysis") return "analysis";
  if (isObjectionWithAnchor) return "objection_response_contract";
  if (isPriorityShiftWithAnchor) return "priority_shift_response_contract";
  if (
    cognitiveTurnType === MIA_TURN_TYPES.EXPLANATION_REQUEST &&
    hasAnchorForRouting
  ) {
    return "explanation_anchored";
  }
  return "decision_generic";
}

function extractRouterSignal(cognitiveTurn, expectedDetector) {
  if (expectedDetector === "hesitationReaction") {
    const hr = cognitiveTurn?.signals?.hesitationReaction;
    if (hr?.detected) {
      return {
        turnType: cognitiveTurn.turnType,
        detector: "hesitationReaction",
        subtype: hr.subtype || "",
      };
    }
  }
  if (expectedDetector === "projectiveRisk") {
    const pr = cognitiveTurn?.signals?.projectiveRisk;
    if (pr?.detected) {
      return {
        turnType: cognitiveTurn.turnType,
        detector: "projectiveRisk",
        subtype: pr.subtype || "",
      };
    }
  }
  if (expectedDetector === "delegationRequest") {
    const dr = cognitiveTurn?.signals?.delegationRequest;
    if (dr?.detected) {
      return {
        turnType: cognitiveTurn.turnType,
        detector: "delegationRequest",
        subtype: dr.subtype || "",
      };
    }
  }
  return {
    turnType: cognitiveTurn?.turnType || "",
    detector: "",
    subtype: "",
  };
}

function simulatePipeline(message) {
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: SESSION,
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

  const patch62WouldApply =
    cognitiveTurn.turnType === MIA_TURN_TYPES.OBJECTION && !clearNewSearch;

  const contextResolution = {
    mode: clearNewSearch ? "direct" : "general_answer",
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
      isComparisonContextFollowUp: false,
      isComparisonFollowUpLocked: false,
      wantsNew: false,
    },
  });

  const openedNewSearch =
    routingDecision.mode === "new_search" ||
    routingDecision.allowNewSearch === true;

  const contextMode = resolveContextModeSelected({
    cognitiveTurnType: cognitiveTurn.turnType,
    contextAction: guardResult.contextAction,
    hasAnchorForRouting: true,
  });

  return {
    cognitiveTurn,
    bridgeAudit,
    guardResult,
    clearNewSearch,
    routingDecision,
    openedNewSearch,
    contextMode,
    negativeDesireGuard: isNegativeNonCommercialDesire(message),
  };
}

function caseSpec({
  id,
  block,
  message,
  expectedTurnType,
  expectedDetector = "",
  expectedSubtype = "",
  requireBridge = false,
  requireNoNewSearch = true,
  requirePreserveAnchor = true,
  requireNegativeDesireGuard = false,
  requireCommercialSearchAllowed = false,
  expectedVerbalizer = null,
  skipRouter = false,
  grave = true,
}) {
  return {
    id,
    block,
    message,
    expectedTurnType,
    expectedDetector,
    expectedSubtype,
    requireBridge,
    requireNoNewSearch,
    requirePreserveAnchor,
    requireNegativeDesireGuard,
    requireCommercialSearchAllowed,
    expectedVerbalizer,
    skipRouter,
    grave,
  };
}

const CASES = [
  // ── Concern (7.6V-F) ───────────────────────────────────────────────────────
  ...[
    "isso me preocupa",
    "isso me deixa preocupado",
    "isso me deixa com receio",
    "fico com um pe atras",
    "isso me deixa inseguro",
    "estou inseguro com essa compra",
    "isso me da um receio",
    "tenho uma preocupacao com isso",
    "isso me incomoda um pouco",
    "isso me deixa desconfortavel",
    "nao estou totalmente tranquilo com isso",
  ].map((message, i) =>
    caseSpec({
      id: `concern.${i + 1}`,
      block: "concern",
      message,
      expectedTurnType: "OBJECTION",
      expectedDetector: "hesitationReaction",
      expectedSubtype: "concern",
      requireBridge: true,
      expectedVerbalizer: "objection_response_contract",
    })
  ),

  // ── Best Choice Hesitation (7.6V-G) ────────────────────────────────────────
  ...[
    "nao sei se e a melhor escolha",
    "nao sei se essa e a melhor escolha",
    "sera que e a melhor escolha?",
    "sera que essa escolha faz sentido?",
    "nao sei se essa decisao e boa",
    "nao estou totalmente convencido",
    "nao tenho certeza dessa escolha",
    "essa escolha me deixa em duvida",
    "sera que vale mesmo?",
    "nao sei se iria por esse caminho",
  ].map((message, i) =>
    caseSpec({
      id: `best_choice.${i + 1}`,
      block: "best_choice",
      message,
      expectedTurnType: "OBJECTION",
      expectedDetector: "hesitationReaction",
      expectedSubtype: "not_convinced",
      requireBridge: true,
      expectedVerbalizer: "objection_response_contract",
    })
  ),

  // ── Projective Risk (7.6V-H) ───────────────────────────────────────────────
  ...[
    "qual a pegadinha?",
    "tem algum porem?",
    "tem algo que eu nao estou vendo?",
    "onde eu posso me arrepender?",
    "qual o lado ruim?",
    "o que pode me incomodar depois?",
    "tem alguma surpresa ruim?",
    "qual o risco escondido?",
    "qual a parte chata?",
    "o que costuma decepcionar?",
  ].map((message, i) =>
    caseSpec({
      id: `projective_risk.${i + 1}`,
      block: "projective_risk",
      message,
      expectedTurnType: "OBJECTION",
      expectedDetector: "projectiveRisk",
      expectedSubtype: "risk_probe",
      requireBridge: true,
      expectedVerbalizer: "objection_response_contract",
    })
  ),

  // ── Purchase Anxiety (7.6V-J + 7.6V-K) ─────────────────────────────────────
  ...[
    "nao quero fazer besteira",
    "tenho medo de me arrepender",
    "e se eu me arrepender?",
    "nao quero jogar dinheiro fora",
    "estou receoso",
    "e se eu errar?",
    "nao quero tomar uma decisao ruim",
    "nao quero me frustrar depois",
    "tenho medo de escolher errado",
  ].map((message, i) =>
    caseSpec({
      id: `purchase_anxiety.${i + 1}`,
      block: "purchase_anxiety",
      message,
      expectedTurnType: "OBJECTION",
      expectedDetector: "hesitationReaction",
      expectedSubtype: "purchase_anxiety",
      requireBridge: true,
      requireNegativeDesireGuard: message.startsWith("nao quero"),
      expectedVerbalizer: "objection_response_contract",
    })
  ),

  // ── Priority Shift (7.6V residual + stress) ──────────────────────────────
  ...[
    "qual me deixa mais tranquilo?",
    "qual me deixa mais sossegado?",
    "qual eu compro mais sossegado?",
    "qual eu teria menos chance de me arrepender?",
    "qual envelhece melhor?",
    "qual fica bom por mais tempo?",
    "qual aguenta melhor os proximos anos?",
    "qual segura melhor no longo prazo?",
    "qual tem mais vida util?",
    "qual me da mais paz de espirito?",
  ].map((message, i) =>
    caseSpec({
      id: `priority_shift.${i + 1}`,
      block: "priority_shift",
      message,
      expectedTurnType: "PRIORITY_SHIFT",
      requireBridge: true,
      expectedVerbalizer: "priority_shift_response_contract",
    })
  ),

  // ── Delegation router (7.6V stress subset) ─────────────────────────────────
  ...[
    "o que voce faria?",
    "e se fosse voce?",
    "qual seria sua escolha?",
    "qual voce manteria?",
    "qual seria sua decisao?",
  ].map((message, i) =>
    caseSpec({
      id: `delegation.router.${i + 1}`,
      block: "delegation",
      message,
      expectedTurnType: "EXPLANATION_REQUEST",
      expectedDetector: "delegationRequest",
      expectedSubtype: "decision_delegation",
      requireBridge: true,
      expectedVerbalizer: "explanation_anchored",
    })
  ),

  // ── Delegation routing guard (7.6U-G) ──────────────────────────────────────
  ...["escolhe um pra mim", "decide pra mim", "me fala um so"].map((message, i) =>
    caseSpec({
      id: `delegation.routing.${i + 1}`,
      block: "delegation",
      message,
      expectedTurnType: "EXPLANATION_REQUEST",
      skipRouter: true,
      requireNoNewSearch: true,
      requirePreserveAnchor: true,
      grave: true,
    })
  ),

  // ── Objection bridge authority (7.6S-B) ────────────────────────────────────
  ...[
    { message: "nao quero fazer besteira", subtype: "purchase_anxiety" },
    { message: "nao sei se gostei", subtype: "not_convinced" },
    { message: "algo me incomoda", subtype: "not_sure" },
    { message: "tenho medo de me arrepender", subtype: "purchase_anxiety" },
    { message: "qual seria seu medo nessa compra", detector: "projectiveRisk", subtype: "risk_probe" },
  ].map((item, i) =>
    caseSpec({
      id: `objection_bridge.${i + 1}`,
      block: "objection_bridge",
      message: item.message,
      expectedTurnType: "OBJECTION",
      expectedDetector: item.detector || "hesitationReaction",
      expectedSubtype: item.subtype,
      requireBridge: true,
      expectedVerbalizer: "objection_response_contract",
    })
  ),

  // ── Negative desire routing guard (7.6V-K) ─────────────────────────────────
  ...[
    "nao quero errar nessa compra",
    "nao quero me arrepender",
    "nao quero gastar errado",
    "nao quero quebrar a cara depois",
  ].map((message, i) =>
    caseSpec({
      id: `new_search_guard.block.${i + 1}`,
      block: "new_search_guard",
      message,
      expectedTurnType: "OBJECTION",
      expectedDetector: "hesitationReaction",
      expectedSubtype: "purchase_anxiety",
      requireBridge: true,
      requireNegativeDesireGuard: true,
      expectedVerbalizer: "objection_response_contract",
    })
  ),

  // ── Commercial redirect must NOT be blocked (7.6V-K negative) ──────────────
  ...[
    "nao quero esse, procura outro",
    "nao quero iPhone, quero Samsung",
    "nao quero gastar mais de 2000",
  ].map((message, i) =>
    caseSpec({
      id: `new_search_guard.allow.${i + 1}`,
      block: "new_search_guard",
      message,
      skipRouter: true,
      requireNoNewSearch: false,
      requirePreserveAnchor: false,
      requireCommercialSearchAllowed: true,
      grave: false,
    })
  ),
];

function evaluateCase(spec) {
  const pipeline = simulatePipeline(spec.message);
  const signal = extractRouterSignal(pipeline.cognitiveTurn, spec.expectedDetector);
  const failures = [];

  if (!spec.skipRouter) {
    if (signal.turnType !== spec.expectedTurnType) {
      failures.push({
        layer: "Router",
        detail: `turnType expected ${spec.expectedTurnType}, got ${signal.turnType}`,
      });
    }
    if (spec.expectedDetector && signal.detector !== spec.expectedDetector) {
      failures.push({
        layer: "Router",
        detail: `detector expected ${spec.expectedDetector}, got ${signal.detector || "(none)"}`,
      });
    }
    if (spec.expectedSubtype && signal.subtype !== spec.expectedSubtype) {
      failures.push({
        layer: "Router",
        detail: `subtype expected ${spec.expectedSubtype}, got ${signal.subtype || "(none)"}`,
      });
    }
  }

  if (spec.requireBridge && !pipeline.bridgeAudit.active) {
    failures.push({
      layer: "Contract",
      detail: "bridge not applied",
    });
  }

  if (spec.requireBridge) {
    const antiRegretContract =
      pipeline.cognitiveTurn.signals?.isAntiRegret === true;
    const expectedContextAction = antiRegretContract ? "anti_regret" : "decision";
    if (pipeline.guardResult.contextAction !== expectedContextAction) {
      failures.push({
        layer: "Contract",
        detail: `contextAction expected ${expectedContextAction}, got ${pipeline.guardResult.contextAction}`,
      });
    }
    if (antiRegretContract && pipeline.bridgeAudit.toIntent !== "anti_regret") {
      failures.push({
        layer: "Contract",
        detail: `bridge intent expected anti_regret, got ${pipeline.bridgeAudit.toIntent || "(none)"}`,
      });
    }
  }

  if (spec.requireNoNewSearch && pipeline.openedNewSearch) {
    failures.push({
      layer: pipeline.negativeDesireGuard ? "New search guard" : "Routing",
      detail: `openedNewSearch mode=${pipeline.routingDecision.mode} clear=${pipeline.clearNewSearch}`,
    });
  }

  if (spec.requirePreserveAnchor) {
    if (!pipeline.routingDecision.shouldPreserveAnchor) {
      failures.push({
        layer: "Anchor preservation",
        detail: "shouldPreserveAnchor=false",
      });
    }
    if (pipeline.routingDecision.allowReplaceWinner) {
      failures.push({
        layer: "Anchor preservation",
        detail: "allowReplaceWinner=true",
      });
    }
    if (pipeline.routingDecision.anchorProduct?.product_name !== MOCK_WINNER.product_name) {
      failures.push({
        layer: "Anchor preservation",
        detail: "anchorProduct lost in routing decision",
      });
    }
  }

  if (spec.requireNegativeDesireGuard && !pipeline.negativeDesireGuard) {
    failures.push({
      layer: "New search guard",
      detail: "isNegativeNonCommercialDesire=false",
    });
  }

  if (spec.requireCommercialSearchAllowed) {
    if (pipeline.negativeDesireGuard) {
      failures.push({
        layer: "New search guard",
        detail: "commercial redirect incorrectly blocked by negative desire guard",
      });
    }
    if (!pipeline.clearNewSearch && pipeline.routingDecision.mode === "context_decision") {
      failures.push({
        layer: "Routing",
        detail: "commercial redirect did not reach clearNewCommercialSearch",
        grave: false,
      });
    }
  }

  if (
    spec.expectedVerbalizer &&
    pipeline.contextMode !== spec.expectedVerbalizer
  ) {
    failures.push({
      layer: "Verbalizer",
      detail: `expected ${spec.expectedVerbalizer}, got ${pipeline.contextMode}`,
      grave: false,
    });
  }

  const graveFailures = failures.filter(
    (f) => f.grave !== false && (spec.grave !== false || f.layer !== "Verbalizer")
  );

  return {
    ...spec,
    actualTurnType: signal.turnType,
    actualDetector: signal.detector,
    actualSubtype: signal.subtype,
    routingMode: pipeline.routingDecision.mode,
    clearNewCommercialSearch: pipeline.clearNewSearch,
    openedNewSearch: pipeline.openedNewSearch,
    shouldPreserveAnchor: pipeline.routingDecision.shouldPreserveAnchor,
    bridgeApplied: pipeline.bridgeAudit.active,
    contextMode: pipeline.contextMode,
    passed: failures.length === 0,
    gravePassed: graveFailures.length === 0,
    failures,
    primaryFailureLayer: failures[0]?.layer || "none",
  };
}

console.log("\nPATCH 7.6V-M — V-Series Local Closure Audit\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false");
console.log("Mode: classifyMiaTurn + bridge + routing + verbalizer expectation (local)\n");

const results = CASES.map(evaluateCase);
const passed = results.filter((r) => r.passed).length;
const gravePassed = results.filter((r) => r.gravePassed).length;
const total = results.length;
const passRate = passed / total;

const anchoredNoSearchCases = results.filter((r) => r.requireNoNewSearch);
const newSearchLeaks = anchoredNoSearchCases.filter((r) => r.openedNewSearch);
const anchorLosses = results.filter(
  (r) =>
    r.requirePreserveAnchor &&
    (!r.shouldPreserveAnchor || r.failures.some((f) => f.layer === "Anchor preservation"))
);
const graveMismatches = results.filter((r) => !r.gravePassed);

const blockStats = {};
for (const r of results) {
  if (!blockStats[r.block]) {
    blockStats[r.block] = { total: 0, passed: 0, failed: [] };
  }
  blockStats[r.block].total++;
  if (r.passed) blockStats[r.block].passed++;
  else blockStats[r.block].failed.push(r);
}

console.log("── Per-case ──\n");
for (const r of results) {
  console.log(
    `  ${r.passed ? "✓" : "✗"} [${r.block}] "${r.message}" → ${r.actualTurnType}:${r.actualSubtype || "(none)"} | ${r.routingMode}${r.failures.length ? ` | ${r.primaryFailureLayer}` : ""}`
  );
}

console.log("\n── Block summary ──\n");
for (const [block, stats] of Object.entries(blockStats)) {
  const rate = ((stats.passed / stats.total) * 100).toFixed(0);
  console.log(`  ${block}: ${stats.passed}/${stats.total} (${rate}%)`);
}

console.log("\n── Closure criteria ──\n");
console.log(`Total tests: ${total}`);
console.log(`Passed: ${passed}/${total} (${(passRate * 100).toFixed(1)}%)`);
console.log(`Grave passed: ${gravePassed}/${total}`);
console.log(`Anchored new_search leaks: ${newSearchLeaks.length}`);
console.log(`Anchor/winner losses: ${anchorLosses.length}`);
console.log(`Grave intent/behavior mismatches: ${graveMismatches.length}`);
console.log(`Min pass rate required: ${(APPROVAL.minPassRate * 100).toFixed(0)}%`);

const criteriaOk =
  passRate >= APPROVAL.minPassRate &&
  newSearchLeaks.length <= APPROVAL.maxAnchoredNewSearchLeaks &&
  anchorLosses.length <= APPROVAL.maxAnchorLoss &&
  graveMismatches.length <= APPROVAL.maxGraveMismatch;

const blocksPassed = Object.entries(blockStats)
  .filter(([, s]) => s.passed === s.total)
  .map(([b]) => b);
const blocksFailed = Object.entries(blockStats)
  .filter(([, s]) => s.passed < s.total)
  .map(([b, s]) => `${b} (${s.passed}/${s.total})`);

console.log("\n── Final report ──\n");
console.log(`1. Overall result: ${criteriaOk ? "APPROVED for 7.6V closure" : "NOT APPROVED — gaps remain"}`);
console.log(`2. Tests passed: ${passed}/${total}`);
console.log(`3. Families/blocks fully passed: ${blocksPassed.join(", ") || "(none)"}`);
console.log(
  `4. Families/blocks with failures: ${blocksFailed.join(", ") || "(none)"}`
);
console.log(
  `5. New_search leak in anchored phrases: ${newSearchLeaks.length === 0 ? "NO" : `YES (${newSearchLeaks.length})`}`
);
console.log(
  `6. Winner/anchor preserved: ${anchorLosses.length === 0 ? "YES" : `NO (${anchorLosses.length} cases)`}`
);
console.log(
  `7. Block 7.6V can close: ${criteriaOk ? "YES" : "NO — fix reported gaps first"}`
);
console.log(
  `8. Next step: ${criteriaOk ? "7.7A — Greeting" : "Point fix in failing layer(s), then re-run this audit"}`
);

if (graveMismatches.length) {
  console.log("\n── Grave failures by layer ──\n");
  const byLayer = {};
  for (const r of graveMismatches) {
    for (const f of r.failures.filter((x) => x.grave !== false)) {
      byLayer[f.layer] = byLayer[f.layer] || [];
      byLayer[f.layer].push(`"${r.message}" (${f.detail})`);
    }
  }
  for (const [layer, items] of Object.entries(byLayer)) {
    console.log(`  ${layer}:`);
    for (const item of items) console.log(`    - ${item}`);
  }
}

console.log("\n── Records (JSON sample: failures only) ──\n");
for (const r of results.filter((x) => !x.passed)) {
  console.log(
    JSON.stringify(
      {
        id: r.id,
        block: r.block,
        message: r.message,
        expectedTurnType: r.expectedTurnType,
        actualTurnType: r.actualTurnType,
        expectedDetector: r.expectedDetector,
        actualDetector: r.actualDetector,
        expectedSubtype: r.expectedSubtype,
        actualSubtype: r.actualSubtype,
        passed: r.passed,
        primaryFailureLayer: r.primaryFailureLayer,
        failures: r.failures,
      },
      null,
      2
    )
  );
  console.log("");
}

console.log(`PATCH 7.6V-M audit ${criteriaOk ? "COMPLETE — CLOSURE OK" : "COMPLETE — CLOSURE BLOCKED"}\n`);

process.exit(criteriaOk ? 0 : 1);
