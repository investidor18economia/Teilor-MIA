/**
 * PATCH 4.1I — Social Intent Taxonomy Audit
 *
 * Rodar: node scripts/test-mia-patch-41i-social-intent-taxonomy-audit.js
 */

import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
  shouldBypassDefaultProductSearch,
  detectConversationalEntityMentionFrame,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  classifySocialIntent,
  SOCIAL_INTENT_FAMILIES,
  isComplimentDirectedAtMia,
} from "../lib/miaSocialIntentTaxonomy.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import { COMMERCIAL_PERMISSION } from "../lib/miaIntentAuthority.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    → ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function expect(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${label ? ` [${label}]` : ""}`
    );
  }
}

function expectTrue(val, label = "") {
  if (!val) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function expectFalse(val, label = "") {
  if (val) throw new Error(`Expected falsy${label ? ` [${label}]` : ""}`);
}

function recognize(message, extra = {}) {
  return recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: extra.sessionContext || {},
    signals: extra.signals || {},
    cognitiveTurn: extra.cognitiveTurn || null,
    hasActiveAnchor: !!extra.hasActiveAnchor,
    detectedIntent: extra.detectedIntent || "",
  });
}

function expectSocialFamily(message, expectedFamily, opts = {}) {
  const r = recognize(message, opts);
  expect(r.primarySocialIntent, expectedFamily, `primarySocialIntent for "${message}"`);
  return r;
}

console.log("\nPATCH 4.1I — Social Intent Taxonomy Audit\n");

console.log("Grupo A — Cumprimentos");
for (const msg of ["Opa", "Oi", "E aí", "eae", "oii", "Boa tarde", "fala mia"]) {
  test(`A: "${msg}" → greeting`, () => {
    const r = expectSocialFamily(msg, SOCIAL_INTENT_FAMILIES.GREETING);
    expect(r.interactionMode, MIA_INTERACTION_MODES.SOCIAL);
    expectTrue(shouldBypassDefaultProductSearch(r));
  });
}

console.log("\nGrupo B — Gratidão");
for (const msg of ["Obrigado", "Valeu", "muito obrigado", "brigadão", "tmj"]) {
  test(`B: "${msg}" → gratitude`, () => {
    const r = expectSocialFamily(msg, SOCIAL_INTENT_FAMILIES.GRATITUDE);
    expect(r.interactionMode, MIA_INTERACTION_MODES.SOCIAL);
  });
}

console.log("\nGrupo C — Elogios à MIA");
for (const [msg, family] of [
  ["Linda", SOCIAL_INTENT_FAMILIES.COMPLIMENT],
  ["Você é muito inteligente", SOCIAL_INTENT_FAMILIES.PRAISE],
  ["Gostei de você", SOCIAL_INTENT_FAMILIES.PRAISE],
  ["Você me ajudou muito", SOCIAL_INTENT_FAMILIES.PRAISE],
  ["nossa mia voce eh linda", SOCIAL_INTENT_FAMILIES.COMPLIMENT],
]) {
  test(`C: "${msg}" → ${family}`, () => {
    expectTrue(isComplimentDirectedAtMia(msg));
    expectFalse(detectConversationalEntityMentionFrame(msg));
    const r = recognize(msg);
    expectTrue(
      [SOCIAL_INTENT_FAMILIES.PRAISE, SOCIAL_INTENT_FAMILIES.COMPLIMENT].includes(
        r.primarySocialIntent
      ),
      "praise or compliment"
    );
    expect(r.interactionMode, MIA_INTERACTION_MODES.SOCIAL);
    expectTrue(r.commercialRelevance < 0.2, "commercialRelevance");
  });
}

console.log("\nGrupo D — Correção / reparo");
for (const msg of [
  "Você não entendeu",
  "Pqp você não entendeu nada",
  "Você viajou",
  "nao foi isso que eu quis dizer",
]) {
  test(`D: "${msg}" → correction`, () => {
    const r = recognize(msg);
    expectTrue(
      [
        SOCIAL_INTENT_FAMILIES.CORRECTION,
        SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR,
        SOCIAL_INTENT_FAMILIES.CONVERSATION_RECOVERY,
        SOCIAL_INTENT_FAMILIES.FRUSTRATION,
        SOCIAL_INTENT_FAMILIES.INSULT,
        SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT,
      ].includes(r.primarySocialIntent),
      "repair family"
    );
    expectTrue(r.commercialRelevance < 0.2);
  });
}

console.log("\nGrupo E — Humor / ironia / sarcasmo");
for (const [msg, family] of [
  ["Foi brincadeira kkk", SOCIAL_INTENT_FAMILIES.IRONY],
  ["Era ironia", SOCIAL_INTENT_FAMILIES.IRONY],
  ["claro que quero um celular q explode na primeira queda ne 😂", SOCIAL_INTENT_FAMILIES.SARCASM],
  ["mia, conta uma piada de celular", SOCIAL_INTENT_FAMILIES.JOKE],
  ["preciso do celular do batman kkk", SOCIAL_INTENT_FAMILIES.HUMOR],
]) {
  test(`E: "${msg.slice(0, 40)}..." → ${family}`, () => {
    const r = expectSocialFamily(msg, family);
    expect(r.interactionMode, MIA_INTERACTION_MODES.SOCIAL);
    expectTrue(r.commercialRelevance < 0.25, "not commercial");
  });
}

console.log("\nGrupo F — Meta / identidade / confiança");
for (const [msg, family] of [
  ["Quem te criou?", SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION],
  ["Como você funciona?", SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION],
  ["Você ganha comissão?", SOCIAL_INTENT_FAMILIES.TRUST_QUESTION],
  ["por que eu deveria confiar em voce?", SOCIAL_INTENT_FAMILIES.TRUST_QUESTION],
]) {
  test(`F: "${msg}" → ${family}`, () => {
    const r = expectSocialFamily(msg, family);
    expect(r.interactionMode, MIA_INTERACTION_MODES.IDENTITY);
    expect(r.primaryIntent, "about_mia");
  });
}

console.log("\nGrupo G — Frustração / insulto");
for (const msg of [
  "nao ta ajudando NADA, que assistente inutil",
  "Tá doida?",
  "para de enrolar seu robo lixo",
]) {
  test(`G: "${msg.slice(0, 35)}..." → hostile`, () => {
    const r = recognize(msg);
    expectTrue(
      r.socialClassification?.isHostileIntent ||
        [
          SOCIAL_INTENT_FAMILIES.FRUSTRATION,
          SOCIAL_INTENT_FAMILIES.INSULT,
          SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT,
          SOCIAL_INTENT_FAMILIES.CORRECTION,
        ].includes(r.primarySocialIntent)
    );
    expectTrue(r.commercialRelevance < 0.2);
  });
}

console.log("\nGrupo H — Small talk / conversa");
for (const msg of ["Só queria conversar", "como ta seu dia?", "to só batendo papo"]) {
  test(`H: "${msg}" → social`, () => {
    const r = recognize(msg);
    expectTrue(
      [
        SOCIAL_INTENT_FAMILIES.SMALL_TALK,
        SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST,
        SOCIAL_INTENT_FAMILIES.GREETING,
      ].includes(r.primarySocialIntent) || r.interactionMode === MIA_INTERACTION_MODES.SOCIAL
    );
    expectTrue(r.commercialRelevance < 0.2);
  });
}

console.log("\nGrupo I — Emoção / incerteza");
for (const [msg, family] of [
  ["Tô frustrado", SOCIAL_INTENT_FAMILIES.EMOTIONAL_SUPPORT],
  ["Tô feliz", SOCIAL_INTENT_FAMILIES.EMOTIONAL_SUPPORT],
  ["Tô indeciso", SOCIAL_INTENT_FAMILIES.USER_UNCERTAINTY],
]) {
  test(`I: "${msg}" → ${family}`, () => {
    expectSocialFamily(msg, family);
  });
}

console.log("\nGrupo J — Aprovação curta");
for (const msg of ["Boa", "Perfeito", "Arrasou", "Show"]) {
  test(`J: "${msg}" → approval/reaction`, () => {
    const r = recognize(msg);
    expectTrue(
      [
        SOCIAL_INTENT_FAMILIES.APPROVAL,
        SOCIAL_INTENT_FAMILIES.REACTION,
        SOCIAL_INTENT_FAMILIES.PRAISE,
        SOCIAL_INTENT_FAMILIES.SOCIAL_VALIDATION,
      ].includes(r.primarySocialIntent),
      `got ${r.primarySocialIntent}`
    );
  });
}

console.log("\nGrupo K — Campos ricos do contrato");
test("K: classifySocialIntent produz todos os campos obrigatórios", () => {
  const c = classifySocialIntent("Opa, tudo bem?");
  expectTrue(c.primarySocialIntent);
  expectTrue(c.emotionalState);
  expectTrue(c.conversationObjective);
  expectTrue(c.conversationDirection);
  expectTrue(c.expectedHumanBehavior);
  expectTrue(typeof c.confidence === "number");
  expectTrue(Array.isArray(c.reasonCodes));
  expectTrue(Array.isArray(c.signals));
});

console.log("\nGrupo L — Regressão comercial (não quebrar)");
for (const msg of [
  "Qual celular compensa até R$ 2.000?",
  "Quero um notebook bom para trabalho",
  "Compare Galaxy A55 e Moto G84",
]) {
  test(`L: "${msg.slice(0, 40)}..." → commerce`, () => {
    const r = recognize(msg, { signals: { hasClearNewCommercialSearch: true } });
    expect(r.interactionMode, MIA_INTERACTION_MODES.COMMERCE);
    expectTrue(r.commercialRelevance >= 0.45);
  });
}

console.log("\nGrupo M — Mixed intent preservado");
test("M: emoção + compra → mixed", () => {
  const r = recognize("to perdido e preciso de um celular barato");
  expectTrue(
    r.interactionMode === MIA_INTERACTION_MODES.MIXED ||
      r.interactionMode === MIA_INTERACTION_MODES.COMMERCE
  );
});

console.log("\nGrupo N — Authority / routing social hold");
test("N: elogio não autoriza busca comercial", () => {
  const r = recognize("Linda");
  const authority = buildIntentAuthorityFromRecognition(r);
  expect(authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
  const rd = buildRoutingDecision({
    userMessage: "Linda",
    resolvedQuery: "Linda",
    contextResolution: {},
    sessionContext: {},
    incomingSessionContext: {},
    intent: r.legacyIntentOverride || "general_answer",
    contextAction: "conversation",
    signals: {},
    intentRecognition: r,
    intentAuthority: authority,
  });
  expectFalse(rd.allowNewSearch);
});

console.log("\nGrupo O — Casos negativos (produto vs MIA)");
test("O: elogio a produto não é compliment to MIA", () => {
  expectFalse(isComplimentDirectedAtMia("esse celular é lindo"));
  expectTrue(detectConversationalEntityMentionFrame("esse celular é lindo"));
});

test("O: recomendação comercial permanece comercial", () => {
  const r = recognize("me recomenda um iphone bom");
  expect(r.interactionMode, MIA_INTERACTION_MODES.COMMERCE);
});

console.log("\nGrupo P — Robustez linguística");
for (const [msg, family] of [
  ["OPA", SOCIAL_INTENT_FAMILIES.GREETING],
  ["vlw mia", SOCIAL_INTENT_FAMILIES.GRATITUDE],
  ["vc eh demais!!!", SOCIAL_INTENT_FAMILIES.PRAISE],
  ["  oi  ", SOCIAL_INTENT_FAMILIES.GREETING],
]) {
  test(`P: "${msg}" → ${family}`, () => {
    const r = recognize(msg);
    if (family === SOCIAL_INTENT_FAMILIES.PRAISE) {
      expectTrue(
        [SOCIAL_INTENT_FAMILIES.PRAISE, SOCIAL_INTENT_FAMILIES.APPROVAL].includes(
          r.primarySocialIntent
        )
      );
    } else {
      expectSocialFamily(msg, family);
    }
  });
}

console.log("\n" + "─".repeat(50));
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFalhas:");
  failures.forEach((f) => console.log(`  - ${f.label}: ${f.error}`));
  process.exit(1);
}
console.log("PATCH 4.1I taxonomy tests: OK\n");
