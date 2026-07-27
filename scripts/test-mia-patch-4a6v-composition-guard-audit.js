/**
 * PATCH 4A.6V.3 — Composition Guard Final Closure Audit
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
  detectInternalLabelLeakage,
  detectInvalidConcessionGrammar,
  expandStubContinuationReply,
  formatConcessionPhrase,
  formatContextualConcessionOpening,
  guardComparativeParagraph,
  pickUnusedGain,
  formatCoherentBecauseClause,
  polishReplySurface,
  sanitizeInternalLabelText,
  validateComposedSurface,
  detectAbsoluteClaimsOnSurface,
  governAbsoluteClaimsOnSurface,
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

console.log("\nPATCH 4A.6V.3 — Composition Guard Final Closure Audit\n");

console.log("── Version ──");
assert("schema version", VERBALIZATION_COMPOSITION_GUARD_VERSION === "4A.7V.0");

console.log("\n── Concession grammar ──");
const podePhrase = formatConcessionPhrase("Pode parecer menos fluida para quem veio de experiências mais rápidas.");
assert("pode → sabendo que", /^sabendo que pode/i.test(podePhrase));
const contextual = formatContextualConcessionOpening(
  "Pode parecer menos fluida para quem veio de experiências mais rápidas.",
  "Galaxy A55"
);
assert("contextual concession valid", /^(Mesmo sabendo que|Embora possa|Ainda que possa)/i.test(contextual));
const closing = buildMesmoComClosing({
  winner: "Galaxy A55 5G",
  tradeoff: "Pode parecer menos fluida para quem veio de experiências mais rápidas.",
  reason: "a autonomia costuma ser um ponto forte",
  seed: "Galaxy A55",
});
assert("closing uses gerund concession", /^(Mesmo sabendo que|Embora possa|Ainda que possa)/i.test(closing));
assert("no Mesmo com pode", !detectInvalidConcessionGrammar(closing).detected);
assert("no Mesmo saber infinitive", !/\bmesmo saber que\b/i.test(closing));

const broken = "Mesmo com pode parecer menos fluida, eu manteria o Galaxy A55.";
assert("detect broken Mesmo com pode", detectInvalidConcessionGrammar(broken).detected);
const polishedBroken = polishReplySurface(broken);
assert("polish repairs Mesmo com pode", !detectInvalidConcessionGrammar(polishedBroken).detected);

console.log("\n── Absolute claim governance ──");
const absoluteReply = "Depende do contexto! É sempre bom avaliar o que é mais relevante.";
assert("detect absolute claim", detectAbsoluteClaimsOnSurface(absoluteReply).detected);
const governedAbsolute = governAbsoluteClaimsOnSurface(absoluteReply);
assert("govern removes sempre", !detectAbsoluteClaimsOnSurface(governedAbsolute).detected);
assert("govern hedges sempre bom", /costuma ser bom|em geral/i.test(governedAbsolute));
const polishedAbsolute = polishReplySurface(absoluteReply);
assert("polish governs absolute claims", !detectAbsoluteClaimsOnSurface(polishedAbsolute).detected);
const contestationLeak = "É sempre bom encontrar algo que se encaixe no que você busca.";
assert("detect contestation leak", detectAbsoluteClaimsOnSurface(contestationLeak).detected);
assert(
  "polish contestation leak",
  !detectAbsoluteClaimsOnSurface(polishReplySurface(contestationLeak)).detected
);

console.log("\n── Internal label leakage ──");
const labelLeak = "Pode pesar na decisão: pesado";
assert("detect label leak", detectInternalLabelLeakage(labelLeak).detected);
const sanitizedLabel = sanitizeInternalLabelText(labelLeak);
assert("sanitize label leak", !detectInternalLabelLeakage(sanitizedLabel).detected);
assert("sanitized label humanized", /peso|uso prolongado/i.test(sanitizedLabel));

console.log("\n── Continuity stubs ──");
const stub = expandStubContinuationReply("Pode continuar.", {
  lastBestProduct: { product_name: "Galaxy A55 5G" },
  explanationCtx: { lastConsequence: "menos dependência do carregador no dia a dia" },
});
assert("stub expanded", stub.length >= 40);
assert("stub references product", /Galaxy A55/i.test(stub));
const polishedStub = polishReplySurface("Claro, vamos continuar!", {
  sessionContext: {
    lastBestProduct: { product_name: "Galaxy A55 5G" },
    lastMainConsequence: "menos dependência do carregador no dia a dia",
  },
});
assert("polish expands vamos continuar stub", polishedStub.length >= 40);

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
assert("semantic axis repetition controlled", Object.values(metrics.semanticAxisCounts || {}).every((c) => c < 4));

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

console.log(`\nPATCH 4A.6V.3 Composition Guard: ${passed}/${passed + failed} passed`);
if (failed) process.exit(1);
console.log("ALL PASS");
