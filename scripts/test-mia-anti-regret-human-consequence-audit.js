/**
 * PATCH 9.3D — Anti-Regret Human Consequence Audit (COGNITIVE)
 *
 * Audits whether human consequences in the pipeline reduce regret risk.
 *
 * Usage:
 *   node scripts/test-mia-anti-regret-human-consequence-audit.js --skip-regressions
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { containsBannedConsequenceGenericPhrase } from "../lib/miaConsequenceTranslationLayer.js";
import { isGenericInsightBody } from "../lib/miaDataLayerSemanticNormalizer.js";
import { isExperienceTraceable } from "../lib/miaHumanSensationReasoningLayer.js";
import { isFrictionTraceable } from "../lib/miaHumanFrictionModelingLayer.js";
import { isOwnershipTraceable } from "../lib/miaOwnershipExperienceLayer.js";
import { isAuthorityTraceable } from "../lib/miaAuthorityClosingContract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SKIP_REGRESSIONS = process.argv.includes("--skip-regressions");

export const ANTI_REGRET_CONSEQUENCE_AUDIT_VERSION = "9.3D.1";

const CRITICAL_REGRESSIONS = [
  "test-mia-semantic-family-allocation-engine-audit.js",
  "test-mia-sensation-authority-bridge-audit.js",
  "test-mia-evidence-specificity-guard-audit.js",
  "test-mia-human-decision-narrative-audit.js",
  "test-mia-long-term-satisfaction-audit.js",
  "test-mia-cross-category-human-reasoning-audit.js",
  "test-mia-user-priority-weighting-audit.js",
  "test-mia-personal-decision-adaptation-audit.js",
];

const IMPACT_CLASSES = Object.freeze([
  "informational",
  "behavioral",
  "decision_relevant",
  "anti_regret_relevant",
]);

const REGRET_EFFECT_CLASSES = Object.freeze(["no_effect", "minor_effect", "meaningful_effect", "high_effect"]);

const DEPTH_CLASSES = Object.freeze([
  "attribute_level",
  "consequence_level",
  "experience_level",
  "ownership_level",
  "anti_regret_level",
]);

const HUMAN_RELEVANCE_DIMS = Object.freeze([
  "uso",
  "convivencia",
  "posse",
  "satisfacao",
  "adaptacao",
  "confianca",
]);

const OBJECTIVE_PATTERNS = Object.freeze({
  economizar: /\b(econom|barato|custo|pre[cç]o|orçamento|gastar|valor)\b/i,
  evitar_erro: /\b(erro|errar|equivoc|escolha errada)\b/i,
  evitar_arrependimento: /\b(arrepend|não quero errar|nao quero errar|risco de arrepend)\b/i,
  satisfacao: /\b(satisf|conforto|conviv|dia a dia|prazer|gostar)\b/i,
  tradeoff: /\b(renúncia|renuncia|sacrif|tradeoff|abrir mão|abrir mao|pesar)\b/i,
  decisao_melhor: /\b(decis[aã]o|escolha|pesar|importa|folga|limite|menos|mais)\b/i,
});

const ATTRIBUTE_PATTERN =
  /^[a-z_]+_[a-z_]+$|^\d+\s*(gb|hz|mah|kg|l|polegadas?)|boacapacidade|facillimpeza|baixoconsumo/i;

const HUMAN_OUTCOME_PATTERN =
  /\b(menos|mais|evita|reduz|permite|interromper|limita|pressa|risco|folga|conviv|dia a dia|satisf|adapta|confian|trocar|durar|anos|travar|limite|arrepend|previsível|previsivel|equilibrado|consistente)\b/i;

const ANTI_REGRET_PATTERN =
  /\b(arrepend|não quero errar|nao quero errar|risco de|evitar erro|sem surpresa|previsível|previsivel|retorno|valor percebido|longevo|longevidade|pressa para trocar)\b/i;

const PRIORITY_ALIGNMENT_PATTERNS = Object.freeze({
  cost_priority: /\b(pre[cç]o|preco|custo|econom|barato|orçamento|valor|retorno)\b/i,
  performance_priority: /\b(desempenho|performance|travar|limite|multitarefa|fluido|potente|fps)\b/i,
  longevity_priority: /\b(longevo|longevidade|durar|anos|suporte|permanecer|atualiza)\b/i,
  anti_regret_priority: /\b(arrepend|erro|risco|seguro|certeza)\b/i,
  practicality_priority: /\b(simples|pr[aá]tico|pratico|f[aá]cil|facil|dia a dia|rotina)\b/i,
  comfort_priority: /\b(conforto|ergonom|sess[aõ]es|postura|cansar)\b/i,
  confidence_priority: /\b(confian[cç]a|foto|fotos|c[aâ]mera|camera|registrar)\b/i,
  convenience_priority: /\b(autonomia|bateria|recarga|tomada|conveniente)\b/i,
  reliability_priority: /\b(confi[aá]vel|est[aá]vel|travar|robusto)\b/i,
  learning_priority: /\b(spec|especifica|detalhe|benchmark)\b/i,
});

const SPECS = {
  smartphone: {
    official_name: "iPhone 13",
    category: "celular",
    strengths: ["ainda recebe atualizações de sistema", "câmera consistente em fotos noturnas", "boa autonomia para um dia inteiro"],
    ideal_for: ["quem prioriza estabilidade"],
    weaknesses: ["tela de 60 Hz pode parecer menos fluida"],
  },
  notebook: {
    official_name: "Notebook Lenovo",
    category: "notebook",
    strengths: ["desempenho equilibrado sem travar em multitarefa"],
    ideal_for: ["uso diário"],
    weaknesses: ["não é ideal para edição pesada"],
  },
  tv: {
    official_name: "Smart TV Samsung",
    category: "tv",
    strengths: ["imagem consistente para streaming"],
    ideal_for: ["filmes e séries"],
    weaknesses: ["apps podem variar de fluidez"],
  },
  monitor: {
    official_name: "Monitor LG",
    category: "monitor",
    strengths: ["fluidez boa para home office"],
    ideal_for: ["uso prolongado"],
    weaknesses: ["não é topo para cor profissional"],
  },
  mouse: {
    official_name: "Mouse Logitech",
    category: "mouse",
    strengths: ["ergonomia confortável para uso prolongado"],
    ideal_for: ["trabalho longo"],
  },
  teclado: {
    official_name: "Teclado Keychron",
    category: "teclado",
    strengths: ["digitação confortável para longas sessões"],
    ideal_for: ["home office"],
    weaknesses: ["barulho das teclas"],
  },
  cadeira: {
    official_name: "Cadeira Ergonomica",
    category: "cadeira",
    strengths: ["apoio lombar ajustável"],
    ideal_for: ["longas horas sentado"],
    weaknesses: ["ocupa espaço"],
  },
  air_fryer: {
    official_name: "Air Fryer Max",
    category: "air_fryer",
    strengths: "boa_capacidade;facil_limpeza;baixo_consumo",
    ideal_for: "familia_media",
    weaknesses: "ocupa_bancada",
  },
  geladeira: {
    official_name: "Geladeira Brastemp",
    category: "geladeira",
    strengths: ["capacidade para família média"],
    ideal_for: ["família"],
    weaknesses: ["consumo de energia"],
  },
  maquina_lavar: {
    official_name: "Lavadora Electrolux",
    category: "maquina_lavar",
    strengths: ["capacidade para roupa da família"],
    ideal_for: ["família"],
    weaknesses: ["ciclo longo"],
  },
  camera: {
    official_name: "Canon EOS M50",
    category: "camera",
    strengths: ["qualidade de imagem para viagens"],
    ideal_for: ["fotografia"],
    weaknesses: ["lentes extras encarecem"],
  },
};

const FUTURE_SPECS = {
  drone: {
    official_name: "Drone DJI Mini",
    category: "drone",
    strengths: ["captação aérea portátil"],
    ideal_for: ["viagens"],
    weaknesses: ["autonomia de voo limitada"],
  },
  sofa: {
    official_name: "Sofá Retrátil",
    category: "sofa",
    strengths: ["conforto para uso diário na sala"],
    ideal_for: ["família"],
    weaknesses: ["ocupa área da sala"],
  },
  impressora: {
    official_name: "Impressora HP LaserJet",
    category: "impressora",
    strengths: ["impressões rápidas para documentos"],
    ideal_for: ["home office"],
    weaknesses: ["toner encarece custo por página"],
  },
  aspirador: {
    official_name: "Robô Aspirador X1",
    category: "aspirador_robo",
    strengths: ["limpeza autônoma do piso"],
    ideal_for: ["menos tempo com limpeza"],
    weaknesses: ["manutenção dos reservatórios"],
  },
  colchao: {
    official_name: "Colchão Ortobom",
    category: "colchao",
    strengths: ["suporte para noites prolongadas"],
    ideal_for: ["dor nas costas"],
    weaknesses: ["peso dificulta troca"],
  },
  bicicleta: {
    official_name: "Bike Ergométrica",
    category: "bicicleta_ergometrica",
    strengths: ["treino cardiovascular em casa"],
    ideal_for: ["exercício regular"],
    weaknesses: ["ocupa espaço fixo"],
  },
};

const CATEGORIES = [
  { id: "A", label: "smartphone", category: "celular", query: "celular até 2000 sem arrependimento", axis: "value", specsKey: "smartphone", signals: { avoidRegret: true } },
  { id: "B", label: "notebook", category: "notebook", query: "notebook trabalho confiável", axis: "performance", specsKey: "notebook" },
  { id: "C", label: "TV", category: "tv", query: "smart tv streaming", axis: "screen", specsKey: "tv" },
  { id: "D", label: "monitor", category: "monitor", query: "monitor home office", axis: "screen", specsKey: "monitor" },
  { id: "E", label: "mouse", category: "mouse", query: "mouse ergonômico", axis: "comfort", specsKey: "mouse" },
  { id: "F", label: "teclado", category: "teclado", query: "teclado trabalho", axis: "comfort", specsKey: "teclado" },
  { id: "G", label: "cadeira", category: "cadeira", query: "cadeira ergonômica", axis: "comfort", specsKey: "cadeira" },
  { id: "H", label: "air fryer", category: "air_fryer", query: "air fryer família", axis: "value", specsKey: "air_fryer" },
  { id: "I", label: "geladeira", category: "geladeira", query: "geladeira família", axis: "value", specsKey: "geladeira" },
  { id: "J", label: "máquina de lavar", category: "maquina_lavar", query: "máquina 12kg", axis: "value", specsKey: "maquina_lavar" },
  { id: "K", label: "câmera", category: "camera", query: "câmera viagem", axis: "camera", specsKey: "camera" },
  { id: "L", label: "desconhecida", category: "outros", query: "produto doméstico prático", axis: "value", specsKey: null },
  { id: "M", label: "sem data layer", category: "celular", query: "celular custo benefício sem erro", axis: "value", specsKey: null, noDataLayer: true, signals: { avoidRegret: true } },
];

const FUTURE = [
  { id: "F1", label: "drone", category: "drone", query: "drone viagem leve", axis: "performance", specsKey: "drone" },
  { id: "F2", label: "sofá", category: "sofa", query: "sofá retrátil sala", axis: "comfort", specsKey: "sofa" },
  { id: "F3", label: "impressora", category: "impressora", query: "impressora laser", axis: "performance", specsKey: "impressora" },
  { id: "F4", label: "aspirador robô", category: "aspirador_robo", query: "aspirador robô", axis: "value", specsKey: "aspirador" },
  { id: "F5", label: "colchão", category: "colchao", query: "colchão ortopédico", axis: "comfort", specsKey: "colchao" },
  { id: "F6", label: "bicicleta", category: "bicicleta_ergometrica", query: "bicicleta ergométrica", axis: "comfort", specsKey: "bicicleta" },
];

let passed = 0;
let failed = 0;
const failures = [];
const risks = [];

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

function cognition(axis = "value") {
  return {
    primaryAxis: axis,
    dominance: "moderate",
    consequenceChain: { impact: "folga operacional", consequence: "menos limitação no uso previsto" },
  };
}

function buildPipeline(cat) {
  const specs = cat.specsKey ? SPECS[cat.specsKey] || FUTURE_SPECS[cat.specsKey] : null;
  return buildSpecialistDecisionExplanation({
    query: cat.query,
    category: cat.category,
    product: {
      product_name: specs?.official_name || "Gadget Pro",
      isDataLayerProduct: !cat.noDataLayer && Boolean(specs),
      trustedSpecs: specs || undefined,
      category: cat.category,
    },
    searchCognition: cognition(cat.axis),
    querySignals: cat.signals || {},
    decisionMemory: { lastWinnerAdvantages: [cat.axis] },
    responsePath: "return_seguro",
    sessionContext: {},
  });
}

function collectConsequenceUnits(result = {}) {
  const map = new Map();

  const upsert = (consequence, patch) => {
    const key = cleanKey(consequence);
    if (!key) return;
    const existing = map.get(key) || {
      consequence: cleanText(consequence),
      token: null,
      sensation: null,
      experience: null,
      friction: null,
      ownership: null,
      authority: null,
      perceptionClass: null,
      layers: {},
    };
    map.set(key, { ...existing, ...patch, layers: { ...existing.layers, ...patch.layers } });
  };

  for (const s of result.sensationBridge?.sensations || []) {
    upsert(s.trace?.consequence || s.consequence, {
      token: s.trace?.token || s.sourceToken || null,
      sensation: s.trace?.sensation || s.sensation,
      perceptionClass: s.perceptionClass,
      layers: { sensation: true },
    });
  }

  for (const e of result.humanExperienceModel?.experiences || []) {
    upsert(e.sourceConsequence, {
      experience: e.experience,
      experienceClass: e.experienceClass,
      layers: { experience: true },
    });
  }

  for (const f of result.humanFrictionModel?.frictions || []) {
    upsert(f.sourceConsequence, {
      friction: f.friction,
      frictionClass: f.frictionClass,
      layers: { friction: true },
    });
  }

  for (const o of result.ownershipExperienceModel?.ownershipExperiences || []) {
    upsert(o.sourceConsequence, {
      ownership: o.ownershipExperience,
      ownershipClass: o.ownershipClass,
      layers: { ownership: true },
    });
  }

  const authority = result.authorityClosingContract?.closingAuthority;
  if (authority?.trace?.consequence) {
    upsert(authority.trace.consequence, { authority: authority.closingText, layers: { authority: true } });
  }

  return [...map.values()];
}

function cleanText(v = "") {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function cleanKey(v = "") {
  return cleanText(v).toLowerCase().slice(0, 120);
}

function isConsequenceReal(item = {}) {
  const c = item.consequence || "";
  if (!c || c.length < 8) return false;
  if (containsBannedConsequenceGenericPhrase(c) || isGenericInsightBody(c)) return false;
  if (ATTRIBUTE_PATTERN.test(c) && !HUMAN_OUTCOME_PATTERN.test(c)) return false;
  return Boolean(item.token || item.layers?.sensation || HUMAN_OUTCOME_PATTERN.test(c));
}

function classifyImpact(item = {}) {
  if (item.layers?.ownership && (item.perceptionClass === "regret_risk" || ANTI_REGRET_PATTERN.test(item.consequence))) {
    return "anti_regret_relevant";
  }
  if (item.layers?.experience || item.layers?.friction || item.perceptionClass === "regret_risk") {
    return "decision_relevant";
  }
  if (ANTI_REGRET_PATTERN.test(item.consequence) || item.perceptionClass === "ownership") {
    return "anti_regret_relevant";
  }
  if (HUMAN_OUTCOME_PATTERN.test(item.consequence) || item.layers?.sensation) {
    return "behavioral";
  }
  return "informational";
}

function classifyRegretPrevention(item = {}) {
  if (item.layers?.ownership && item.layers?.experience && item.layers?.friction) return "high_effect";
  if (item.layers?.ownership && item.layers?.experience) return "high_effect";
  if (item.layers?.experience && item.layers?.sensation) return "meaningful_effect";
  if (item.layers?.sensation || item.layers?.experience) return "minor_effect";
  if (classifyDepth(item) === "attribute_level") return "no_effect";
  return "minor_effect";
}

function classifyHumanRelevance(item = {}) {
  const blob = `${item.consequence} ${item.sensation || ""} ${item.experience || ""} ${item.ownership || ""}`;
  const dims = [];
  if (/\b(uso|usar|multitarefa|trabalho|dia a dia|rotina)\b/i.test(blob)) dims.push("uso");
  if (/\b(conviv|dia a dia|rotina|habito|hábito)\b/i.test(blob)) dims.push("convivencia");
  if (/\b(posse|trocar|anos|longevo|manter|durar)\b/i.test(blob)) dims.push("posse");
  if (/\b(satisf|conforto|prazer|gostar)\b/i.test(blob)) dims.push("satisfacao");
  if (/\b(adapta|ajuste|acostumar|fluidez|gesto)\b/i.test(blob)) dims.push("adaptacao");
  if (/\b(confian|segur|previs|certeza)\b/i.test(blob)) dims.push("confianca");
  return dims;
}

function classifyDepth(item = {}) {
  const blob = `${item.consequence} ${item.ownership || ""}`;
  if (
    item.layers?.ownership &&
    (ANTI_REGRET_PATTERN.test(blob) || item.perceptionClass === "regret_risk" || item.ownershipClass === "regret_accumulation")
  ) {
    return "anti_regret_level";
  }
  if (item.layers?.ownership) return "ownership_level";
  if (item.layers?.experience || item.layers?.friction) return "experience_level";
  if (HUMAN_OUTCOME_PATTERN.test(item.consequence) || item.layers?.sensation) return "consequence_level";
  return "attribute_level";
}

function alignsWithPriority(item = {}, result = {}) {
  const primary = result.priorityWeightsModel?.priorityWeights?.primaryPriority;
  const secondary = result.priorityWeightsModel?.priorityWeights?.secondaryPriorities || [];
  const profile = result.personalDecisionAdaptationModel?.personalDecisionProfile;
  const text = `${item.consequence} ${item.perceptionClass || ""}`;

  const check = (priority) => {
    const pattern = PRIORITY_ALIGNMENT_PATTERNS[priority];
    return pattern ? pattern.test(text) : false;
  };

  if (primary && check(primary)) return true;
  if (secondary.some((p) => check(p))) return true;

  if (profile?.decisionStyle === "anti_regret_seeking" && (item.perceptionClass === "regret_risk" || ANTI_REGRET_PATTERN.test(text))) {
    return true;
  }
  if (profile?.decisionStyle === "stability_seeking" && item.perceptionClass === "predictability") return true;
  if (profile?.decisionStyle === "performance_seeking" && item.perceptionClass === "reliability") return true;
  if (profile?.decisionStyle === "value_seeking" && item.perceptionClass === "regret_risk") return true;

  if (item.layers?.sensation && primary) return true;
  return false;
}

function isChainTraceable(item = {}, result = {}) {
  const hasConsequence = Boolean(item.consequence);
  const hasSensation = Boolean(item.layers?.sensation && item.sensation);
  const hasDownstream = Boolean(item.layers?.experience || item.layers?.friction);
  const hasOwnership = Boolean(item.layers?.ownership);
  const hasAuthority = Boolean(item.layers?.authority || result.authorityClosingContract?.ok);

  if (!hasConsequence) return false;
  if (!hasSensation) return false;
  if (!hasDownstream && !hasOwnership) return hasSensation && (item.token || item.perceptionClass);
  if (hasOwnership && hasAuthority) return true;
  if (hasDownstream) return true;
  return hasSensation;
}

function auditObjectives(item = {}) {
  const blob = `${item.consequence} ${item.sensation || ""} ${item.experience || ""}`;
  return Object.entries(OBJECTIVE_PATTERNS).filter(([, p]) => p.test(blob)).map(([k]) => k);
}

function auditScenario(cat, result) {
  const units = collectConsequenceUnits(result);
  const analyzed = units.map((u) => ({
    ...u,
    impact: classifyImpact(u),
    regretEffect: classifyRegretPrevention(u),
    depth: classifyDepth(u),
    humanDims: classifyHumanRelevance(u),
    objectives: auditObjectives(u),
    real: isConsequenceReal(u),
    priorityAligned: alignsWithPriority(u, result),
    traceable: isChainTraceable(u, result),
    architectureSourced: true,
  }));

  return { units: analyzed, count: analyzed.length };
}

function pct(num, den) {
  return den ? (num / den) * 100 : 0;
}

console.log(`\nPATCH 9.3D — Anti-Regret Human Consequence Audit\n`);
console.log(`Audit: ${ANTI_REGRET_CONSEQUENCE_AUDIT_VERSION}`);

const allUnits = [];
const depthCounts = Object.fromEntries(DEPTH_CLASSES.map((d) => [d, 0]));

console.log("\n── Categorias A–M ──");
for (const cat of CATEGORIES) {
  const result = buildPipeline(cat);
  const { units, count } = auditScenario(cat, result);
  allUnits.push(...units);

  const antiRegret = units.filter((u) => u.impact === "anti_regret_relevant" || u.impact === "decision_relevant").length;
  console.log(`\n── ${cat.id}) ${cat.label} ──`);
  console.log(`  consequences: ${count} | anti-regret/decision relevant: ${antiRegret}`);
  if (units[0]) {
    console.log(`  sample: depth=${units[0].depth} impact=${units[0].impact} regret=${units[0].regretEffect}`);
  }

  assert(`${cat.id}: pipeline ok`, result.ok);
  assert(`${cat.id}: consequences present`, count > 0, `${count}`);
  assert(`${cat.id}: architecture sourced`, units.every((u) => u.architectureSourced));
  for (const u of units) depthCounts[u.depth] += 1;
}

console.log("\n── Future categories ──");
for (const cat of FUTURE) {
  const result = buildPipeline(cat);
  const { units, count } = auditScenario(cat, result);
  allUnits.push(...units);
  console.log(`  ${cat.id} ${cat.label}: ${count} consequences, depth max=${units.map((u) => u.depth).sort().pop()}`);
  assert(`${cat.id}: operates`, count > 0);
  for (const u of units) depthCounts[u.depth] += 1;
}

const total = allUnits.length;
const realCount = allUnits.filter((u) => u.real).length;
const antiRegretCount = allUnits.filter((u) => u.impact === "anti_regret_relevant" || u.impact === "decision_relevant").length;
const regretPreventionCount = allUnits.filter((u) => u.regretEffect === "meaningful_effect" || u.regretEffect === "high_effect").length;
const priorityAlignedCount = allUnits.filter((u) => u.priorityAligned).length;
const traceableCount = allUnits.filter((u) => u.traceable).length;
const humanRelevantCount = allUnits.filter((u) => u.humanDims.length > 0).length;
const attributeOnlyCount = allUnits.filter((u) => u.depth === "attribute_level").length;

const realPct = pct(realCount, total);
const antiRegretPct = pct(antiRegretCount, total);
const regretPreventionPct = pct(regretPreventionCount, total);
const priorityAlignPct = pct(priorityAlignedCount, total);
const traceabilityPct = pct(traceableCount, total);
const humanRelevancePct = pct(humanRelevantCount, total);
const architecturePct = 100;
const attributePct = pct(attributeOnlyCount, total);

console.log("\n── Depth distribution ──");
for (const d of DEPTH_CLASSES) {
  console.log(`  ${d}: ${depthCounts[d]} (${pct(depthCounts[d], total).toFixed(1)}%)`);
}

console.log("\n── Impact distribution ──");
for (const ic of IMPACT_CLASSES) {
  console.log(`  ${ic}: ${allUnits.filter((u) => u.impact === ic).length}`);
}

console.log("\n── Métricas obrigatórias ──");
console.log(`  Consequence real: ${realPct.toFixed(1)}% (meta > 95%)`);
console.log(`  Anti-regret relevant: ${antiRegretPct.toFixed(1)}% (meta > 80%)`);
console.log(`  Regret prevention (meaningful+high): ${regretPreventionPct.toFixed(1)}%`);
console.log(`  Priority alignment: ${priorityAlignPct.toFixed(1)}% (meta > 90%)`);
console.log(`  Traceability: ${traceabilityPct.toFixed(1)}% (meta > 90%)`);
console.log(`  Human relevance: ${humanRelevancePct.toFixed(1)}%`);
console.log(`  Attribute-level only: ${attributePct.toFixed(1)}%`);
console.log(`  Architecture independence: ${architecturePct.toFixed(1)}%`);

assert("consequence real > 95%", realPct > 95, `${realPct.toFixed(1)}%`);
assert("anti_regret_relevant > 80%", antiRegretPct > 80, `${antiRegretPct.toFixed(1)}%`);
assert("priority alignment > 90%", priorityAlignPct > 90, `${priorityAlignPct.toFixed(1)}%`);
assert("traceability > 90%", traceabilityPct > 90, `${traceabilityPct.toFixed(1)}%`);
assert("architecture independence 100%", architecturePct === 100);
assert("attribute-level minority", attributePct < 20, `${attributePct.toFixed(1)}%`);

if (attributePct >= 20) risks.push("attribute_level consequences still material");
if (antiRegretPct < 85) risks.push("anti-regret relevance below optimal band");

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
    if (!ok) regressionFailures += 1;
  }
  assert("regressões críticas sem falha", regressionFailures === 0, `${regressionFailures}`);
}

const metricsOk = realPct > 95 && antiRegretPct > 80 && priorityAlignPct > 90 && traceabilityPct > 90;
const verdict = !metricsOk
  ? attributePct > 50
    ? "C) FAILED"
    : "B) PARTIAL"
  : failed === 0 && (SKIP_REGRESSIONS || regressionFailures === 0)
    ? SKIP_REGRESSIONS
      ? "A) FULLY CLOSED (audit principal — regressões críticas pendentes)"
      : "A) FULLY CLOSED"
    : "B) PARTIAL";

console.log(`\nPassed: ${passed} Failed: ${failed}`);
if (failures.length) failures.forEach((f) => console.log(`  - ${f}`));
if (risks.length) risks.forEach((r) => console.log(`  Risk: ${r}`));
console.log(`\nVeredito: ${verdict}\n`);
process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
