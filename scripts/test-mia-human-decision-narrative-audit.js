/**
 * PATCH 9.2Y — Human Decision Narrative Engine Audit
 *
 * Usage:
 *   node scripts/test-mia-human-decision-narrative-audit.js --skip-regressions
 *   node scripts/test-mia-human-decision-narrative-audit.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { buildHumanDecisionNarrative, isNarrativeTraceable, classifyNarrativeOrigin, isGenericNarrative, NARRATIVE_TYPES, HUMAN_DECISION_NARRATIVE_VERSION } from "../lib/miaHumanDecisionNarrativeEngine.js";
import { buildStructuredExplanationFacts } from "../lib/miaProductExplanationBuilder.js";
import { buildDataLayerEvidenceInjection } from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import { isExpertInsightUseful, INSIGHT_MARKER_PATTERN } from "../lib/miaExpertInsightGenerationLayer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SKIP_REGRESSIONS = process.argv.includes("--skip-regressions");

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
  "test-mia-authority-closing-contract-audit.js",
  "test-mia-evidence-specificity-guard-audit.js",
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
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function cognition(axis = "performance") {
  return { primaryAxis: axis, dominance: axis === "performance" ? "clear" : "moderate", consequenceChain: { impact: "folga no uso", consequence: "menos limitação com o tempo" } };
}

function buildPipeline({ query, category, product, primaryAxis = "performance", querySignals = {} }) {
  return buildSpecialistDecisionExplanation({
    query,
    category,
    product,
    searchCognition: cognition(primaryAxis),
    querySignals,
    decisionMemory: { lastWinnerAdvantages: [primaryAxis], lastWinnerSacrifices: ["screen"] },
    responsePath: "return_seguro",
    sessionContext: {},
  });
}

function classifyNarrativeMetric(narrativeModel = null) {
  if (!narrativeModel?.ok || !narrativeModel.narrative) return "placeholder";
  if (isGenericNarrative(narrativeModel.narrative)) return "generic";
  const origin = classifyNarrativeOrigin(narrativeModel.narrative);
  if (origin === "real" || origin === "derived") return "real";
  return "placeholder";
}

console.log("\nPATCH 9.2Y — Human Decision Narrative Engine Audit\n");
console.log(`Narrative engine: ${HUMAN_DECISION_NARRATIVE_VERSION}`);
console.log(`Narrative types: ${NARRATIVE_TYPES.join(", ")}`);

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

const FOCUS = [
  { id: "focus-A", label: "custo-benefício", query: "celular custo benefício até 2000", axis: "value", querySignals: { priceSensitive: true } },
  { id: "focus-B", label: "longevidade", query: "celular para usar vários anos", axis: "longevity" },
  { id: "focus-C", label: "desempenho", query: "celular desempenho gamer", axis: "performance", querySignals: { technical: true } },
  { id: "focus-D", label: "evitar arrependimento", query: "celular sem arrependimento", axis: "value", querySignals: { avoidRegret: true } },
  { id: "focus-E", label: "praticidade", query: "celular simples dia a dia", axis: "value" },
  { id: "focus-F", label: "usuário técnico", query: "celular 120hz specs", axis: "screen", querySignals: { technical: true } },
  { id: "focus-G", label: "usuário leigo", query: "celular fácil whatsapp", axis: "value" },
  { id: "focus-H", label: "horizonte longo", query: "celular para usar 4 anos", axis: "longevity" },
  { id: "focus-I", label: "horizonte curto", query: "troco de celular todo ano", axis: "value" },
];

const narrativeMetrics = [];
const profileExamples = [];

console.log("\n── Scenarios A–H ──");
for (const s of SCENARIOS) {
  console.log(`\n── ${s.id}) ${s.label} ──`);
  const result = buildPipeline({ query: s.query, category: s.category, product: s.product, primaryAxis: s.axis, querySignals: s.querySignals || {} });
  const model = result.humanDecisionNarrative;
  const n = model?.narrative;
  const metric = classifyNarrativeMetric(model);
  if (s.product.isDataLayerProduct) narrativeMetrics.push(metric);

  console.log(`  type: ${n?.narrativeType || "(none)"}`);
  console.log(`  driver: ${n?.primaryDecisionDriver || "(none)"}`);
  console.log(`  slots: ${Object.keys(n?.contract || {}).filter((k) => n.contract[k]).join(", ") || "(none)"}`);
  console.log(`  metric: ${metric}`);

  assert(`${s.id}: specialist ok`, result.ok);
  assert(`${s.id}: narrative wired`, !!model);
  if (s.product.isDataLayerProduct) {
    assert(`${s.id}: narrative ok`, model?.ok === true);
    assert(`${s.id}: traceable`, isNarrativeTraceable(n));
    assert(`${s.id}: not generic principal`, !isGenericNarrative(n));
    assert(`${s.id}: authority in contract`, !!n?.contract?.authority);
    assert(`${s.id}: meaning != evidence`, !n?.contract?.meaning || !n?.contract?.evidence || n.contract.meaning.content !== n.contract.evidence.content);
  }
}

console.log("\n── Focus scenarios ──");
for (const s of FOCUS) {
  const product = { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS };
  const result = buildPipeline({ query: s.query, category: "celular", product, primaryAxis: s.axis, querySignals: s.querySignals || {} });
  const n = result.humanDecisionNarrative?.narrative;
  console.log(`  ${s.id} ${s.label}: ${n?.narrativeType || "(none)"} driver=${n?.primaryDecisionDriver || ""}`);
  assert(`${s.id}: narrative populated`, result.humanDecisionNarrative?.ok === true);
  profileExamples.push({ label: s.label, type: n?.narrativeType, driver: n?.primaryDecisionDriver });
}

const valueEx = profileExamples.find((e) => e.label.includes("custo"));
const perfEx = profileExamples.find((e) => e.label.includes("desempenho"));
assert("narrativa diferente por perfil", valueEx?.type !== perfEx?.type || valueEx?.driver !== perfEx?.driver);

console.log("\n── 9.2X verbalization alignment (air fryer + mouse) ──");
for (const [label, product, axis, query] of [
  ["air fryer", { product_name: "Air Fryer Max 5L", isDataLayerProduct: true, trustedSpecs: AIR_FRYER_SPECS }, "value", "air fryer família"],
  ["mouse", { product_name: "Mouse Logitech", isDataLayerProduct: true, trustedSpecs: MOUSE_SPECS }, "comfort", "mouse ergonômico"],
]) {
  const sf = buildStructuredExplanationFacts({ product, query, primaryAxis: axis, category: product.trustedSpecs.category });
  const inj = buildDataLayerEvidenceInjection({ product, structuredFacts: sf, query, primaryAxis: axis });
  console.log(`  ${label}: injection=${inj.ok} error=${inj.error || "none"}`);
  assert(`${label}: evidence injects after narrative frame fix`, inj.ok === true);
}

const realPct = narrativeMetrics.length ? (narrativeMetrics.filter((m) => m === "real").length / narrativeMetrics.length) * 100 : 0;
const placeholderPct = narrativeMetrics.length ? (narrativeMetrics.filter((m) => m === "placeholder").length / narrativeMetrics.length) * 100 : 0;
const genericPct = narrativeMetrics.length ? (narrativeMetrics.filter((m) => m === "generic").length / narrativeMetrics.length) * 100 : 0;

console.log("\n── Métricas ──");
console.log(`  Narrative real: ${realPct.toFixed(1)}% (meta > 85%)`);
console.log(`  Placeholder: ${placeholderPct.toFixed(1)}% (meta < 10%)`);
console.log(`  Generic principal: ${genericPct.toFixed(1)}% (meta = 0%)`);
assert("narrative real > 85%", realPct > 85, `${realPct.toFixed(1)}%`);
assert("placeholder < 10%", placeholderPct < 10, `${placeholderPct.toFixed(1)}%`);
assert("generic principal = 0%", genericPct === 0, `${genericPct.toFixed(1)}%`);

console.log("\n── Regressão ──");
let regressionFailures = 0;
if (SKIP_REGRESSIONS) {
  console.log("  (skipped)");
} else {
  for (const script of PRIOR_AUDITS) {
    const r = spawnSync(process.execPath, [join(ROOT, "scripts", script), "--skip-regressions"], { encoding: "utf8", stdio: "pipe", cwd: ROOT });
    const ok = r.status === 0;
    console.log(`${ok ? "PASS" : "FAIL"} ${script}`);
    if (!ok) { regressionFailures += 1; console.log(r.stdout?.slice(-400) || ""); }
  }
  assert("regressões sem falha", regressionFailures === 0, `${regressionFailures}`);
}

const verdict = failed === 0 && realPct > 85 && placeholderPct < 10 && genericPct === 0 && (SKIP_REGRESSIONS || regressionFailures === 0)
  ? SKIP_REGRESSIONS ? "A) FULLY CLOSED (audit principal — regressões pendentes)" : "A) FULLY CLOSED"
  : failed <= 2 && genericPct === 0 ? "B) PARTIAL" : "C) FAILED";

console.log(`\nPassed: ${passed} Failed: ${failed}`);
if (failures.length) failures.forEach((f) => console.log(`  - ${f}`));
console.log(`Veredito: ${verdict}\n`);
process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
