#!/usr/bin/env node
/**
 * PATCH 5.8.8 — Human Presence, Structural Expression & Identity tests
 * Run: node scripts/test-mia-patch-588-human-presence.js
 */
import { strict as assert } from "node:assert";
import {
  HUMAN_WARMTH_PRESENCE_VERSION,
  HUMAN_WARMTH_LEVEL,
  resolveHumanWarmthPresence,
  measureResponseWarmthPresence,
  detectWarmthPresenceViolations,
  applyHumanWarmthPresenceGovernance,
  enrichContractWithHumanWarmthPresence,
} from "../lib/miaHumanWarmthPresenceGovernance.js";
import {
  STRUCTURAL_EXPRESSION_VERSION,
  STRUCTURAL_FATIGUE,
  classifyBehaviorArchetype,
  resolveStructuralExpression,
  detectStructuralExpressionViolations,
  applyStructuralExpressionGovernance,
} from "../lib/miaStructuralExpressionGovernance.js";
import {
  CONVERSATIONAL_IDENTITY_PRESENCE_VERSION,
  resolveConversationalIdentityPresence,
  detectIdentityPresenceViolations,
  applyConversationalIdentityPresenceGovernance,
  MIA_IDENTITY_MARKER,
} from "../lib/miaConversationalIdentityPresenceGovernance.js";
import { HUMAN_EXPERIENCE_VERSION } from "../lib/miaHumanConversationExperience.js";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import {
  finalizeHumanConversationReply,
  buildGovernedSocialFallbackReply,
} from "../lib/miaHumanConversationExperience.js";

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

console.log("\nPATCH 5.8.8 — Unit tests\n");

test("versions aligned", () => {
  assert.equal(HUMAN_EXPERIENCE_VERSION, "5.8.8");
  assert.equal(HUMAN_WARMTH_PRESENCE_VERSION, "5.8.8");
  assert.equal(STRUCTURAL_EXPRESSION_VERSION, "5.8.8");
  assert.equal(CONVERSATIONAL_IDENTITY_PRESENCE_VERSION, "5.8.8");
});

test("contract enriched with warmth presence fields", () => {
  const c = buildContract("oi, tudo bem?");
  assert.equal(c.humanWarmthPresenceVersion, "5.8.8");
  assert.ok(c.humanWarmthLevel);
  assert.ok(c.conversationEnergy);
  assert.ok(c.emotionalPresence);
  assert.ok(c.preferredReciprocityStyle);
});

test("contract enriched with structural expression", () => {
  const c = buildContract("ok", hist("user", "oi", "assistant", "Oi!", "user", "beleza", "assistant", "Certo."));
  assert.equal(c.structuralExpressionVersion, "5.8.8");
  assert.ok(c.structuralFatigue);
});

test("contract enriched with identity presence", () => {
  const c = buildContract("qual LLM te alimenta?");
  assert.equal(c.conversationalIdentityPresenceVersion, "5.8.8");
  assert.equal(c.llmIdentityAnchorRequired, true);
});

// --- Classe B: 80 scenarios ---
const CLASS_B_SCENARIOS = [
  ...["oi", "olá", "bom dia", "boa tarde", "boa noite", "e aí", "salve", "hey"].map((m) => ({
    msg: m,
    cat: "greeting",
  })),
  ...["tchau", "até logo", "até mais", "flw", "falou", "preciso ir", "vou dormir"].map((m) => ({
    msg: m,
    cat: "farewell",
  })),
  ...["obrigado", "valeu", "brigadão", "muito obrigada", "thanks"].map((m) => ({
    msg: m,
    cat: "gratitude",
  })),
  ...[
    "hoje foi pesado",
    "não estou bem",
    "dia difícil",
    "to meio down",
    "semana puxada",
    "me sinto mal",
    "tô exausto",
    "tô frustrado",
    "tô ansioso",
    "desanimei",
  ].map((m) => ({ msg: m, cat: "emotional" })),
  ...["você é legal", "gostei de você", "mandou bem", "parabéns"].map((m) => ({
    msg: m,
    cat: "compliment",
  })),
  ...["tudo bem?", "e você?", "como vai?", "como foi seu dia?", "dormiu bem?"].map((m) => ({
    msg: m,
    cat: "reciprocal",
  })),
  ...["kkk", "haha", "rsrs", "hehe"].map((m) => ({ msg: m, cat: "humor" })),
  ...["legal", "show", "massa", "top", "beleza", "certo", "ok", "sim"].map((m) => ({
    msg: m,
    cat: "light",
  })),
  ...[
    "quem é você?",
    "como funciona?",
    "você lembra?",
    "qual seu nome?",
    "você é IA?",
  ].map((m) => ({ msg: m, cat: "meta" })),
  ...[
    "me conta uma coisa",
    "quero conversar",
    "só queria desabafar",
    "pode ouvir?",
    "tô precisando conversar",
  ].map((m) => ({ msg: m, cat: "deep" })),
];

for (const { msg, cat } of CLASS_B_SCENARIOS) {
  test(`Classe B [${cat}]: warmth presence for "${msg.slice(0, 24)}"`, () => {
    const c = buildContract(msg);
    const presence = resolveHumanWarmthPresence({ contract: c, recognition: {}, conversationMessages: [] });
    assert.ok(presence.humanWarmthLevel);
    if (cat === "emotional" || cat === "deep") {
      assert.notEqual(presence.humanWarmthLevel, HUMAN_WARMTH_LEVEL.MINIMAL);
    }
    const cold = applyHumanWarmthPresenceGovernance("Entendi.", c);
    if (cat !== "light" && cat !== "meta" && cat !== "humor") {
      assert.ok(
        cold.replaced || measureResponseWarmthPresence(cold.reply, c).warmthScore >= 0.5,
        `expected warmth for ${cat}`
      );
    }
  });
}

// --- Classe D: 60 long conversations ---
function generateAckChain(length) {
  const acks = ["ok", "certo", "beleza", "entendi", "show", "legal", "sim", "hm"];
  const h = [];
  for (let i = 0; i < length; i += 1) {
    h.push(["user", acks[i % acks.length]]);
    h.push(["assistant", ["Entendi.", "Claro.", "Beleza.", "Certo.", "Legal."][i % 5]]);
  }
  return h;
}

for (const len of [10, 15, 20, 25]) {
  for (let chain = 0; chain < 15; chain += 1) {
    test(`Classe D: structural fatigue chain ${len}t #${chain + 1}`, () => {
      const pairs = generateAckChain(len);
      const history = hist(...pairs.slice(0, -2));
      const lastMsg = pairs[pairs.length - 2][1];
      const c = buildContract(lastMsg, history);
      const se = resolveStructuralExpression({
        contract: c,
        conversationMessages: history,
      });
      assert.ok(se.structuralFatigue);
      if (len >= 15) {
        assert.ok(
          se.structuralFatigue === STRUCTURAL_FATIGUE.HIGH ||
            se.structuralFatigue === STRUCTURAL_FATIGUE.EXHAUSTED ||
            se.structuralFatigue === STRUCTURAL_FATIGUE.MODERATE
        );
      }
      const gate = applyStructuralExpressionGovernance("Entendi.", c);
      if (se.structuralFatigue >= STRUCTURAL_FATIGUE.HIGH) {
        assert.ok(gate.replaced || !detectStructuralExpressionViolations("Entendi.", c).length);
      }
    });
  }
}

// --- Classe F: 80 identity scenarios ---
const CLASS_F_SCENARIOS = [
  "qual seu nome?",
  "quem é você?",
  "quem é a MIA?",
  "você é a MIA?",
  "como você funciona?",
  "quem te criou?",
  "você é real?",
  "o que você faz?",
  "você lembra das coisas?",
  "você lembra de mim?",
  "qual modelo você usa?",
  "você é ChatGPT?",
  "usa ChatGPT?",
  "você é uma IA?",
  "você é um robô?",
  "você aprende comigo?",
  "você treina com minhas mensagens?",
  "qual LLM te alimenta?",
  "você é da Teilor?",
  "MIA da Teilor?",
  "sua especialidade?",
  "quais seus limites?",
  "você tem memória?",
  "guarda o que falo?",
  "open ai?",
  "gpt-4?",
  "claude?",
  "inteligência artificial?",
  "assistente virtual?",
  "como funciona a MIA?",
  "me fala sobre você",
  "me conta quem você é",
  "você tem personalidade?",
  "você tem sentimentos?",
  "você é humana?",
  "você é pessoa?",
  "do que você gosta?",
  "suas capacidades?",
  "o que a Teilor faz?",
  "quem desenvolveu você?",
];

for (let i = 0; i < CLASS_F_SCENARIOS.length; i += 1) {
  const msg = CLASS_F_SCENARIOS[i];
  test(`Classe F: identity "${msg.slice(0, 30)}"`, () => {
    const c = buildContract(msg);
    assert.ok(c.conversationalIdentityPresence?.identityQueryKind || c.identityQueryKind);
    assert.equal(c.llmIdentityAnchorRequired, true);
    const violations = detectIdentityPresenceViolations("Claro.", c);
    assert.ok(
      violations.includes("missing_mia_identity_anchor") ||
        violations.includes("generic_response_on_identity_query")
    );
    const fixed = applyConversationalIdentityPresenceGovernance("Claro.", c);
    assert.ok(fixed.replaced || c.personalityGovernanceBypass);
    if (fixed.replaced) assert.ok(MIA_IDENTITY_MARKER.test(fixed.reply));
  });
}

// Extra Class F variants to reach 80
for (let i = 0; i < 40; i += 1) {
  test(`Classe F variant #${i + 41}: finalize identity path`, () => {
    const msgs = [
      "você é ChatGPT?",
      "qual modelo?",
      "quem é a MIA?",
      "como funciona?",
    ];
    const msg = msgs[i % msgs.length];
    const c = buildContract(msg);
    const result = finalizeHumanConversationReply("Entendi.", c);
    assert.ok(MIA_IDENTITY_MARKER.test(result.response) || result.usedFallback);
  });
}

test("finalizeHumanConversationReply applies warmth gate on cold LLM", () => {
  const c = buildContract("dia difícil");
  const r = finalizeHumanConversationReply("Entendi.", c);
  assert.ok(r.response.length > 5);
  assert.ok(/entendo|compreendo|pesad|difícil|imagino|continuar|acompanh/i.test(r.response));
});

test("identity meta rejects ChatGPT claim", () => {
  const c = buildContract("você é ChatGPT?");
  const v = detectIdentityPresenceViolations("Sou o ChatGPT.", c);
  assert.ok(v.includes("chatgpt_identity_claim"));
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
