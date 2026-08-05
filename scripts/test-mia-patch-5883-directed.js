#!/usr/bin/env node
/**
 * PATCH 5.8.8.3 — Directed intent + warmth determinism tests
 */
import assert from "node:assert/strict";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import {
  finalizeHumanConversationReply,
  HUMAN_EXPERIENCE_VERSION,
} from "../lib/miaHumanConversationExperience.js";
import {
  resolveIdentityQueryKind,
  isGenericStaySocialInvite,
  buildPersonalityGovernedStaySocialReply,
} from "../lib/miaPersonalityGovernance.js";
import { buildContractDrivenSocialFallback } from "../lib/miaSocialContractVerbalization.js";
import { EXPECTED_HUMAN_BEHAVIORS as EHB } from "../lib/miaSocialIntentTaxonomy.js";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { isBareColdGratitudeResponse } from "../lib/miaConversationalIntentGovernance.js";

const IDENTITY = /\b(mia|teilor|assistente|compras|intelig)/i;
const WARMTH = /\b(entendo|compreendo|imagino|por aqui|você|contigo|gentil|feliz|obrigad|disponha|imagina|cuide|mia|teilor|pesad|difícil|ouvindo|acompanh|pode falar|desabaf|tamo|junto|contente|ajud|hehe|haha|boa|curios|conta|manda|ouvindo)\b/i;

function buildContract(message) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    conversationMessages: [{ role: "user", content: message }],
    hasActiveAnchor: false,
  });
  return buildSocialConversationBehaviorContract(recognition, {
    message,
    conversationMessages: [{ role: "user", content: message }],
  });
}

function finalize(message, reply) {
  const contract = buildContract(message);
  return finalizeHumanConversationReply(reply, contract, null, { period: "" });
}

function expectIdentity(message, replySeed = "Fico por aqui — o que você quer conversar?") {
  const kind = resolveIdentityQueryKind(message, {
    recognition: recognizeMiaIntent({ userMessage: message, resolvedQuery: message }),
  });
  assert.ok(kind, `expected identity kind for: ${message}`);
  const out = finalize(message, replySeed);
  assert.match(out.response, IDENTITY, `identity missing for: ${message} -> ${out.response}`);
  assert.ok(!isGenericStaySocialInvite(out.response), `stay_social bleed: ${message} -> ${out.response}`);
}

function expectWarmth(message, replySeed) {
  const out = finalize(message, replySeed);
  const text = out.response;
  assert.ok(!isBareColdGratitudeResponse(text), `bare cold gratitude: ${message} -> ${text}`);
  assert.ok(WARMTH.test(text) || text.length >= 14, `low warmth for: ${message} -> ${text}`);
}

let passed = 0;

// 588V.2 blockers
expectIdentity("você finge ser humana?");
passed += 1;
expectIdentity("você guarda meus dados?", "Sim, eu guardo os dados das nossas conversas.");
passed += 1;
expectIdentity("você pode trocar de modelo?", "Você pode trocar de modelo nas configurações.");
passed += 1;

// Gratitude determinism — cold LLM seeds must be corrected
const gratitudeMsgs = [
  "valeu",
  "obrigado",
  "obrigada",
  "brigadão",
  "vlw",
  "thanks",
  "thanks 😊",
  "valeu demais",
  "muito obrigado",
];
for (const msg of gratitudeMsgs) {
  expectWarmth(msg, "De nada!");
  passed += 1;
}

// Identity meta — 15 scenarios
const identityMsgs = [
  "me conta quem você é",
  "você é humana?",
  "você é pessoa?",
  "sua especialidade?",
  "qual ia te alimenta?",
  "qual LLM te alimenta?",
  "você é uma IA?",
  "como você funciona?",
  "qual modelo você usa?",
  "você lembra de mim?",
  "quem te criou?",
  "você é da Teilor?",
  "o que é a Teilor?",
  "qual seu nome?",
  "você treina com minhas mensagens?",
];
for (const msg of identityMsgs) {
  expectIdentity(msg);
  passed += 1;
}

// Warmth — micro-ack cold seeds
const warmthCases = [
  ["oi", "Claro."],
  ["to meio down", "Entendi."],
  ["e você?", "Tudo certo."],
  ["consegui!", "Boa."],
  ["certo", "Certo."],
  ["tchau", "Até."],
  ["kkk", "Ok."],
  ["acredita?", "Entendi."],
  ["tenho uma novidade", "Claro."],
];
for (const [msg, seed] of warmthCases) {
  expectWarmth(msg, seed);
  passed += 1;
}

// Mixed
const mixed = [
  { msg: "quem é você?", seed: "Fico por aqui — o que você quer conversar?", kind: "identity" },
  { msg: "obrigado! quem te criou?", seed: "De nada!", kind: "identity" },
  { msg: "vlw mia", seed: "De nada!", kind: "warmth" },
  { msg: "valeu", seed: "De nada!", kind: "warmth" },
];
for (const { msg, seed, kind } of mixed) {
  if (kind === "identity") expectIdentity(msg, seed);
  else expectWarmth(msg, seed);
  passed += 1;
}

const contract = buildContract("qual LLM te alimenta?");
assert.match(buildPersonalityGovernedStaySocialReply(contract), IDENTITY);
assert.match(buildContractDrivenSocialFallback(contract, "", { failureReason: "test" }).text, IDENTITY);
passed += 2;

assert.equal(HUMAN_EXPERIENCE_VERSION, "5.8.8.3");
console.log(`PATCH 5.8.8.3 directed tests: ${passed}/${passed} PASS`);
