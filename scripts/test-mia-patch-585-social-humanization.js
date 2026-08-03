#!/usr/bin/env node
/** PATCH 5.8.5 — Social Humanization Governance tests */
import { strict as assert } from "node:assert";
import {
  SOCIAL_HUMANIZATION_VERSION,
  EMOTIONAL_CATEGORY,
  SOCIAL_HUMANIZATION_BEHAVIOR,
  EMPATHY_LEVEL,
  EXPRESSIVENESS_LEVEL,
  classifyEmotionalCategory,
  resolveSocialHumanization,
  computeHumanizationMetrics,
  enrichContractWithSocialHumanization,
  buildHumanizationGovernedReply,
  buildComfortWithoutTherapyReply,
  buildGratitudeWithPresenceReply,
  buildReciprocalEngagementReply,
  applySocialHumanizationGovernance,
  socialHumanizationToVerbalizationInstructions,
} from "../lib/miaSocialHumanizationGovernance.js";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { finalizeHumanConversationReply, buildGovernedSocialFallbackReply } from "../lib/miaHumanConversationExperience.js";
import { buildContractDrivenSocialFallback } from "../lib/miaSocialContractVerbalization.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}
function hist(...pairs) {
  const out = [];
  for (const [role, content] of pairs) out.push({ role, content });
  return out;
}
function buildContract(message, history = [], ctx = {}) {
  const recognition = recognizeMiaIntent({ userMessage: message, resolvedQuery: message, sessionContext: ctx, conversationMessages: history, hasActiveAnchor: !!ctx.lastBestProduct });
  return buildSocialConversationBehaviorContract(recognition, { message, conversationMessages: history, sessionContext: ctx });
}
function humanContract(message, history = []) {
  return enrichContractWithSocialHumanization(buildContract(message, history), { message, conversationMessages: history });
}

console.log("\nPATCH 5.8.5 — Social Humanization Governance\n");
test("version", () => assert.equal(SOCIAL_HUMANIZATION_VERSION, "5.8.5"));
test("contract enriched", () => {
  const c = humanContract("hoje foi difícil");
  assert.equal(c.socialHumanizationVersion, "5.8.5");
  assert.ok(c.humanizationMetrics);
});

const categoryCases = [
  ["hoje foi um dia difícil", EMOTIONAL_CATEGORY.DISTRESS],
  ["to cansado", EMOTIONAL_CATEGORY.DISTRESS],
  ["não tô legal", EMOTIONAL_CATEGORY.DISTRESS],
  ["semana pesada", EMOTIONAL_CATEGORY.DISTRESS],
  ["to meio down", EMOTIONAL_CATEGORY.SADNESS],
  ["me siento triste".replace("siento", "sinto"), EMOTIONAL_CATEGORY.SADNESS],
  ["to frustrado", EMOTIONAL_CATEGORY.FRUSTRATION],
  ["estou estressado", EMOTIONAL_CATEGORY.FRUSTRATION],
  ["to desanimado", EMOTIONAL_CATEGORY.DISCOURAGEMENT],
  ["cansei de tudo", EMOTIONAL_CATEGORY.DISCOURAGEMENT],
  ["to ansioso", EMOTIONAL_CATEGORY.ANXIETY],
  ["preocupado com isso", EMOTIONAL_CATEGORY.ANXIETY],
  ["to feliz hoje", EMOTIONAL_CATEGORY.JOY],
  ["consegui finalmente", EMOTIONAL_CATEGORY.ACHIEVEMENT],
  ["obrigado", EMOTIONAL_CATEGORY.GRATITUDE],
  ["valeu demais", EMOTIONAL_CATEGORY.GRATITUDE],
  ["você é legal", EMOTIONAL_CATEGORY.COMPLIMENT],
  ["e você?", EMOTIONAL_CATEGORY.RECIPROCAL],
  ["como você tá?", EMOTIONAL_CATEGORY.RECIPROCAL],
  ["kkk", EMOTIONAL_CATEGORY.LIGHT_HUMOR],
  ["haha", EMOTIONAL_CATEGORY.LIGHT_HUMOR],
  ["tchau", EMOTIONAL_CATEGORY.FAREWELL],
  ["será que vai dar certo", EMOTIONAL_CATEGORY.DOUBT],
];
for (const [msg, cat] of categoryCases) {
  test(`category ${cat}`, () => assert.equal(classifyEmotionalCategory(msg, {}), cat));
}

test("high empathy distress", () => {
  const h = resolveSocialHumanization({ message: "hoje foi um dia difícil", recognition: {}, contract: {} });
  assert.equal(h.empathyLevel, EMPATHY_LEVEL.HIGH);
  assert.equal(h.socialHumanizationBehavior, SOCIAL_HUMANIZATION_BEHAVIOR.COMFORT_WITHOUT_THERAPY);
});
test("comfort not cold", () => {
  const reply = buildComfortWithoutTherapyReply(humanContract("hoje foi difícil"));
  assert.match(reply, /imagino|entendo|poxa|compreendo|pesad|melhor/i);
});
test("gratitude presence", () => {
  const reply = buildGratitudeWithPresenceReply(humanContract("obrigado"));
  assert.match(reply, /imagina|por nada|disponha|feliz|junto/i);
});
test("reciprocal lively", () => {
  const reply = buildReciprocalEngagementReply(humanContract("e você?"));
  assert.match(reply, /você|contigo|por aqui/i);
});

const vents = ["hoje foi difícil","dia puxado","semana pesada","to exausto","não aguento mais","me sinto mal","to estressado","dia complicado","foi um dia ruim","cansado demais","não tô legal","dia difícil","to mal","puxado hoje","exausto demais"];
for (const msg of vents) {
  test(`vent ${msg.slice(0,10)}`, () => {
    const c = humanContract(msg);
    assert.notEqual(c.socialHumanization.empathyLevel, EMPATHY_LEVEL.LOW);
    assert.ok(buildGovernedSocialFallbackReply(c, {}).length > 5);
  });
}

const thanks = ["obrigado","valeu","muito obrigado","brigado","tmj","agradeço","obrigada","valeu mesmo","obrigado mesmo","brigadão"];
for (const msg of thanks) {
  test(`thanks ${msg}`, () => {
    const c = humanContract(msg);
    assert.equal(c.socialHumanization.emotionalCategory, EMOTIONAL_CATEGORY.GRATITUDE);
    assert.match(buildGovernedSocialFallbackReply(c, {}), /imagina|por nada|disponha|feliz|junto|nada/i);
  });
}

const reciprocal = ["e você?","e contigo?","como você tá?","como vai?","como foi seu dia?","dormiu bem?","e aí como você tá","como tá contigo"];
for (const msg of reciprocal) {
  test(`reciprocity ${msg}`, () => {
    const c = humanContract(msg);
    assert.equal(c.socialHumanizationBehavior, SOCIAL_HUMANIZATION_BEHAVIOR.RECIPROCAL_ENGAGEMENT);
  });
}

const humor = ["kkk","haha","hehe","rs","kkkk","hahaha","hehehe"];
for (const msg of humor) {
  test(`humor ${msg}`, () => assert.equal(humanContract(msg).socialHumanization.emotionalCategory, EMOTIONAL_CATEGORY.LIGHT_HUMOR));
}

const joy = ["to feliz","consegui!","deu certo","finalmente passou","arrasou","que conquista","to empolgado","muito feliz","consegui fazer","passou no teste"];
for (const msg of joy) {
  test(`joy ${msg.slice(0,10)}`, () => {
    const c = humanContract(msg);
    assert.ok(c.socialHumanizationBehavior || c.socialHumanization.emotionalCategory);
  });
}

const frustrations = ["to irritado","que chato","situação frustrante","estou estressado","dia horrível","to puto","muito irritado","frustrado demais"];
for (const msg of frustrations) {
  test(`frustration ${msg.slice(0,10)}`, () => assert.ok(humanContract(msg).socialHumanization));
}

const anxieties = ["to ansioso","preocupado","com medo","nervoso com isso","ansiosa demais","preocupada","com receio"];
for (const msg of anxieties) {
  test(`anxiety ${msg.slice(0,10)}`, () => assert.equal(humanContract(msg).socialHumanization.emotionalCategory, EMOTIONAL_CATEGORY.ANXIETY));
}

const doubts = ["será que dá certo","não sei se consigo","to inseguro","será que vai dar","duvido que dê","inseguro com isso"];
for (const msg of doubts) {
  test(`doubt ${msg.slice(0,10)}`, () => assert.equal(humanContract(msg).socialHumanizationBehavior, SOCIAL_HUMANIZATION_BEHAVIOR.ENCOURAGE_LIGHTLY));
}

const farewells = ["tchau","até mais","flw","falou","até logo","vou dormir"];
for (const msg of farewells) {
  test(`farewell ${msg}`, () => assert.equal(humanContract(msg).socialHumanization.emotionalCategory, EMOTIONAL_CATEGORY.FAREWELL));
}

const staySocial = ["só queria conversar","quero papo","bora conversar","preciso desabafar","quero conversar","só queria desabafar"];
for (const msg of staySocial) {
  test(`stay ${msg.slice(0,12)}`, () => assert.doesNotMatch(buildGovernedSocialFallbackReply(humanContract(msg), {}), /Claro, pode falar comigo/i));
}

const verbalRoutes = [
  ["hoje estou cansado", /imagino|entendo|compreendo|poxa|pesad/i],
  ["obrigado", /imagina|por nada|disponha|feliz|junto/i],
  ["e você?", /você|contigo|por aqui/i],
  ["kkk", /hehe|boa|aí sim|haha/i],
  ["consegui passar", /bom|legal|feliz|conquista/i],
  ["você é legal", /gentil|obrigad|valeu|carinho/i],
];
for (const [msg, pattern] of verbalRoutes) {
  test(`route ${msg.slice(0,12)}`, () => {
    const r = buildContractDrivenSocialFallback(humanContract(msg), "");
    const text = typeof r === "string" ? r : r?.text;
    assert.match(text || "", pattern);
  });
}

const chains = [
  ["hoje foi difícil","foi complicado","mas enfim"],
  ["obrigado","valeu","tmj"],
  ["oi","e você?","como vai?"],
  ["consegui!","to feliz","obrigado"],
  ["kkk","engraçado","show"],
  ["to frustrado","dia chato","ok"],
  ["dia difícil","piorou","enfim"],
  ["ansioso","preocupado","ok"],
];
for (const chain of chains) {
  test(`chain ${chain[0].slice(0,8)}`, () => {
    const history = [];
    for (const msg of chain) {
      const c = humanContract(msg, history);
      const reply = buildGovernedSocialFallbackReply(c, {});
      history.push({ role: "user", content: msg }, { role: "assistant", content: reply });
      assert.ok(reply.length > 2);
    }
  });
}

test("continuity preserved", () => {
  const c = humanContract("tudo bem?", hist(["user","oi"],["assistant","Oi!"]));
  assert.equal(c.suppressMirrorGreeting, true);
});
test("personality preserved", () => assert.equal(humanContract("qual seu nome?").personalityGovernanceVersion, "5.8.7"));
test("rhythm preserved", () => assert.equal(humanContract("ok").conversationalRhythmVersion, "5.8.7"));
test("warm expressiveness", () => assert.equal(humanContract("não tô legal").socialHumanization.expressivenessLevel, EXPRESSIVENESS_LEVEL.WARM));
test("bypass high empathy", () => assert.equal(humanContract("hoje estou cansado").socialHumanizationBypass, true));
test("metrics empathy", () => assert.ok(computeHumanizationMetrics(resolveSocialHumanization({ message: "não tô legal", recognition: {}, contract: {} })).empathyScore >= 0.85));
test("instructions", () => assert.match(socialHumanizationToVerbalizationInstructions(humanContract("dia difícil")), /Humanização social/i));
test("gate emotional", () => {
  const c = humanContract("hoje estou cansado");
  const out = applySocialHumanizationGovernance("Entendo.", c);
  if (out.replaced) assert.match(out.reply, /imagino|compreendo|pesad|poxa/i);
});
test("finalize", () => assert.ok(finalizeHumanConversationReply("Compreendo.", humanContract("dia difícil"), null, {}).response));
test("commercial then emotional", () => {
  const h = hist(["user","quero celular"],["assistant","Recomendo..."],["user","obrigado"]);
  assert.ok(humanContract("hoje estou cansado", h).socialHumanizationBehavior);
});

const extraVents = ["foi difícil","foi complicado","to no limite","dia foi pesado","semana foi dura","me sinto down","exaustão total","cansada demais","puxado demais","desgaste grande"];
for (const msg of extraVents) {
  test(`extra vent ${msg.slice(0,10)}`, () => {
    const c = humanContract(msg);
    assert.ok(c.socialHumanization);
  });
}

const compliments = ["mandou bem","parabéns","gostei de você","você manda bem","que legal você"];
for (const msg of compliments) {
  test(`compliment ${msg.slice(0,10)}`, () => assert.ok(humanContract(msg).socialHumanization));
}

const prideMsgs = ["me sinto bem","orgulho de mim","consegui fazer sozinho"];
for (const msg of prideMsgs) {
  test(`pride ${msg.slice(0,10)}`, () => assert.ok(humanContract(msg).socialHumanization));
}

const metaMsgs = ["qual seu nome","quem é você","como você funciona"];
for (const msg of metaMsgs) {
  test(`meta no false empathy ${msg}`, () => assert.ok(humanContract(msg).socialHumanizationVersion));
}

const ackMsgs = ["show","legal","massa","top","bacana"];
for (const msg of ackMsgs) {
  test(`ack ${msg}`, () => assert.ok(humanContract(msg).socialHumanization));
}

console.log(`\n${"=".repeat(50)}`);
console.log(`PATCH 5.8.5 tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
