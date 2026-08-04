#!/usr/bin/env node
/**
 * PATCH 5.8.8.2 — Directed identity + warmth propagation tests (~50 scenarios)
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

const IDENTITY = /\b(mia|teilor|assistente|compras|intelig)/i;
const WARMTH = /\b(entendo|compreendo|imagino|por aqui|você|contigo|gentil|feliz|obrigad|disponha|imagina|cuide|mia|teilor|pesad|difícil|ouvindo|acompanh|pode falar|desabaf)\b/i;

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

function buildRec(message, primaryIntent = "about_mia") {
  return {
    primaryIntent,
    interactionMode: "social",
    expectedHumanBehavior: primaryIntent === "about_mia" ? EHB.ANSWER_META : EHB.STAY_SOCIAL,
    socialRelevance: 0.8,
  };
}

function finalize(message, reply) {
  const contract = buildContract(message);
  return finalizeHumanConversationReply(reply, contract, null, { period: "" });
}

function expectIdentity(message, replySeed = "Fico por aqui — o que você quer conversar?") {
  const kind = resolveIdentityQueryKind(message, { recognition: recognizeMiaIntent({ userMessage: message, resolvedQuery: message }) });
  assert.ok(kind, `expected identity kind for: ${message}`);
  const out = finalize(message, replySeed);
  assert.match(out.response, IDENTITY, `identity missing for: ${message}`);
  assert.ok(!isGenericStaySocialInvite(out.response), `stay_social bleed: ${message}`);
}

function expectWarmth(message, replySeed) {
  const out = finalize(message, replySeed);
  const text = out.response;
  assert.ok(WARMTH.test(text) || text.length >= 14, `low warmth for: ${message} -> ${text}`);
}

let passed = 0;

// Class F — 20 identity scenarios
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
  "me fala sobre você",
  "open ai?",
  "você treina com minhas mensagens?",
  "você é só um robô?",
  "MIA da Teilor?",
  "qual seu nome?",
  "transparência total?",
  "stack tecnológico",
];
for (const msg of identityMsgs) {
  expectIdentity(msg);
  passed += 1;
}

// Class B — 20 warmth scenarios
const warmthCases = [
  ["obrigado demais", "De nada!"],
  ["valeu", "De nada!"],
  ["thanks 😊", "De nada!"],
  ["oi", "Claro."],
  ["bom dia", "Olá."],
  ["to meio down", "Entendi."],
  ["e você?", "Tudo certo."],
  ["como vai?", "Bem."],
  ["preciso desabafar", "Pode falar."],
  ["consegui!", "Boa."],
  ["nao to legal", "Entendo."],
  ["ansioso demais", "Certo."],
  ["frustrado", "Ok."],
  ["obrigado", "De nada!"],
  ["tchau", "Até."],
  ["até logo", "Tchau."],
  ["como foi seu dia?", "Bem."],
  ["você é legal", "Obrigada."],
  ["preciso ir", "Certo."],
  ["dia dificil", "Puxado."],
];
for (const [msg, seed] of warmthCases) {
  expectWarmth(msg, seed);
  passed += 1;
}

// Mixed — 10 (identity or warmth depending on message)
const mixed = [
  { msg: "quem é você?", seed: "Fico por aqui — o que você quer conversar?", kind: "identity" },
  { msg: "oi, quem é a MIA?", seed: "Claro.", kind: "identity" },
  { msg: "obrigado! quem te criou?", seed: "De nada!", kind: "identity" },
  { msg: "tudo bem? você é humana?", seed: "Tudo bem.", kind: "identity" },
  { msg: "me conta quem vc é", seed: "Entendi.", kind: "identity" },
  { msg: "qual IA te alimenta???", seed: "Claro.", kind: "identity" },
  { msg: "vlw mia", seed: "De nada!", kind: "warmth" },
  { msg: "e ai, como funciona?", seed: "Ok.", kind: "identity" },
  { msg: "sua especialidade?", seed: "Pode falar.", kind: "identity" },
  { msg: "open ai ou teilor?", seed: "Entendi.", kind: "identity" },
];
for (const { msg, seed, kind } of mixed) {
  if (kind === "identity") expectIdentity(msg, seed);
  else expectWarmth(msg, seed);
  passed += 1;
}

// Template path structural
const contract = buildContract("qual LLM te alimenta?");
const stay = buildPersonalityGovernedStaySocialReply(contract);
assert.match(stay, IDENTITY);
const driven = buildContractDrivenSocialFallback(contract, "", { failureReason: "test" });
assert.match(driven.text, IDENTITY);
passed += 2;

assert.equal(HUMAN_EXPERIENCE_VERSION, "5.8.8.2");
console.log(`PATCH 5.8.8.2 directed tests: ${passed}/${passed} PASS`);
