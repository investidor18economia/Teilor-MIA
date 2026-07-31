/**
 * PATCH 4.1I.3.V.2.2 — Governed ambiguous social policy (contract-based)
 *
 * Rodar: node scripts/test-mia-patch-41i3v22-ambiguous-social-policy.js
 */

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { finalizeHumanConversationReply } from "../lib/miaHumanConversationExperience.js";
import { resolveClarificationDecision } from "../lib/miaClarificationGates.js";
import { SEMANTIC_TARGETS } from "../lib/miaSemanticTargetResolution.js";
import {
  isGovernedAmbiguousSocialContract,
  isProductAestheticFallbackPermitted,
  isMiaComplimentGovernedContract,
  GOVERNED_SOCIAL_ROUTING_KEYS,
} from "../lib/miaSemanticAuthority.js";
import {
  selectGovernedFallback,
  FALLBACK_FAMILIES,
} from "../lib/miaGovernedFallbackPolicy.js";

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

function buildContract(message, conversationMessages = [], sessionContext = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext,
    conversationMessages,
    hasActiveAnchor: conversationMessages.length > 0,
  });
  return buildSocialConversationBehaviorContract(recognition, {
    message,
    conversationMessages,
    sessionContext,
  });
}

console.log("\nPATCH 4.1I.3.V.2.2 — ambiguous social policy (contract-based)\n");

test("1. isolated short evaluative → ambiguous_social routing", () => {
  const c = buildContract("Linda");
  expectEqual(c.resolvedSemanticTarget, SEMANTIC_TARGETS.UNKNOWN);
  expectEqual(c.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.AMBIGUOUS_SOCIAL);
  expectTrue(isGovernedAmbiguousSocialContract(c, c.semanticTargetResolution));
});

test("2. isolated short evaluative → product fallback blocked", () => {
  const c = buildContract("Bonito");
  expectFalse(isProductAestheticFallbackPermitted(c, c.semanticTargetResolution));
  const fb = selectGovernedFallback(c, { failureReason: "test" });
  expectEqual(fb.family, FALLBACK_FAMILIES.AMBIGUOUS_SOCIAL);
});

test("3. isolated short evaluative → mia compliment contract blocked", () => {
  const c = buildContract("Linda");
  expectFalse(isMiaComplimentGovernedContract(c, c.semanticTargetResolution));
});

test("4. isolated → finalize replaces product assumption", () => {
  const c = buildContract("Incrível");
  const fin = finalizeHumanConversationReply("O Celular tem um visual bem marcante.", c);
  expectTrue(fin.usedFallback);
  expectEqual(fin.selectedFallbackFamily || fin.governedFallback?.family, FALLBACK_FAMILIES.AMBIGUOUS_SOCIAL);
  expectFalse(/\bvisual bem marcante\b/i.test(fin.response));
});

test("5. isolated → finalize replaces mia thanks assumption", () => {
  const c = buildContract("Sensacional");
  const fin = finalizeHumanConversationReply("Obrigada! Fico feliz.", c);
  expectTrue(fin.usedFallback);
  expectFalse(/\bobrigad/i.test(fin.response));
});

test("6. B2 with MIA context → mia_compliment preserved", () => {
  const hist = [
    { role: "user", content: "Oi, MIA" },
    { role: "assistant", content: "Opa!" },
  ];
  const c = buildContract("Linda", hist);
  expectEqual(c.resolvedSemanticTarget, SEMANTIC_TARGETS.MIA);
  expectEqual(c.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.MIA_COMPLIMENT);
  expectFalse(isGovernedAmbiguousSocialContract(c, c.semanticTargetResolution));
});

test("7. B1 product context → product_aesthetic preserved", () => {
  const hist = [
    { role: "user", content: "O que você acha do design do Galaxy A55?" },
    { role: "assistant", content: "O Galaxy A55 tem um visual marcante." },
  ];
  const c = buildContract("Linda", hist, { lastBestProduct: { product_name: "Galaxy A55" } });
  expectEqual(c.resolvedSemanticTarget, SEMANTIC_TARGETS.PRODUCT);
  expectEqual(c.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.PRODUCT_AESTHETIC_OPINION);
  expectFalse(isGovernedAmbiguousSocialContract(c, c.semanticTargetResolution));
  expectTrue(isProductAestheticFallbackPermitted(c, c.semanticTargetResolution));
});

test("8. B2 stale session anchor → still mia_compliment", () => {
  const hist = [
    { role: "user", content: "Oi, MIA" },
    { role: "assistant", content: "Opa!" },
  ];
  const c = buildContract("Linda", hist, { lastBestProduct: { product_name: "Galaxy A55" } });
  expectEqual(c.resolvedSemanticTarget, SEMANTIC_TARGETS.MIA);
  expectFalse(isGovernedAmbiguousSocialContract(c, c.semanticTargetResolution));
});

test("9. ambiguous social → clarification gate deferred", () => {
  const c = buildContract("Incrível");
  const clar = resolveClarificationDecision({
    query: "Incrível",
    intentRecognition: recognizeMiaIntent({
      userMessage: "Incrível",
      resolvedQuery: "Incrível",
      requiresClarification: true,
      interactionMode: "clarification",
      sessionContext: {},
      conversationMessages: [],
    }),
    contextResolution: { needsClarification: true },
    socialBehaviorContract: c,
  });
  expectFalse(clar.needsClarification);
  expectTrue(clar.reasonCodes.includes("ambiguous_social_contract_deferred_to_governed_policy"));
});

test("10. response approval with assistant context → not ambiguous", () => {
  const hist = [
    { role: "user", content: "Explique OLED" },
    { role: "assistant", content: "OLED usa pixels autoiluminados." },
  ];
  const c = buildContract("Muito boa", hist);
  expectEqual(c.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.RESPONSE_APPROVAL);
  expectFalse(isGovernedAmbiguousSocialContract(c, c.semanticTargetResolution));
});

test("11. short social without eval intent but unknown → ambiguous", () => {
  const c = buildContract("Incrível");
  expectTrue(isGovernedAmbiguousSocialContract(c, c.semanticTargetResolution));
});

test("12. product contract → ambiguous social fallback blocked", () => {
  const hist = [
    { role: "user", content: "O que você acha do design do Galaxy A55?" },
    { role: "assistant", content: "Visual marcante." },
  ];
  const c = buildContract("Linda", hist);
  const fb = selectGovernedFallback(c, { failureReason: "test" });
  expectEqual(fb.family, FALLBACK_FAMILIES.PRODUCT_AESTHETIC);
});

console.log(`\n${"─".repeat(50)}`);
console.log(`Passed: ${passed} | Failed: ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
console.log("\n✅ PATCH 4.1I.3.V.2.2 ambiguous social policy tests passed\n");
