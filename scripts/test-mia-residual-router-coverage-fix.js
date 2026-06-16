/**
 * PATCH 7.6V-C — Residual Router Coverage Fix
 *
 * Static router validation only — no production routing/verbalizer changes.
 *
 * Usage: node scripts/test-mia-residual-router-coverage-fix.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual", price: "R$ 1.899" },
  lastAxis: "equilibrio geral",
  lastMainConsequence: "desempenho solido para uso diario",
  lastTradeoff: "nao e o mais barato da lista",
};

const CASES = [
  {
    message: "isso me preocupa",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "concern",
  },
  {
    message: "nao sei se e a melhor escolha",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
  },
  {
    message: "qual eu compro mais sossegado?",
    expectedTurnType: "PRIORITY_SHIFT",
    expectedDetector: "",
    expectedSubtype: "",
  },
  {
    message: "qual aguenta melhor os proximos anos?",
    expectedTurnType: "PRIORITY_SHIFT",
    expectedDetector: "",
    expectedSubtype: "",
  },
  {
    message: "isso me deixa com receio",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "concern",
  },
  {
    message: "sera que e a melhor escolha?",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
  },
  {
    message: "qual compro mais tranquilo?",
    expectedTurnType: "PRIORITY_SHIFT",
    expectedDetector: "",
    expectedSubtype: "",
  },
  {
    message: "qual fica menos defasado?",
    expectedTurnType: "PRIORITY_SHIFT",
    expectedDetector: "",
    expectedSubtype: "",
  },
];

function isDetectorActive(detector, value) {
  if (!detector) return true;
  if (value === true) return true;
  if (!value || typeof value !== "object") return false;
  if (detector === "decisionExplanation") return !!value.active;
  return !!value.detected;
}

function extractRouterSignal(cognitiveTurn, expectedDetector) {
  if (!expectedDetector) {
    return {
      turnType: cognitiveTurn?.turnType || "",
      detector: "",
      subtype: "",
    };
  }

  const signals = cognitiveTurn?.signals || {};
  const priority = [
    "projectiveRisk",
    "hesitationReaction",
    "delegationRequest",
    "decisionExplanation",
    "alternativeRequest",
  ];

  for (const detector of priority) {
    const value = signals[detector];
    if (!isDetectorActive(detector, value)) continue;
    return {
      turnType: cognitiveTurn.turnType,
      detector,
      subtype: value.subtype || "",
    };
  }

  return {
    turnType: cognitiveTurn?.turnType || "",
    detector: "",
    subtype: "",
  };
}

console.log("\nPATCH 7.6V-C — Residual Router Coverage Fix\n");

let passed = 0;
let failed = 0;
const results = [];

for (const testCase of CASES) {
  const cognitiveTurn = classifyMiaTurn({
    query: testCase.message,
    originalQuery: testCase.message,
    resolvedQuery: testCase.message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: "decision",
    contextAction: "decision",
  });

  const sig = extractRouterSignal(cognitiveTurn, testCase.expectedDetector);
  const record = {
    message: testCase.message,
    expectedTurnType: testCase.expectedTurnType,
    actualTurnType: sig.turnType,
    expectedDetector: testCase.expectedDetector,
    actualDetector: sig.detector,
    expectedSubtype: testCase.expectedSubtype,
    actualSubtype: sig.subtype,
    passed:
      sig.turnType === testCase.expectedTurnType &&
      sig.detector === testCase.expectedDetector &&
      sig.subtype === testCase.expectedSubtype,
  };

  results.push(record);
  if (record.passed) {
    passed++;
    console.log(`  ✓ "${testCase.message}"`);
  } else {
    failed++;
    console.log(
      `  ✗ "${testCase.message}" → got ${sig.turnType}/${sig.detector}/${sig.subtype}`
    );
  }
}

console.log("\n--- Records ---");
console.log(JSON.stringify(results, null, 2));
console.log(`\nResult: ${passed}/${CASES.length} passed`);

const targetCases = CASES.slice(0, 4);
const targetPassed = results.slice(0, 4).filter((r) => r.passed).length;
console.log(`Target cases (4): ${targetPassed}/4`);

process.exit(failed > 0 ? 1 : 0);
