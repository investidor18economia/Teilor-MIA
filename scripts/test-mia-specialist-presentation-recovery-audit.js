/**
 * PATCH 9.2O — Specialist Presentation Recovery Audit
 *
 * Usage:
 *   node scripts/test-mia-specialist-presentation-recovery-audit.js
 *   MIA_SKIP_NESTED_REGRESSION=1 node scripts/test-mia-specialist-presentation-recovery-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { finalizeReplyWithSpecialistNarrative } from "../lib/miaSpecialistNarrativeEngine.js";
import { finalizeReplyWithRepetitionCompression } from "../lib/miaRepetitionCompressionGuard.js";
import { finalizeReplyWithConversationalClosing } from "../lib/miaConversationalClosingEngine.js";
import { finalizeReplyWithTradeoffVisualEmphasis } from "../lib/miaTradeoffVisualEmphasisLayer.js";
import {
  finalizeSpecialistPresentationRecovery,
  measureSpecialistPresentation,
  verifySpecialistPresentationGuard,
  hasDetectableSpecialistPresentation,
} from "../lib/miaSpecialistPresentationContract.js";
import { cleanupMiaHumanLanguage } from "../lib/miaAntiAiLanguageCleanupLayer.js";
import { splitAssistantParagraphs } from "../lib/miaFrontendParagraphRendering.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-structure-preserving-repetition-compression-audit.js",
  "test-mia-consequence-translation-recovery-audit.js",
  "test-mia-semantic-family-allocation-engine-audit.js",
];

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

function runPipeline(product, query, axis = "performance") {
  const winner = product.trustedSpecs?.official_name || product.product_name;
  const ctx = {
    query,
    category: product.category || "celular",
    product,
    searchCognition: {
      primaryAxis: axis,
      consequenceChain: {
        impact: "mais folga no uso pesado",
        consequence: "menos limitação depois de alguns meses",
      },
    },
    querySignals: {},
    decisionMemory: {},
    responsePath: "return_seguro",
    sessionContext: {},
  };

  const specialist = buildSpecialistDecisionExplanation(ctx);
  let presentation = specialist.presentation || null;
  let reply = specialist.text || "";

  reply =
    finalizeReplyWithSpecialistNarrative({
      reply,
      query,
      winnerName: winner,
      allowedEvidence: winner,
      primaryAxis: axis,
      responsePath: "return_seguro",
    }).text || reply;

  reply =
    finalizeReplyWithRepetitionCompression({
      reply,
      query,
      winnerName: winner,
      allowedEvidence: winner,
      primaryAxis: axis,
      responsePath: "return_seguro",
    }).text || reply;

  const close = finalizeReplyWithConversationalClosing({
    reply,
    ...ctx,
    winnerName: winner,
    allowedEvidence: winner,
    presentation,
  });
  reply = close.text || reply;
  if (close.presentation) presentation = close.presentation;

  const preCloseMetrics = measureSpecialistPresentation(reply);

  const visual = finalizeReplyWithTradeoffVisualEmphasis({
    reply,
    winnerName: winner,
    allowedEvidence: winner,
    responsePath: "return_seguro",
    presentation,
  });
  reply = visual.text || reply;
  if (visual.presentation) presentation = visual.presentation;

  const recovery = finalizeSpecialistPresentationRecovery({ reply, presentation });
  reply = recovery.text || reply;
  if (recovery.presentation) presentation = recovery.presentation;

  return {
    specialist,
    presentation,
    reply,
    preCloseMetrics,
    visual,
    recovery,
    gains: presentation?.tradeoff?.gains || [],
    sacrifices: presentation?.tradeoff?.sacrifices || [],
    metrics: measureSpecialistPresentation(reply),
    frontendParagraphs: splitAssistantParagraphs(reply),
  };
}

console.log("\nPATCH 9.2O — Specialist Presentation Recovery Audit\n");

console.log("── Unit: cleanup preserva parágrafos specialist ──");
const IPHONE_SPECS = {
  official_name: "iPhone 13",
  category: "celular",
  strengths: ["camera_consistente", "video_forte", "desempenho_forte", "ios_ecossistema", "longevidade_uso"],
  weaknesses: ["tela_60hz", "carregamento_lento", "preco_relativo_alto"],
  ideal_for: ["quem_prioriza_video"],
};
const iphoneProduct = {
  product_name: "iPhone 13",
  isDataLayerProduct: true,
  category: "celular",
  trustedSpecs: IPHONE_SPECS,
};

const iphonePipeline = runPipeline(iphoneProduct, "iPhone 13", "performance");
const multiParaSample = "Linha um.\n\nLinha dois.\n\n✅ ganha teste\n\n⚠️ abre mão de teste";
const cleanedSample = cleanupMiaHumanLanguage(multiParaSample, {
  preserveStructure: true,
  preserveSpecialistStructure: true,
});
assert(
  "cleanup não colapsa \\n\\n em specialist",
  (cleanedSample.text.match(/\n\n/g) || []).length >= 2,
  `doubleNL=${(cleanedSample.text.match(/\n\n/g) || []).length}`
);

console.log("\n── A) iPhone 13 ──");
assert("specialist tem presentation", !!iphonePipeline.presentation);
assert("presentation gains array", iphonePipeline.gains.length >= 2, `count=${iphonePipeline.gains.length}`);
assert("9.2F usou contrato", iphonePipeline.visual.usedContract === true);
assert("estrutura detectável no final", hasDetectableSpecialistPresentation(iphonePipeline.reply));
assert("gain header presente", iphonePipeline.metrics.hasGainHeader);
assert("sacrifice header presente", iphonePipeline.metrics.hasSacrificeHeader);
assert("bullets presentes", iphonePipeline.metrics.bulletCount >= 2, `bullets=${iphonePipeline.metrics.bulletCount}`);
assert("closing separado do tradeoff", (() => {
  const paras = iphonePipeline.frontendParagraphs;
  const closingPara = paras[paras.length - 1] || "";
  const tradeoffPara = paras.find((p) => /O que voc[eê] ganha/i.test(p));
  return tradeoffPara && !/Esse é o próximo passo/i.test(tradeoffPara) && /Esse é o próximo passo|Por aqui, eu fecharia/i.test(closingPara);
})());
assert(
  "sem ganhos concatenados com ✅ inline",
  !/Ecossistema[^•\n]{0,40}✅ você leva/i.test(iphonePipeline.reply)
);
assert(
  "guard final ok",
  verifySpecialistPresentationGuard(iphonePipeline.presentation, iphonePipeline.reply).ok
);
assert(
  "pós-closing não colapsou para 1 parágrafo",
  iphonePipeline.preCloseMetrics.paragraphs >= 2 || iphonePipeline.metrics.paragraphs >= 3,
  `preClose=${iphonePipeline.preCloseMetrics.paragraphs} final=${iphonePipeline.metrics.paragraphs}`
);

console.log("\n── B) Notebook ──");
const notebook = runPipeline(
  {
    product_name: "Notebook Nitro 5",
    isDataLayerProduct: true,
    category: "notebook",
    trustedSpecs: {
      official_name: "Notebook Nitro 5",
      category: "notebook",
      strengths: ["desempenho_forte", "multitarefa_equilibrada"],
      weaknesses: ["portabilidade_limitada"],
      ideal_for: ["trabalho_multitarefa"],
    },
  },
  "notebook gamer",
  "performance"
);
assert("notebook estrutura ok", hasDetectableSpecialistPresentation(notebook.reply));
assert("notebook gains preservados", notebook.gains.length >= 1);

console.log("\n── C) Bateria ──");
const battery = runPipeline(
  {
    product_name: "Moto G84",
    isDataLayerProduct: true,
    category: "celular",
    trustedSpecs: {
      official_name: "Moto G84",
      strengths: ["bateria_consistente", "tela_fluida"],
      weaknesses: ["camera_limitada"],
      ideal_for: ["uso_diario_equilibrado"],
    },
  },
  "celular bateria forte",
  "battery"
);
assert("bateria estrutura ok", hasDetectableSpecialistPresentation(battery.reply));

console.log("\n── D) Air fryer ──");
const air = runPipeline(
  {
    product_name: "Air Fryer Max",
    isDataLayerProduct: true,
    category: "air_fryer",
    trustedSpecs: {
      official_name: "Air Fryer Max",
      category: "air_fryer",
      strengths: ["boa_capacidade", "facil_limpeza", "baixo_consumo"],
      weaknesses: ["ocupa_bancada"],
      ideal_for: ["familia_media"],
    },
  },
  "air fryer",
  "value"
);
assert("air fryer não quebra", air.reply.length > 40);

console.log("\n── E) Sem Data Layer ──");
const noLayer = runPipeline({ product_name: "Celular Genérico", category: "celular" }, "celular barato", "value");
assert("sem layer não quebra", noLayer.reply.length > 30);

console.log("\n── F) Respostas curtas ──");
assert("oi não é specialist", !hasDetectableSpecialistPresentation("oi"));
assert("entendi não é specialist", !hasDetectableSpecialistPresentation("entendi, obrigado"));

if (!process.env.MIA_SKIP_NESTED_REGRESSION) {
  console.log("\n── Regressão ──");
  for (const script of PRIOR_AUDITS) {
    const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, MIA_SKIP_NESTED_REGRESSION: "1" },
    });
    assert(`${script} passa`, result.status === 0);
  }
}

console.log(`\n${"═".repeat(38)}`);
console.log(`Checks: ${passed}/${passed + failed}`);
console.log(`Veredito: ${failed === 0 ? "A) FULLY CLOSED" : failed <= 2 ? "B) PARTIAL" : "C) FAILED"}`);
console.log(`${"═".repeat(38)}\n`);

if (failures.length) {
  console.log("Falhas:");
  for (const entry of failures) console.log(`  - ${entry}`);
  process.exit(1);
}
