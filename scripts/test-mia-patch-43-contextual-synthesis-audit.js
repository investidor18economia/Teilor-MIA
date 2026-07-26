/**
 * PATCH 4A.3 — Contextual Decision Synthesis Audit
 *
 * Usage: node scripts/test-mia-patch-43-contextual-synthesis-audit.js
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { resetSemanticIdCounterForTests } from "../lib/miaSemanticDecisionContract.js";
import {
  buildSemanticDecisionUnitFromPoolItem,
  buildSemanticDecisionUnitFromWeaknessPoolItem,
} from "../lib/miaSemanticDecisionBridge.js";
import {
  CONTEXTUAL_DECISION_SYNTHESIS_VERSION,
  DECISION_FACT_SOURCE,
  buildContextualDecisionSynthesisPayload,
  buildSemanticUnitsFromConsequenceStrings,
  buildSemanticUnitsFromTrustedSpecs,
  finalizeTradeoffSourcesWithSynthesis,
  synthesizeContextualDecisionFacts,
} from "../lib/miaContextualDecisionSynthesis.js";
import {
  buildStructuredDecisionFacts,
  validateStructuredDecisionFacts,
} from "../lib/miaStructuredDecisionFacts.js";
import { resolveTradeoffCommunicationSources } from "../lib/miaTradeoffCommunicationLayer.js";
import { collectDecisionFactsFromSession } from "../lib/miaDecisionFactsNarrative.js";
import { extractGainsAndSacrificesFromProduct } from "../lib/miaFirstAnswerResponseContract.js";
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

const MOBILE_SPECS = {
  official_name: "Galaxy A55 5G",
  category: "phone",
  strengths: ["Bateria de longa duração", "Tela fluida de 120Hz"],
  weaknesses: ["Preço acima de rivais diretos"],
  ideal_for: ["Uso intenso fora de casa"],
  avoid_if: ["Orçamento muito apertado"],
};

const gainItem = {
  text: "mais autonomia prática longe da tomada",
  family: "battery_autonomy",
  type: "strength",
  token: "bateria_consistente",
};

const sacrificeItem = {
  text: "preço mais alto que alguns rivais",
  family: "price_value_risk",
  type: "weakness",
  token: "preco_acima",
};

console.log("\nPATCH 4A.3 — Contextual Decision Synthesis Audit\n");

console.log("── Data Layer path ──");
const gainUnit = buildSemanticDecisionUnitFromPoolItem(gainItem, { productName: "Galaxy A55 5G" });
const sacrificeUnit = buildSemanticDecisionUnitFromWeaknessPoolItem(sacrificeItem, {
  productName: "Galaxy A55 5G",
});
const dataLayerStructured = buildStructuredDecisionFacts({
  gainUnits: [gainUnit],
  sacrificeUnits: [sacrificeUnit],
  productName: "Galaxy A55 5G",
  category: "phone",
  primaryAxis: "battery",
});
assert("Data Layer produces StructuredDecisionFacts", dataLayerStructured.primaryGain?.unitId);
assert("legacy.isPrimaryTruth === false", dataLayerStructured.legacy?.isPrimaryTruth === false);

console.log("\n── Commercial / fallback strings ──");
const fromStrings = synthesizeContextualDecisionFacts({
  gainStrings: ["menos barreira inicial para fechar a compra"],
  sacrificeStrings: ["menos folga de desempenho em apps pesados"],
  productName: "Samsung Galaxy S23 FE",
  category: "phone",
  sourceOrigin: DECISION_FACT_SOURCE.COMMERCIAL,
});
assert("commercial strings synthesize units", fromStrings.gainUnits.length >= 1);
assert("commercial strings produce structured facts", !!fromStrings.structuredDecisionFacts?.primaryGain);

console.log("\n── Specs path ──");
const fromSpecs = buildSemanticUnitsFromTrustedSpecs({
  trustedSpecs: MOBILE_SPECS,
  context: { productName: "Galaxy A55 5G", category: "phone" },
});
assert("specs produce gain units", fromSpecs.gainUnits.length >= 1);
assert("specs produce sacrifice units", fromSpecs.sacrificeUnits.length >= 1);

console.log("\n── Fallback tradeoff resolver ──");
const fallbackSources = resolveTradeoffCommunicationSources({
  structuredFacts: {
    strengthConsequences: ["Boa autonomia para o dia a dia"],
    weaknessConsequences: ["Câmera não lidera a categoria"],
    idealForConsequences: [],
    avoidIfConsequences: [],
  },
  searchCognition: { primaryAxis: "battery" },
  decisionMemory: {},
  productName: "Moto G84",
  category: "phone",
  sourceOrigin: "fallback",
});
assert("fallback resolver attaches structuredDecisionFacts", !!fallbackSources.structuredDecisionFacts);
assert("fallback legacy not primary truth", fallbackSources.structuredDecisionFacts?.legacy?.isPrimaryTruth !== true);

console.log("\n── Session recovery ──");
const sessionPayload = buildContextualDecisionSynthesisPayload({
  sessionContext: {
    lastStructuredDecisionFacts: dataLayerStructured,
    lastBestProduct: { product_name: "Galaxy A55 5G" },
    lastCategory: "phone",
  },
  productName: "Galaxy A55 5G",
});
const sessionFacts = collectDecisionFactsFromSession({
  lastStructuredDecisionFacts: dataLayerStructured,
  lastBestProduct: { product_name: "Galaxy A55 5G" },
  lastCategory: "phone",
  lastMainConsequence: "legado antigo",
  lastWinnerAdvantages: ["legado"],
});
assert("session uses lastStructuredDecisionFacts", sessionFacts.structured?.primaryGain?.unitId);
assert("session structured overrides legacy string", sessionFacts.mainConsequence !== "legado antigo" || !!sessionFacts.structured);

console.log("\n── Adapter compatibility ──");
assert(
  "structured legacy adapter present",
  dataLayerStructured.legacy?.adapterVersion && dataLayerStructured.legacy?.isPrimaryTruth === false
);
const validation = validateStructuredDecisionFacts(dataLayerStructured);
assert("structured validation passes", validation.valid);

console.log("\n── First Answer consumer ──");
const firstAnswerExtract = extractGainsAndSacrificesFromProduct({
  product_name: "Galaxy A55 5G",
  trustedSpecs: MOBILE_SPECS,
  presentation: {
    tradeoff: {
      structuredDecisionFacts: dataLayerStructured,
      gains: dataLayerStructured.legacy.advantages,
      sacrifices: dataLayerStructured.legacy.sacrifices,
    },
  },
});
assert(
  "First Answer prefers presentation structured facts",
  firstAnswerExtract.gains[0] === dataLayerStructured.legacy.advantages[0]
);

console.log("\n── Transport fields ──");
assert("session transport includes semantic units", SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastSemanticDecisionUnits"));
assert("session transport includes structured facts", SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastStructuredDecisionFacts"));

console.log("\n── Pipeline wiring ──");
const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
assert("chat persists lastStructuredDecisionFacts", chatSource.includes("lastStructuredDecisionFacts"));
assert("chat uses contextual synthesis", chatSource.includes("buildContextualDecisionSynthesisPayload"));

console.log("\n── Generalization (notebook) ──");
const notebookSpecs = {
  official_name: "Notebook Gamer LOQ-e",
  category: "notebook",
  strengths: ["Desempenho estável em jogos leves"],
  weaknesses: ["Autonomia limitada fora da tomada"],
};
const notebookSynth = synthesizeContextualDecisionFacts({
  trustedSpecs: notebookSpecs,
  productName: "Notebook Gamer LOQ-e",
  category: "notebook",
  sourceOrigin: DECISION_FACT_SOURCE.SPECS,
});
assert("notebook category synthesizes", !!notebookSynth.structuredDecisionFacts?.primaryGain);

console.log("\n── finalizeTradeoffSourcesWithSynthesis ──");
const finalized = finalizeTradeoffSourcesWithSynthesis(
  { gains: ["Ganho A"], sacrifices: ["Sacrifício B"] },
  { productName: "Produto X", category: "phone" }
);
assert("finalize adds structured facts", !!finalized.structuredDecisionFacts);

assert("synthesis version", CONTEXTUAL_DECISION_SYNTHESIS_VERSION === "4A.3.0");
assert("payload session fields", !!sessionPayload.sessionFields?.lastMainConsequence);

console.log(`\n${"═".repeat(60)}`);
console.log(`PATCH 4A.3 Audit: ${passed}/${passed + failed} passed`);
console.log(failed === 0 ? "ALL PASS\n" : "FAILURES DETECTED\n");
process.exit(failed === 0 ? 0 : 1);
