/**
 * PATCH 7.6V-L — Stress Audit Expectation Alignment (local)
 *
 * Validates semantic family labels used by stress/local audits match router output.
 * Audit only — no production changes, no HTTP, no SerpAPI.
 *
 * Usage: node scripts/test-mia-stress-expectation-alignment-local.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual", price: "R$ 1.899" },
  lastRecommendation: { winner: "Produto Recomendado Atual" },
  lastAxis: "equilibrio geral",
  lastMainConsequence: "desempenho solido para uso diario",
  lastTradeoff: "nao e o mais barato da lista",
};

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
};

const CASES = [
  {
    message: "estou inseguro com essa compra",
    expectedFamily: "concern",
    priorStressAuditFamily: "purchase_anxiety",
    rationale: "inseguranca sobre a compra, sem medo explicito de errar/arrepender",
  },
  {
    message: "estou receoso",
    expectedFamily: "purchase_anxiety",
    priorStressAuditFamily: "purchase_anxiety",
    rationale: "receio ancorado sobre erro/arrependimento na compra atual",
  },
  {
    message: "nao quero tomar uma decisao ruim",
    expectedFamily: "purchase_anxiety",
    priorStressAuditFamily: "purchase_anxiety",
    rationale: "medo de tomar decisao ruim",
  },
  {
    message: "nao quero me frustrar depois",
    expectedFamily: "purchase_anxiety",
    priorStressAuditFamily: "purchase_anxiety",
    rationale: "medo de frustracao pos-compra",
  },
  {
    message: "isso me preocupa",
    expectedFamily: "concern",
    priorStressAuditFamily: "concern",
    rationale: "preocupacao direta sobre a recomendacao atual",
  },
  {
    message: "fico com um pe atras",
    expectedFamily: "concern",
    priorStressAuditFamily: "concern",
    rationale: "pe atras idiomatico sobre a escolha atual",
  },
];

function extractSignal(cognitiveTurn) {
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

function runCase(testCase) {
  const exp = FAMILY_EXPECTATIONS[testCase.expectedFamily];
  const cognitiveTurn = classifyMiaTurn({
    query: testCase.message,
    originalQuery: testCase.message,
    resolvedQuery: testCase.message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: "decision",
    contextAction: "decision",
  });
  const actual = extractSignal(cognitiveTurn);
  const passed =
    actual.turnType === exp.expectedTurnType &&
    actual.detector === exp.expectedDetector &&
    actual.subtype === exp.expectedSubtype;

  return {
    message: testCase.message,
    expectedFamily: testCase.expectedFamily,
    expectedTurnType: exp.expectedTurnType,
    actualTurnType: actual.turnType,
    expectedDetector: exp.expectedDetector,
    actualDetector: actual.detector,
    expectedSubtype: exp.expectedSubtype,
    actualSubtype: actual.subtype,
    priorStressAuditFamily: testCase.priorStressAuditFamily,
    stressAuditAligned:
      testCase.priorStressAuditFamily === testCase.expectedFamily,
    passed,
    rationale: testCase.rationale,
  };
}

console.log("\nPATCH 7.6V-L — Stress Audit Expectation Alignment (local)\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false\n");

const records = CASES.map(runCase);
let passed = 0;
let failed = 0;
let realigned = 0;

for (const record of records) {
  if (record.passed) passed++;
  else failed++;
  if (!record.stressAuditAligned) realigned++;

  console.log(
    `  ${record.passed ? "✓" : "✗"} "${record.message}" → ${record.actualTurnType}:${record.actualSubtype || "(none)"} (expected ${record.expectedFamily})`
  );
}

console.log("\n── Summary ──\n");
console.log(`Aligned cases: ${passed}/${records.length}`);
console.log(`Stress audit relabeled (7.6V-L): ${realigned}`);
console.log(
  `\nPATCH 7.6V-L ${failed === 0 && passed === records.length ? "PASSED" : "FAILED"}\n`
);

console.log("── Records (JSON) ──\n");
for (const record of records) {
  console.log(JSON.stringify(record, null, 2));
  console.log("");
}

process.exit(failed === 0 ? 0 : 1);
