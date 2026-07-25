#!/usr/bin/env node
/**
 * PATCH 3.1 — Commercial Entry Corrections Audit
 *
 * Run: node scripts/test-mia-patch-31-commercial-entry-audit.js
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
  detectActiveCommercialAsk,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildIntentAuthorityFromRecognition,
  applyIntentAuthorityToPipeline,
  suppressCommercialSignalsForAuthority,
  enforceRoutingDecisionAgainstAuthority,
  COMMERCIAL_PERMISSION,
} from "../lib/miaIntentAuthority.js";
import {
  evaluateCommercialEntryPermission,
  assertNonCommercialExecutionInvariants,
} from "../lib/miaCommercialEntryGate.js";
import {
  reconcileContextResolutionWithCommercialAuthority,
  shouldLegacyContextDeferToCommercialAuthority,
  shouldOpenCommercialPipelineFromAuthority,
  COMMERCIAL_ENTRY_RECONCILIATION_VERSION,
} from "../lib/miaCommercialEntryReconciliation.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { buildCognitiveRoutingSignalFromTurn } from "../lib/miaIntentRecognitionLayer.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { segmentMixedIntent, shouldApplyMixedSegmentation } from "../lib/miaMixedIntentSegmentation.js";
import { resolveContextualCommercialFollowUp, detectTopicSwitch } from "../lib/miaCommercialFollowUpContinuity.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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
    resolvedQuery: extra.resolvedQuery || message,
    sessionContext: extra.sessionContext || {},
    signals: extra.signals || {},
    hasActiveAnchor: !!extra.hasActiveAnchor,
    detectedIntent: extra.detectedIntent || "general_answer",
  });
}

function simulateCommercialEntry(message, extra = {}) {
  const query = message;
  const sessionContext = extra.sessionContext || {};
  const hasAnchor = !!extra.hasActiveAnchor;
  const contextResolution = extra.contextResolution || {
    mode: extra.legacyMode || "casual_chat",
    shouldSkipProductSearch: extra.legacySkip ?? true,
    standaloneQuery: query,
  };

  const recognition = recognize(message, extra);
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: hasAnchor,
    sessionContext,
  });

  const applied = applyIntentAuthorityToPipeline({
    authority,
    intent: extra.detectedIntent || "general_answer",
    contextAction: "conversation",
    contextResolution,
    query,
    intentRecognition: recognition,
  });

  const mergedContext = {
    ...contextResolution,
    ...(applied.contextResolutionPatch || {}),
  };

  const rawCommercial = resolveClearNewCommercialSearchForRouting({
    query,
    resolvedQuery: mergedContext.standaloneQuery || query,
    hasAnchor,
    looksLikeShortPriorityFollowUp: false,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: !!extra.signals?.isExplicitComparison,
    explicitProductOnlyQuery: !!extra.signals?.explicitProductOnlyQuery,
    wantsNew: false,
    detectProductCategory: extra.detectProductCategory || (() => ""),
    wantsNewProduct: () => false,
    ...(extra.commercialProbe || {}),
  });

  const signals = suppressCommercialSignalsForAuthority(authority, {
    hasClearNewCommercialSearch: rawCommercial,
    isExplicitComparison: !!extra.signals?.isExplicitComparison,
    ...(extra.signals || {}),
  });

  let routing = buildRoutingDecision({
    userMessage: query,
    resolvedQuery: mergedContext.standaloneQuery || query,
    contextResolution: mergedContext,
    sessionContext,
    incomingSessionContext: {},
    intent: applied.intent,
    contextAction: applied.contextAction,
    intentRecognition: recognition,
    intentAuthority: authority,
    cognitiveRoutingSignal: buildCognitiveRoutingSignalFromTurn(null, hasAnchor),
    signals,
  });

  const enforced = enforceRoutingDecisionAgainstAuthority(routing, authority, {
    hasAnchor,
  });
  routing = enforced.routingDecision;

  const gate = evaluateCommercialEntryPermission({
    authority,
    routingDecision: routing,
    intent: applied.intent,
  });

  return {
    recognition,
    authority,
    applied,
    mergedContext,
    routing,
    gate,
  };
}

console.log("\nPATCH 3.1 — Commercial Entry Corrections Audit\n");

console.log("Grupo 1 — Legacy reconciliation");
test("1.1: allow clears legacy shouldSkipProductSearch", () => {
  const r = simulateCommercialEntry("quero um celular ate 2 mil", {
    legacyMode: "casual_chat",
    legacySkip: true,
    signals: { hasClearNewCommercialSearch: true, newCategoryInOriginalMessage: true },
    commercialProbe: { detectProductCategory: () => "celular" },
  });
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.ALLOW);
  expectFalse(r.mergedContext.shouldSkipProductSearch);
  expectTrue(r.gate.commercialEntryAllowed);
});
test("1.2: social legacy preserved on deny", () => {
  const r = simulateCommercialEntry("oi", { legacyMode: "casual_chat", legacySkip: true });
  expect(r.authority.commercialPermission, COMMERCIAL_PERMISSION.DENY);
  expectTrue(r.mergedContext.shouldSkipProductSearch);
  expectFalse(r.gate.commercialEntryAllowed);
});
test("1.3: budget_guide not overridden by commercial authority", () => {
  const authority = {
    authoritative: true,
    commercialPermission: COMMERCIAL_PERMISSION.ALLOW,
  };
  expectFalse(
    shouldLegacyContextDeferToCommercialAuthority(
      { mode: "budget_guide", shouldSkipProductSearch: true },
      authority
    )
  );
});
test("1.4: reconciliation version exported", () => {
  expect(COMMERCIAL_ENTRY_RECONCILIATION_VERSION, "3.1.0");
});

console.log("\nGrupo 2 — Smoke P0 baseline scenarios");
const smokeCases = [
  {
    id: "commercial-direct",
    msg: "quero um celular ate 2 mil",
    expectPerm: COMMERCIAL_PERMISSION.ALLOW,
    extra: {
      signals: { hasClearNewCommercialSearch: true, newCategoryInOriginalMessage: true },
      commercialProbe: { detectProductCategory: () => "celular" },
    },
  },
  {
    id: "commercial-specific",
    msg: "quanto custa o Galaxy S24?",
    expectPerm: COMMERCIAL_PERMISSION.ALLOW,
    extra: {
      signals: { explicitProductOnlyQuery: true, hasClearNewCommercialSearch: true },
    },
  },
  {
    id: "commercial-mixed",
    msg: "to nervoso, preciso de um notebook",
    expectPerm: COMMERCIAL_PERMISSION.ALLOW,
    extra: {
      signals: { hasClearNewCommercialSearch: true, newCategoryInOriginalMessage: true },
      commercialProbe: { detectProductCategory: () => "notebook" },
    },
  },
  {
    id: "social",
    msg: "oi",
    expectPerm: COMMERCIAL_PERMISSION.DENY,
    extra: {},
  },
  {
    id: "post-purchase",
    msg: "comprei o celular, obrigado",
    expectPerm: COMMERCIAL_PERMISSION.DENY,
    extra: { hasActiveAnchor: true, sessionContext: { lastBestProduct: { product_name: "Galaxy S24" } } },
  },
  {
    id: "product-question",
    msg: "quanto custa o Galaxy S24?",
    expectPerm: COMMERCIAL_PERMISSION.ALLOW,
    extra: { signals: { hasClearNewCommercialSearch: true } },
  },
  {
    id: "topic-switch",
    msg: "agora quero falar de outra coisa",
    expectPerm: COMMERCIAL_PERMISSION.DENY,
    extra: {},
  },
  {
    id: "commercial-follow-up",
    msg: "e mais barato?",
    expectPerm: COMMERCIAL_PERMISSION.ALLOW,
    extra: {
      hasActiveAnchor: true,
      sessionContext: { lastBestProduct: { product_name: "Galaxy S24 Ultra" } },
    },
  },
];

for (const c of smokeCases) {
  test(`2.${c.id}: "${c.msg}" → ${c.expectPerm}`, () => {
    const r = simulateCommercialEntry(c.msg, {
      legacyMode: "casual_chat",
      legacySkip: true,
      ...c.extra,
    });
    expect(r.authority.commercialPermission, c.expectPerm, c.id);
    if (c.expectPerm === COMMERCIAL_PERMISSION.DENY) {
      expectFalse(r.gate.commercialEntryAllowed, `${c.id} gate`);
      expectFalse(shouldOpenCommercialPipelineFromAuthority(r.authority), `${c.id} pipeline`);
    } else {
      expectFalse(r.mergedContext.shouldSkipProductSearch, `${c.id} skip cleared`);
      expectTrue(r.gate.commercialEntryAllowed, `${c.id} gate`);
    }
  });
}

console.log("\nGrupo 3 — Mixed segmentation");
test("3.1: mixed segmentation applies when authority mixed/allow", () => {
  const msg = "Hoje foi pesimo, mas preciso escolher um celular";
  const recognition = recognize(msg, {
    signals: { hasClearNewCommercialSearch: true, newCategoryInOriginalMessage: true },
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {});
  expectTrue(shouldApplyMixedSegmentation({ intentRecognition: recognition, intentAuthority: authority }));
  const seg = segmentMixedIntent({
    userMessage: msg,
    intentRecognition: recognition,
    intentAuthority: authority,
    hasActiveAnchor: false,
    sessionContext: {},
    detectProductCategory: () => "celular",
    extractBudget: () => null,
  });
  expectTrue(String(seg?.commercialDimension?.commercialSearchQuery || "").length > 0);
});

console.log("\nGrupo 4 — Follow-up continuity");
test("4.1: price follow-up authorized with anchor", () => {
  const followUp = resolveContextualCommercialFollowUp({
    message: "quanto custa?",
    sessionContext: { lastBestProduct: { product_name: "Galaxy S24" } },
    hasActiveAnchor: true,
  });
  expectTrue(followUp.contextualCommercialAuthorized);
});
test("4.2: topic switch detected", () => {
  expectTrue(detectTopicSwitch("agora quero falar de outra coisa"));
  expectFalse(detectTopicSwitch("agora quero um notebook"));
});

console.log("\nGrupo 5 — Handler wiring");
test("5.1: chat-gpt4o passes intentRecognition to authority apply", () => {
  const src = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
  expectTrue(src.includes("intentRecognition: intentRecognitionEarly"));
});
test("5.2: reconciliation module exists", () => {
  const src = readFileSync(join(ROOT, "lib/miaCommercialEntryReconciliation.js"), "utf8");
  expectTrue(src.includes("reconcileContextResolutionWithCommercialAuthority"));
});

console.log("\nGrupo 6 — Non-commercial invariants");
test("6.1: deny path invariants", () => {
  const tracker = { state: { providerCallCountBefore: 0, providerCallCountAfter: 0, commercialBranchEntered: false, rankingEntered: false, winnerCreated: false, cardsCreated: 0 }, recordBlocked() {}, toTrace() { return { providerCallDelta: 0, commercialBranchEntered: false, rankingEntered: false, winnerCreated: false, cardsCreated: 0 }; } };
  const entry = { allowed: false, commercialEntryAllowed: false, reasonCode: "intent_authority_commercial_deny" };
  const result = assertNonCommercialExecutionInvariants({ entryResult: entry, tracker, routingDecision: { allowNewSearch: false }, prices: [] });
  expectTrue(result.ok);
});

console.log(`\n${"=".repeat(60)}`);
console.log(`Resultado PATCH 3.1: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFalhas:");
  for (const f of failures) {
    console.log(`  - ${f.label}: ${f.error}`);
  }
  process.exit(1);
}
console.log("PATCH 3.1 COMMERCIAL ENTRY: APROVADO");
process.exit(0);
