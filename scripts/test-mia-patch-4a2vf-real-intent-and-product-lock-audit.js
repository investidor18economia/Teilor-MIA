#!/usr/bin/env node
/**
 * PATCH 4A.2VF — Real intent, product lock, and commercial contestation audit.
 * Usage: node scripts/test-mia-patch-4a2vf-real-intent-and-product-lock-audit.js
 */

import {
  classifyMiaTurn,
  isConstraintChangeFamilyQuery,
  isCommercialProductPreferenceChallengeQuery,
} from "../lib/miaCognitiveRouter.js";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { resolveClarificationDecision } from "../lib/miaClarificationGates.js";
import {
  isSpecificProductEvaluationQuery,
  resolveProductIdentityFromQuery,
} from "../lib/miaProductIdentityResolution.js";
import { bootstrapSpecificProductLock } from "../lib/miaSpecificProductResolutionLock.js";
import { extractContentAnchors } from "../lib/miaSocialResponsePerception.js";

const PATCH = "4A.2VF";
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

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

const COMMERCE_SESSION = {
  lastBestProduct: { product_name: "Galaxy A55 5G", price: "1800" },
  lastCategory: "phone",
  budgetMax: 2500,
  lastCommercialConstraints: { category: "phone", budgetMax: 2500 },
  comparisonContext: {
    locked: true,
    products: ["Galaxy A55 5G", "Galaxy S23 FE"],
  },
};

const COMPARISON_SESSION = {
  ...COMMERCE_SESSION,
  lastBestProduct: { product_name: "Galaxy A55 5G", price: "1800" },
};

function evaluateTurn(message, session = COMMERCE_SESSION, hasActiveAnchor = true) {
  const contextResolution = { mode: "context_decision", needsClarification: true };
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    hasActiveAnchor,
    sessionContext: session,
    contextResolution,
  });
  const intent = recognizeMiaIntent({
    userMessage: message,
    sessionContext: session,
    cognitiveTurn,
    hasActiveAnchor,
  });
  const clar = resolveClarificationDecision({
    query: message,
    sessionContext: session,
    contextResolution,
    intentRecognition: intent,
  });
  return { cognitiveTurn, intent, clar };
}

function isPriorityTurn(cognitiveTurn) {
  return (
    cognitiveTurn.turnType === "PRIORITY_SHIFT" ||
    cognitiveTurn.signals?.isPriorityShift === true ||
    cognitiveTurn.signals?.isConstraintChange === true
  );
}

function identityMatches(identity, expect) {
  const official = String(identity?.officialName || "").toLowerCase();
  const tokens = expect.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((token) => official.includes(token.replace("galaxy", "").trim()) || official.includes(token));
}

console.log(`\nPATCH ${PATCH} — Real Intent & Product Lock Audit\n`);

section("A — Prioridade explícita (15+ variações)");

const PRIORITY_CASES = [
  "bateria é minha prioridade",
  "minha prioridade é bateria",
  "pra mim o mais importante é bateria",
  "o que mais importa pra mim é bateria",
  "eu priorizo bateria",
  "quero dar mais peso pra bateria",
  "prefiro autonomia",
  "autonomia vem primeiro",
  "não quero viver procurando tomada",
  "preciso que dure o dia inteiro",
  "bateria acima de câmera",
  "câmera não importa tanto, bateria sim",
  "bat é o mais importante p mim",
  "pra mim bateria primeiro",
  "bateria e minha prioridade",
];

for (const msg of PRIORITY_CASES) {
  test(`priority: "${msg.slice(0, 40)}"`, () => {
    if (!isConstraintChangeFamilyQuery(msg)) return false;
    const { cognitiveTurn, intent, clar } = evaluateTurn(msg);
    return isPriorityTurn(cognitiveTurn) && intent.interactionMode === "commerce" && clar.needsClarification === false;
  });
}

test("priority without anchor — still constraint family", () => {
  const msg = "bateria é minha prioridade";
  return isConstraintChangeFamilyQuery(msg);
});

section("B — Product lock (12+ variações)");

const PRODUCT_LOCK_CASES = [
  { q: "o Galaxy A55 vale a pena?", expect: "Galaxy A55" },
  { q: "Galaxy A55 é bom?", expect: "Galaxy A55" },
  { q: "o A55 compensa?", expect: "Galaxy A55" },
  { q: "Samsung A55 presta?", expect: "Galaxy A55" },
  { q: "vale comprar o A55?", expect: "Galaxy A55" },
  { q: "me fala do Galaxy A55", expect: "Galaxy A55" },
  { q: "quero saber se o A55 é uma boa", expect: "Galaxy A55" },
  { q: "e o A55?", expect: "Galaxy A55" },
  { q: "o que acha do A55 5G?", expect: "Galaxy A55" },
  { q: "o Galaxy S23 FE vale a pena?", expect: "Galaxy S23 FE" },
  { q: "o iPhone 15 compensa?", expect: "iPhone 15" },
  { q: "o Moto G84 é bom?", expect: "Moto G84" },
  { q: "o Redmi Note 13 vale a compra?", expect: "Redmi Note 13" },
  { q: "a55 vale?", expect: "Galaxy A55" },
  { q: "e o a55, compensa?", expect: "Galaxy A55" },
];

for (const { q, expect } of PRODUCT_LOCK_CASES) {
  test(`product lock eval: "${q.slice(0, 40)}"`, () => {
    const identity = resolveProductIdentityFromQuery(q);
    if (!identityMatches(identity, expect)) return false;
    if (isSpecificProductEvaluationQuery(q)) {
      const { intent, clar } = evaluateTurn(q, {}, false);
      return intent.interactionMode === "commerce" && clar.needsClarification === false;
    }
    const lock = bootstrapSpecificProductLock({ query: q, products: [] });
    return lock.active && identityMatches({ officialName: lock.lockedProduct?.product_name }, expect);
  });
}

test("bootstrap lock anchors Galaxy A55 from empty products", () => {
  const lock = bootstrapSpecificProductLock({
    query: "o Galaxy A55 vale a pena?",
    products: [],
  });
  return (
    lock.active === true &&
    lock.matchSource === "query_identity_anchor" &&
    /A55/i.test(lock.lockedProduct?.product_name || lock.lockedProduct?.name || "")
  );
});

test("bootstrap lock does not swap A55 for iPhone when ranking has iPhone first", () => {
  const lock = bootstrapSpecificProductLock({
    query: "o Galaxy A55 vale a pena?",
    products: [{ product_name: "iPhone 13", price: "2800" }],
  });
  const name = lock.lockedProduct?.product_name || lock.lockedProduct?.name || "";
  return lock.active && /A55/i.test(name) && !/iPhone 13/i.test(name);
});

section("C — Contestação comercial (15+ variações)");

const CONTESTATION_CASES = [
  "mas eu achei o S23 FE melhor",
  "eu ainda acho o S23 FE melhor",
  "pra mim o S23 FE é melhor",
  "não concordo, prefiro o S23 FE",
  "acho que você está subestimando o S23 FE",
  "eu escolheria o S23 FE",
  "não vejo o A55 como melhor",
  "o S23 FE não seria uma escolha melhor?",
  "mas o S23 FE parece superior",
  "vc tem certeza? o S23 FE me parece melhor",
  "mas eu prefiro o s23fe",
  "n concordo acho o s23 fe melhor",
  "continuo achando o S23 FE superior",
  "penso que o Galaxy S23 FE é melhor",
  "mas pra mim o s23 fe ganha",
];

for (const msg of CONTESTATION_CASES) {
  test(`contestation: "${msg.slice(0, 42)}"`, () => {
    if (!isCommercialProductPreferenceChallengeQuery(msg)) return false;
    const { intent, clar } = evaluateTurn(msg, COMPARISON_SESSION);
    const anchors = extractContentAnchors(msg);
    return intent.interactionMode === "commerce" && clar.needsClarification === false && !anchors.includes("melhora");
  });
}

section("C.1 — Distinção de melhora pessoal (8+ negativos)");

const WELLBEING_CASES = [
  "hoje eu estou melhor",
  "achei que eu ficaria melhor",
  "minha dor melhorou",
  "agora estou me sentindo melhor",
  "dormi melhor hoje",
  "melhorou um pouco depois do remédio",
  "hoje estou melhor de saúde",
  "me sinto melhor agora",
  "a febre melhorou",
];

for (const msg of WELLBEING_CASES) {
  test(`wellbeing NOT contestation: "${msg.slice(0, 40)}"`, () => {
    if (isCommercialProductPreferenceChallengeQuery(msg)) return false;
    const { intent } = evaluateTurn(msg, COMPARISON_SESSION);
    // wellbeing may route social — must NOT be commercial preference challenge
    return !isCommercialProductPreferenceChallengeQuery(msg);
  });
}

section("D — Cenários originais PATCH 4A.2V");

test('original A: "bateria é minha prioridade"', () => {
  const { cognitiveTurn, intent, clar } = evaluateTurn("bateria é minha prioridade");
  return isPriorityTurn(cognitiveTurn) && intent.interactionMode === "commerce" && clar.needsClarification === false;
});

test('original B: "o Galaxy A55 vale a pena?"', () => {
  const q = "o Galaxy A55 vale a pena?";
  const { cognitiveTurn, intent, clar } = evaluateTurn(q, {}, false);
  const lock = bootstrapSpecificProductLock({ query: q, products: [] });
  return (
    isSpecificProductEvaluationQuery(q) &&
    cognitiveTurn.turnType === "COMMERCIAL_QUESTION" &&
    intent.interactionMode === "commerce" &&
    clar.needsClarification === false &&
    lock.active &&
    /A55/i.test(lock.lockedProduct?.product_name || "")
  );
});

test('original C: "mas eu achei o S23 FE melhor"', () => {
  const msg = "mas eu achei o S23 FE melhor";
  const { cognitiveTurn, intent, clar } = evaluateTurn(msg, COMPARISON_SESSION);
  const anchors = extractContentAnchors(msg);
  return (
    intent.interactionMode === "commerce" &&
    clar.needsClarification === false &&
    !anchors.includes("melhora") &&
    isCommercialProductPreferenceChallengeQuery(msg)
  );
});

console.log(`\n${"═".repeat(60)}`);
console.log(`PATCH ${PATCH} — ${passed}/${total} passed`);
if (failures.length) {
  console.log(`\nFailures (${failures.length}):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("ALL PASS");
process.exit(0);
