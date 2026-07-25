#!/usr/bin/env node
/**
 * PATCH 3.6.1 — Mixed Intent Multi-Refinement Audit
 */
import {
  CONSTRAINT_REFINEMENT_VERSION,
  REFINEMENT_TYPES,
  extractCommercialRefinements,
  resolveCommercialConstraintRefinement,
} from "../lib/miaCommercialConstraintRefinement.js";
import { collectRefinementDecisionFacts, buildCommercialRefinementNarrative } from "../lib/miaDecisionFactsNarrative.js";

const SESSION = {
  lastBestProduct: { product_name: "Samsung Galaxy S23 FE", price: "2200" },
  lastRankingSnapshot: [{ rank: 1, product_name: "Samsung Galaxy S23 FE", price: "2200" }],
  budgetMax: 3000,
  lastCommercialConstraints: { budgetMax: 3000, preferredBrands: ["samsung"] },
};

let total = 0;
let passed = 0;
const failures = [];

function test(label, fn) {
  total++;
  try {
    if (fn()) {
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

function resolveMixed(message, session = SESSION) {
  return resolveCommercialConstraintRefinement({
    message,
    sessionContext: session,
    hasValidContext: true,
    baselineProduct: session.lastBestProduct,
  });
}

console.log(`\nPATCH 3.6.1 — Mixed Intent Audit (${CONSTRAINT_REFINEMENT_VERSION})\n`);

test("case1: budget relax + brand restriction", () => {
  const msg =
    "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.";
  const refs = extractCommercialRefinements(msg, SESSION);
  const r = resolveMixed(msg);
  return (
    refs.length >= 2 &&
    refs.some((x) => x.refinementType === REFINEMENT_TYPES.RELAX_CONSTRAINT) &&
    refs.some((x) => x.brandRestriction) &&
    r.mergedConstraints.preferredBrands.includes("motorola") &&
    r.mergedConstraints.preferredBrands.includes("samsung") &&
    r.mergedConstraints.budgetMax > 3000
  );
});

test("case1 inverted order", () => {
  const msg =
    "Quero continuar só entre Samsung e Motorola, mas pode passar um pouco dos 3 mil.";
  const r = resolveMixed(msg);
  return (
    r.mergedConstraints.preferredBrands.includes("motorola") &&
    r.mergedConstraints.budgetMax > 3000
  );
});

test("case2: budget increase + single brand", () => {
  const msg = "Pode subir até 3.300, mas só quero Samsung.";
  const r = resolveMixed(msg);
  return r.mergedConstraints.budgetMax === 3300 && r.mergedConstraints.preferredBrands.join() === "samsung";
});

test("case3: brand add + hard cap", () => {
  const msg = "Motorola também serve, porém não quero passar de 2.500.";
  const refs = extractCommercialRefinements(msg, SESSION);
  const r = resolveMixed(msg);
  return (
    refs.length >= 2 &&
    r.mergedConstraints.preferredBrands.includes("motorola") &&
    r.mergedConstraints.budgetMax === 2500
  );
});

test("case4: relax + brand removal", () => {
  const msg = "Pode ser mais caro se compensar, mas tira Xiaomi.";
  const r = resolveMixed(msg);
  return r.mergedConstraints.excludedBrands.includes("xiaomi") && r.mergedConstraints.budgetMax > 3000;
});

test("case5: priority + budget reduction", () => {
  const msg = "Quero priorizar bateria e também reduzir o orçamento.";
  const r = resolveMixed(msg);
  return (
    r.mergedConstraints.desiredAttributes.includes("battery") &&
    r.mergedConstraints.budgetMax < 3000
  );
});

test("case6: use-case + brand add", () => {
  const msg = "Agora vou usar mais para faculdade, e Motorola também pode entrar.";
  const r = resolveMixed(msg);
  return (
    /facul/.test(r.mergedConstraints.useCase || "") &&
    r.mergedConstraints.preferredBrands.includes("motorola")
  );
});

test("case7: deprioritize + hard cap", () => {
  const msg = "Câmera não importa tanto, mas não pode passar de 3 mil.";
  const refs = extractCommercialRefinements(msg, SESSION);
  return (
    refs.some((x) => x.refinementType === REFINEMENT_TYPES.ATTRIBUTE_REFINEMENT) &&
    refs.some((x) => x.refinementType === REFINEMENT_TYPES.BUDGET_REFINEMENT)
  );
});

test("case8: correction + brand restriction", () => {
  const msg = "Corrigindo, meu limite é 2.500, e quero só Samsung.";
  const r = resolveMixed(msg);
  return r.mergedConstraints.budgetMax === 2500 && r.mergedConstraints.preferredBrands.join() === "samsung";
});

test("negative: relax + question only", () => {
  const msg = "Pode passar um pouco, mas quanto custa?";
  const refs = extractCommercialRefinements(msg, SESSION);
  return refs.length === 1 && refs[0].refinementType === REFINEMENT_TYPES.RELAX_CONSTRAINT;
});

test("negative: comparison not restriction", () => {
  const refs = extractCommercialRefinements("Samsung ou Motorola, qual é melhor?", SESSION);
  return refs.length === 0;
});

test("negative: hesitation not relax", () => {
  const refs = extractCommercialRefinements("Talvez possa passar, mas ainda não decidi.", SESSION);
  return refs.length === 0;
});

test("narrative mentions both changes", () => {
  const msg =
    "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.";
  const r = resolveMixed(msg);
  const facts = collectRefinementDecisionFacts(r, SESSION);
  const narrative = buildCommercialRefinementNarrative(facts, { seed: msg });
  return (
    facts.changeSummaries.length >= 2 &&
    /flex[ií]vel|orçamento|passar/i.test(narrative) &&
    /samsung|motorola|restrit|marca/i.test(narrative)
  );
});

test("informal: pode ir ate 3300 mas so samsung", () => {
  const r = resolveMixed("pode ir ate 3300 mas so samsung");
  return r.mergedConstraints.budgetMax === 3300 && r.mergedConstraints.preferredBrands.includes("samsung");
});

console.log(`\n${"═".repeat(60)}`);
console.log(`  Mixed Intent Audit: ${passed}/${total} passed`);
if (failures.length) {
  console.log(`  FAILURES:\n    - ${failures.join("\n    - ")}`);
  process.exit(1);
}
console.log(`  VERDICT: APROVADO`);
process.exit(0);
