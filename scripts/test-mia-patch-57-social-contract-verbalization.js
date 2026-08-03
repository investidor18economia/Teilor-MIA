#!/usr/bin/env node
/** PATCH 5.7 — Contract-driven social verbalization tests */
import { strict as assert } from "node:assert";
import {
  buildMirrorGreetingReply,
  buildWarmSocialClarificationReply,
  buildContractDrivenSocialFallback,
  SOCIAL_CONTRACT_VERBALIZATION_VERSION,
} from "../lib/miaSocialContractVerbalization.js";
import { selectGovernedFallback, GOVERNED_FALLBACK_POLICY_VERSION } from "../lib/miaGovernedFallbackPolicy.js";
import { shouldUseWarmImplicitSocialReference } from "../lib/miaSemanticPrecedence.js";
import { EXPECTED_HUMAN_BEHAVIORS } from "../lib/miaSocialIntentTaxonomy.js";
import { RESPONSE_DEPTH } from "../lib/miaHumanConversationExperience.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
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

console.log("PATCH 5.7 social contract verbalization tests\n");

test("versions bumped", () => {
  assert.equal(SOCIAL_CONTRACT_VERBALIZATION_VERSION, "5.8.5");
  assert.equal(GOVERNED_FALLBACK_POLICY_VERSION, "5.7.1");
});

test("greeting mirror includes continuity", () => {
  const reply = buildMirrorGreetingReply({
    userMessageForSpecificity: "oi",
    responseDepth: RESPONSE_DEPTH.BRIEF,
    personalityPolicy: { warmth: "warm_balanced", socialDistance: "friendly_brief" },
    primaryIntent: "greeting",
    socialFamilies: { greeting: true },
    expectedHumanBehavior: EXPECTED_HUMAN_BEHAVIORS.MIRROR_GREETING,
  });
  assert.ok(reply.includes("Opa") || reply.includes("Oi"));
  assert.ok(reply.split(/\s+/).length >= 2, `expected multi-token greeting, got: ${reply}`);
});

test("warm clarification not cold template", () => {
  const reply = buildWarmSocialClarificationReply({
    userMessageForSpecificity: "seca",
    responseDepth: RESPONSE_DEPTH.BRIEF,
    personalityPolicy: { warmth: "warm_light" },
    expectedHumanBehavior: EXPECTED_HUMAN_BEHAVIORS.INVITE_CLARIFICATION,
    interactionMode: MIA_INTERACTION_MODES.SOCIAL,
  });
  assert.ok(!/me diz rapidinho a que você se refere/i.test(reply), reply);
  assert.ok(reply.length > 15, reply);
});

test("selectGovernedFallback uses contract-driven ambiguous", () => {
  const sel = selectGovernedFallback(
    {
      userMessageForSpecificity: "seca",
      responseDepth: RESPONSE_DEPTH.BRIEF,
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      resolvedSemanticTarget: SEMANTIC_TARGETS.UNKNOWN,
      expectedHumanBehavior: EXPECTED_HUMAN_BEHAVIORS.INVITE_CLARIFICATION,
      personalityPolicy: { warmth: "warm_balanced" },
      conversationMessages: [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Opa!" },
      ],
      semanticTargetResolution: { target: SEMANTIC_TARGETS.UNKNOWN },
    },
    { failureReason: "test" }
  );
  assert.ok(sel.contractDriven || sel.functionName?.includes("Warm"), JSON.stringify(sel));
  assert.ok(!/me diz rapidinho a que você se refere/i.test(sel.text), sel.text);
});

test("shouldUseWarmImplicitSocialReference multiturn", () => {
  const ok = shouldUseWarmImplicitSocialReference(
    {
      interactionMode: MIA_INTERACTION_MODES.SOCIAL,
      responseDepth: RESPONSE_DEPTH.BRIEF,
      expectedHumanBehavior: EXPECTED_HUMAN_BEHAVIORS.INVITE_CLARIFICATION,
      conversationMessages: [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Opa!" },
        { role: "user", content: "seca" },
      ],
    },
    { target: SEMANTIC_TARGETS.UNKNOWN }
  );
  assert.equal(ok, true);
});

test("buildContractDrivenSocialFallback reaction", () => {
  const r = buildContractDrivenSocialFallback(
    {
      expectedHumanBehavior: EXPECTED_HUMAN_BEHAVIORS.RECEIVE_REACTION,
      personalityPolicy: { warmth: "warm_light" },
      userMessageForSpecificity: "show",
    },
    "humor",
    {}
  );
  assert.ok(r?.text);
  assert.ok(r.text.length >= 2);
});

console.log(`\nResultado: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
