/**
 * PATCH 7.6V-H — Projective Risk Semantic Router Expansion
 *
 * Static router validation only — no HTTP, no SerpAPI.
 *
 * Usage: node scripts/test-mia-projective-risk-semantic-router-expansion.js
 */

import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Recomendado Atual", price: "R$ 1.899" },
  lastAxis: "equilibrio geral",
  lastMainConsequence: "desempenho solido para uso diario",
  lastTradeoff: "nao e o mais barato da lista",
};

const CASES = [
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
];

const NEGATIVE_CASES = [
  { message: "me fala os pontos negativos em geral", mustNotBe: "risk_probe" },
  { message: "lista vantagens e desvantagens", mustNotBe: "risk_probe" },
  { message: "procura outro sem esses pontos ruins", mustNotBe: "risk_probe" },
  { message: "me mostra um sem pegadinha", mustNotBe: "risk_probe" },
  { message: "esse produto e ruim", mustNotBe: "risk_probe" },
  { message: "isso e chato demais", mustNotBe: "risk_probe" },
  { message: "e se eu me arrepender?", expectedSubtype: "purchase_anxiety" },
  { message: "isso me preocupa", expectedSubtype: "concern" },
];

function extractSignal(cognitiveTurn) {
  const pr = cognitiveTurn?.signals?.projectiveRisk;
  if (pr?.detected) {
    return {
      turnType: cognitiveTurn.turnType,
      detector: "projectiveRisk",
      subtype: pr.subtype || "",
    };
  }
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

function classify(message) {
  return classifyMiaTurn({
    query: message,
    originalQuery: message,
    resolvedQuery: message,
    sessionContext: SESSION,
    hasActiveAnchor: true,
    detectedIntent: "decision",
    contextAction: "decision",
  });
}

console.log("\nPATCH 7.6V-H — Projective Risk Semantic Router Expansion\n");
console.log("Mode: local only (classifyMiaTurn + mock session)\n");

let passed = 0;
let failed = 0;
const results = [];

for (const message of CASES) {
  const cognitiveTurn = classify(message);
  const signal = extractSignal(cognitiveTurn);
  const ok =
    signal.turnType === "OBJECTION" &&
    signal.detector === "projectiveRisk" &&
    signal.subtype === "risk_probe";

  const record = {
    message,
    expectedTurnType: "OBJECTION",
    actualTurnType: signal.turnType,
    expectedDetector: "projectiveRisk",
    actualDetector: signal.detector,
    expectedSubtype: "risk_probe",
    actualSubtype: signal.subtype,
    passed: ok,
  };

  results.push(record);
  if (ok) passed++;
  else failed++;

  console.log(`  ${ok ? "✓" : "✗"} "${message}" → ${signal.turnType}:${signal.detector}:${signal.subtype}`);
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
    `  ${ok ? "✓" : "✗"} "${test.message}" → ${signal.turnType}:${signal.detector}:${signal.subtype || "(none)"}`
  );
  if (!ok) failed++;
}

console.log("\n── Summary ──\n");
console.log(`Projective Risk cases: ${passed}/${CASES.length}`);
console.log(`\nPATCH 7.6V-H ${failed === 0 && passed === CASES.length ? "PASSED" : "FAILED"}\n`);

console.log("── Records (JSON) ──\n");
for (const record of results) {
  console.log(JSON.stringify(record, null, 2));
  console.log("");
}

process.exit(failed === 0 && passed === CASES.length ? 0 : 1);
