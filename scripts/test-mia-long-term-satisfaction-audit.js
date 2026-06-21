/**
 * PATCH 9.2Z — Long-Term Satisfaction Reasoning Layer Audit
 *
 * Usage:
 *   node scripts/test-mia-long-term-satisfaction-audit.js --skip-regressions
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import {
  buildLongTermSatisfactionModel,
  isLongTermSatisfactionTraceable,
  classifyLongTermSatisfactionOrigin,
  isUntraceableTrajectory,
  SATISFACTION_CLASSES,
  SATISFACTION_TRAJECTORIES,
  REGRET_TRAJECTORIES,
  TRADEOFF_EVOLUTIONS,
  LONG_TERM_SATISFACTION_VERSION,
} from "../lib/miaLongTermSatisfactionReasoningLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SKIP_REGRESSIONS = process.argv.includes("--skip-regressions");

const CRITICAL_REGRESSIONS = [
  "test-mia-semantic-family-allocation-engine-audit.js",
  "test-mia-specialist-presentation-recovery-audit.js",
  "test-mia-sensation-authority-bridge-audit.js",
  "test-mia-evidence-specificity-guard-audit.js",
  "test-mia-human-decision-narrative-audit.js",
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
  return { primaryAxis: axis, dominance: axis === "performance" ? "clear" : "moderate", consequenceChain: { impact: "folga", consequence: "menos limitação" } };
}

function buildPipeline({ query, category, product, primaryAxis = "performance", querySignals = {} }) {
  return buildSpecialistDecisionExplanation({
    query,
    category,
    product,
    searchCognition: cognition(primaryAxis),
    querySignals,
    decisionMemory: { lastWinnerAdvantages: [primaryAxis] },
    responsePath: "return_seguro",
    sessionContext: {},
  });
}

function classifyMetric(model = null) {
  if (!model?.ok || !model.longTermSatisfaction) return "placeholder";
  if (isUntraceableTrajectory(model.longTermSatisfaction)) return "untraceable";
  const origin = classifyLongTermSatisfactionOrigin(model.longTermSatisfaction);
  if (origin === "real" || origin === "derived") return "real";
  return "placeholder";
}

console.log("\nPATCH 9.2Z — Long-Term Satisfaction Reasoning Layer Audit\n");
console.log(`Layer: ${LONG_TERM_SATISFACTION_VERSION}`);
console.log(`Classes: ${SATISFACTION_CLASSES.join(", ")}`);
console.log(`Trajectories: ${SATISFACTION_TRAJECTORIES.join(", ")}`);

const SCENARIOS = [
  { id: "A", label: "smartphone", query: "celular até 2000 bateria", category: "celular", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS }, axis: "battery" },
  { id: "B", label: "notebook", query: "notebook trabalho", category: "notebook", product: { product_name: "Notebook Lenovo", isDataLayerProduct: true, trustedSpecs: NOTEBOOK_SPECS }, axis: "performance" },
  { id: "C", label: "TV", query: "smart tv streaming", category: "tv", product: { product_name: "Smart TV Samsung", isDataLayerProduct: true, trustedSpecs: TV_SPECS }, axis: "screen" },
  { id: "D", label: "air fryer", query: "air fryer família", category: "air_fryer", product: { product_name: "Air Fryer Max 5L", isDataLayerProduct: true, trustedSpecs: AIR_FRYER_SPECS }, axis: "value" },
  { id: "E", label: "monitor", query: "monitor home office", category: "monitor", product: { product_name: "Monitor LG", isDataLayerProduct: true, trustedSpecs: MONITOR_SPECS }, axis: "screen" },
  { id: "F", label: "mouse", query: "mouse ergonômico", category: "mouse", product: { product_name: "Mouse Logitech", isDataLayerProduct: true, trustedSpecs: MOUSE_SPECS }, axis: "comfort" },
  { id: "G", label: "categoria desconhecida", query: "produto doméstico", category: "outros", product: { product_name: "Gadget Pro", isDataLayerProduct: false, category: "outros" }, axis: "value" },
  { id: "H", label: "sem data layer", query: "celular custo benefício", category: "celular", product: { product_name: "Samsung A54", isDataLayerProduct: false, category: "celular" }, axis: "value" },
];

const FOCUS = [
  { id: "focus-A", label: "custo-benefício", query: "celular custo benefício", axis: "value", querySignals: { priceSensitive: true } },
  { id: "focus-B", label: "longevidade", query: "celular para usar vários anos", axis: "longevity" },
  { id: "focus-C", label: "desempenho", query: "celular desempenho gamer", axis: "performance", querySignals: { technical: true } },
  { id: "focus-D", label: "evitar arrependimento", query: "celular sem arrependimento", axis: "value", querySignals: { avoidRegret: true } },
  { id: "focus-E", label: "praticidade", query: "celular simples dia a dia", axis: "value" },
  { id: "focus-F", label: "usuário técnico", query: "celular 120hz specs", axis: "screen", querySignals: { technical: true } },
  { id: "focus-G", label: "usuário leigo", query: "celular fácil whatsapp", axis: "value" },
  { id: "focus-H", label: "posse curta", query: "troco de celular todo ano", axis: "value" },
  { id: "focus-I", label: "posse longa", query: "celular para usar 4 anos", axis: "longevity" },
];

const metrics = [];
const profiles = [];

console.log("\n── Scenarios A–H ──");
for (const s of SCENARIOS) {
  console.log(`\n── ${s.id}) ${s.label} ──`);
  const result = buildPipeline({ query: s.query, category: s.category, product: s.product, primaryAxis: s.axis, querySignals: s.querySignals || {} });
  const model = result.longTermSatisfactionModel;
  const lt = model?.longTermSatisfaction;
  const metric = classifyMetric(model);
  if (s.product.isDataLayerProduct) metrics.push(metric);

  console.log(`  class: ${lt?.satisfactionClass || "(none)"}`);
  console.log(`  trajectory: ${lt?.satisfactionTrajectory || "(none)"}`);
  console.log(`  regret: ${lt?.regretExpectation || "(none)"} | tradeoff: ${lt?.tradeoffEvolution || "(none)"}`);
  console.log(`  metric: ${metric}`);

  assert(`${s.id}: specialist ok`, result.ok);
  assert(`${s.id}: model wired`, !!model);
  if (s.product.isDataLayerProduct) {
    assert(`${s.id}: satisfaction ok`, model?.ok === true);
    assert(`${s.id}: traceable`, isLongTermSatisfactionTraceable(lt));
    assert(`${s.id}: ownership considered`, lt?.ownershipConsidered === true);
    assert(`${s.id}: authority considered`, lt?.authorityConsidered === true);
    assert(`${s.id}: no untraceable trajectory`, !isUntraceableTrajectory(lt));
  }
}

console.log("\n── Focus scenarios ──");
for (const s of FOCUS) {
  const product = { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS };
  const result = buildPipeline({ query: s.query, category: "celular", product, primaryAxis: s.axis, querySignals: s.querySignals || {} });
  const lt = result.longTermSatisfactionModel?.longTermSatisfaction;
  console.log(`  ${s.id} ${s.label}: ${lt?.satisfactionClass} traj=${lt?.satisfactionTrajectory} rel=${lt?.contextualRelevance?.toFixed(2)}`);
  assert(`${s.id}: satisfaction populated`, result.longTermSatisfactionModel?.ok === true);
  profiles.push({ label: s.label, class: lt?.satisfactionClass, trajectory: lt?.satisfactionTrajectory, relevance: lt?.contextualRelevance });
}

const longHold = profiles.find((p) => p.label.includes("posse longa"));
const shortHold = profiles.find((p) => p.label.includes("posse curta"));
assert(
  "satisfação diferente por horizonte de posse",
  longHold?.trajectory !== shortHold?.trajectory || longHold?.class !== shortHold?.class || longHold?.relevance !== shortHold?.relevance
);

const realPct = metrics.length ? (metrics.filter((m) => m === "real").length / metrics.length) * 100 : 0;
const placeholderPct = metrics.length ? (metrics.filter((m) => m === "placeholder").length / metrics.length) * 100 : 0;
const untraceablePct = metrics.length ? (metrics.filter((m) => m === "untraceable").length / metrics.length) * 100 : 0;

console.log("\n── Métricas ──");
console.log(`  Satisfaction real: ${realPct.toFixed(1)}% (meta > 85%)`);
console.log(`  Placeholder: ${placeholderPct.toFixed(1)}% (meta < 10%)`);
console.log(`  Trajetória sem rastreio: ${untraceablePct.toFixed(1)}% (meta = 0%)`);
assert("satisfaction real > 85%", realPct > 85, `${realPct.toFixed(1)}%`);
assert("placeholder < 10%", placeholderPct < 10, `${placeholderPct.toFixed(1)}%`);
assert("untraceable trajectory = 0%", untraceablePct === 0, `${untraceablePct.toFixed(1)}%`);

console.log("\n── Regressões críticas ──");
let regressionFailures = 0;
if (SKIP_REGRESSIONS) {
  console.log("  (skipped)");
} else {
  for (const script of CRITICAL_REGRESSIONS) {
    const args = ["--skip-regressions"];
    const r = spawnSync(process.execPath, [join(ROOT, "scripts", script), ...args], { encoding: "utf8", stdio: "pipe", cwd: ROOT });
    const ok = r.status === 0;
    console.log(`${ok ? "PASS" : "FAIL"} ${script}`);
    if (!ok) {
      regressionFailures += 1;
      console.log(r.stdout?.slice(-300) || "");
    }
  }
  assert("regressões críticas sem falha", regressionFailures === 0, `${regressionFailures}`);
}

const verdict =
  failed === 0 && realPct > 85 && placeholderPct < 10 && untraceablePct === 0 && (SKIP_REGRESSIONS || regressionFailures === 0)
    ? SKIP_REGRESSIONS
      ? "A) FULLY CLOSED (audit principal — regressões críticas pendentes)"
      : "A) FULLY CLOSED"
    : failed <= 2 && untraceablePct === 0
      ? "B) PARTIAL"
      : "C) FAILED";

console.log(`\nPassed: ${passed} Failed: ${failed}`);
if (failures.length) failures.forEach((f) => console.log(`  - ${f}`));
console.log(`Veredito: ${verdict}\n`);
process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
