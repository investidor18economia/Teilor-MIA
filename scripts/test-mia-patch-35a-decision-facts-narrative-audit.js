#!/usr/bin/env node
/**
 * PATCH 3.5a — Decision Facts, Narrative & Commercial Explanation Audit
 *
 * Usage: node scripts/test-mia-patch-35a-decision-facts-narrative-audit.js
 */

import {
  DECISION_FACTS_NARRATIVE_VERSION,
  collectDecisionFactsFromSession,
  collectRefinementDecisionFacts,
  buildCommercialRefinementNarrative,
  buildCommercialTransitionAck,
  selectCommercialAwareAck,
  isShallowCommercialReply,
} from "../lib/miaDecisionFactsNarrative.js";
import { selectHumanAck } from "../lib/miaConversationPolish.js";
import { buildConstraintRefinementDeterministicReply, REFINEMENT_TYPES } from "../lib/miaCommercialConstraintRefinement.js";
import { buildCommercialFollowUpDeterministicReply } from "../lib/miaCommercialFollowUpContinuity.js";

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

const SESSION = {
  lastBestProduct: { product_name: "Samsung Galaxy S23 FE", price: "2200" },
  lastRankingSnapshot: [
    { rank: 1, product_name: "Samsung Galaxy S23 FE", price: "2200" },
    { rank: 2, product_name: "Motorola Edge 40", price: "1900" },
  ],
  lastAxis: "value",
  lastPriority: "value",
  lastTradeoff: "Você abre mão de câmera top de linha em troca de melhor custo-benefício.",
  lastDecisionReason: "Melhor equilíbrio com foco em custo-benefício",
  lastWinnerAdvantages: ["custo-benefício", "bateria"],
  lastWinnerSacrifices: ["câmera premium"],
  budgetMax: 3000,
  lastCommercialConstraints: { budgetMax: 3000, preferredBrands: ["samsung"] },
};

console.log(`\nPATCH 3.5a — Decision Facts Narrative Audit (${DECISION_FACTS_NARRATIVE_VERSION})`);

section("3.5a.1 — Decision Facts transport");
test("collects winner and runner-up from session", () => {
  const facts = collectDecisionFactsFromSession(SESSION);
  return (
    facts.winner?.product_name.includes("S23 FE") &&
    facts.runnerUp?.product_name.includes("Edge 40")
  );
});
test("collects axis tradeoff and decision reason", () => {
  const facts = collectDecisionFactsFromSession(SESSION);
  return facts.tradeoff.length > 20 && facts.decisionReason.length > 5;
});
test("does not recalculate — uses session fields only", () => {
  const facts = collectDecisionFactsFromSession({ lastBestProduct: { product_name: "X" } });
  return facts.winner?.product_name === "X" && facts.runnerUp === null;
});

section("3.5a.2 — Shallow reply rejection");
test("detects Faz sentido pelo que você trouxe", () =>
  isShallowCommercialReply("Faz sentido pelo que você trouxe."));
test("detects Esse ponto pesa na decisão", () =>
  isShallowCommercialReply("Esse ponto pesa na decisão."));
test("commercial ack avoids shallow when facts exist", () => {
  const ack = selectHumanAck({
    message: "pode passar um pouco dos 3 mil",
    decisionFacts: collectDecisionFactsFromSession(SESSION),
  });
  return ack.length > 10 && !isShallowCommercialReply(ack);
});

section("3.5a.3 — Commercial Explanation (refinement)");
test("budget refinement explains change and outcome", () => {
  const refinementResult = {
    selectedProduct: { product_name: "iPhone 13", price: "2800" },
    refinement: { refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT, value: 3500 },
    priorConstraints: { budgetMax: 3000 },
    mergedConstraints: { budgetMax: 3500 },
    decisionRefreshMode: "RERANK_EXISTING_PRODUCTS",
  };
  const reply = buildConstraintRefinementDeterministicReply(refinementResult, SESSION)?.reply || "";
  return (
    /mudou|reavali|teto|orçamento/i.test(reply) &&
    reply.includes("iPhone 13") &&
    !isShallowCommercialReply(reply.split("\n")[0])
  );
});
test("brand exclusion explains consequence", () => {
  const refinementResult = {
    selectedProduct: { product_name: "Galaxy S23 FE", price: "2200" },
    refinement: { refinementType: REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT, value: "apple" },
    priorConstraints: { budgetMax: 3000, preferredBrands: ["samsung", "apple"] },
    mergedConstraints: { budgetMax: 3000, excludedBrands: ["apple"] },
    decisionRefreshMode: "RERANK_EXISTING_PRODUCTS",
  };
  const reply = buildConstraintRefinementDeterministicReply(refinementResult, SESSION)?.reply || "";
  return /apple|comparação|reavali/i.test(reply) && reply.includes("Galaxy");
});
test("use case change explains priority shift", () => {
  const facts = collectRefinementDecisionFacts(
    {
      selectedProduct: { product_name: "Galaxy S23 FE", price: "2200" },
      refinement: {
        refinementType: REFINEMENT_TYPES.USE_CASE_REFINEMENT,
        value: "faculdade",
        operation: "REPLACE",
      },
      priorConstraints: { useCase: "jogos", budgetMax: 3000 },
      mergedConstraints: { useCase: "faculdade", budgetMax: 3000 },
    },
    SESSION
  );
  const narrative = buildCommercialRefinementNarrative(facts);
  return /faculdade|uso|reavali/i.test(narrative);
});
test("winner unchanged says Mantenho", () => {
  const facts = collectRefinementDecisionFacts(
    {
      selectedProduct: { product_name: "Samsung Galaxy S23 FE", price: "2200" },
      refinement: { refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT, value: 3200 },
      priorConstraints: { budgetMax: 3000 },
      mergedConstraints: { budgetMax: 3200 },
    },
    SESSION
  );
  return /Mantenho/i.test(buildCommercialRefinementNarrative(facts));
});

section("3.5a.4 — Narrative continuity");
test("narrative has multiple connected parts", () => {
  const facts = collectRefinementDecisionFacts(
    {
      selectedProduct: { product_name: "Motorola Edge 40", price: "1900" },
      refinement: { refinementType: REFINEMENT_TYPES.PRICE_REFINEMENT, value: "cheaper_than_baseline" },
      priorConstraints: { budgetMax: 3000 },
      mergedConstraints: { budgetMax: 3000, pricePreference: "cheaper_than_baseline" },
    },
    SESSION
  );
  const narrative = buildCommercialRefinementNarrative(facts);
  return narrative.split("\n\n").length >= 3;
});
test("transition ack references change summary", () => {
  const ack = buildCommercialTransitionAck({
    message: "Na verdade é pro meu sobrinho",
    decisionFacts: {
      hasCommercialContext: true,
      changeSummary: "o uso principal passou a ser faculdade",
      refinementType: REFINEMENT_TYPES.USE_CASE_REFINEMENT,
    },
  });
  return /faculdade|reavali/i.test(ack);
});

section("3.5a.5 — Follow-up enrichment");
test("runner-up follow-up mentions tradeoff when available", () => {
  const reply = buildCommercialFollowUpDeterministicReply(
    {
      contextualCommercialAuthorized: true,
      followUpType: "runner_up_follow_up",
      resolvedProduct: { product_name: "Motorola Edge 40", price: "1900" },
    },
    SESSION
  )?.reply;
  return /Edge 40|tradeoff|custo-benefício|segundo/i.test(reply || "");
});

section("3.5a.6 — Regression guards");
test("version is 3.5a.0", () => DECISION_FACTS_NARRATIVE_VERSION === "3.5a.0");
test("social ack without commercial context still works", () => {
  const ack = selectHumanAck({ anchors: ["cansaco"], message: "estou cansado" });
  return ack.length > 5;
});

console.log(`\n${"═".repeat(60)}`);
console.log(`  PATCH 3.5a Audit: ${passed}/${total} passed`);
if (failures.length) {
  console.log(`  FAILURES:\n    - ${failures.join("\n    - ")}`);
  process.exit(1);
}
console.log(`  VERDICT: APROVADO`);
process.exit(0);
