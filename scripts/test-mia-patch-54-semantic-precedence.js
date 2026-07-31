/**
 * PATCH 5.4 — Semantic Precedence tests
 * Run: node scripts/test-mia-patch-54-semantic-precedence.js
 */

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import {
  enrichContractWithSemanticAuthority,
  GOVERNED_SOCIAL_ROUTING_KEYS,
  isGovernedAmbiguousSocialContract,
  resolveGovernedSocialRoutingKey,
  adaptLegacyPrimaryIntent,
} from "../lib/miaSemanticAuthority.js";
import {
  SEMANTIC_PRECEDENCE_VERSION,
  applySemanticPrecedence,
  shouldAllowAmbiguousSocial,
  familyDoesNotRequireExplicitTarget,
  PRECEDENCE_REASON_CODES,
} from "../lib/miaSemanticPrecedence.js";
import { SOCIAL_INTENT_FAMILIES } from "../lib/miaSocialIntentTaxonomy.js";
import { SEMANTIC_TARGETS } from "../lib/miaSemanticTargetResolution.js";
import {
  buildGovernedSocialFallbackReply,
  validateHumanConversationResponse,
} from "../lib/miaHumanConversationExperience.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";

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

function expectEqual(a, b, msg = "") {
  if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}
function expectTrue(v, msg = "") {
  if (!v) throw new Error(msg || "expected truthy");
}
function expectFalse(v, msg = "") {
  if (v) throw new Error(msg || "expected falsy");
}

function buildEnrichedTurn(message, extra = {}) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: extra.sessionContext || {},
    conversationMessages: extra.conversationMessages || [],
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: !!extra.hasActiveAnchor,
  });
  let contract = buildSocialConversationBehaviorContract(recognition, {
    authority,
    message,
    conversationMessages: extra.conversationMessages || [],
  });
  contract = enrichContractWithSemanticAuthority(contract, {
    recognition,
    conversationMessages: extra.conversationMessages || [],
    sessionContext: extra.sessionContext || {},
  });
  return { recognition, authority, contract };
}

console.log("\nPATCH 5.4 — Semantic Precedence\n");

test("0. precedence version 5.4.0", () => {
  expectEqual(SEMANTIC_PRECEDENCE_VERSION, "5.4.0");
});

test("1. greeting > ambiguous social", () => {
  const { contract } = buildEnrichedTurn("Oi");
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
  expectFalse(contract.ambiguousSocialContract);
});

test("2. farewell > ambiguous social", () => {
  const { contract } = buildEnrichedTurn("Tchau");
  expectFalse(isGovernedAmbiguousSocialContract(contract, contract.semanticTargetResolution));
  expectTrue(
    contract.governedSocialRoutingKey === GOVERNED_SOCIAL_ROUTING_KEYS.FAREWELL ||
      contract.primarySocialIntent === SOCIAL_INTENT_FAMILIES.FAREWELL
  );
});

test("3. gratitude > ambiguous social", () => {
  const { contract } = buildEnrichedTurn("Obrigado");
  expectFalse(contract.ambiguousSocialContract);
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.MIA_GRATITUDE);
});

test("4. acknowledgement > ambiguous social", () => {
  const { contract } = buildEnrichedTurn("Entendi");
  expectFalse(contract.ambiguousSocialContract);
});

test("5. correction > generic reaction", () => {
  const { contract } = buildEnrichedTurn("Era ironia");
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.IRONY_REPAIR);
  expectFalse(contract.ambiguousSocialContract);
});

test("6. irony > commercial inference", () => {
  const { contract } = buildEnrichedTurn("Era ironia");
  expectFalse(contract.commercialIntent);
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.IRONY_REPAIR);
});

test("7. conversation request > commercial default", () => {
  const { contract } = buildEnrichedTurn("Quero conversar");
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.CONVERSATION_SOCIAL);
  expectFalse(contract.ambiguousSocialContract);
});

test("8. target unknown does not invalidate greeting", () => {
  const { contract } = buildEnrichedTurn("Opa");
  expectEqual(contract.resolvedSemanticTarget, SEMANTIC_TARGETS.UNKNOWN);
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
  expectFalse(contract.ambiguousSocialContract);
});

test("9. target unknown allows ambiguous when no specific family", () => {
  const { contract } = buildEnrichedTurn("Linda");
  expectTrue(contract.ambiguousSocialContract);
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.AMBIGUOUS_SOCIAL);
});

test("10. approval (Show) > ambiguous social", () => {
  const { contract } = buildEnrichedTurn("Show");
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.RESPONSE_APPROVAL);
  expectFalse(contract.ambiguousSocialContract);
});

test("11. greeting critical: Boa noite", () => {
  const { contract } = buildEnrichedTurn("Boa noite");
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
  const fb = buildGovernedSocialFallbackReply(contract);
  expectTrue(validateHumanConversationResponse(fb, contract).valid);
});

test("12. greeting critical: eae", () => {
  const { contract } = buildEnrichedTurn("eae");
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
  const fb = buildGovernedSocialFallbackReply(contract);
  expectTrue(validateHumanConversationResponse(fb, contract).valid);
});

test("13. greeting critical: opa", () => {
  const { contract } = buildEnrichedTurn("opa");
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
  const fb = buildGovernedSocialFallbackReply(contract);
  expectTrue(validateHumanConversationResponse(fb, contract).valid);
});

test("14. precedence decision has reason codes", () => {
  const { contract } = buildEnrichedTurn("Oi");
  expectTrue(Array.isArray(contract.semanticPrecedence?.reasonCodes));
  expectTrue(contract.semanticPrecedence.reasonCodes.length > 0);
  expectTrue(
    contract.semanticPrecedence.reasonCodes.includes(
      PRECEDENCE_REASON_CODES.GREETING_DOES_NOT_REQUIRE_EXPLICIT_TARGET
    )
  );
});

test("15. precedence blocks ambiguous candidate for greeting", () => {
  const { contract } = buildEnrichedTurn("Oi");
  const blocked = contract.semanticPrecedence?.blockedCandidates || [];
  expectTrue(
    blocked.some((b) => b.candidate === GOVERNED_SOCIAL_ROUTING_KEYS.AMBIGUOUS_SOCIAL)
  );
});

test("16. legacy adapter does not reduce greeting to ambiguous", () => {
  const { contract } = buildEnrichedTurn("Oi");
  const adapted = adaptLegacyPrimaryIntent(contract, contract.semanticTargetResolution);
  expectEqual(adapted.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
  expectEqual(adapted.legacyPrimaryIntent, "greeting");
});

test("17. familyDoesNotRequireExplicitTarget for greeting", () => {
  expectTrue(familyDoesNotRequireExplicitTarget(SOCIAL_INTENT_FAMILIES.GREETING));
  expectFalse(familyDoesNotRequireExplicitTarget(SOCIAL_INTENT_FAMILIES.COMPLIMENT));
});

test("18. explicit commercial preserved", () => {
  const { contract } = buildEnrichedTurn("Quero um celular até 2000");
  expectTrue(contract.commercialIntent || contract.interactionMode === "commerce");
});

test("19. deterministic: same input same routing", () => {
  const a = buildEnrichedTurn("Oi").contract.governedSocialRoutingKey;
  const b = buildEnrichedTurn("Oi").contract.governedSocialRoutingKey;
  expectEqual(a, b);
});

test("20. deterministic: same precedence reason codes", () => {
  const a = buildEnrichedTurn("Oi").contract.semanticPrecedence.reasonCodes.join("|");
  const b = buildEnrichedTurn("Oi").contract.semanticPrecedence.reasonCodes.join("|");
  expectEqual(a, b);
});

test("21. shouldAllowAmbiguousSocial false for gratitude", () => {
  const { contract } = buildEnrichedTurn("Valeu");
  expectFalse(shouldAllowAmbiguousSocial(contract, contract.semanticTargetResolution));
});

test("22. resolveGovernedSocialRoutingKey matches applySemanticPrecedence", () => {
  const { contract } = buildEnrichedTurn("Bom dia");
  const decision = applySemanticPrecedence(contract, contract.semanticTargetResolution);
  expectEqual(resolveGovernedSocialRoutingKey(contract, contract.semanticTargetResolution), decision.winningRoutingKey);
});

test("23. Show fallback not empty", () => {
  const { contract } = buildEnrichedTurn("Show");
  const fb = buildGovernedSocialFallbackReply(contract);
  expectTrue(fb.length > 0);
  expectTrue(validateHumanConversationResponse(fb, contract).valid);
});

test("24. ambiguous social preserved for real ambiguity", () => {
  const { contract } = buildEnrichedTurn("Linda");
  expectTrue(isGovernedAmbiguousSocialContract(contract, contract.semanticTargetResolution));
});

test("25. greeting stability 5/5", () => {
  for (let i = 0; i < 5; i += 1) {
    const { contract } = buildEnrichedTurn("Oi");
    expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
    expectFalse(contract.ambiguousSocialContract);
  }
});

test("26. opa stability 5/5", () => {
  for (let i = 0; i < 5; i += 1) {
    const { contract } = buildEnrichedTurn("Opa");
    expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
  }
});

test("27. eae stability 5/5", () => {
  for (let i = 0; i < 5; i += 1) {
    const { contract } = buildEnrichedTurn("eae");
    expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
  }
});

test("28. boa noite stability 5/5", () => {
  for (let i = 0; i < 5; i += 1) {
    const { contract } = buildEnrichedTurn("Boa noite");
    expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
  }
});

test("29. precedence rank assigned", () => {
  const { contract } = buildEnrichedTurn("Oi");
  expectTrue(typeof contract.semanticPrecedence.precedenceRank === "number");
});

test("30. confidence alone does not invalidate greeting", () => {
  const { contract } = buildEnrichedTurn("Oi");
  expectEqual(contract.resolvedSemanticTarget, SEMANTIC_TARGETS.UNKNOWN);
  expectEqual(contract.governedSocialRoutingKey, GOVERNED_SOCIAL_ROUTING_KEYS.GREETING);
});

console.log("\n──────────────────────────────────────────────────");
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFalhas:");
  for (const f of failures) console.error(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
console.log("PATCH 5.4 precedence tests: OK\n");
