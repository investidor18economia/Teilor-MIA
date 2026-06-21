/**
 * PATCH 9.2K — Consequence Translation Recovery Audit
 *
 * Usage:
 *   node scripts/test-mia-consequence-translation-recovery-audit.js
 *   MIA_SKIP_NESTED_REGRESSION=1 node scripts/test-mia-consequence-translation-recovery-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  normalizeDataLayerSemanticField,
  normalizeTrustedSpecsSemanticFields,
  isArtificialAttributeChain,
  DATA_LAYER_SEMANTIC_NORMALIZER_VERSION,
} from "../lib/miaDataLayerSemanticNormalizer.js";
import {
  applyDataLayerHumanizationGuard,
  getHumanizedTrustedSpecs,
  humanizeDataLayerText,
  DATA_LAYER_HUMANIZATION_GUARD_VERSION,
} from "../lib/miaDataLayerHumanizationGuard.js";
import {
  buildStructuredExplanationFacts,
  findInventedSpecViolations,
} from "../lib/miaProductExplanationBuilder.js";
import { translateDataLayerFieldsToConsequences } from "../lib/miaConsequenceTranslationLayer.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { buildTradeoffCommunicationBlock } from "../lib/miaTradeoffCommunicationLayer.js";
import { buildExpertInsight } from "../lib/miaExpertInsightGenerationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { finalizeReplyWithSpecialistNarrative } from "../lib/miaSpecialistNarrativeEngine.js";
import { finalizeReplyWithRepetitionCompression } from "../lib/miaRepetitionCompressionGuard.js";
import { finalizeReplyWithConversationalClosing } from "../lib/miaConversationalClosingEngine.js";
import { finalizeReplyWithTradeoffVisualEmphasis } from "../lib/miaTradeoffVisualEmphasisLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-data-layer-humanization-guard-audit.js",
  "test-mia-consequence-translation-layer-audit.js",
  "test-mia-structure-preserving-repetition-compression-audit.js",
  "test-mia-tradeoff-communication-audit.js",
];

const BANNED_CHAINS = [
  /câmera consistente e modelo forte e desempenho forte e ios ecossistema/i,
  /quer ios mais atual e quem prioriza video/i,
  /quer ios mais atual e quem prioriza vídeo/i,
  /fica com câmera consistente e desempenho forte e ios ecossistema/i,
  /combina com o perfil de uso descrito/i,
];

const IPHONE_COMPOUND_SPECS = {
  official_name: "iPhone 13",
  category: "celular",
  strengths: "camera_consistente;video_forte;desempenho_forte;ios_ecossistema",
  ideal_for: "quer_ios_mais_atual;quem_prioriza_video;quem_gosta_iphone;modelo_quer_desempenho_forte",
  weaknesses: "tela_60hz;carregamento_lento",
};

const IPHONE_ARRAY_SPECS = {
  official_name: "iPhone 13",
  category: "celular",
  strengths: ["camera_consistente", "video_forte", "desempenho_forte"],
  ideal_for: ["estabilidade_software", "uso_video_frequente"],
  weaknesses: ["tela_60hz"],
};

const AIR_FRYER_SPECS = {
  official_name: "Air Fryer Max 5L",
  category: "air_fryer",
  strengths: "boa_capacidade;facil_limpeza;baixo_consumo",
  ideal_for: "familia_media;cozinha_pratica",
  weaknesses: "ocupa_bancada",
};

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

function assertNoBannedChains(text = "", context = "") {
  for (const pattern of BANNED_CHAINS) {
    assert(
      `sem chain proibida${context ? ` (${context})` : ""}: ${pattern}`,
      !pattern.test(text),
      text.slice(0, 120)
    );
  }
}

function humanizeToken(token) {
  const guarded = applyDataLayerHumanizationGuard({
    official_name: "Probe",
    strengths: [token],
  });
  return guarded.specs?.strengths?.[0] || "";
}

function buildFullPipelineReply(product, query, category, axis = "performance") {
  const winnerName = product.trustedSpecs?.official_name || product.product_name;
  const ctx = {
    query,
    category,
    product,
    searchCognition: {
      primaryAxis: axis,
      consequenceChain: {
        impact: "mais folga no uso pesado do dia a dia",
        consequence: "menos chance de sentir limitação depois de alguns meses",
      },
    },
    querySignals: {},
    decisionMemory: {
      lastWinnerAdvantages: [axis],
      lastWinnerSacrifices: ["screen"],
      lastTradeoff: product.trustedSpecs?.weaknesses?.[0] || "",
    },
    responsePath: "return_seguro",
    sessionContext: {},
  };

  const specialist = buildSpecialistDecisionExplanation(ctx);
  if (!specialist.ok) return { reply: "", specialist };

  let reply = specialist.text;
  reply = appendUserIntentDiscovery({ reply, ...ctx }).reply || reply;

  const narr = finalizeReplyWithSpecialistNarrative({
    reply,
    query,
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    responsePath: "return_seguro",
  });
  reply = narr.text || reply;

  const comp = finalizeReplyWithRepetitionCompression({
    reply,
    query,
    winnerName,
    allowedEvidence: winnerName,
    primaryAxis: axis,
    responsePath: "return_seguro",
  });
  reply = comp.text || reply;

  const close = finalizeReplyWithConversationalClosing({
    reply,
    ...ctx,
    winnerName,
    allowedEvidence: winnerName,
  });
  reply = close.text || reply;

  const visual = finalizeReplyWithTradeoffVisualEmphasis({
    reply,
    winnerName,
    allowedEvidence: winnerName,
    responsePath: "return_seguro",
  });

  return { reply: visual.text || reply, specialist, comp, visual };
}

console.log("\nPATCH 9.2K — Consequence Translation Recovery Audit\n");
console.log(`Normalizer: ${DATA_LAYER_SEMANTIC_NORMALIZER_VERSION}`);
console.log(`Humanization guard: ${DATA_LAYER_HUMANIZATION_GUARD_VERSION}\n`);

console.log("── A: Data Layer em array ──");
const arrayNorm = normalizeDataLayerSemanticField(IPHONE_ARRAY_SPECS.strengths);
assert("A: strengths vira array de tokens", arrayNorm.length === 3);
assert("A: preserva camera_consistente", arrayNorm.includes("camera_consistente"));
const arrayFacts = buildStructuredExplanationFacts({
  product: { product_name: "iPhone 13", isDataLayerProduct: true },
  trustedSpecs: IPHONE_ARRAY_SPECS,
  hasDataLayer: true,
});
assert("A: structuredFacts ok", arrayFacts.mode === "data_layer");
assert(
  "A: strengthConsequences sem chain artificial",
  !(arrayFacts.strengthConsequences || []).some((entry) => isArtificialAttributeChain(entry))
);

console.log("\n── B: Data Layer em string composta (;) ──");
const compoundNorm = normalizeDataLayerSemanticField(IPHONE_COMPOUND_SPECS.strengths);
assert("B: ; separa em 4 tokens", compoundNorm.length === 4);
assert("B: video_forte preservado", compoundNorm.includes("video_forte"));

const beforeHumanize = humanizeDataLayerText(IPHONE_COMPOUND_SPECS.strengths);
assert("B: 9.2B não faz join em composto", !beforeHumanize.text.includes(" e "));
assert("B: 9.2B suprime composto pré-tradução", beforeHumanize.suppressed || !beforeHumanize.ok);

const humanizedSpecs = getHumanizedTrustedSpecs(IPHONE_COMPOUND_SPECS);
assert("B: getHumanizedTrustedSpecs retorna array", Array.isArray(humanizedSpecs.strengths));
assert("B: strengths com 4 tokens separados", humanizedSpecs.strengths.length === 4);

const translated = translateDataLayerFieldsToConsequences(humanizedSpecs);
assert("B: 3C-A traduz 4 strengths", translated.strengths.length >= 3);
assert(
  "B: consequências sem token cru video_forte",
  !translated.strengths.some((entry) => /video_forte/i.test(entry.consequence))
);

const compoundFacts = buildStructuredExplanationFacts({
  product: { product_name: "iPhone 13", isDataLayerProduct: true },
  trustedSpecs: IPHONE_COMPOUND_SPECS,
  hasDataLayer: true,
});
assert(
  "B: facts sem chain robótica",
  !(compoundFacts.strengthConsequences || []).some((entry) => isArtificialAttributeChain(entry))
);

console.log("\n── C: campos ausentes ──");
assert("C: null => []", normalizeDataLayerSemanticField(null).length === 0);
assert("C: undefined => []", normalizeDataLayerSemanticField(undefined).length === 0);
const sparseSpecs = normalizeTrustedSpecsSemanticFields({
  official_name: "Produto X",
  strengths: null,
  ideal_for: undefined,
});
assert("C: campos ausentes removidos", !("strengths" in sparseSpecs) && !("ideal_for" in sparseSpecs));
const sparseFacts = buildStructuredExplanationFacts({
  product: { product_name: "Produto X", isDataLayerProduct: true },
  trustedSpecs: { official_name: "Produto X" },
  hasDataLayer: true,
});
assert("C: facts ainda constroem", sparseFacts.mode === "data_layer");

console.log("\n── D: categoria desconhecida (air_fryer) ──");
const airNorm = normalizeDataLayerSemanticField(AIR_FRYER_SPECS.strengths);
assert("D: air_fryer tokens separados", airNorm.length === 3);
const airFacts = buildStructuredExplanationFacts({
  product: { product_name: "Air Fryer Max 5L", isDataLayerProduct: true, category: "air_fryer" },
  trustedSpecs: AIR_FRYER_SPECS,
  hasDataLayer: true,
});
assert("D: facts para categoria nova", airFacts.mode === "data_layer");
assert(
  "D: fallback controlado sem chain artificial",
  !(airFacts.strengthConsequences || []).some((entry) => isArtificialAttributeChain(entry))
);
const airPipeline = buildFullPipelineReply(
  {
    product_name: "Air Fryer Max 5L",
    isDataLayerProduct: true,
    category: "air_fryer",
    trustedSpecs: AIR_FRYER_SPECS,
  },
  "air fryer boa",
  "air_fryer",
  "value"
);
assert("D: pipeline air_fryer ok", airPipeline.reply.length > 80);
assertNoBannedChains(airPipeline.reply, "air_fryer");

console.log("\n── E: sem Data Layer / trustedSpecs ──");
const noLayerFacts = buildStructuredExplanationFacts({
  product: { product_name: "Celular Genérico XYZ", price: "R$ 1.299,00", category: "celular" },
  hasDataLayer: false,
});
assert("E: modo fallback", noLayerFacts.mode !== "data_layer" || !noLayerFacts.strengthConsequences?.length);
const noLayerPipeline = buildFullPipelineReply(
  {
    product_name: "Celular Genérico XYZ",
    price: "R$ 1.299,00",
    category: "celular",
  },
  "celular bom e barato",
  "celular",
  "value"
);
assert("E: resposta sem specs não quebra", noLayerPipeline.reply.length > 40);
assert(
  "E: linguagem cautelosa ou natural",
  /dados disponíveis|escolha|recomendo|iPhone|celular|produto/i.test(noLayerPipeline.reply)
);

console.log("\n── F: cenário real Celular até 2.000 / iPhone 13 (tokens compostos) ──");
const videoLabel = humanizeToken("video_forte");
assert('F: video_forte não vira "modelo forte"', !/modelo forte/i.test(videoLabel), videoLabel);
assert("F: video_forte vira vídeo legível", /vídeo forte|video forte/i.test(videoLabel), videoLabel);

const iphoneProduct = {
  product_name: "Apple iPhone 13 128GB",
  isDataLayerProduct: true,
  category: "celular",
  trustedSpecs: IPHONE_COMPOUND_SPECS,
};
const iphonePipeline = buildFullPipelineReply(
  iphoneProduct,
  "Celular até 2.000",
  "celular",
  "performance"
);
assert("F: specialist ok", iphonePipeline.specialist.ok);
assert("F: resposta substancial", iphonePipeline.reply.length > 120);
assert("F: menciona iPhone 13", /iPhone\s*13/i.test(iphonePipeline.reply));
assertNoBannedChains(iphonePipeline.reply, "iPhone 13 pipeline");
assert(
  "F: não propaga modelo forte da chain",
  !/modelo forte e desempenho forte/i.test(iphonePipeline.reply),
  iphonePipeline.reply.slice(0, 200)
);
assert("F: mantém tradeoff visual", /O que voc[eê] ganha/i.test(iphonePipeline.reply));
assert("F: mantém sacrifício", /O que voc[eê] abre m[aã]o|⚠️/i.test(iphonePipeline.reply));
assert(
  "F: estrutura 9.2I preservada (>=3 parágrafos pós-compressão)",
  (iphonePipeline.comp?.paragraphsAfterFinalize || 0) >= 3 || iphonePipeline.reply.split(/\n\n+/).length >= 3
);

console.log("\n── Guardrails 9.1B / 9.1D / 9.1H ──");
const structuredForLayers = buildStructuredExplanationFacts({
  product: iphoneProduct,
  trustedSpecs: IPHONE_COMPOUND_SPECS,
  hasDataLayer: true,
});
const tradeoff = buildTradeoffCommunicationBlock({
  structuredFacts: structuredForLayers,
  product: iphoneProduct,
  query: "Celular até 2.000",
  primaryAxis: "performance",
  responsePath: "return_seguro",
});
const tradeoffText = tradeoff.block || tradeoff.text || "";
assert("9.1D: bloco tradeoff gerado", tradeoffText.length > 20);
assertNoBannedChains(tradeoffText, "9.1D");
assert(
  "9.1D: ganho não é fica com chain artificial",
  !/fica com .+ e .+ e .+ e/i.test(tradeoffText),
  tradeoffText.slice(0, 160)
);

const pseudoInsight = buildExpertInsight({
  evidence: { text: "combina com o perfil de uso descrito", source: "ideal_for" },
  product: iphoneProduct,
  query: "celular",
  primaryAxis: "performance",
  allowedEvidence: "iPhone 13",
  responsePath: "return_seguro",
  structuredFacts: structuredForLayers,
});
assert(
  "9.1H: rejeita pseudo-insight genérico",
  !pseudoInsight.ok || pseudoInsight.error === "generic_insight",
  pseudoInsight.paragraph || pseudoInsight.error
);

console.log("\n── Confirmações de pipeline ──");
assert(
  "3C-A recebe tokens separados (não string com ;)",
  Array.isArray(humanizedSpecs.strengths) && !String(humanizedSpecs.strengths).includes(";")
);
assert(
  "9.2B não join antes da tradução",
  beforeHumanize.suppressed || !/\s+e\s+/.test(beforeHumanize.text || "")
);
assert(
  "sem invenção no iPhone pipeline",
  findInventedSpecViolations(iphonePipeline.reply, "iPhone 13").length === 0
);

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
      console.log(result.stdout?.slice(-800));
      console.error(result.stderr?.slice(-400));
    }
  }
} else {
  console.log("\n── Regressão: SKIP (MIA_SKIP_NESTED_REGRESSION=1) ──");
}

const total = passed + failed;
const verdict =
  failed === 0 ? "A) FULLY CLOSED" : failed <= 3 ? "B) PARTIAL" : "C) FAILED";

console.log("\n══════════════════════════════════════");
console.log(`Checks: ${passed}/${total} passed`);
console.log(`Veredito: ${verdict}`);
console.log("══════════════════════════════════════\n");

if (failures.length) {
  console.log("Falhas:");
  for (const msg of failures) console.log(`  - ${msg}`);
}

process.exit(failed > 0 ? 1 : 0);
