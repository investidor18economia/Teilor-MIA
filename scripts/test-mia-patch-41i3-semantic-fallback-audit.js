/**
 * PATCH 4.1I.3 — Semantic Authority & Governed Fallback Audit
 *
 * Rodar: node scripts/test-mia-patch-41i3-semantic-fallback-audit.js
 */

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildClarificationMessage } from "../lib/miaClarificationGates.js";
import { extractCommercialRefinement } from "../lib/miaCommercialConstraintRefinement.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { finalizeHumanConversationReply } from "../lib/miaHumanConversationExperience.js";
import {
  resolveSemanticTarget,
  SEMANTIC_TARGETS,
} from "../lib/miaSemanticTargetResolution.js";
import {
  isCommercialFallbackBlocked,
  isEntityOpinionFallbackAllowed,
  isAcceptableGovernedSocialReply,
  resolveGovernedSocialRoutingKey,
  GOVERNED_SOCIAL_ROUTING_KEYS,
  isCommercialRedirectText,
} from "../lib/miaSemanticAuthority.js";
import {
  selectGovernedFallback,
  FALLBACK_FAMILIES,
} from "../lib/miaGovernedFallbackPolicy.js";
import {
  extractContentAnchors,
  buildSpecificGovernedFallback,
} from "../lib/miaSocialResponsePerception.js";
import { SOCIAL_INTENT_FAMILIES } from "../lib/miaSocialIntentTaxonomy.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";

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

function expectEqual(a, b, label = "") {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)} got ${JSON.stringify(a)}${label ? ` [${label}]` : ""}`);
}

function expectTrue(val, label = "") {
  if (!val) throw new Error(`Expected truthy${label ? ` [${label}]` : ""}`);
}

function expectFalse(val, label = "") {
  if (val) throw new Error(`Expected falsy${label ? ` [${label}]` : ""}`);
}

function expectNotIncludes(haystack, needle, label = "") {
  if (String(haystack || "").toLowerCase().includes(String(needle).toLowerCase())) {
    throw new Error(`Should not include "${needle}"${label ? ` [${label}]` : ""}`);
  }
}

function buildContract(message, conversationMessages = [], sessionContext = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext,
    signals: {},
    hasActiveAnchor: false,
    conversationMessages,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: false,
    sessionContext,
  });
  return buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
    conversationMessages,
    sessionContext,
  });
}

console.log("\nPATCH 4.1I.3 — Semantic Authority & Governed Fallback Audit\n");

console.log("Precedence & authority");
test("1. contrato social bloqueia fallback comercial", () => {
  const c = buildContract("Só queria conversar");
  expectTrue(isCommercialFallbackBlocked(c));
  const fb = selectGovernedFallback(c, { failureReason: "test" });
  expectNotIncludes(fb.text, "celular, notebook");
  expectNotIncludes(fb.text, "direcionar a escolha");
});

test("2. alvo MIA bloqueia entity opinion", () => {
  const c = buildContract("vc é linda");
  expectEqual(c.resolvedSemanticTarget, SEMANTIC_TARGETS.MIA);
  expectFalse(isEntityOpinionFallbackAllowed(c, c.semanticTargetResolution));
  expectNotIncludes(buildSpecificGovernedFallback(c), "visual dele");
});

test("3. alvo produto preserva entity opinion", () => {
  const msgs = [
    { role: "user", content: "O design do iPhone 15 é bonito" },
  ];
  const c = buildContract("Esse celular é lindo", msgs);
  expectTrue(
    c.resolvedSemanticTarget === SEMANTIC_TARGETS.PRODUCT ||
      isEntityOpinionFallbackAllowed(c, c.semanticTargetResolution)
  );
});

test("4. alvo desconhecido não cria entidade fictícia em social", () => {
  const c = buildContract("Legal");
  const fb = selectGovernedFallback(c, { failureReason: "test" });
  expectNotIncludes(fb.text, "visual dele");
});

test("5. ironia não redireciona para compra", () => {
  const c = buildContract("Era ironia");
  const fb = selectGovernedFallback(c, { failureReason: "test" });
  expectNotIncludes(fb.text, "buscando");
  expectNotIncludes(fb.text, "celular");
});

test("6. pedido de conversa não redireciona para categoria", () => {
  const c = buildContract("só vim conversar");
  const fb = selectGovernedFallback(c, { failureReason: "test" });
  expectNotIncludes(fb.text, "faixa ou produto");
  expectNotIncludes(fb.text, "notebook");
});

test("7. agradecimento aceita resposta curta", () => {
  const c = buildContract("obrigado, você ajudou bastante");
  const result = finalizeHumanConversationReply("Imagina.", c);
  expectTrue(result.validation.valid || result.response === "Imagina.");
});

test("8. validator social não exige conteúdo comercial", () => {
  const c = buildContract("Você é muito inteligente");
  const result = finalizeHumanConversationReply("Obrigada pelo elogio!", c);
  expectNotIncludes(result.response, "direcionar a escolha");
});

test("9. mixed intent preserva componente comercial", () => {
  const c = buildContract("Você é ótima, mas quero voltar aos celulares");
  expectFalse(isCommercialFallbackBlocked(c));
});

test("10. commercial intent explícito permanece comercial", () => {
  const c = buildContract("Qual celular compensa até R$ 2.000?");
  const commercialContract = {
    ...c,
    commercialIntent: true,
    interactionMode: MIA_INTERACTION_MODES.COMMERCE,
    commerceReentryPolicy: "mixed_continue",
    responseBehavior: { ...(c.responseBehavior || {}), redirectToCommerce: true },
  };
  expectFalse(isCommercialFallbackBlocked(commercialContract));
});

test("11. fallback selecionado mantém intenção", () => {
  const c = buildContract("Você me ajudou muito");
  const fb = selectGovernedFallback(c, { failureReason: "test" });
  expectTrue(
    fb.family === FALLBACK_FAMILIES.PRAISE || fb.family === FALLBACK_FAMILIES.GRATITUDE
  );
});

test("12. resposta bruta correta não é substituída", () => {
  const c = buildContract("Você é muito inteligente");
  const result = finalizeHumanConversationReply("Obrigada pelo elogio!", c);
  expectEqual(result.response, "Obrigada pelo elogio!");
  expectFalse(result.usedFallback);
});

test("13. resposta inválida comercial em social é substituída", () => {
  const c = buildContract("Era ironia");
  const result = finalizeHumanConversationReply("Isso ajuda bastante a direcionar a escolha.", c);
  expectNotIncludes(result.response, "direcionar a escolha");
});

test("14. adapter legado não reduz intenção específica", () => {
  const c = buildContract("Linda");
  expectEqual(c.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.MIA_COMPLIMENT);
});

test("15. mesma entrada segue caminho determinístico", () => {
  const a = selectGovernedFallback(buildContract("Era ironia"), { failureReason: "t" });
  const b = selectGovernedFallback(buildContract("Era ironia"), { failureReason: "t" });
  expectEqual(a.text, b.text);
});

console.log("\nTarget resolution");
test("16. contexto produto resolve referência ao produto", () => {
  const msgs = [
    { role: "user", content: "O que acha do design do Galaxy A55?" },
    { role: "assistant", content: "O Galaxy A55 5G tem design marcante..." },
  ];
  const t = resolveSemanticTarget({
    message: "Linda",
    recognition: recognizeMiaIntent({
      userMessage: "Linda",
      resolvedQuery: "Linda",
      sessionContext: {},
      conversationMessages: msgs,
    }),
    conversationMessages: msgs,
  });
  expectEqual(t.target, SEMANTIC_TARGETS.PRODUCT);
});

test("17. contexto social resolve referência à MIA", () => {
  const msgs = [{ role: "user", content: "Oi, MIA" }];
  const t = resolveSemanticTarget({
    message: "Linda",
    recognition: recognizeMiaIntent({
      userMessage: "Linda",
      resolvedQuery: "Linda",
      sessionContext: {},
      conversationMessages: msgs,
    }),
    conversationMessages: msgs,
  });
  expectEqual(t.target, SEMANTIC_TARGETS.MIA);
});

test("18. contexto ambíguo não inventa produto em elogio MIA", () => {
  const c = buildContract("Você é bonita");
  expectEqual(c.resolvedSemanticTarget, SEMANTIC_TARGETS.MIA);
  const anchors = extractContentAnchors("Você é bonita", { resolvedTarget: SEMANTIC_TARGETS.MIA });
  expectFalse(anchors.includes("estetica"));
});

test("19. conversa apreciada não vira produto", () => {
  const t = resolveSemanticTarget({
    message: "Gostei dessa conversa",
    recognition: recognizeMiaIntent({
      userMessage: "Gostei dessa conversa",
      resolvedQuery: "Gostei dessa conversa",
      sessionContext: {},
    }),
  });
  expectEqual(t.target, SEMANTIC_TARGETS.CONVERSATION);
});

test("20. pronome sem contexto permanece desconhecido", () => {
  const t = resolveSemanticTarget({
    message: "Ele é lindo",
    recognition: recognizeMiaIntent({
      userMessage: "Ele é lindo",
      resolvedQuery: "Ele é lindo",
      sessionContext: {},
    }),
  });
  expectEqual(t.target, SEMANTIC_TARGETS.UNKNOWN);
});

test("21. Bonito demais com contexto de produto", () => {
  const msgs = [
    { role: "user", content: "Estou olhando o iPhone 15 azul" },
    { role: "assistant", content: "O iPhone 15 tem acabamento premium." },
  ];
  const t = resolveSemanticTarget({
    message: "Bonito demais",
    recognition: recognizeMiaIntent({
      userMessage: "Bonito demais",
      resolvedQuery: "Bonito demais",
      sessionContext: {},
      conversationMessages: msgs,
    }),
    conversationMessages: msgs,
  });
  expectEqual(t.target, SEMANTIC_TARGETS.PRODUCT);
  const fin = finalizeHumanConversationReply("Obrigada! Fico feliz.", buildContract("Bonito demais", msgs));
  expectFalse(/\bobrigad/i.test(fin.response));
});

test("22. aprovação curta com resposta anterior", () => {
  const msgs = [
    { role: "user", content: "Me explique a diferença entre OLED e AMOLED" },
    { role: "assistant", content: "OLED usa pixels autoiluminados; AMOLED é uma variante active-matrix." },
  ];
  const t = resolveSemanticTarget({
    message: "Muito boa",
    recognition: recognizeMiaIntent({
      userMessage: "Muito boa",
      resolvedQuery: "Muito boa",
      sessionContext: {},
      conversationMessages: msgs,
    }),
    conversationMessages: msgs,
  });
  expectEqual(t.target, SEMANTIC_TARGETS.PREVIOUS_ANSWER);
});

test("23. quero conversar sobre música permanece social", () => {
  const r = recognizeMiaIntent({
    userMessage: "Quero conversar sobre música",
    resolvedQuery: "Quero conversar sobre música",
    sessionContext: {},
  });
  expectEqual(r.interactionMode, MIA_INTERACTION_MODES.SOCIAL);
  expectFalse(r.commercialIntent);
});

test("24. clarificação curta não comercial evita redirect legado", () => {
  const msg = buildClarificationMessage(["intent"], { hasCommercialAsk: false });
  expectNotIncludes(msg, "celular, notebook");
  expectNotIncludes(msg, "buscando");
});

test("25. sem assunto não vira negative brand refinement", () => {
  const r = extractCommercialRefinement("Estou sem assunto", { sessionContext: {} });
  expectFalse(r?.detected && r?.refinementType === "negative_brand_refinement");
});

test("26. pois é legado é substituído em social", () => {
  const c = buildContract("Legal");
  const fin = finalizeHumanConversationReply("Pois é.", c);
  expectFalse(/^pois e/i.test(fin.response.trim()));
});

console.log("\nRegression matrix — critical cases");
const criticalCases = [
  ["Linda", (r) => !/visual dele/i.test(r)],
  ["Você é muito inteligente", (r) => /obrigad|elogio|gentil/i.test(r)],
  ["Era ironia", (r) => !/direcionar a escolha|buscando/i.test(r)],
  ["Só queria conversar", (r) => !/direcionar a escolha|buscando/i.test(r)],
  ["Você me ajudou muito", (r) => /ajud|feliz|obrigad/i.test(r)],
  ["vc é linda", (r) => !/visual dele/i.test(r)],
  ["bonita vc hein", (r) => !/visual dele/i.test(r)],
  ["tava sendo irônico", (r) => !/buscando|notebook/i.test(r)],
  ["eu tava brincando", (r) => !/buscando|notebook/i.test(r)],
  ["só vim conversar", (r) => !/buscando|notebook/i.test(r)],
];

for (const [msg, check] of criticalCases) {
  test(`regression: ${msg}`, () => {
    const c = buildContract(msg);
    const fb = selectGovernedFallback(c, { failureReason: "regression" });
    expectTrue(check(fb.text), fb.text);
    const fin = finalizeHumanConversationReply(
      isCommercialRedirectText("Isso ajuda bastante a direcionar a escolha.") ? "Isso ajuda bastante a direcionar a escolha." : fb.text,
      c
    );
    expectTrue(check(fin.response), fin.response);
  });
}

console.log("\nNon-commercial subjects");
for (const msg of [
  "Quero conversar sobre música",
  "Hoje foi um dia cansativo",
  "Não quero comprar nada",
  "Podemos mudar de assunto?",
]) {
  test(`non-commercial: ${msg.slice(0, 30)}`, () => {
    const c = buildContract(msg);
    expectTrue(isCommercialFallbackBlocked(c));
    const fb = selectGovernedFallback(c, { failureReason: "non_commercial" });
    expectNotIncludes(fb.text, "celular, notebook");
  });
}

console.log(`\n${"─".repeat(50)}`);
console.log(`Passed: ${passed} | Failed: ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
console.log("\n✅ PATCH 4.1I.3 audit passed\n");
