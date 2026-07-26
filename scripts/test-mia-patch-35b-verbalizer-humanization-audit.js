#!/usr/bin/env node
/**
 * PATCH 3.5b — Verbalizer & Humanization Audit (semantic generalization)
 *
 * Usage: node scripts/test-mia-patch-35b-verbalizer-humanization-audit.js
 */

import {
  VERBALIZER_HUMANIZATION_VERSION,
  isRoboticSurfaceReply,
  pickHumanizedVariant,
  buildHumanizedRefinementTransition,
  buildHumanizedReevaluationBridge,
  buildHumanizedWinnerDecision,
} from "../lib/miaVerbalizerHumanization.js";
import {
  DECISION_FACTS_NARRATIVE_VERSION,
  buildCommercialRefinementNarrative,
  collectRefinementDecisionFacts,
  isShallowCommercialReply,
  selectCommercialAwareAck,
} from "../lib/miaDecisionFactsNarrative.js";
import { selectHumanAck } from "../lib/miaConversationPolish.js";
import {
  REFINEMENT_TYPES,
  resolveCommercialConstraintRefinement,
  buildConstraintRefinementDeterministicReply,
} from "../lib/miaCommercialConstraintRefinement.js";

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
  lastDecisionReason: "Melhor equilíbrio com foco em custo-benefício",
  lastTradeoff: "Você abre mão de câmera top de linha em troca de melhor custo-benefício.",
  budgetMax: 3000,
  lastCommercialConstraints: { budgetMax: 3000, preferredBrands: ["samsung"] },
};

function buildRefinementReply(message, sessionContext = SESSION) {
  const resolved = resolveCommercialConstraintRefinement({
    message,
    sessionContext,
    hasValidContext: true,
    baselineProduct: sessionContext.lastBestProduct,
  });
  return buildConstraintRefinementDeterministicReply(resolved, sessionContext)?.reply || "";
}

console.log(
  `\nPATCH 3.5b — Verbalizer Humanization Audit (${VERBALIZER_HUMANIZATION_VERSION})`
);
console.log(`Decision Facts Narrative (${DECISION_FACTS_NARRATIVE_VERSION})`);

section("3.5b.1 — Robotic surface rejection");
test("blocks Faz sentido", () => isRoboticSurfaceReply("Faz sentido."));
test("blocks Entendi", () => isRoboticSurfaceReply("Entendi."));
test("blocks Agora mudou um detalhe importante", () =>
  isRoboticSurfaceReply("Agora mudou um detalhe importante na busca."));
test("humanized transition is not robotic", () =>
  !isRoboticSurfaceReply(buildHumanizedRefinementTransition({ changeSummary: "teste" })));

section("3.5b.2 — Variability");
test("different seeds can yield different transitions", () => {
  const a = buildHumanizedRefinementTransition({ changeSummary: "x" }, "seed-a");
  const b = buildHumanizedRefinementTransition({ changeSummary: "x" }, "seed-b");
  const c = buildHumanizedRefinementTransition({ changeSummary: "x" }, "seed-c");
  const unique = new Set([a, b, c]);
  return unique.size >= 2;
});
test("pickHumanizedVariant returns non-empty", () =>
  !!pickHumanizedVariant(["A", "B", "C"], "test"));

function buildBudgetIntentNarrative(seed = "") {
  const facts = collectRefinementDecisionFacts(
    {
      selectedProduct: { product_name: "Samsung Galaxy S23 FE", price: "2200" },
      refinement: { refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT, value: 2500 },
      priorConstraints: { budgetMax: 2000 },
      mergedConstraints: { budgetMax: 2500 },
    },
    SESSION
  );
  return buildCommercialRefinementNarrative(facts, { seed });
}

function buildBrandIntentNarrative(seed = "") {
  const facts = collectRefinementDecisionFacts(
    {
      selectedProduct: { product_name: "Motorola Edge 40", price: "1900" },
      refinement: {
        refinementType: REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT,
        value: "motorola",
      },
      priorConstraints: { budgetMax: 3000, preferredBrands: ["samsung"] },
      mergedConstraints: { budgetMax: 3000, preferredBrands: ["samsung", "motorola"] },
    },
    SESSION
  );
  return buildCommercialRefinementNarrative(facts, { seed });
}

function buildUseCaseIntentNarrative(seed = "") {
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
  return buildCommercialRefinementNarrative(facts, { seed });
}

section("3.5b.3 — Semantic generalization: budget increase family");
const budgetPhrases = [
  "Na verdade pode ser até R$ 2.500.",
  "pode aumentar pra 2500",
  "até 2.500 na real",
  "mudei: até R$2500",
  "Na verdade ate 2.500",
];
for (const phrase of budgetPhrases) {
  test(`budget intent humanized: ${phrase.slice(0, 32)}`, () => {
    const narrative = buildBudgetIntentNarrative(phrase);
    const opening = narrative.split("\n\n")[0] || narrative;
    return (
      narrative.length >= 40 &&
      !isShallowCommercialReply(opening) &&
      /reavali|considerando|ajust|refin|teto|2500|2\.500|orçamento/i.test(narrative)
    );
  });
}
test("budget pipeline: Na verdade pode ser até R$ 2.500", () => {
  const reply = buildRefinementReply("Na verdade pode ser até R$ 2.500.", {
    ...SESSION,
    budgetMax: 2000,
    lastCommercialConstraints: { budgetMax: 2000 },
  });
  return reply.length >= 40 && !isShallowCommercialReply(reply.split("\n\n")[0]);
});

section("3.5b.4 — Semantic generalization: brand relax family");
const brandPhrases = [
  "Pode ser Motorola também.",
  "motorola tbm serve",
  "pode ser moto tambem",
  "Motorola também pode ser",
];
for (const phrase of brandPhrases) {
  test(`brand intent humanized: ${phrase}`, () => {
    const narrative = buildBrandIntentNarrative(phrase);
    const opening = narrative.split("\n\n")[0] || narrative;
    return narrative.length >= 30 && !isRoboticSurfaceReply(opening);
  });
}
test("brand pipeline: Pode ser Motorola também", () => {
  const reply = buildRefinementReply("Pode ser Motorola também.");
  return reply.length >= 30 && !isRoboticSurfaceReply(reply.split("\n")[0]);
});

section("3.5b.5 — Semantic generalization: use case family");
const usePhrases = [
  "Na verdade vou usar para faculdade.",
  "na real é pra facul",
  "vou usar na faculdade",
  "uso vai ser estudo",
];
for (const phrase of usePhrases) {
  test(`use-case intent humanized: ${phrase}`, () => {
    const narrative = buildUseCaseIntentNarrative(phrase);
    return /faculdade|facul|estudo|uso|reavali|considerando/i.test(narrative);
  });
}
test("use-case pipeline: Na verdade vou usar para faculdade", () => {
  const reply = buildRefinementReply("Na verdade vou usar para faculdade.");
  return /faculdade|reavali|considerando/i.test(reply);
});

section("3.5b.6 — Coherence: facts preserved, nothing invented");
test("winner name preserved in narrative", () => {
  const facts = collectRefinementDecisionFacts(
    {
      selectedProduct: { product_name: "Samsung Galaxy S23 FE", price: "2200" },
      refinement: { refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT, value: 3500 },
      priorConstraints: { budgetMax: 3000 },
      mergedConstraints: { budgetMax: 3500 },
    },
    SESSION
  );
  const narrative = buildCommercialRefinementNarrative(facts);
  return narrative.includes("Samsung Galaxy S23 FE");
});
test("decision reason not replaced with invented specs", () => {
  const facts = collectRefinementDecisionFacts(
    {
      selectedProduct: { product_name: "Samsung Galaxy S23 FE", price: "2200" },
      refinement: { refinementType: REFINEMENT_TYPES.USE_CASE_REFINEMENT, value: "faculdade" },
      priorConstraints: { useCase: "jogos" },
      mergedConstraints: { useCase: "faculdade" },
    },
    SESSION
  );
  const narrative = buildCommercialRefinementNarrative(facts);
  return !/\b(256\s*gb|5g|120\s*hz)\b/i.test(narrative);
});

section("3.5b.7 — Human ack with commercial context");
test("selectHumanAck avoids robotic with decision facts", () => {
  const ack = selectHumanAck({
    message: "pode passar um pouco dos 3 mil",
    decisionFacts: {
      hasCommercialContext: true,
      changeSummary: "o orçamento ficou um pouco mais flexível",
      refinementType: REFINEMENT_TYPES.RELAX_CONSTRAINT,
    },
  });
  return ack.length > 8 && !isRoboticSurfaceReply(ack);
});
test("selectCommercialAwareAck uses humanized transition", () => {
  const ack = selectCommercialAwareAck({
    message: "na verdade 2500",
    decisionFacts: {
      hasCommercialContext: true,
      changeSummary: "o teto ficou em R$ 2500,00",
      refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT,
    },
  });
  return /reavali|refin|ajust|2500|teto/i.test(ack);
});

section("3.5b.8 — Continuity phrasing");
test("reevaluation bridge mentions prior options", () => {
  const bridge = buildHumanizedReevaluationBridge({
    changeSummary: "o uso principal passou a ser faculdade",
  });
  return /considerando|contexto|conversamos|mapeado|reavali/i.test(bridge);
});
test("winner decision humanized keep vs change differ", () => {
  const keep = buildHumanizedWinnerDecision(
    { winnerChanged: false },
    "Galaxy S23 FE",
    "melhor equilíbrio",
    "keep"
  );
  const change = buildHumanizedWinnerDecision(
    { winnerChanged: true },
    "Motorola Edge 40",
    "melhor equilíbrio",
    "change"
  );
  return /segue|Continuo|ficaria/i.test(keep) && /trocaria|iria no|passa a fazer/i.test(change);
});

section("3.5b.9 — Regression guards");
test("version is 3.5b.0", () => VERBALIZER_HUMANIZATION_VERSION === "3.5b.0");
test("narrative version is 4A.2.0", () => DECISION_FACTS_NARRATIVE_VERSION === "4A.2.0");

console.log(`\n${"═".repeat(60)}`);
console.log(`  PATCH 3.5b Audit: ${passed}/${total} passed`);
if (failures.length) {
  console.log(`  FAILURES:\n    - ${failures.join("\n    - ")}`);
  process.exit(1);
}
console.log(`  VERDICT: APROVADO`);
process.exit(0);
