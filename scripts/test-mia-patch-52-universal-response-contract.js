/**
 * PATCH 5.2 — Universal Conversation Response Contract
 *
 * Rodar: node scripts/test-mia-patch-52-universal-response-contract.js
 */

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { finalizeHumanConversationReply } from "../lib/miaHumanConversationExperience.js";
import { GOVERNED_SOCIAL_ROUTING_KEYS } from "../lib/miaSemanticAuthority.js";
import { FALLBACK_FAMILIES } from "../lib/miaGovernedFallbackPolicy.js";
import {
  UNIVERSAL_CONVERSATION_RESPONSE_CONTRACT_VERSION,
  buildUniversalConversationResponseContract,
  buildUniversalContractFromCommercialDelivery,
  buildUniversalContractFromHumanFinalization,
  resolveFallbackFamilyPolicy,
  validateUniversalContractShape,
  universalConversationResponseContractToTrace,
} from "../lib/miaUniversalConversationResponseContract.js";

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
  if (a !== b) {
    throw new Error(
      `Expected ${JSON.stringify(b)} got ${JSON.stringify(a)}${label ? ` [${label}]` : ""}`
    );
  }
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

console.log("\nPATCH 5.2 — Universal Conversation Response Contract\n");

test("1. contract version is 5.2.0", () => {
  expectEqual(UNIVERSAL_CONVERSATION_RESPONSE_CONTRACT_VERSION, "5.2.0");
});

test("2. validateUniversalContractShape accepts well-formed envelope", () => {
  const contract = buildContract("Oi");
  const envelope = buildUniversalConversationResponseContract({
    behaviorContract: contract,
    responsePath: "greeting_flow",
  });
  const shape = validateUniversalContractShape(envelope);
  expectTrue(shape.valid, "shape valid");
  expectEqual(shape.violations.length, 0);
});

test("3. greeting envelope carries routing and decision sections", () => {
  const contract = buildContract("Oi");
  const envelope = buildUniversalConversationResponseContract({
    behaviorContract: contract,
    responsePath: "greeting_flow",
  });
  expectTrue(envelope.decision);
  expectTrue(envelope.experience);
  expectTrue(envelope.fallback);
  expectTrue(envelope.verbalization);
  expectTrue(envelope.delivery);
  expectEqual(envelope.delivery.responsePath, "greeting_flow");
});

test("4. ambiguous_social fallback policy forbids commercial families", () => {
  const contract = buildContract("Linda");
  expectEqual(
    contract.governedSocialRoutingKey,
    GOVERNED_SOCIAL_ROUTING_KEYS.AMBIGUOUS_SOCIAL
  );
  const policy = resolveFallbackFamilyPolicy(contract, contract.semanticTargetResolution);
  expectEqual(policy.primaryFamily, FALLBACK_FAMILIES.AMBIGUOUS_SOCIAL);
  expectTrue(policy.forbiddenFamilies.includes(FALLBACK_FAMILIES.COMMERCIAL));
  expectTrue(policy.forbiddenFamilies.includes(FALLBACK_FAMILIES.PRODUCT_AESTHETIC));
});

test("5. finalizeHumanConversationReply attaches universalContract", () => {
  const contract = buildContract("Linda");
  const fin = finalizeHumanConversationReply("Obrigada!", contract, null, {
    universalContext: { responsePath: "governed_social_intent_flow" },
  });
  expectTrue(fin.universalContract);
  expectEqual(fin.universalContract.version, "5.2.0");
  expectEqual(fin.universalContract.delivery.responsePath, "governed_social_intent_flow");
  expectTrue(fin.universalContract.verbalization.rawResponse != null);
  expectTrue(fin.universalContract.verbalization.finalizedResponse != null);
});

test("6. buildUniversalContractFromHumanFinalization preserves repair trace", () => {
  const contract = buildContract("Incrível");
  const fin = finalizeHumanConversationReply("O Celular tem um visual bem marcante.", contract);
  const envelope = buildUniversalContractFromHumanFinalization(contract, fin, {
    responsePath: "governed_social_intent_flow",
  });
  expectTrue(envelope.repair);
  if (fin.usedFallback) {
    expectTrue(envelope.repair.applied);
  }
  expectEqual(envelope.validation.valid, fin.validation?.valid ?? null);
});

test("7. commercial delivery envelope does not require behavior contract input", () => {
  const recognition = recognizeMiaIntent({
    userMessage: "seguro de viagem barato",
    resolvedQuery: "seguro de viagem barato",
    sessionContext: {},
    conversationMessages: [],
    hasActiveAnchor: false,
  });
  const envelope = buildUniversalContractFromCommercialDelivery({
    intentRecognition: recognition,
    routingDecision: { mode: "commerce", conversationAct: "product_search" },
    reply: "Encontrei opções de seguro viagem.",
    responsePath: "return_seguro",
  });
  const shape = validateUniversalContractShape(envelope);
  expectTrue(shape.valid);
  expectEqual(envelope.delivery.responsePath, "return_seguro");
  expectEqual(envelope.verbalization.finalizedResponse, "Encontrei opções de seguro viagem.");
});

test("8. universalConversationResponseContractToTrace is compact", () => {
  const contract = buildContract("Oi");
  const fin = finalizeHumanConversationReply("Oi! Tudo bem?", contract);
  const trace = universalConversationResponseContractToTrace(fin.universalContract);
  expectEqual(trace.version, "5.2.0");
  expectTrue("routingKey" in trace);
  expectTrue("validationValid" in trace);
  expectTrue("repairApplied" in trace);
});

test("9. envelope references behavior contract without duplicating full contract", () => {
  const contract = buildContract("Show");
  const envelope = buildUniversalConversationResponseContract({ behaviorContract: contract });
  expectTrue(envelope.references.behaviorContractPresent);
  expectFalse(envelope.references.routingDecisionPresent);
  expectFalse("behaviorContract" in envelope);
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.error("Failures:");
  for (const f of failures) {
    console.error(`  - ${f.label}: ${f.error}`);
  }
  process.exit(1);
}

process.exit(0);
