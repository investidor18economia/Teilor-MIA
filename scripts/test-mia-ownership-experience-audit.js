/**
 * PATCH 9.2V — Ownership Experience Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-ownership-experience-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { buildSensationBridge } from "../lib/miaSensationReasoningLayer.js";
import { buildHumanExperienceModel } from "../lib/miaHumanSensationReasoningLayer.js";
import { buildHumanFrictionModel } from "../lib/miaHumanFrictionModelingLayer.js";
import {
  buildOwnershipExperienceModel,
  calculateOwnershipRelevance,
  OWNERSHIP_CLASSES,
  TIME_HORIZONS,
  isOwnershipTraceable,
  classifyOwnershipOrigin,
  OWNERSHIP_EXPERIENCE_VERSION,
} from "../lib/miaOwnershipExperienceLayer.js";
import {
  extractExpertInsightFromReply,
  isExpertInsightUseful,
  INSIGHT_MARKER_PATTERN,
} from "../lib/miaExpertInsightGenerationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { finalizeReplyWithRepetitionCompression } from "../lib/miaRepetitionCompressionGuard.js";
import { finalizeReplyWithConversationalClosing } from "../lib/miaConversationalClosingEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PRIOR_AUDITS = [
  "test-mia-structure-preserving-repetition-compression-audit.js",
  "test-mia-consequence-translation-recovery-audit.js",
  "test-mia-semantic-family-allocation-engine-audit.js",
  "test-mia-specialist-presentation-recovery-audit.js",
  "test-mia-specialist-wire-contract-preservation-audit.js",
  "test-mia-sensation-authority-bridge-audit.js",
  "test-mia-human-sensation-reasoning-audit.js",
  "test-mia-human-friction-modeling-audit.js",
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

const MONITOR_SPECS = {
  official_name: "Monitor LG UltraGear 27",
  category: "monitor",
  strengths: ["fluidez boa para uso prolongado em home office"],
  ideal_for: ["quem passa o dia inteiro em frente ao monitor"],
  weaknesses: ["não é o topo para edição de cor profissional"],
};

const MOUSE_SPECS = {
  official_name: "Mouse Logitech MX Master",
  category: "mouse",
  strengths: ["ergonomia confortável para uso prolongado no computador"],
  ideal_for: ["quem trabalha várias horas com mouse no dia a dia"],
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

function cognition(axis = "performance") {
  return {
    primaryAxis: axis,
    consequenceChain: {
      impact: "mais folga no uso pesado do dia a dia",
      consequence: "menos chance de sentir limitação depois de alguns meses",
    },
  };
}

function buildPipeline({ query, category, product, primaryAxis = "performance", querySignals = {} }) {
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
  if (!specialist.ok) return { specialist, reply: "", insight: "" };

  let reply = specialist.text;
  reply =
    appendUserIntentDiscovery({ reply, ...ctx, routingDecision: { allowNewSearch: true } }).reply || reply;

  const comp = finalizeReplyWithRepetitionCompression({
    reply,
    query,
    winnerName: product.trustedSpecs?.official_name || product.product_name,
    allowedEvidence: product.trustedSpecs?.official_name || product.product_name,
    primaryAxis,
    responsePath: "return_seguro",
  });
  reply = comp.text || reply;

  const close = finalizeReplyWithConversationalClosing({
    reply,
    ...ctx,
    winnerName: product.trustedSpecs?.official_name || product.product_name,
    productName: product.trustedSpecs?.official_name || product.product_name,
    allowedEvidence: product.trustedSpecs?.official_name || product.product_name,
    primaryAxis,
    presentation: specialist.presentation,
    closingAuthority: specialist.authorityBridge?.closingAuthority || null,
  });
  reply = close.text || reply;

  const insight =
    specialist.presentation?.insight?.[0] ||
    specialist.paragraphs?.find((entry) => INSIGHT_MARKER_PATTERN.test(entry)) ||
    extractExpertInsightFromReply(reply);

  return { specialist, reply, insight };
}

function classifyOwnershipMetric(ownership = null) {
  if (!ownership) return "placeholder";
  const origin = classifyOwnershipOrigin(ownership);
  if (origin === "placeholder" || origin === "pseudo") return origin;
  return "real";
}

console.log("\nPATCH 9.2V — Ownership Experience Layer Audit\n");
console.log(`Ownership layer: ${OWNERSHIP_EXPERIENCE_VERSION}`);
console.log(`Ownership classes: ${OWNERSHIP_CLASSES.join(", ")}`);
console.log(`Time horizons: ${TIME_HORIZONS.join(", ")}`);

console.log("\n── Unit: Ownership Model ──");
const bridge = buildSensationBridge({
  winner: "iPhone 13",
  structuredFacts: {
    mode: "data_layer",
    strengthConsequences: ["menos necessidade de interromper o uso para procurar tomada"],
    weaknessConsequences: ["quem já usa telas mais fluidas pode notar diferença no gesto do dia a dia"],
  },
  query: "celular até 2000",
  primaryAxis: "screen",
});
const experienceModel = buildHumanExperienceModel({
  winner: "iPhone 13",
  sensations: bridge.sensations,
  query: "celular até 2000",
  primaryAxis: "screen",
});
const frictionModel = buildHumanFrictionModel({
  winner: "iPhone 13",
  sensations: bridge.sensations,
  experiences: experienceModel.experiences,
  tradeoffs: { sacrifices: [{ text: "tela de 60 Hz pode parecer menos fluida", token: "tela_60hz" }] },
  query: "celular até 2000",
  primaryAxis: "screen",
});
const ownershipModel = buildOwnershipExperienceModel({
  winner: "iPhone 13",
  sensations: bridge.sensations,
  experiences: experienceModel.experiences,
  frictions: frictionModel.frictions,
  tradeoffs: { sacrifices: [{ text: "tela de 60 Hz pode parecer menos fluida", token: "tela_60hz" }] },
  query: "celular até 2000",
  primaryAxis: "screen",
});
assert("ownership model ok", ownershipModel.ok);
assert(
  "ownership traceable",
  ownershipModel.ownershipExperiences.every((entry) => isOwnershipTraceable(entry))
);
assert(
  "full chain token→consequence→sensation→experience/friction→ownership",
  ownershipModel.ownershipExperiences.every(
    (entry) =>
      entry.sourceConsequence &&
      entry.sensation &&
      (entry.sourceExperience || entry.sourceFriction) &&
      entry.ownershipMeaning &&
      entry.timeHorizon
  )
);

console.log("\n── Ownership Relevance Engine ──");
const topOwnership = ownershipModel.ownershipExperiences[0];
const longTermRelevance = calculateOwnershipRelevance(topOwnership, {
  query: "celular para usar vários anos",
  primaryAxis: "longevity",
});
const upgradeRelevance = calculateOwnershipRelevance(topOwnership, {
  query: "troco de celular todo ano",
  primaryAxis: "value",
});
console.log(`  top ownership — usuário longo prazo: ${longTermRelevance.toFixed(2)}`);
console.log(`  top ownership — troca frequente: ${upgradeRelevance.toFixed(2)}`);
assert("relevance varia por contexto de posse", longTermRelevance !== upgradeRelevance);

const SCENARIOS = [
  { id: "A", label: "smartphone", query: "celular até 2000 bateria", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS }, axis: "battery" },
  { id: "B", label: "notebook", query: "notebook trabalho", category: "notebook", product: { product_name: "Notebook Lenovo", isDataLayerProduct: true, trustedSpecs: NOTEBOOK_SPECS }, axis: "performance" },
  { id: "C", label: "TV", query: "smart tv streaming", category: "tv", product: { product_name: "Smart TV Samsung", isDataLayerProduct: true, trustedSpecs: TV_SPECS }, axis: "screen" },
  { id: "D", label: "air fryer", query: "air fryer família", category: "air_fryer", product: { product_name: "Air Fryer Max 5L", isDataLayerProduct: true, trustedSpecs: AIR_FRYER_SPECS }, axis: "value" },
  { id: "E", label: "monitor", query: "monitor home office", category: "monitor", product: { product_name: "Monitor LG", isDataLayerProduct: true, trustedSpecs: MONITOR_SPECS }, axis: "screen" },
  { id: "F", label: "mouse", query: "mouse ergonômico", category: "mouse", product: { product_name: "Mouse Logitech", isDataLayerProduct: true, trustedSpecs: MOUSE_SPECS }, axis: "comfort" },
  { id: "G", label: "categoria desconhecida", query: "produto doméstico prático", category: "outros", product: { product_name: "Gadget Pro", isDataLayerProduct: false, category: "outros" }, axis: "value" },
  { id: "H", label: "sem data layer", query: "celular custo benefício", category: "celular", product: { product_name: "Samsung A54", isDataLayerProduct: false, category: "celular" }, axis: "value", querySignals: { priceSensitive: true } },
];

const CONTEXT_SCENARIOS = [
  { id: "ctx-A", label: "usuário quer usar por anos", query: "celular para usar vários anos", axis: "longevity", querySignals: {} },
  { id: "ctx-B", label: "usuário troca com frequência", query: "troco de celular todo ano", axis: "value", querySignals: {} },
  { id: "ctx-C", label: "orçamento apertado", query: "celular barato até 1500", axis: "value", querySignals: { priceSensitive: true } },
  { id: "ctx-D", label: "aceita tradeoff se economizar", query: "celular aceito abrir mão de tela se economizar", axis: "value", querySignals: { acceptsTradeoff: true } },
  { id: "ctx-E", label: "evitar arrependimento", query: "celular sem arrependimento depois", axis: "value", querySignals: { avoidRegret: true } },
  { id: "ctx-F", label: "usuário técnico", query: "celular specs 120hz processador", axis: "performance", querySignals: { technical: true } },
  { id: "ctx-G", label: "usuário leigo", query: "celular simples para o dia a dia", axis: "value", querySignals: {} },
];

const ownershipMetrics = [];

console.log("\n── Scenarios A–H ──");
for (const scenario of SCENARIOS) {
  console.log(`\n── ${scenario.id}) ${scenario.label} ──`);
  const result = buildPipeline({
    query: scenario.query,
    category: scenario.category,
    product: scenario.product,
    primaryAxis: scenario.axis,
    querySignals: scenario.querySignals || {},
  });

  const model = result.specialist.ownershipExperienceModel;
  const top = model?.ownershipExperiences?.[0] || null;
  const metric = classifyOwnershipMetric(top);
  ownershipMetrics.push(metric);

  console.log(`  ownerships: ${model?.ownershipExperiences?.length || 0}`);
  console.log(
    `  top: ${top?.ownershipClass || "(none)"} [${top?.timeHorizon || ""}] — ${top?.ownershipMeaning?.slice(0, 70) || ""}`
  );
  console.log(`  relevance: ${top?.contextualRelevance?.toFixed(2) || "n/a"}`);
  console.log(`  metric: ${metric}`);

  assert(`${scenario.id}: specialist ok`, result.specialist.ok);
  assert(`${scenario.id}: ownershipExperienceModel wired`, !!model?.ok);
  assert(`${scenario.id}: ownerships non-empty`, (model?.ownershipExperiences?.length || 0) > 0);
  assert(
    `${scenario.id}: all traceable`,
    model?.ownershipExperiences?.every((entry) => isOwnershipTraceable(entry))
  );
  if (top) {
    assert(`${scenario.id}: context considered`, top.contextualRelevance > 0);
    assert(`${scenario.id}: time horizon defined`, TIME_HORIZONS.includes(top.timeHorizon));
  }
  if (scenario.product.isDataLayerProduct || scenario.id === "H") {
    assert(`${scenario.id}: insight still present`, isExpertInsightUseful(result.insight));
  }
}

console.log("\n── Context scenarios ──");
const profileExamples = [];
for (const scenario of CONTEXT_SCENARIOS) {
  const result = buildPipeline({
    query: scenario.query,
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    primaryAxis: scenario.axis,
    querySignals: scenario.querySignals,
  });
  const top = result.specialist.ownershipExperienceModel?.ownershipExperiences?.[0];
  console.log(
    `  ${scenario.id} ${scenario.label}: ${top?.ownershipClass || "(none)"} rel=${top?.contextualRelevance?.toFixed(2) || "n/a"}`
  );
  assert(`${scenario.id}: ownership populated`, !!top);
  profileExamples.push({
    label: scenario.label,
    ownershipClass: top?.ownershipClass,
    relevance: top?.contextualRelevance,
  });
}

const longTerm = profileExamples.find((entry) => entry.label.includes("anos"));
const frequent = profileExamples.find((entry) => entry.label.includes("frequência"));
assert(
  "ownership diferente por perfil de posse",
  longTerm?.ownershipClass !== frequent?.ownershipClass ||
    longTerm?.relevance !== frequent?.relevance
);

const realPct =
  (ownershipMetrics.filter((m) => m === "real" || m === "derived").length / ownershipMetrics.length) * 100;
const placeholderPct =
  (ownershipMetrics.filter((m) => m === "placeholder").length / ownershipMetrics.length) * 100;

console.log("\n── Métricas de aceite ──");
console.log(`  Ownership real/derived: ${realPct.toFixed(1)}% (meta > 80%)`);
console.log(`  Ownership placeholder: ${placeholderPct.toFixed(1)}% (meta < 10%)`);
assert("ownership real > 80%", realPct > 80, `${realPct.toFixed(1)}%`);
assert("ownership placeholder < 10%", placeholderPct < 10, `${placeholderPct.toFixed(1)}%`);

console.log("\n── Before / After ──");
const after = buildPipeline({
  query: "celular até 2000 tela fluida",
  category: "celular",
  product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
  primaryAxis: "screen",
});
console.log("Antes (9.2U): modelava atrito, não posse ao longo do tempo");
console.log(
  "Depois ownership:",
  after.specialist.ownershipExperienceModel?.ownershipExperiences?.[0]?.ownershipMeaning || "(none)"
);
console.log(
  "Depois horizon:",
  after.specialist.ownershipExperienceModel?.ownershipExperiences?.[0]?.timeHorizon || "(none)"
);
assert(
  "after: ownership model populated",
  (after.specialist.ownershipExperienceModel?.ownershipExperiences?.length || 0) > 0
);

console.log("\n── Regressão 9.2I–U ──");
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
    console.log(result.stdout?.slice(-800) || "");
    console.log(result.stderr?.slice(-400) || "");
  }
}
assert("regressões sem falha", regressionFailures === 0, `${regressionFailures} falhas`);

const verdict =
  failed === 0 && realPct > 80 && placeholderPct < 10
    ? "A) FULLY CLOSED"
    : failed <= 2
      ? "B) PARTIAL"
      : "C) FAILED";

console.log("\n── Resumo ──");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) for (const entry of failures) console.log(`  - ${entry}`);
console.log(`\nVeredito: ${verdict}\n`);

process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
