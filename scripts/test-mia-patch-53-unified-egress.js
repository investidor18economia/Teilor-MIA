/**
 * PATCH 5.3 — Unified Conversational Egress tests
 * Run: node scripts/test-mia-patch-53-unified-egress.js
 */

import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildSocialConversationBehaviorContract } from "../lib/miaSocialConversationBehavior.js";
import {
  UNIFIED_CONVERSATION_EGRESS_VERSION,
  EGRESS_FINALIZER_KIND,
  isEmptyConversationalReply,
  prepareSocialEgressFinalization,
  prepareCommercialEgressEnvelope,
  buildHonestFinalizationMetadata,
  validateEgressInvariants,
  unifiedEgressToTrace,
  wrapSocialFinalizationForEgress,
} from "../lib/miaUnifiedConversationalEgress.js";
import { finalizeHumanConversationReply } from "../lib/miaHumanConversationExperience.js";

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

function expectTrue(v, msg = "") {
  if (!v) throw new Error(msg || "expected truthy");
}
function expectFalse(v, msg = "") {
  if (v) throw new Error(msg || "expected falsy");
}
function expectEqual(a, b, msg = "") {
  if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}

function buildContract(message) {
  const recognition = recognizeMiaIntent({
    userMessage: message,
    resolvedQuery: message,
    sessionContext: {},
    conversationMessages: [],
    hasActiveAnchor: false,
  });
  return buildSocialConversationBehaviorContract(recognition, { message, conversationMessages: [] });
}

console.log("\nPATCH 5.3 — Unified Conversational Egress\n");

test("1. egress version 5.5.1", () => {
  expectEqual(UNIFIED_CONVERSATION_EGRESS_VERSION, "5.5.1");
});

test("2. isEmptyConversationalReply detects blank and whitespace", () => {
  expectTrue(isEmptyConversationalReply("").empty);
  expectTrue(isEmptyConversationalReply("   ").empty);
  expectFalse(isEmptyConversationalReply("oi").empty);
});

test("3. prepareSocialEgressFinalization blocks empty reply", () => {
  const c = buildContract("Show");
  const prep = prepareSocialEgressFinalization("", c, null, { period: "tarde" });
  expectFalse(isEmptyConversationalReply(prep.reply).empty);
  expectTrue(prep.finalizationMeta.applied);
  expectTrue(prep.finalizationMeta.validatorApplied);
  expectTrue(prep.universalContract?.version === "5.2.0");
});

test("4. honest metadata requires real finalization", () => {
  const meta = buildHonestFinalizationMetadata({ validation: { valid: true }, response: "ok" }, EGRESS_FINALIZER_KIND.SOCIAL);
  expectTrue(meta.applied);
  expectTrue(meta.validatorApplied);
  expectEqual(meta.finalizerKind, "social");
});

test("5. validateEgressInvariants rejects empty egress", () => {
  const inv = validateEgressInvariants({ reply: "", finalizationMeta: { applied: true } });
  expectFalse(inv.valid);
});

test("6. commercial empty guard replaces blank reply", () => {
  const prep = prepareCommercialEgressEnvelope({ reply: "" }, { responsePath: "return_seguro" });
  expectFalse(isEmptyConversationalReply(prep.body.reply).empty);
  expectTrue(prep.emptyGuardApplied);
  expectTrue(prep.finalizationMeta.applied);
});

test("7. wrapSocialFinalizationForEgress preserves valid finalize", () => {
  const c = buildContract("Linda");
  const fin = finalizeHumanConversationReply("Recebi bem.", c);
  const wrap = wrapSocialFinalizationForEgress(fin, c, { responsePath: "governed_social_intent_flow" });
  expectFalse(isEmptyConversationalReply(wrap.reply).empty);
  expectTrue(wrap.universalContract);
});

test("8. unifiedEgressToTrace compact", () => {
  const c = buildContract("Oi");
  const prep = prepareSocialEgressFinalization("Oi!", c);
  const trace = unifiedEgressToTrace(prep);
  expectEqual(trace.version, "5.5.1");
  expectTrue(trace.universalContract);
});

test("9. ambiguous social empty candidate gets governed fallback", () => {
  const c = buildContract("Linda");
  const prep = prepareSocialEgressFinalization("", c);
  expectFalse(isEmptyConversationalReply(prep.reply).empty);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) {
  failures.forEach((f) => console.error(`  - ${f.label}: ${f.error}`));
  process.exit(1);
}
process.exit(0);
