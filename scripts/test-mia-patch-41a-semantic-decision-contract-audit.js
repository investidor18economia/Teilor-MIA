/**
 * PATCH 4A.1 — Semantic Decision Contract Audit
 *
 * Usage:
 *   node scripts/test-mia-patch-41a-semantic-decision-contract-audit.js
 */

import {
  SEMANTIC_CAVEAT_TYPE,
  SEMANTIC_CONFIDENCE,
  SEMANTIC_DECISION_CONTRACT_VERSION,
  SEMANTIC_DECISION_ROLE,
  SEMANTIC_DIRECTION,
  SEMANTIC_EVIDENCE_SOURCE,
  SEMANTIC_EVIDENCE_TYPE,
  SEMANTIC_PRIORITY_RELEVANCE,
  buildSemanticDecisionTrace,
  createSemanticCaveat,
  createSemanticDecisionUnit,
  createSemanticEvidence,
  createSemanticImplication,
  createSemanticPriority,
  deserializeSemanticDecisionUnit,
  resetSemanticIdCounterForTests,
  serializeSemanticDecisionUnit,
  validateSemanticDecisionUnit,
} from "../lib/miaSemanticDecisionContract.js";
import {
  buildSemanticDecisionUnitFromPoolItem,
  inferUserPriorityReasonCode,
} from "../lib/miaSemanticDecisionBridge.js";
import {
  isLegacyAdapterSurface,
  toLegacyGainString,
} from "../lib/miaSemanticDecisionLegacyAdapter.js";
import {
  buildSemanticCandidatePool,
  createSemanticAllocationState,
  selectTradeoffGains,
  selectTradeoffGainsWithSemantics,
} from "../lib/miaSemanticFamilyAllocationEngine.js";
import { resolveTradeoffCommunicationSources } from "../lib/miaTradeoffCommunicationLayer.js";

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    const msg = `${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}

function compactStub(text, family) {
  if (family === "display_smoothness") return "tela fluida no cotidiano";
  return text.slice(0, 90);
}

resetSemanticIdCounterForTests();

console.log("\n=== PATCH 4A.1 — Semantic Decision Contract Audit ===\n");

console.log("1) Valid construction");
{
  const evidence = createSemanticEvidence({
    type: SEMANTIC_EVIDENCE_TYPE.FACTUAL,
    source: SEMANTIC_EVIDENCE_SOURCE.DATA_LAYER,
    dimension: "display_smoothness",
    sourceToken: "tela_fluida",
    interpretedText: "mais sensação de fluidez na navegação e nas interações do dia a dia",
    confidence: SEMANTIC_CONFIDENCE.HIGH,
    category: "celular",
  });
  const implication = createSemanticImplication({
    evidenceIds: [evidence.id],
    effectKey: "greater_visual_responsiveness",
    effectKind: "usage_experience",
    scope: "interface_navigation",
    direction: SEMANTIC_DIRECTION.POSITIVE,
    interpretedSourceText: evidence.interpretedText,
  });
  const priority = createSemanticPriority({
    targetId: implication.id,
    relevance: SEMANTIC_PRIORITY_RELEVANCE.SECONDARY,
    reasonCode: "user_prioritizes_battery",
  });
  const unit = createSemanticDecisionUnit({
    evidence,
    implication,
    priority,
    decisionRole: SEMANTIC_DECISION_ROLE.SECONDARY_GAIN,
  });
  const validation = validateSemanticDecisionUnit(unit);
  assert("valid unit passes validation", validation.valid, validation.errors.join(", "));
  assert("schema version set", unit.schemaVersion === SEMANTIC_DECISION_CONTRACT_VERSION);
}

console.log("\n2) Invalid construction");
{
  const badImplication = createSemanticImplication({
    evidenceIds: [],
    effectKey: "",
    direction: "invalid_direction",
    confidence: "invalid_confidence",
  });
  const badValidation = validateSemanticDecisionUnit({
    schemaVersion: SEMANTIC_DECISION_CONTRACT_VERSION,
    id: "bad",
    evidence: createSemanticEvidence({ dimension: "x" }),
    implication: badImplication,
    priority: null,
    caveat: null,
    decisionRole: SEMANTIC_DECISION_ROLE.SECONDARY_GAIN,
    legacy: { compactedText: "x", isPrimaryTruth: true, adapterVersion: "bad" },
  });
  assert("invalid implication rejected", !badValidation.valid);
  assert("legacy cannot be primary truth", badValidation.errors.includes("legacy_marked_as_primary_truth"));
}

console.log("\n3) Semantic preservation vs compactByFamily");
{
  const item = {
    text: "mais sensação de fluidez na navegação e nas interações do dia a dia",
    family: "display_smoothness",
    type: "strength",
    token: "tela_fluida",
  };
  const unit = buildSemanticDecisionUnitFromPoolItem(item, { primaryAxis: "battery" });
  const legacy = toLegacyGainString(unit, compactStub);
  assert(
    "structured effect preserved",
    unit.implication.effectKey === "greater_visual_responsiveness"
  );
  assert(
    "interpreted source text preserved",
    unit.implication.interpretedSourceText.includes("fluidez na navegação")
  );
  assert("legacy compaction differs from structured meaning", legacy === "tela fluida no cotidiano");
  assert("legacy not primary truth", unit.legacy?.isPrimaryTruth === false);
  assert(
    "structured meaning not replaced by legacy string",
    unit.implication.effectKey !== legacy
  );
}

console.log("\n4) Legacy compatibility");
{
  const state = createSemanticAllocationState();
  const pool = buildSemanticCandidatePool(
    {
      strengthConsequences: [
        "mais sensação de fluidez na navegação e nas interações do dia a dia",
        "menos ansiedade com recarga ao longo de um dia de uso moderado a intenso",
      ],
      weaknessConsequences: ["a navegação pode parecer menos fluida para quem já se acostumou com telas mais rápidas"],
    },
    { primaryAxis: "battery" }
  );
  const result = selectTradeoffGainsWithSemantics(state, pool, { primaryAxis: "battery", maxGains: 2 });
  assert("legacy gains still returned", result.gains.length >= 1);
  assert("semantic units attached to state", state.semanticUnits.length >= 1);
  assert(
    "selectTradeoffGains wrapper unchanged shape",
    Array.isArray(
      selectTradeoffGains(createSemanticAllocationState(), pool, { primaryAxis: "battery", maxGains: 1 })
    )
  );
  assert("legacy adapter surface explicit", isLegacyAdapterSurface(result.semanticUnits[0]));
}

console.log("\n5) Category agnosticism — mobile + notebook");
{
  const mobile = buildSemanticDecisionUnitFromPoolItem(
    {
      text: "menos ansiedade com recarga ao longo de um dia de uso moderado a intenso",
      family: "battery_autonomy",
      type: "strength",
      token: "bateria_consistente",
    },
    { category: "celular" }
  );
  const notebook = buildSemanticDecisionUnitFromPoolItem(
    {
      text: "menor preocupação com recarga durante jornadas longas fora do escritório",
      family: "battery_autonomy",
      type: "strength",
      token: "autonomia_notebook",
    },
    { category: "notebook" }
  );
  assert("mobile uses same structural fields", mobile.evidence.dimension === "battery_autonomy");
  assert("notebook uses same structural fields", notebook.evidence.dimension === "battery_autonomy");
  assert(
    "category only in evidence metadata",
    mobile.evidence.category === "celular" && notebook.evidence.category === "notebook"
  );
  assert(
    "no mobile-specific schema keys",
    !("batteryBenefit" in mobile) && !("screenBenefit" in notebook)
  );
}

console.log("\n6) Traceability");
{
  const evidence = createSemanticEvidence({
    dimension: "noise_level",
    sourceToken: "operacao_silenciosa",
    interpretedText: "operação mais silenciosa durante uso contínuo",
    source: SEMANTIC_EVIDENCE_SOURCE.DATA_LAYER,
    category: "aspirador",
  });
  const implication = createSemanticImplication({
    evidenceIds: [evidence.id],
    effectKey: "lower_operating_noise",
    scope: "ambient_comfort",
    direction: SEMANTIC_DIRECTION.POSITIVE,
  });
  const caveat = createSemanticCaveat({
    type: SEMANTIC_CAVEAT_TYPE.PROFILE_DEPENDENT,
    evidenceIds: [evidence.id],
    relatedImplicationId: implication.id,
    conditionCode: "noise_sensitive_user",
  });
  const unit = createSemanticDecisionUnit({
    evidence,
    implication,
    priority: createSemanticPriority({ targetId: implication.id, relevance: SEMANTIC_PRIORITY_RELEVANCE.PRIMARY }),
    caveat,
  });
  const trace = buildSemanticDecisionTrace([unit]);
  assert("implication traces to evidence id", unit.implication.evidenceIds.includes(unit.evidence.id));
  assert("caveat traces to implication", unit.caveat.relatedImplicationId === unit.implication.id);
  assert("trace exposes structured ids", trace.units[0]?.evidence?.id && trace.units[0]?.implication?.effectKey);
}

console.log("\n7) Serialization");
{
  const unit = buildSemanticDecisionUnitFromPoolItem({
    text: "capacidade interna adequada para biblioteca de mídia doméstica",
    family: "size_capacity",
    type: "strength",
    token: "capacidade_512gb",
  }, { category: "televisao" });
  const serialized = serializeSemanticDecisionUnit(unit);
  const roundTrip = deserializeSemanticDecisionUnit(serialized);
  assert("round-trip preserves effect key", roundTrip.implication.effectKey === unit.implication.effectKey);
}

console.log("\n8) Multivariation priority phrases");
{
  const phrases = [
    ["quero bateria boa", "user_prioritizes_battery"],
    ["bateria é minha prioridade", "user_prioritizes_battery"],
    ["uso muito fora de casa", "user_prioritizes_battery"],
    ["não quero viver procurando tomada", "user_prioritizes_battery"],
    ["preciso de um que aguente bastante", "user_prioritizes_battery"],
    ["tela fluida importa", "user_prioritizes_display"],
    ["foto tem q ser boa", "user_prioritizes_camera"],
  ];
  for (const [phrase, expected] of phrases) {
    assert(`priority phrase "${phrase}"`, inferUserPriorityReasonCode(phrase) === expected);
  }
}

console.log("\n9) Tradeoff integration observability");
{
  const state = createSemanticAllocationState();
  const candidateData = buildSemanticCandidatePool(
    {
      strengthConsequences: [
        "menos ansiedade com recarga ao longo de um dia de uso moderado a intenso",
        "mais sensação de fluidez na navegação e nas interações do dia a dia",
      ],
      weaknessConsequences: ["a navegação pode parecer menos fluida para quem já se acostumou com telas mais rápidas"],
    },
    { primaryAxis: "battery" }
  );
  const sources = resolveTradeoffCommunicationSources({
    semanticAllocationState: state,
    semanticCandidateData: candidateData,
    primaryAxis: "battery",
    userPriorityPhrase: "bateria é minha prioridade",
  });
  assert("tradeoff sources expose semantic units", Array.isArray(sources.semanticUnits) && sources.semanticUnits.length > 0);
  assert("tradeoff sources expose semantic trace", sources.semanticTrace?.unitCount >= 1);
}

console.log("\n=== Summary ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((entry) => console.log(`  - ${entry}`));
  process.exit(1);
}
process.exit(0);
