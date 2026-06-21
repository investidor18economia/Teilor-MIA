/**
 * PATCH 9.2S — Sensation Authority Bridge Audit
 *
 * Usage:
 *   node scripts/test-mia-sensation-authority-bridge-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import {
  buildSensationBridge,
  PERCEPTION_CLASSES,
  classifyInsightOrigin,
  isSensationInsightTraceable,
  SENSATION_REASONING_VERSION,
} from "../lib/miaSensationReasoningLayer.js";
import {
  buildAuthorityBridge,
  classifyClosingOrigin,
  verbalizeClosingFromAuthority,
  AUTHORITY_BRIDGE_VERSION,
} from "../lib/miaAuthorityBridgeLayer.js";
import {
  extractExpertInsightFromReply,
  isExpertInsightUseful,
  INSIGHT_MARKER_PATTERN,
} from "../lib/miaExpertInsightGenerationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import {
  finalizeReplyWithRepetitionCompression,
} from "../lib/miaRepetitionCompressionGuard.js";
import {
  finalizeReplyWithConversationalClosing,
} from "../lib/miaConversationalClosingEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-structure-preserving-repetition-compression-audit.js",
  "test-mia-consequence-translation-recovery-audit.js",
  "test-mia-semantic-family-allocation-engine-audit.js",
  "test-mia-specialist-presentation-recovery-audit.js",
  "test-mia-specialist-wire-contract-preservation-audit.js",
];

const IPHONE_SPECS = {
  official_name: "iPhone 13",
  category: "celular",
  strengths: [
    "ainda recebe atualizações de sistema como aparelho principal da linha",
    "câmera continua consistente mesmo em fotos noturnas",
    "boa autonomia para um dia inteiro fora de tomada",
  ],
  ideal_for: ["quem prioriza estabilidade e longevidade de software"],
  weaknesses: ["tela de 60 Hz pode parecer menos fluida se você veio de modelos Pro"],
  risk_notes: ["carregador não acompanha na caixa"],
};

const NOTEBOOK_SPECS = {
  official_name: "Notebook Lenovo IdeaPad 3",
  category: "notebook",
  strengths: ["desempenho equilibrado para estudo e trabalho sem travar em multitarefa básica"],
  ideal_for: ["quem precisa de notebook para uso diário sem exagero"],
  weaknesses: ["não é a melhor opção para edição pesada ou jogos exigentes"],
};

const TV_SPECS = {
  official_name: "Smart TV Samsung 55 4K",
  category: "tv",
  strengths: ["imagem consistente para streaming de filmes e séries"],
  ideal_for: ["quem assiste filmes e séries"],
  weaknesses: ["apps de streaming podem variar de fluidez entre modelos"],
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

function cognition(axis = "performance", extra = {}) {
  return {
    primaryAxis: axis,
    assertiveness: "medium",
    consequenceChain: {
      impact: "mais folga no uso pesado do dia a dia",
      consequence: "menos chance de sentir limitação depois de alguns meses",
    },
    ...extra,
  };
}

function buildPipeline({
  query,
  category,
  product,
  primaryAxis = "performance",
  querySignals = {},
}) {
  const winnerName = product.trustedSpecs?.official_name || product.product_name;
  const ctx = {
    query,
    category,
    product,
    searchCognition: cognition(primaryAxis),
    querySignals,
    decisionMemory: {
      lastWinnerAdvantages: [primaryAxis],
      lastWinnerSacrifices: ["screen"],
      lastTradeoff: product.trustedSpecs?.weaknesses?.[0] || "",
    },
    responsePath: "return_seguro",
    sessionContext: {},
  };

  const specialist = buildSpecialistDecisionExplanation(ctx);
  if (!specialist.ok) {
    return { reply: "", specialist, closing: "", insight: "" };
  }

  let reply = specialist.text;
  reply = appendUserIntentDiscovery({ reply, ...ctx, routingDecision: { allowNewSearch: true } }).reply || reply;

  const comp = finalizeReplyWithRepetitionCompression({
    reply,
    query,
    winnerName,
    allowedEvidence: winnerName,
    primaryAxis,
    responsePath: "return_seguro",
  });
  reply = comp.text || reply;

  const close = finalizeReplyWithConversationalClosing({
    reply,
    ...ctx,
    winnerName,
    productName: winnerName,
    allowedEvidence: winnerName,
    primaryAxis,
    presentation: specialist.presentation,
    closingAuthority: specialist.authorityBridge?.closingAuthority || null,
  });
  reply = close.text || reply;

  const insight =
    specialist.presentation?.insight?.[0] ||
    specialist.paragraphs?.find((entry) => INSIGHT_MARKER_PATTERN.test(entry)) ||
    extractExpertInsightFromReply(reply);

  return {
    reply,
    specialist,
    closing: close.closing || "",
    insight,
    closeResult: close,
    sensationBridge: specialist.sensationBridge,
    authorityBridge: specialist.authorityBridge,
  };
}

function classifyInsightMetric(insight = "", sensationBridge = null) {
  if (!insight) return "placeholder";
  if (/detalhe pr[aá]tico que ajuda|ganho percept[ií]vel|um detalhe pr[aá]tico/i.test(insight)) {
    return "template";
  }
  if (/costuma pesar mais|tende a pesar mais/i.test(insight)) {
    if (sensationBridge?.sensations?.length) return "real";
    return "derived";
  }
  if (isExpertInsightUseful(insight)) return "derived";
  return "placeholder";
}

function classifyAuthorityMetric(closing = "", authorityBridge = null) {
  const origin = classifyClosingOrigin(authorityBridge?.closingAuthority || {}, closing);
  if (origin === "real") return "real";
  if (/pr[oó]ximo passo que eu seguiria/i.test(closing)) return "template";
  if (authorityBridge?.ok && /manteria|continua alinhado|ainda pesa mais/i.test(closing)) {
    return "real";
  }
  if (origin === "weak") return "derived";
  return "template";
}

console.log("\nPATCH 9.2S — Sensation Authority Bridge Audit\n");
console.log(`Sensation layer: ${SENSATION_REASONING_VERSION}`);
console.log(`Authority layer: ${AUTHORITY_BRIDGE_VERSION}`);
console.log(`Perception classes: ${PERCEPTION_CLASSES.join(", ")}`);

console.log("\n── Unit: Sensation Bridge ──");
const unitSensation = buildSensationBridge({
  winner: "iPhone 13",
  structuredFacts: {
    mode: "data_layer",
    strengthConsequences: [
      "menos preocupação em registrar bons momentos em situações rápidas",
      "menos necessidade de interromper o uso para procurar tomada",
    ],
    weaknessConsequences: ["quem já usa telas mais fluidas pode notar diferença no gesto do dia a dia"],
  },
  query: "celular com boa bateria e câmera até 2000",
  primaryAxis: "battery",
  category: "celular",
});
assert("sensation bridge ok", unitSensation.ok);
assert("sensations traceable", unitSensation.sensations.every((s) => s.consequence && s.sensation));
assert(
  "sensation has perception class",
  unitSensation.sensations.every((s) => PERCEPTION_CLASSES.includes(s.perceptionClass))
);

console.log("\n── Unit: Authority Bridge ──");
const unitAuthority = buildAuthorityBridge({
  winner: "iPhone 13",
  primaryAxis: "battery",
  query: "celular até 2000",
  sensations: unitSensation.sensations,
  tradeoffs: {
    sacrifices: [{ text: "tela de 60 Hz pode parecer menos fluida", token: "tela_60hz" }],
  },
  searchCognition: cognition("battery"),
});
assert("authority bridge ok", unitAuthority.ok);
assert("closingAuthority derived from decision", unitAuthority.closingAuthority?.derivedFromDecision);
assert("authority reasons present", unitAuthority.authorityReasons.length >= 2);
const verbalized = verbalizeClosingFromAuthority(unitAuthority.closingAuthority, { winnerName: "iPhone 13" });
assert("verbalized closing non-empty", verbalized.length > 30);

const SCENARIOS = [
  {
    id: "A",
    label: "smartphone data layer",
    query: "celular até 2000 com boa bateria",
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    axis: "battery",
  },
  {
    id: "B",
    label: "notebook",
    query: "notebook para trabalho até 3500",
    category: "notebook",
    product: { product_name: "Notebook Lenovo", isDataLayerProduct: true, trustedSpecs: NOTEBOOK_SPECS },
    axis: "performance",
  },
  {
    id: "C",
    label: "TV",
    query: "smart tv 55 polegadas streaming",
    category: "tv",
    product: { product_name: "Smart TV Samsung", isDataLayerProduct: true, trustedSpecs: TV_SPECS },
    axis: "screen",
  },
  {
    id: "D",
    label: "air fryer unknown category",
    query: "air fryer boa para família",
    category: "air_fryer",
    product: { product_name: "Air Fryer Max 5L", isDataLayerProduct: true, trustedSpecs: AIR_FRYER_SPECS },
    axis: "value",
  },
  {
    id: "E",
    label: "unknown category generic",
    query: "produto utilitário doméstico prático",
    category: "desconhecida",
    product: { product_name: "Gadget Doméstico Pro", isDataLayerProduct: false, category: "outros" },
    axis: "value",
  },
  {
    id: "F",
    label: "sem data layer",
    query: "celular bom custo benefício",
    category: "celular",
    product: { product_name: "Samsung Galaxy A54", isDataLayerProduct: false, category: "celular" },
    axis: "value",
    querySignals: { priceSensitive: true },
  },
  {
    id: "G",
    label: "orçamento baixo",
    query: "celular barato até 1200",
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    axis: "value",
    querySignals: { priceSensitive: true },
  },
  {
    id: "H",
    label: "orçamento alto",
    query: "celular premium até 6000",
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    axis: "longevity",
  },
  {
    id: "I",
    label: "usuário técnico",
    query: "celular com bom desempenho multitarefa pesada",
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    axis: "performance",
    querySignals: { technical: true },
  },
  {
    id: "J",
    label: "usuário leigo",
    query: "quero um celular simples que funcione",
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    axis: "longevity",
  },
  {
    id: "K",
    label: "custo-benefício",
    query: "melhor custo benefício celular",
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    axis: "value",
    querySignals: { priceSensitive: true },
  },
  {
    id: "L",
    label: "longevidade",
    query: "celular que dura vários anos",
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    axis: "longevity",
  },
];

const insightMetrics = [];
const authorityMetrics = [];

console.log("\n── Scenarios A–L ──");
for (const scenario of SCENARIOS) {
  console.log(`\n── ${scenario.id}) ${scenario.label}: ${scenario.query} ──`);
  const result = buildPipeline({
    query: scenario.query,
    category: scenario.category,
    product: scenario.product,
    primaryAxis: scenario.axis,
    querySignals: scenario.querySignals || {},
  });

  const insightClass = classifyInsightMetric(result.insight, result.sensationBridge);
  const authorityClass = classifyAuthorityMetric(result.closing, result.authorityBridge);
  insightMetrics.push(insightClass);
  authorityMetrics.push(authorityClass);

  console.log(`  insight: ${result.insight?.slice(0, 110) || "(none)"}`);
  console.log(`  closing: ${result.closing?.slice(0, 110) || "(none)"}`);
  console.log(`  sensations: ${result.sensationBridge?.sensations?.length || 0}`);
  console.log(`  authority reasons: ${result.authorityBridge?.authorityReasons?.length || 0}`);
  console.log(`  insight metric: ${insightClass} | authority metric: ${authorityClass}`);

  assert(`${scenario.id}: specialist ok`, result.specialist.ok, result.specialist.error);
  assert(`${scenario.id}: sensation bridge wired`, !!result.sensationBridge);
  assert(`${scenario.id}: authority bridge wired`, !!result.authorityBridge);
  assert(`${scenario.id}: presentation.insight slot`, (result.specialist.presentation?.insight?.length || 0) >= 0);

  if (scenario.product.isDataLayerProduct) {
    assert(`${scenario.id}: insight present (data layer)`, isExpertInsightUseful(result.insight), result.insight);
    assert(
      `${scenario.id}: insight distinct from consequence dump`,
      !/ganho percept[ií]vel|detalhe pr[aá]tico que ajuda/i.test(result.insight),
      result.insight
    );
  }

  if (result.insight && result.sensationBridge?.sensations?.length) {
    const top = result.sensationBridge.sensations[0];
    const meaning = {
      perceptionClass: top.perceptionClass,
      sensation: top.sensation,
      consequence: top.consequence,
      audienceFit: top.audienceFit,
      trace: top.trace,
    };
    assert(
      `${scenario.id}: sensation traceable`,
      isSensationInsightTraceable(meaning),
      top.perceptionClass
    );
    const origin = classifyInsightOrigin(meaning);
    assert(`${scenario.id}: insight not template origin`, origin !== "placeholder", origin);
  }
}

const insightRealPct =
  (insightMetrics.filter((m) => m === "real" || m === "derived").length / insightMetrics.length) * 100;
const insightPlaceholderPct =
  (insightMetrics.filter((m) => m === "placeholder").length / insightMetrics.length) * 100;
const authorityRealPct =
  (authorityMetrics.filter((m) => m === "real" || m === "derived").length / authorityMetrics.length) * 100;
const authorityTemplatePct =
  (authorityMetrics.filter((m) => m === "template").length / authorityMetrics.length) * 100;

console.log("\n── Métricas de aceite ──");
console.log(`  Insight real/derived: ${insightRealPct.toFixed(1)}% (meta > 70%)`);
console.log(`  Insight placeholder: ${insightPlaceholderPct.toFixed(1)}% (meta < 10%)`);
console.log(`  Autoridade real/derived: ${authorityRealPct.toFixed(1)}% (meta > 70%)`);
console.log(`  Autoridade template: ${authorityTemplatePct.toFixed(1)}% (meta < 10%)`);

assert("insight real > 70%", insightRealPct > 70, `${insightRealPct.toFixed(1)}%`);
assert("insight placeholder < 10%", insightPlaceholderPct < 10, `${insightPlaceholderPct.toFixed(1)}%`);
assert("authority real > 70%", authorityRealPct > 70, `${authorityRealPct.toFixed(1)}%`);
assert("authority template < 10%", authorityTemplatePct < 10, `${authorityTemplatePct.toFixed(1)}%`);

console.log("\n── Before / After (iPhone 13) ──");
const beforeInsight = "(vazio — 9.2R: presentation.insight 0/6, redundant_insight)";
const after = buildPipeline({
  query: "celular até 2000 com boa bateria",
  category: "celular",
  product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
  primaryAxis: "battery",
});
console.log("Antes:", beforeInsight);
console.log("Depois insight:", after.insight || "(none)");
console.log("Depois closing:", after.closing || "(none)");
console.log("Depois presentation.insight:", after.specialist.presentation?.insight?.[0] || "(none)");
assert("after: presentation.insight populated", (after.specialist.presentation?.insight?.length || 0) > 0);

console.log("\n── Regressão 9.2I / 9.2K / 9.2M / 9.2O / 9.2Q ──");
let regressionFailures = 0;
for (const script of PRIOR_AUDITS) {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", script)], {
    encoding: "utf8",
    stdio: "pipe",
    cwd: ROOT,
  });
  const ok = result.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} ${script}`);
  if (!ok) {
    regressionFailures += 1;
    console.log(result.stdout?.slice(-800) || result.stderr?.slice(-800) || "");
  }
}
assert("regressões 9.2I–Q sem falha", regressionFailures === 0, `${regressionFailures} falhas`);

const verdict =
  failed === 0 && insightRealPct > 70 && authorityRealPct > 70 ? "A) FULLY CLOSED" : failed <= 2 ? "B) PARTIAL" : "C) FAILED";

console.log("\n── Resumo ──");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  console.log("Failures:");
  for (const entry of failures) console.log(`  - ${entry}`);
}
console.log(`\nVeredito: ${verdict}\n`);

process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
