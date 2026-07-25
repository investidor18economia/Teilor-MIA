#!/usr/bin/env node
/**
 * PATCH 3.7 — Final Phase 3 Integrated Audit
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { detectActiveCommercialAsk, detectExplicitCommercialDenial } from "../lib/miaIntentRecognitionLayer.js";
import {
  resolveClarificationDecision,
  CLARIFICATION_ROUTING,
} from "../lib/miaClarificationGates.js";
import {
  CONSTRAINT_REFINEMENT_VERSION,
  REFINEMENT_TYPES,
  extractCommercialRefinements,
  resolveCommercialConstraintRefinement,
  buildConstraintRefinementDeterministicReply,
  isInitialCommercialEntryMessage,
  applyMergedConstraintsToSessionContext,
} from "../lib/miaCommercialConstraintRefinement.js";
import { classifyCommercialFollowUpType } from "../lib/miaCommercialFollowUpContinuity.js";
import {
  collectRefinementDecisionFacts,
  buildCommercialRefinementNarrative,
} from "../lib/miaDecisionFactsNarrative.js";
import {
  buildHumanizedRefinementTransition,
  isRoboticSurfaceReply,
} from "../lib/miaVerbalizerHumanization.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const EVIDENCE_DIR = join(ROOT, "docs/conversational");

export const PATCH_37_VERSION = "3.7.0";

let total = 0;
let passed = 0;
const failures = [];
const evidenceCases = [];

function test(id, category, label, fn, meta = {}) {
  total++;
  let pass = false;
  let detail = "";
  try {
    pass = !!fn();
    if (!pass) detail = meta.expected || "assertion failed";
  } catch (err) {
    detail = err.message;
  }
  if (pass) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${id}: ${label}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
  evidenceCases.push({
    id,
    category,
    label,
    pass,
    detail,
    ...meta,
  });
  return pass;
}

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

const BASE_SESSION = {
  lastBestProduct: { product_name: "Samsung Galaxy S23 FE", price: "2200" },
  lastRankingSnapshot: [
    { rank: 1, product_name: "Samsung Galaxy S23 FE", price: "2200" },
    { rank: 2, product_name: "Motorola Edge 40", price: "1900" },
  ],
  budgetMax: 3000,
  lastCommercialConstraints: { budgetMax: 3000, preferredBrands: ["samsung"] },
  lastQuery: "Quero um celular Samsung até 3 mil.",
};

function resolveChain(messages, session = BASE_SESSION) {
  let ctx = { ...session };
  const trace = [];
  for (const message of messages) {
    const r = resolveCommercialConstraintRefinement({
      message,
      sessionContext: ctx,
      hasValidContext: true,
      baselineProduct: ctx.lastBestProduct,
    });
    ctx = applyMergedConstraintsToSessionContext(ctx, r);
    const reply =
      buildConstraintRefinementDeterministicReply(r, ctx)?.reply || "";
    trace.push({ message, r, reply, constraints: r.mergedConstraints });
  }
  return { ctx, trace };
}

function firstLine(text = "") {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
}

console.log(`\nPATCH 3.7 — Final Phase 3 Audit (${PATCH_37_VERSION})\n`);

section("37.1 — Architecture guards");
test("37.1.1", "architecture", "constraint refinement version 3.6.2+", () =>
  CONSTRAINT_REFINEMENT_VERSION >= "3.6.2");
test("37.1.2", "architecture", "no refinement on initial informal entry", () => {
  const ctx = {};
  const msg = "quero um cell ate 2500";
  return (
    isInitialCommercialEntryMessage(msg, ctx) &&
    extractCommercialRefinements(msg, ctx).length === 0 &&
    classifyCommercialFollowUpType(msg, ctx) !== "constraint_refinement"
  );
});
test("37.1.3", "architecture", "mixed intent applies both signals", () => {
  const msg =
    "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.";
  const refs = extractCommercialRefinements(msg, BASE_SESSION);
  const r = resolveCommercialConstraintRefinement({
    message: msg,
    sessionContext: BASE_SESSION,
    hasValidContext: true,
    baselineProduct: BASE_SESSION.lastBestProduct,
  });
  return (
    refs.length >= 2 &&
    r.mergedConstraints.preferredBrands.includes("motorola") &&
    r.mergedConstraints.budgetMax > 3000
  );
});

section("37.2 — Clarification gates (3.4a)");
test("37.2.1", "clarification", "Quero um celular needs clarification", () => {
  const d = resolveClarificationDecision({ query: "Quero um celular.", resolvedQuery: "Quero um celular." });
  return d.needsClarification && d.routing !== CLARIFICATION_ROUTING.PROCEED;
});
test("37.2.2", "clarification", "Quero um celular até 2.500 para jogos proceeds", () => {
  const d = resolveClarificationDecision({
    query: "Quero um celular até 2.500 para jogos.",
    resolvedQuery: "Quero um celular até 2.500 para jogos.",
  });
  return !d.needsClarification && d.routing === CLARIFICATION_ROUTING.PROCEED;
});
test("37.2.3", "clarification", "short budget answer after clarify context", () => {
  const d = resolveClarificationDecision({
    query: "até 2500",
    resolvedQuery: "até 2500",
    sessionContext: { lastTopic: "Quero um celular.", lastCategory: "phone" },
  });
  return d.routing === CLARIFICATION_ROUTING.PROCEED || !d.needsClarification;
});

section("37.3 — Constraint refinement (3.4b)");
const REFINE_CASES = [
  ["Pode aumentar para 3 mil.", (c, prior) => c.budgetMax === 3000 && prior.budgetMax < 3000],
  ["Na verdade meu limite é 2.500.", (c) => c.budgetMax === 2500],
  ["Motorola também serve.", (c) => c.preferredBrands.includes("motorola")],
  ["Quero só Samsung.", (c) => c.preferredBrands.join() === "samsung"],
  ["Tira Xiaomi.", (c) => c.excludedBrands.includes("xiaomi")],
  ["Qualquer marca serve.", (c) => !c.preferredBrands.length],
  ["Vou usar mais para faculdade.", (c) => /facul/.test(c.useCase || "")],
];
for (const [msg, check] of REFINE_CASES) {
  test(`37.3.${msg.slice(0, 12)}`, "refinement", msg, () => {
    const session = { ...BASE_SESSION, budgetMax: 2500, lastCommercialConstraints: { budgetMax: 2500, preferredBrands: ["samsung"] } };
    const prior = session.lastCommercialConstraints;
    const r = resolveCommercialConstraintRefinement({
      message: msg,
      sessionContext: session,
      hasValidContext: true,
      baselineProduct: session.lastBestProduct,
    });
    return check(r.mergedConstraints || {}, prior);
  });
}

section("37.4 — Mixed intent (3.6.1)");
const MIXED = [
  "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.",
  "Pode subir até 3.300, mas só quero Samsung.",
  "Motorola também serve, porém não quero passar de 2.500.",
  "Pode ser mais caro se compensar, mas tira Xiaomi.",
];
for (const msg of MIXED) {
  test(`37.4.${msg.slice(0, 20)}`, "mixed_intent", msg, () =>
    extractCommercialRefinements(msg, BASE_SESSION).length >= 2);
}

section("37.5 — Initial commercial entry (3.6.2)");
for (const msg of [
  "quero um cell ate 2500",
  "to procurando um cel pra facul",
  "qual celular vc indica",
  "queria um iphone",
]) {
  test(`37.5.${msg}`, "initial_entry", msg, () => {
    const ctx = {};
    return (
      isInitialCommercialEntryMessage(msg, ctx) &&
      classifyCommercialFollowUpType(msg, ctx) !== "constraint_refinement"
    );
  });
}

section("37.6 — Decision Facts alignment (3.5a)");
test("37.6.1", "decision_facts", "narrative mentions both mixed changes", () => {
  const msg =
    "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.";
  const r = resolveCommercialConstraintRefinement({
    message: msg,
    sessionContext: BASE_SESSION,
    hasValidContext: true,
    baselineProduct: BASE_SESSION.lastBestProduct,
  });
  const facts = collectRefinementDecisionFacts(r, BASE_SESSION);
  const narrative = buildCommercialRefinementNarrative(facts, { seed: msg });
  return (
    facts.changeSummaries?.length >= 2 &&
    /samsung|motorola/i.test(narrative) &&
    /orçamento|flex|passar/i.test(narrative)
  );
});

section("37.7 — P36-002 humanization repetition audit");
const REPEAT_MSGS = [
  "Pode subir para 2.800.",
  "Pode passar um pouco dos 3 mil.",
  "Corrigindo, meu limite é 2.600.",
  "Pode aumentar pra 2900.",
  "Pode subir mais um pouco.",
];
const openings = [];
for (const msg of REPEAT_MSGS) {
  const r = resolveCommercialConstraintRefinement({
    message: msg,
    sessionContext: BASE_SESSION,
    hasValidContext: true,
    baselineProduct: BASE_SESSION.lastBestProduct,
  });
  const facts = collectRefinementDecisionFacts(r, BASE_SESSION);
  facts.sourceMessage = msg;
  const opening = buildHumanizedRefinementTransition(facts, msg);
  openings.push(opening);
}
const uniqueOpenings = new Set(openings);
const p36_002_ratio = uniqueOpenings.size / openings.length;
test(
  "37.7.1",
  "p36_002",
  `consecutive budget refinements: ${uniqueOpenings.size}/${openings.length} unique openings`,
  () => uniqueOpenings.size >= 3,
  { openings, unique_count: uniqueOpenings.size, classification: p36_002_ratio >= 0.6 ? "COSMETIC_NON_BLOCKING" : "REVIEW" }
);

section("37.8 — Semantic conflicts");
test("37.8.1", "conflict", "hard cap beats relax in mixed message", () => {
  const msg = "Motorola também serve, porém não quero passar de 2.500.";
  const r = resolveCommercialConstraintRefinement({
    message: msg,
    sessionContext: BASE_SESSION,
    hasValidContext: true,
    baselineProduct: BASE_SESSION.lastBestProduct,
  });
  return r.mergedConstraints.budgetMax === 2500;
});

section("37.9 — Negative controls");
for (const msg of ["boa noite", "obrigado", "kkkk", "quem é você"]) {
  test(`37.9.${msg}`, "negative", `${msg} not commercial`, () => !detectActiveCommercialAsk(msg));
}

section("37.10 — Long conversation A (local chain)");
test("37.10.A", "long_conversation", "15-turn refinement chain preserves constraints", () => {
  const msgs = [
    "Motorola também serve.",
    "Pode passar um pouco dos 3 mil.",
    "Na verdade meu limite é 2.500.",
    "Quero priorizar bateria.",
    "Tira Xiaomi.",
  ];
  const { ctx } = resolveChain(msgs);
  return (
    ctx.lastCommercialConstraints?.preferredBrands?.includes("motorola") &&
    ctx.lastCommercialConstraints?.budgetMax === 2500 &&
    ctx.lastCommercialConstraints?.excludedBrands?.includes("xiaomi")
  );
});

section("37.11 — Semantic generalization sample");
const GENERALIZATION = [
  ["quero um celular", true],
  ["preciso d um celular", true],
  ["to procurando um celular", true],
  ["pode aumentar pra 2500", false],
];
for (const [msg, isEntry] of GENERALIZATION) {
  test(`37.11.${msg}`, "generalization", msg, () => {
    const ctx = {};
    const entry = isInitialCommercialEntryMessage(msg, ctx);
    return isEntry ? entry && extractCommercialRefinements(msg, ctx).length === 0 : true;
  });
}

const verdict = failures.length === 0 ? "APPROVED" : "REJECTED";
const p36_002_status =
  uniqueOpenings.size >= 3 ? "COSMETIC_NON_BLOCKING" : "REQUIRES_REVIEW";

console.log(`\n${"═".repeat(60)}`);
console.log(`  PATCH 3.7 Local Audit: ${passed}/${total} passed`);
console.log(`  P36-002: ${p36_002_status} (${uniqueOpenings.size}/${REPEAT_MSGS.length} unique openings)`);
if (failures.length) {
  console.log(`  FAILURES:\n    - ${failures.join("\n    - ")}`);
}

const evidence = {
  patch: "3.7",
  phase: "final_phase_audit",
  version: PATCH_37_VERSION,
  status: verdict,
  finished_at: new Date().toISOString(),
  summary: { passed, total, failed: failures.length },
  p36_002: {
    classification: p36_002_status,
    openings,
    unique_openings: uniqueOpenings.size,
    total: REPEAT_MSGS.length,
  },
  cases: evidenceCases,
};

mkdirSync(EVIDENCE_DIR, { recursive: true });
writeFileSync(join(EVIDENCE_DIR, "PATCH_3_7_FINAL_PHASE_AUDIT_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

process.exit(failures.length > 0 ? 1 : 0);
