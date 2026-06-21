/**
 * PATCH 9.2I — Structure-Preserving Repetition Compression Audit
 *
 * Usage:
 *   node scripts/test-mia-structure-preserving-repetition-compression-audit.js
 *   MIA_SKIP_NESTED_REGRESSION=1 node scripts/test-mia-structure-preserving-repetition-compression-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { finalizeReplyWithSpecialistNarrative } from "../lib/miaSpecialistNarrativeEngine.js";
import {
  countParagraphBreaks,
  countParagraphUnits,
  finalizeReplyWithRepetitionCompression,
  REPETITION_COMPRESSION_GUARD_VERSION,
  safeCleanupPreservingParagraphs,
  shouldApplyRepetitionCompression,
  verifyStructurePreservation,
} from "../lib/miaRepetitionCompressionGuard.js";
import { finalizeReplyWithConversationalClosing } from "../lib/miaConversationalClosingEngine.js";
import {
  finalizeReplyWithTradeoffVisualEmphasis,
  hasVisualTradeoffEmphasis,
} from "../lib/miaTradeoffVisualEmphasisLayer.js";
import { splitAssistantParagraphs } from "../lib/miaFrontendParagraphRendering.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-repetition-compression-guard-audit.js",
  "test-mia-tradeoff-visual-emphasis-audit.js",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${label}`);
  }
}

function metrics(text = "") {
  return {
    len: text.length,
    paragraphs: splitAssistantParagraphs(text).length,
    doubleNewlines: countParagraphBreaks(text),
    hasCheck: /✅/.test(text),
    hasWarn: /⚠️/.test(text),
    hasGainHdr: /O que voc[eê] ganha/i.test(text),
    hasSacrificeHdr: /O que voc[eê] abre m[aã]o/i.test(text),
  };
}

function buildCelularPipeline() {
  const product = {
    product_name: "iPhone 13",
    isDataLayerProduct: true,
    trustedSpecs: {
      official_name: "iPhone 13",
      strengths: ["desempenho forte no dia a dia", "modelo forte para uso prolongado"],
      ideal_for: ["estabilidade"],
      weaknesses: ["tela 60 Hz"],
    },
    category: "celular",
  };

  const ctx = {
    query: "Celular até 2.000",
    category: "celular",
    searchCognition: { primaryAxis: "performance", behaviorMode: "search" },
    querySignals: {},
    routingDecision: { allowNewSearch: true },
    responsePath: "return_seguro",
  };

  let reply = buildSpecialistDecisionExplanation({ ...ctx, product }).text;
  reply =
    appendUserIntentDiscovery({
      reply,
      ...ctx,
    }).reply || reply;

  const narr = finalizeReplyWithSpecialistNarrative({
    reply,
    query: ctx.query,
    winnerName: "iPhone 13",
    allowedEvidence: "iPhone 13",
    primaryAxis: "performance",
    responsePath: "return_seguro",
  });

  const afterNarrative = narr.text || reply;
  const comp = finalizeReplyWithRepetitionCompression({
    reply: afterNarrative,
    query: ctx.query,
    winnerName: "iPhone 13",
    allowedEvidence: "iPhone 13",
    primaryAxis: "performance",
    responsePath: "return_seguro",
  });

  const afterCompression = comp.text || afterNarrative;

  const close = finalizeReplyWithConversationalClosing({
    reply: afterCompression,
    ...ctx,
    winnerName: "iPhone 13",
    allowedEvidence: "iPhone 13",
  });

  const afterClosing = close.text || afterCompression;

  const visual = finalizeReplyWithTradeoffVisualEmphasis({
    reply: afterClosing,
    winnerName: "iPhone 13",
    allowedEvidence: "iPhone 13",
    responsePath: "return_seguro",
  });

  return {
    afterNarrative,
    afterCompression,
    afterVisual: visual.text || afterClosing,
    compression: comp,
    visual,
    narrativeOk: narr.ok,
  };
}

console.log("\nPATCH 9.2I — Structure-Preserving Repetition Compression Audit\n");
console.log(`Version: ${REPETITION_COMPRESSION_GUARD_VERSION}\n`);

console.log("── API surface ──");
assert("countParagraphUnits export", typeof countParagraphUnits === "function");
assert("safeCleanupPreservingParagraphs export", typeof safeCleanupPreservingParagraphs === "function");
assert("verifyStructurePreservation export", typeof verifyStructurePreservation === "function");

console.log("\n── safeCleanupPreservingParagraphs ──");
const structuredSample = "Parágrafo um.\n\nParágrafo dois.\n\n✅ ganho forte.\n\n⚠️ abre mão de fluidez.";
const cleanedSample = safeCleanupPreservingParagraphs(structuredSample, {
  winnerName: "iPhone 13",
  allowedEvidence: "iPhone 13",
});
assert("preserva \\n\\n", countParagraphBreaks(cleanedSample) >= 3);
assert("preserva ✅", /✅/.test(cleanedSample));
assert("preserva ⚠️", /⚠️/.test(cleanedSample));

console.log("\n── verifyStructurePreservation guardrail ──");
const collapse = verifyStructurePreservation("A\n\nB\n\nC\n\nD", "A B C D");
assert("detecta colapso 4→1", !collapse.ok);
assert("flag STRUCTURE_COLLAPSED", collapse.flags?.includes("STRUCTURE_COLLAPSED"));

console.log('\n── Cenário "Celular até 2.000" (iPhone 13) ──');
const pipeline = buildCelularPipeline();
const before = metrics(pipeline.afterNarrative);
const after = metrics(pipeline.afterCompression);
const final = metrics(pipeline.afterVisual);

console.log("  Antes 9.2D:", before);
console.log("  Depois 9.2D:", after);
console.log("  Final 9.2F:", final);

assert("9.2A estrutura rica antes", before.paragraphs >= 5);
assert("9.2D não colapsa para 1 parágrafo", after.paragraphs > 1);
assert("9.2D mantém >= 3 \\n\\n", after.doubleNewlines >= 3);
assert("9.2D comprime (len menor ou igual)", after.len <= before.len);
assert("9.2D mantém ✅", after.hasCheck);
assert("9.2D mantém ⚠️", after.hasWarn);
assert("9.2D structurePreserved", pipeline.compression.structurePreserved !== false);
assert("9.2D ok", pipeline.compression.ok);
assert("9.2F cabeçalho ganho", final.hasGainHdr);
assert("9.2F cabeçalho sacrifício", final.hasSacrificeHdr);
assert("9.2F applied", pipeline.visual.applied === true);
assert("tradeoff visual não enterrado (cabeçalhos + >1 parágrafo)", final.hasGainHdr && final.paragraphs > 1);
assert("9.2D escaneável (>=3 parágrafos pós-compressão)", after.paragraphs >= 3);

console.log("\n── Respostas curtas casuais ──");
for (const short of ["oi", "entendi", "obrigado"]) {
  const should = shouldApplyRepetitionCompression({
    reply: short,
    responsePath: "return_seguro",
  });
  const result = finalizeReplyWithRepetitionCompression({
    reply: short,
    responsePath: "return_seguro",
  });
  assert(`"${short}" não força estrutura (${should})`, !should || result.paragraphsAfterFinalize <= 1);
  assert(`"${short}" texto preservado`, result.text === short.trim());
}

console.log("\n── Specialist ativo escaneável ──");
assert("narrative ok", pipeline.narrativeOk);
assert("compressão reduz redundância ou tamanho", after.len <= before.len);
assert("pós-9.2D escaneável", after.paragraphs >= 3 && after.doubleNewlines >= 3);
assert("visual emphasis detectável", hasVisualTradeoffEmphasis(pipeline.afterVisual));

if (!process.env.MIA_SKIP_NESTED_REGRESSION) {
  console.log("\n── Regressão audits anteriores ──");
  for (const script of PRIOR_AUDITS) {
    const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, MIA_SKIP_NESTED_REGRESSION: "1" },
    });
    const ok = result.status === 0;
    assert(`${script} passa`, ok);
    if (!ok) {
      console.log(result.stdout);
      console.error(result.stderr);
    }
  }
}

const total = passed + failed;
const verdict =
  failed === 0 ? "A) FULLY CLOSED" : failed <= 2 ? "B) PARTIAL" : "C) FAILED";

console.log(`\n${passed}/${total} checks passed`);
console.log(`Veredito: ${verdict}\n`);

process.exit(failed > 0 ? 1 : 0);
