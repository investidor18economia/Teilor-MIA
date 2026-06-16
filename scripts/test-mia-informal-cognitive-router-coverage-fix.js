/**
 * PATCH 7.6U-F — Informal Cognitive Router Coverage Fix
 *
 * Valida os 6 casos de Router identificados no PATCH 7.6U-E.
 * Somente classificação estática — não altera routing/verbalizer.
 *
 * Usage: node scripts/test-mia-informal-cognitive-router-coverage-fix.js
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
    message: "acho que nao gostei",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
  },
  {
    message: "nao sei se iria nesse",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "not_convinced",
  },
  {
    message: "onde eu posso me arrepender",
    expectedTurnType: "OBJECTION",
    expectedDetector: "projectiveRisk",
    expectedSubtype: "risk_probe",
  },
  {
    message: "tem alguma pegadinha",
    expectedTurnType: "OBJECTION",
    expectedDetector: "projectiveRisk",
    expectedSubtype: "risk_probe",
  },
  {
    message: "e se eu me arrepender",
    expectedTurnType: "OBJECTION",
    expectedDetector: "hesitationReaction",
    expectedSubtype: "purchase_anxiety",
  },
  {
    message: "vai em qual",
    expectedTurnType: "EXPLANATION_REQUEST",
    expectedDetector: "delegationRequest",
    expectedSubtype: "decision_delegation",
  },
];

function isDetectorActive(detector, value) {
  if (value === true) return true;
  if (!value || typeof value !== "object") return false;
  if (detector === "decisionExplanation") return !!value.active;
  return !!value.detected;
}

function extractRouterSignal(cognitiveTurn) {
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

  const sig = extractRouterSignal(cognitiveTurn);
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
    console.log(`  ✓ ${testCase.message}`);
  } else {
    failed++;
    console.log(
      `  ✗ ${testCase.message}\n` +
        `      turnType: expected=${testCase.expectedTurnType} actual=${sig.turnType}\n` +
        `      detector: expected=${testCase.expectedDetector} actual=${sig.detector || "none"}\n` +
        `      subtype:  expected=${testCase.expectedSubtype} actual=${sig.subtype || "none"}`
    );
  }
}

console.log("\n--- PATCH 7.6U-F Router Coverage Fix ---");
console.log(JSON.stringify(results, null, 2));
console.log(`\nResult: ${passed}/${CASES.length} passed`);

if (failed > 0) {
  process.exit(1);
}
