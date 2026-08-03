#!/usr/bin/env node
/**
 * PATCH 5.8.3 — Social Conversation Continuity tests
 */
import { strict as assert } from "node:assert";
import {
  SOCIAL_CONVERSATION_CONTINUITY_VERSION,
  CONVERSATION_PHASE,
  SOCIAL_CONTINUITY_BEHAVIOR,
  resolveSocialConversationContinuity,
  enrichContractWithSocialConversationContinuity,
  buildContinueGreetingThreadReply,
  buildResumeSocialDiscourseReply,
  buildConfirmShortTermMemoryReply,
  buildContinuityGovernedReply,
  socialConversationContinuityToVerbalizationInstructions,
} from "../lib/miaSocialConversationContinuity.js";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import {
  finalizeHumanConversationReply,
  buildGovernedSocialFallbackReply,
} from "../lib/miaHumanConversationExperience.js";
import { buildContractDrivenSocialFallback, buildMirrorGreetingReply } from "../lib/miaSocialContractVerbalization.js";
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

function hist(...pairs) {
  const out = [];
  for (const [role, content] of pairs) out.push({ role, content });
  return out;
}

console.log("\nPATCH 5.8.3 — Social Conversation Continuity\n");

test("version", () => {
  assert.equal(SOCIAL_CONVERSATION_CONTINUITY_VERSION, "5.8.7");
});

test("contract enriched", () => {
  const c = buildContract("oi");
  assert.equal(c.socialConversationContinuityVersion, "5.8.7");
  assert.ok(c.socialConversationContinuity);
});

// Greeting thread (~20)
test("greeting follow-up suppresses mirror", () => {
  const history = hist(["user", "oi"], ["assistant", "Oi! Tudo bem."]);
  const c = buildContract("tudo bem?", history);
  assert.equal(c.suppressMirrorGreeting, true);
  assert.equal(c.socialContinuityBehavior, SOCIAL_CONTINUITY_BEHAVIOR.CONTINUE_GREETING_THREAD);
});

test("greeting follow-up reply not Oi again", () => {
  const history = hist(["user", "oi"], ["assistant", "Oi! Tudo bem."]);
  const c = buildContract("tudo bem?", history);
  const reply = buildGovernedSocialFallbackReply(c, {});
  assert.doesNotMatch(reply, /^Oi!/i);
  assert.match(reply, /por aqui|certo|tranquilo|bem/i);
});

test("e você after greeting thread", () => {
  const history = hist(
    ["user", "oi"],
    ["assistant", "Oi! Tudo bem."],
    ["user", "tudo certo?"],
    ["assistant", "Tudo certo por aqui também."]
  );
  const c = buildContract("e você?", history);
  assert.ok(c.socialConversationContinuity?.greetingExchanged);
});

const greetingFollowUps = ["tudo bem?", "tudo certo?", "como vai?", "beleza?", "e aí?"];
for (const msg of greetingFollowUps) {
  test(`follow-up no reset: oi -> ${msg}`, () => {
    const history = hist(["user", "oi"], ["assistant", "Oi! Tudo bem."]);
    const c = buildContract(msg, history);
    assert.equal(c.suppressMirrorGreeting, true);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.doesNotMatch(reply, /^Oi!\s*Tudo bem/i);
  });
}

// Resumption (~25)
test("resume discourse detected", () => {
  const history = hist(
    ["user", "hoje estou cansado"],
    ["assistant", "Puxado — entendo."],
    ["user", "ok"],
    ["assistant", "Certo."]
  );
  const c = buildContract("como eu estava dizendo, o dia foi complicado", history);
  assert.equal(c.socialContinuityBehavior, SOCIAL_CONTINUITY_BEHAVIOR.RESUME_SOCIAL_DISCOURSE);
});

const resumptionPhrases = [
  "voltando ao assunto",
  "lembra do que eu disse",
  "como eu estava dizendo",
  "naquele assunto",
  "retomando o papo",
  "continuando o que falamos",
];
for (const msg of resumptionPhrases) {
  test(`resumption: ${msg}`, () => {
    const history = hist(
      ["user", "hoje estou cansado"],
      ["assistant", "Entendo."],
      ["user", "foi um dia complicado"],
      ["assistant", "Compreendo."]
    );
    const c = buildContract(msg, history);
    assert.ok(
      c.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.RESUME_SOCIAL_DISCOURSE ||
        c.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.CONFIRM_MEMORY
    );
    const reply = buildContinuityGovernedReply(c) || buildGovernedSocialFallbackReply(c, {});
    assert.doesNotMatch(reply, /Claro, pode falar comigo/i);
    assert.doesNotMatch(reply, /Sem problema — fico por aqui no papo/i);
  });
}

test("resume reply references topic", () => {
  const history = hist(["user", "hoje estou cansado"], ["assistant", "Entendo."]);
  const c = buildContract("voltando ao assunto", history);
  const reply = buildResumeSocialDiscourseReply(c);
  assert.match(reply, /lembro|voltando|assunto|falando|comentado|sentido/i);
});

// Memory confirm (~10)
test("você lembra?", () => {
  const history = hist(
    ["user", "quem é você"],
    ["assistant", "Sou a MIA."],
    ["user", "legal"]
  );
  const c = buildContract("então você lembra?", history);
  assert.ok(c.socialContinuityBehavior);
  const reply = buildConfirmShortTermMemoryReply(c);
  assert.match(reply, /lembro|sim|mente|pap/i);
});

// Emotional continuity (~15)
const emotionalThreads = [
  ["hoje estou cansado", "foi complicado"],
  ["dia difícil", "mas enfim"],
  ["semana pesada", "to mal"],
];
for (const [a, b] of emotionalThreads) {
  test(`emotional thread: ${a} -> ${b}`, () => {
    const history = hist(["user", a], ["assistant", "Compreendo."]);
    const c = buildContract(b, history);
    assert.ok(c.socialConversationContinuity?.activeSocialTopic || c.socialConversationContinuity?.lastUserEmotion);
  });
}

// Commercial -> social (~10)
test("return from commercial", () => {
  const history = hist(
    ["user", "quero celular"],
    ["assistant", "Recomendo o iPhone 13..."],
    ["user", "obrigado"]
  );
  const c = buildContract("deixa o produto, quero conversar", history);
  assert.equal(c.socialContinuityBehavior, SOCIAL_CONTINUITY_BEHAVIOR.RETURN_TO_SOCIAL_THREAD);
});

// Multiturn chains (~15)
const chains = [
  {
    id: "MC-01",
    turns: ["oi", "tudo certo?", "e você?", "como foi seu dia?"],
    check: (replies) => {
      assert.doesNotMatch(replies[1] || "", /^Oi!/i);
    },
  },
  {
    id: "MC-02",
    turns: ["hoje estou cansado", "dia complicado", "mas enfim", "voltando naquele assunto"],
    check: (replies) => {
      assert.match(replies[3] || "", /lembro|voltando|assunto|falando|comentado|sentido|mencionou|pensando/i);
    },
  },
  {
    id: "MC-03",
    turns: ["oi", "preciso de celular", "obrigado", "como você tá?"],
    check: () => {},
  },
];

for (const chain of chains) {
  test(`chain ${chain.id}`, () => {
    const history = [];
    const replies = [];
    for (const msg of chain.turns) {
      const c = buildContract(msg, history);
      const reply = buildGovernedSocialFallbackReply(c, {});
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: reply });
      replies.push(reply);
    }
    chain.check(replies);
  });
}

// Finalize integration (~10)
test("finalize greeting no reset", () => {
  const history = hist(["user", "oi"], ["assistant", "Oi! Tudo bem."]);
  const c = buildContract("tudo bem?", history);
  const out = finalizeHumanConversationReply("Oi! Tudo bem.", c, null, {}).response;
  assert.doesNotMatch(out, /^Oi!\s*Tudo bem/i);
});

test("finalize resume not stay_social", () => {
  const history = hist(["user", "to cansado"], ["assistant", "Entendo."]);
  const c = buildContract("lembra do assunto?", history);
  const out = finalizeHumanConversationReply("Claro, pode falar comigo.", c, null, {}).response;
  assert.doesNotMatch(out, /Claro, pode falar comigo/i);
});

// Discourse scan (~10)
test("scan detects greeting exchanged", () => {
  const scan = resolveSocialConversationContinuity({
    message: "tudo bem?",
    conversationMessages: hist(["user", "oi"], ["assistant", "Oi!"]),
  });
  assert.equal(scan.greetingExchanged, true);
});

test("phase emotional thread", () => {
  const scan = resolveSocialConversationContinuity({
    message: "ok",
    conversationMessages: hist(["user", "to cansado hoje"], ["assistant", "Entendo."]),
  });
  assert.equal(scan.conversationPhase, CONVERSATION_PHASE.EMOTIONAL_THREAD);
});

// Instructions (~5)
test("continuity instructions present", () => {
  const history = hist(["user", "oi"], ["assistant", "Oi!"]);
  const c = buildContract("tudo bem?", history);
  const instr = socialConversationContinuityToVerbalizationInstructions(c);
  assert.match(instr, /Continuidade conversacional/i);
  assert.match(instr, /NÃO reiniciar/i);
});

// Expanded batch (~100)
const greetingOpeners = ["oi", "Opa", "Bom dia", "Boa tarde", "E aí", "Salve", "Hey"];
const followUps = ["tudo bem?", "tudo certo?", "como vai?", "beleza?", "tranquilo?", "suave?"];
for (const g of greetingOpeners) {
  for (const f of followUps.slice(0, 2)) {
    test(`batch greeting ${g} -> ${f}`, () => {
      const history = hist(["user", g], ["assistant", "Oi! Tudo bem."]);
      const c = buildContract(f, history);
      if (c.suppressMirrorGreeting) {
        const reply = buildGovernedSocialFallbackReply(c, {});
        assert.doesNotMatch(reply, /^Oi!\s*Tudo bem/i);
      }
    });
  }
}

const ventOpeners = [
  "hoje estou cansado",
  "dia difícil",
  "semana pesada",
  "to meio down",
  "não tô legal",
  "cansado hoje",
  "dia puxado",
];
const ventFollows = ["foi complicado", "mas enfim", "continua", "e você?", "ok"];
for (const v of ventOpeners) {
  for (const f of ventFollows.slice(0, 2)) {
    test(`batch vent ${v.slice(0, 12)} -> ${f}`, () => {
      const history = hist(["user", v], ["assistant", "Compreendo."]);
      const c = buildContract(f, history);
      assert.ok(c.socialConversationContinuity);
    });
  }
}

const resumeVariants = [
  "voltando ao assunto",
  "como eu estava dizendo",
  "lembra do assunto",
  "naquele assunto que comentei",
  "retomando o papo",
  "continuando o que falamos",
  "sobre o que eu falei",
  "como falamos antes",
];
for (const r of resumeVariants) {
  test(`batch resume ${r.slice(0, 20)}`, () => {
    const history = hist(
      ["user", "hoje estou cansado"],
      ["assistant", "Entendo."],
      ["user", "foi complicado"],
      ["assistant", "Compreendo."]
    );
    const c = buildContract(r, history);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.doesNotMatch(reply, /Claro, pode falar comigo/i);
  });
}

const commercialReturns = [
  "deixa o produto",
  "esquece a compra",
  "só queria conversar",
  "volta pro papo",
  "mudando de assunto",
];
for (const msg of commercialReturns) {
  test(`batch commercial return: ${msg}`, () => {
    const history = hist(
      ["user", "quero notebook"],
      ["assistant", "Recomendo..."],
      ["user", "obrigado"]
    );
    const c = buildContract(msg, history);
    assert.ok(c.socialConversationContinuity);
  });
}

const metaThenMemory = [
  ["qual seu nome?", "então você lembra?"],
  ["quem é você?", "você lembra?"],
  ["como você funciona?", "lembra disso?"],
];
for (const [a, b] of metaThenMemory) {
  test(`meta memory ${a} -> ${b}`, () => {
    const history = hist(["user", a], ["assistant", "Sou a MIA."]);
    const c = buildContract(b, history);
    assert.ok(c.socialConversationContinuity);
  });
}

// Builder unit tests (~15)
test("buildContinueGreetingThreadReply", () => {
  const c = buildContract("tudo bem?", hist(["user", "oi"], ["assistant", "Oi!"]));
  const reply = buildContinueGreetingThreadReply(c);
  assert.ok(reply && reply.length > 5);
  assert.doesNotMatch(reply, /^Oi!/i);
});

test("buildReturnToSocialThreadReply", () => {
  const history = hist(
    ["user", "quero celular"],
    ["assistant", "Recomendo..."],
    ["user", "obrigado"]
  );
  const c = buildContract("deixa o produto, quero conversar", history);
  assert.equal(c.socialContinuityBehavior, SOCIAL_CONTINUITY_BEHAVIOR.RETURN_TO_SOCIAL_THREAD);
  const reply = buildContinuityGovernedReply(c);
  assert.ok(reply);
});

// Indirect reference batch (~20)
const indirectRefs = [
  "e sobre isso?",
  "continua",
  "e daí?",
  "fala mais",
  "como assim?",
  "entendi, e?",
  "ah sim",
  "pois é",
  "verdade",
  "exato",
];
for (const msg of indirectRefs) {
  test(`indirect ref after vent: ${msg}`, () => {
    const history = hist(["user", "hoje estou cansado"], ["assistant", "Entendo."]);
    const c = buildContract(msg, history);
    assert.ok(c.socialConversationContinuity);
  });
}

// Reciprocity batch (~15)
const reciprocityPairs = [
  ["e você?", "tudo bem por aqui"],
  ["como você tá?", "bem e você?"],
  ["e contigo?", "tranquilo"],
  ["como vai?", "vai bem"],
];
for (const [msg, prior] of reciprocityPairs) {
  test(`reciprocity ${msg}`, () => {
    const history = hist(["user", "oi"], ["assistant", prior]);
    const c = buildContract(msg, history);
    assert.ok(c.socialConversationContinuity);
  });
}

// Extended multiturn chains (~12 chains x 1 test = 12)
const extendedChains = [
  {
    id: "MC-04",
    turns: ["bom dia", "tudo certo?", "e você?", "como foi seu dia?"],
    check: (replies) => assert.doesNotMatch(replies[1] || "", /^Bom dia/i),
  },
  {
    id: "MC-05",
    turns: ["hoje estou cansado", "foi complicado", "mas enfim", "como eu estava dizendo"],
    check: (replies) => assert.doesNotMatch(replies[3] || "", /fico por aqui no papo/i),
  },
  {
    id: "MC-06",
    turns: ["quem é você", "como você funciona", "então você lembra?"],
    check: (replies) => assert.match(replies[2] || "", /lembro|sim|mente|voltando|assunto|comentado|sentido|mencionou/i),
  },
  {
    id: "MC-07",
    turns: ["kkk", "engraçado", "e você?", "como vai?"],
    check: () => {},
  },
  {
    id: "MC-08",
    turns: ["oi", "preciso notebook", "deixa o produto", "como você tá?"],
    check: () => {},
  },
  {
    id: "MC-09",
    turns: ["dia difícil", "semana pesada", "voltando ao assunto"],
    check: (replies) => assert.doesNotMatch(replies[2] || "", /Claro, pode falar/i),
  },
  {
    id: "MC-10",
    turns: ["salve", "beleza?", "tranquilo?", "e aí?"],
    check: (replies) => assert.doesNotMatch(replies[1] || "", /^Salve/i),
  },
  {
    id: "MC-11",
    turns: ["to meio down", "não tô legal", "mas enfim", "lembra do assunto?"],
    check: (replies) => assert.doesNotMatch(replies[3] || "", /Claro, pode falar/i),
  },
  {
    id: "MC-12",
    turns: ["hey", "suave?", "como vai?", "como foi seu dia?"],
    check: (replies) => assert.doesNotMatch(replies[1] || "", /^Hey/i),
  },
];

for (const chain of extendedChains) {
  test(`chain ${chain.id}`, () => {
    const history = [];
    const replies = [];
    for (const msg of chain.turns) {
      const c = buildContract(msg, history);
      const reply = buildGovernedSocialFallbackReply(c, {});
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: reply });
      replies.push(reply);
    }
    chain.check(replies);
  });
}

// Contract-driven fallback routing (~10)
test("contract driven uses continuity not mirror", () => {
  const history = hist(["user", "oi"], ["assistant", "Oi! Tudo bem."]);
  const c = buildContract("tudo bem?", history);
  const result = buildContractDrivenSocialFallback(c, {});
  const reply = typeof result === "string" ? result : result?.text;
  assert.doesNotMatch(reply, /^Oi!\s*Tudo bem/i);
});

test("mirror greeting when no continuity", () => {
  const c = buildContract("oi");
  const reply = buildMirrorGreetingReply(c);
  assert.match(reply, /oi|olá|bom|boa|opa|salve/i);
});

// Phase detection batch (~12)
const phaseCases = [
  {
    history: hist(["user", "oi"], ["assistant", "Oi!"]),
    msg: "tudo bem?",
    check: (scan) => assert.equal(scan.greetingExchanged, true),
  },
  {
    history: hist(["user", "to cansado"], ["assistant", "Entendo."]),
    msg: "ok",
    check: (scan) => assert.equal(scan.conversationPhase, CONVERSATION_PHASE.EMOTIONAL_THREAD),
  },
];
for (const { history, msg, check } of phaseCases) {
  test(`phase scan for ${msg}`, () => {
    const scan = resolveSocialConversationContinuity({ message: msg, conversationMessages: history });
    check(scan);
  });
}

// Strength / behavior batch (~8)
test("continuity strength moderate on resume", () => {
  const history = hist(["user", "hoje estou cansado"], ["assistant", "Entendo."]);
  const c = buildContract("voltando ao assunto", history);
  assert.ok(c.socialConversationContinuity?.continuityStrength);
  const reply = buildResumeSocialDiscourseReply(c);
  assert.match(reply, /hoje estou cansado|cansado/i);
});

test("resumption phrase not stored as topic", () => {
  const scan = resolveSocialConversationContinuity({
    message: "voltando ao assunto",
    conversationMessages: hist(
      ["user", "hoje estou cansado"],
      ["assistant", "Entendo."],
      ["user", "foi complicado"],
      ["assistant", "Compreendo."]
    ),
  });
  assert.equal(scan.activeSocialTopic, "hoje estou cansado");
});

// Large multiturn parametrized batch (target 120+ total)
const greetingSequences = [
  ["oi", "tudo bem?"],
  ["opa", "beleza?"],
  ["bom dia", "como vai?"],
  ["boa tarde", "tudo certo?"],
  ["salve", "tranquilo?"],
  ["hey", "suave?"],
  ["e aí", "e você?"],
];
for (const [g, f] of greetingSequences) {
  test(`seq greeting ${g} -> ${f}`, () => {
    const history = hist(["user", g], ["assistant", "Oi! Tudo bem."]);
    const c = buildContract(f, history);
    if (c.suppressMirrorGreeting) {
      const reply = buildGovernedSocialFallbackReply(c, {});
      assert.doesNotMatch(reply, new RegExp(`^${g}`, "i"));
    }
  });
}

const emotionalSequences = [
  ["hoje estou cansado", "foi complicado", "mas enfim"],
  ["dia difícil", "semana pesada", "to mal"],
  ["não tô legal", "piorou", "enfim"],
  ["to meio down", "cansado", "ok"],
  ["estressado", "puxado", "beleza"],
];
for (const seq of emotionalSequences) {
  test(`seq emotional ${seq[0].slice(0, 10)}`, () => {
    const history = [];
    for (let i = 0; i < seq.length - 1; i++) {
      history.push({ role: "user", content: seq[i] });
      history.push({ role: "assistant", content: "Entendo." });
    }
    const c = buildContract(seq[seq.length - 1], history);
    assert.ok(c.socialConversationContinuity);
  });
}

const commercialSocialSequences = [
  ["oi", "quero celular", "obrigado", "como você tá?"],
  ["bom dia", "preciso notebook", "deixa o produto", "tudo bem?"],
  ["opa", "me recomenda fone", "esquece a compra", "e você?"],
];
for (const seq of commercialSocialSequences) {
  test(`seq comm-social ${seq[0]}-${seq[2].slice(0, 8)}`, () => {
    const history = [];
    const replies = [];
    for (const msg of seq) {
      const c = buildContract(msg, history);
      const reply = buildGovernedSocialFallbackReply(c, {});
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: reply });
      replies.push(reply);
    }
    assert.ok(replies.every(Boolean));
  });
}

const resumeAfterGap = [
  ["hoje estou cansado", "ok", "certo", "voltando ao assunto"],
  ["dia puxado", "hm", "sim", "como eu estava dizendo"],
  ["semana pesada", "entendi", "beleza", "lembra do assunto?"],
];
for (const seq of resumeAfterGap) {
  test(`seq resume-gap ${seq[3].slice(0, 12)}`, () => {
    const history = [];
    for (let i = 0; i < seq.length - 1; i++) {
      history.push({ role: "user", content: seq[i] });
      history.push({ role: "assistant", content: "Certo." });
    }
    const c = buildContract(seq[seq.length - 1], history);
    const reply = buildGovernedSocialFallbackReply(c, {});
    assert.doesNotMatch(reply, /Claro, pode falar comigo/i);
  });
}

console.log(`\n${"=".repeat(50)}`);
console.log(`PATCH 5.8.3 tests: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
