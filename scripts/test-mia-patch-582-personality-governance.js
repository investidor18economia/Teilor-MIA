#!/usr/bin/env node
/**
 * PATCH 5.8.2 — Central Personality Governance tests
 * Run: node scripts/test-mia-patch-582-personality-governance.js
 */

import { strict as assert } from "node:assert";
import {
  PERSONALITY_GOVERNANCE_VERSION,
  MIA_IDENTITY,
  detectPerceivedEmotionalValence,
  detectReciprocalSocialPrompt,
  classifyIdentityQuery,
  enrichContractWithPersonalityGovernance,
  buildGovernedIdentityReply,
  buildPersonalityGovernedReciprocalReply,
  buildPersonalityGovernedEmotionalReply,
  buildPersonalityGovernedClarificationReply,
  buildPersonalityGovernedStaySocialReply,
  personalityGovernanceToVerbalizationInstructions,
  applyPersonalityGovernance,
  detectPersonalityViolations,
  shouldBlockContextualPositiveEcho,
  EMOTIONAL_VALENCE,
  IDENTITY_QUERY_KIND,
} from "../lib/miaPersonalityGovernance.js";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import {
  finalizeHumanConversationReply,
  buildGovernedSocialFallbackReply,
} from "../lib/miaHumanConversationExperience.js";
import {
  buildContractDrivenSocialFallback,
  buildMirrorGreetingReply,
  buildWarmContextualApprovalReply,
} from "../lib/miaSocialContractVerbalization.js";
import { EXPECTED_HUMAN_BEHAVIORS } from "../lib/miaSocialIntentTaxonomy.js";

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

console.log("\nPATCH 5.8.2 — Personality Governance\n");

test("version", () => {
  assert.equal(PERSONALITY_GOVERNANCE_VERSION, "5.8.2");
});

test("MIA identity constants", () => {
  assert.equal(MIA_IDENTITY.name, "MIA");
  assert.ok(MIA_IDENTITY.essence.includes("acolhedora"));
});

// Emotional valence (~15)
const distressCases = [
  "não tô legal",
  "to meio down",
  "não estou bem",
  "semana pesada",
  "dia difícil",
  "to mal hoje",
];
for (const msg of distressCases) {
  test(`distress: ${msg}`, () => {
    assert.equal(detectPerceivedEmotionalValence(msg, {}), EMOTIONAL_VALENCE.DISTRESS);
  });
}

test("neutral: oi", () => {
  assert.equal(detectPerceivedEmotionalValence("oi", {}), EMOTIONAL_VALENCE.NEUTRAL);
});

// Reciprocal (~10)
const reciprocalCases = ["e você?", "e contigo?", "como você tá?", "como foi seu dia?"];
for (const msg of reciprocalCases) {
  test(`reciprocal: ${msg}`, () => {
    assert.equal(detectReciprocalSocialPrompt(msg), true);
  });
}

// Identity classification (~15)
test("identity name", () => {
  assert.equal(classifyIdentityQuery("qual seu nome?"), IDENTITY_QUERY_KIND.NAME);
});
test("identity who", () => {
  assert.equal(classifyIdentityQuery("quem é você?"), IDENTITY_QUERY_KIND.WHO);
});
test("identity how", () => {
  assert.equal(classifyIdentityQuery("como você funciona?"), IDENTITY_QUERY_KIND.HOW_WORKS);
});
test("identity creator", () => {
  assert.equal(classifyIdentityQuery("quem te criou?"), IDENTITY_QUERY_KIND.CREATOR);
});
test("identity real", () => {
  assert.equal(classifyIdentityQuery("você é real?"), IDENTITY_QUERY_KIND.REAL);
});

// Contract enrichment (~20)
test("contract has personality governance", () => {
  const c = buildContract("oi");
  assert.equal(c.personalityGovernanceVersion, "5.8.2");
  assert.ok(c.centralPersonalityPolicy);
  assert.ok(c.personalityPolicy?.centralGovernance);
});

test("identity contract sets ANSWER_META", () => {
  const c = buildContract("qual seu nome?");
  assert.equal(c.expectedHumanBehavior, EXPECTED_HUMAN_BEHAVIORS.ANSWER_META);
  assert.ok(c.identityQueryKind);
  assert.equal(c.personalityGovernanceBypass, true);
});

test("distress sets VALIDATE_EMOTION", () => {
  const c = buildContract("não tô legal");
  assert.equal(c.expectedHumanBehavior, EXPECTED_HUMAN_BEHAVIORS.VALIDATE_EMOTION);
  assert.equal(c.emotionalGate.blockPositiveEcho, true);
});

test("reciprocal sets RECIPROCATE_WARMTH", () => {
  const c = buildContract("e você?");
  assert.equal(c.expectedHumanBehavior, EXPECTED_HUMAN_BEHAVIORS.RECIPROCATE_WARMTH);
});

test("session warmth persists", () => {
  const ctx = {
    miaPersonalityState: {
      version: "5.8.2",
      warmth: "warm_light",
      socialDistance: "light_playful",
    },
  };
  const c = buildContract("oi", [], ctx);
  assert.equal(c.centralPersonalityPolicy.warmth, "warm_light");
});

// Identity replies (~10)
test("identity reply mentions MIA", () => {
  const c = buildContract("qual seu nome?");
  const reply = buildGovernedIdentityReply(c);
  assert.match(reply, /MIA/i);
  assert.ok(reply.length > 10);
});

test("identity not stay_social generic", () => {
  const c = buildContract("qual seu nome?");
  const fb = buildContractDrivenSocialFallback(c, "", {});
  assert.equal(fb.builder, "buildGovernedIdentityReply");
  assert.match(fb.text, /MIA/i);
});

// Emotional gate (~15)
test("block positive echo on legal token", () => {
  const c = buildContract("não tô legal");
  assert.equal(shouldBlockContextualPositiveEcho(c, "legal"), true);
});

test("no Boa — legal on distress", () => {
  const c = enrichContractWithPersonalityGovernance(
    { userMessageForSpecificity: "não tô legal", contentAnchors: ["legal"] },
    { message: "não tô legal", recognition: { emotionalState: "frustrated" } }
  );
  c.emotionalGate = { blockPositiveEcho: true, requireEmotionalValidation: true };
  const approval = buildWarmContextualApprovalReply(c);
  assert.doesNotMatch(approval, /Boa — legal/i);
  assert.match(approval, /entendo|compreendo|pesa|pesado/i);
});

test("applyPersonalityGovernance fixes Boa — legal", () => {
  const c = buildContract("não tô legal");
  const r = applyPersonalityGovernance("Boa — legal!", c);
  assert.equal(r.replaced, true);
  assert.doesNotMatch(r.reply, /Boa — legal/i);
});

test("finalize blocks positive echo", () => {
  const c = buildContract("não tô legal");
  const out = finalizeHumanConversationReply("Boa — legal!", c, null, {});
  assert.doesNotMatch(out.response, /Boa — legal/i);
});

// Reciprocal (~10)
test("reciprocal reply not generic stay_social", () => {
  const c = buildContract("e você?");
  const reply = buildPersonalityGovernedReciprocalReply(c);
  assert.match(reply, /por aqui|tranquilo|certo/i);
  assert.match(reply, /você|contigo/i);
});

test("reciprocal fallback builder", () => {
  const c = buildContract("e você?");
  const fb = buildContractDrivenSocialFallback(c, "", {});
  assert.equal(fb.builder, "buildPersonalityGovernedReciprocalReply");
});

// Clarification (~10)
test("clarification not rapidinho", () => {
  const c = buildContract("péssimo");
  const reply = buildPersonalityGovernedClarificationReply(c);
  assert.doesNotMatch(reply, /rapidinho/i);
  assert.ok(reply.length > 15);
});

test("cold clarification violation detected", () => {
  const c = buildContract("péssimo");
  const v = detectPersonalityViolations("Me diz rapidinho a que você se refere.", c);
  assert.ok(v.includes("cold_clarification_personality"));
});

test("apply fixes cold clarification", () => {
  const c = buildContract("péssimo");
  const r = applyPersonalityGovernance("Me diz rapidinho a que você se refere.", c);
  assert.equal(r.replaced, true);
  assert.doesNotMatch(r.reply, /rapidinho/i);
});

// Greeting (~8)
test("greeting has warmth hook", () => {
  const c = buildContract("oi");
  const reply = buildMirrorGreetingReply(c);
  assert.match(reply, /Oi!/i);
  assert.ok(reply.split(/\s+/).length >= 4);
});

// Stay social (~8)
test("stay_social not generic when governed", () => {
  const c = buildContract("só queria conversar");
  const reply = buildPersonalityGovernedStaySocialReply(c);
  assert.doesNotMatch(reply, /Claro, pode falar comigo/i);
  assert.ok(reply.length > 12);
});

// LLM instructions (~5)
test("personality instructions present", () => {
  const c = buildContract("oi");
  const instr = personalityGovernanceToVerbalizationInstructions(c);
  assert.match(instr, /Personalidade central MIA/i);
  assert.match(instr, /MESMA personalidade/i);
});

// Governed fallback integration (~10)
const scenarioMatrix = [
  { id: "GR-01", msg: "oi", expect: /Oi!/i },
  { id: "ID-01", msg: "qual seu nome?", expect: /MIA/i },
  { id: "ID-02", msg: "quem é você?", expect: /MIA|assistente/i },
  { id: "EM-01", msg: "não tô legal", reject: /Boa — legal/i },
  { id: "RC-01", msg: "e você?", expect: /você|contigo/i },
  { id: "CL-01", msg: "péssimo", reject: /rapidinho/i },
  { id: "HU-01", msg: "kkk", expect: /./ },
  { id: "CO-01", msg: "você é legal", expect: /./ },
  { id: "CA-01", msg: "tudo bem?", expect: /./ },
  { id: "PE-01", msg: "você tem personalidade?", expect: /MIA|assistente/i },
];

for (const sc of scenarioMatrix) {
  test(`matrix ${sc.id}: ${sc.msg}`, () => {
    const c = buildContract(sc.msg);
    const reply = buildGovernedSocialFallbackReply(c, {});
    if (sc.expect) assert.match(reply, sc.expect);
    if (sc.reject) assert.doesNotMatch(reply, sc.reject);
    assert.ok(reply.length > 2);
  });
}

// Dual path consistency (~5)
test("template and finalize agree on identity", () => {
  const c = buildContract("qual seu nome?");
  const t = buildGovernedIdentityReply(c);
  const f = finalizeHumanConversationReply(t, c, null, {}).response;
  assert.match(f, /MIA/i);
});

test("emotional finalize not approval", () => {
  const c = buildContract("to meio down");
  const f = finalizeHumanConversationReply("Show — down!", c, null, {}).response;
  assert.doesNotMatch(f, /Show — down/i);
});

// Expanded directed scenarios (~60)
const greetingBatch = ["oi", "Opa!", "Bom dia", "Boa tarde", "E aí", "Salve", "Hey", "Olá"];
for (const msg of greetingBatch) {
  test(`greeting batch: ${msg}`, () => {
    const c = buildContract(msg);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.ok(reply.length > 2);
    assert.doesNotMatch(reply, /rapidinho/i);
  });
}

const identityBatch = [
  "qual seu nome?",
  "quem é você?",
  "como você funciona?",
  "quem te criou?",
  "você é real?",
  "o que você faz?",
  "me conta sobre você",
  "você tem personalidade?",
];
for (const msg of identityBatch) {
  test(`identity batch: ${msg}`, () => {
    const c = buildContract(msg);
    assert.equal(c.expectedHumanBehavior, EXPECTED_HUMAN_BEHAVIORS.ANSWER_META);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.match(reply, /MIA|assistente|compras/i);
    assert.doesNotMatch(reply, /Claro, pode falar comigo/i);
  });
}

const distressBatch = [
  "não tô legal",
  "to meio down",
  "semana pesada",
  "não estou bem",
  "dia difícil",
  "to mal",
  "me sinto mal",
];
for (const msg of distressBatch) {
  test(`distress batch finalize: ${msg}`, () => {
    const c = buildContract(msg);
    const out = finalizeHumanConversationReply("Boa — legal!", c, null, {}).response;
    assert.doesNotMatch(out, /Boa — legal/i);
    assert.match(out, /entendo|compreendo|pesa|pesado|simples/i);
  });
}

const reciprocalBatch = ["e você?", "e contigo?", "como você tá?", "como foi seu dia?", "e aí, como tá?"];
for (const msg of reciprocalBatch) {
  test(`reciprocal batch: ${msg}`, () => {
    const c = buildContract(msg);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.match(reply, /você|contigo|por aqui|tranquilo/i);
    assert.doesNotMatch(reply, /Claro, pode falar comigo/i);
  });
}

const clarBatch = ["péssimo", "horrível", "ruim", "não gostei", "chato"];
for (const msg of clarBatch) {
  test(`clarification batch: ${msg}`, () => {
    const c = buildContract(msg);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.doesNotMatch(reply, /rapidinho/i);
  });
}

console.log(`\n${"=".repeat(50)}`);
console.log(`PATCH 5.8.2 tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
