/**
 * PATCH 7.6R — Conversational Follow-up Classification Fix
 *
 * Valida classificação no Cognitive Router para famílias:
 *   A — Hesitation vocab (Family D/E expansion)
 *   B — Projective Risk (PROJECTIVE_RISK)
 *   C — Decision Delegation (DECISION_DELEGATION)
 *   D — Sem âncora (guards)
 *
 * Usage: node scripts/test-mia-conversational-followup-classification-fix.js
 */

import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";

const MOCK_WINNER = {
  product_name: "Samsung Galaxy A55",
  price: "R$ 1.899",
};

const SESSION_WITH_ANCHOR = {
  lastBestProduct: MOCK_WINNER,
  lastProductMentioned: MOCK_WINNER.product_name,
  lastProducts: [MOCK_WINNER],
  lastCategory: "celular",
};

const SESSION_NO_ANCHOR = {};

let total = 0;
let passed = 0;
let failed = 0;
const failures = [];

function classify(query, { hasAnchor = true, detectedIntent = "casual_chat" } = {}) {
  return classifyMiaTurn({
    query,
    originalQuery: query,
    resolvedQuery: query,
    sessionContext: hasAnchor ? SESSION_WITH_ANCHOR : SESSION_NO_ANCHOR,
    hasActiveAnchor: hasAnchor,
    detectedIntent,
  });
}

function test(label, query, opts = {}) {
  total++;
  const {
    expectedType,
    expectedReasonPrefix = null,
    expectedSignal = null,
    expectedSignalValue = null,
    hasAnchor = true,
    detectedIntent = "casual_chat",
    mustNotBe = [],
  } = opts;

  const result = classify(query, { hasAnchor, detectedIntent });
  const typeOk = result.turnType === expectedType;
  const reasonOk =
    expectedReasonPrefix === null ||
    (result.reasons || []).some((r) => r.startsWith(expectedReasonPrefix) || r.includes(expectedReasonPrefix));
  const signalOk =
    expectedSignal === null ||
    (expectedSignalValue === null
      ? !!result.signals?.[expectedSignal]?.detected || result.signals?.[expectedSignal] === true
      : result.signals?.[expectedSignal]?.[expectedSignalValue === "detected" ? "detected" : "subtype"] ===
          (expectedSignalValue === "detected" ? true : expectedSignalValue.split(":")[1]) ||
        result.signals?.[expectedSignal]?.subtype === expectedSignalValue);
  const notOk = mustNotBe.every((t) => result.turnType !== t);

  const ok = typeOk && reasonOk && signalOk && notOk;

  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    const msg =
      `  ✗ ${label}\n` +
      `      query    : "${query}"\n` +
      `      esperado : ${expectedType}${expectedReasonPrefix ? ` [${expectedReasonPrefix}]` : ""}\n` +
      `      obtido   : ${result.turnType}\n` +
      `      reasons  : ${(result.reasons || []).join(", ") || "—"}\n` +
      `      signals  : projective=${result.signals?.projectiveRisk?.detected}, delegation=${result.signals?.delegationRequest?.detected}, hesitation=${result.signals?.hesitationReaction?.detected}`;
    console.log(msg);
    failures.push(msg);
  }
}

function testNoAnchorSignal(label, query, signalName) {
  total++;
  const result = classify(query, { hasAnchor: false });
  const signalOff = !result.signals?.[signalName]?.detected;
  const ok = signalOff;

  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    const msg =
      `  ✗ ${label}\n` +
      `      query   : "${query}"\n` +
      `      signal  : ${signalName} deveria ser false sem âncora\n` +
      `      obtido  : turnType=${result.turnType}, signal=${result.signals?.[signalName]?.detected}`;
    console.log(msg);
    failures.push(msg);
  }
}

console.log("\n── PATCH 7.6R — Grupo A: Hesitation vocab ───────────────────────────────");

test("A.1 nao sei se gostei", "nao sei se gostei", {
  expectedType: MIA_TURN_TYPES.OBJECTION,
  expectedReasonPrefix: "hesitation_subtype:not_convinced",
});

test("A.2 ainda nao estou convencido", "ainda nao estou convencido", {
  expectedType: MIA_TURN_TYPES.OBJECTION,
  expectedReasonPrefix: "hesitation_subtype:not_convinced",
});

test("A.3 nao me passou confianca", "nao me passou confianca", {
  expectedType: MIA_TURN_TYPES.OBJECTION,
  expectedReasonPrefix: "hesitation_subtype:not_sure",
});

test("A.4 algo me incomoda", "algo me incomoda", {
  expectedType: MIA_TURN_TYPES.OBJECTION,
  expectedReasonPrefix: "hesitation_reaction_detected",
});

test("A.5 sei la", "sei la", {
  expectedType: MIA_TURN_TYPES.OBJECTION,
  expectedReasonPrefix: "hesitation_reaction_detected",
});

console.log("\n── PATCH 7.6R — Grupo B: Projective Risk ───────────────────────────────");

const riskCases = [
  ["B.1 qual seria seu medo nessa compra", "qual seria seu medo nessa compra"],
  ["B.2 o que te preocuparia", "o que te preocuparia"],
  ["B.3 qual o maior risco", "qual o maior risco"],
  ["B.4 onde voce ficaria com receio", "onde voce ficaria com receio"],
  ["B.5 o que poderia dar errado", "o que poderia dar errado"],
  ["B.6 qual seria o ponto fraco", "qual seria o ponto fraco"],
];

for (const [label, query] of riskCases) {
  test(label, query, {
    expectedType: MIA_TURN_TYPES.OBJECTION,
    expectedReasonPrefix: "projective_risk_detected",
    mustNotBe: [MIA_TURN_TYPES.UNKNOWN, MIA_TURN_TYPES.CONVERSATIONAL],
  });
}

console.log("\n── PATCH 7.6R — Grupo C: Decision Delegation ────────────────────────────");

const delegationCases = [
  ["C.1 e se fosse voce", "e se fosse voce"],
  ["C.2 o que voce faria", "o que voce faria"],
  ["C.3 qual seria sua escolha", "qual seria sua escolha"],
  ["C.4 voce compraria", "voce compraria"],
  ["C.5 qual voce escolheria", "qual voce escolheria"],
  ["C.6 no seu lugar, o que faria", "no seu lugar, o que faria"],
];

for (const [label, query] of delegationCases) {
  test(label, query, {
    expectedType: MIA_TURN_TYPES.EXPLANATION_REQUEST,
    mustNotBe: [MIA_TURN_TYPES.CONVERSATIONAL, MIA_TURN_TYPES.UNKNOWN, MIA_TURN_TYPES.FOLLOW_UP],
  });
}

console.log("\n── PATCH 7.6R — Grupo D: Sem âncora (guards) ──────────────────────────");

testNoAnchorSignal("D.1 projective risk sem anchor", "qual seria seu medo nessa compra", "projectiveRisk");
testNoAnchorSignal("D.2 delegation sem anchor", "o que voce faria", "delegationRequest");
testNoAnchorSignal("D.3 hesitation purchase anxiety sem anchor", "tenho medo de me arrepender", "hesitationReaction");

test("D.4 projective risk sem anchor nao vira OBJECTION ancorada", "qual seria seu medo nessa compra", {
  expectedType: MIA_TURN_TYPES.CONVERSATIONAL,
  hasAnchor: false,
  detectedIntent: "casual_chat",
});

test("D.5 delegation sem anchor nao vira EXPLANATION_REQUEST", "o que voce faria", {
  expectedType: MIA_TURN_TYPES.CONVERSATIONAL,
  hasAnchor: false,
  detectedIntent: "casual_chat",
});

console.log("\n── PATCH 7.6R — Resumo ────────────────────────────────────────────────");
console.log(`  Total : ${total}`);
console.log(`  Passou: ${passed}`);
console.log(`  Falhou: ${failed}`);

if (failures.length) {
  console.log("\n── Falhas ─────────────────────────────────────────────────────────────");
  failures.forEach((f) => console.log(f));
  process.exit(1);
}

console.log("\n  ✓ PATCH 7.6R classification fix — todos os testes passaram.\n");
process.exit(0);
