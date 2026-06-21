/**
 * PATCH 9.2M — Semantic Family Allocation Engine Audit
 *
 * Usage:
 *   node scripts/test-mia-semantic-family-allocation-engine-audit.js
 *   MIA_SKIP_NESTED_REGRESSION=1 node scripts/test-mia-semantic-family-allocation-engine-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  inferSemanticFamilyFromText,
  inferSemanticFamilyFromToken,
  buildSemanticCandidatePool,
  allocateSpecialistFamilies,
  dedupeTradeoffItemsByFamily,
  SEMANTIC_FAMILY_ALLOCATION_VERSION,
} from "../lib/miaSemanticFamilyAllocationEngine.js";
import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { buildStructuredExplanationFacts } from "../lib/miaProductExplanationBuilder.js";
import { enrichConsequencesWithMicroImpacts } from "../lib/miaCommercialMicroConsequenceLayer.js";
import { finalizeReplyWithSpecialistNarrative } from "../lib/miaSpecialistNarrativeEngine.js";
import { finalizeReplyWithRepetitionCompression } from "../lib/miaRepetitionCompressionGuard.js";
import { finalizeReplyWithConversationalClosing } from "../lib/miaConversationalClosingEngine.js";
import {
  finalizeReplyWithTradeoffVisualEmphasis,
  detectTradeoffBlock,
  hasVisualTradeoffEmphasis,
} from "../lib/miaTradeoffVisualEmphasisLayer.js";
import { finalizeSpecialistPresentationRecovery } from "../lib/miaSpecialistPresentationContract.js";
import { shouldApplyRepetitionCompression } from "../lib/miaRepetitionCompressionGuard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-consequence-translation-recovery-audit.js",
  "test-mia-structure-preserving-repetition-compression-audit.js",
];

const IPHONE_SPECS = {
  official_name: "iPhone 13",
  category: "celular",
  strengths: [
    "camera_consistente",
    "video_forte",
    "desempenho_forte",
    "ios_ecossistema",
    "longevidade_uso",
  ],
  weaknesses: ["tela_60hz", "carregamento_lento", "preco_relativo_alto"],
  ideal_for: ["quem_prioriza_video", "quem_gosta_iphone", "quer_ios_mais_atual"],
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

function countFamilyMentions(text = "", family = "") {
  const chunks = String(text || "")
    .split(/(?<=[.!?\n])\s+|\n+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 12);

  let count = 0;
  for (const chunk of chunks) {
    if (inferSemanticFamilyFromText(chunk) === family) count += 1;
  }
  return count;
}

function countExactPhrase(text = "", phrase = "") {
  const body = String(text || "").toLowerCase();
  const needle = phrase.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = body.indexOf(needle, pos)) >= 0) {
    count += 1;
    pos += needle.length;
  }
  return count;
}

function buildFullPipeline(product, query, axis = "performance") {
  const winner = product.trustedSpecs?.official_name || product.product_name;
  const ctx = {
    query,
    category: product.category || "celular",
    product,
    searchCognition: {
      primaryAxis: axis,
      consequenceChain: {
        impact: "mais folga no uso pesado do dia a dia",
        consequence: "menos chance de sentir limitação depois de alguns meses",
      },
    },
    querySignals: {},
    decisionMemory: {},
    responsePath: "return_seguro",
    sessionContext: {},
  };

  const specialist = buildSpecialistDecisionExplanation(ctx);
  let reply = specialist.text || "";
  let presentation = specialist.presentation || null;

  const narr = finalizeReplyWithSpecialistNarrative({
    reply,
    query,
    winnerName: winner,
    allowedEvidence: winner,
    primaryAxis: axis,
    responsePath: "return_seguro",
  });
  reply = narr.text || reply;

  const comp = finalizeReplyWithRepetitionCompression({
    reply,
    query,
    winnerName: winner,
    allowedEvidence: winner,
    primaryAxis: axis,
    responsePath: "return_seguro",
  });
  reply = comp.text || reply;

  const close = finalizeReplyWithConversationalClosing({
    reply,
    ...ctx,
    winnerName: winner,
    allowedEvidence: winner,
    presentation,
  });
  reply = close.text || reply;
  if (close.presentation) presentation = close.presentation;

  const visual = finalizeReplyWithTradeoffVisualEmphasis({
    reply,
    winnerName: winner,
    allowedEvidence: winner,
    responsePath: "return_seguro",
    presentation,
  });

  reply = visual.text || reply;

  const recovery = finalizeSpecialistPresentationRecovery({ reply, presentation });
  reply = recovery.text || reply;

  return {
    specialist,
    reply,
    visual,
    comp,
    presentation,
  };
}

function distinctGainFamilies(reply = "") {
  const parsed = detectTradeoffBlock(reply).parsed;
  if (parsed.gains?.length) {
    return new Set(
      parsed.gains.map((g) => inferSemanticFamilyFromText(String(g).replace(/^•\s*/, "")))
    ).size;
  }

  const match = String(reply || "").match(/O que voc[eê] ganha\s*\n+([\s\S]*?)\n+\s*⚠️/i);
  if (!match) return 0;
  const lines = match[1]
    .split(/\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return new Set(lines.map((line) => inferSemanticFamilyFromText(line.replace(/^•\s*/, "")))).size;
}

console.log("\nPATCH 9.2M — Semantic Family Allocation Engine Audit\n");
console.log(`Version: ${SEMANTIC_FAMILY_ALLOCATION_VERSION}\n`);

console.log("── Unit: classificação de tokens ──");
assert("camera_consistente => camera_video_confidence", inferSemanticFamilyFromToken("camera_consistente") === "camera_video_confidence");
assert("desempenho_forte => performance_longevity", inferSemanticFamilyFromToken("desempenho_forte") === "performance_longevity");
assert("facil_limpeza => maintenance_cleaning", inferSemanticFamilyFromToken("facil_limpeza") === "maintenance_cleaning");
assert("boa_capacidade => size_capacity", inferSemanticFamilyFromToken("boa_capacidade") === "size_capacity");

console.log("\n── Unit: dedupe tradeoff por família ──");
const deduped = dedupeTradeoffItemsByFamily(
  [
    "menos preocupação em registrar bons momentos",
    "mais confiança para gravar vídeos com resultado consistente",
    "menos preocupação em registrar bons momentos",
  ],
  3
);
assert("dedupe remove texto repetido", deduped.length >= 1 && deduped.length <= 2);
assert("dedupe colapsa camera+video na mesma família", deduped.length === 1);

console.log("\n── A) iPhone 13 / eixo performance ──");
const iphoneProduct = {
  product_name: "iPhone 13",
  isDataLayerProduct: true,
  category: "celular",
  trustedSpecs: IPHONE_SPECS,
};
const iphoneFacts = enrichConsequencesWithMicroImpacts(
  buildStructuredExplanationFacts({ product: iphoneProduct, hasDataLayer: true })
);
const iphoneAlloc = allocateSpecialistFamilies({
  structuredFacts: iphoneFacts,
  trustedSpecs: IPHONE_SPECS,
  primaryAxis: "performance",
  searchCognition: { consequenceChain: {} },
});
assert("decisão aloca família", !!iphoneAlloc.decision.family);
assert(
  "decisão performance prioriza performance_longevity ou compacta",
  iphoneAlloc.decision.family === "performance_longevity" ||
    /desempenho|limite|dia a dia/i.test(iphoneAlloc.decision.shortText)
);

const iphonePipeline = buildFullPipeline(iphoneProduct, "iPhone 13", "performance");
const iphoneReply = iphonePipeline.reply;
const cameraCount = countFamilyMentions(iphoneReply, "camera_video_confidence");
assert("camera_video_confidence <= 2 menções relevantes", cameraCount <= 2, `count=${cameraCount}`);
assert(
  "longevidade ou ecossistema aparece em algum bloco",
  /longevidade|ecossistema|ios|permanecer|atualiza|software/i.test(iphoneReply)
);
assert("tradeoff gain com famílias distintas", distinctGainFamilies(iphoneReply) >= 2);
assert("9.2F visual aplicado", iphonePipeline.visual.applied === true);
assert("9.2F tem cabeçalhos", hasVisualTradeoffEmphasis(iphoneReply));
assert(
  "9.2F não triplica frase de câmera",
  countExactPhrase(iphoneReply, "menos preocupação em registrar bons momentos") <= 2,
  `count=${countExactPhrase(iphoneReply, "menos preocupação em registrar bons momentos")}`
);
assert(
  "sem inline duplicado + bloco visual com mesmos ganhos crus",
  !/✅ O que você ganha[\s\S]*✅ ganha menos preocupação/i.test(iphoneReply)
);

console.log("\n── B) Notebook performance ──");
const notebookPipeline = buildFullPipeline(
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
assert("notebook resposta ok", notebookPipeline.specialist.ok);
assert(
  "notebook performance não domina 4x",
  countFamilyMentions(notebookPipeline.reply, "performance_longevity") <= 3
);

console.log("\n── C) Eixo bateria ──");
const batteryPipeline = buildFullPipeline(
  {
    product_name: "Moto G84",
    isDataLayerProduct: true,
    category: "celular",
    trustedSpecs: {
      official_name: "Moto G84",
      category: "celular",
      strengths: ["bateria_consistente", "tela_fluida"],
      weaknesses: ["camera_limitada"],
      ideal_for: ["uso_diario_equilibrado"],
    },
  },
  "celular bateria forte",
  "battery"
);
assert("bateria resposta ok", batteryPipeline.specialist.ok);
assert(
  "battery_autonomy não repete 4x",
  countFamilyMentions(batteryPipeline.reply, "battery_autonomy") <= 3
);

console.log("\n── D) Air fryer (categoria desconhecida) ──");
const airPipeline = buildFullPipeline(
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
const airPool = buildSemanticCandidatePool(
  buildStructuredExplanationFacts({
    product: { product_name: "Air Fryer Max", isDataLayerProduct: true, trustedSpecs: airPipeline },
    hasDataLayer: true,
  }),
  { trustedSpecs: { strengths: ["boa_capacidade", "facil_limpeza"], weaknesses: ["ocupa_bancada"] } }
);
assert("air fryer pool não vazio", airPool.pool.length > 0);
assert("air fryer resposta ok", airPipeline.specialist.ok);
assert(
  "air fryer sem mesma frase 4x",
  countExactPhrase(airPipeline.reply, "mais folga para o uso previsto") <= 3
);

console.log("\n── E) Sem Data Layer ──");
const noLayerPipeline = buildFullPipeline(
  { product_name: "Celular Genérico", category: "celular" },
  "celular barato",
  "value"
);
assert("sem layer não quebra", noLayerPipeline.reply.length > 40);
assert(
  "sem layer decisão não inventa câmera",
  !/registrar bons momentos|fotos e vídeos/i.test(noLayerPipeline.specialist.text)
);

console.log("\n── F) Respostas curtas ──");
assert("motor classifica token curto", inferSemanticFamilyFromToken("oi") === "generic_fit");
assert("dedupe vazio não quebra", dedupeTradeoffItemsByFamily([], 3).length === 0);
assert("pool vazio não quebra", buildSemanticCandidatePool(null, {}).pool.length === 0);

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

const total = passed + failed;
const verdict = failed === 0 ? "A) FULLY CLOSED" : failed <= 3 ? "B) PARTIAL" : "C) FAILED";

console.log("\n══════════════════════════════════════");
console.log(`Checks: ${passed}/${total}`);
console.log(`Veredito: ${verdict}`);
console.log("══════════════════════════════════════\n");

if (failures.length) {
  console.log("Falhas:");
  for (const msg of failures) console.log(`  - ${msg}`);
}

process.exit(failed > 0 ? 1 : 0);
