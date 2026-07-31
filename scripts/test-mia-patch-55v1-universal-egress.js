#!/usr/bin/env node
/** PATCH 5.5V.1 — Universal runtime egress + procurement intent tests */
import { strict as assert } from "node:assert";
import {
  prepareUniversalRuntimeEgressDelivery,
  resolveUniversalEgressKind,
  UNIVERSAL_EGRESS_SEAL_KEY,
  UNIFIED_CONVERSATION_EGRESS_VERSION,
} from "../lib/miaUnifiedConversationalEgress.js";
import { recognizeMiaIntent, MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}:`, err.message);
  }
}

console.log("PATCH 5.5V.1 universal egress tests\n");

test("egress version bumped", () => {
  assert.equal(UNIFIED_CONVERSATION_EGRESS_VERSION, "5.5.1");
});

test("resolveUniversalEgressKind commercial for return_seguro", () => {
  assert.equal(resolveUniversalEgressKind("return_seguro"), "commercial");
});

test("resolveUniversalEgressKind social for greeting_flow", () => {
  assert.equal(resolveUniversalEgressKind("greeting_flow"), "social");
});

test("resolveUniversalEgressKind commercial_degraded for search_guidance", () => {
  assert.equal(resolveUniversalEgressKind("search_guidance"), "commercial");
});

test("prepareUniversalRuntimeEgressDelivery seals body", () => {
  const result = prepareUniversalRuntimeEgressDelivery({
    body: { reply: "Opa!" },
    responsePath: "greeting_flow",
    intentRecognition: { interactionMode: MIA_INTERACTION_MODES.SOCIAL, socialFamilies: { greeting: true } },
  });
  assert.ok(result.body.reply);
  assert.equal(result.body[UNIVERSAL_EGRESS_SEAL_KEY], true);
});

test("prepareUniversalRuntimeEgressDelivery skips double seal", () => {
  const sealed = { reply: "Show", [UNIVERSAL_EGRESS_SEAL_KEY]: true };
  const result = prepareUniversalRuntimeEgressDelivery({
    body: sealed,
    responsePath: "greeting_flow",
  });
  assert.equal(result.skipped, true);
  assert.equal(result.body.reply, "Show");
});

test("commercial structural recovery preserves non-empty commercial reply", () => {
  const commercialReply = "Eu iria no iPhone 13 por equilíbrio.";
  const result = prepareUniversalRuntimeEgressDelivery({
    body: { reply: commercialReply },
    responsePath: "return_seguro",
    intentRecognition: { interactionMode: MIA_INTERACTION_MODES.COMMERCE },
  });
  assert.ok(String(result.body.reply).includes("iPhone 13"));
});

const MISROUTES = [
  "Fone de ouvido bom",
  "Teclado mecânico",
  "Orçamento 3000 reais",
  "Produto mais vendido",
];

for (const msg of MISROUTES) {
  test(`misroute fix: "${msg}" → commerce`, () => {
    const r = recognizeMiaIntent({ userMessage: msg, sessionContext: {} });
    assert.equal(r.interactionMode, MIA_INTERACTION_MODES.COMMERCE, JSON.stringify(r.modeResolution));
  });
}

test("Linda isolated remains social", () => {
  const r = recognizeMiaIntent({ userMessage: "Linda", sessionContext: {} });
  assert.equal(r.interactionMode, MIA_INTERACTION_MODES.SOCIAL);
});

console.log(`\nResultado: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
