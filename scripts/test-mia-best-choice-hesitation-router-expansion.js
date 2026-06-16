/**
 * PATCH 7.6V-G — Best Choice Hesitation Semantic Router Expansion
 *
 * Static router validation only — no HTTP, no SerpAPI.
 *
 * Usage: node scripts/test-mia-best-choice-hesitation-router-expansion.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual", price: "R$ 1.899" },
  lastAxis: "equilibrio geral",
  lastMainConsequence: "desempenho solido para uso diario",
  lastTradeoff: "nao e o mais barato da lista",
};

const CASES = [
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
];

const NEGATIVE_CASES = [
  { message: "qual celular e melhor?", mustNotBe: "not_convinced" },
  { message: "qual a melhor escolha ate 2000?", mustNotBe: "not_convinced" },
  { message: "me mostra outras opcoes", mustNotBe: "not_convinced" },
  { message: "procura outro", mustNotBe: "not_convinced" },
  { message: "qual e melhor, iphone ou samsung?", mustNotBe: "not_convinced" },
  { message: "isso me preocupa", expectedSubtype: "concern" },
  { message: "nao quero fazer besteira", expectedSubtype: "purchase_anxiety" },
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

function classify(message, hasActiveAnchor = true) {
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

console.log("\nPATCH 7.6V-G — Best Choice Hesitation Router Expansion\n");
console.log("Mode: local only (classifyMiaTurn + mock session)\n");

let passed = 0;
let failed = 0;
const results = [];

for (const message of CASES) {
  const cognitiveTurn = classify(message);
  const signal = extractSignal(cognitiveTurn);
  const ok =
    signal.turnType === "OBJECTION" &&
    signal.detector === "hesitationReaction" &&
    signal.subtype === "not_convinced";

  const record = {
    message,
    expectedTurnType: "OBJECTION",
    actualTurnType: signal.turnType,
    expectedDetector: "hesitationReaction",
    actualDetector: signal.detector,
    expectedSubtype: "not_convinced",
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
  const cognitiveTurn = classify(test.message);
  const signal = extractSignal(cognitiveTurn);

  let ok;
  if (test.expectedSubtype) {
    ok = signal.subtype === test.expectedSubtype;
  } else {
    ok = signal.subtype !== test.mustNotBe;
  }

  console.log(
    `  ${ok ? "✓" : "✗"} "${test.message}" → ${signal.turnType}:${signal.subtype || "(none)"}`
  );
  if (!ok) failed++;
}

console.log("\n── Summary ──\n");
console.log(`Best Choice cases: ${passed}/${CASES.length}`);
console.log(`\nPATCH 7.6V-G ${failed === 0 && passed === CASES.length ? "PASSED" : "FAILED"}\n`);

console.log("── Records (JSON) ──\n");
for (const record of results) {
  console.log(JSON.stringify(record, null, 2));
  console.log("");
}

process.exit(failed === 0 && passed === CASES.length ? 0 : 1);
