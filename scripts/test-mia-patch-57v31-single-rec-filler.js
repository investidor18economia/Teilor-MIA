/**
 * PATCH 5.7V.3.1 — Single recommendation dimension follow-up + filler governance
 * Run: node scripts/test-mia-patch-57v31-single-rec-filler.js
 */

import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
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
  detectGenericDimensionFollowUpQuery,
  getActiveRecommendedEntity,
} from "../lib/miaCommercialFollowUpContinuity.js";
import {
  classifyConversationalFiller,
  FILLER_TYPES,
} from "../lib/miaConversationalFillerGovernance.js";
import {
  resolveSemanticTarget,
  SEMANTIC_TARGETS,
} from "../lib/miaSemanticTargetResolution.js";
import {
  normalizeSemanticSessionState,
  resolveSemanticContinuationEligibility,
} from "../lib/miaSemanticStateGovernance.js";
import { resolveClarificationDecision } from "../lib/miaClarificationGates.js";

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
    signals: { conversationMessages: history },
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
  const clarification = resolveClarificationDecision({
    query: message,
    sessionContext: enriched,
    conversationMessages: history,
    intentRecognition: recognition,
  });
  return { recognition, authority, continuation, target, followUp, clarification, enriched };
}

const singleRecHistory = [
  { role: "user", content: "oi" },
  { role: "assistant", content: "Oi! Como posso ajudar?" },
  { role: "user", content: "to precisando de um celular" },
  { role: "assistant", content: "Claro — qual faixa de preço?" },
  { role: "user", content: "até 2000" },
  { role: "assistant", content: "Eu iria no iPhone 13 para essa faixa." },
];

const singleRecCtx = {
  lastBestProduct: { product_name: "iPhone 13" },
  lastCategory: "phone",
  lastBudget: 2000,
};

console.log("\nPATCH 5.7V.3.1 — Single recommendation + fillers\n");

console.log("Grupo A — generic dimension follow-up (MV-114)");
test("detectGenericDimensionFollowUpQuery: e memória?", () => {
  const d = detectGenericDimensionFollowUpQuery("e memória?");
  expectTrue(d.detected);
  expect(d.dimension, "memoria");
});
test("MV-114 pipeline: e memória? after single recommendation", () => {
  const r = pipeline("e memória?", singleRecCtx, singleRecHistory);
  expect(r.followUp.followUpType, COMMERCIAL_FOLLOW_UP_TYPES.ATTRIBUTE_FOLLOW_UP);
  expect(r.followUp.contextualCommercialAuthorized, true);
  expect(r.recognition.interactionMode, MIA_INTERACTION_MODES.COMMERCE);
  expect(r.recognition.interactionMode !== MIA_INTERACTION_MODES.CLARIFICATION, true);
  expect(r.clarification.needsClarification, false);
  expect(r.followUp.resolvedProduct?.product_name, "iPhone 13");
  expect(r.target.target, SEMANTIC_TARGETS.PRODUCT);
});
test("getActiveRecommendedEntity from lastBestProduct", () => {
  const e = getActiveRecommendedEntity(singleRecCtx);
  expect(e.entity?.product_name, "iPhone 13");
  expect(e.anchorType, "single_recommendation");
});

console.log("\nGrupo B — multicategory contract (no mobile hardcode)");
for (const [cat, product, dim] of [
  ["notebook", "Dell Inspiron 15", "e tela?"],
  ["tv", "Samsung Crystal 55", "e sistema?"],
  ["monitor", "LG UltraGear 27", "e taxa?"],
  ["console", "PlayStation 5", "e armazenamento?"],
  ["pc", "RTX 4060", "e consumo?"],
  ["fridge", "Brastemp Frost Free", "e consumo?"],
]) {
  test(`${cat}: ${dim}`, () => {
    const ctx = { lastBestProduct: { product_name: product, category: cat } };
    const hist = [
      { role: "user", content: `quero ${cat}` },
      { role: "assistant", content: `Recomendo ${product}.` },
    ];
    const r = pipeline(dim, ctx, hist);
    expectTrue(detectGenericDimensionFollowUpQuery(dim).detected);
    expect(r.followUp.contextualCommercialAuthorized, true);
    expect(r.target.target, SEMANTIC_TARGETS.PRODUCT);
  });
}

console.log("\nGrupo C — filler governance (6 blocking cases)");
const fillerHistory = [
  { role: "user", content: "quero celular mano" },
  { role: "assistant", content: "Eu iria no iPhone 13." },
  { role: "user", content: "discordo mano" },
  { role: "assistant", content: "Entendo — o que te faz discordar?" },
  { role: "user", content: "e a câmera? mano" },
  { role: "assistant", content: "A câmera do iPhone 13 é forte." },
  { role: "user", content: "explica mano" },
  { role: "assistant", content: "Claro! O que você gostaria que eu explicasse?" },
];
const fillerCtx = {
  lastBestProduct: { product_name: "iPhone 13" },
  lastComparisonProducts: [{ product_name: "iPhone 13" }, { product_name: "Galaxy A55" }],
  comparisonContextLocked: true,
};

for (const msg of ["hm mano", "ok mano"]) {
  test(`neutral filler: ${msg}`, () => {
    const f = classifyConversationalFiller(msg, {
      conversationMessages: fillerHistory,
      sessionContext: fillerCtx,
      hasActiveAnchor: true,
    });
    expect(f.type, FILLER_TYPES.NEUTRAL);
    expect(f.blocksClarification, true);
    const r = pipeline(msg, fillerCtx, fillerHistory);
    expect(r.recognition.interactionMode !== MIA_INTERACTION_MODES.CLARIFICATION, true);
    expect(r.clarification.needsClarification, false);
    expect(r.continuation.anchorPreserved, true);
  });
}

test("negative filler: não after open question (RF-017)", () => {
  const hist = [
    { role: "user", content: "A55" },
    { role: "assistant", content: "Eu iria no Galaxy A55 5G." },
    { role: "user", content: "discordo" },
    { role: "assistant", content: "Posso saber mais sobre o que te levou a essa opinião?" },
  ];
  const ctx = { lastBestProduct: { product_name: "Galaxy A55 5G" } };
  const f = classifyConversationalFiller("não", {
    conversationMessages: hist,
    sessionContext: ctx,
    hasActiveAnchor: true,
  });
  expect(f.type, FILLER_TYPES.NEGATIVE);
  expect(f.blocksClarification, true);
  const r = pipeline("não", ctx, hist);
  expect(r.recognition.interactionMode !== MIA_INTERACTION_MODES.CLARIFICATION, true);
  expect(r.clarification.needsClarification, false);
});

console.log("\nGrupo D — 5.7V.3 regression smoke");
test("e o outro? still runner-up", () => {
  const ctx = {
    lastComparisonProducts: [{ product_name: "Galaxy A55" }, { product_name: "Moto M34" }],
    comparisonContextLocked: true,
  };
  const r = pipeline("e o outro?", ctx, []);
  expect(r.followUp.followUpType, COMMERCIAL_FOLLOW_UP_TYPES.RUNNER_UP_FOLLOW_UP);
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
});

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
