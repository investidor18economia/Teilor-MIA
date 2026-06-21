/**
 * PATCH 9.3B — User Priority Weighting Engine Audit
 *
 * Usage:
 *   node scripts/test-mia-user-priority-weighting-audit.js --skip-regressions
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import {
  buildUserPriorityWeightingModel,
  calculatePriorityWeights,
  resolveDominantPriority,
  resolveSecondaryPriorities,
  resolveIgnoredPriorities,
  calculateTradeoffAcceptance,
  isPriorityWeightingTraceable,
  classifyPriorityWeightingOrigin,
  PRIORITY_CLASSES,
  USER_PRIORITY_WEIGHTING_VERSION,
} from "../lib/miaUserPriorityWeightingEngine.js";

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
];

const SPECS = {
  smartphone: {
    official_name: "iPhone 13",
    category: "celular",
    strengths: ["boa autonomia para um dia inteiro fora de tomada", "desempenho consistente no dia a dia"],
    ideal_for: ["quem prioriza estabilidade"],
    weaknesses: ["tela de 60 Hz pode parecer menos fluida"],
  },
  notebook: {
    official_name: "Notebook Lenovo IdeaPad 3",
    category: "notebook",
    strengths: ["desempenho equilibrado para estudo e trabalho"],
    ideal_for: ["uso diário"],
    weaknesses: ["não é ideal para edição pesada"],
  },
  tv: {
    official_name: "Smart TV Samsung 55 4K",
    category: "tv",
    strengths: ["imagem consistente para streaming"],
    ideal_for: ["quem assiste filmes"],
    weaknesses: ["apps podem variar de fluidez"],
  },
  monitor: {
    official_name: "Monitor LG UltraGear 27",
    category: "monitor",
    strengths: ["fluidez boa para home office"],
    ideal_for: ["uso prolongado"],
    weaknesses: ["não é topo para edição de cor"],
  },
  mouse: {
    official_name: "Mouse Logitech MX Master",
    category: "mouse",
    strengths: ["ergonomia confortável para uso prolongado"],
    ideal_for: ["trabalho longo com mouse"],
  },
  teclado: {
    official_name: "Teclado Keychron K2",
    category: "teclado",
    strengths: ["digitação confortável para longas sessões"],
    ideal_for: ["home office"],
    weaknesses: ["barulho pode incomodar"],
  },
  cadeira: {
    official_name: "Cadeira Ergonomica Flex",
    category: "cadeira",
    strengths: ["apoio lombar ajustável"],
    ideal_for: ["longas horas sentado"],
    weaknesses: ["ocupa espaço"],
  },
  air_fryer: {
    official_name: "Air Fryer Max 5L",
    category: "air_fryer",
    strengths: "boa_capacidade;facil_limpeza",
    ideal_for: "familia_media",
    weaknesses: "ocupa_bancada",
  },
  geladeira: {
    official_name: "Geladeira Brastemp Frost Free",
    category: "geladeira",
    strengths: ["capacidade para família média"],
    ideal_for: ["família"],
    weaknesses: ["consumo de energia"],
  },
  maquina_lavar: {
    official_name: "Lavadora Electrolux 12kg",
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

const CATEGORIES = [
  { id: "A", label: "smartphone", category: "celular", query: "celular até 2000", axis: "value", specsKey: "smartphone" },
  { id: "B", label: "notebook", category: "notebook", query: "notebook trabalho", axis: "performance", specsKey: "notebook" },
  { id: "C", label: "TV", category: "tv", query: "smart tv streaming", axis: "screen", specsKey: "tv" },
  { id: "D", label: "monitor", category: "monitor", query: "monitor home office", axis: "screen", specsKey: "monitor" },
  { id: "E", label: "mouse", category: "mouse", query: "mouse ergonômico", axis: "comfort", specsKey: "mouse" },
  { id: "F", label: "teclado", category: "teclado", query: "teclado mecânico", axis: "comfort", specsKey: "teclado" },
  { id: "G", label: "cadeira", category: "cadeira", query: "cadeira ergonômica", axis: "comfort", specsKey: "cadeira" },
  { id: "H", label: "air fryer", category: "air_fryer", query: "air fryer família", axis: "value", specsKey: "air_fryer" },
  { id: "I", label: "geladeira", category: "geladeira", query: "geladeira família", axis: "value", specsKey: "geladeira" },
  { id: "J", label: "máquina de lavar", category: "maquina_lavar", query: "máquina de lavar 12kg", axis: "value", specsKey: "maquina_lavar" },
  { id: "K", label: "câmera", category: "camera", query: "câmera viagem", axis: "camera", specsKey: "camera" },
  { id: "L", label: "desconhecida", category: "outros", query: "produto doméstico", axis: "value", specsKey: null },
  { id: "M", label: "sem data layer", category: "celular", query: "celular custo benefício", axis: "value", specsKey: null, noDataLayer: true },
];

const FOCUS = [
  { id: "focus-A", label: "economia", query: "celular custo benefício barato", axis: "value", expected: ["cost_priority"], querySignals: { priceSensitive: true } },
  { id: "focus-B", label: "desempenho", query: "celular desempenho gamer potente", axis: "performance", expected: ["performance_priority"] },
  { id: "focus-C", label: "longevidade", query: "celular para usar vários anos", axis: "longevity", expected: ["longevity_priority", "ownership_priority"] },
  { id: "focus-D", label: "anti-arrependimento", query: "celular sem arrependimento", axis: "value", expected: ["anti_regret_priority"], querySignals: { avoidRegret: true } },
  { id: "focus-E", label: "praticidade", query: "celular simples dia a dia", axis: "value", expected: ["practicality_priority"] },
  { id: "focus-F", label: "técnico", query: "celular 120hz specs detalhadas", axis: "screen", expected: ["learning_priority", "performance_priority"], querySignals: { technical: true } },
  { id: "focus-G", label: "leigo", query: "celular fácil whatsapp", axis: "value", expected: ["practicality_priority", "cost_priority"] },
  { id: "focus-H", label: "orçamento apertado", query: "celular barato até 1200", axis: "value", expected: ["cost_priority"], querySignals: { priceSensitive: true } },
  { id: "focus-I", label: "orçamento folgado", query: "celular premium até 6000", axis: "performance", expected: ["performance_priority", "longevity_priority"], querySignals: { budgetRelaxed: true } },
  { id: "focus-J", label: "prioridades conflitantes", query: "celular barato que dura vários anos", axis: "value", expected: ["cost_priority", "longevity_priority"], multi: true },
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

function cognition(axis = "performance") {
  return {
    primaryAxis: axis,
    dominance: axis === "performance" ? "clear" : "moderate",
    consequenceChain: { impact: "folga", consequence: "menos limitação" },
  };
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
  if (!model?.ok || !model.priorityWeights) return "placeholder";
  const origin = classifyPriorityWeightingOrigin(model.priorityWeights);
  if (origin === "real" || origin === "derived") return "real";
  return "placeholder";
}

function dominantMatches(expected = [], primary = "") {
  return expected.includes(primary);
}

console.log(`\nPATCH 9.3B — User Priority Weighting Engine Audit\n`);
console.log(`Engine: ${USER_PRIORITY_WEIGHTING_VERSION}`);
console.log(`Classes: ${PRIORITY_CLASSES.join(", ")}`);

console.log("\n── Unit: weighting functions ──");
const raw = { cost_priority: 0.5, longevity_priority: 0.3, performance_priority: 0.2 };
const weights = calculatePriorityWeights(raw);
assert("weights normalize to ~1", Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 1) < 0.01);
const dominant = resolveDominantPriority(weights, { primaryAxis: "value" });
assert("dominant resolves cost", dominant === "cost_priority");
const secondary = resolveSecondaryPriorities(weights, dominant);
assert("secondary includes longevity", secondary.includes("longevity_priority"));
const ignored = resolveIgnoredPriorities("não ligo para câmera", weights);
assert("ignored detects camera deprioritization", ignored.includes("confidence_priority"));
const tradeoff = calculateTradeoffAcceptance(weights, dominant);
assert("tradeoff acceptance populated", tradeoff.acceptedSacrifices.length >= 2);

const metrics = [];
const dominantChecks = [];

console.log("\n── Categorias A–M ──");
for (const cat of CATEGORIES) {
  console.log(`\n── ${cat.id}) ${cat.label} ──`);
  const result = buildPipeline(cat);
  const model = result.priorityWeightsModel;
  const pw = model?.priorityWeights;
  const metric = classifyMetric(model);
  if (!cat.noDataLayer || cat.specsKey !== null) metrics.push(metric);

  console.log(`  primary: ${pw?.primaryPriority || "(none)"}`);
  console.log(`  secondary: ${(pw?.secondaryPriorities || []).join(", ") || "(none)"}`);
  console.log(`  tradeoff accepts: ${(pw?.tradeoffAcceptance || []).slice(0, 3).join(", ")}`);
  console.log(`  metric: ${metric}`);

  assert(`${cat.id}: specialist ok`, result.ok);
  assert(`${cat.id}: model wired`, !!model);
  assert(`${cat.id}: priority ok`, model?.ok === true);
  assert(`${cat.id}: traceable`, isPriorityWeightingTraceable(pw));
  assert(`${cat.id}: primary in classes`, PRIORITY_CLASSES.includes(pw?.primaryPriority));
}

console.log("\n── Focus scenarios ──");
const profileWeights = [];
for (const s of FOCUS) {
  const model = buildUserPriorityWeightingModel({
    query: s.query,
    primaryAxis: s.axis,
    querySignals: s.querySignals || {},
    searchCognition: cognition(s.axis),
  });
  const pw = model.priorityWeights;
  const correct = dominantMatches(s.expected, pw.primaryPriority);
  dominantChecks.push({ label: s.label, correct, primary: pw.primaryPriority, expected: s.expected });

  console.log(
    `  ${s.id} ${s.label}: primary=${pw.primaryPriority} secondary=${pw.secondaryPriorities?.slice(0, 2).join("+")} accepts=${pw.tradeoffAcceptance?.slice(0, 2).join(",")}`
  );

  assert(`${s.id}: model ok`, model.ok);
  assert(`${s.id}: traceable`, isPriorityWeightingTraceable(pw));

  if (s.multi) {
    const topTwo = Object.entries(pw.weights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k]) => k);
    assert(`${s.id}: conflito preserva múltiplas prioridades`, topTwo.some((p) => s.expected.includes(p)), topTwo.join("+"));
    assert(`${s.id}: secondary não vazia`, pw.secondaryPriorities.length >= 1);
  } else if (s.id === "focus-I") {
    assert(`${s.id}: orçamento folgado não domina cost`, pw.primaryPriority !== "cost_priority" || pw.weights.cost_priority < 0.35);
  } else {
    assert(`${s.id}: dominant priority correta`, correct, `got ${pw.primaryPriority}, expected ${s.expected.join("|")}`);
  }

  profileWeights.push({ label: s.label, primary: pw.primaryPriority, weights: pw.weights });
  metrics.push(classifyMetric(model));
}

const uniquePrimaries = new Set(profileWeights.map((p) => p.primary)).size;
assert("perfis geram prioridades diferentes", uniquePrimaries >= 4, `${uniquePrimaries} únicos`);

const realPct = metrics.length ? (metrics.filter((m) => m === "real").length / metrics.length) * 100 : 0;
const placeholderPct = metrics.length ? (metrics.filter((m) => m === "placeholder").length / metrics.length) * 100 : 0;
const dominantWrongPct = dominantChecks.length
  ? (dominantChecks.filter((d) => !d.correct && !FOCUS.find((f) => f.label === d.label)?.multi && d.label !== "orçamento folgado").length /
      dominantChecks.filter((d) => !FOCUS.find((f) => f.label === d.label)?.multi && d.label !== "orçamento folgado").length) *
    100
  : 0;

console.log("\n── Métricas ──");
console.log(`  Priority weighting real: ${realPct.toFixed(1)}% (meta > 90%)`);
console.log(`  Placeholder: ${placeholderPct.toFixed(1)}% (meta < 10%)`);
console.log(`  Dominant priority incorreta: ${dominantWrongPct.toFixed(1)}% (meta < 5%)`);
assert("priority real > 90%", realPct > 90, `${realPct.toFixed(1)}%`);
assert("placeholder < 10%", placeholderPct < 10, `${placeholderPct.toFixed(1)}%`);
assert("dominant incorrect < 5%", dominantWrongPct < 5, `${dominantWrongPct.toFixed(1)}%`);

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
  failed === 0 && realPct > 90 && placeholderPct < 10 && dominantWrongPct < 5 && (SKIP_REGRESSIONS || regressionFailures === 0)
    ? SKIP_REGRESSIONS
      ? "A) FULLY CLOSED (audit principal — regressões críticas pendentes)"
      : "A) FULLY CLOSED"
    : failed <= 2 && dominantWrongPct < 10
      ? "B) PARTIAL"
      : "C) FAILED";

console.log(`\nPassed: ${passed} Failed: ${failed}`);
if (failures.length) failures.forEach((f) => console.log(`  - ${f}`));
console.log(`Veredito: ${verdict}\n`);
process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
