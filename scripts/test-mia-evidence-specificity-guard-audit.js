/**
 * PATCH 9.2X — Evidence Specificity Guard Audit
 *
 * Usage:
 *   node scripts/test-mia-evidence-specificity-guard-audit.js
 *   node scripts/test-mia-evidence-specificity-guard-audit.js --skip-regressions
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import { buildStructuredExplanationFacts } from "../lib/miaProductExplanationBuilder.js";
import {
  buildDataLayerEvidenceInjection,
  extractDataLayerEvidence,
  isEvidenceInjectionUseful,
  DATA_LAYER_EVIDENCE_INJECTION_VERSION,
} from "../lib/miaDataLayerEvidenceInjectionLayer.js";
import {
  guardEvidenceSpecificity,
  isGenericInterchangeableEvidence,
  isEvidenceSpecificityAcceptable,
  classifyEvidenceSpecificityOrigin,
  SPECIFICITY_CLASSES,
  EVIDENCE_SPECIFICITY_GUARD_VERSION,
} from "../lib/miaEvidenceSpecificityGuard.js";
import {
  extractExpertInsightFromReply,
  isExpertInsightUseful,
  INSIGHT_MARKER_PATTERN,
} from "../lib/miaExpertInsightGenerationLayer.js";
import { appendUserIntentDiscovery } from "../lib/miaUserIntentDiscoveryLayer.js";
import { finalizeReplyWithRepetitionCompression } from "../lib/miaRepetitionCompressionGuard.js";
import { finalizeReplyWithConversationalClosing } from "../lib/miaConversationalClosingEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKIP_REGRESSIONS = process.argv.includes("--skip-regressions");
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
  "test-mia-authority-closing-contract-audit.js",
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
  market_notes: ["um detalhe prático que ajuda a calibrar a expectativa"],
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
  if (!specialist.ok) return { specialist, reply: "", evidence: "" };

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

  const evidence =
    specialist.presentation?.evidence?.[0] ||
    specialist.paragraphs?.find((entry) => /detalhe que|ponto que|ponto observado|na comparação/i.test(entry)) ||
    "";

  const insight =
    specialist.presentation?.insight?.[0] ||
    specialist.paragraphs?.find((entry) => INSIGHT_MARKER_PATTERN.test(entry)) ||
    extractExpertInsightFromReply(reply);

  return { specialist, reply, evidence, insight };
}

function classifyPrincipalEvidenceMetric(injection = {}, scenario = {}) {
  if (injection.error === "suppressed") return "no_principal";
  const diagnostic = injection.specificityDiagnostic;
  const evidenceText =
    diagnostic?.evidenceText || injection.evidence?.text || injection.paragraph || "";

  if (!injection.ok) {
    if (
      injection.error === "no_specific_evidence" ||
      injection.error === "omitted_generic_evidence" ||
      injection.error === "no_evidence"
    ) {
      return "omitted";
    }
    return "omitted";
  }

  if (!diagnostic) {
    if (isGenericInterchangeableEvidence(evidenceText)) return "generic";
    return "unsupported";
  }

  return classifyEvidenceMetric(diagnostic, evidenceText);
}

function classifyEvidenceMetric(diagnostic = null, evidenceText = "") {
  if (!diagnostic && isGenericInterchangeableEvidence(evidenceText)) return "generic";
  if (!diagnostic) return "unsupported";
  const origin = classifyEvidenceSpecificityOrigin(diagnostic);
  if (origin === "specific") return "specific";
  if (origin === "downgraded") return "downgraded";
  if (origin === "generic") return "generic";
  if (origin === "omitted") return "omitted";
  return "unsupported";
}

console.log("\nPATCH 9.2X — Evidence Specificity Guard Audit\n");
console.log(`Guard layer: ${EVIDENCE_SPECIFICITY_GUARD_VERSION}`);
console.log(`Evidence injection: ${DATA_LAYER_EVIDENCE_INJECTION_VERSION}`);
console.log(`Specificity classes: ${SPECIFICITY_CLASSES.join(", ")}`);

console.log("\n── Unit: Generic blocking ──");
const genericGuard = guardEvidenceSpecificity({
  evidenceCandidates: [
    { text: "um detalhe prático que ajuda a calibrar a expectativa", field: "market_notes", source: "data_layer_humanized" },
    { text: "combina com o perfil de uso descrito", field: "notes", source: "data_layer_humanized" },
    { text: "ainda recebe atualizações de sistema como aparelho principal da linha", field: "strengths", source: "consequence_translation" },
  ],
  structuredFacts: {
    mode: "data_layer",
    strengthConsequences: ["ainda recebe atualizações de sistema como aparelho principal da linha"],
  },
  query: "celular longevidade",
  primaryAxis: "longevity",
});
assert("generic notes omitted", genericGuard.rejectedEvidence.length >= 2);
assert("specific consequence accepted", genericGuard.acceptedEvidence.length >= 1);
assert(
  "accepted is specific_consequence",
  genericGuard.acceptedEvidence[0]?.specificityClass === "specific_consequence"
);

console.log("\n── Unit: Strong opener gate ──");
const specificInjection = buildDataLayerEvidenceInjection({
  product: { product_name: "iPhone 13", trustedSpecs: IPHONE_SPECS, isDataLayerProduct: true },
  structuredFacts: {
    mode: "data_layer",
    allowedEvidence: "iPhone 13",
    strengthConsequences: [
      "menos necessidade de interromper o uso para procurar tomada",
      "ainda recebe atualizações de sistema como aparelho principal da linha",
    ],
    noteConsequences: ["um detalhe prático que ajuda a calibrar a expectativa"],
  },
  query: "celular bateria até 2000",
  primaryAxis: "battery",
});
assert("specific injection ok", specificInjection.ok);
assert(
  "strong opener only with specific evidence",
  specificInjection.specificityDiagnostic?.allowStrongOpener === true
);
assert(
  "no generic note as principal",
  !isGenericInterchangeableEvidence(specificInjection.evidence?.text || "")
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
  { id: "focus-A", label: "evidência específica disponível", query: "celular bateria autonomia até 2000", axis: "battery" },
  { id: "focus-B", label: "apenas notes genéricas", product: { product_name: "Genérico", isDataLayerProduct: true, trustedSpecs: { official_name: "Genérico", strengths: ["boa opção"], market_notes: ["um detalhe prático que ajuda a calibrar a expectativa"], notes: ["combina com o perfil de uso descrito"] } }, axis: "value" },
  { id: "focus-C", label: "market_notes genéricas", product: { product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: { ...IPHONE_SPECS, strengths: ["boa autonomia"], market_notes: ["é um ponto importante na comparação"] } }, query: "celular bateria", axis: "battery" },
  { id: "focus-D", label: "prioridade incompatível", query: "celular bateria autonomia", axis: "battery", querySignals: {} },
  { id: "focus-E", label: "usuário técnico", query: "celular 120hz processador", axis: "screen", querySignals: { technical: true } },
  { id: "focus-F", label: "usuário leigo", query: "celular simples whatsapp", axis: "value", querySignals: {} },
  { id: "focus-G", label: "sem Data Layer", product: { product_name: "Samsung A54", isDataLayerProduct: false, category: "celular" }, query: "celular barato", axis: "value" },
  { id: "focus-H", label: "categoria desconhecida", product: { product_name: "Gadget", isDataLayerProduct: false, category: "outros" }, query: "produto doméstico", axis: "value" },
];

const evidenceMetrics = [];
const examples = { accepted: [], downgraded: [], omitted: [] };

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

  const structuredFacts = buildStructuredExplanationFacts({
    product: scenario.product,
    query: scenario.query,
    primaryAxis: scenario.axis,
    category: scenario.category,
  });

  const injection = buildDataLayerEvidenceInjection({
    product: scenario.product,
    structuredFacts,
    query: scenario.query,
    primaryAxis: scenario.axis,
    querySignals: scenario.querySignals || {},
  });

  const diagnostic = injection.specificityDiagnostic;
  const evidenceText = diagnostic?.evidenceText || injection.evidence?.text || result.evidence || "";
  const metric = classifyPrincipalEvidenceMetric(injection, scenario);
  if (metric !== "no_principal") evidenceMetrics.push(metric);

  console.log(`  evidence injected: ${injection.ok || !!result.evidence}`);
  console.log(`  specificityClass: ${diagnostic?.specificityClass || "(none)"}`);
  console.log(`  action: ${diagnostic?.action || metric}`);
  console.log(`  generic risk: ${diagnostic?.genericityRisk?.toFixed(2) || "n/a"}`);
  console.log(`  metric: ${metric}`);

  assert(`${scenario.id}: specialist ok`, result.specialist.ok);
  if (scenario.product.isDataLayerProduct) {
    assert(
      `${scenario.id}: no generic principal`,
      metric === "omitted" || !isGenericInterchangeableEvidence(evidenceText)
    );
    if (scenario.product.isDataLayerProduct && injection.error !== "suppressed") {
      assert(
        `${scenario.id}: specificity guard ran or honest omission`,
        Boolean(injection.specificityGuard?.specificityDiagnostics?.length) ||
          ["no_specific_evidence", "omitted_generic_evidence", "generic_evidence"].includes(
            injection.error || ""
          )
      );
    }
    assert(`${scenario.id}: insight still present`, isExpertInsightUseful(result.insight));
  }
}

console.log("\n── Focus scenarios ──");
for (const scenario of FOCUS_SCENARIOS) {
  const product =
    scenario.product ||
    ({ product_name: "iPhone 13", isDataLayerProduct: true, trustedSpecs: IPHONE_SPECS });
  const structuredFacts = product.isDataLayerProduct
    ? buildStructuredExplanationFacts({
        product,
        query: scenario.query || "celular",
        primaryAxis: scenario.axis,
        category: product.category || "celular",
      })
    : null;
  const injection = buildDataLayerEvidenceInjection({
    product,
    structuredFacts,
    query: scenario.query || "celular",
    primaryAxis: scenario.axis,
    querySignals: scenario.querySignals || {},
  });
  const d = injection.specificityDiagnostic;
  console.log(
    `  ${scenario.id} ${scenario.label}: action=${d?.action || injection.error || "n/a"} class=${d?.specificityClass || "n/a"}`
  );
  assert(`${scenario.id}: guard evaluated`, Boolean(injection.specificityGuard) || injection.error === "suppressed");
  if (scenario.id === "focus-B" || scenario.id === "focus-C") {
    assert(`${scenario.id}: generic blocked or downgraded`, !injection.ok || d?.action !== "accept" || !isGenericInterchangeableEvidence(d?.evidenceText || ""));
  }
  if (d?.action === "accept") examples.accepted.push({ label: scenario.label, text: d.evidenceText?.slice(0, 80) });
  if (d?.action === "downgrade") examples.downgraded.push({ label: scenario.label, text: d.evidenceText?.slice(0, 80) });
  if (d?.action === "omit" || injection.error) examples.omitted.push({ label: scenario.label, reason: d?.reason || injection.error });
}

const specificPct =
  evidenceMetrics.length > 0
    ? (evidenceMetrics.filter((m) => m === "specific" || m === "downgraded").length /
        evidenceMetrics.length) *
      100
    : 0;
const genericPrincipalPct =
  evidenceMetrics.length > 0
    ? (evidenceMetrics.filter((m) => m === "generic").length / evidenceMetrics.length) * 100
    : 0;
const unsupportedPrincipalPct =
  evidenceMetrics.length > 0
    ? (evidenceMetrics.filter((m) => m === "unsupported").length / evidenceMetrics.length) * 100
    : 0;
const omittedCount = evidenceMetrics.filter((m) => m === "omitted").length;

console.log("\n── Métricas de aceite ──");
console.log(`  Evidence específica aceita/downgraded: ${specificPct.toFixed(1)}% (meta > 80%)`);
console.log(`  Generic evidence principal: ${genericPrincipalPct.toFixed(1)}% (meta < 10%)`);
console.log(`  Unsupported evidence principal: ${unsupportedPrincipalPct.toFixed(1)}% (meta = 0%)`);
console.log(`  Omitted (sem principal): ${omittedCount}`);
console.log(`  Cenários com principal avaliado: ${evidenceMetrics.length}`);
assert("evidence específica > 80%", specificPct > 80, `${specificPct.toFixed(1)}%`);
assert("generic principal < 10%", genericPrincipalPct < 10, `${genericPrincipalPct.toFixed(1)}%`);
assert("unsupported principal = 0%", unsupportedPrincipalPct === 0, `${unsupportedPrincipalPct.toFixed(1)}%`);

console.log("\n── Exemplos ──");
console.log("  Aceita:", examples.accepted[0]?.text || "(see pipeline)");
console.log("  Rebaixada:", examples.downgraded[0]?.text || "(n/a)");
console.log("  Omitida:", examples.omitted[0]?.reason || "(n/a)");

console.log("\n── Before / After ──");
console.log("Antes (9.2W): 9.1G podia usar opener forte com notes genéricas");
console.log("Depois: guard bloqueia/rebaixa genéricas; opener forte só com evidência específica");

console.log("\n── Regressão 9.2I–W ──");
let regressionFailures = 0;
if (SKIP_REGRESSIONS) {
  console.log("  (skipped — use without --skip-regressions to run)");
} else {
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
      console.log(result.stdout?.slice(-600) || "");
    }
  }
  assert("regressões sem falha", regressionFailures === 0, `${regressionFailures} falhas`);
}

const verdict =
  !SKIP_REGRESSIONS &&
  failed === 0 &&
  specificPct > 80 &&
  genericPrincipalPct < 10 &&
  unsupportedPrincipalPct === 0
    ? "A) FULLY CLOSED"
    : SKIP_REGRESSIONS &&
        failed === 0 &&
        specificPct > 80 &&
        genericPrincipalPct < 10 &&
        unsupportedPrincipalPct === 0
      ? "A) FULLY CLOSED (audit principal — regressões pendentes)"
      : failed <= 2 && genericPrincipalPct < 10 && unsupportedPrincipalPct === 0
        ? "B) PARTIAL"
        : "C) FAILED";

console.log("\n── Resumo ──");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length) for (const entry of failures) console.log(`  - ${entry}`);
console.log(`\nVeredito: ${verdict}\n`);

process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
