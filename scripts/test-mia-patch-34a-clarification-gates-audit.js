#!/usr/bin/env node
/**
 * PATCH 3.4a — Clarification Gates Audit
 *
 * Usage: node scripts/test-mia-patch-34a-clarification-gates-audit.js
 */

import {
  CLARIFICATION_GATES_VERSION,
  CLARIFICATION_ROUTING,
  CLARIFICATION_MISSING_SLOTS,
  evaluateClarificationPreconditions,
  needsClarification,
  resolveClarificationDecision,
  resolveClarificationRouting,
  buildClarificationMessage,
  applyClarificationGateToContextResolution,
  reconcileClarificationWithCommercialEntry,
} from "../lib/miaClarificationGates.js";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import { reconcileContextResolutionWithCommercialAuthority } from "../lib/miaCommercialEntryReconciliation.js";

let total = 0;
let passed = 0;
const failures = [];

function test(label, fn) {
  total++;
  try {
    const ok = fn();
    if (ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failures.push(label);
      console.log(`  ✗ ${label}`);
    }
  } catch (err) {
    failures.push(`${label}: ${err.message}`);
    console.log(`  ✗ ${label} — ${err.message}`);
  }
}

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

console.log(`\nPATCH 3.4a — Clarification Gates Audit (${CLARIFICATION_GATES_VERSION})`);

section("4.4a.1 — Sufficient context (no clarification)");
test("celular até 2000 does not need clarification", () => {
  const d = resolveClarificationDecision({
    query: "Quero um celular até R$ 2.000.",
    resolvedQuery: "Quero um celular até R$ 2.000.",
  });
  return !d.needsClarification && d.routing === CLARIFICATION_ROUTING.PROCEED;
});
test("entre S24 e iPhone 15 does not need clarification", () => {
  const d = resolveClarificationDecision({
    query: "Entre S24 e iPhone 15.",
    resolvedQuery: "Entre S24 e iPhone 15.",
  });
  return !d.needsClarification && d.preconditions.isComparison;
});
test("session budget prevents budget re-ask", () => {
  const pre = evaluateClarificationPreconditions({
    query: "quero um celular",
    sessionContext: { budgetMax: 2000, lastCategory: "phone" },
  });
  return pre.budget === 2000 && pre.category === "phone";
});
test("comparison lock bypasses clarification", () => {
  const d = resolveClarificationDecision({
    query: "qual é melhor?",
    contextResolution: { lockedComparisonFollowUp: true },
    forceComparisonLock: true,
  });
  return !d.needsClarification;
});

section("4.4a.2 — Insufficient context (clarification required)");
test("quero um celular asks for missing slot", () => {
  const d = resolveClarificationDecision({
    query: "Quero um celular.",
    resolvedQuery: "Quero um celular.",
  });
  return d.needsClarification && d.missingSlots.length >= 1;
});
test("quero algo bom asks category", () => {
  const d = resolveClarificationDecision({
    query: "quero algo bom",
    resolvedQuery: "quero algo bom",
  });
  return (
    d.needsClarification &&
    d.missingSlots.includes(CLARIFICATION_MISSING_SLOTS.CATEGORY)
  );
});
test("notebook para edição asks only budget", () => {
  const d = resolveClarificationDecision({
    query: "Quero um notebook para edição.",
    resolvedQuery: "Quero um notebook para edição.",
  });
  return (
    d.needsClarification &&
    d.missingSlots.includes(CLARIFICATION_MISSING_SLOTS.BUDGET) &&
    !d.missingSlots.includes(CLARIFICATION_MISSING_SLOTS.USE_CASE)
  );
});
test("empty query needs clarification", () => needsClarification({ query: "" }));

section("4.4a.3 — No redundant questions");
test("budget in query does not trigger clarification gate", () => {
  const d = resolveClarificationDecision({
    query: "Quero um celular até R$ 2.000.",
    resolvedQuery: "Quero um celular até R$ 2.000.",
  });
  return !d.needsClarification;
});
test("use-case message references category without repeating budget ask", () => {
  const msg = buildClarificationMessage([CLARIFICATION_MISSING_SLOTS.USE_CASE], {
    category: "phone",
    budget: 2000,
  });
  return /uso principal/i.test(msg) && !/faixa de preço/i.test(msg);
});

section("4.4a.4 — Gate application to contextResolution");
test("applyClarificationGate sets needsClarification for vague celular", () => {
  const applied = applyClarificationGateToContextResolution(
    { standaloneQuery: "Quero um celular.", mode: "new_or_direct", needsClarification: false },
    { query: "Quero um celular.", resolvedQuery: "Quero um celular." }
  );
  return applied.contextResolution.needsClarification && applied.applied;
});
test("applyClarificationGate preserves budget_guide directReply", () => {
  const applied = applyClarificationGateToContextResolution(
    {
      mode: "budget_guide",
      directReply: "Me conta qual produto.",
      needsClarification: false,
    },
    { query: "nao quero gastar dinheiro atoa" }
  );
  return !applied.contextResolution.needsClarification && applied.reasonCode === "guide_mode_preserved";
});

section("4.4a.5 — Commercial entry reconciliation (CONV-P-D04)");
test("commercial reconciliation preserves clarification gate", () => {
  const decision = resolveClarificationDecision({
    query: "Quero um celular.",
    resolvedQuery: "Quero um celular.",
  });
  const patch = reconcileClarificationWithCommercialEntry({
    clarificationDecision: decision,
    commercialPatch: { needsClarification: false, shouldSkipProductSearch: false },
  });
  return patch.needsClarification === true && patch.shouldSkipProductSearch === true;
});
test("mixed requiresClarification preserved in reconciliation", () => {
  const recognition = recognizeMiaIntent({
    userMessage: "to nervoso, quero algo bom",
    resolvedQuery: "to nervoso, quero algo bom",
    sessionContext: {},
  });
  const authority = buildIntentAuthorityFromRecognition(recognition, {
    hasActiveAnchor: false,
    sessionContext: {},
  });
  const reconciled = reconcileContextResolutionWithCommercialAuthority({
    contextResolution: {
      mode: "casual_chat",
      shouldSkipProductSearch: true,
      standaloneQuery: "to nervoso, quero algo bom",
    },
    authority,
    intentRecognition: recognition,
    query: "to nervoso, quero algo bom",
  });
  return reconciled.applied && reconciled.patch?.needsClarification === true;
});

section("4.4a.6 — Intent integration");
test("needsClarification helper matches decision", () => {
  const input = { query: "Quero um celular.", resolvedQuery: "Quero um celular." };
  return needsClarification(input) === resolveClarificationDecision(input).needsClarification;
});
test("resolveClarificationRouting returns ASK when needed", () => {
  return (
    resolveClarificationRouting({ query: "Quero um celular." }) === CLARIFICATION_ROUTING.ASK
  );
});

section("4.4a.7 — Regression guards");
test("iPhone 15 specific query proceeds", () => {
  const d = resolveClarificationDecision({ query: "iPhone 15", resolvedQuery: "iPhone 15" });
  return !d.needsClarification;
});
test("compare iPhone 13 e Galaxy A54 proceeds", () => {
  const d = resolveClarificationDecision({
    query: "compare iPhone 13 e Galaxy A54",
    resolvedQuery: "compare iPhone 13 e Galaxy A54",
  });
  return !d.needsClarification;
});

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.4a AUDIT: ${passed}/${total} passed`);
if (failures.length) {
  console.log("Failures:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log(failures.length === 0 ? "\nVeredito: APROVADO\n" : "\nVeredito: REPROVADO\n");
process.exit(failures.length > 0 ? 1 : 0);
