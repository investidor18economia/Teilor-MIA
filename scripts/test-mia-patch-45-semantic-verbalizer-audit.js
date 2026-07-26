/**
 * PATCH 4A.5 — Semantic Verbalizer Audit
 *
 * Usage: node scripts/test-mia-patch-45-semantic-verbalizer-audit.js
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resetSemanticIdCounterForTests } from "../lib/miaSemanticDecisionContract.js";
import {
  buildSemanticDecisionUnitFromPoolItem,
  buildSemanticDecisionUnitFromWeaknessPoolItem,
} from "../lib/miaSemanticDecisionBridge.js";
import { buildStructuredDecisionFacts } from "../lib/miaStructuredDecisionFacts.js";
import {
  buildNarrativePlan,
  hasNarrativePlan,
  validateNarrativePlan,
} from "../lib/miaNarrativePlanner.js";
import {
  SEMANTIC_VERBALIZER_VERSION,
  VERBALIZATION_PROFILE,
  buildSemanticVerbalizationPayload,
  buildVerbalizationPlan,
  hasVerbalizationPlan,
  resolveVerbalizationProfile,
  validateVerbalizationPlan,
  verbalizationPlanToLlmContract,
  verbalizationPlanToOrderedLegacyStrings,
} from "../lib/miaSemanticVerbalizer.js";
import { buildContextualDecisionSynthesisPayload } from "../lib/miaContextualDecisionSynthesis.js";
import { extractGainsAndSacrificesFromProduct } from "../lib/miaFirstAnswerResponseContract.js";
import { collectDecisionFactsFromSession } from "../lib/miaDecisionFactsNarrative.js";
import { buildSpecialistPresentationContract } from "../lib/miaSpecialistPresentationContract.js";
import { SESSION_CONTEXT_TRANSPORT_FIELDS } from "../lib/miaSessionContextTransport.js";

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

function fixture(meta = {}) {
  const gainUnits = [
    buildSemanticDecisionUnitFromPoolItem(
      {
        text: meta.primary || "menos ansiedade com recarga ao longo do dia",
        family: "battery_autonomy",
        type: "strength",
      },
      { category: meta.category || "mobile", decisionRole: "primary_gain" }
    ),
    buildSemanticDecisionUnitFromPoolItem(
      {
        text: meta.secondary || "mais sensação de fluidez na navegação",
        family: "display_smoothness",
        type: "strength",
      },
      { category: meta.category || "mobile", decisionRole: "secondary_gain" }
    ),
  ];
  const sacrificeUnits = [
    buildSemanticDecisionUnitFromWeaknessPoolItem(
      {
        text: meta.tradeoff || "a navegação pode parecer menos fluida para quem veio de telas mais rápidas",
        family: "display_smoothness",
        type: "weakness",
      },
      { category: meta.category || "mobile" }
    ),
  ];
  return buildStructuredDecisionFacts({
    gainUnits,
    sacrificeUnits,
    category: meta.category || "mobile",
    productName: meta.productName || "Fixture",
  });
}

console.log("\nPATCH 4A.5 — Semantic Verbalizer Audit\n");

console.log("── Core VerbalizationPlan ──");
const mobileFacts = fixture({ category: "mobile", productName: "Galaxy A55" });
const mobilePlan = buildNarrativePlan(mobileFacts, { hasWinner: true });
const mobileVerbal = buildVerbalizationPlan(mobilePlan, {
  query: "o Galaxy A55 vale a pena?",
  winnerName: "Galaxy A55",
});
assert("schema version", mobileVerbal.schemaVersion === SEMANTIC_VERBALIZER_VERSION);
assert("main message preserved", mobileVerbal.mainMessage?.text === mobilePlan.primaryNarrative?.legacyText);
assert("tradeoffs preserved", mobileVerbal.tradeoffs[0]?.text === mobilePlan.tradeoffs[0]?.legacyText);
assert("validation passes", validateVerbalizationPlan(mobileVerbal, mobilePlan).valid);
assert("narrative plan untouched", validateNarrativePlan(mobilePlan).valid);
assert("llm contract mustPreserveFacts", mobileVerbal.llmContract?.mustPreserveFacts === true);

console.log("\n── Variation profiles ──");
assert("direct profile", resolveVerbalizationProfile({ query: "A55 vale a pena?" }).profile === VERBALIZATION_PROFILE.DIRECT);
assert("exploratory profile", resolveVerbalizationProfile({ query: "quero um celular bom e equilibrado para usar no dia a dia sem me preocupar" }).profile === VERBALIZATION_PROFILE.EXPLORATORY);
assert("reassuring profile", resolveVerbalizationProfile({ query: "tenho medo de me arrepender", querySignals: { regretFear: true } }).profile === VERBALIZATION_PROFILE.REASSURING);
assert("profiles differ by context", resolveVerbalizationProfile({ query: "A55?" }).profile !== resolveVerbalizationProfile({ query: "quero um celular bom e equilibrado para estudar e trabalhar fora de casa" }).profile);

console.log("\n── Category agnosticism ──");
const notebookFacts = fixture({
  category: "notebook",
  productName: "Vivobook",
  primary: "menor preocupação com recarga durante jornadas longas",
  secondary: "mais folga para multitarefa",
  tradeoff: "peso extra pode incomodar no transporte diário",
});
const notebookVerbal = buildVerbalizationPlan(buildNarrativePlan(notebookFacts, { hasWinner: true }), {
  query: "notebook para faculdade",
});
assert("notebook same schema", notebookVerbal.schemaVersion === mobileVerbal.schemaVersion);
assert("notebook facts preserved", validateVerbalizationPlan(notebookVerbal, buildNarrativePlan(notebookFacts, { hasWinner: true })).valid);

console.log("\n── Synthesis integration ──");
const synthesis = buildContextualDecisionSynthesisPayload({
  structuredDecisionFacts: mobileFacts,
  gainUnits: mobileFacts.semanticUnits,
  productName: "Galaxy A55",
  query: "Galaxy A55 ou S23 FE?",
  hasWinner: true,
  responsePath: "return_seguro",
});
assert("synthesis verbalizationPlan", hasVerbalizationPlan(synthesis.verbalizationPlan));
assert("synthesis llm contract", !!synthesis.llmVerbalizationContract?.llmCanOnlyVerbalize);

console.log("\n── Consumers ──");
const tradeoffSources = {
  gains: ["fallback"],
  sacrifices: ["fallback sacrifice"],
  structuredDecisionFacts: mobileFacts,
  narrativePlan: mobilePlan,
  verbalizationPlan: mobileVerbal,
};
const presentation = buildSpecialistPresentationContract({ tradeoffSources });
assert("presentation verbalizationPlan", hasVerbalizationPlan(presentation.tradeoff?.verbalizationPlan));
const extracted = extractGainsAndSacrificesFromProduct({ presentation });
assert("first answer verbalizationPlan", hasVerbalizationPlan(extracted.verbalizationPlan));
assert("first answer facts from plan", extracted.gains[0] === mobileVerbal.mainMessage?.text);

const sessionFacts = collectDecisionFactsFromSession({
  lastBestProduct: { product_name: "Galaxy A55" },
  lastStructuredDecisionFacts: mobileFacts,
  lastNarrativePlan: mobilePlan,
  lastVerbalizationPlan: mobileVerbal,
});
assert("session verbalizationPlan", hasVerbalizationPlan(sessionFacts.verbalizationPlan));

console.log("\n── LLM contract ──");
const llm = verbalizationPlanToLlmContract(mobileVerbal);
assert("llm slots", Array.isArray(llm?.slots) && llm.slots.length >= 2);
assert("llm section order", Array.isArray(llm?.sectionOrder));

console.log("\n── Transport & pipeline ──");
assert("transport lastVerbalizationPlan", SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastVerbalizationPlan"));
const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
assert("chat persists lastVerbalizationPlan", chatSource.includes("lastVerbalizationPlan"));
assert("chat wires verbalizationPlan", chatSource.includes("verbalizationPlan"));

console.log("\n── Empty plan safe ──");
const emptyVerbal = buildVerbalizationPlan(null, {});
assert("empty plan safe", !emptyVerbal.mainMessage && emptyVerbal.sections.length === 0);

console.log("\n── Payload helper ──");
const payload = buildSemanticVerbalizationPayload(mobilePlan, { query: "test" });
assert("payload validation", payload.validation.valid);
assert("payload legacy ordered", verbalizationPlanToOrderedLegacyStrings(payload.verbalizationPlan).gains.length >= 1);

console.log("════════════════════════════════════════════════════════════");
console.log(`PATCH 4A.5 Audit: ${passed}/${passed + failed} passed`);
console.log(failed === 0 ? "ALL PASS\n" : "FAILURES DETECTED\n");
process.exit(failed === 0 ? 0 : 1);
