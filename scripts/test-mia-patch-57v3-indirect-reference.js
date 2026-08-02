/**
 * PATCH 5.7V.3 — Indirect commercial reference & anchored continuity
 * Run: node scripts/test-mia-patch-57v3-indirect-reference.js
 */

import {
  recognizeMiaIntent,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildIntentAuthorityFromRecognition,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import {
  resolveContextualCommercialFollowUp,
  enrichCommercialSessionContext,
  hasActiveCommercialThread,
  COMMERCIAL_FOLLOW_UP_TYPES,
} from "../lib/miaCommercialFollowUpContinuity.js";
import {
  resolveSemanticTarget,
  SEMANTIC_TARGETS,
} from "../lib/miaSemanticTargetResolution.js";
import {
  normalizeSemanticSessionState,
  resolveSemanticContinuationEligibility,
} from "../lib/miaSemanticStateGovernance.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    → ${err.message}`);
    failed++;
  }
}

function expect(a, b, label = "") {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}${label ? ` [${label}]` : ""}`);
}

function expectTrue(v, label = "") {
  if (!v) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function pipeline(message, ctx = {}, history = []) {
  const enriched = enrichCommercialSessionContext(ctx, history);
  const hasAnchor = hasActiveCommercialThread(enriched);
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: enriched,
    conversationMessages: history,
    hasActiveAnchor: hasAnchor,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: hasAnchor,
    sessionContext: enriched,
    conversationMessages: history,
  });
  const normalized = normalizeSemanticSessionState(enriched, {
    message,
    intentRecognition: recognition,
  });
  const continuation = resolveSemanticContinuationEligibility({
    message,
    intentRecognition: recognition,
    intentAuthority: authority,
    normalizedState: normalized,
  });
  const target = resolveSemanticTarget({
    message,
    recognition,
    conversationMessages: history,
    sessionContext: enriched,
  });
  const followUp = resolveContextualCommercialFollowUp({
    message,
    sessionContext: ctx,
    conversationMessages: history,
    hasActiveAnchor: hasAnchor,
  });
  return { recognition, authority, continuation, target, followUp, enriched };
}

const comparisonHistory = [
  { role: "user", content: "quero celular" },
  { role: "assistant", content: "Posso comparar opções na sua faixa." },
  { role: "user", content: "compara A55 e M34" },
  { role: "assistant", content: "O Galaxy A55 leva vantagem em bateria; o Moto M34 equilibra câmera e preço." },
  { role: "user", content: "discordo" },
  { role: "assistant", content: "Sem problema — me diz o que não encaixou pra eu ajustar." },
];

const longRefHistory = [
  { role: "user", content: "celular até 2k" },
  { role: "assistant", content: "Entre o Galaxy A55 e o Moto M34, o A55 ganha em bateria." },
  { role: "user", content: "gostei do primeiro" },
  { role: "assistant", content: "Ótimo — o A55 ficou como favorito." },
];

console.log("\nPATCH 5.7V.3 — Indirect commercial reference\n");

console.log("Grupo A — runner-up from comparison set (session)");
test("e o outro? with lastComparisonProducts", () => {
  const ctx = {
    lastComparisonProducts: [
      { product_name: "Galaxy A55" },
      { product_name: "Moto M34" },
    ],
    comparisonContextLocked: true,
  };
  const r = pipeline("e o outro?", ctx, comparisonHistory);
  expect(r.followUp.followUpType, COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP);
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
  expect(r.recognition.interactionMode, MIA_INTERACTION_MODES.COMMERCE);
  expect(r.followUp.resolvedProduct?.product_name, "Moto M34");
  expect(r.target.target, SEMANTIC_TARGETS.PRODUCT);
  expectTrue(r.continuation.commercialExecutionFromContinuation);
});

console.log("\nGrupo B — attribute follow-up after disagreement");
for (const msg of ["e a câmera?", "e a câmera? mano", "e bateria?"]) {
  test(`attribute: ${msg}`, () => {
    const ctx = {
      lastComparisonProducts: [
        { product_name: "Galaxy A55" },
        { product_name: "Moto M34" },
      ],
      comparisonContextLocked: true,
    };
    const r = pipeline(msg, ctx, comparisonHistory);
    expect(r.followUp.followUpType, COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP);
    expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
    expect(r.recognition.interactionMode, MIA_INTERACTION_MODES.COMMERCE);
    expect(r.target.target !== SEMANTIC_TARGETS.UNKNOWN, true);
  });
}

console.log("\nGrupo C — conversation-inferred comparison (no session products)");
test("e o outro? inferred from history", () => {
  const r = pipeline("e o outro?", {}, longRefHistory);
  expectTrue(r.followUp.contextualCommercialAuthorized);
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
  expect(r.recognition.interactionMode, MIA_INTERACTION_MODES.COMMERCE);
});

console.log("\nGrupo D — slot ordinals");
for (const [msg, expected] of [
  ["o primeiro", "Galaxy A55"],
  ["o segundo", "Moto M34"],
  ["qual deles?", null],
]) {
  test(`ordinal: ${msg}`, () => {
    const ctx = {
      lastComparisonProducts: [
        { product_name: "Galaxy A55" },
        { product_name: "Moto M34" },
      ],
      comparisonContextLocked: true,
    };
    const r = pipeline(msg, ctx, longRefHistory);
    expectTrue(r.followUp.contextualCommercialAuthorized);
    if (expected) expect(r.followUp.resolvedProduct?.product_name, expected);
  });
}

console.log("\nGrupo E — no cold clarification path");
test("not CLARIFICATION mode for anchored follow-up", () => {
  const ctx = {
    lastComparisonProducts: [{ product_name: "Galaxy A55" }, { product_name: "Moto M34" }],
    comparisonContextLocked: true,
  };
  const r = pipeline("e esse?", ctx, comparisonHistory);
  expect(r.recognition.interactionMode !== MIA_INTERACTION_MODES.CLARIFICATION, true);
  expect(r.authority.commercialPermission !== COMMERCIAL_PERMISSION.DENY, true);
});

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
