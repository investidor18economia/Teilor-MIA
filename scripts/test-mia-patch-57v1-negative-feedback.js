#!/usr/bin/env node
/** PATCH 5.7V.1 — Negative feedback taxonomy + verbalization tests */
import { strict as assert } from "node:assert";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { classifySocialIntent, SOCIAL_INTENT_FAMILIES, EXPECTED_HUMAN_BEHAVIORS } from "../lib/miaSocialIntentTaxonomy.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { enrichContractWithSemanticAuthority } from "../lib/miaSemanticAuthority.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import {
  enrichBehaviorContractWithHumanExperience,
  validateHumanConversationResponse,
} from "../lib/miaHumanConversationExperience.js";
import { selectGovernedFallback } from "../lib/miaGovernedFallbackPolicy.js";
import {
  buildWarmCorrectionReply,
  buildWarmDisagreementReply,
  SOCIAL_CONTRACT_VERBALIZATION_VERSION,
} from "../lib/miaSocialContractVerbalization.js";
import { SEMANTIC_TARGETS } from "../lib/miaSemanticTargetResolution.js";

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

const assistantHistory = [
  { role: "assistant", content: "Recomendo o Galaxy A55 pela bateria de 5000mAh." },
];

test("verbalization version 5.7.2", () => {
  assert.equal(SOCIAL_CONTRACT_VERBALIZATION_VERSION, "5.7.2");
});

test("você errou → correction not clarification", () => {
  const { recognition } = buildContract("você errou", { conversationMessages: assistantHistory, hasActiveAnchor: true });
  assert.equal(recognition.primarySocialIntent, SOCIAL_INTENT_FAMILIES.CORRECTION);
  assert.equal(recognition.interactionMode, "social");
  assert.notEqual(recognition.interactionMode, "clarification");
});

test("ficou péssimo → disapproval not frustration", () => {
  const { recognition } = buildContract("ficou péssimo", { conversationMessages: assistantHistory, hasActiveAnchor: true });
  assert.equal(recognition.primarySocialIntent, SOCIAL_INTENT_FAMILIES.DISAPPROVAL);
  assert.notEqual(recognition.primarySocialIntent, SOCIAL_INTENT_FAMILIES.FRUSTRATION);
  assert.equal(recognition.interactionMode, "social");
});

test("discordo → soft_disagreement", () => {
  const { recognition, contract } = buildContract("discordo", { conversationMessages: assistantHistory, hasActiveAnchor: true });
  assert.equal(recognition.primarySocialIntent, SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT);
  const sel = selectGovernedFallback(contract, { failureReason: "test" });
  assert.equal(sel.functionName, "buildWarmDisagreementReply");
});

test("correction uses warm correction builder not irony", () => {
  const { contract } = buildContract("essa resposta está errada", {
    conversationMessages: assistantHistory,
    hasActiveAnchor: true,
  });
  const sel = selectGovernedFallback(contract, { failureReason: "test" });
  assert.equal(sel.functionName, "buildWarmCorrectionReply");
  assert.doesNotMatch(sel.text, /iron/i);
  assert.doesNotMatch(sel.text, /pego a ironia/i);
});

test("correction target previous_answer with context", () => {
  const { contract } = buildContract("você entendeu errado", {
    conversationMessages: assistantHistory,
    hasActiveAnchor: true,
  });
  assert.equal(contract.resolvedSemanticTarget, SEMANTIC_TARGETS.PREVIOUS_ANSWER);
  const text = buildWarmCorrectionReply(contract);
  assert.match(text, /errad|revis|corrig|ponto/i);
});

test("recommendation rejection not product aesthetic", () => {
  const { contract } = buildContract("não gostei dessa recomendação", {
    conversationMessages: assistantHistory,
    hasActiveAnchor: true,
  });
  const sel = selectGovernedFallback(contract, { failureReason: "test" });
  assert.equal(sel.functionName, "buildWarmDisapprovalReply");
  assert.notEqual(sel.functionName, "buildProductAestheticFallback");
  assert.match(sel.text, /recomend|sugest|encaix|perfil|faixa/i);
});

test("product rejection targets product", () => {
  const { contract } = buildContract("esse produto é ruim", {
    conversationMessages: assistantHistory,
    hasActiveAnchor: true,
  });
  assert.equal(contract.resolvedSemanticTarget, SEMANTIC_TARGETS.PRODUCT);
  assert.match(buildWarmDisagreementReply(buildContract("isso não faz sentido", { conversationMessages: assistantHistory, hasActiveAnchor: true }).contract), /racioc|discord|convenc/i);
});

test("isso não faz sentido → disagreement", () => {
  const { recognition } = buildContract("isso não faz sentido", {
    conversationMessages: assistantHistory,
    hasActiveAnchor: true,
  });
  assert.equal(recognition.primarySocialIntent, SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT);
  assert.equal(recognition.expectedHumanBehavior, EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_DISAPPROVAL);
});

test("variation você está errada → correction family", () => {
  const c = classifySocialIntent("você está errada");
  assert.equal(c.primarySocialIntent, SOCIAL_INTENT_FAMILIES.CORRECTION);
});

test("variation ficou ruim → disapproval not frustration", () => {
  const c = classifySocialIntent("ficou ruim");
  assert.equal(c.primarySocialIntent, SOCIAL_INTENT_FAMILIES.DISAPPROVAL);
});

test("variation não concordo → soft_disagreement", () => {
  const c = classifySocialIntent("não concordo");
  assert.equal(c.primarySocialIntent, SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT);
});

test("disapproval fallback validates", () => {
  const { contract } = buildContract("ficou péssimo", { conversationMessages: assistantHistory, hasActiveAnchor: true });
  const sel = selectGovernedFallback(contract, {});
  const v = validateHumanConversationResponse(sel.text, contract);
  assert.equal(v.valid, true, v.violations?.join(","));
});

console.log(`\nResultado: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
