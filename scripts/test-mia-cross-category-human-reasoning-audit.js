/**
 * PATCH 9.3A — Cross-Category Human Reasoning Audit (ARCHITECTURAL)
 *
 * Validates cognitive layers 9.2S→9.2Z across categories without creating new layers.
 *
 * Usage:
 *   node scripts/test-mia-cross-category-human-reasoning-audit.js --skip-regressions
 */

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { isSensationInsightTraceable } from "../lib/miaSensationReasoningLayer.js";
import {
  isExperienceTraceable,
  classifyExperienceOrigin,
} from "../lib/miaHumanSensationReasoningLayer.js";
import {
  isFrictionTraceable,
  classifyFrictionOrigin,
} from "../lib/miaHumanFrictionModelingLayer.js";
import {
  isOwnershipTraceable,
  classifyOwnershipOrigin,
} from "../lib/miaOwnershipExperienceLayer.js";
import {
  isAuthorityTraceable,
  classifyAuthorityOrigin,
} from "../lib/miaAuthorityClosingContract.js";
import {
  isNarrativeTraceable,
  classifyNarrativeOrigin,
} from "../lib/miaHumanDecisionNarrativeEngine.js";
import {
  isLongTermSatisfactionTraceable,
  classifyLongTermSatisfactionOrigin,
} from "../lib/miaLongTermSatisfactionReasoningLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SKIP_REGRESSIONS = process.argv.includes("--skip-regressions");

export const CROSS_CATEGORY_AUDIT_VERSION = "9.3A.1";

const CRITICAL_REGRESSIONS = [
  "test-mia-semantic-family-allocation-engine-audit.js",
  "test-mia-specialist-presentation-recovery-audit.js",
  "test-mia-sensation-authority-bridge-audit.js",
  "test-mia-evidence-specificity-guard-audit.js",
  "test-mia-human-decision-narrative-audit.js",
  "test-mia-long-term-satisfaction-audit.js",
];

const COGNITIVE_LAYERS = Object.freeze([
  "consequence",
  "sensation",
  "experience",
  "friction",
  "ownership",
  "authority",
  "narrative",
  "longTermSatisfaction",
]);

const COGNITIVE_LAYER_FILES = Object.freeze([
  "miaConsequenceTranslationLayer.js",
  "miaSensationReasoningLayer.js",
  "miaHumanSensationReasoningLayer.js",
  "miaHumanFrictionModelingLayer.js",
  "miaOwnershipExperienceLayer.js",
  "miaAuthorityClosingContract.js",
  "miaHumanDecisionNarrativeEngine.js",
  "miaLongTermSatisfactionReasoningLayer.js",
]);

const STRUCTURAL_MOBILE_LEAK =
  /\b(ios|android|iphone|smartphone|aparelho principal da linha|ecossistema apple|google play store)\b/i;

const CATEGORY_HARDLOCK =
  /category\s*===\s*['"]celular['"]|category\s*===\s*['"]smartphone['"]|CATEGORY_LOCKED_TO_SMARTPHONE/i;

const SPECS = {
  smartphone: {
    official_name: "iPhone 13",
    category: "celular",
    strengths: [
      "ainda recebe atualizações de sistema como aparelho principal da linha",
      "câmera continua consistente mesmo em fotos noturnas",
      "boa autonomia para um dia inteiro fora de tomada",
    ],
    ideal_for: ["quem prioriza estabilidade e longevidade de software"],
    weaknesses: ["tela de 60 Hz pode parecer menos fluida se você veio de modelos Pro"],
  },
  notebook: {
    official_name: "Notebook Lenovo IdeaPad 3",
    category: "notebook",
    strengths: ["desempenho equilibrado para estudo e trabalho sem travar em multitarefa básica"],
    ideal_for: ["quem precisa de notebook para uso diário sem exagero"],
    weaknesses: ["não é a melhor opção para edição pesada ou jogos exigentes"],
  },
  tv: {
    official_name: "Smart TV Samsung 55 4K",
    category: "tv",
    strengths: ["imagem consistente para streaming de filmes e séries"],
    ideal_for: ["quem assiste filmes e séries"],
    weaknesses: ["apps de streaming podem variar de fluidez entre modelos"],
  },
  monitor: {
    official_name: "Monitor LG UltraGear 27",
    category: "monitor",
    strengths: ["fluidez boa para uso prolongado em home office"],
    ideal_for: ["quem passa o dia inteiro em frente ao monitor"],
    weaknesses: ["não é o topo para edição de cor profissional"],
  },
  mouse: {
    official_name: "Mouse Logitech MX Master",
    category: "mouse",
    strengths: ["ergonomia confortável para uso prolongado no computador"],
    ideal_for: ["quem trabalha várias horas com mouse no dia a dia"],
  },
  teclado: {
    official_name: "Teclado Keychron K2",
    category: "teclado",
    strengths: ["digitação confortável para longas sessões de trabalho"],
    ideal_for: ["quem digita o dia inteiro em home office"],
    weaknesses: ["barulho das teclas pode incomodar em ambientes silenciosos"],
  },
  cadeira: {
    official_name: "Cadeira Ergonomica Flex",
    category: "cadeira",
    strengths: ["apoio lombar ajustável para longas horas sentado"],
    ideal_for: ["quem trabalha várias horas por dia sentado"],
    weaknesses: ["ocupa espaço considerável no ambiente"],
  },
  air_fryer: {
    official_name: "Air Fryer Max 5L",
    category: "air_fryer",
    strengths: "boa_capacidade;facil_limpeza;baixo_consumo",
    ideal_for: "familia_media;cozinha_pratica",
    weaknesses: "ocupa_bancada",
  },
  geladeira: {
    official_name: "Geladeira Brastemp Frost Free",
    category: "geladeira",
    strengths: ["capacidade adequada para família média sem desperdício de espaço"],
    ideal_for: ["família que precisa de espaço interno organizado"],
    weaknesses: ["consumo de energia pode pesar na conta mensal"],
  },
  maquina_lavar: {
    official_name: "Lavadora Electrolux 12kg",
    category: "maquina_lavar",
    strengths: ["capacidade para roupas da família sem precisar dividir ciclos"],
    ideal_for: ["família com volume alto de roupa semanal"],
    weaknesses: ["ciclo longo pode atrasar a rotina em dias corridos"],
  },
  camera: {
    official_name: "Canon EOS M50",
    category: "camera",
    strengths: ["qualidade de imagem consistente para registros em viagens"],
    ideal_for: ["quem quer fotografar sem depender do celular"],
    weaknesses: ["lentes extras elevam o investimento total"],
  },
};

const FUTURE_SPECS = {
  aspirador_robo: {
    official_name: "Robô Aspirador X1",
    category: "aspirador_robo",
    strengths: ["limpeza autônoma do piso sem exigir presença constante"],
    ideal_for: ["quem quer menos tempo gasto com limpeza diária"],
    weaknesses: ["precisa de manutenção periódica dos reservatórios"],
  },
  bicicleta: {
    official_name: "Bike Ergométrica Pro",
    category: "bicicleta_ergometrica",
    strengths: ["treino cardiovascular em casa sem depender de clima"],
    ideal_for: ["quem quer exercício regular em apartamento"],
    weaknesses: ["ocupa espaço fixo na sala ou quarto"],
  },
  impressora: {
    official_name: "Impressora HP LaserJet",
    category: "impressora",
    strengths: ["impressões rápidas para documentos do dia a dia"],
    ideal_for: ["home office com demanda frequente de papel"],
    weaknesses: ["toner substituto pode encarecer o custo por página"],
  },
  colchao: {
    official_name: "Colchão Ortobom Memory",
    category: "colchao",
    strengths: ["suporte consistente para noites de sono prolongadas"],
    ideal_for: ["quem acorda com dor nas costas em colchões antigos"],
    weaknesses: ["peso dificulta troca e limpeza periódica"],
  },
  sofa: {
    official_name: "Sofá Retrátil 3 Lugares",
    category: "sofa",
    strengths: ["conforto para uso diário em sala de estar"],
    ideal_for: ["família que passa horas na sala assistindo ou conversando"],
    weaknesses: ["ocupa área significativa da sala"],
  },
  drone: {
    official_name: "Drone DJI Mini",
    category: "drone",
    strengths: ["captação aérea portátil para viagens e registros"],
    ideal_for: ["quem quer filmagens aéreas sem equipamento pesado"],
    weaknesses: ["autonomia de voo limita sessões longas"],
  },
};

const CATEGORIES = [
  { id: "A", label: "smartphone", category: "celular", query: "celular até 2000 bateria", axis: "battery", specsKey: "smartphone" },
  { id: "B", label: "notebook", category: "notebook", query: "notebook trabalho", axis: "performance", specsKey: "notebook" },
  { id: "C", label: "TV", category: "tv", query: "smart tv streaming", axis: "screen", specsKey: "tv" },
  { id: "D", label: "monitor", category: "monitor", query: "monitor home office", axis: "screen", specsKey: "monitor" },
  { id: "E", label: "mouse", category: "mouse", query: "mouse ergonômico", axis: "comfort", specsKey: "mouse" },
  { id: "F", label: "teclado", category: "teclado", query: "teclado mecânico trabalho", axis: "comfort", specsKey: "teclado" },
  { id: "G", label: "cadeira", category: "cadeira", query: "cadeira ergonômica home office", axis: "comfort", specsKey: "cadeira" },
  { id: "H", label: "air fryer", category: "air_fryer", query: "air fryer família", axis: "value", specsKey: "air_fryer" },
  { id: "I", label: "geladeira", category: "geladeira", query: "geladeira frost free família", axis: "value", specsKey: "geladeira" },
  { id: "J", label: "máquina de lavar", category: "maquina_lavar", query: "máquina de lavar 12kg", axis: "value", specsKey: "maquina_lavar" },
  { id: "K", label: "câmera", category: "camera", query: "câmera fotográfica viagem", axis: "camera", specsKey: "camera" },
  { id: "L", label: "categoria desconhecida", category: "outros", query: "produto doméstico prático", axis: "value", specsKey: null },
  { id: "M", label: "sem data layer", category: "celular", query: "celular custo benefício", axis: "value", specsKey: null, noDataLayer: true },
];

const FUTURE_CATEGORIES = [
  { id: "F1", label: "aspirador robô", category: "aspirador_robo", query: "aspirador robô apartamento", axis: "value", specsKey: "aspirador_robo" },
  { id: "F2", label: "bicicleta ergométrica", category: "bicicleta_ergometrica", query: "bicicleta ergométrica casa", axis: "comfort", specsKey: "bicicleta" },
  { id: "F3", label: "impressora", category: "impressora", query: "impressora laser home office", axis: "performance", specsKey: "impressora" },
  { id: "F4", label: "colchão", category: "colchao", query: "colchão ortopédico", axis: "comfort", specsKey: "colchao" },
  { id: "F5", label: "sofá", category: "sofa", query: "sofá retrátil sala", axis: "comfort", specsKey: "sofa" },
  { id: "F6", label: "drone", category: "drone", query: "drone viagem leve", axis: "performance", specsKey: "drone" },
];

const CONTEXT_PROFILES = [
  { id: "ctx-A", label: "economia", query: "celular custo benefício barato", axis: "value", querySignals: { priceSensitive: true } },
  { id: "ctx-B", label: "performance", query: "celular desempenho gamer", axis: "performance", querySignals: { technical: true } },
  { id: "ctx-C", label: "longevidade", query: "celular para usar vários anos", axis: "longevity" },
  { id: "ctx-D", label: "evitar arrependimento", query: "celular sem arrependimento", axis: "value", querySignals: { avoidRegret: true } },
  { id: "ctx-E", label: "praticidade", query: "celular simples dia a dia", axis: "value" },
];

let passed = 0;
let failed = 0;
const failures = [];
const leakageFindings = [];
const riskCategories = [];

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
    consequenceChain: { impact: "folga operacional", consequence: "menos limitação no uso previsto" },
  };
}

function buildScenario({ query, category, specsKey, axis = "performance", querySignals = {}, noDataLayer = false }) {
  const specs = specsKey ? SPECS[specsKey] || FUTURE_SPECS[specsKey] : null;
  const productName = specs?.official_name || "Gadget Pro";
  return buildSpecialistDecisionExplanation({
    query,
    category,
    product: {
      product_name: productName,
      isDataLayerProduct: !noDataLayer && Boolean(specs),
      trustedSpecs: specs || undefined,
      category,
    },
    searchCognition: cognition(axis),
    querySignals,
    decisionMemory: { lastWinnerAdvantages: [axis] },
    responsePath: "return_seguro",
    sessionContext: {},
  });
}

function collectChainTexts(result = {}) {
  const texts = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) texts.push(v);
  };

  for (const s of result.sensationBridge?.sensations || []) {
    push(s.sensation);
    push(s.trace?.consequence);
    push(s.trace?.token);
  }
  for (const e of result.humanExperienceModel?.experiences || []) {
    push(e.experience);
    push(e.sourceConsequence);
  }
  for (const f of result.humanFrictionModel?.frictions || []) {
    push(f.friction);
    push(f.sourceConsequence);
  }
  for (const o of result.ownershipExperienceModel?.ownershipExperiences || []) {
    push(o.ownershipExperience);
    push(o.sourceConsequence);
  }
  push(result.authorityClosingContract?.closingAuthority?.closingText);
  push(result.humanDecisionNarrative?.narrative?.supportingEvidence);
  push(result.longTermSatisfactionModel?.longTermSatisfaction?.trace?.ownershipClass);

  return texts.join(" | ");
}

function isConsequenceHealthy(result = {}) {
  const sensations = result.sensationBridge?.sensations || [];
  if (sensations.some((s) => s.trace?.consequence && (s.trace?.token || s.sourceConsequence))) return true;
  const experiences = result.humanExperienceModel?.experiences || [];
  return experiences.some((e) => e.trace?.consequence && e.sourceConsequence);
}

function isSensationHealthy(result = {}) {
  const sensations = result.sensationBridge?.sensations || [];
  return result.sensationBridge?.ok === true && sensations.some((s) => s.trace?.consequence && s.trace?.sensation);
}

function isExperienceHealthy(result = {}) {
  const experiences = result.humanExperienceModel?.experiences || [];
  return result.humanExperienceModel?.ok === true && experiences.some((e) => isExperienceTraceable(e));
}

function isFrictionHealthy(result = {}) {
  const frictions = result.humanFrictionModel?.frictions || [];
  return result.humanFrictionModel?.ok === true && frictions.some((f) => isFrictionTraceable(f));
}

function isOwnershipHealthy(result = {}) {
  const ownerships = result.ownershipExperienceModel?.ownershipExperiences || [];
  return result.ownershipExperienceModel?.ok === true && ownerships.some((o) => isOwnershipTraceable(o));
}

function isAuthorityHealthy(result = {}) {
  const authority = result.authorityClosingContract?.closingAuthority;
  return result.authorityClosingContract?.ok === true && isAuthorityTraceable(authority);
}

function isNarrativeHealthy(result = {}) {
  const narrative = result.humanDecisionNarrative?.narrative;
  return result.humanDecisionNarrative?.ok === true && isNarrativeTraceable(narrative);
}

function isLongTermHealthy(result = {}) {
  const lt = result.longTermSatisfactionModel?.longTermSatisfaction;
  return result.longTermSatisfactionModel?.ok === true && isLongTermSatisfactionTraceable(lt);
}

const LAYER_EVALUATORS = Object.freeze({
  consequence: isConsequenceHealthy,
  sensation: isSensationHealthy,
  experience: isExperienceHealthy,
  friction: isFrictionHealthy,
  ownership: isOwnershipHealthy,
  authority: isAuthorityHealthy,
  narrative: isNarrativeHealthy,
  longTermSatisfaction: isLongTermHealthy,
});

function evaluateLayers(result = {}) {
  const layerResults = {};
  for (const layer of COGNITIVE_LAYERS) {
    layerResults[layer] = LAYER_EVALUATORS[layer](result);
  }
  return layerResults;
}

function evaluateTraceability(result = {}) {
  const sensations = result.sensationBridge?.sensations || [];
  const experiences = result.humanExperienceModel?.experiences || [];
  const frictions = result.humanFrictionModel?.frictions || [];
  const ownerships = result.ownershipExperienceModel?.ownershipExperiences || [];
  const authority = result.authorityClosingContract?.closingAuthority;
  const narrative = result.humanDecisionNarrative?.narrative;
  const lt = result.longTermSatisfactionModel?.longTermSatisfaction;

  const checks = [
    isConsequenceHealthy(result),
    sensations.some((s) => s.trace?.consequence && s.trace?.sensation),
    experiences.some((e) => isExperienceTraceable(e)),
    frictions.some((f) => isFrictionTraceable(f)),
    ownerships.some((o) => isOwnershipTraceable(o)),
    isAuthorityTraceable(authority),
    isNarrativeTraceable(narrative),
    isLongTermSatisfactionTraceable(lt),
  ];

  return checks.filter(Boolean).length / checks.length;
}

function isLayerIndependent(result = {}) {
  const origins = [
    classifyExperienceOrigin(result.humanExperienceModel?.experiences?.[0]),
    classifyFrictionOrigin(result.humanFrictionModel?.frictions?.[0]),
    classifyOwnershipOrigin(result.ownershipExperienceModel?.ownershipExperiences?.[0]),
    classifyAuthorityOrigin(result.authorityClosingContract?.closingAuthority),
    classifyNarrativeOrigin(result.humanDecisionNarrative?.narrative),
    classifyLongTermSatisfactionOrigin(result.longTermSatisfactionModel?.longTermSatisfaction),
  ];
  const independent = origins.filter((o) => o === "real" || o === "derived").length;
  return independent / origins.length;
}

const LEGITIMATE_AUTONOMY_CATEGORIES = new Set([
  "celular",
  "notebook",
  "drone",
  "aspirador_robo",
  "camera",
]);

function detectOutputSmartphoneLeak(category = "", query = "", result = {}) {
  if (category === "celular" || /\b(celular|smartphone|iphone)\b/i.test(query)) return false;
  const blob = collectChainTexts(result);
  if (STRUCTURAL_MOBILE_LEAK.test(blob)) return true;
  if (/\b(ios|android|60\s*hz|ecossistema apple|aparelho principal da linha)\b/i.test(blob)) return true;
  if (
    /\b(bateria|autonomia)\b/i.test(blob) &&
    !LEGITIMATE_AUTONOMY_CATEGORIES.has(category) &&
    !/\b(bateria|autonomia|voo)\b/i.test(query)
  ) {
    return true;
  }
  if (/\b(câmera frontal|face\s*id|chip a\d+)\b/i.test(blob)) return true;
  return false;
}

function scanStaticSmartphoneLeakage() {
  const findings = [];
  for (const file of COGNITIVE_LAYER_FILES) {
    const path = join(ROOT, "lib", file);
    let content = "";
    try {
      content = readFileSync(path, "utf8");
    } catch {
      findings.push({ file, type: "missing_file" });
      continue;
    }

    if (CATEGORY_HARDLOCK.test(content)) {
      findings.push({ file, type: "category_hardlock", detail: "category === celular/smartphone lock" });
    }

    const mobileRuleCount = (content.match(/\b(ios|android|iphone|smartphone|60\s*hz)\b/gi) || []).length;
    const universalRuleCount = (content.match(/\b(ergonom|conforto|capacidade|limpeza|ocupa|home office|multitarefa)\b/gi) || []).length;
    if (mobileRuleCount > 0 && universalRuleCount === 0) {
      findings.push({ file, type: "mobile_only_rules", detail: `mobile refs=${mobileRuleCount}` });
    }
  }
  return findings;
}

function scanNonSmartphoneLeakageWithoutPhone() {
  const nonPhoneCategories = [...CATEGORIES, ...FUTURE_CATEGORIES].filter(
    (c) => c.category !== "celular" && !c.noDataLayer
  );
  let leakCount = 0;
  let total = 0;

  for (const cat of nonPhoneCategories) {
    const result = buildScenario(cat);
    total += 1;
    if (detectOutputSmartphoneLeak(cat.category, cat.query, result)) {
      leakCount += 1;
      leakageFindings.push({ category: cat.label, type: "output_mobile_leak" });
    }
  }

  return total ? (leakCount / total) * 100 : 0;
}

function layerHealthWithoutSmartphones() {
  const nonPhone = CATEGORIES.filter((c) => c.category !== "celular" && !c.noDataLayer);
  const scores = [];

  for (const cat of nonPhone) {
    const result = buildScenario(cat);
    const layers = evaluateLayers(result);
    const passCount = Object.values(layers).filter(Boolean).length;
    scores.push(passCount / COGNITIVE_LAYERS.length);
  }

  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

console.log(`\nPATCH 9.3A — Cross-Category Human Reasoning Audit\n`);
console.log(`Audit: ${CROSS_CATEGORY_AUDIT_VERSION}`);
console.log(`Layers: ${COGNITIVE_LAYERS.join(" → ")}`);

const universalityScores = [];
const traceabilityScores = [];
const dataLayerWith = [];
const dataLayerWithout = [];
const categoryReports = [];

console.log("\n── 1. Categorias obrigatórias A–M ──");
for (const cat of CATEGORIES) {
  console.log(`\n── ${cat.id}) ${cat.label} ──`);
  const result = buildScenario(cat);
  const layers = evaluateLayers(result);
  const tracePct = evaluateTraceability(result) * 100;
  const layerPass = Object.values(layers).filter(Boolean).length;
  const universality = (layerPass / COGNITIVE_LAYERS.length) * 100;

  universalityScores.push(universality);
  traceabilityScores.push(tracePct);

  if (cat.noDataLayer) {
    dataLayerWithout.push(universality);
  } else if (cat.specsKey) {
    dataLayerWith.push(universality);
  }

  const leak = detectOutputSmartphoneLeak(cat.category, cat.query, result);
  if (leak) leakageFindings.push({ category: cat.label, type: "output_mobile_leak" });

  console.log(`  specialist ok: ${result.ok}`);
  for (const layer of COGNITIVE_LAYERS) {
    console.log(`  ${layer}: ${layers[layer] ? "ok" : "gap"}`);
  }
  console.log(`  universality: ${universality.toFixed(1)}% | traceability: ${tracePct.toFixed(1)}%`);

  assert(`${cat.id}: specialist pipeline`, result.ok);
  if (!cat.noDataLayer && cat.specsKey) {
    assert(`${cat.id}: universality ≥ 75%`, universality >= 75, `${universality.toFixed(1)}%`);
    assert(`${cat.id}: traceability ≥ 75%`, tracePct >= 75, `${tracePct.toFixed(1)}%`);
    assert(`${cat.id}: no smartphone leak`, !leak);
  } else if (cat.id === "L") {
    assert(`${cat.id}: layers operate without known category`, layerPass >= 5, `${layerPass}/8`);
  } else if (cat.id === "M") {
    assert(`${cat.id}: operates sem data layer`, layerPass >= 5, `${layerPass}/8`);
  }

  if (universality < 75 && cat.specsKey) {
    riskCategories.push(cat.label);
  }

  categoryReports.push({ label: cat.label, universality, tracePct, layers, leak });
}

console.log("\n── 2. Future Category Audit ──");
let futurePass = 0;
for (const cat of FUTURE_CATEGORIES) {
  const result = buildScenario(cat);
  const layers = evaluateLayers(result);
  const layerPass = Object.values(layers).filter(Boolean).length;
  const universality = (layerPass / COGNITIVE_LAYERS.length) * 100;
  universalityScores.push(universality);
  traceabilityScores.push(evaluateTraceability(result) * 100);

  console.log(`  ${cat.id} ${cat.label}: ${universality.toFixed(0)}% (${layerPass}/8 layers)`);
  assert(`${cat.id}: future category operates`, layerPass >= 6, `${layerPass}/8`);
  assert(`${cat.id}: no smartphone leak`, !detectOutputSmartphoneLeak(cat.category, cat.query, result));
  if (layerPass >= 6) futurePass += 1;
}

console.log("\n── 3. Context Robustness (mesmo produto, perfis diferentes) ──");
const profileSnapshots = [];
const baseProduct = {
  query: "",
  category: "celular",
  specsKey: "smartphone",
  axis: "value",
};

for (const profile of CONTEXT_PROFILES) {
  const result = buildScenario({
    ...baseProduct,
    query: profile.query,
    axis: profile.axis,
    querySignals: profile.querySignals || {},
  });
  const narrative = result.humanDecisionNarrative?.narrative;
  const lt = result.longTermSatisfactionModel?.longTermSatisfaction;
  profileSnapshots.push({
    label: profile.label,
    narrativeType: narrative?.narrativeType,
    satisfactionClass: lt?.satisfactionClass,
    trajectory: lt?.satisfactionTrajectory,
    relevance: lt?.contextualRelevance,
  });
  console.log(
    `  ${profile.label}: narrative=${narrative?.narrativeType} satisfaction=${lt?.satisfactionClass} traj=${lt?.satisfactionTrajectory}`
  );
  assert(`${profile.id}: context shifts layers`, result.ok);
}

const uniqueNarratives = new Set(profileSnapshots.map((p) => p.narrativeType)).size;
const uniqueSatisfaction = new Set(profileSnapshots.map((p) => p.satisfactionClass)).size;
assert("context: narrative types vary", uniqueNarratives >= 2, `${uniqueNarratives} types`);
assert("context: satisfaction classes vary", uniqueSatisfaction >= 2, `${uniqueSatisfaction} classes`);

console.log("\n── 4. Human Reasoning Leakage (sem celulares) ──");
const nonPhoneHealth = layerHealthWithoutSmartphones() * 100;
console.log(`  Layer health without smartphones: ${nonPhoneHealth.toFixed(1)}%`);
assert("layers make sense without smartphones", nonPhoneHealth >= 85, `${nonPhoneHealth.toFixed(1)}%`);

console.log("\n── 5. Static Smartphone Leakage Scan ──");
const staticFindings = scanStaticSmartphoneLeakage();
if (staticFindings.length) {
  for (const f of staticFindings) {
    console.log(`  ⚠️  ${f.file}: ${f.type}${f.detail ? ` (${f.detail})` : ""}`);
    leakageFindings.push({ file: f.file, type: f.type, detail: f.detail });
  }
} else {
  console.log("  No structural category hardlocks in cognitive layers");
}
assert("no category hardlocks in 9.2S–9.2Z layers", !staticFindings.some((f) => f.type === "category_hardlock"));

console.log("\n── 6. Output Smartphone Leakage (non-phone categories) ──");
const outputLeakPct = scanNonSmartphoneLeakageWithoutPhone();
console.log(`  Output leakage rate: ${outputLeakPct.toFixed(1)}%`);
assert("output smartphone leakage < 10%", outputLeakPct < 10, `${outputLeakPct.toFixed(1)}%`);

console.log("\n── 7. Independence Audit (LLM-free cognition) ──");
const independenceSamples = CATEGORIES.filter((c) => c.specsKey).map((c) => isLayerIndependent(buildScenario(c)));
const independencePct = (independenceSamples.reduce((a, b) => a + b, 0) / independenceSamples.length) * 100;
console.log(`  Cognitive independence: ${independencePct.toFixed(1)}%`);
assert("layers decide without LLM placeholders", independencePct >= 80, `${independencePct.toFixed(1)}%`);

const universalityPct = universalityScores.reduce((a, b) => a + b, 0) / universalityScores.length;
const traceabilityPct = traceabilityScores.reduce((a, b) => a + b, 0) / traceabilityScores.length;

const dlWithAvg = dataLayerWith.length
  ? dataLayerWith.reduce((a, b) => a + b, 0) / dataLayerWith.length
  : 100;
const dlWithoutAvg = dataLayerWithout.length
  ? dataLayerWithout.reduce((a, b) => a + b, 0) / dataLayerWithout.length
  : 0;
const dataLayerDependencyPct = dlWithAvg > 0 ? Math.max(0, ((dlWithAvg - dlWithoutAvg) / dlWithAvg) * 100) : 0;

const smartphoneCats = categoryReports.filter((c) => c.label === "smartphone");
const nonSmartphoneCats = categoryReports.filter((c) => c.label !== "smartphone" && c.label !== "sem data layer");
const smartphoneAvg = smartphoneCats.length
  ? smartphoneCats.reduce((a, c) => a + c.universality, 0) / smartphoneCats.length
  : 0;
const nonSmartphoneAvg = nonSmartphoneCats.length
  ? nonSmartphoneCats.reduce((a, c) => a + c.universality, 0) / nonSmartphoneCats.length
  : 0;
const smartphoneDependencyPct =
  smartphoneAvg > 0 ? Math.max(0, ((smartphoneAvg - nonSmartphoneAvg) / smartphoneAvg) * 100) : outputLeakPct;

console.log("\n── Métricas obrigatórias ──");
console.log(`  Universalidade: ${universalityPct.toFixed(1)}% (meta > 90%)`);
console.log(`  Dependência smartphone: ${smartphoneDependencyPct.toFixed(1)}% (meta < 10%)`);
console.log(`  Dependência Data Layer: ${dataLayerDependencyPct.toFixed(1)}% (meta < 20%)`);
console.log(`  Rastreabilidade: ${traceabilityPct.toFixed(1)}% (meta > 90%)`);
console.log(`  Categorias aprovadas: ${categoryReports.filter((c) => c.universality >= 75).length}/${categoryReports.length}`);
console.log(`  Categorias com risco: ${riskCategories.length ? riskCategories.join(", ") : "(nenhuma)"}`);
console.log(`  Future categories ok: ${futurePass}/${FUTURE_CATEGORIES.length}`);

assert("universalidade > 90%", universalityPct > 90, `${universalityPct.toFixed(1)}%`);
assert("dependência smartphone < 10%", smartphoneDependencyPct < 10, `${smartphoneDependencyPct.toFixed(1)}%`);
assert("dependência Data Layer < 20%", dataLayerDependencyPct < 20, `${dataLayerDependencyPct.toFixed(1)}%`);
assert("rastreabilidade > 90%", traceabilityPct > 90, `${traceabilityPct.toFixed(1)}%`);

console.log("\n── Regressões críticas ──");
let regressionFailures = 0;
if (SKIP_REGRESSIONS) {
  console.log("  (skipped)");
} else {
  for (const script of CRITICAL_REGRESSIONS) {
    const r = spawnSync(process.execPath, [join(ROOT, "scripts", script), "--skip-regressions"], {
      encoding: "utf8",
      stdio: "pipe",
      cwd: ROOT,
    });
    const ok = r.status === 0;
    console.log(`${ok ? "PASS" : "FAIL"} ${script}`);
    if (!ok) {
      regressionFailures += 1;
      console.log(r.stdout?.slice(-400) || r.stderr?.slice(-200) || "");
    }
  }
  assert("regressões críticas sem falha", regressionFailures === 0, `${regressionFailures}`);
}

const metricsOk =
  universalityPct > 90 &&
  smartphoneDependencyPct < 10 &&
  dataLayerDependencyPct < 20 &&
  traceabilityPct > 90;

const verdict = !metricsOk
  ? failed > 4
    ? "C) FAILED"
    : "B) PARTIAL"
  : failed === 0 && (SKIP_REGRESSIONS || regressionFailures === 0)
    ? SKIP_REGRESSIONS
      ? "A) FULLY CLOSED (audit principal — regressões críticas pendentes)"
      : "A) FULLY CLOSED"
    : "B) PARTIAL";

console.log("\n── Resumo ──");
console.log(`Passed: ${passed} Failed: ${failed}`);
if (failures.length) failures.forEach((f) => console.log(`  - ${f}`));
if (leakageFindings.length) {
  console.log("\nVazamentos:");
  leakageFindings.forEach((l) => console.log(`  - ${l.category || l.file}: ${l.type}`));
}
console.log(`\nVeredito: ${verdict}\n`);
process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
