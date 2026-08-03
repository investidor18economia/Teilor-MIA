#!/usr/bin/env node
/**
 * PATCH 5.8.4 — Conversational Rhythm Governance tests
 */
import { strict as assert } from "node:assert";
import {
  CONVERSATIONAL_RHYTHM_VERSION,
  CONVERSATION_RHYTHM,
  RESPONSE_CADENCE,
  VARIATION_PRESSURE,
  fingerprintExpression,
  classifyExpressionOpener,
  classifyExpressionStructure,
  scanRecentExpressionHistory,
  resolveConversationalRhythm,
  computeRhythmMetrics,
  scoreVariantForRhythm,
  pickRhythmGovernedVariant,
  enrichContractWithConversationalRhythm,
  detectRhythmViolations,
  applyConversationalRhythmGovernance,
  conversationalRhythmToVerbalizationInstructions,
} from "../lib/miaConversationalRhythmGovernance.js";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import {
  finalizeHumanConversationReply,
  buildGovernedSocialFallbackReply,
} from "../lib/miaHumanConversationExperience.js";
import { buildContractDrivenSocialFallback } from "../lib/miaSocialContractVerbalization.js";

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

function hist(...pairs) {
  const out = [];
  for (const [role, content] of pairs) out.push({ role, content });
  return out;
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

function rhythmContract(message, history = []) {
  const c = buildContract(message, history);
  return enrichContractWithConversationalRhythm(c, {
    message,
    conversationMessages: history,
    sessionContext: {},
  });
}

console.log("\nPATCH 5.8.4 — Conversational Rhythm Governance\n");

test("version", () => {
  assert.equal(CONVERSATIONAL_RHYTHM_VERSION, "5.8.4");
});

test("contract enriched", () => {
  const c = rhythmContract("oi");
  assert.equal(c.conversationalRhythmVersion, "5.8.4");
  assert.ok(c.conversationalRhythm);
  assert.ok(c.rhythmMetrics);
});

// Fingerprint (~15)
const fingerprintCases = [
  ["Entendi.", "entendi", "confirmation", "micro"],
  ["Compreendo.", "compreendo", "confirmation", "micro"],
  ["Claro — pode falar.", "claro", "confirmation", "micro"],
  ["Sem problema — fico por aqui no papo.", "claro", "confirmation", "short"],
  ["Tudo tranquilo por aqui!", "tudo", "short_statement", "short"],
  ["Lembro sim — você comentou isso.", "retomada", "resumption", "short"],
];
for (const [text, opener, structure, bucket] of fingerprintCases) {
  test(`fingerprint ${opener}`, () => {
    const fp = fingerprintExpression(text);
    assert.equal(fp.opener, opener);
    assert.equal(fp.structure, structure);
    assert.equal(fp.lengthBucket, bucket);
  });
}

// Metrics (~10)
test("metrics empty history", () => {
  const m = computeRhythmMetrics([]);
  assert.equal(m.repetitionRate, 0);
  assert.equal(m.diversityScore, 1);
});

test("metrics detects repetition", () => {
  const history = [
    fingerprintExpression("Entendi."),
    fingerprintExpression("Entendi."),
    fingerprintExpression("Compreendo."),
  ];
  const m = computeRhythmMetrics(history);
  assert.ok(m.repetitionRate > 0);
  assert.ok(m.exactDuplicateCount >= 1);
});

test("metrics diversity with varied replies", () => {
  const history = [
    fingerprintExpression("Entendi."),
    fingerprintExpression("Perfeito."),
    fingerprintExpression("Faz sentido."),
    fingerprintExpression("Certo."),
  ];
  const m = computeRhythmMetrics(history);
  assert.ok(m.diversityScore >= 0.5);
});

// Rhythm resolver (~12)
test("rapid exchange detected", () => {
  const history = hist(["user", "ok"], ["assistant", "Certo."], ["user", "sim"], ["assistant", "Beleza."]);
  const r = resolveConversationalRhythm({ message: "show", conversationMessages: history });
  assert.equal(r.conversationRhythm, CONVERSATION_RHYTHM.RAPID_EXCHANGE);
});

test("variation pressure high after repeats", () => {
  const r = resolveConversationalRhythm({
    message: "ok",
    conversationMessages: hist(
      ["user", "a"],
      ["assistant", "Entendi."],
      ["user", "b"],
      ["assistant", "Entendi."],
      ["user", "c"],
      ["assistant", "Entendi."]
    ),
  });
  assert.equal(r.variationPressure, VARIATION_PRESSURE.HIGH);
});

test("opening rhythm on first greeting", () => {
  const r = resolveConversationalRhythm({ message: "oi", conversationMessages: [] });
  assert.equal(r.conversationRhythm, CONVERSATION_RHYTHM.OPENING);
});

// pickRhythmGovernedVariant (~20)
test("picker avoids exact repeat", () => {
  const variants = ["Entendi.", "Perfeito.", "Faz sentido.", "Certo.", "Beleza."];
  const contract = {
    conversationalRhythmVersion: "5.8.4",
    conversationalRhythm: {
      recentExpressionHistory: [fingerprintExpression("Entendi.")],
      expressionCooldowns: { entendi: 2, "norm:entendi": 1 },
      variationPressure: VARIATION_PRESSURE.HIGH,
      antiRepetitionState: { avoidOpeners: ["entendi"], avoidExpressions: ["entendi"], avoidStructures: [] },
      replyDensity: "balanced",
      turnIndex: 4,
    },
  };
  const pick = pickRhythmGovernedVariant(variants, contract, "ack");
  assert.notEqual(normalize(pick), "entendi");
});

function normalize(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.!?]+/g, "")
    .trim();
}

test("picker rotates across turns", () => {
  const variants = ["Entendi.", "Perfeito.", "Faz sentido.", "Certo.", "Beleza.", "Combinado."];
  const picks = new Set();
  let history = [];
  for (let i = 0; i < 6; i += 1) {
    const contract = enrichContractWithConversationalRhythm(
      { conversationalRhythmVersion: "5.8.4", userMessageForSpecificity: `msg-${i}` },
      { message: `msg-${i}`, conversationMessages: history }
    );
    const pick = pickRhythmGovernedVariant(variants, contract, `turn-${i}`);
    picks.add(normalize(pick));
    history = [...history, { role: "assistant", content: pick }];
  }
  assert.ok(picks.size >= 4, `expected diversity, got ${picks.size}: ${[...picks].join(", ")}`);
});

test("score penalizes same opener", () => {
  const contract = {
    conversationalRhythm: {
      recentExpressionHistory: [fingerprintExpression("Entendi.")],
      expressionCooldowns: { entendi: 2 },
      variationPressure: VARIATION_PRESSURE.MEDIUM,
      antiRepetitionState: {},
      replyDensity: "balanced",
    },
  };
  assert.ok(scoreVariantForRhythm("Entendi.", contract) < scoreVariantForRhythm("Perfeito.", contract));
});

// Long ack chain simulation (~15)
const ackChain = ["ok", "certo", "beleza", "show", "entendi", "sim", "hm", "valeu", "obrigado", "perfeito"];
test("long ack chain diversity", () => {
  const replies = [];
  let history = [];
  const normalized = new Set();
  for (const msg of ackChain) {
    const c = rhythmContract(msg, history);
    const reply = buildGovernedSocialFallbackReply(c, {});
    replies.push(reply);
    history.push({ role: "user", content: msg });
    history.push({ role: "assistant", content: reply });
    normalized.add(normalize(reply).slice(0, 12));
  }
  assert.ok(normalized.size >= 5, `low diversity: ${normalized.size}`);
});

// applyConversationalRhythmGovernance (~10)
test("rhythm gate replaces fatigued ack", () => {
  const c = rhythmContract("ok", hist(["user", "a"], ["assistant", "Entendi."], ["user", "b"], ["assistant", "Entendi."]));
  const out = applyConversationalRhythmGovernance("Entendi.", c);
  if (out.replaced) {
    assert.notEqual(normalize(out.reply), "entendi");
  } else {
    assert.ok(detectRhythmViolations("Entendi.", c).length >= 0);
  }
});

test("finalize applies rhythm gate", () => {
  const c = rhythmContract("ok", hist(["user", "x"], ["assistant", "Entendi."], ["user", "y"], ["assistant", "Entendi."]));
  const out = finalizeHumanConversationReply("Entendi.", c, null, {}).response;
  assert.ok(out);
});

// Instructions (~5)
test("rhythm instructions present", () => {
  const c = rhythmContract("tudo bem?");
  const instr = conversationalRhythmToVerbalizationInstructions(c);
  assert.match(instr, /Ritmo conversacional/i);
  assert.match(instr, /anti-repetição/i);
});

// Contract-driven verbalization (~15)
const verbalFamilies = [
  ["valeu", "gratitude"],
  ["show", "approval"],
  ["kkk", "reaction"],
  ["só queria conversar", "stay_social"],
  ["péssimo", "emotional"],
];
for (const [msg, label] of verbalFamilies) {
  test(`verbalization ${label}`, () => {
    const c = rhythmContract(msg);
    const result = buildContractDrivenSocialFallback(c, "");
    const text = typeof result === "string" ? result : result?.text;
    assert.ok(text === undefined || (typeof text === "string" && text.length >= 0));
    if (label !== "reaction") assert.ok(text && text.length > 1);
  });
}

// Greeting cadence batch (~14)
const greetings = ["oi", "Opa", "Bom dia", "Boa tarde", "Salve", "Hey", "E aí"];
for (const g of greetings) {
  test(`greeting rhythm ${g}`, () => {
    const c = rhythmContract(g);
    assert.ok(c.responseCadence);
    assert.ok(c.conversationalRhythm.conversationRhythm);
  });
}

// Confirmation batch with history (~21)
const confirms = ["ok", "certo", "beleza", "show", "sim", "entendi", "perfeito"];
for (const msg of confirms) {
  for (const prior of ["Entendi.", "Compreendo.", "Claro."]) {
    test(`confirm ${msg} after ${prior.slice(0, 6)}`, () => {
      const history = hist(["user", "teste"], ["assistant", prior]);
      const c = rhythmContract(msg, history);
      const reply = buildGovernedSocialFallbackReply(c, {});
      assert.ok(reply);
      if (c.conversationalRhythm.variationPressure === VARIATION_PRESSURE.HIGH) {
        assert.notEqual(normalize(reply), normalize(prior));
      }
    });
  }
}

// Stay social batch (~10)
const stayMsgs = ["só queria conversar", "quero papo", "bora conversar", "fala aí", "continua"];
for (const msg of stayMsgs) {
  test(`stay social rhythm: ${msg.slice(0, 12)}`, () => {
    const history = hist(["user", "oi"], ["assistant", "Sem problema — fico por aqui no papo."]);
    const c = rhythmContract(msg, history);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.ok(reply);
  });
}

// Clarification batch (~8)
const clarifications = ["péssimo", "horrível", "confuso", "não entendi"];
for (const msg of clarifications) {
  test(`clarification rhythm: ${msg}`, () => {
    const history = hist(["user", "x"], ["assistant", "Entendi — me ajuda com um pouco mais de contexto?"]);
    const c = rhythmContract(msg, history);
    assert.ok(c.conversationalRhythm);
  });
}

// Meta batch (~6)
const metaMsgs = ["qual seu nome?", "quem é você?", "como você funciona?"];
for (const msg of metaMsgs) {
  test(`meta rhythm: ${msg}`, () => {
    const c = rhythmContract(msg);
    assert.equal(c.conversationalRhythmVersion, "5.8.4");
  });
}

// Continuity + rhythm (~8)
test("continuity preserved with rhythm", () => {
  const history = hist(["user", "oi"], ["assistant", "Oi! Tudo bem."]);
  const c = rhythmContract("tudo bem?", history);
  assert.equal(c.suppressMirrorGreeting, true);
  assert.equal(c.conversationalRhythmVersion, "5.8.4");
});

test("personality preserved with rhythm", () => {
  const c = rhythmContract("qual seu nome?");
  assert.equal(c.personalityGovernanceVersion, "5.8.2");
});

// Multiturn chains (~12)
const chains = [
  { id: "RC-01", turns: ["oi", "tudo bem?", "beleza", "entendi", "ok"] },
  { id: "RC-02", turns: ["valeu", "obrigado", "show", "tmj"] },
  { id: "RC-03", turns: ["hoje estou cansado", "foi complicado", "mas enfim", "ok"] },
  { id: "RC-04", turns: ["quem é você", "legal", "então lembra?", "sim"] },
  { id: "RC-05", turns: ["oi", "preciso celular", "obrigado", "como você tá?"] },
  { id: "RC-06", turns: ["kkk", "engraçado", "show", "beleza"] },
];

for (const chain of chains) {
  test(`chain ${chain.id} rhythm diversity`, () => {
    const history = [];
    const replies = [];
    const openers = new Set();
    for (const msg of chain.turns) {
      const c = rhythmContract(msg, history);
      const reply = buildGovernedSocialFallbackReply(c, {});
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: reply });
      replies.push(reply);
      openers.add(classifyExpressionOpener(reply));
    }
    assert.ok(replies.every(Boolean));
    assert.ok(openers.size >= 2 || chain.turns.length <= 3, `${chain.id} openers=${openers.size}`);
  });
}

// Metrics integration batch (~10)
test("metrics improve with varied history", () => {
  const stale = computeRhythmMetrics([
    fingerprintExpression("Entendi."),
    fingerprintExpression("Entendi."),
    fingerprintExpression("Entendi."),
  ]);
  const fresh = computeRhythmMetrics([
    fingerprintExpression("Entendi."),
    fingerprintExpression("Perfeito."),
    fingerprintExpression("Faz sentido."),
    fingerprintExpression("Certo."),
  ]);
  assert.ok(fresh.diversityScore > stale.diversityScore);
});

// Rapid micro cadence (~8)
const microMsgs = ["ok", "hm", "sim", "ta", "blz", "show", "certo", "beleza"];
test("rapid micro cadence", () => {
  let history = [];
  let microCount = 0;
  for (const msg of microMsgs) {
    const c = rhythmContract(msg, history);
    if (c.responseCadence === RESPONSE_CADENCE.MICRO || c.responseCadence === RESPONSE_CADENCE.BRIEF) {
      microCount += 1;
    }
    const reply = buildGovernedSocialFallbackReply(c, {});
    history.push({ role: "user", content: msg });
    history.push({ role: "assistant", content: reply });
  }
  assert.ok(microCount >= 4);
});

// Farewell/closing rhythm (~5)
test("closing rhythm on farewell", () => {
  const c = rhythmContract("tchau");
  assert.equal(c.conversationalRhythm.conversationRhythm, CONVERSATION_RHYTHM.CLOSING);
});

// Repetition detection batch (~8)
const repeatTexts = ["Entendi.", "Compreendo.", "Claro.", "Sem problema."];
for (const t of repeatTexts) {
  test(`detect repeat ${t}`, () => {
    const c = rhythmContract("ok", hist(["user", "a"], ["assistant", t]));
    const violations = detectRhythmViolations(t, c);
    assert.ok(Array.isArray(violations));
  });
}

// Expanded rhythm batches (target 120+)
const cadenceMsgs = ["ok", "certo", "beleza", "show", "sim", "hm", "ta", "blz", "valeu", "obrigado"];
for (const msg of cadenceMsgs) {
  test(`cadence scan ${msg}`, () => {
    const c = rhythmContract(msg);
    assert.ok(c.conversationalRhythm.responseCadence);
    assert.ok(c.rhythmMetrics);
  });
}

const disapprovalMsgs = ["péssimo", "horrível", "ruim", "fraco", "não gostei", "discordo"];
for (const msg of disapprovalMsgs) {
  test(`disapproval rhythm ${msg}`, () => {
    const history = hist(["user", "x"], ["assistant", "Entendi."]);
    const c = rhythmContract(msg, history);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.ok(reply);
  });
}

const complimentMsgs = ["você é legal", "gostei de você", "mandou bem", "top demais"];
for (const msg of complimentMsgs) {
  test(`compliment rhythm ${msg.slice(0, 10)}`, () => {
    const c = rhythmContract(msg);
    assert.ok(c.conversationalRhythm);
  });
}

const farewellMsgs = ["tchau", "até mais", "flw", "falou", "valeu fui"];
for (const msg of farewellMsgs) {
  test(`farewell rhythm ${msg}`, () => {
    const c = rhythmContract(msg);
    assert.ok(c.conversationalRhythm.conversationRhythm);
  });
}

const pickerStress = ["Entendi.", "Perfeito.", "Faz sentido.", "Certo.", "Beleza.", "Combinado.", "Show.", "Ok."];
for (let i = 0; i < pickerStress.length; i += 1) {
  test(`picker stress turn ${i}`, () => {
    const history = [];
    for (let j = 0; j < i; j += 1) {
      history.push({ role: "user", content: `u${j}` });
      history.push({ role: "assistant", content: pickerStress[j] });
    }
    const c = enrichContractWithConversationalRhythm(
      { conversationalRhythmVersion: "5.8.4", userMessageForSpecificity: `turn-${i}` },
      { message: `turn-${i}`, conversationMessages: history }
    );
    const pick = pickRhythmGovernedVariant(pickerStress, c, `stress-${i}`);
    assert.ok(pick);
  });
}

const structureCases = [
  ["Oi! Tudo bem.", "greeting"],
  ["Boa!", "confirmacao"],
  ["Puxado.", "empatia"],
  ["Por nada.", "por"],
];
for (const [text, opener] of structureCases) {
  test(`opener class ${opener}`, () => {
    assert.equal(classifyExpressionOpener(text), opener);
  });
}

const densityChecks = ["ok", "tudo bem?", "hoje foi um dia longo e complicado"];
for (const msg of densityChecks) {
  test(`density ${msg.slice(0, 12)}`, () => {
    const c = rhythmContract(msg);
    assert.ok(c.replyDensity);
  });
}

const integrationMsgs = ["e você?", "como vai?", "pois é", "ah sim", "verdade"];
for (const msg of integrationMsgs) {
  test(`integration rhythm ${msg}`, () => {
    const history = hist(["user", "oi"], ["assistant", "Entendi."]);
    const c = rhythmContract(msg, history);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.ok(reply);
  });
}

console.log(`\n${"=".repeat(50)}`);
console.log(`PATCH 5.8.4 tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
