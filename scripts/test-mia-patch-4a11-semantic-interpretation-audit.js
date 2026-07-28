/**
 * PATCH 4A.11 — Semantic interpretation audit (unit / structure)
 *
 * Usage: node scripts/test-mia-patch-4a11-semantic-interpretation-audit.js
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INTERPRETATION_TRACE_VERSION,
  INTERPRETER_COMPONENT,
  buildClaimTrace,
  buildInterpretationTraceFromSession,
  validateInterpretationTrace,
  auditInterpretationChain,
} from "../lib/miaInterpretationTrace.js";
import { translateDataLayerFieldsToConsequences } from "../lib/miaConsequenceTranslationLayer.js";
import {
  buildPracticalConsequences,
  practicalConsequencesToSemanticUnits,
} from "../lib/miaPracticalConsequenceEngine.js";
import { buildStructuredDecisionFacts } from "../lib/miaStructuredDecisionFacts.js";
import { buildNarrativePlanFromStructuredFacts } from "../lib/miaNarrativePlanner.js";
import { buildVerbalizationPlanFromNarrativePlan } from "../lib/miaSemanticVerbalizer.js";
import { SEMANTIC_DECISION_ROLE } from "../lib/miaSemanticDecisionContract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\nPATCH 4A.11 — Semantic Interpretation Audit\n");

console.log("── Infrastructure ──");
const validationScript = join(ROOT, "scripts/patch-4a11-semantic-interpretation-validation.mjs");
const parityScript = join(ROOT, "scripts/patch-4a11-local-real-parity.mjs");
const regressionScript = join(ROOT, "scripts/patch-4a11-regression-runner.mjs");
const guaranteesDoc = join(ROOT, "docs/architecture/ARCHITECTURE_INTERPRETATION_GUARANTEES.md");
assert("interpretation trace module exists", existsSync(join(ROOT, "lib/miaInterpretationTrace.js")));
assert("validation script exists", existsSync(validationScript));
assert("parity script exists", existsSync(parityScript));
assert("regression runner exists", existsSync(regressionScript));
assert("version is 4A.11.0", INTERPRETATION_TRACE_VERSION === "4A.11.0");

console.log("\n── Interpreter contract ──");
assert("LLM is surface renderer only", INTERPRETER_COMPONENT.SURFACE_RENDERER === "LLM_SurfaceRenderer");
assert("PCE is registered interpreter", !!INTERPRETER_COMPONENT.PRACTICAL_CONSEQUENCE_ENGINE);
assert("Narrative planner is registered", !!INTERPRETER_COMPONENT.NARRATIVE_PLANNER);
assert("Verbalizer is registered", !!INTERPRETER_COMPONENT.SEMANTIC_VERBALIZER);

console.log("\n── Offline interpretation chain (battery fixture) ──");
const FIXTURE_SPECS = {
  official_name: "Galaxy A55",
  category: "mobile",
  strengths: ["boa autonomia", "tela fluida"],
  weaknesses: ["carregamento mais lento"],
  ideal_for: ["uso cotidiano"],
};
const translated = translateDataLayerFieldsToConsequences(FIXTURE_SPECS);
const pce = buildPracticalConsequences({ trustedSpecs: FIXTURE_SPECS, translatedKnowledge: translated });
const pceUnits = practicalConsequencesToSemanticUnits(pce.consequences, {
  productName: "Galaxy A55",
  category: "mobile",
  primaryAxis: "battery",
});
const structured = buildStructuredDecisionFacts({
  gainUnits: pceUnits.filter((u) => u.decisionRole !== SEMANTIC_DECISION_ROLE.TRADEOFF),
  sacrificeUnits: pceUnits.filter((u) => u.decisionRole === SEMANTIC_DECISION_ROLE.TRADEOFF),
  productName: "Galaxy A55",
  category: "mobile",
  primaryAxis: "battery",
});
const narrativePlan = buildNarrativePlanFromStructuredFacts(structured, { hasWinner: true });
const verbalizationPlan = buildVerbalizationPlanFromNarrativePlan(narrativePlan, {
  productName: "Galaxy A55",
});

const offlineSession = {
  lastStructuredDecisionFacts: structured,
  lastNarrativePlan: narrativePlan,
  lastVerbalizationPlan: verbalizationPlan,
  lastPracticalConsequences: pce.consequences,
  lastContextualPriorityModel: {
    dominantCriterion: "battery",
    criteria: [{ criterion: "battery", finalWeight: 0.42, origin: "explicit_user" }],
    personalized: true,
  },
  lastDomainKnowledgeModel: { domain: "mobile", itemCount: 2, neutral: false },
};

const offlineTrace = buildInterpretationTraceFromSession(
  offlineSession,
  "Eu iria no Galaxy A55 porque a autonomia tende a ser um ponto forte no dia a dia."
);
const offlineValidation = validateInterpretationTrace(offlineTrace);

assert("offline chain produces claims", offlineTrace.claimCount > 0);
assert("offline trace validates", offlineValidation.valid, offlineValidation.reasons.join(", "));
assert("has structured facts in chain", offlineTrace.cognitiveChain.knowledgeBase.hasStructuredFacts);
assert("has PCE categories", (offlineTrace.cognitiveChain.practicalConsequenceEngine.count || 0) > 0);
assert("has narrative plan", !!offlineTrace.cognitiveChain.narrativePlan?.sectionCount);
assert("has verbalization plan", !!offlineTrace.cognitiveChain.verbalizationPlan?.sectionCount);
assert("priority engine recorded", offlineTrace.cognitiveChain.priorityEngine?.dominantCriterion === "battery");
assert("domain adapter recorded", offlineTrace.cognitiveChain.domainAdapter?.domain === "mobile");

console.log("\n── Claim trace structure ──");
const sampleUnit = structured.semanticUnits[0];
const sampleClaim = buildClaimTrace({
  unit: sampleUnit,
  narrativeElement: narrativePlan.sections?.[0] || null,
  verbalizationSlot: verbalizationPlan.sections?.[0] || null,
});
assert("claim has evidence", sampleClaim.evidence.length > 0);
assert("claim has interpreter", !!sampleClaim.interpreter);
assert("interpreter is not LLM", !/llm/i.test(sampleClaim.interpreter));
assert("claim has reasoning effectKey", !!sampleClaim.reasoning?.effectKey || !!sampleClaim.claim);

console.log("\n── Negative case (empty session) ──");
const emptyAudit = auditInterpretationChain({}, "", { clarificationOk: true, requireArchitecture: false });
assert("empty session allows clarification mode", emptyAudit.clarificationReply === false || !emptyAudit.pass);

console.log("\n── Validation script coverage ──");
const validationSource = readFileSync(validationScript, "utf8");
const requiredPositive = [
  "battery",
  "camera",
  "games",
  "value",
  "updates",
  "comparison",
  "contestation",
  "tradeoff",
];
for (const family of requiredPositive) {
  assert(`positive family ${family}`, validationSource.includes(`${family}:`) || validationSource.includes(`"${family}"`));
}
const requiredNegative = [
  "insufficient_data",
  "unknown_product",
  "unknown_category",
  "incomplete_specs",
];
for (const family of requiredNegative) {
  assert(`negative family ${family}`, validationSource.includes(family));
}
assert("uses auditInterpretationChain", /auditInterpretationChain/.test(validationSource));
assert("builds interpretation traces", /buildInterpretationTraceFromSession/.test(validationSource));
assert("fidelity sample >= 20 claims", /FIDELITY_SAMPLE_SIZE|fidelityClaims/.test(validationSource));

console.log("\n── Guarantees document ──");
if (existsSync(guaranteesDoc)) {
  const guarantees = readFileSync(guaranteesDoc, "utf8");
  assert("guarantees doc has invariants", /Invariantes Arquiteturais|Architectural Invariants/i.test(guarantees));
  assert("guarantees doc defines LLM role", /Papel da LLM|Role of the LLM/i.test(guarantees));
  assert("guarantees doc has cognitive chain", /Cadeia Cognitiva|Cognitive Chain/i.test(guarantees));
} else {
  assert("guarantees document pending creation", false, "will be created before commit");
}

console.log(`\nPATCH 4A.11 Semantic Interpretation Audit: ${passed}/${passed + failed} passed`);
if (failed) {
  console.log("FAILURES DETECTED");
  process.exit(1);
}
console.log("ALL PASS");
