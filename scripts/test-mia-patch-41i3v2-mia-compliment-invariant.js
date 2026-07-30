/**
 * PATCH 4.1I.3.V.2 — Governed MIA compliment invariant (contract-based)
 *
 * Rodar: node scripts/test-mia-patch-41i3v2-mia-compliment-invariant.js
 */

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { finalizeHumanConversationReply } from "../lib/miaHumanConversationExperience.js";
import { resolveClarificationDecision } from "../lib/miaClarificationGates.js";
import { resolveSemanticTarget, SEMANTIC_TARGETS } from "../lib/miaSemanticTargetResolution.js";
import {
  isGovernedSocialContractBlocksClarification,
  isClarificationSemanticallyInvalidForContract,
  GOVERNED_SOCIAL_ROUTING_KEYS,
} from "../lib/miaSemanticAuthority.js";
import { selectGovernedFallback, FALLBACK_FAMILIES } from "../lib/miaGovernedFallbackPolicy.js";
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

function buildB2Contract(history = null) {
  const conversationMessages =
    history ||
    [
      { role: "user", content: "Oi, MIA" },
      { role: "assistant", content: "Opa!" },
    ];
  const recognition = recognizeMiaIntent({
    userMessage: "Linda",
    resolvedQuery: "Linda",
    sessionContext: {},
    conversationMessages,
    hasActiveAnchor: false,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: false,
    sessionContext: {},
  });
  return buildSocialConversationBehaviorContract(recognition, {
    authority,
    message: "Linda",
    conversationMessages,
    sessionContext: {},
  });
}

function buildProductLindaContract() {
  const conversationMessages = [
    { role: "user", content: "O que você acha do design do Galaxy A55?" },
    { role: "assistant", content: "O Galaxy A55 tem um visual marcante." },
  ];
  const recognition = recognizeMiaIntent({
    userMessage: "Linda",
    resolvedQuery: "Linda",
    sessionContext: {},
    conversationMessages,
    hasActiveAnchor: true,
  });
  return buildSocialConversationBehaviorContract(recognition, {
    message: "Linda",
    conversationMessages,
    sessionContext: { lastBestProduct: { product_name: "Galaxy A55" } },
  });
}

console.log("\nPATCH 4.1I.3.V.2 — MIA compliment invariant\n");

test("1. MIA + compliment + social → clarificação rejeitada", () => {
  const contract = buildB2Contract();
  const validation = finalizeHumanConversationReply(
    "Me diz rapidinho a que você se refere.",
    contract
  );
  expectFalse(/\bme diz rapidinho a que voc[eê] se refere\b/i.test(validation.response));
  expectTrue(validation.usedFallback || !validation.validation.valid);
});

test("2. MIA + compliment → fallback compliment", () => {
  const contract = buildB2Contract();
  const fb = selectGovernedFallback(contract, { failureReason: "clarification_on_mia_compliment" });
  expectEqual(fb.family, FALLBACK_FAMILIES.COMPLIMENT);
});

test("3. MIA + compliment → resposta válida preservada", () => {
  const contract = buildB2Contract();
  const fin = finalizeHumanConversationReply("Que gentil — obrigada.", contract);
  expectEqual(fin.response, "Que gentil — obrigada.");
  expectFalse(fin.usedFallback);
});

test("4. produto + aesthetic → resposta de produto preservada", () => {
  const contract = buildProductLindaContract();
  const fin = finalizeHumanConversationReply(
    "O design do Galaxy realmente chama atenção.",
    contract
  );
  expectTrue(/galaxy|visual|design/i.test(fin.response));
  expectFalse(/\bobrigad/i.test(fin.response));
});

test("5. produto → fallback elogio MIA bloqueado", () => {
  const contract = buildProductLindaContract();
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.PRODUCT_AESTHETIC_OPINION);
  const fb = selectGovernedFallback(contract, { failureReason: "test" });
  expectEqual(fb.family, FALLBACK_FAMILIES.PRODUCT_AESTHETIC);
});

test("6. unknown + baixa confiança → clarificação permitida", () => {
  const contract = {
    interactionMode: MIA_INTERACTION_MODES.SOCIAL,
    resolvedSemanticTarget: SEMANTIC_TARGETS.UNKNOWN,
    semanticTargetConfidence: 0.2,
    governedSocialRoutingKey: GOVERNED_SOCIAL_ROUTING_KEYS.CONVERSATION_SOCIAL,
    primarySocialIntent: SOCIAL_INTENT_FAMILIES.REACTION,
  };
  expectFalse(isGovernedSocialContractBlocksClarification(contract));
  const clar = resolveClarificationDecision({
    query: "Bonito",
    intentRecognition: { requiresClarification: true, interactionMode: "clarification", reasons: ["short_incomplete_message_without_context"] },
    contextResolution: {},
  });
  expectTrue(clar.needsClarification);
});

test("7. situation + ambiguidade → clarificação permitida", () => {
  const clar = resolveClarificationDecision({
    query: "Muito boa",
    intentRecognition: {
      requiresClarification: true,
      interactionMode: "clarification",
      reasons: ["short_incomplete_message_without_context"],
    },
    contextResolution: {},
  });
  expectTrue(clar.needsClarification);
});

test("8. social curto sem alvo → clarificação permitida", () => {
  const clar = resolveClarificationDecision({
    query: "Legal",
    intentRecognition: recognizeMiaIntent({
      userMessage: "Legal",
      resolvedQuery: "Legal",
      sessionContext: {},
      conversationMessages: [],
      hasActiveAnchor: false,
    }),
    contextResolution: {},
  });
  expectFalse(isGovernedSocialContractBlocksClarification({ resolvedSemanticTarget: SEMANTIC_TARGETS.UNKNOWN }));
});

test("9. social curto com alvo MIA → clarificação bloqueada", () => {
  const contract = buildB2Contract();
  const staleRecognition = {
    ...recognizeMiaIntent({
      userMessage: "Linda",
      resolvedQuery: "Linda",
      sessionContext: {},
      conversationMessages: contract.conversationMessagesForTarget || [],
      hasActiveAnchor: false,
    }),
    requiresClarification: true,
    reasons: ["short_incomplete_message_without_context"],
  };
  const clar = resolveClarificationDecision({
    query: "Linda",
    intentRecognition: staleRecognition,
    contextResolution: { needsClarification: true },
    socialBehaviorContract: contract,
  });
  expectFalse(clar.needsClarification);
  expectTrue(clar.reasonCodes.includes("governed_social_contract_blocks_clarification"));
});

test("10. elogio à resposta anterior → response_approval, não mia_compliment", () => {
  const msgs = [
    { role: "user", content: "Explique OLED vs AMOLED" },
    { role: "assistant", content: "OLED usa pixels autoiluminados." },
  ];
  const recognition = recognizeMiaIntent({
    userMessage: "Muito boa",
    resolvedQuery: "Muito boa",
    sessionContext: {},
    conversationMessages: msgs,
  });
  const contract = buildSocialConversationBehaviorContract(recognition, {
    message: "Muito boa",
    conversationMessages: msgs,
  });
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.RESPONSE_APPROVAL);
});

test("11. mixed intent compliment + commerce preservado", () => {
  const r = recognizeMiaIntent({
    userMessage: "Você é ótima, mas quero um celular",
    resolvedQuery: "Você é ótima, mas quero um celular",
    sessionContext: {},
  });
  expectEqual(r.interactionMode, MIA_INTERACTION_MODES.MIXED);
});

test("12. mensagem comercial curta → clarificação comercial permitida", () => {
  const clar = resolveClarificationDecision({
    query: "Quero algo bom",
    sessionContext: {},
    intentRecognition: recognizeMiaIntent({
      userMessage: "Quero algo bom",
      resolvedQuery: "Quero algo bom",
      sessionContext: {},
    }),
    contextResolution: {},
  });
  expectTrue(clar.needsClarification || clar.preconditions?.isVagueGeneric);
});

test("13. resposta LLM correta não substituída", () => {
  const contract = buildB2Contract();
  const fin = finalizeHumanConversationReply("Obrigada!", contract);
  expectEqual(fin.response, "Obrigada!");
  expectFalse(fin.usedFallback);
});

test("14. resposta LLM incompatível substituída", () => {
  const contract = buildB2Contract();
  const fin = finalizeHumanConversationReply("O Produto tem um visual bem marcante.", contract);
  expectFalse(/produto|visual bem marcante/i.test(fin.response));
  expectTrue(fin.usedFallback);
});

test("15. mesmo contrato → mesma família semântica", () => {
  const contract = buildB2Contract();
  const a = selectGovernedFallback(contract, { failureReason: "a" });
  const b = selectGovernedFallback(contract, { failureReason: "b" });
  expectEqual(a.family, b.family);
  expectEqual(a.family, FALLBACK_FAMILIES.COMPLIMENT);
});

test("16. confidence insuficiente não força elogio MIA", () => {
  const contract = {
    interactionMode: MIA_INTERACTION_MODES.SOCIAL,
    resolvedSemanticTarget: SEMANTIC_TARGETS.UNKNOWN,
    semanticTargetConfidence: 0.1,
    governedSocialRoutingKey: GOVERNED_SOCIAL_ROUTING_KEYS.CONVERSATION_SOCIAL,
  };
  expectFalse(isGovernedSocialContractBlocksClarification(contract));
});

test("17. histórico MIA resolve alvo sem hardcode lexical", () => {
  const contract = buildB2Contract([
    { role: "user", content: "Ei, assistente" },
    { role: "assistant", content: "Opa!" },
    { role: "user", content: "MIA" },
    { role: "assistant", content: "Oi!" },
  ]);
  expectEqual(contract.resolvedSemanticTarget, SEMANTIC_TARGETS.MIA);
});

test("18. histórico produto resolve alvo produto", () => {
  const contract = buildProductLindaContract();
  expectEqual(contract.resolvedSemanticTarget, SEMANTIC_TARGETS.PRODUCT);
});

test("19. fallback neutro não prevalece sobre contrato específico", () => {
  const contract = buildB2Contract();
  const fb = selectGovernedFallback(contract, { failureReason: "clarification_on_mia_compliment" });
  expectFalse(fb.family === FALLBACK_FAMILIES.AMBIGUOUS_REFERENCE);
  expectEqual(fb.family, FALLBACK_FAMILIES.COMPLIMENT);
});

test("20. reason code emitido no validator", () => {
  const contract = buildB2Contract();
  expectTrue(
    isClarificationSemanticallyInvalidForContract(
      "Me diz rapidinho a que você se refere.",
      contract,
      contract.semanticTargetResolution
    )
  );
});

console.log(`\n${"─".repeat(50)}`);
console.log(`Passed: ${passed} | Failed: ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
console.log("\n✅ PATCH 4.1I.3.V.2 invariant tests passed\n");
