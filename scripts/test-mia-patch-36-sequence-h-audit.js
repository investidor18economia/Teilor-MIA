#!/usr/bin/env node
/**
 * PATCH 3.6.2 — Sequence-H informal first-turn commercial entry audit
 */
import {
  CONSTRAINT_REFINEMENT_VERSION,
  extractCommercialRefinements,
  isInitialCommercialEntryMessage,
} from "../lib/miaCommercialConstraintRefinement.js";
import { classifyCommercialFollowUpType } from "../lib/miaCommercialFollowUpContinuity.js";
import { detectActiveCommercialAsk } from "../lib/miaIntentRecognitionLayer.js";

const ENTRY_CASES = [
  "quero um celular",
  "quero um celular bom",
  "quero um celular pra jogar",
  "quero um celular pra faculdade",
  "preciso d um celular",
  "preciso de um celular",
  "preciso d um samsung",
  "to procurando um celular",
  "to querendo trocar de celular",
  "queria um celular",
  "queria um samsung",
  "queria um iphone",
  "me ajuda escolher um celular",
  "qual celular vc indica",
  "qual celular vc recomenda",
  "preciso comprar um celular",
  "to pensando em comprar um celular",
  "quero um celular ate 2500",
  "quero um samsung bom de bateria",
  "quero um celular bom d bateria",
  "quero um celular bom pra uso normal",
  "quero um cell ate 2500",
  "to procurando um cel pra facul",
  "quero um samsung bom d bateria",
  "preciso d um celular ate 2500",
  "to querendo trocar d celular",
  "pra jogar quero um celular",
  "ate 2500 quero um celular",
  "samsung eu queria",
];

const NEGATIVE_CASES = [
  "boa noite",
  "obrigado",
  "quem é você",
  "como você funciona",
  "kkkk",
  "legal",
  "entendi",
  "beleza",
];

let total = 0;
let passed = 0;
const failures = [];

function test(label, fn) {
  total++;
  try {
    if (fn()) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failures.push(label);
      console.log(`  ✗ ${label}`);
    }
  } catch (err) {
    failures.push(`${label}: ${err.message}`);
    console.log(`  ✗ ${label} — ${err.message}`);
  }
}

console.log(`\nPATCH 3.6.2 — Sequence-H Audit (${CONSTRAINT_REFINEMENT_VERSION})\n`);

for (const msg of ENTRY_CASES) {
  test(`entry: ${msg}`, () => {
    const ctx = {};
    return (
      isInitialCommercialEntryMessage(msg, ctx) &&
      extractCommercialRefinements(msg, ctx).length === 0 &&
      classifyCommercialFollowUpType(msg, ctx) !== "constraint_refinement"
    );
  });
}

for (const msg of NEGATIVE_CASES) {
  test(`negative: ${msg}`, () => !detectActiveCommercialAsk(msg));
}

test("sequence-h turn1", () => {
  const ctx = {};
  const msg = "quero um cell ate 2500";
  return (
    isInitialCommercialEntryMessage(msg, ctx) &&
    classifyCommercialFollowUpType(msg, ctx) !== "constraint_refinement"
  );
});

test("mixed-2 still refinement with anchor", () => {
  const ctx = { lastBestProduct: { product_name: "Samsung Galaxy S23 FE" } };
  const msg = "Pode subir até 3.300, mas só quero Samsung.";
  return classifyCommercialFollowUpType(msg, ctx) === "constraint_refinement";
});

console.log(`\n${"═".repeat(60)}`);
console.log(`  Sequence-H Audit: ${passed}/${total} passed`);
if (failures.length) {
  console.log(`  FAILURES:\n    - ${failures.join("\n    - ")}`);
  process.exit(1);
}
console.log(`  VERDICT: APROVADO`);
process.exit(0);
