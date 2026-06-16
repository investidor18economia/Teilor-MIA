/**
 * PATCH 7.6V-F — Concern Semantic Router Expansion
 *
 * Static router validation for hesitationReaction:concern family.
 *
 * Usage: node scripts/test-mia-concern-semantic-router-expansion.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual", price: "R$ 1.899" },
  lastAxis: "equilibrio geral",
  lastMainConsequence: "desempenho solido para uso diario",
  lastTradeoff: "nao e o mais barato da lista",
};

const CASES = [
  "isso me preocupa",
  "isso me deixa preocupado",
  "isso me deixa com receio",
  "fico com um pe atras",
  "isso me deixa inseguro",
  "isso me da um receio",
  "tenho uma preocupacao com isso",
  "isso me incomoda um pouco",
  "isso me deixa desconfortavel",
  "nao estou totalmente tranquilo com isso",
];

const NEGATIVE_CASES = [
  { message: "qual e mais seguro?", expectedNotSubtype: "concern" },
  { message: "tem garantia?", expectedNotSubtype: "concern" },
  { message: "nao quero fazer besteira", expectedSubtype: "purchase_anxiety" },
  { message: "nao sei se e a melhor escolha", expectedSubtype: "not_convinced" },
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

console.log("\nPATCH 7.6V-F — Concern Semantic Router Expansion\n");

let passed = 0;
let failed = 0;
const results = [];

for (const message of CASES) {
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: "decision",
    contextAction: "decision",
  });
  const signal = extractSignal(cognitiveTurn);
  const ok =
    signal.turnType === "OBJECTION" &&
    signal.detector === "hesitationReaction" &&
    signal.subtype === "concern";

  const record = {
    message,
    expectedTurnType: "OBJECTION",
    actualTurnType: signal.turnType,
    expectedDetector: "hesitationReaction",
    actualDetector: signal.detector,
    expectedSubtype: "concern",
    actualSubtype: signal.subtype,
    passed: ok,
  };

  results.push(record);
  if (ok) passed++;
  else failed++;

  console.log(`  ${ok ? "✓" : "✗"} "${message}" → ${signal.turnType}:${signal.subtype}`);
}

console.log("\n── Negative guards ──\n");
for (const test of NEGATIVE_CASES) {
  const cognitiveTurn = classifyMiaTurn({
    query: test.message,
    originalQuery: test.message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: "decision",
  });
  const signal = extractSignal(cognitiveTurn);
  const ok = test.expectedSubtype
    ? signal.subtype === test.expectedSubtype
    : signal.subtype !== test.expectedNotSubtype;
  console.log(
    `  ${ok ? "✓" : "✗"} "${test.message}" → ${signal.turnType}:${signal.subtype || "(none)"}`
  );
  if (!ok) failed++;
}

console.log("\n── Summary ──\n");
console.log(`Concern cases: ${passed}/${CASES.length}`);
console.log(`\nPATCH 7.6V-F ${failed === 0 && passed === CASES.length ? "PASSED" : "FAILED"}\n`);

console.log("── Records (JSON) ──\n");
for (const record of results) {
  console.log(JSON.stringify(record, null, 2));
  console.log("");
}

process.exit(failed === 0 && passed === CASES.length ? 0 : 1);
