/**
 * PATCH 9.2W — Authority Closing Contract Audit
 *
 * Usage:
 *   node scripts/test-mia-authority-closing-contract-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { buildSensationBridge } from "../lib/miaSensationReasoningLayer.js";
import { buildHumanExperienceModel } from "../lib/miaHumanSensationReasoningLayer.js";
import { buildHumanFrictionModel } from "../lib/miaHumanFrictionModelingLayer.js";
import { buildOwnershipExperienceModel } from "../lib/miaOwnershipExperienceLayer.js";
import { buildAuthorityBridge } from "../lib/miaAuthorityBridgeLayer.js";
import {
  buildAuthorityClosingContract,
  calculateAuthorityRelevance,
  selectPrimaryAuthority,
  AUTHORITY_CLASSES,
  isAuthorityTraceable,
  classifyAuthorityOrigin,
  isContractGovernedClosing,
  AUTHORITY_CLOSING_CONTRACT_VERSION,
} from "../lib/miaAuthorityClosingContract.js";
import { classifyClosingOrigin, verbalizeClosingFromAuthority } from "../lib/miaAuthorityBridgeLayer.js";
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
  "test-mia-ownership-experience-audit.js",
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
    dominance: axis === "performance" ? "clear" : "moderate",
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
  if (!specialist.ok) return { specialist, reply: "", closing: "", insight: "" };

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

  return {
    specialist,
    reply,
    closing: close.closing || "",
    closeResult: close,
    insight,
  };
}

function classifyAuthorityMetric(closing = "", contract = null, authorityBridge = null) {
  const closingAuthority = contract?.closingAuthority || authorityBridge?.closingAuthority || {};
  if (/pr[oó]ximo passo que eu seguiria/i.test(closing)) return "template";
  if (isContractGovernedClosing(closingAuthority) && isAuthorityTraceable(closingAuthority)) {
    const origin = classifyAuthorityOrigin(closingAuthority);
    if (origin === "real" || origin === "derived") return "real";
  }
  const bridgeOrigin = classifyClosingOrigin(closingAuthority, closing);
  if (bridgeOrigin === "real") return "real";
  if (/manteria|continua alinhado|ainda pesa mais/i.test(closing)) return "real";
  if (bridgeOrigin === "weak") return "derived";
  return "template";
}

console.log("\nPATCH 9.2W — Authority Closing Contract Audit\n");
console.log(`Contract layer: ${AUTHORITY_CLOSING_CONTRACT_VERSION}`);
console.log(`Authority classes: ${AUTHORITY_CLASSES.join(", ")}`);

console.log("\n── Unit: Authority Closing Contract ──");
const bridge = buildSensationBridge({
  winner: "iPhone 13",
  structuredFacts: {
    mode: "data_layer",
    strengthConsequences: ["menos necessidade de interromper o uso para procurar tomada"],
    weaknessConsequences: ["quem já usa telas mais fluidas pode notar diferença no gesto do dia a dia"],
  },
  query: "celular até 2000",
  primaryAxis: "battery",
});
const experienceModel = buildHumanExperienceModel({
  winner: "iPhone 13",
  sensations: bridge.sensations,
  query: "celular até 2000",
  primaryAxis: "battery",
});
const frictionModel = buildHumanFrictionModel({
  winner: "iPhone 13",
  sensations: bridge.sensations,
  experiences: experienceModel.experiences,
  tradeoffs: { sacrifices: [{ text: "tela de 60 Hz pode parecer menos fluida", token: "tela_60hz" }] },
  query: "celular até 2000",
  primaryAxis: "battery",
});
const ownershipModel = buildOwnershipExperienceModel({
  winner: "iPhone 13",
  sensations: bridge.sensations,
  experiences: experienceModel.experiences,
  frictions: frictionModel.frictions,
  tradeoffs: { sacrifices: [{ text: "tela de 60 Hz pode parecer menos fluida", token: "tela_60hz" }] },
  query: "celular até 2000",
  primaryAxis: "battery",
});
const authorityBridge = buildAuthorityBridge({
  winner: "iPhone 13",
  primaryAxis: "battery",
  query: "celular até 2000",
  sensations: bridge.sensations,
  tradeoffs: { sacrifices: [{ text: "tela de 60 Hz pode parecer menos fluida", token: "tela_60hz" }] },
  searchCognition: cognition("battery"),
});
const contract = buildAuthorityClosingContract({
  winner: "iPhone 13",
  sensations: bridge.sensations,
  experiences: experienceModel.experiences,
  frictions: frictionModel.frictions,
  ownershipExperiences: ownershipModel.ownershipExperiences,
  authorityBridge,
  tradeoffs: { sacrifices: [{ text: "tela de 60 Hz pode parecer menos fluida", token: "tela_60hz" }] },
  query: "celular até 2000",
  primaryAxis: "battery",
  searchCognition: cognition("battery"),
});
assert("contract ok", contract.ok);
assert("contract governed", contract.closingAuthority?.contractGoverned === true);
assert("authority traceable", isAuthorityTraceable(contract.closingAuthority));
assert(
  "full chain token→consequence→sensation→experience/friction→ownership→authority",
  contract.closingAuthority?.trace?.consequence &&
    contract.closingAuthority?.trace?.sensation &&
    (contract.closingAuthority?.trace?.experience || contract.closingAuthority?.trace?.friction) &&
    contract.closingAuthority?.trace?.authority
);
assert("tradeoff considered", Boolean(contract.closingAuthority?.tradeoffAcceptance));
assert("dominance considered", Boolean(contract.closingAuthority?.dominanceSupport));
assert("ownership considered", Boolean(contract.closingAuthority?.ownershipSupport));

const verbalized = verbalizeClosingFromAuthority(contract.closingAuthority, { winnerName: "iPhone 13" });
assert("verbalized closing non-empty", verbalized.length > 20);

console.log("\n── Authority Selection Engine ──");
const valueAuth = selectPrimaryAuthority(contract.authorities, {
  query: "celular custo benefício",
  primaryAxis: "value",
});
const longevityAuth = selectPrimaryAuthority(contract.authorities, {
  query: "celular para usar vários anos",
  primaryAxis: "longevity",
});
console.log(`  custo-benefício: ${valueAuth?.authorityClass || "(none)"}`);
console.log(`  longevidade: ${longevityAuth?.authorityClass || "(none)"}`);
assert(
  "authority varia por contexto",
  valueAuth?.authorityClass !== longevityAuth?.authorityClass ||
    valueAuth?.contextualRelevance !== longevityAuth?.contextualRelevance
);

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

const FOCUS_SCENARIOS = [
  { id: "focus-A", label: "custo-benefício", query: "celular custo benefício até 2000", axis: "value", querySignals: { priceSensitive: true } },
  { id: "focus-B", label: "longevidade", query: "celular para usar vários anos", axis: "longevity", querySignals: {} },
  { id: "focus-C", label: "desempenho", query: "celular desempenho gamer", axis: "performance", querySignals: { technical: true } },
  { id: "focus-D", label: "evitar arrependimento", query: "celular sem arrependimento", axis: "value", querySignals: { avoidRegret: true } },
  { id: "focus-E", label: "praticidade", query: "celular simples para o dia a dia", axis: "value", querySignals: {} },
  { id: "focus-F", label: "usuário técnico", query: "celular specs 120hz processador", axis: "performance", querySignals: { technical: true } },
  { id: "focus-G", label: "usuário leigo", query: "celular fácil de usar", axis: "value", querySignals: {} },
];

const authorityMetrics = [];

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

  const contractModel = result.specialist.authorityClosingContract;
  const closingAuthority = contractModel?.closingAuthority || result.specialist.authorityBridge?.closingAuthority;
  const metric = classifyAuthorityMetric(result.closing, contractModel, result.specialist.authorityBridge);
  authorityMetrics.push(metric);

  console.log(`  authorityClass: ${closingAuthority?.authorityClass || "(none)"}`);
  console.log(`  confidence: ${closingAuthority?.authorityConfidence?.toFixed(2) || "n/a"}`);
  console.log(`  closing mode: ${result.closeResult?.mode || "n/a"}`);
  console.log(`  metric: ${metric}`);

  assert(`${scenario.id}: specialist ok`, result.specialist.ok);
  assert(`${scenario.id}: contract wired`, contractModel?.contractGoverned === true);
  assert(`${scenario.id}: contract traceable`, isAuthorityTraceable(closingAuthority));
  assert(`${scenario.id}: not meta template`, !/pr[oó]ximo passo que eu seguiria/i.test(result.closing));
  if (scenario.product.isDataLayerProduct || scenario.id === "H") {
    assert(`${scenario.id}: insight still present`, isExpertInsightUseful(result.insight));
  }
}

console.log("\n── Focus scenarios ──");
const profileExamples = [];
for (const scenario of FOCUS_SCENARIOS) {
  const result = buildPipeline({
    query: scenario.query,
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    primaryAxis: scenario.axis,
    querySignals: scenario.querySignals,
  });
  const auth = result.specialist.authorityClosingContract?.closingAuthority;
  console.log(
    `  ${scenario.id} ${scenario.label}: ${auth?.authorityClass || "(none)"} conf=${auth?.authorityConfidence?.toFixed(2) || "n/a"}`
  );
  assert(`${scenario.id}: authority populated`, Boolean(auth?.authorityClass));
  profileExamples.push({
    label: scenario.label,
    authorityClass: auth?.authorityClass,
    confidence: auth?.authorityConfidence,
  });
}

const valueFocus = profileExamples.find((e) => e.label.includes("custo-benefício"));
const perfFocus = profileExamples.find((e) => e.label.includes("desempenho"));
assert(
  "authority diferente por perfil",
  valueFocus?.authorityClass !== perfFocus?.authorityClass ||
    valueFocus?.confidence !== perfFocus?.confidence
);

const realPct =
  (authorityMetrics.filter((m) => m === "real" || m === "derived").length / authorityMetrics.length) * 100;
const templatePct =
  (authorityMetrics.filter((m) => m === "template").length / authorityMetrics.length) * 100;

console.log("\n── Métricas de aceite ──");
console.log(`  Authority real/derived: ${realPct.toFixed(1)}% (meta > 85%)`);
console.log(`  Authority template: ${templatePct.toFixed(1)}% (meta < 10%)`);
assert("authority real > 85%", realPct > 85, `${realPct.toFixed(1)}%`);
assert("authority template < 10%", templatePct < 10, `${templatePct.toFixed(1)}%`);

console.log("\n── Before / After ──");
const after = buildPipeline({
  query: "celular até 2000 tela fluida",
  category: "celular",
  product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
  primaryAxis: "screen",
});
console.log("Antes (9.2V): ownership modelado, autoridade sem contrato formal");
console.log("Depois authorityClass:", after.specialist.authorityClosingContract?.closingAuthority?.authorityClass);
console.log("Depois contractGoverned:", after.specialist.authorityClosingContract?.contractGoverned);
assert("after: contract governed", after.specialist.authorityClosingContract?.contractGoverned === true);

console.log("\n── Regressão 9.2I–V ──");
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
  }
}
assert("regressões sem falha", regressionFailures === 0, `${regressionFailures} falhas`);

const verdict =
  failed === 0 && realPct > 85 && templatePct < 10
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
