/**
 * PATCH 4A.2 — Structured Decision Facts Audit
 *
 * Usage:
 *   node scripts/test-mia-patch-42-structured-decision-facts-audit.js
 */

import { resetSemanticIdCounterForTests } from "../lib/miaSemanticDecisionContract.js";
import { buildSemanticDecisionUnitFromPoolItem, buildSemanticDecisionUnitFromWeaknessPoolItem } from "../lib/miaSemanticDecisionBridge.js";
import {
  STRUCTURED_DECISION_FACTS_VERSION,
  buildStructuredDecisionFacts,
  buildStructuredDecisionFactsFromSession,
  dedupeSemanticUnitsByEffect,
  enrichDecisionFactsWithStructure,
  validateStructuredDecisionFacts,
} from "../lib/miaStructuredDecisionFacts.js";
import {
  collectDecisionFactsFromSession,
  decisionFactsNarrativeToTrace,
} from "../lib/miaDecisionFactsNarrative.js";
import { hasStructuredDecisionFacts } from "../lib/miaStructuredDecisionFacts.js";
import {
  buildSemanticCandidatePool,
  createSemanticAllocationState,
  selectTradeoffGainsWithSemantics,
  selectTradeoffSacrificesWithSemantics,
} from "../lib/miaSemanticFamilyAllocationEngine.js";
import { resolveTradeoffCommunicationSources } from "../lib/miaTradeoffCommunicationLayer.js";
import { isLegacyAdapterSurface } from "../lib/miaSemanticDecisionLegacyAdapter.js";

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

resetSemanticIdCounterForTests();

console.log("\n=== PATCH 4A.2 — Structured Decision Facts Audit ===\n");

const MOBILE_GAIN_ITEM = {
  text: "mais sensação de fluidez na navegação e nas interações do dia a dia",
  family: "display_smoothness",
  type: "strength",
  token: "tela_fluida",
};

const MOBILE_BATTERY_ITEM = {
  text: "menos ansiedade com recarga ao longo de um dia de uso moderado a intenso",
  family: "battery_autonomy",
  type: "strength",
  token: "bateria_consistente",
};

const MOBILE_WEAKNESS_ITEM = {
  text: "a navegação pode parecer menos fluida para quem já se acostumou com telas mais rápidas",
  family: "display_smoothness",
  type: "weakness",
  token: "tela_60hz",
};

const NOTEBOOK_GAIN_ITEM = {
  text: "menor preocupação com recarga durante jornadas longas fora do escritório",
  family: "battery_autonomy",
  type: "strength",
  token: "autonomia_notebook",
};

console.log("1) Primary Gain");
{
  const primary = buildSemanticDecisionUnitFromPoolItem(MOBILE_GAIN_ITEM, {
    category: "celular",
    decisionRole: "primary_gain",
  });
  const secondary = buildSemanticDecisionUnitFromPoolItem(MOBILE_BATTERY_ITEM, {
    category: "celular",
    decisionRole: "secondary_gain",
  });
  const structured = buildStructuredDecisionFacts({
    gainUnits: [primary, secondary],
    category: "celular",
    primaryAxis: "screen",
  });

  assert("primary gain exists", !!structured.primaryGain);
  assert("primary gain is unique", structured.primaryGain?.decisionRole === "primary_gain");
  assert(
    "primary gain traceable to evidence",
    structured.primaryGain?.evidenceId === primary.evidence.id
  );
  assert(
    "primary uses effectKey not phrase as identity",
    structured.primaryGain?.effectKey === "greater_visual_responsiveness"
  );
}

console.log("\n2) Secondary Gains");
{
  const units = [
    buildSemanticDecisionUnitFromPoolItem(MOBILE_GAIN_ITEM, { decisionRole: "primary_gain" }),
    buildSemanticDecisionUnitFromPoolItem(MOBILE_BATTERY_ITEM, { decisionRole: "secondary_gain" }),
    buildSemanticDecisionUnitFromPoolItem(
      {
        text: "menos preocupação em registrar bons momentos sem precisar repetir a foto várias vezes",
        family: "camera_video_confidence",
        type: "strength",
        token: "camera_consistente",
      },
      { decisionRole: "secondary_gain" }
    ),
  ];
  const structured = buildStructuredDecisionFacts({ gainUnits: units });
  assert("multiple secondary gains", structured.secondaryGains.length === 2);
  assert(
    "hierarchy ordered",
    structured.hierarchy[0].layer === "primary_gain" &&
      structured.hierarchy[1].layer === "secondary_gain"
  );
  assert(
    "no duplicate effect keys",
    dedupeSemanticUnitsByEffect(units).length === units.length
  );
}

console.log("\n3) Tradeoffs");
{
  const gain = buildSemanticDecisionUnitFromPoolItem(MOBILE_BATTERY_ITEM, { decisionRole: "primary_gain" });
  const tradeoff = buildSemanticDecisionUnitFromWeaknessPoolItem(MOBILE_WEAKNESS_ITEM, {
    category: "celular",
  });
  const structured = buildStructuredDecisionFacts({
    gainUnits: [gain],
    sacrificeUnits: [tradeoff],
  });
  assert("tradeoffs structured", structured.tradeoffs.length === 1);
  assert("tradeoff role explicit", structured.tradeoffs[0].decisionRole === "tradeoff");
  assert(
    "tradeoff not stored as advantage",
    !structured.secondaryGains.some((entry) => entry.unitId === tradeoff.id)
  );
}

console.log("\n4) Caveats separated from weaknesses");
{
  const tradeoff = buildSemanticDecisionUnitFromWeaknessPoolItem(MOBILE_WEAKNESS_ITEM, {});
  assert("weakness evidence is comparative/factual layer", !!tradeoff.evidence?.interpretedText);
  assert("tradeoff implication negative", tradeoff.implication?.direction === "negative");
  assert("caveats array separate from tradeoffs by role", tradeoff.decisionRole === "tradeoff");
}

console.log("\n5) Decision hierarchy");
{
  const structured = buildStructuredDecisionFacts({
    gainUnits: [
      buildSemanticDecisionUnitFromPoolItem(MOBILE_BATTERY_ITEM, { decisionRole: "primary_gain" }),
      buildSemanticDecisionUnitFromPoolItem(MOBILE_GAIN_ITEM, { decisionRole: "secondary_gain" }),
    ],
    sacrificeUnits: [buildSemanticDecisionUnitFromWeaknessPoolItem(MOBILE_WEAKNESS_ITEM, {})],
  });
  const validation = validateStructuredDecisionFacts(structured);
  assert("hierarchy validates", validation.valid, validation.errors.join(", "));
  assert(
    "explicit ranks increase",
    structured.hierarchy.every((entry, index) => index === 0 || entry.rank > structured.hierarchy[index - 1].rank)
  );
}

console.log("\n6) SemanticDecisionUnit integrity");
{
  const unit = buildSemanticDecisionUnitFromPoolItem(MOBILE_GAIN_ITEM, {});
  const structured = buildStructuredDecisionFacts({ gainUnits: [unit] });
  assert(
    "semantic unit preserved intact",
    structured.semanticUnits[0].implication.effectKey === unit.implication.effectKey
  );
  assert("legacy not primary truth", structured.legacy?.isPrimaryTruth === false);
}

console.log("\n7) Legacy adapter");
{
  const state = createSemanticAllocationState();
  const pool = buildSemanticCandidatePool(
    {
      strengthConsequences: [MOBILE_BATTERY_ITEM.text, MOBILE_GAIN_ITEM.text],
      weaknessConsequences: [MOBILE_WEAKNESS_ITEM.text],
    },
    { primaryAxis: "battery" }
  );
  const gains = selectTradeoffGainsWithSemantics(state, pool, { primaryAxis: "battery", maxGains: 2 });
  const sacrifices = selectTradeoffSacrificesWithSemantics(state, pool, { primaryAxis: "battery", maxSacrifices: 1 });

  const facts = enrichDecisionFactsWithStructure(
    { winner: { product_name: "Produto X" }, hasCommercialContext: true },
    { semanticUnits: gains.semanticUnits, sacrificeUnits: sacrifices.semanticUnits }
  );

  assert("legacy advantages available", facts.advantages?.length >= 1);
  assert("legacy sacrifices available", facts.sacrifices?.length >= 1);
  assert("structured layer present", !!facts.structured);
  assert("legacy adapter on units", isLegacyAdapterSurface(gains.semanticUnits[0]));
}

console.log("\n8) Session integration");
{
  const gain = buildSemanticDecisionUnitFromPoolItem(MOBILE_BATTERY_ITEM, { decisionRole: "primary_gain" });
  const session = {
    lastBestProduct: { product_name: "Galaxy A35" },
    lastSemanticDecisionUnits: [gain],
    lastSemanticSacrificeUnits: [buildSemanticDecisionUnitFromWeaknessPoolItem(MOBILE_WEAKNESS_ITEM, {})],
    lastCategory: "celular",
    lastAxis: "battery",
  };
  const facts = collectDecisionFactsFromSession(session);
  assert("session facts enriched", hasStructuredDecisionFacts(facts));
  assert("trace exposes structured layer", !!decisionFactsNarrativeToTrace(facts)?.structured);
}

console.log("\n9) Category agnostic notebook fixture");
{
  const structured = buildStructuredDecisionFacts({
    gainUnits: [buildSemanticDecisionUnitFromPoolItem(NOTEBOOK_GAIN_ITEM, { category: "notebook" })],
    category: "notebook",
  });
  assert("notebook uses same schema", structured.schemaVersion === STRUCTURED_DECISION_FACTS_VERSION);
  assert("notebook effect key structured", structured.primaryGain?.effectKey === "extended_off_grid_autonomy");
}

console.log("\n10) Tradeoff pipeline integration");
{
  const state = createSemanticAllocationState();
  const candidateData = buildSemanticCandidatePool(
    {
      strengthConsequences: [MOBILE_BATTERY_ITEM.text, MOBILE_GAIN_ITEM.text],
      weaknessConsequences: [MOBILE_WEAKNESS_ITEM.text],
    },
    { primaryAxis: "battery" }
  );
  const sources = resolveTradeoffCommunicationSources({
    semanticAllocationState: state,
    semanticCandidateData: candidateData,
    primaryAxis: "battery",
  });
  assert("sources expose structured decision facts", !!sources.structuredDecisionFacts);
  assert(
    "structured facts have primary gain",
    !!sources.structuredDecisionFacts.primaryGain
  );
  assert(
    "structured facts have tradeoffs",
    sources.structuredDecisionFacts.tradeoffs.length >= 1
  );
}

console.log("\n11) Backward compatibility without semantic units");
{
  const legacyFacts = collectDecisionFactsFromSession({
    lastBestProduct: { product_name: "X" },
    lastMainConsequence: "equilíbrio geral",
    lastWinnerAdvantages: ["bateria"],
    lastWinnerSacrifices: ["preço"],
  });
  assert("legacy session still works", legacyFacts.winner?.product_name === "X");
  assert("no structured layer without units", !legacyFacts.structured);
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
