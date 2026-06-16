/**
 * PATCH 7.6V-J — Purchase Anxiety Semantic Router Expansion
 *
 * Local router validation for hesitationReaction:purchase_anxiety family.
 *
 * Usage: node scripts/test-mia-purchase-anxiety-router-expansion.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual", price: "R$ 1.899" },
  lastRecommendation: { winner: "Produto Recomendado Atual" },
  lastAxis: "equilibrio geral",
  lastMainConsequence: "desempenho solido para uso diario",
  lastTradeoff: "nao e o mais barato da lista",
};

const POSITIVE_CASES = [
  "nao quero fazer besteira",
  "tenho medo de me arrepender",
  "e se eu me arrepender?",
  "nao quero jogar dinheiro fora",
  "estou receoso",
  "e se eu errar?",
  "nao quero tomar uma decisao ruim",
  "nao quero me frustrar depois",
  "tenho medo de escolher errado",
];

const NEGATIVE_CASES = [
  {
    message: "estou inseguro com essa compra",
    expectedTurnType: "OBJECTION",
    expectedSubtype: "concern",
  },
  {
    message: "isso me preocupa",
    expectedTurnType: "OBJECTION",
    expectedSubtype: "concern",
  },
  {
    message: "fico com um pe atras",
    expectedTurnType: "OBJECTION",
    expectedSubtype: "concern",
  },
  {
    message: "sera que vale mesmo?",
    expectedTurnType: "OBJECTION",
    expectedSubtype: "not_convinced",
  },
  {
    message: "qual a pegadinha?",
    expectedTurnType: "OBJECTION",
    expectedSubtype: "risk_probe",
    expectedDetector: "projectiveRisk",
  },
  {
    message: "onde eu posso me arrepender?",
    expectedTurnType: "OBJECTION",
    expectedSubtype: "risk_probe",
    expectedDetector: "projectiveRisk",
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
  const pr = cognitiveTurn?.signals?.projectiveRisk;
  if (pr?.detected) {
    return {
      turnType: cognitiveTurn.turnType,
      detector: "projectiveRisk",
      subtype: pr.subtype || "",
    };
  }
  return {
    turnType: cognitiveTurn?.turnType || "",
    detector: "",
    subtype: "",
  };
}

function runCase(message, { hasActiveAnchor = true } = {}) {
  return classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: SESSION,
    hasActiveAnchor,
    detectedIntent: "decision",
    contextAction: "decision",
  });
}

console.log("\nPATCH 7.6V-J — Purchase Anxiety Semantic Router Expansion\n");
console.log("HTTP usage: false");
console.log("SerpAPI risk: false\n");

let passed = 0;
let failed = 0;
const results = [];

console.log("── Positive cases ──\n");

for (const message of POSITIVE_CASES) {
  const cognitiveTurn = runCase(message);
  const signal = extractSignal(cognitiveTurn);
  const ok =
    signal.turnType === "OBJECTION" &&
    signal.detector === "hesitationReaction" &&
    signal.subtype === "purchase_anxiety";

  const record = {
    message,
    expectedTurnType: "OBJECTION",
    actualTurnType: signal.turnType,
    expectedDetector: "hesitationReaction",
    actualDetector: signal.detector,
    expectedSubtype: "purchase_anxiety",
    actualSubtype: signal.subtype,
    passed: ok,
  };

  results.push(record);
  if (ok) passed++;
  else failed++;

  console.log(
    `  ${ok ? "✓" : "✗"} "${message}" → ${signal.turnType}:${signal.detector}:${signal.subtype || "(none)"}`
  );
}

console.log("\n── Negative guards ──\n");

for (const test of NEGATIVE_CASES) {
  const cognitiveTurn = runCase(test.message);
  const signal = extractSignal(cognitiveTurn);
  const detector = test.expectedDetector || "hesitationReaction";
  const ok =
    signal.turnType === test.expectedTurnType &&
    signal.detector === detector &&
    signal.subtype === test.expectedSubtype &&
    signal.subtype !== "purchase_anxiety";

  if (ok) passed++;
  else failed++;

  console.log(
    `  ${ok ? "✓" : "✗"} "${test.message}" → ${signal.turnType}:${signal.detector}:${signal.subtype || "(none)"} (expected ${test.expectedSubtype})`
  );
}

console.log("\n── Summary ──\n");
console.log(`Purchase anxiety positive: ${results.filter((r) => r.passed).length}/${POSITIVE_CASES.length}`);
console.log(`Total passed: ${passed}/${POSITIVE_CASES.length + NEGATIVE_CASES.length}`);
console.log(`\nPATCH 7.6V-J ${failed === 0 ? "PASSED" : "FAILED"}\n`);

console.log("── Records (JSON) ──\n");
for (const record of results) {
  console.log(JSON.stringify(record, null, 2));
  console.log("");
}

process.exit(failed === 0 ? 0 : 1);
