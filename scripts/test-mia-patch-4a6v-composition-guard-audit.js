/**
 * PATCH 4A.6V — Composition Guard Root-Cause Audit
 *
 * Usage: node scripts/test-mia-patch-4a6v-composition-guard-audit.js
 */

import { buildFirstAnswerStructuredReply } from "../lib/miaFirstAnswerResponseContract.js";
import { resolveComparativeRunnerUpReasoning } from "../lib/miaComparativeRunnerUpReasoning.js";
import {
  VERBALIZATION_COMPOSITION_GUARD_VERSION,
  buildMesmoComClosing,
  computeRepetitionMetrics,
  createCompositionLedger,
  dedupeGainBullets,
  detectBrokenSurfaceGrammar,
  detectInvalidConcessionGrammar,
  formatConcessionPhrase,
  guardComparativeParagraph,
  pickUnusedGain,
  formatCoherentBecauseClause,
  polishReplySurface,
  validateComposedSurface,
} from "../lib/miaVerbalizationCompositionGuard.js";
import { buildUserConfusionRecoveryReply } from "../lib/miaUserConfusionRecoveryLayer.js";
import { detectArtificialBecauseFragment } from "../lib/miaVerbalizationStyleGovernor.js";

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

console.log("\nPATCH 4A.6V — Composition Guard Root-Cause Audit\n");

console.log("── Version ──");
assert("schema version", VERBALIZATION_COMPOSITION_GUARD_VERSION === "4A.6V.2");

console.log("\n── Concession grammar ──");
const podePhrase = formatConcessionPhrase("Pode parecer menos fluida para quem veio de experiências mais rápidas.");
assert("pode → saber que", /^saber que pode/i.test(podePhrase));
const closing = buildMesmoComClosing({
  winner: "Galaxy A55 5G",
  tradeoff: "Pode parecer menos fluida para quem veio de experiências mais rápidas.",
  reason: "a autonomia costuma ser um ponto forte",
});
assert("closing uses Mesmo sabendo", /^Mesmo saber que/i.test(closing));
assert("no Mesmo com pode", !detectInvalidConcessionGrammar(closing).detected);

const broken = "Mesmo com pode parecer menos fluida, eu manteria o Galaxy A55.";
assert("detect broken Mesmo com pode", detectInvalidConcessionGrammar(broken).detected);

console.log("\n── Semantic slot dedup ──");
const ledger = createCompositionLedger();
pickUnusedGain(
  ["menos dependência do carregador no dia a dia", "visual mais confortável durante o uso prolongado"],
  ledger,
  0
);
const second = pickUnusedGain(
  ["menos dependência do carregador no dia a dia", "visual mais confortável durante o uso prolongado"],
  ledger,
  0
);
assert("second gain differs", /visual|confort/i.test(second));
const deduped = dedupeGainBullets(
  [
    "menos dependência do carregador no dia a dia",
    "visual mais confortável durante o uso prolongado",
  ],
  ledger
);
assert("deduped bullets shrink", deduped.length <= 2);

console.log("\n── Runner-up guard ──");
const guarded = guardComparativeParagraph(
  "Quase te recomendaria o S23 FE; no fim, fiquei com o A55 — a autonomia costuma ser um ponto forte, com menos idas ao carregador no dia a dia.",
  "a autonomia costuma ser um ponto forte, com menos idas ao carregador no dia a dia"
);
assert("runner-up trimmed when duplicate", guarded.length < 120 || !/autonomia costuma/i.test(guarded));

console.log("\n── First answer integration ──");
const reply = buildFirstAnswerStructuredReply({
  winnerName: "Galaxy A55 5G",
  query: "o Galaxy A55 vale a pena?",
  gains: [
    "menos dependência do carregador no dia a dia",
    "visual mais confortável durante o uso prolongado",
  ],
  sacrifices: ["Pode parecer menos fluida para quem veio de experiências mais rápidas."],
  comparativeParagraph:
    "Quase te recomendaria o Samsung Galaxy S23 FE; no fim, fiquei com o Galaxy A55 5G — a autonomia costuma ser um ponto forte, com menos idas ao carregador no dia a dia.",
});
assert("reply built", reply.length > 120);
assert("no Mesmo com pode", !detectInvalidConcessionGrammar(reply).detected);
assert("no artificial porque", !detectArtificialBecauseFragment(reply).detected);
const surface = validateComposedSurface(reply);
assert("surface validation", surface.pass, JSON.stringify(surface));

const metrics = computeRepetitionMetrics(reply);
assert("dominant phrase repeats controlled", metrics.dominantPhraseRepeats <= 1);

console.log("\n── Runner-up exclude anchor ──");
const runnerUp = resolveComparativeRunnerUpReasoning({
  query: "o Galaxy A55 vale a pena?",
  excludeSemanticAnchors: ["menos dependência do carregador"],
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
      trustedSpecs: { official_name: "Galaxy A55 5G", strengths: ["menos dependência do carregador no dia a dia"] },
      scoreEngine: { scores: { battery: 82, performance: 70 } },
    },
    {
      product_name: "Samsung Galaxy S23 FE",
      trustedSpecs: { official_name: "Samsung Galaxy S23 FE", strengths: ["câmera confiável"] },
      scoreEngine: { scores: { battery: 75, performance: 78 } },
    },
  ],
  primaryAxis: "battery",
});
assert("runner-up applied", runnerUp.applied === true);
assert(
  "runner-up avoids excluded anchor",
  !/menos dependência do carregador/i.test(runnerUp.reason || "")
);

console.log("\n── Last-mile polish ──");
const rawConfusion =
  "Em uma frase: escolhi Galaxy A55 5G porque menos dependência do carregador no dia a dia Por isso continuo recomendando o Galaxy A55 5G.";
const polishedConfusion = polishReplySurface(rawConfusion);
assert("polish removes porque menos", !detectArtificialBecauseFragment(polishedConfusion).detected);
const confusionReply = buildUserConfusionRecoveryReply({
  sessionContext: { lastBestProduct: { product_name: "Galaxy A55 5G" } },
  allowedProducts: [{ product_name: "Galaxy A55 5G" }],
  explanationCtx: { lastConsequence: "menos dependência do carregador no dia a dia" },
});
assert("confusion recovery no porque menos", !detectArtificialBecauseFragment(confusionReply).detected);
assert("coherent because clause", /continua coerente aqui —/i.test(formatCoherentBecauseClause("Galaxy A55", "menos dependência do carregador")));

console.log(`\nPATCH 4A.6V Composition Guard: ${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
console.log("ALL PASS");
