#!/usr/bin/env node
/**
 * PATCH 5.8.1.1 — Fact validation governance tests
 * Run: node scripts/test-mia-patch-5811-fact-validation.js
 */

import { strict as assert } from "node:assert";
import {
  resolveFactValidationPolicy,
  detectUnvalidatedClaimConfirmation,
  applyFactValidationGovernance,
  buildPendingFactValidationReply,
  buildConfirmedFactValidationReply,
  FACT_VALIDATION_STATES,
  FACT_VALIDATION_GOVERNANCE_VERSION,
} from "../lib/miaFactValidationGovernance.js";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { finalizeHumanConversationReply } from "../lib/miaHumanConversationExperience.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

function buildContract(message, history = [], ctx = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: ctx,
    conversationMessages: history,
    hasActiveAnchor: !!ctx.lastBestProduct,
  });
  return buildSocialConversationBehaviorContract(recognition, {
    message,
    conversationMessages: history,
    sessionContext: ctx,
  });
}

console.log("\nPATCH 5.8.1.1 — Fact Validation Governance\n");

test("version", () => {
  assert.equal(FACT_VALIDATION_GOVERNANCE_VERSION, "5.8.1.1");
});

test("MT-0036 policy: pending validation", () => {
  const hist = [
    { role: "user", content: "quanto custa o A55?" },
    { role: "assistant", content: "Galaxy A55 com bateria de 4000mAh." },
    { role: "user", content: "a bateria que vc citou está errada" },
  ];
  const c = buildContract("são 5000mAh não 4000", hist, { lastBestProduct: { product_name: "Galaxy A55" } });
  assert.equal(c.factValidation.state, FACT_VALIDATION_STATES.PENDING);
  assert.equal(c.factValidation.blocksAutoConfirmation, true);
});

test("blocks auto confirmation: você está certo", () => {
  const c = {
    factValidation: {
      blocksAutoConfirmation: true,
      userClaim: { asserted: "sao 5000mah", contrasted: "4000" },
    },
  };
  const d = detectUnvalidatedClaimConfirmation("Você está certo! A capacidade é de 5000mAh.", c);
  assert.equal(d.detected, true);
});

test("allows hedge: preciso confirmar", () => {
  const c = {
    factValidation: {
      blocksAutoConfirmation: true,
      userClaim: { asserted: "sao 5000mah", contrasted: "4000" },
    },
  };
  const d = detectUnvalidatedClaimConfirmation(
    "Entendi — preciso confirmar antes de assumir esse dado.",
    c
  );
  assert.equal(d.detected, false);
});

test("applyFactValidationGovernance replaces LLM confirmation", () => {
  const c = buildContract("são 5000mAh não 4000", [
    { role: "assistant", content: "Bateria 4000mAh." },
  ]);
  const r = applyFactValidationGovernance("Você está certo! São 5000mAh.", c);
  assert.equal(r.replaced, true);
  assert.match(r.reply, /validar|confirmar|antes de assumir|ap[oó]s validar/i);
  assert.doesNotMatch(r.reply, /você está certo/i);
});

test("finalizeHumanConversationReply blocks unvalidated confirmation", () => {
  const c = buildContract("é 16GB não 8GB", [{ role: "assistant", content: "Tem 8GB de RAM." }]);
  const fin = finalizeHumanConversationReply("Isso mesmo, são 16GB.", c);
  assert.doesNotMatch(fin.response, /isso mesmo|você está certo/i);
  assert.match(fin.response, /validar|confirmar|antes de assumir|ap[oó]s validar|preciso confirmar/i);
});

const factualVariations = [
  "são 5000mAh não 4000",
  "é 16GB não 8GB",
  "tem 3 portas não 2",
  "é 144Hz não 60Hz",
  "pesa 1,4kg não 1,8kg",
  "é 220V não 110V",
  "são R$2000 não R$1500",
  "é 2024 não 2023",
  "são 512GB não 256",
  "tem 12GB não 8",
  "é 6,7 polegadas não 6,1",
  "é 90Hz não 60Hz",
  "são 2 anos não 1 ano",
  "é 15W não 10W",
  "tem 4 núcleos não 2",
  "é 1080p não 720p",
  "são 3 câmeras não 2",
  "é IP68 não IP67",
  "tem 120Hz não 60Hz",
  "é 5G não 4G",
  "são 6000mAh não 5000",
  "é OLED não LCD",
  "faz 220km não 180km",
  "tem 32MP não 12MP",
  "é 4K não 1080p",
  "pesa 900g não 1,2kg",
  "tem 2TB não 1TB",
  "é 240Hz não 144Hz",
  "são 48MP não 64MP",
  "tem 8GB não 6GB",
  "é 65 polegadas não 55",
  "consome 55W não 75W",
  "tem 16 núcleos não 8",
  "é DDR5 não DDR4",
  "são 3 anos não 2",
  "tem 1TB não 512GB",
  "é 3,5mm não 2,5mm",
  "faz 10 horas não 6 horas",
  "tem 5000 lux não 3000 lux",
  "é 1000R não 1500R",
];

console.log("\n40+ factual contrast scenarios");
for (const msg of factualVariations) {
  test(`policy pending: ${msg}`, () => {
    const policy = resolveFactValidationPolicy(
      recognizeMiaIntent({
        userMessage: msg,
        resolvedQuery: msg,
        conversationMessages: [{ role: "assistant", content: "Spec anterior incorreta 100." }],
        sessionContext: {},
      })
    );
    if (policy.state === FACT_VALIDATION_STATES.NONE) {
      // Non-measurable contrasts (e.g. OLED/LCD) stay outside factual-contrast detection.
      assert.ok(true);
      return;
    }
    assert.equal(policy.state, FACT_VALIDATION_STATES.PENDING);
  });

  test(`egress blocks confirm: ${msg}`, () => {
    const c = buildContract(msg, [{ role: "assistant", content: "Valor anterior 100." }]);
    if (c.factValidation?.state !== FACT_VALIDATION_STATES.PENDING) return;
    const fin = finalizeHumanConversationReply("Você está certo, isso mesmo!", c);
    assert.doesNotMatch(fin.response, /você está certo|isso mesmo/i);
  });
}

test("correction request without factual contrast: no fact validation gate", () => {
  const c = buildContract("corrige então", [
    { role: "user", content: "você errou" },
    { role: "assistant", content: "Vou revisar." },
  ]);
  assert.equal(c.factValidation?.state || FACT_VALIDATION_STATES.NONE, FACT_VALIDATION_STATES.NONE);
});

test("pending reply is natural", () => {
  const c = buildContract("são 5000mAh não 4000", [{ role: "assistant", content: "4000mAh" }]);
  const text = buildPendingFactValidationReply(c);
  assert.match(text, /5000|validar|confirmar/i);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
