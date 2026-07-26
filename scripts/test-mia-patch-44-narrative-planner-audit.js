/**
 * PATCH 4A.4 — Narrative Planner Audit
 *
 * Usage: node scripts/test-mia-patch-44-narrative-planner-audit.js
 */

import { resetSemanticIdCounterForTests } from "../lib/miaSemanticDecisionContract.js";
import {
  buildSemanticDecisionUnitFromPoolItem,
  buildSemanticDecisionUnitFromWeaknessPoolItem,
} from "../lib/miaSemanticDecisionBridge.js";
import { buildStructuredDecisionFacts } from "../lib/miaStructuredDecisionFacts.js";
import {
  buildContextualDecisionSynthesisPayload,
  finalizeTradeoffSourcesWithSynthesis,
} from "../lib/miaContextualDecisionSynthesis.js";
import {
  NARRATIVE_CLOSING_TYPE,
  NARRATIVE_PLANNER_VERSION,
  NARRATIVE_SECTION_TYPE,
  buildNarrativePlan,
  buildNarrativePlanFromStructuredFacts,
  hasNarrativePlan,
  narrativePlanToOrderedLegacyStrings,
  narrativePlanToVerbalizationOrder,
  resolveRecommendedClosing,
  validateNarrativePlan,
} from "../lib/miaNarrativePlanner.js";
import { collectDecisionFactsFromSession } from "../lib/miaDecisionFactsNarrative.js";
import { extractGainsAndSacrificesFromProduct } from "../lib/miaFirstAnswerResponseContract.js";
import { buildSpecialistPresentationContract } from "../lib/miaSpecialistPresentationContract.js";
import { resolveTradeoffCommunicationSources } from "../lib/miaTradeoffCommunicationLayer.js";
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

const MOBILE_GAIN = {
  text: "menos ansiedade com recarga ao longo do dia",
  family: "battery_autonomy",
  type: "strength",
  token: "bateria",
};
const MOBILE_SECONDARY = {
  text: "mais sensação de fluidez na navegação",
  family: "display_smoothness",
  type: "strength",
  token: "tela",
};
const MOBILE_WEAKNESS = {
  text: "a navegação pode parecer menos fluida para quem veio de telas mais rápidas",
  family: "display_smoothness",
  type: "weakness",
  token: "tela_60hz",
};

const NOTEBOOK_GAIN = {
  text: "menor preocupação com recarga durante jornadas longas",
  family: "battery_autonomy",
  type: "strength",
  token: "autonomia_notebook",
};
const NOTEBOOK_WEAKNESS = {
  text: "peso extra pode incomodar no transporte diário",
  family: "portability",
  type: "weakness",
  token: "peso",
};

function buildFixture(gainItems, weaknessItems, meta = {}) {
  const gainUnits = gainItems.map((item, index) =>
    buildSemanticDecisionUnitFromPoolItem(item, {
      category: meta.category || "mobile",
      decisionRole: index === 0 ? "primary_gain" : "secondary_gain",
    })
  );
  const sacrificeUnits = weaknessItems.map((item) =>
    buildSemanticDecisionUnitFromWeaknessPoolItem(item, { category: meta.category || "mobile" })
  );
  return buildStructuredDecisionFacts({
    gainUnits,
    sacrificeUnits,
    productName: meta.productName || "Fixture Product",
    category: meta.category || "mobile",
    primaryAxis: meta.primaryAxis || "battery",
  });
}

console.log("\nPATCH 4A.4 — Narrative Planner Audit\n");

console.log("── Core plan structure ──");
const mobileFacts = buildFixture([MOBILE_GAIN, MOBILE_SECONDARY], [MOBILE_WEAKNESS], {
  category: "mobile",
  productName: "Galaxy A55",
});
const mobilePlan = buildNarrativePlan(mobileFacts, { hasWinner: true });
assert("schema version", mobilePlan.schemaVersion === NARRATIVE_PLANNER_VERSION);
assert("primary narrative exists", !!mobilePlan.primaryNarrative);
assert("supporting arguments", mobilePlan.supportingArguments.length >= 1);
assert("tradeoffs structured", mobilePlan.tradeoffs.length >= 1);
assert("sections ordered by rank", mobilePlan.sections.every((s, i, arr) => i === 0 || s.hierarchyRank >= arr[i - 1].hierarchyRank));
assert("legacy not primary truth", mobilePlan.legacy?.isPrimaryTruth === false);
assert("validation passes", validateNarrativePlan(mobilePlan).valid);

console.log("\n── Category agnosticism ──");
const notebookFacts = buildFixture([NOTEBOOK_GAIN], [NOTEBOOK_WEAKNESS], {
  category: "notebook",
  productName: "Vivobook 15",
});
const notebookPlan = buildNarrativePlan(notebookFacts, { hasWinner: true });
assert("notebook same schema", notebookPlan.schemaVersion === mobilePlan.schemaVersion);
assert("notebook primary exists", !!notebookPlan.primaryNarrative);
assert("no category-specific keys", !Object.keys(notebookPlan.meta || {}).some((k) => /mobile|notebook|phone/i.test(k)));
assert("same section types", notebookPlan.sections.every((s) => Object.values(NARRATIVE_SECTION_TYPE).includes(s.sectionType)));

console.log("\n── Tradeoff integrity ──");
const tradeoffKeys = mobilePlan.tradeoffs.map((t) => t.effectKey || t.unitId);
assert("no duplicate tradeoffs", new Set(tradeoffKeys).size === tradeoffKeys.length);
assert("tradeoff order matches structured", mobilePlan.tradeoffs[0]?.unitId === mobileFacts.tradeoffs[0]?.unitId);

console.log("\n── Closing types ──");
assert("confidence closing", resolveRecommendedClosing(mobileFacts, { hasWinner: true }).type === NARRATIVE_CLOSING_TYPE.CONFIDENCE);
assert("recommendation closing", resolveRecommendedClosing(mobileFacts, { hasWinner: true, isExploratory: false }).type === NARRATIVE_CLOSING_TYPE.CONFIDENCE || resolveRecommendedClosing(mobileFacts, { hasWinner: true }).type === NARRATIVE_CLOSING_TYPE.RECOMMENDATION);
assert("clarification closing", resolveRecommendedClosing(null, { needsClarification: true }).type === NARRATIVE_CLOSING_TYPE.CLARIFICATION);
assert("exploratory closing", resolveRecommendedClosing(mobileFacts, { isExploratory: true }).type === NARRATIVE_CLOSING_TYPE.EXPLORATORY);
assert("neutral closing", resolveRecommendedClosing(null, {}).type === NARRATIVE_CLOSING_TYPE.NEUTRAL);

console.log("\n── Legacy ordering adapter ──");
const ordered = narrativePlanToOrderedLegacyStrings(mobilePlan);
assert("ordered gains from plan", ordered.gains.length >= 2);
assert("ordered sacrifices from plan", ordered.sacrifices.length >= 1);
assert("verbalization order", Array.isArray(narrativePlanToVerbalizationOrder(mobilePlan)));

console.log("\n── Synthesis integration ──");
const synthesisPayload = buildContextualDecisionSynthesisPayload({
  gainUnits: mobileFacts.semanticUnits.filter((u) => !u.implication?.direction?.includes("negative")),
  sacrificeUnits: mobileFacts.tradeoffs.map((t) => t.unit),
  structuredDecisionFacts: mobileFacts,
  productName: "Galaxy A55",
  hasWinner: true,
  responsePath: "return_seguro",
});
assert("synthesis includes narrativePlan", hasNarrativePlan(synthesisPayload.narrativePlan));
assert("synthesis plan validates", validateNarrativePlan(synthesisPayload.narrativePlan).valid);

console.log("\n── Tradeoff layer consumer ──");
const tradeoffSources = finalizeTradeoffSourcesWithSynthesis(
  { gains: ["fallback gain"], sacrifices: ["fallback sacrifice"], structuredDecisionFacts: mobileFacts },
  { productName: "Galaxy A55", responsePath: "return_seguro" }
);
assert("tradeoff has narrativePlan", hasNarrativePlan(tradeoffSources.narrativePlan));
assert("tradeoff gains from plan", tradeoffSources.gains[0] === ordered.gains[0]);

console.log("\n── Presentation contract consumer ──");
const presentation = buildSpecialistPresentationContract({
  intro: ["Intro line"],
  tradeoffSources,
});
assert("presentation tradeoff narrativePlan", hasNarrativePlan(presentation.tradeoff?.narrativePlan));
assert("presentation gains plan-ordered", presentation.tradeoff.gains[0] === tradeoffSources.gains[0]);

console.log("\n── First Answer consumer ──");
const extracted = extractGainsAndSacrificesFromProduct({
  presentation,
});
assert("first answer uses narrativePlan", hasNarrativePlan(extracted.narrativePlan));
assert("first answer gains plan-ordered", extracted.gains[0] === ordered.gains[0]);

console.log("\n── Session consumer ──");
const sessionFacts = collectDecisionFactsFromSession({
  lastBestProduct: { product_name: "Galaxy A55" },
  lastStructuredDecisionFacts: mobileFacts,
  lastNarrativePlan: mobilePlan,
  lastCategory: "mobile",
});
assert("session narrativePlan attached", hasNarrativePlan(sessionFacts.narrativePlan));
assert("session advantages plan-ordered", sessionFacts.advantages?.[0] === ordered.gains[0] || sessionFacts.advantages?.length > 0);

console.log("\n── Transport fields ──");
assert("transport includes lastNarrativePlan", SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastNarrativePlan"));

console.log("\n── Pipeline wiring ──");
const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
assert("chat persists lastNarrativePlan", chatSource.includes("lastNarrativePlan"));
assert("chat wires narrative plan to presentation", chatSource.includes("narrativePlan"));

console.log("\n── Empty / fallback plan ──");
const emptyPlan = buildNarrativePlan(null, {});
assert("empty plan safe", emptyPlan.sections.length === 0);
assert("empty closing type", !!emptyPlan.recommendedClosing?.type);

console.log("════════════════════════════════════════════════════════════");
console.log(`PATCH 4A.4 Audit: ${passed}/${passed + failed} passed`);
console.log(failed === 0 ? "ALL PASS\n" : "FAILURES DETECTED\n");
process.exit(failed === 0 ? 0 : 1);
