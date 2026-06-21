/**
 * PATCH 9.3C — Personal Decision Adaptation Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-personal-decision-adaptation-audit.js --skip-regressions
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { buildUserPriorityWeightingModel } from "../lib/miaUserPriorityWeightingEngine.js";
import {
  buildPersonalDecisionAdaptationModel,
  adaptDecisionProfile,
  isPersonalAdaptationTraceable,
  classifyPersonalAdaptationOrigin,
  profilesAreDistinct,
  DECISION_STYLES,
  RISK_TOLERANCES,
  UNCERTAINTY_TOLERANCES,
  VALUE_INTERPRETATIONS,
  TRADEOFF_BEHAVIORS,
  PERSONAL_DECISION_ADAPTATION_VERSION,
} from "../lib/miaPersonalDecisionAdaptationLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SKIP_REGRESSIONS = process.argv.includes("--skip-regressions");

const CRITICAL_REGRESSIONS = [
  "test-mia-semantic-family-allocation-engine-audit.js",
  "test-mia-sensation-authority-bridge-audit.js",
  "test-mia-evidence-specificity-guard-audit.js",
  "test-mia-human-decision-narrative-audit.js",
  "test-mia-long-term-satisfaction-audit.js",
  "test-mia-cross-category-human-reasoning-audit.js",
  "test-mia-user-priority-weighting-audit.js",
];

const SPECS = {
  smartphone: { official_name: "iPhone 13", category: "celular", strengths: ["boa autonomia", "desempenho consistente"], ideal_for: ["estabilidade"], weaknesses: ["tela 60hz"] },
  notebook: { official_name: "Notebook Lenovo", category: "notebook", strengths: ["desempenho equilibrado"], ideal_for: ["trabalho"], weaknesses: ["não é para edição pesada"] },
  tv: { official_name: "Smart TV Samsung", category: "tv", strengths: ["imagem consistente"], ideal_for: ["streaming"], weaknesses: ["apps variam"] },
  monitor: { official_name: "Monitor LG", category: "monitor", strengths: ["fluidez home office"], ideal_for: ["uso prolongado"], weaknesses: ["cor profissional"] },
  mouse: { official_name: "Mouse Logitech", category: "mouse", strengths: ["ergonomia confortável"], ideal_for: ["trabalho longo"] },
  teclado: { official_name: "Teclado Keychron", category: "teclado", strengths: ["digitação confortável"], ideal_for: ["home office"], weaknesses: ["barulho"] },
  cadeira: { official_name: "Cadeira Ergonomica", category: "cadeira", strengths: ["apoio lombar"], ideal_for: ["longas horas"], weaknesses: ["ocupa espaço"] },
  air_fryer: { official_name: "Air Fryer Max", category: "air_fryer", strengths: "boa_capacidade;facil_limpeza", ideal_for: "familia", weaknesses: "ocupa_bancada" },
  geladeira: { official_name: "Geladeira Brastemp", category: "geladeira", strengths: ["capacidade família"], ideal_for: ["família"], weaknesses: ["consumo energia"] },
  maquina_lavar: { official_name: "Lavadora Electrolux", category: "maquina_lavar", strengths: ["capacidade 12kg"], ideal_for: ["família"], weaknesses: ["ciclo longo"] },
  camera: { official_name: "Canon EOS M50", category: "camera", strengths: ["imagem viagens"], ideal_for: ["fotografia"], weaknesses: ["lentes extras"] },
};

const CATEGORIES = [
  { id: "A", label: "smartphone", category: "celular", query: "celular até 2000", axis: "value", specsKey: "smartphone" },
  { id: "B", label: "notebook", category: "notebook", query: "notebook trabalho", axis: "performance", specsKey: "notebook" },
  { id: "C", label: "TV", category: "tv", query: "smart tv streaming", axis: "screen", specsKey: "tv" },
  { id: "D", label: "monitor", category: "monitor", query: "monitor home office", axis: "screen", specsKey: "monitor" },
  { id: "E", label: "mouse", category: "mouse", query: "mouse ergonômico", axis: "comfort", specsKey: "mouse" },
  { id: "F", label: "teclado", category: "teclado", query: "teclado trabalho", axis: "comfort", specsKey: "teclado" },
  { id: "G", label: "cadeira", category: "cadeira", query: "cadeira ergonômica", axis: "comfort", specsKey: "cadeira" },
  { id: "H", label: "air fryer", category: "air_fryer", query: "air fryer família", axis: "value", specsKey: "air_fryer" },
  { id: "I", label: "geladeira", category: "geladeira", query: "geladeira família", axis: "value", specsKey: "geladeira" },
  { id: "J", label: "máquina de lavar", category: "maquina_lavar", query: "máquina 12kg", axis: "value", specsKey: "maquina_lavar" },
  { id: "K", label: "câmera", category: "camera", query: "câmera viagem", axis: "camera", specsKey: "camera" },
  { id: "L", label: "desconhecida", category: "outros", query: "produto doméstico", axis: "value", specsKey: null },
  { id: "M", label: "sem data layer", category: "celular", query: "celular custo benefício", axis: "value", specsKey: null, noDataLayer: true },
];

const PROFILES = [
  { id: "prof-A", label: "conservador", query: "celular estável confiável conservador", axis: "value", signals: { conservative: true, stabilityFocused: true }, expectedStyle: "stability_seeking", expectedRisk: "low_risk" },
  { id: "prof-B", label: "explorador", query: "celular novidade lançamento experimentar", axis: "value", signals: { exploratory: true, noveltySeeking: true }, expectedStyle: "exploration_seeking", expectedRisk: "high_risk" },
  { id: "prof-C", label: "anti-arrependimento", query: "celular sem arrependimento decisão segura", axis: "value", signals: { avoidRegret: true }, expectedStyle: "anti_regret_seeking", expectedTradeoff: "tradeoff_averse" },
  { id: "prof-D", label: "pragmático", query: "celular simples prático dia a dia", axis: "value", signals: { practicalityFocused: true }, expectedStyle: "simplicity_seeking" },
  { id: "prof-E", label: "técnico", query: "celular specs técnicas benchmark", axis: "performance", signals: { technical: true }, expectedStyle: "optimization_seeking" },
  { id: "prof-F", label: "leigo", query: "celular fácil whatsapp", axis: "value", signals: { layperson: true }, expectedStyle: "simplicity_seeking", expectedUncertainty: "low_uncertainty_tolerance" },
  { id: "prof-G", label: "orçamento apertado", query: "celular barato até 1200", axis: "value", signals: { priceSensitive: true }, expectedStyle: "value_seeking", expectedRisk: "low_risk" },
  { id: "prof-H", label: "orçamento folgado", query: "celular premium até 6000", axis: "performance", signals: { budgetRelaxed: true }, expectedRisk: "moderate_risk" },
  { id: "prof-I", label: "prioridades conflitantes", query: "celular barato que dura anos", axis: "value", signals: {}, multi: true },
  { id: "prof-J", label: "alta incerteza", query: "celular estou inseguro com dúvida", axis: "value", signals: { highUncertainty: true, riskAverse: true }, expectedUncertainty: "low_uncertainty_tolerance" },
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

function cognition(axis = "value") {
  return { primaryAxis: axis, dominance: "moderate", consequenceChain: { impact: "folga", consequence: "menos limitação" } };
}

function buildPipeline({ query, category, specsKey, axis = "value", querySignals = {}, noDataLayer = false }) {
  const specs = specsKey ? SPECS[specsKey] : null;
  return buildSpecialistDecisionExplanation({
    query,
    category,
    product: {
      product_name: specs?.official_name || "Gadget Pro",
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

function classifyMetric(model = null) {
  if (!model?.ok || !model.personalDecisionProfile) return "placeholder";
  const origin = classifyPersonalAdaptationOrigin(model);
  if (origin === "real" || origin === "derived") return "real";
  return "placeholder";
}

console.log(`\nPATCH 9.3C — Personal Decision Adaptation Layer Audit\n`);
console.log(`Layer: ${PERSONAL_DECISION_ADAPTATION_VERSION}`);
console.log(`Styles: ${DECISION_STYLES.join(", ")}`);

const metrics = [];
const profileDistinctChecks = [];

console.log("\n── Unit: adaptDecisionProfile ──");
const unit = adaptDecisionProfile({
  query: "celular estável conservador",
  userSignals: { conservative: true },
  priorityWeights: { primaryPriority: "cost_priority", weights: { cost_priority: 0.6 }, tradeoffAcceptance: ["performance_sacrifice"] },
});
assert("unit: decision style", DECISION_STYLES.includes(unit.decisionStyle));
assert("unit: risk tolerance", RISK_TOLERANCES.includes(unit.riskTolerance));
assert("unit: trace temporary", unit.trace?.temporary === true);

console.log("\n── Categorias A–M ──");
for (const cat of CATEGORIES) {
  console.log(`\n── ${cat.id}) ${cat.label} ──`);
  const result = buildPipeline(cat);
  const model = result.personalDecisionAdaptationModel;
  const p = model?.personalDecisionProfile;
  const metric = classifyMetric(model);
  metrics.push(metric);

  console.log(`  style: ${p?.decisionStyle} | risk: ${p?.riskTolerance} | tradeoff: ${p?.tradeoffBehavior}`);
  console.log(`  metric: ${metric}`);

  assert(`${cat.id}: specialist ok`, result.ok);
  assert(`${cat.id}: model wired`, !!model);
  assert(`${cat.id}: adaptation ok`, model?.ok === true);
  assert(`${cat.id}: traceable`, isPersonalAdaptationTraceable(p));
  assert(`${cat.id}: temporary profile`, p?.trace?.temporary === true);
}

console.log("\n── Perfis decisórios ──");
const profileSnapshots = [];
for (const prof of PROFILES) {
  const priority = buildUserPriorityWeightingModel({
    query: prof.query,
    primaryAxis: prof.axis,
    querySignals: prof.signals,
    searchCognition: cognition(prof.axis),
  });
  const model = buildPersonalDecisionAdaptationModel({
    query: prof.query,
    userSignals: prof.signals,
    priorityWeights: priority.priorityWeights,
  });
  const p = model.personalDecisionProfile;
  metrics.push(classifyMetric(model));
  profileSnapshots.push(p);

  console.log(
    `  ${prof.id} ${prof.label}: style=${p?.decisionStyle} risk=${p?.riskTolerance} uncertainty=${p?.uncertaintyTolerance} value=${p?.valueInterpretation}`
  );

  assert(`${prof.id}: model ok`, model.ok);
  assert(`${prof.id}: traceable`, isPersonalAdaptationTraceable(p));
  if (prof.expectedStyle) assert(`${prof.id}: style esperado`, p.decisionStyle === prof.expectedStyle, p.decisionStyle);
  if (prof.expectedRisk) assert(`${prof.id}: risk esperado`, p.riskTolerance === prof.expectedRisk, p.riskTolerance);
  if (prof.expectedUncertainty) assert(`${prof.id}: uncertainty esperado`, p.uncertaintyTolerance === prof.expectedUncertainty, p.uncertaintyTolerance);
  if (prof.expectedTradeoff) assert(`${prof.id}: tradeoff esperado`, p.tradeoffBehavior === prof.expectedTradeoff, p.tradeoffBehavior);
}

console.log("\n── Mesma prioridade, perfis diferentes ──");
const sharedPriority = buildUserPriorityWeightingModel({
  query: "celular até 2000 custo benefício",
  primaryAxis: "value",
  querySignals: { priceSensitive: true },
  searchCognition: cognition("value"),
});
const conservative = buildPersonalDecisionAdaptationModel({
  query: "celular estável confiável",
  userSignals: { conservative: true, stabilityFocused: true },
  priorityWeights: sharedPriority.priorityWeights,
});
const explorer = buildPersonalDecisionAdaptationModel({
  query: "celular novidade lançamento",
  userSignals: { exploratory: true, noveltySeeking: true },
  priorityWeights: sharedPriority.priorityWeights,
});
console.log(`  conservador: ${conservative.personalDecisionProfile?.decisionStyle} / ${conservative.personalDecisionProfile?.riskTolerance}`);
console.log(`  explorador: ${explorer.personalDecisionProfile?.decisionStyle} / ${explorer.personalDecisionProfile?.riskTolerance}`);
assert("mesma prioridade: perfis distintos", profilesAreDistinct(conservative, explorer));
assert("mesma prioridade: primary igual", sharedPriority.priorityWeights?.primaryPriority === conservative.personalDecisionProfile?.trace?.primaryPriority);
profileDistinctChecks.push(profilesAreDistinct(conservative, explorer));

const uniqueStyles = new Set(profileSnapshots.map((p) => p?.decisionStyle)).size;
assert("perfis geram styles diferentes", uniqueStyles >= 4, `${uniqueStyles} styles`);

const realPct = metrics.length ? (metrics.filter((m) => m === "real").length / metrics.length) * 100 : 0;
const placeholderPct = metrics.length ? (metrics.filter((m) => m === "placeholder").length / metrics.length) * 100 : 0;
const distinctPct = profileDistinctChecks.length
  ? (profileDistinctChecks.filter(Boolean).length / profileDistinctChecks.length) * 100
  : 100;

console.log("\n── Métricas ──");
console.log(`  Personal adaptation real: ${realPct.toFixed(1)}% (meta > 90%)`);
console.log(`  Placeholder: ${placeholderPct.toFixed(1)}% (meta < 10%)`);
console.log(`  Perfis distintos: ${distinctPct.toFixed(1)}% (meta > 90%)`);
assert("adaptation real > 90%", realPct > 90, `${realPct.toFixed(1)}%`);
assert("placeholder < 10%", placeholderPct < 10, `${placeholderPct.toFixed(1)}%`);
assert("perfis distintos > 90%", distinctPct >= 90, `${distinctPct.toFixed(1)}%`);

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

const verdict =
  failed === 0 && realPct > 90 && placeholderPct < 10 && distinctPct >= 90 && (SKIP_REGRESSIONS || regressionFailures === 0)
    ? SKIP_REGRESSIONS
      ? "A) FULLY CLOSED (audit principal — regressões críticas pendentes)"
      : "A) FULLY CLOSED"
    : failed <= 3
      ? "B) PARTIAL"
      : "C) FAILED";

console.log(`\nPassed: ${passed} Failed: ${failed}`);
if (failures.length) failures.forEach((f) => console.log(`  - ${f}`));
console.log(`Veredito: ${verdict}\n`);
process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
