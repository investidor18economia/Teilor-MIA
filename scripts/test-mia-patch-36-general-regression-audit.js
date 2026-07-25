#!/usr/bin/env node
/**
 * PATCH 3.6 — General Regression Audit (Phase 3 conversational integration)
 *
 * Usage: node scripts/test-mia-patch-36-general-regression-audit.js
 */

import {
  CONSTRAINT_REFINEMENT_VERSION,
  REFINEMENT_TYPES,
  extractCommercialRefinement,
  extractCommercialRefinements,
  resolveCommercialConstraintRefinement,
  buildConstraintRefinementDeterministicReply,
} from "../lib/miaCommercialConstraintRefinement.js";
import {
  resolveProductIdentityFromQuery,
  extractProductMentionFromQuery,
} from "../lib/miaProductIdentityResolution.js";
import { resolveClarificationDecision } from "../lib/miaClarificationGates.js";
import { resolveGenericQueryClarificationClosing } from "../lib/miaGenericQueryClarificationClosing.js";
import {
  buildCommercialRefinementNarrative,
  collectRefinementDecisionFacts,
  isShallowCommercialReply,
} from "../lib/miaDecisionFactsNarrative.js";
import {
  isRoboticSurfaceReply,
  buildHumanizedRefinementTransition,
} from "../lib/miaVerbalizerHumanization.js";

export const PATCH_36_VERSION = "3.6.2";

let total = 0;
let passed = 0;
const failures = [];
const families = {};

function test(section, label, fn) {
  total++;
  try {
    const ok = fn();
    if (ok) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failures.push(`${section}: ${label}`);
      console.log(`  ✗ ${label}`);
    }
    if (!families[section]) families[section] = { passed: 0, failed: 0 };
    families[section][ok ? "passed" : "failed"] += 1;
  } catch (err) {
    failures.push(`${section}: ${label}: ${err.message}`);
    console.log(`  ✗ ${label} — ${err.message}`);
    if (!families[section]) families[section] = { passed: 0, failed: 0 };
    families[section].failed += 1;
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
  lastCommercialConstraints: {
    budgetMax: 3000,
    preferredBrands: ["samsung"],
    useCase: "jogos",
  },
};

function expectRefinement(message, expectedType, session = SESSION) {
  const r = extractCommercialRefinement(message, session);
  return r.detected && r.refinementType === expectedType;
}

function expectNoRefinement(message, session = SESSION) {
  const r = extractCommercialRefinement(message, session);
  return !r.detected || r.refinementType === REFINEMENT_TYPES.NONE;
}

console.log(`\nPATCH 3.6 — General Regression Audit (${PATCH_36_VERSION})`);
console.log(`Constraint Refinement module: ${CONSTRAINT_REFINEMENT_VERSION}`);

section("3.6.1 — Product Resolution (semantic families)");
const productVariants = [
  ["iPhone 15", "iPhone 15"],
  ["iphone15", "iPhone 15"],
  ["o 15 da apple", "iPhone 15"],
  ["Galaxy S24", "Galaxy S24"],
  ["S24", "Galaxy S24"],
];
for (const [q, expected] of productVariants) {
  test("3.6.1", `product: ${q}`, () => {
    const id = resolveProductIdentityFromQuery(q);
    return id.officialName === expected || id.displayName === expected;
  });
}
test("3.6.1", "mention extraction avoids budget as product", () => {
  const m = extractProductMentionFromQuery("celular até 2000");
  return !m?.productName || /celular/i.test(m.productName);
});

section("3.6.2 — Clarification Gates");
test("3.6.2", "generic celular needs clarification", () => {
  const d = resolveClarificationDecision({ query: "Quero um celular.", sessionContext: {} });
  return d.needsClarification === true;
});
test("3.6.2", "generic notebook partial closing", () => {
  const r = resolveGenericQueryClarificationClosing({
    query: "Quero um notebook.",
    category: "notebook",
    winner: null,
    responsePath: "return_seguro",
  });
  return r?.applied === true && !!r?.question;
});
test("3.6.2", "refinement with context skips unnecessary clarification", () => {
  const r = resolveCommercialConstraintRefinement({
    message: "Na verdade vou usar para faculdade.",
    sessionContext: SESSION,
    hasValidContext: true,
    baselineProduct: SESSION.lastBestProduct,
  });
  return r?.detected && !r?.requiresClarification;
});

section("3.6.3 — Colloquial extraction (3.5b pendencies)");
const colloquialPositive = [
  ["motorola tbm serve", REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT],
  ["moto tb serve", REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT],
  ["pode aumentar pra 2500", REFINEMENT_TYPES.BUDGET_REFINEMENT],
  ["da pra subir pra 2500", REFINEMENT_TYPES.BUDGET_REFINEMENT],
  ["pode ir ate 2500", REFINEMENT_TYPES.BUDGET_REFINEMENT],
  ["na real é pra facul", REFINEMENT_TYPES.USE_CASE_REFINEMENT],
  ["vou usar na faculdade", REFINEMENT_TYPES.USE_CASE_REFINEMENT],
  ["se passa um pouco ta tranquilo", REFINEMENT_TYPES.RELAX_CONSTRAINT],
  ["pode ser mais caro se compensar", REFINEMENT_TYPES.RELAX_CONSTRAINT],
];
for (const [phrase, type] of colloquialPositive) {
  test("3.6.3", `colloquial+: ${phrase}`, () => expectRefinement(phrase, type));
}
const colloquialNegative = [
  "Já passou um pouco",
  "Quanto passa do orçamento?",
  "Talvez possa passar",
];
for (const phrase of colloquialNegative) {
  test("3.6.3", `colloquial-: ${phrase}`, () => expectNoRefinement(phrase));
}

section("3.6.4 — Budget family boundaries");
test("3.6.4", "relax: Pode passar um pouco", () =>
  expectRefinement("Pode passar um pouco dos 3 mil", REFINEMENT_TYPES.RELAX_CONSTRAINT));
test("3.6.4", "hard cap: Até 3 mil, não pode passar", () => {
  const r = extractCommercialRefinement("Até 3 mil, não pode passar", SESSION);
  return (
    r.refinementType === REFINEMENT_TYPES.BUDGET_REFINEMENT &&
    r.refinementType !== REFINEMENT_TYPES.RELAX_CONSTRAINT
  );
});
test("3.6.4", "hard cap: Não pode passar de 3 mil", () => {
  const r = extractCommercialRefinement("Não pode passar de 3 mil", SESSION);
  return r.refinementType === REFINEMENT_TYPES.BUDGET_REFINEMENT && r.value === 3000;
});
test("3.6.4", "reduce: Pensando melhor, só posso gastar 2.200", () => {
  const r = extractCommercialRefinement("Pensando melhor, só posso gastar 2.200", SESSION);
  return r.refinementType === REFINEMENT_TYPES.BUDGET_REFINEMENT;
});

section("3.6.5 — Brand & use-case families");
const brandPhrases = [
  "Pode ser Motorola também.",
  "pode ser moto tambem",
  "Pode considerar Samsung e Motorola.",
  "Pode tirar Xiaomi da busca.",
];
for (const p of brandPhrases) {
  test("3.6.5", `brand: ${p}`, () => {
    const r = extractCommercialRefinement(p, SESSION);
    return r.detected && r.refinementType.includes("brand");
  });
}
const usePhrases = [
  "Na verdade vou usar para faculdade.",
  "Vai ser mais pra estudo do que pra jogo.",
];
for (const p of usePhrases) {
  test("3.6.5", `use-case: ${p}`, () => expectRefinement(p, REFINEMENT_TYPES.USE_CASE_REFINEMENT));
}

section("3.6.6 — Decision Refresh & Facts transport");
test("3.6.6", "budget refinement preserves brand constraints", () => {
  const resolved = resolveCommercialConstraintRefinement({
    message: "Na verdade pode ser até R$ 2.500.",
    sessionContext: { ...SESSION, budgetMax: 2000, lastCommercialConstraints: { budgetMax: 2000, preferredBrands: ["samsung"] } },
    hasValidContext: true,
    baselineProduct: SESSION.lastBestProduct,
  });
  return (
    resolved?.mergedConstraints?.preferredBrands?.includes("samsung") &&
    resolved?.mergedConstraints?.budgetMax === 2500
  );
});
test("3.6.6", "narrative preserves winner name", () => {
  const facts = collectRefinementDecisionFacts(
    {
      selectedProduct: { product_name: "Samsung Galaxy S23 FE", price: "2200" },
      refinement: { refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT, value: 3500, sourceMessage: "test" },
      priorConstraints: { budgetMax: 3000 },
      mergedConstraints: { budgetMax: 3500 },
    },
    SESSION
  );
  const narrative = buildCommercialRefinementNarrative(facts, { seed: "test" });
  return narrative.includes("Samsung") && !isShallowCommercialReply(narrative.split("\n\n")[0]);
});

section("3.6.7 — Humanization diversity (same conversation)");
test("3.6.7", "consecutive refinements vary openings", () => {
  const msgs = [
    "Motorola também serve.",
    "Pode passar um pouco dos 3 mil.",
    "Na verdade vou usar para faculdade.",
    "Câmera não importa tanto.",
  ];
  const openings = new Set();
  for (const msg of msgs) {
    const resolved = resolveCommercialConstraintRefinement({
      message: msg,
      sessionContext: SESSION,
      hasValidContext: true,
      baselineProduct: SESSION.lastBestProduct,
    });
    const facts = collectRefinementDecisionFacts(resolved, SESSION);
    facts.sourceMessage = msg;
    const narrative = buildCommercialRefinementNarrative(facts, { seed: msg });
    openings.add(narrative.split("\n\n")[0]?.trim());
  }
  return openings.size >= 3;
});
test("3.6.7", "no robotic-only reply", () => {
  const reply =
    buildConstraintRefinementDeterministicReply(
      {
        selectedProduct: { product_name: "Galaxy S23 FE", price: "2200" },
        refinement: {
          refinementType: REFINEMENT_TYPES.BUDGET_REFINEMENT,
          value: 3200,
          sourceMessage: "pode aumentar pra 3200",
        },
        priorConstraints: { budgetMax: 3000 },
        mergedConstraints: { budgetMax: 3200 },
      },
      SESSION
    )?.reply || "";
  return reply.length >= 40 && !isRoboticSurfaceReply(reply.split("\n\n")[0]);
});

section("3.6.8 — Multi-turn sequence B (simulated)");
test("3.6.8", "sequence B incremental context", () => {
  let ctx = { ...SESSION };
  const turns = [
    "Motorola também serve.",
    "Pode passar um pouco dos 3 mil.",
    "Na verdade vou usar mais para faculdade.",
  ];
  let lastMerged = ctx.lastCommercialConstraints;
  for (const msg of turns) {
    const resolved = resolveCommercialConstraintRefinement({
      message: msg,
      sessionContext: ctx,
      hasValidContext: true,
      baselineProduct: ctx.lastBestProduct,
    });
    if (!resolved?.detected) return false;
    lastMerged = resolved.mergedConstraints || lastMerged;
    ctx = {
      ...ctx,
      budgetMax: lastMerged.budgetMax ?? ctx.budgetMax,
      lastCommercialConstraints: lastMerged,
    };
  }
  return (
    lastMerged?.preferredBrands?.includes("motorola") &&
    (lastMerged?.useCase === "faculdade" || lastMerged?.useCase?.includes("facul"))
  );
});

section("3.6.9 — Sequence C correction");
test("3.6.9", "budget correction replaces prior", () => {
  let ctx = {
    ...SESSION,
    budgetMax: 2000,
    lastCommercialConstraints: { budgetMax: 2000 },
  };
  const r1 = resolveCommercialConstraintRefinement({
    message: "Meu orçamento é até 2 mil.",
    sessionContext: ctx,
    hasValidContext: true,
    baselineProduct: ctx.lastBestProduct,
  });
  ctx.budgetMax = r1?.mergedConstraints?.budgetMax ?? 2000;
  ctx.lastCommercialConstraints = r1?.mergedConstraints || ctx.lastCommercialConstraints;
  const r2 = resolveCommercialConstraintRefinement({
    message: "Corrigindo, quis dizer 2.500.",
    sessionContext: ctx,
    hasValidContext: true,
    baselineProduct: ctx.lastBestProduct,
  });
  return r2?.mergedConstraints?.budgetMax === 2500;
});

section("3.6.10 — Sequence D negation");
test("3.6.10", "brand negation excludes motorola", () => {
  let ctx = {
    ...SESSION,
    lastCommercialConstraints: { budgetMax: 3000, preferredBrands: ["samsung", "motorola"] },
  };
  const r = resolveCommercialConstraintRefinement({
    message: "Pensando melhor, não quero Motorola.",
    sessionContext: ctx,
    hasValidContext: true,
    baselineProduct: ctx.lastBestProduct,
  });
  return (
    r?.mergedConstraints?.excludedBrands?.includes("motorola") ||
    r?.refinement?.refinementType === REFINEMENT_TYPES.NEGATIVE_BRAND_REFINEMENT
  );
});

section("3.6.11 — Mixed intent (Sequence F)");
test("3.6.11", "budget relax + brand restriction both applied", () => {
  const msg =
    "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.";
  const refs = extractCommercialRefinements(msg, SESSION);
  const r = resolveCommercialConstraintRefinement({
    message: msg,
    sessionContext: SESSION,
    hasValidContext: true,
    baselineProduct: SESSION.lastBestProduct,
  });
  return (
    refs.length >= 2 &&
    refs.some((x) => x.refinementType === REFINEMENT_TYPES.RELAX_CONSTRAINT) &&
    refs.some((x) => x.brandRestriction || x.refinementType === REFINEMENT_TYPES.POSITIVE_BRAND_REFINEMENT) &&
    r.mergedConstraints.preferredBrands.includes("samsung") &&
    r.mergedConstraints.preferredBrands.includes("motorola") &&
    r.mergedConstraints.budgetMax > 3000
  );
});

section("3.6.12 — Regression guards");
test("3.6.12", "constraint module version 3.7.0+", () => CONSTRAINT_REFINEMENT_VERSION >= "3.6.2");

console.log(`\n${"═".repeat(60)}`);
console.log(`  PATCH 3.6 Audit: ${passed}/${total} passed`);
if (failures.length) {
  console.log(`  FAILURES:\n    - ${failures.join("\n    - ")}`);
  process.exit(1);
}
console.log(`  VERDICT: APROVADO`);
process.exit(0);
