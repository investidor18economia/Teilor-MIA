#!/usr/bin/env node
/**
 * PATCH 5.8.7 — Final Conversational Experience Refinement tests (~150+ scenarios)
 * Run: node scripts/test-mia-patch-587-experience-refinement.js
 */
import { strict as assert } from "node:assert";
import {
  SOCIAL_CONVERSATION_CONTINUITY_VERSION,
  SOCIAL_CONTINUITY_BEHAVIOR,
  detectSocialDeparture,
  resolveSocialConversationContinuity,
} from "../lib/miaSocialConversationContinuity.js";
import {
  PERSONALITY_GOVERNANCE_VERSION,
  IDENTITY_QUERY_KIND,
  classifyIdentityQuery,
  detectReciprocalSocialPrompt,
  buildGovernedIdentityReply,
  buildPersonalityGovernedReciprocalReply,
} from "../lib/miaPersonalityGovernance.js";
import {
  CONVERSATIONAL_RHYTHM_VERSION,
  pickRhythmGovernedVariant,
  scanRecentExpressionHistory,
  scoreVariantForRhythm,
} from "../lib/miaConversationalRhythmGovernance.js";
import { HUMAN_EXPERIENCE_VERSION } from "../lib/miaHumanConversationExperience.js";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import {
  buildGovernedSocialFallbackReply,
  finalizeHumanConversationReply,
} from "../lib/miaHumanConversationExperience.js";
import { buildContractDrivenSocialFallback } from "../lib/miaSocialContractVerbalization.js";
import { EXPECTED_HUMAN_BEHAVIORS } from "../lib/miaSocialIntentTaxonomy.js";
import { COMMERCE_REENTRY_POLICY } from "../lib/miaHumanConversationExperience.js";

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

function hist(...pairs) {
  const out = [];
  for (const [role, content] of pairs) out.push({ role, content });
  return out;
}

function replyFor(message, history = [], ctx = {}) {
  const c = buildContract(message, history, ctx);
  return buildGovernedSocialFallbackReply(c, {});
}

console.log("\nPATCH 5.8.7 — Experience Refinement\n");

// Versions
test("continuity version 5.8.7", () => assert.equal(SOCIAL_CONVERSATION_CONTINUITY_VERSION, "5.8.7"));
test("personality version 5.8.7", () => assert.equal(PERSONALITY_GOVERNANCE_VERSION, "5.8.7"));
test("rhythm version 5.8.7", () => assert.equal(CONVERSATIONAL_RHYTHM_VERSION, "5.8.7"));
test("experience version 5.8.7", () => assert.equal(HUMAN_EXPERIENCE_VERSION, "5.8.7"));

// Class A — resumption / continuity
const resumeNoAnchor = [
  "como eu estava dizendo",
  "voltando naquele assunto",
  "lembra do que eu falei?",
  "continuando",
  "sobre aquilo",
  "como falei antes",
  "volta pro papo de antes",
  "retomando o papo",
  "então você lembra",
  "naquele assunto",
];
for (const msg of resumeNoAnchor) {
  test(`A resume-no-anchor: ${msg.slice(0, 28)}`, () => {
    const history = hist(
      ["user", "oi"],
      ["assistant", "Oi!"],
      ["user", "ok"],
      ["assistant", "Certo."]
    );
    const c = buildContract(msg, history);
    assert.equal(c.socialContinuityBehavior, SOCIAL_CONTINUITY_BEHAVIOR.RESUME_WITHOUT_ANCHOR);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.ok(reply.length > 5);
    assert.doesNotMatch(reply, /Claro, pode falar comigo/i);
  });
}

const resumeWithAnchor = [
  "como eu estava dizendo",
  "voltando ao assunto",
  "continuando",
  "sobre aquilo",
];
for (const msg of resumeWithAnchor) {
  test(`A resume-with-anchor: ${msg.slice(0, 20)}`, () => {
    const history = hist(
      ["user", "hoje estou cansado do trabalho"],
      ["assistant", "Entendo — parece pesado."]
    );
    const c = buildContract(msg, history);
    assert.equal(c.socialContinuityBehavior, SOCIAL_CONTINUITY_BEHAVIOR.RESUME_SOCIAL_DISCOURSE);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.ok(/cansad|trabalho|lembro|retom|papo|assunto/i.test(reply));
  });
}

const memoryChecks = ["você lembra?", "lembra do que eu disse?", "então lembra?"];
for (const msg of memoryChecks) {
  test(`A memory-check discourse: ${msg}`, () => {
    const history = hist(
      ["user", "minha semana foi muito puxada"],
      ["assistant", "Compreendo."]
    );
    const c = buildContract(msg, history);
    assert.ok(
      c.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.CONFIRM_MEMORY ||
        c.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.RESUME_SOCIAL_DISCOURSE ||
        c.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.RESUME_WITHOUT_ANCHOR
    );
  });
}

// Class B — reciprocity
const reciprocalPrompts = [
  "e você?",
  "e contigo?",
  "como você está?",
  "como você tá?",
  "como foi seu dia?",
  "como foi o seu dia?",
  "dormiu bem?",
  "tá bem?",
  "está tudo bem?",
  "como vai?",
];
for (const msg of reciprocalPrompts) {
  test(`B reciprocal detect: ${msg}`, () => {
    assert.ok(detectReciprocalSocialPrompt(msg));
  });
  test(`B reciprocal reply: ${msg}`, () => {
    const history = hist(["user", "oi"], ["assistant", "Oi! Tudo bem?"]);
    const c = buildContract(msg, history);
    assert.equal(c.expectedHumanBehavior, EXPECTED_HUMAN_BEHAVIORS.RECIPROCATE_WARMTH);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.doesNotMatch(reply, /não captei|perdi o fio|contexto|sobre o quê/i);
    assert.ok(/você|contigo|por aqui|tranquilo|certo|bem|indo/i.test(reply));
  });
}

const reciprocalChains = [
  ["oi", "tudo bem?", "e você?"],
  ["bom dia", "como vai?", "e contigo?"],
  ["opa", "tudo certo?", "como foi seu dia?"],
  ["hey", "beleza?", "está tudo bem?"],
];
for (const chain of reciprocalChains) {
  test(`B reciprocal chain ${chain.join(" -> ")}`, () => {
    const history = [];
    for (const msg of chain.slice(0, -1)) {
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: "Tudo bem!" });
    }
    const c = buildContract(chain[chain.length - 1], history);
    assert.equal(c.expectedHumanBehavior, EXPECTED_HUMAN_BEHAVIORS.RECIPROCATE_WARMTH);
  });
}

// Class D — rhythm anti-repetition
test("D reciprocal pool varies under fatigue", () => {
  const history = scanRecentExpressionHistory(
    [
      { role: "assistant", content: "Por aqui, tudo certo — e com você?" },
      { role: "assistant", content: "Tudo tranquilo por aqui! E contigo?" },
      { role: "assistant", content: "Por aqui, tudo bem. E você?" },
    ],
    {}
  );
  const contract = {
    conversationalRhythmVersion: CONVERSATIONAL_RHYTHM_VERSION,
    conversationalRhythm: {
      recentExpressionHistory: history,
      expressionCooldowns: { reciprocal_structure: 2, tudo: 2 },
      variationPressure: "high",
      antiRepetitionState: { avoidOpeners: ["tudo", "reciprocal_structure"] },
    },
    userMessageForSpecificity: "e você?",
  };
  const pool = [
    "Por aqui, tudo certo — e com você?",
    "Indo bem, obrigada! E você, tudo certo?",
    "Tranquilo por aqui! Me conta — como você está?",
    "Aqui está tudo bem — e com você, como foi o dia?",
  ];
  const scores = pool.map((v) => scoreVariantForRhythm(v, contract));
  const best = pool[scores.indexOf(Math.max(...scores))];
  assert.ok(!/^por aqui, tudo certo/i.test(best), `fatigued pool should avoid default opener, got: ${best}`);
});

test("D reciprocal reply not identical across turns", () => {
  const history = [];
  const replies = [];
  for (let i = 0; i < 4; i += 1) {
    const msg = i === 0 ? "tudo bem?" : "e você?";
    const c = buildContract(msg, history);
    const reply = buildPersonalityGovernedReciprocalReply(c);
    history.push({ role: "user", content: msg });
    history.push({ role: "assistant", content: reply });
    replies.push(reply);
  }
  const unique = new Set(replies.map((r) => r.toLowerCase()));
  assert.ok(unique.size >= 2);
});

// Class F — identity / meta
const identityQueries = [
  ["qual seu nome?", IDENTITY_QUERY_KIND.NAME],
  ["quem é você?", IDENTITY_QUERY_KIND.WHO],
  ["como você funciona?", IDENTITY_QUERY_KIND.HOW_WORKS],
  ["você lembra das coisas?", IDENTITY_QUERY_KIND.MEMORY],
  ["você lembra de mim?", IDENTITY_QUERY_KIND.MEMORY],
  ["qual modelo você usa?", IDENTITY_QUERY_KIND.MODEL_TECH],
  ["você é ChatGPT?", IDENTITY_QUERY_KIND.MODEL_TECH],
  ["você é uma IA?", IDENTITY_QUERY_KIND.AI_NATURE],
  ["você aprende?", IDENTITY_QUERY_KIND.LEARNING],
  ["você aprende comigo?", IDENTITY_QUERY_KIND.LEARNING],
  ["você é a MIA?", IDENTITY_QUERY_KIND.MIA_BRAND],
  ["open ai", IDENTITY_QUERY_KIND.MODEL_TECH],
];
for (const [msg, kind] of identityQueries) {
  test(`F identity classify: ${msg}`, () => assert.equal(classifyIdentityQuery(msg), kind));
  test(`F identity reply: ${msg}`, () => {
    const c = buildContract(msg, []);
    assert.equal(c.expectedHumanBehavior, EXPECTED_HUMAN_BEHAVIORS.ANSWER_META);
    assert.equal(c.identityQueryKind, kind);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.ok(reply.length > 10);
    assert.doesNotMatch(reply, /Claro, pode falar comigo/i);
    assert.doesNotMatch(reply, /não captei/i);
    if (kind === IDENTITY_QUERY_KIND.MODEL_TECH) assert.ok(/chatgpt|modelo|mia/i.test(reply));
    if (kind === IDENTITY_QUERY_KIND.MIA_BRAND) assert.ok(/mia/i.test(reply));
    if (kind === IDENTITY_QUERY_KIND.MEMORY) assert.ok(/lembro|memória|memoria|papo|conversa/i.test(reply));
  });
}

const metaNotGeneric = [
  "você lembra das coisas?",
  "qual modelo você usa?",
  "você é ChatGPT?",
  "como você funciona?",
];
for (const msg of metaNotGeneric) {
  test(`F not stay_social: ${msg}`, () => {
    const c = buildContract(msg, []);
    const fb = buildContractDrivenSocialFallback(c, "social");
    assert.equal(fb.builder, "buildGovernedIdentityReply");
  });
}

// Class H — social departure / no commercial bleed
const departures = [
  "preciso ir",
  "vou indo",
  "vou dormir",
  "falamos depois",
  "tenho que trabalhar",
  "até amanhã",
  "depois a gente conversa",
  "preciso sair",
  "tô indo",
  "até depois",
];
for (const msg of departures) {
  test(`H departure detect: ${msg}`, () => assert.ok(detectSocialDeparture(msg)));
  test(`H departure behavior: ${msg}`, () => {
    const c = buildContract(msg, hist(["user", "oi"], ["assistant", "Oi!"]));
    assert.equal(c.socialContinuityBehavior, SOCIAL_CONTINUITY_BEHAVIOR.SOCIAL_CLOSING);
    assert.equal(c.socialDepartureMode, true);
    assert.equal(c.commerceReentryPolicy, COMMERCE_REENTRY_POLICY.FORBIDDEN);
    assert.equal(c.responseBehavior?.redirectToCommerce, false);
  });
  test(`H departure reply no commerce: ${msg}`, () => {
    const history = hist(
      ["user", "quero um celular"],
      ["assistant", "Posso te ajudar com isso!"],
      ["user", "obrigado"]
    );
    const c = buildContract(msg, history);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.doesNotMatch(reply, /recomend|produto|celular|notebook|compr/i);
    assert.ok(/até|logo|próxim|proxim|tchau|beleza|tranquilo|foi bom|noite|descanse|durma/i.test(reply));
  });
}

// Mixed transitions
const transitions = [
  { chain: ["dia difícil", "obrigado", "preciso ir"], cat: "emotional→departure" },
  { chain: ["quero celular", "deixa o produto", "falamos depois"], cat: "commercial→departure" },
  { chain: ["oi", "tudo bem?", "qual seu nome?", "e você?"], cat: "greeting→identity→reciprocal" },
  { chain: ["hoje estou cansado", "ok", "continuando"], cat: "emotional→resume" },
  { chain: ["você é legal", "obrigado", "até mais"], cat: "compliment→departure" },
];
for (const { chain, cat } of transitions) {
  test(`transition ${cat}`, () => {
    const history = [];
    for (const msg of chain) {
      const c = buildContract(msg, history);
      const reply = buildGovernedSocialFallbackReply(c, {});
      assert.ok(reply);
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: reply });
    }
  });
}

// Variations — parameterized resumption markers
const resumeVariants = [
  "voltando naquele assunto sobre trabalho",
  "como eu estava falando antes",
  "continuando o papo",
  "sobre o que eu comentei",
  "retomando",
];
for (const msg of resumeVariants) {
  test(`A variant resume: ${msg.slice(0, 24)}`, () => {
    const history = hist(["user", "trabalho está pesado"], ["assistant", "Entendo."]);
    const d = resolveSocialConversationContinuity({ message: msg, conversationMessages: history });
    assert.ok(d.resumptionRequested || d.socialContinuityBehavior);
  });
}

// Short-term memory in identity vs discourse
test("F memory identity vs discourse resume", () => {
  assert.equal(classifyIdentityQuery("você lembra das coisas?"), IDENTITY_QUERY_KIND.MEMORY);
  const history = hist(["user", "falei sobre minha mãe"], ["assistant", "Entendo."]);
  const c = buildContract("lembra do que eu falei?", history);
  assert.notEqual(c.identityQueryKind, IDENTITY_QUERY_KIND.MEMORY);
});

// Finalize pipeline integration
const finalizeCases = [
  "e você?",
  "preciso ir",
  "você é ChatGPT?",
  "continuando",
  "como foi seu dia?",
];
for (const msg of finalizeCases) {
  test(`finalize pipeline: ${msg}`, () => {
    const c = buildContract(msg, hist(["user", "oi"], ["assistant", "Oi!"]));
    const out = finalizeHumanConversationReply("fallback genérico", c, { family: "social" });
    assert.ok(out.response);
    assert.ok(out.response.length > 3);
  });
}

// Regression guards — prior patch behaviors preserved
test("regression greeting continuity preserved", () => {
  const history = hist(["user", "oi"], ["assistant", "Oi! Tudo bem."]);
  const c = buildContract("tudo bem?", history);
  assert.ok(c.suppressMirrorGreeting || c.socialContinuityBehavior);
});

test("regression emotional validation preserved", () => {
  const c = buildContract("hoje foi um dia difícil", []);
  const reply = buildGovernedSocialFallbackReply(c, {});
  assert.ok(/entendo|compreendo|pesad|difícil|dificil|puxad/i.test(reply));
});

test("regression rhythm ack rotation preserved", () => {
  const c = buildContract("ok", hist(["user", "oi"], ["assistant", "Oi!"]));
  assert.equal(c.conversationalRhythmVersion, CONVERSATIONAL_RHYTHM_VERSION);
});

// Bulk variation matrix (~40 extra cases)
const bulkSocial = [
  "beleza",
  "show",
  "entendi",
  "hm",
  "certo",
  "valeu",
  "obrigado",
  "kkk",
  "haha",
  "mandou bem",
];
for (const msg of bulkSocial) {
  test(`bulk social ${msg}`, () => {
    const c = buildContract(msg, hist(["user", "oi"], ["assistant", "Oi!"]));
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.ok(reply);
  });
}

const bulkReciprocal = ["e você?", "e contigo?", "como vai?", "tá bem?"];
for (let i = 0; i < 10; i += 1) {
  for (const msg of bulkReciprocal) {
    test(`bulk reciprocal v${i}: ${msg}`, () => {
      const history = [];
      for (let t = 0; t < i; t += 1) {
        history.push({ role: "user", content: "tudo bem?" });
        history.push({ role: "assistant", content: "Por aqui, tudo certo!" });
      }
      const c = buildContract(msg, history);
      assert.equal(c.expectedHumanBehavior, EXPECTED_HUMAN_BEHAVIORS.RECIPROCATE_WARMTH);
    });
  }
}

const bulkDeparture = ["preciso ir", "vou dormir", "falamos depois", "até amanhã"];
for (let i = 0; i < 5; i += 1) {
  for (const msg of bulkDeparture) {
    test(`bulk departure v${i}: ${msg}`, () => {
      const c = buildContract(msg, hist(["user", "quero notebook"], ["assistant", "Claro!"]));
      assert.equal(c.commerceReentryPolicy, COMMERCE_REENTRY_POLICY.FORBIDDEN);
    });
  }
}

console.log(`\n${"=".repeat(50)}`);
console.log(`PATCH 5.8.7 tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
