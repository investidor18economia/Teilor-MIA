/**
 * PATCH 4A.7 — Practical Consequence Engine Audit
 *
 * Usage: node scripts/test-mia-patch-47-practical-consequence-engine-audit.js
 */

import { resetSemanticIdCounterForTests } from "../lib/miaSemanticDecisionContract.js";
import { buildStructuredDecisionFacts } from "../lib/miaStructuredDecisionFacts.js";
import {
  CONTEXTUAL_DECISION_SYNTHESIS_VERSION,
  buildContextualDecisionSynthesisPayload,
  enrichSemanticUnitsWithPracticalConsequences,
} from "../lib/miaContextualDecisionSynthesis.js";
import {
  PRACTICAL_CONFIDENCE,
  PRACTICAL_CONSEQUENCE_ENGINE_VERSION,
  PRACTICAL_EVIDENCE_SOURCE,
  auditDataLayerSpecTranslationCoverage,
  buildPracticalConsequences,
  practicalConsequencesToSemanticUnits,
  practicalConsequencesToTrace,
  validatePracticalConsequence,
} from "../lib/miaPracticalConsequenceEngine.js";
import { buildNarrativePlanFromStructuredFacts, validateNarrativePlan } from "../lib/miaNarrativePlanner.js";
import {
  buildSemanticVerbalizationPayload,
  validateVerbalizationPlan,
} from "../lib/miaSemanticVerbalizer.js";
import { SESSION_CONTEXT_TRANSPORT_FIELDS } from "../lib/miaSessionContextTransport.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

resetSemanticIdCounterForTests();

console.log("\nPATCH 4A.7 — Practical Consequence Engine Audit\n");

const MID_RANGE_PHONE = {
  official_name: "Galaxy A55 5G",
  category: "mobile",
  strengths: ["bateria consistente", "tela fluida"],
  weaknesses: ["carregamento mais lento que rivais recentes"],
  ideal_for: ["quem prioriza autonomia no dia a dia"],
  battery_mah: 5000,
  refresh_rate_hz: 120,
  ram_gb: 8,
  storage_gb: 256,
  main_camera_mp: 50,
  chipset: "Exynos 1480",
};

const FLAGSHIP_PHONE = {
  official_name: "Galaxy S24 Ultra",
  category: "mobile",
  strengths: ["desempenho forte", "camera confiavel", "bateria longa"],
  weaknesses: ["preco elevado"],
  battery_mah: 5000,
  refresh_rate_hz: 120,
  ram_gb: 12,
  storage_gb: 512,
  main_camera_mp: 200,
  chipset: "Snapdragon 8 Gen 3",
  charging_w: 45,
  ip_rating: "IP68",
};

const OLD_INCOMPLETE_PHONE = {
  official_name: "Galaxy J5",
  category: "mobile",
  strengths: [],
  weaknesses: [],
  battery_mah: 2600,
  refresh_rate_hz: 60,
};

const SPARSE_PHONE = {
  official_name: "Modelo Desconhecido X",
  category: "mobile",
};

console.log("── Version ──");
assert("engine version", PRACTICAL_CONSEQUENCE_ENGINE_VERSION === "4A.7.0");
assert("synthesis version", CONTEXTUAL_DECISION_SYNTHESIS_VERSION === "4A.7.0");

console.log("\n── Structure & governance ──");
const mid = buildPracticalConsequences({
  trustedSpecs: MID_RANGE_PHONE,
  primaryAxis: "battery",
  productName: MID_RANGE_PHONE.official_name,
  category: "mobile",
});
assert("mid-range produces consequences", mid.consequences.length >= 2);
assert(
  "each consequence has confidence",
  mid.consequences.every((entry) => entry.confidence && entry.reason && entry.source?.primary)
);
assert(
  "each consequence has limitations",
  mid.consequences.every((entry) => Array.isArray(entry.limitations) && entry.limitations.length >= 1)
);
assert(
  "no absolute claims",
  mid.consequences.every((entry) => !/\b(sempre|garante|com certeza)\b/i.test(entry.practicalMeaning || ""))
);
assert(
  "knowledge prioritized over spec-only",
  mid.consequences.some((entry) =>
    [PRACTICAL_EVIDENCE_SOURCE.COMBINED, PRACTICAL_EVIDENCE_SOURCE.DATA_LAYER_KNOWLEDGE].includes(
      entry.source?.primary
    )
  )
);

console.log("\n── Confidence tiers ──");
const flagship = buildPracticalConsequences({
  trustedSpecs: FLAGSHIP_PHONE,
  productName: FLAGSHIP_PHONE.official_name,
});
assert("flagship high/medium confidence", flagship.consequences.some((e) => e.confidence === PRACTICAL_CONFIDENCE.HIGH || e.confidence === PRACTICAL_CONFIDENCE.MEDIUM));

const sparse = buildPracticalConsequences({ trustedSpecs: SPARSE_PHONE });
assert("sparse specs mostly skipped", sparse.consequences.length === 0 || sparse.skipped.length >= 1);

const oldPhone = buildPracticalConsequences({ trustedSpecs: OLD_INCOMPLETE_PHONE });
assert("incomplete old phone limited output", oldPhone.consequences.length <= 3);

console.log("\n── Negative / insufficient cases ──");
assert("sparse audit insufficient battery", !sparse.consequences.find((e) => e.category === "battery") || sparse.skipped.length > 0);
const invalid = validatePracticalConsequence({
  category: "battery",
  confidence: PRACTICAL_CONFIDENCE.HIGH,
  reason: "",
  source: { primary: "data_layer_spec" },
  practicalMeaning: "sempre dura o dia inteiro",
});
assert("reject absolute claim", !invalid.valid);

console.log("\n── Semantic unit conversion ──");
const units = practicalConsequencesToSemanticUnits(mid.consequences, {
  productName: MID_RANGE_PHONE.official_name,
  category: "mobile",
  primaryAxis: "battery",
});
assert("units created", units.length >= 2);
assert("units have producer layer", units.every((u) => u.evidence?.producerLayer === "miaPracticalConsequenceEngine"));
assert("supporting/tradeoff roles", units.every((u) => u.decisionRole === "supporting_evidence" || u.decisionRole === "tradeoff"));

console.log("\n── Synthesis integration ──");
const enriched = enrichSemanticUnitsWithPracticalConsequences({
  gainUnits: [],
  sacrificeUnits: [],
  trustedSpecs: MID_RANGE_PHONE,
  context: { productName: MID_RANGE_PHONE.official_name, category: "mobile", primaryAxis: "battery" },
});
assert("enrichment adds units", enriched.gainUnits.length + enriched.sacrificeUnits.length >= 2);
assert("trace emitted", !!enriched.practicalConsequenceTrace?.count);

const payload = buildContextualDecisionSynthesisPayload({
  trustedSpecs: MID_RANGE_PHONE,
  productName: MID_RANGE_PHONE.official_name,
  category: "mobile",
  primaryAxis: "battery",
  gainStrings: ["menos ansiedade com recarga ao longo do dia"],
  sacrificeStrings: ["carregamento mais lento que rivais recentes"],
});
assert("payload carries practical consequences", Array.isArray(payload.practicalConsequences));
assert("structured facts preserved", payload.structuredDecisionFacts?.semanticUnits?.length >= 2);
assert("narrative plan valid", validateNarrativePlan(payload.narrativePlan).valid);
assert("verbalization plan valid", validateVerbalizationPlan(payload.verbalizationPlan).valid);

console.log("\n── Existing structured facts + trustedSpecs (specialist path) ──");
const prebuiltFacts = buildStructuredDecisionFacts({
  gainUnits: payload.gainUnits.filter((u) => u.decisionRole !== "tradeoff"),
  sacrificeUnits: payload.sacrificeUnits,
  productName: MID_RANGE_PHONE.official_name,
  category: "mobile",
  primaryAxis: "battery",
});
const specialistPathPayload = buildContextualDecisionSynthesisPayload({
  structuredDecisionFacts: prebuiltFacts,
  trustedSpecs: MID_RANGE_PHONE,
  productName: MID_RANGE_PHONE.official_name,
  category: "mobile",
  primaryAxis: "battery",
});
assert(
  "specialist path still emits practical consequences",
  specialistPathPayload.practicalConsequences.length > 0
);
assert(
  "specialist path persists trace",
  !!specialistPathPayload.practicalConsequenceTrace?.count
);

console.log("\n── Data Layer audit ──");
const coverage = auditDataLayerSpecTranslationCoverage(FLAGSHIP_PHONE);
assert("coverage report categories", coverage.categories.length === 7);
assert(
  "flagship translatable battery",
  coverage.categories.find((c) => c.category === "battery")?.translatableNow === true
);

console.log("\n── Decision invariance ──");
const factsBefore = buildStructuredDecisionFacts({
  gainUnits: enriched.gainUnits.filter((u) => u.decisionRole !== "tradeoff"),
  sacrificeUnits: enriched.gainUnits.filter(() => false),
});
const primaryBefore = factsBefore.primaryGain?.effectKey;
assert("primary gain still resolvable", !!primaryBefore || factsBefore.semanticUnits.length >= 1);

console.log("\n── Session transport ──");
assert("lastPracticalConsequences transport field", SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastPracticalConsequences"));

console.log("\n── Pipeline wiring ──");
const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
assert("chat persists practical consequences", /lastPracticalConsequences/.test(chatSource));
assert("chat uses synthesis payload", /buildContextualDecisionSynthesisPayload/.test(chatSource));

const synthesisSource = readFileSync(join(ROOT, "lib/miaContextualDecisionSynthesis.js"), "utf8");
assert("synthesis imports engine", /miaPracticalConsequenceEngine/.test(synthesisSource));
assert("synthesis enriches units", /enrichSemanticUnitsWithPracticalConsequences/.test(synthesisSource));

console.log("\n── Trace helper ──");
const trace = practicalConsequencesToTrace(mid);
assert("trace count", trace.count === mid.consequences.length);

console.log(`\nPATCH 4A.7 Practical Consequence Engine: ${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
console.log("ALL PASS");
