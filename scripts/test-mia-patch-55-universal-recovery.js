/**
 * PATCH 5.5 — Universal Conversation Recovery tests
 * Run: node scripts/test-mia-patch-55-universal-recovery.js
 */

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import { enrichContractWithSemanticAuthority } from "../lib/miaSemanticAuthority.js";
import {
  runUniversalValidatorChain,
  applyUniversalConversationRecovery,
  applyCommercialConversationRecovery,
  RECOVERY_STRATEGIES,
  RECOVERY_REASON_CODES,
  UNIVERSAL_RECOVERY_VERSION,
  VALIDATOR_IDS,
} from "../lib/miaUniversalConversationRecovery.js";
import {
  prepareSocialEgressFinalization,
  prepareCommercialEgressEnvelope,
  validateEgressInvariants,
  UNIFIED_CONVERSATION_EGRESS_VERSION,
  isEmptyConversationalReply,
} from "../lib/miaUnifiedConversationalEgress.js";

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

function buildContract(message) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: {},
    conversationMessages: [],
    hasActiveAnchor: false,
  });
  let contract = buildSocialConversationBehaviorContract(recognition, { message, conversationMessages: [] });
  return enrichContractWithSemanticAuthority(contract, { recognition, conversationMessages: [] });
}

console.log("\nPATCH 5.5 — Universal Conversation Recovery\n");

test("1. recovery version 5.5.0", () => {
  expectEqual(UNIVERSAL_RECOVERY_VERSION, "5.5.0");
});

test("2. egress version bumped to 5.5.0", () => {
  expectEqual(UNIFIED_CONVERSATION_EGRESS_VERSION, "5.5.0");
});

test("3. validator chain rejects empty reply", () => {
  const c = buildContract("Oi");
  const chain = runUniversalValidatorChain("", c, null);
  expectFalse(chain.valid);
  expectTrue(chain.rejected.some((r) => r.id === VALIDATOR_IDS.STRUCTURAL));
});

test("4. validator chain approves valid greeting fallback", () => {
  const c = buildContract("Oi");
  const chain = runUniversalValidatorChain("Opa!", c, null);
  expectTrue(chain.valid);
});

test("5. recovery fixes empty reply via governed fallback", () => {
  const c = buildContract("Show");
  const recovery = applyUniversalConversationRecovery({
    reply: "",
    behaviorContract: c,
    universalContract: null,
  });
  expectTrue(recovery.recoveryApplied);
  expectTrue(recovery.reply.length > 0);
  expectTrue(
    recovery.strategy === RECOVERY_STRATEGIES.GOVERNED_FALLBACK ||
      recovery.strategy === RECOVERY_STRATEGIES.REBUILD_FROM_INTENT_TARGET
  );
});

test("6. recovery preserves greeting contract on Oi", () => {
  const c = buildContract("Oi");
  const prep = prepareSocialEgressFinalization("", c, null, { period: "tarde" });
  expectFalse(isEmptyConversationalReply(prep.reply).empty);
  expectTrue(prep.finalizationMeta.applied);
});

test("7. prepareSocialEgress attaches universalRecovery", () => {
  const c = buildContract("Linda");
  const prep = prepareSocialEgressFinalization("", c, null, { period: "tarde" });
  expectTrue(prep.universalRecovery != null);
  expectTrue(prep.reply.length > 0);
});

test("8. commercial empty envelope recovery", () => {
  const prep = prepareCommercialEgressEnvelope({ reply: "" }, { responsePath: "return_seguro" });
  expectFalse(isEmptyConversationalReply(prep.body.reply).empty);
  expectTrue(prep.finalizationMeta.applied);
});

test("9. validateEgressInvariants passes after recovery", () => {
  const c = buildContract("Show");
  const prep = prepareSocialEgressFinalization("", c, null, { period: "tarde" });
  const inv = validateEgressInvariants(prep);
  expectTrue(inv.valid, inv.violations?.join(","));
});

test("10. reuse prior valid when current invalid", () => {
  const c = buildContract("Oi");
  const prior = "Opa!";
  const recovery = applyUniversalConversationRecovery({
    reply: "",
    behaviorContract: c,
    priorValidReply: prior,
  });
  expectTrue(recovery.recoveryApplied);
  expectEqual(recovery.strategy, RECOVERY_STRATEGIES.REUSE_PRIOR_VALID);
  expectEqual(recovery.reply, prior);
});

test("11. deterministic validator chain", () => {
  const c = buildContract("Boa noite");
  const a = runUniversalValidatorChain("Boa noite!", c, null);
  const b = runUniversalValidatorChain("Boa noite!", c, null);
  expectEqual(a.valid, b.valid);
});

test("12. recovery reason codes present when applied", () => {
  const c = buildContract("eae");
  const recovery = applyUniversalConversationRecovery({ reply: "   ", behaviorContract: c });
  expectTrue(recovery.reasonCodes.length > 0);
  expectTrue(recovery.reasonCodes.includes(RECOVERY_REASON_CODES.EMPTY_REPLY) || recovery.recoveryApplied);
});

test("13. Show never empty through egress pipeline", () => {
  const c = buildContract("Show");
  const prep = prepareSocialEgressFinalization("", c, null, { period: "tarde" });
  expectTrue(prep.reply.trim().length > 0);
});

test("14. ambiguous Linda recovered non-empty", () => {
  const c = buildContract("Linda");
  const prep = prepareSocialEgressFinalization("", c, null, { period: "tarde" });
  expectTrue(prep.reply.trim().length > 0);
  expectTrue(prep.universalContract != null);
});

test("15. no recovery when already valid", () => {
  const c = buildContract("Obrigado");
  const recovery = applyUniversalConversationRecovery({
    reply: "Imagina.",
    behaviorContract: c,
  });
  expectFalse(recovery.recoveryApplied);
  expectEqual(recovery.strategy, RECOVERY_STRATEGIES.NONE);
});

test("16. commercial recovery structural only preserves non-empty", () => {
  const r = applyCommercialConversationRecovery({
    reply: "A escolha mais equilibrada aqui é o iPhone 13.",
  });
  expectFalse(r.recoveryApplied);
  expectEqual(r.reply, "A escolha mais equilibrada aqui é o iPhone 13.");
});

console.log("\n──────────────────────────────────────────────────");
console.log(`Resultado: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`  - ${f.label}: ${f.error}`);
  process.exit(1);
}
console.log("PATCH 5.5 universal recovery tests: OK\n");
