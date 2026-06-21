/**
 * PATCH 9.2T — Human Sensation Reasoning Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-human-sensation-reasoning-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import {
  buildSensationBridge,
  SENSATION_REASONING_VERSION,
} from "../lib/miaSensationReasoningLayer.js";
import {
  buildHumanExperienceModel,
  EXPERIENCE_CLASSES,
  isExperienceTraceable,
  classifyExperienceOrigin,
  selectInsightExperience,
  HUMAN_SENSATION_REASONING_VERSION,
} from "../lib/miaHumanSensationReasoningLayer.js";
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

function buildPipeline({
  query,
  category,
  product,
  primaryAxis = "performance",
  querySignals = {},
}) {
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
    return { specialist, reply: "", insight: "" };
  }

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

  return { specialist, reply, insight, close };
}

function classifyExperienceMetric(experience = null) {
  if (!experience) return "placeholder";
  const origin = classifyExperienceOrigin(experience);
  if (origin === "placeholder") return "placeholder";
  if (origin === "pseudo") return "pseudo";
  return "real";
}

console.log("\nPATCH 9.2T — Human Sensation Reasoning Layer Audit\n");
console.log(`Sensation layer: ${SENSATION_REASONING_VERSION}`);
console.log(`Human experience layer: ${HUMAN_SENSATION_REASONING_VERSION}`);
console.log(`Experience classes: ${EXPERIENCE_CLASSES.join(", ")}`);

console.log("\n── Unit: Human Experience Model ──");
const unitBridge = buildSensationBridge({
  winner: "iPhone 13",
  structuredFacts: {
    mode: "data_layer",
    strengthConsequences: [
      "menos necessidade de interromper o uso para procurar tomada",
      "menos preocupação em registrar bons momentos em situações rápidas",
    ],
    weaknessConsequences: ["quem já usa telas mais fluidas pode notar diferença no gesto do dia a dia"],
  },
  query: "celular com boa bateria até 2000",
  primaryAxis: "battery",
  category: "celular",
});
const unitModel = buildHumanExperienceModel({
  winner: "iPhone 13",
  sensations: unitBridge.sensations,
  query: "celular com boa bateria até 2000",
  primaryAxis: "battery",
  category: "celular",
  querySignals: { priceSensitive: true },
});
assert("experience model ok", unitModel.ok);
assert(
  "experiences traceable",
  unitModel.experiences.every((entry) => isExperienceTraceable(entry))
);
assert(
  "experience classes valid",
  unitModel.experiences.every((entry) => EXPERIENCE_CLASSES.includes(entry.experienceClass))
);
assert(
  "full chain token→consequence→sensation→experience",
  unitModel.experiences.every(
    (entry) => entry.sourceConsequence && entry.sensation && entry.experience
  )
);

console.log("\n── Context awareness (same product, different priority) ──");
const batteryModel = buildHumanExperienceModel({
  winner: "iPhone 13",
  sensations: unitBridge.sensations,
  query: "celular bateria autonomia",
  primaryAxis: "battery",
});
const cameraModel = buildHumanExperienceModel({
  winner: "iPhone 13",
  sensations: unitBridge.sensations,
  query: "celular câmera fotos",
  primaryAxis: "camera",
});
const topBattery = batteryModel.experiences[0]?.experienceClass || "";
const topCamera = cameraModel.experiences[0]?.experienceClass || "";
assert("battery priority shifts experience", topBattery === "comfort" || topBattery === "friction", topBattery);
assert(
  "camera query surfaces confidence experience",
  cameraModel.experiences.some((entry) => entry.experienceClass === "confidence")
);
assert(
  "context differs between users",
  topBattery !== topCamera || batteryModel.experiences[0]?.contextScore !== cameraModel.experiences[0]?.contextScore
);

const SCENARIOS = [
  {
    id: "A",
    label: "smartphone",
    query: "celular até 2000 com boa bateria",
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    axis: "battery",
  },
  {
    id: "B",
    label: "notebook",
    query: "notebook trabalho até 3500",
    category: "notebook",
    product: { product_name: "Notebook Lenovo", isDataLayerProduct: true, trustedSpecs: NOTEBOOK_SPECS },
    axis: "performance",
  },
  {
    id: "C",
    label: "TV",
    query: "smart tv 55 streaming",
    category: "tv",
    product: { product_name: "Smart TV Samsung", isDataLayerProduct: true, trustedSpecs: TV_SPECS },
    axis: "screen",
  },
  {
    id: "D",
    label: "air fryer",
    query: "air fryer família",
    category: "air_fryer",
    product: { product_name: "Air Fryer Max 5L", isDataLayerProduct: true, trustedSpecs: AIR_FRYER_SPECS },
    axis: "value",
  },
  {
    id: "E",
    label: "monitor",
    query: "monitor home office fluidez",
    category: "monitor",
    product: { product_name: "Monitor LG", isDataLayerProduct: true, trustedSpecs: MONITOR_SPECS },
    axis: "screen",
  },
  {
    id: "F",
    label: "mouse",
    query: "mouse ergonômico trabalho",
    category: "mouse",
    product: { product_name: "Mouse Logitech", isDataLayerProduct: true, trustedSpecs: MOUSE_SPECS },
    axis: "comfort",
  },
  {
    id: "G",
    label: "categoria desconhecida",
    query: "produto utilitário doméstico",
    category: "desconhecida",
    product: { product_name: "Gadget Doméstico Pro", isDataLayerProduct: false, category: "outros" },
    axis: "value",
  },
  {
    id: "H",
    label: "sem data layer",
    query: "celular custo benefício",
    category: "celular",
    product: { product_name: "Samsung Galaxy A54", isDataLayerProduct: false, category: "celular" },
    axis: "value",
    querySignals: { priceSensitive: true },
  },
  {
    id: "I",
    label: "orçamento baixo",
    query: "celular barato até 1200",
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    axis: "value",
    querySignals: { priceSensitive: true },
  },
  {
    id: "J",
    label: "longevidade",
    query: "celular que dura vários anos",
    category: "celular",
    product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
    axis: "longevity",
  },
];

const experienceMetrics = [];

console.log("\n── Scenarios A–J ──");
for (const scenario of SCENARIOS) {
  console.log(`\n── ${scenario.id}) ${scenario.label}: ${scenario.query} ──`);
  const result = buildPipeline({
    query: scenario.query,
    category: scenario.category,
    product: scenario.product,
    primaryAxis: scenario.axis,
    querySignals: scenario.querySignals || {},
  });

  const model = result.specialist.humanExperienceModel;
  const topExperience = model?.experiences?.[0] || null;
  const metric = classifyExperienceMetric(topExperience);
  experienceMetrics.push(metric);

  console.log(`  experiences: ${model?.experiences?.length || 0}`);
  console.log(`  top class: ${topExperience?.experienceClass || "(none)"}`);
  console.log(`  experience: ${topExperience?.experience?.slice(0, 90) || "(none)"}`);
  console.log(`  insight: ${result.insight?.slice(0, 90) || "(none)"}`);
  console.log(`  metric: ${metric}`);

  assert(`${scenario.id}: specialist ok`, result.specialist.ok);
  assert(`${scenario.id}: humanExperienceModel wired`, !!model?.ok);
  assert(`${scenario.id}: experiences non-empty`, (model?.experiences?.length || 0) > 0);
  assert(
    `${scenario.id}: traceable experience`,
    model?.experiences?.every((entry) => isExperienceTraceable(entry))
  );

  if (topExperience) {
    assert(`${scenario.id}: context considered`, topExperience.contextApplied || topExperience.audienceFit || topExperience.contextScore > 0);
    const selected = selectInsightExperience(model.experiences, { primaryAxis: scenario.axis, query: scenario.query }, result.specialist.paragraphs || []);
    assert(`${scenario.id}: selectable insight experience`, !!selected);
  }

  if (scenario.product.isDataLayerProduct || scenario.id === "H") {
    assert(`${scenario.id}: insight present`, isExpertInsightUseful(result.insight), result.insight?.slice(0, 60));
  }
}

const realPct =
  (experienceMetrics.filter((m) => m === "real" || m === "derived").length / experienceMetrics.length) * 100;
const placeholderPct =
  (experienceMetrics.filter((m) => m === "placeholder").length / experienceMetrics.length) * 100;

console.log("\n── Métricas de aceite ──");
console.log(`  Experience real/derived: ${realPct.toFixed(1)}% (meta > 80%)`);
console.log(`  Experience placeholder: ${placeholderPct.toFixed(1)}% (meta < 10%)`);
assert("experience real > 80%", realPct > 80, `${realPct.toFixed(1)}%`);
assert("experience placeholder < 10%", placeholderPct < 10, `${placeholderPct.toFixed(1)}%`);

console.log("\n── Before / After (iPhone 13 bateria) ──");
const after = buildPipeline({
  query: "celular até 2000 com boa bateria",
  category: "celular",
  product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS },
  primaryAxis: "battery",
});
console.log("Antes (9.2S): sensation superficial — insight derivava só de sensation");
console.log("Depois experience:", after.specialist.humanExperienceModel?.experiences?.[0]?.experience || "(none)");
console.log("Depois insight:", after.insight || "(none)");
assert("after: experience deeper than sensation only", !!after.specialist.humanExperienceModel?.experiences?.[0]?.experience);
assert("after: insight uses human experience path", /convivência|gesto|rotina|relação|ajuste|tranquilidade/i.test(after.insight || ""));

console.log("\n── Regressão 9.2I–S ──");
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
    console.log(result.stdout?.slice(-600) || result.stderr?.slice(-600) || "");
  }
}
assert("regressões sem falha", regressionFailures === 0, `${regressionFailures} falhas`);

const verdict =
  failed === 0 && realPct > 80 && placeholderPct < 10 ? "A) FULLY CLOSED" : failed <= 2 ? "B) PARTIAL" : "C) FAILED";

console.log("\n── Resumo ──");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) {
  console.log("Failures:");
  for (const entry of failures) console.log(`  - ${entry}`);
}
console.log(`\nVeredito: ${verdict}\n`);

process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
