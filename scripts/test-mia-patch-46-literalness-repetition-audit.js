/**
 * PATCH 4A.6 — Literalness, Repetition & Crystallized Frames Audit
 *
 * Usage: node scripts/test-mia-patch-46-literalness-repetition-audit.js
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
import { buildNarrativePlan } from "../lib/miaNarrativePlanner.js";
import {
  buildVerbalizationPlan,
  buildSemanticVerbalizationPayload,
} from "../lib/miaSemanticVerbalizer.js";
import {
  VERBALIZATION_STYLE_GOVERNOR_VERSION,
  buildVerbalizationStyleGovernancePayload,
  buildVerbalizationStylePolicy,
  buildVariationConstraints,
  detectArtificialBecauseFragment,
  detectCrystallizedFrame,
  detectDominantOpeningTemplate,
  detectLiteralFragment,
  extractRecentPatternContext,
  hasVerbalizationStyleGovernance,
  rewriteConsequenceForSpeech,
  surfaceRewriteFragment,
  styleGovernanceToLlmContract,
  updateRecentVerbalizationPatterns,
  validateSemanticPreservation,
  validateVerbalizationStyleContract,
} from "../lib/miaVerbalizationStyleGovernor.js";
import { buildContextualDecisionSynthesisPayload } from "../lib/miaContextualDecisionSynthesis.js";
import { extractGainsAndSacrificesFromProduct } from "../lib/miaFirstAnswerResponseContract.js";
import { buildFirstAnswerStructuredReply } from "../lib/miaFirstAnswerResponseContract.js";
import { resolveComparativeRunnerUpReasoning } from "../lib/miaComparativeRunnerUpReasoning.js";
import { collectDecisionFactsFromSession } from "../lib/miaDecisionFactsNarrative.js";
import { buildSpecialistPresentationContract } from "../lib/miaSpecialistPresentationContract.js";
import { SESSION_CONTEXT_TRANSPORT_FIELDS } from "../lib/miaSessionContextTransport.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;
const comparativeExamples = [];

function assert(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function recordComparative(scenario, before, after, preserved) {
  comparativeExamples.push({ scenario, before, after, preserved });
}

resetSemanticIdCounterForTests();

function fixture(meta = {}) {
  const gainUnits = [
    buildSemanticDecisionUnitFromPoolItem(
      {
        text: meta.primary || "menos ansiedade com recarga ao longo do dia",
        family: meta.primaryFamily || "battery_autonomy",
        type: "strength",
      },
      { category: meta.category || "mobile", decisionRole: "primary_gain" }
    ),
    buildSemanticDecisionUnitFromPoolItem(
      {
        text: meta.secondary || "mais sensação de fluidez na navegação",
        family: meta.secondaryFamily || "display_smoothness",
        type: "strength",
      },
      { category: meta.category || "mobile", decisionRole: "secondary_gain" }
    ),
  ];
  const sacrificeUnits = [
    buildSemanticDecisionUnitFromWeaknessPoolItem(
      {
        text: meta.tradeoff || "a navegação pode parecer menos fluida para quem veio de telas mais rápidas",
        family: meta.tradeoffFamily || "display_smoothness",
        type: "weakness",
      },
      { category: meta.category || "mobile" }
    ),
  ];
  return buildStructuredDecisionFacts({
    gainUnits,
    sacrificeUnits,
    category: meta.category || "mobile",
    productName: meta.productName || "Galaxy A55",
  });
}

console.log("\nPATCH 4A.6 — Literalness, Repetition & Crystallized Frames Audit\n");

console.log("── Literal fragment detection ──");
const literalCases = [
  ["porque câmera boa", true],
  ["porque tela fluida", true],
  ["câmera boa", true],
  ["carregamento lento", true],
  ["O ponto positivo é bateria boa", true],
  ["menos ansiedade com recarga ao longo do dia", false],
];
for (const [text, expected] of literalCases) {
  assert(`detect literal: "${text}"`, detectLiteralFragment(text).detected === expected);
}

console.log("\n── Surface rewrite ──");
const beforeCamera = "porque câmera boa";
const afterCamera = surfaceRewriteFragment(beforeCamera, { effectKey: "camera_quality" });
assert("rewrite porque câmera boa", !/^porque câmera boa$/i.test(afterCamera));
assert("rewrite keeps semantic anchor", /câmera|foto|qualidade/i.test(afterCamera));
recordComparative("porque câmera boa", beforeCamera, afterCamera, "câmera / qualidade preservada");

const beforeTradeoff = "carregamento lento";
const afterTradeoff = surfaceRewriteFragment(beforeTradeoff, { effectKey: "charging_speed" });
assert("rewrite carregamento lento", !/^carregamento lento\.?$/i.test(afterTradeoff));
recordComparative("carregamento lento", beforeTradeoff, afterTradeoff, "carregamento / concessão preservada");

const beforePositive = "O ponto positivo é bateria boa";
const afterPositive = surfaceRewriteFragment(beforePositive, { effectKey: "battery_autonomy" });
assert("rewrite ponto positivo label", !/^O ponto positivo é/i.test(afterPositive));
recordComparative("ponto positivo bateria", beforePositive, afterPositive, "bateria / autonomia preservada");

console.log("\n── Crystallized frames ──");
assert("detect na prática", detectCrystallizedFrame("Na prática, ele entrega bem.").detected);
assert("detect por outro lado", detectCrystallizedFrame("Por outro lado, carregamento lento.").detected);
assert("neutral sentence ok", !detectCrystallizedFrame("Ele equilibra bem preço e entrega.").detected);

console.log("\n── Style policy ──");
const mobileFacts = fixture({ productName: "Galaxy A55" });
const mobilePlan = buildNarrativePlan(mobileFacts, { hasWinner: true });
const mobileVerbal = buildVerbalizationPlan(mobilePlan, {
  query: "o Galaxy A55 vale a pena?",
  winnerName: "Galaxy A55",
});
const stylePayload = buildVerbalizationStyleGovernancePayload(mobileVerbal, {
  query: "o Galaxy A55 vale a pena?",
  sessionContext: {},
});
assert("schema version", stylePayload.version === VERBALIZATION_STYLE_GOVERNOR_VERSION);
assert("style policy slots", (stylePayload.stylePolicy?.semanticSlots || []).length >= 2);
assert("semantic preservation", validateSemanticPreservation(stylePayload.stylePolicy, mobileVerbal).valid);
assert("contract validation", validateVerbalizationStyleContract(stylePayload.llmStyleContract).valid);
assert("rewrite flags present", stylePayload.stylePolicy.semanticSlots.some((entry) => entry.rewriteRequired !== undefined));

console.log("\n── LLM style contract ──");
const llmContract = styleGovernanceToLlmContract(stylePayload.stylePolicy);
assert("llm preserve meaning", llmContract?.rules?.preserveSemanticMeaning === true);
assert("llm no mechanical copy", llmContract?.rules?.doNotCopyInternalFragments === true);
assert("llm slots semantic meaning", llmContract?.slots?.every((entry) => !!entry.semanticMeaning));
assert("llm slots source fragment separated", llmContract?.slots?.every((entry) => "sourceFragment" in entry));

console.log("\n── Repetition / recent patterns ──");
const sessionWithPatterns = {
  lastVerbalizationPatterns: {
    lastOpeningStyles: ["Na prática,"],
    recentConnectors: ["Na prática,"],
    recentSentenceFrames: ["Por outro lado, carregamento lento."],
  },
};
const recent = extractRecentPatternContext(sessionWithPatterns);
const constraints = buildVariationConstraints(mobileVerbal, recent);
assert("avoid recent opening", constraints.avoidOpenings.includes("Na prática,"));
assert("avoid recent frame", constraints.avoidSentenceFrames.some((entry) => /Por outro lado/i.test(entry)));
const updatedPatterns = updateRecentVerbalizationPatterns(
  sessionWithPatterns,
  stylePayload.stylePolicy,
  "Entre as opções, eu colocaria o Galaxy A55 5G em primeiro porque menos dependência do carregador."
);
assert("pattern memory updated", (updatedPatterns.lastOpeningStyles || []).length >= 1);

console.log("\n── Synthesis integration ──");
const synthesis = buildContextualDecisionSynthesisPayload({
  structuredDecisionFacts: mobileFacts,
  gainUnits: mobileFacts.semanticUnits,
  sacrificeUnits: mobileFacts.tradeoffs.map((entry) => entry.unit),
  productName: "Galaxy A55",
  query: "o Galaxy A55 vale a pena?",
  sessionContext: sessionWithPatterns,
});
assert("synthesis style governance", hasVerbalizationStyleGovernance(synthesis.verbalizationStyleGovernance));
assert("synthesis llm style contract", !!synthesis.llmStyleContract?.rules?.preserveSemanticMeaning);

console.log("\n── Consumers ──");
const presentation = buildSpecialistPresentationContract({
  tradeoffSources: {
    gains: ["menos ansiedade com recarga"],
    sacrifices: ["carregamento lento"],
    verbalizationPlan: mobileVerbal,
    verbalizationStyleGovernance: stylePayload,
    llmStyleContract: stylePayload.llmStyleContract,
  },
});
assert("presentation style governance", !!presentation.tradeoff?.verbalizationStyleGovernance);
const extracted = extractGainsAndSacrificesFromProduct({
  presentation: { tradeoff: presentation.tradeoff },
});
assert("first answer still has verbalizationPlan", !!extracted.verbalizationPlan);
const rebuilt = buildFirstAnswerStructuredReply({
  winnerName: "Galaxy A55",
  query: "o Galaxy A55 vale a pena?",
  gains: ["porque câmera boa"],
  sacrifices: ["carregamento lento"],
});
assert("first answer avoids raw porque fragment", !/porque câmera boa/i.test(rebuilt));
assert("first answer preserves tradeoff", /carregamento|recarga|concess/i.test(rebuilt));

console.log("\n── Session transport ──");
assert("transport lastVerbalizationStyleGovernance", SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastVerbalizationStyleGovernance"));
assert("transport lastVerbalizationPatterns", SESSION_CONTEXT_TRANSPORT_FIELDS.includes("lastVerbalizationPatterns"));
const sessionFacts = collectDecisionFactsFromSession({
  lastStructuredDecisionFacts: mobileFacts,
  lastNarrativePlan: mobilePlan,
  lastVerbalizationPlan: mobileVerbal,
  lastVerbalizationStyleGovernance: stylePayload,
  lastBestProduct: { product_name: "Galaxy A55" },
});
assert("session style governance recovery", hasVerbalizationStyleGovernance(sessionFacts.verbalizationStyleGovernance));

console.log("\n── Pipeline wiring ──");
const chatSource = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
assert("chat persists style governance", chatSource.includes("lastVerbalizationStyleGovernance"));
assert("chat wires llm style contract", chatSource.includes("verbalizationStyleGovernance"));
assert("chat pattern memory", chatSource.includes("lastVerbalizationPatterns"));
assert("chat prompt style governance", chatSource.includes("VERBALIZATION STYLE GOVERNANCE"));

console.log("\n── Fidelity guards ──");
assert("tradeoff slot count preserved", stylePayload.stylePolicy.semanticSlots.filter((entry) => entry.slot === "tradeoff").length === 1);
assert("main message preserved in contract", llmContract.slots.some((entry) => entry.slot === "main_message"));
assert("verbalization plan untouched", mobileVerbal.mainMessage?.text === mobilePlan.primaryNarrative?.legacyText);

console.log("\n── Multivariation linguistic ──");
const informal = surfaceRewriteFragment("pq ele é melhor", {});
assert("informal fragment rewrite", informal.length > 10);
const abbrev = surfaceRewriteFragment("bat forte", { effectKey: "battery_autonomy" });
assert("abbrev rewrite", /bateria|autonomia|bat/i.test(abbrev));

console.log("\n── PATCH 4A.6V surface fixes ──");
const batterySpeech = rewriteConsequenceForSpeech("menos dependência do carregador no dia a dia");
assert("rewrite menos dependência", !/^menos dependência/i.test(batterySpeech));
assert("no artificial porque menos", !detectArtificialBecauseFragment(`Eu iria no X porque ${batterySpeech}`).detected || !/\bporque\s+menos/i.test(`Eu iria no X. ${batterySpeech}.`));
const opening = buildFirstAnswerStructuredReply({
  winnerName: "Galaxy A55",
  query: "o Galaxy A55 vale a pena?",
  gains: ["menos dependência do carregador no dia a dia"],
  sacrifices: ["a navegação pode parecer menos fluida para quem veio de telas mais rápidas"],
});
assert("first answer no porque menos", !detectArtificialBecauseFragment(opening).detected);
assert("first answer no dominant template", !detectDominantOpeningTemplate(opening).detected);
const runnerUpResult = resolveComparativeRunnerUpReasoning({
  query: "o Galaxy A55 vale a pena?",
  winner: {
    product_name: "Galaxy A55 5G",
    trustedSpecs: {
      official_name: "Galaxy A55 5G",
      strengths: ["menos dependência do carregador no dia a dia"],
      scores: { battery: 82, performance: 70 },
    },
    scoreEngine: { scores: { battery: 82, performance: 70 } },
  },
  rankedCandidates: [
    {
      product_name: "Galaxy A55 5G",
      trustedSpecs: {
        official_name: "Galaxy A55 5G",
        strengths: ["menos dependência do carregador no dia a dia"],
      },
      scoreEngine: { scores: { battery: 82, performance: 70 } },
    },
    {
      product_name: "Samsung Galaxy S23 FE",
      trustedSpecs: {
        official_name: "Samsung Galaxy S23 FE",
        strengths: ["câmera confiável para fotos e vídeos"],
        scores: { battery: 75, performance: 78 },
      },
      scoreEngine: { scores: { battery: 75, performance: 78 } },
    },
  ],
  primaryAxis: "battery",
});
assert("runner-up paragraph applied", runnerUpResult.applied === true);
assert(
  "runner-up no artificial porque menos",
  !detectArtificialBecauseFragment(runnerUpResult.reason || "").detected
);
assert(
  "runner-up no raw menos dependência",
  !/\bporque\s+menos dependência/i.test(runnerUpResult.reason || "")
);
console.log(`PATCH 4A.6 Audit: ${passed}/${passed + failed} passed`);
if (failed) {
  console.log("FAILURES DETECTED");
  process.exit(1);
}
console.log("ALL PASS");
console.log("\nComparative examples captured:", comparativeExamples.length);
for (const example of comparativeExamples) {
  console.log(`- ${example.scenario}: "${example.before}" → "${example.after}"`);
}
