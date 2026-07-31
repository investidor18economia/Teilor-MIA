/**
 * PATCH 4.1I.3.V.2.1 — Product aesthetic frame blocked under mia_compliment (contract-based)
 *
 * Rodar: node scripts/test-mia-patch-41i3v21-product-frame-invariant.js
 *
 * Invariant: when governed contract is mia_compliment, no product_aesthetic fallback/frame
 * may be selected. Uses contract objects only — never response text patterns.
 */

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { finalizeHumanConversationReply } from "../lib/miaHumanConversationExperience.js";
import { resolveSemanticTarget, SEMANTIC_TARGETS } from "../lib/miaSemanticTargetResolution.js";
import {
  isMiaComplimentGovernedContract,
  isProductAestheticFallbackPermitted,
  GOVERNED_SOCIAL_ROUTING_KEYS,
} from "../lib/miaSemanticAuthority.js";
import { selectGovernedFallback, FALLBACK_FAMILIES } from "../lib/miaGovernedFallbackPolicy.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    → ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function expectEqual(a, b, label = "") {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)} got ${JSON.stringify(a)}${label ? ` [${label}]` : ""}`);
}

function expectTrue(val, label = "") {
  if (!val) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function expectFalse(val, label = "") {
  if (val) throw new Error(`Expected falsy${label ? ` [${label}]` : ""}`);
}

function buildB2WithStaleSessionAnchor() {
  const conversationMessages = [
    { role: "user", content: "Oi, MIA" },
    { role: "assistant", content: "Opa!" },
  ];
  const sessionContext = { lastBestProduct: { product_name: "Galaxy A55" } };
  const recognition = recognizeMiaIntent({
    userMessage: "Linda",
    resolvedQuery: "Linda",
    sessionContext,
    conversationMessages,
    hasActiveAnchor: true,
  });
  return buildSocialConversationBehaviorContract(recognition, {
    message: "Linda",
    conversationMessages,
    sessionContext,
  });
}

function buildB1ProductLindaWithSessionAnchor() {
  const conversationMessages = [
    { role: "user", content: "O que você acha do design do Galaxy A55?" },
    { role: "assistant", content: "O Galaxy A55 tem um visual marcante." },
  ];
  const sessionContext = { lastBestProduct: { product_name: "Galaxy A55" } };
  const recognition = recognizeMiaIntent({
    userMessage: "Linda",
    resolvedQuery: "Linda",
    sessionContext,
    conversationMessages,
    hasActiveAnchor: true,
  });
  return buildSocialConversationBehaviorContract(recognition, {
    message: "Linda",
    conversationMessages,
    sessionContext,
  });
}

console.log("\nPATCH 4.1I.3.V.2.1 — product frame invariant (contract-based)\n");

test("1. stale session anchor: B2 target=mia (not product)", () => {
  const contract = buildB2WithStaleSessionAnchor();
  expectEqual(contract.resolvedSemanticTarget, SEMANTIC_TARGETS.MIA);
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.MIA_COMPLIMENT);
});

test("2. stale session anchor: resolveSemanticTarget reason excludes short_aesthetic_with_product_context", () => {
  const contract = buildB2WithStaleSessionAnchor();
  const tr = contract.semanticTargetResolution || resolveSemanticTarget({
    message: "Linda",
    recognition: recognizeMiaIntent({
      userMessage: "Linda",
      resolvedQuery: "Linda",
      sessionContext: { lastBestProduct: { product_name: "Galaxy A55" } },
      conversationMessages: [
        { role: "user", content: "Oi, MIA" },
        { role: "assistant", content: "Opa!" },
      ],
      hasActiveAnchor: true,
    }),
    conversationMessages: [
      { role: "user", content: "Oi, MIA" },
      { role: "assistant", content: "Opa!" },
    ],
    sessionContext: { lastBestProduct: { product_name: "Galaxy A55" } },
  });
  expectEqual(tr.target, SEMANTIC_TARGETS.MIA);
  expectFalse((tr.reasonCodes || []).includes("short_aesthetic_with_product_context"));
});

test("3. mia_compliment contract: isProductAestheticFallbackPermitted=false", () => {
  const contract = buildB2WithStaleSessionAnchor();
  expectTrue(isMiaComplimentGovernedContract(contract, contract.semanticTargetResolution));
  expectFalse(isProductAestheticFallbackPermitted(contract, contract.semanticTargetResolution));
});

test("4. mia_compliment contract: selectGovernedFallback never product_aesthetic", () => {
  const contract = buildB2WithStaleSessionAnchor();
  const fb = selectGovernedFallback(contract, { failureReason: "integration_test" });
  expectEqual(fb.family, FALLBACK_FAMILIES.COMPLIMENT);
  expectFalse(fb.functionName === "buildProductAestheticFallback");
  expectTrue((fb.reasonCodes || []).every((c) => c !== "product_aesthetic_allowed"));
});

test("5. mia_compliment contract: resolveFallbackFamily never product_aesthetic", () => {
  const contract = buildB2WithStaleSessionAnchor();
  const fb = selectGovernedFallback(contract, { failureReason: "forced_product_frame" });
  expectFalse(fb.family === FALLBACK_FAMILIES.PRODUCT_AESTHETIC);
});

test("6. B1 product context: target=product, routing=product_aesthetic_opinion", () => {
  const contract = buildB1ProductLindaWithSessionAnchor();
  expectEqual(contract.resolvedSemanticTarget, SEMANTIC_TARGETS.PRODUCT);
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.PRODUCT_AESTHETIC_OPINION);
});

test("7. B1 product context: isMiaComplimentGovernedContract=false despite mia_target signal", () => {
  const contract = buildB1ProductLindaWithSessionAnchor();
  expectFalse(isMiaComplimentGovernedContract(contract, contract.semanticTargetResolution));
  expectTrue(isProductAestheticFallbackPermitted(contract, contract.semanticTargetResolution));
});

test("8. B1 product context: selectGovernedFallback=product_aesthetic", () => {
  const contract = buildB1ProductLindaWithSessionAnchor();
  const fb = selectGovernedFallback(contract, { failureReason: "integration_test" });
  expectEqual(fb.family, FALLBACK_FAMILIES.PRODUCT_AESTHETIC);
  expectEqual(fb.functionName, "buildProductAestheticFallback");
});

test("9. integration: stale anchor + LLM product frame → finalize replaces via contract", () => {
  const contract = buildB2WithStaleSessionAnchor();
  const fin = finalizeHumanConversationReply("O Celular tem um visual bem marcante.", contract);
  expectTrue(fin.usedFallback || fin.validation?.valid === false);
  expectEqual(contract.resolvedSemanticTarget, SEMANTIC_TARGETS.MIA);
  expectFalse(fin.validation?.reasonCodes?.includes?.("product_aesthetic_allowed"));
});

test("10. scanConversationForProductContext: session-only anchor does not set hasRecentProductDiscussion", () => {
  const contract = buildB2WithStaleSessionAnchor();
  const tr = contract.semanticTargetResolution;
  expectFalse(tr?.hasRecentProductDiscussion === true && tr?.hasConversationProductDiscussion === false);
});

test("11. governed routing key mia_compliment blocks product aesthetic at policy layer", () => {
  const contract = {
    interactionMode: "social",
    resolvedSemanticTarget: SEMANTIC_TARGETS.MIA,
    governedSocialRoutingKey: GOVERNED_SOCIAL_ROUTING_KEYS.MIA_COMPLIMENT,
    primarySocialIntent: "compliment",
    socialIntentSignals: ["compliment", "mia_target"],
    semanticTargetResolution: { target: SEMANTIC_TARGETS.MIA },
  };
  expectFalse(isProductAestheticFallbackPermitted(contract, contract.semanticTargetResolution));
  const fb = selectGovernedFallback(contract, { failureReason: "unit_contract" });
  expectEqual(fb.family, FALLBACK_FAMILIES.COMPLIMENT);
});

test("12. governed routing key product_aesthetic_opinion permits product fallback", () => {
  const contract = {
    interactionMode: "social",
    resolvedSemanticTarget: SEMANTIC_TARGETS.PRODUCT,
    governedSocialRoutingKey: GOVERNED_SOCIAL_ROUTING_KEYS.PRODUCT_AESTHETIC_OPINION,
    primarySocialIntent: "compliment",
    productReference: "Galaxy A55",
    semanticTargetResolution: { target: SEMANTIC_TARGETS.PRODUCT },
  };
  expectTrue(isProductAestheticFallbackPermitted(contract, contract.semanticTargetResolution));
  const fb = selectGovernedFallback(contract, { failureReason: "unit_contract" });
  expectEqual(fb.family, FALLBACK_FAMILIES.PRODUCT_AESTHETIC);
});

console.log(`\n${"─".repeat(50)}`);
console.log(`Passed: ${passed} | Failed: ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
console.log("\n✅ PATCH 4.1I.3.V.2.1 product frame invariant tests passed\n");
