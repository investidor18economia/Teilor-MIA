#!/usr/bin/env node
/**
 * PATCH 3.4b — Constraint Refinement, Decision Refresh, Decision Flow, Generic Query Closing
 *
 * Usage: node scripts/test-mia-patch-34b-constraint-refinement-audit.js
 */

import {
  CONSTRAINT_REFINEMENT_VERSION,
  REFINEMENT_TYPES,
  REFINEMENT_OPERATIONS,
  DECISION_REFRESH_MODES,
  extractCommercialRefinement,
  mergePriorConstraintsWithRefinement,
  resolveCommercialConstraintRefinement,
  resolveRefinementDecisionRefresh,
} from "../lib/miaCommercialConstraintRefinement.js";
import {
  GENERIC_QUERY_CLARIFICATION_CLOSING_VERSION,
  resolveGenericQueryClarificationClosing,
  shouldApplyGenericQueryClarificationClosing,
} from "../lib/miaGenericQueryClarificationClosing.js";

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

const BASE_CTX = {
  lastBestProduct: { product_name: "Galaxy S23", price: "2200" },
  lastRankingSnapshot: [
    { product_name: "Galaxy S23", price: "2200" },
    { product_name: "Motorola Edge 40", price: "1900" },
    { product_name: "iPhone 13", price: "2800" },
  ],
  budgetMax: 2000,
  lastCategory: "phone",
  lastCommercialConstraints: {
    category: "phone",
    budgetMax: 2000,
    preferredBrands: ["samsung"],
    useCase: "jogos",
  },
};

console.log(
  `\nPATCH 3.4b — Constraint Refinement Audit (${CONSTRAINT_REFINEMENT_VERSION})`
);
console.log(`Generic Query Closing (${GENERIC_QUERY_CLARIFICATION_CLOSING_VERSION})`);

section("3.4b.1 — Budget override (Decision Refresh)");
test("na verdade até 2500 detects budget refinement", () => {
  const r = extractCommercialRefinement("Na verdade pode ser até R$ 2.500", BASE_CTX);
  return r.refinementType === REFINEMENT_TYPES.BUDGET_REFINEMENT && r.value === 2500;
});
test("budget override merges budgetMax", () => {
  const resolved = resolveCommercialConstraintRefinement({
    message: "Na verdade pode ser até R$ 2.500",
    sessionContext: BASE_CTX,
    hasValidContext: true,
    baselineProduct: BASE_CTX.lastBestProduct,
  });
  return resolved.mergedConstraints?.budgetMax === 2500;
});
test("budget increase reuses or reranks without full restart", () => {
  const resolved = resolveCommercialConstraintRefinement({
    message: "Na verdade pode ser até R$ 2.500",
    sessionContext: BASE_CTX,
    hasValidContext: true,
    baselineProduct: BASE_CTX.lastBestProduct,
  });
  return (
    resolved.decisionRefreshMode === DECISION_REFRESH_MODES.REUSE_EXISTING_PRODUCT ||
    resolved.decisionRefreshMode === DECISION_REFRESH_MODES.RERANK_EXISTING_PRODUCTS
  );
});
test("budget override does not clear prior brands/use case", () => {
  const resolved = resolveCommercialConstraintRefinement({
    message: "Na verdade pode ser até R$ 2.500",
    sessionContext: BASE_CTX,
    hasValidContext: true,
    baselineProduct: BASE_CTX.lastBestProduct,
  });
  return (
    resolved.mergedConstraints?.preferredBrands?.includes("samsung") &&
    resolved.mergedConstraints?.useCase === "jogos"
  );
});

section("3.4b.2 — Brand relax (Constraint Refinement)");
test("pode ser Motorola também adds brand", () => {
  const r = extractCommercialRefinement("Pode ser Motorola também", BASE_CTX);
  return (
    r.refinementType === REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT &&
    r.value === "motorola"
  );
});
test("brand relax infers anchor brand from lastBestProduct", () => {
  const ctx = {
    ...BASE_CTX,
    lastCommercialConstraints: { category: "phone", budgetMax: 3000 },
    lastBestProduct: { product_name: "Samsung Galaxy S23 FE", price: "2200" },
  };
  const resolved = resolveCommercialConstraintRefinement({
    message: "Pode ser Motorola também",
    sessionContext: ctx,
    hasValidContext: true,
    baselineProduct: ctx.lastBestProduct,
  });
  const brands = resolved.mergedConstraints?.preferredBrands || [];
  return brands.includes("samsung") && brands.includes("motorola");
});
test("brand relax reranks from snapshot", () => {
  const resolved = resolveCommercialConstraintRefinement({
    message: "Pode ser Motorola também",
    sessionContext: BASE_CTX,
    hasValidContext: true,
    baselineProduct: BASE_CTX.lastBestProduct,
  });
  return (
    resolved.decisionRefreshMode === DECISION_REFRESH_MODES.RERANK_EXISTING_PRODUCTS &&
    !resolved.providerRequired
  );
});

section("3.4b.3 — Use case replace (Decision Flow)");
test("na verdade faculdade detects use case replace", () => {
  const r = extractCommercialRefinement("Na verdade vou usar para faculdade", BASE_CTX);
  return (
    r.refinementType === REFINEMENT_TYPES.USE_CASE_REFINEMENT &&
    r.value === "faculdade" &&
    r.operation === REFINEMENT_OPERATIONS.REPLACE
  );
});
test("use case replace updates merged constraints", () => {
  const resolved = resolveCommercialConstraintRefinement({
    message: "Na verdade vou usar para faculdade",
    sessionContext: BASE_CTX,
    hasValidContext: true,
    baselineProduct: BASE_CTX.lastBestProduct,
  });
  return resolved.mergedConstraints?.useCase === "faculdade";
});
test("use case replace triggers decision refresh in pipeline", () => {
  const resolved = resolveCommercialConstraintRefinement({
    message: "Na verdade vou usar para faculdade",
    sessionContext: BASE_CTX,
    hasValidContext: true,
    baselineProduct: BASE_CTX.lastBestProduct,
  });
  return !!resolved.decisionRefreshMode;
});

section("3.4b.4 — Decision Refresh modes");
test("relative price reranks without provider", () => {
  const ctx = {
    ...BASE_CTX,
    lastCommercialConstraints: { category: "phone", budgetMax: 3000 },
    budgetMax: 3000,
    preferredBrands: [],
    lastBestProduct: { product_name: "iPhone 13", price: "2800" },
    lastRankingSnapshot: [
      { product_name: "iPhone 13", price: "2800" },
      { product_name: "Galaxy S23 FE", price: "2200" },
      { product_name: "Motorola Edge 40", price: "1900" },
    ],
  };
  const resolved = resolveCommercialConstraintRefinement({
    message: "tem um mais barato?",
    sessionContext: ctx,
    hasValidContext: true,
    baselineProduct: ctx.lastBestProduct,
  });
  return (
    !resolved.providerRequired &&
    resolved.decisionRefreshMode !== DECISION_REFRESH_MODES.ASK_CLARIFICATION
  );
});
test("negative brand excludes preferred samsung", () => {
  const merge = mergePriorConstraintsWithRefinement(
    { preferredBrands: ["samsung"], excludedBrands: [], budgetMax: 2000 },
    {
      detected: true,
      refinementType: REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT,
      value: "samsung",
    }
  );
  return (
    !merge.mergedConstraints.preferredBrands.includes("samsung") &&
    merge.mergedConstraints.excludedBrands.includes("samsung")
  );
});

section("3.4b.5 — Generic Query Closing (partial proceed)");
test("quero um notebook applies generic closing", () => {
  return shouldApplyGenericQueryClarificationClosing({
    query: "Quero um notebook.",
    responsePath: "return_seguro",
    category: "notebook",
  }).apply;
});
test("notebook closing asks budget not block", () => {
  const resolved = resolveGenericQueryClarificationClosing({
    query: "Quero um notebook.",
    responsePath: "return_seguro",
    category: "notebook",
    winnerProduct: { product_name: "Lenovo IdeaPad 3" },
  });
  return (
    resolved.applied &&
    resolved.audit?.missingContextAxis === "constraint" &&
    /orçamento|faixa de preço|precis/i.test(resolved.question || "")
  );
});
test("celular até 2000 still asks primary use not budget", () => {
  const resolved = resolveGenericQueryClarificationClosing({
    query: "celular até 2000",
    responsePath: "return_seguro",
    category: "phone",
    budget: 2000,
    winnerProduct: { product_name: "Samsung Galaxy A35" },
  });
  return resolved.audit?.missingContextAxis === "primary_use";
});

section("3.4b.6 — Regression guards");
test("pode ser Apple still positive brand", () => {
  const r = extractCommercialRefinement("pode ser Apple", BASE_CTX);
  return r.refinementType === REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT && r.value === "apple";
});
test("qualquer marca serve still remove constraint", () => {
  const r = extractCommercialRefinement("qualquer marca serve", BASE_CTX);
  return r.refinementType === REFINEMENT_TYPES.REMOVE_CONSTRAINT;
});
test("version is 3.6.0", () => CONSTRAINT_REFINEMENT_VERSION === "3.6.0");

console.log(`\n${"═".repeat(60)}`);
console.log(`  PATCH 3.4b Audit: ${passed}/${total} passed`);
if (failures.length) {
  console.log(`  FAILURES:\n    - ${failures.join("\n    - ")}`);
  process.exit(1);
}
console.log(`  VERDICT: APROVADO`);
process.exit(0);
