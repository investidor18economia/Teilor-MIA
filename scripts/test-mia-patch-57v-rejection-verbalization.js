#!/usr/bin/env node
/** PATCH 5.7V — Rejection / disapproval verbalization tests */
import { strict as assert } from "node:assert";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { enrichContractWithSemanticAuthority } from "../lib/miaSemanticAuthority.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import {
  enrichBehaviorContractWithHumanExperience,
  validateHumanConversationResponse,
} from "../lib/miaHumanConversationExperience.js";
import { selectGovernedFallback } from "../lib/miaGovernedFallbackPolicy.js";
import { EXPECTED_HUMAN_BEHAVIORS, SOCIAL_INTENT_FAMILIES } from "../lib/miaSocialIntentTaxonomy.js";
import { buildWarmDisapprovalReply } from "../lib/miaSocialContractVerbalization.js";

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

function buildContract(message, extra = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: extra.sessionContext || {},
    conversationMessages: extra.conversationMessages || [],
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  let contract = buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
    conversationMessages: extra.conversationMessages || [],
  });
  contract = enrichContractWithSemanticAuthority(contract, {
    recognition,
    conversationMessages: extra.conversationMessages || [],
    sessionContext: extra.sessionContext || {},
  });
  contract = enrichBehaviorContractWithHumanExperience(contract, {
    recognition,
    authority,
    message,
    conversationMessages: extra.conversationMessages || [],
  });
  contract.userMessageForSpecificity = message;
  return { recognition, contract };
}

test("não gostei classified as disapproval not clarification", () => {
  const { recognition } = buildContract("não gostei");
  assert.equal(recognition.primarySocialIntent, SOCIAL_INTENT_FAMILIES.DISAPPROVAL);
  assert.equal(recognition.interactionMode, "social");
  assert.notEqual(recognition.interactionMode, "clarification");
  assert.equal(recognition.expectedHumanBehavior, EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_DISAPPROVAL);
});

test("não gostei fallback validates with specificity", () => {
  const { contract } = buildContract("não gostei");
  const sel = selectGovernedFallback(contract, { failureReason: "test" });
  assert.equal(sel.functionName, "buildWarmDisapprovalReply");
  assert.match(sel.text, /gostei/i);
  const v = validateHumanConversationResponse(sel.text, contract);
  assert.equal(v.valid, true, v.violations?.join(","));
});

test("não gostei desse celular targets product disapproval", () => {
  const { contract } = buildContract("não gostei desse celular");
  const text = buildWarmDisapprovalReply(contract);
  assert.match(text, /gostei|celular|produto|incomodou|pesou/i);
});

test("gostei classified as approval", () => {
  const { recognition, contract } = buildContract("gostei");
  assert.equal(recognition.primarySocialIntent, SOCIAL_INTENT_FAMILIES.APPROVAL);
  const sel = selectGovernedFallback(contract, {});
  assert.equal(sel.functionName, "buildWarmApprovalReply");
  assert.equal(validateHumanConversationResponse(sel.text, contract).valid, true);
});

console.log(`\nResultado: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
