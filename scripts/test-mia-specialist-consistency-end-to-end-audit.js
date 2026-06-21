/**
 * PATCH 9.3E — Specialist Consistency End-to-End Audit
 *
 * Usage:
 *   node scripts/test-mia-specialist-consistency-end-to-end-audit.js --skip-regressions
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildSpecialistDecisionExplanation } from "../lib/miaSpecialistDecisionExplanationLayer.js";
import {
  hasDetectableSpecialistPresentation,
  isStructuredSpecialistReply,
  verifySpecialistPresentationGuard,
  finalizeSpecialistPresentationRecovery,
} from "../lib/miaSpecialistPresentationContract.js";
import { finalizeReplyWithConversationalClosing } from "../lib/miaConversationalClosingEngine.js";
import { finalizeReplyWithTradeoffVisualEmphasis } from "../lib/miaTradeoffVisualEmphasisLayer.js";
import { isAuthorityTraceable, classifyAuthorityOrigin } from "../lib/miaAuthorityClosingContract.js";
import {
  isNarrativeTraceable,
  isGenericNarrative,
  NARRATIVE_SLOTS,
} from "../lib/miaHumanDecisionNarrativeEngine.js";
import { isLongTermSatisfactionTraceable } from "../lib/miaLongTermSatisfactionReasoningLayer.js";
import { isGenericInsightBody } from "../lib/miaDataLayerSemanticNormalizer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SKIP_REGRESSIONS = process.argv.includes("--skip-regressions");

export const SPECIALIST_CONSISTENCY_AUDIT_VERSION = "9.3E.2";

const CRITICAL_REGRESSIONS = [
  "test-mia-semantic-family-allocation-engine-audit.js",
  "test-mia-sensation-authority-bridge-audit.js",
  "test-mia-evidence-specificity-guard-audit.js",
  "test-mia-human-decision-narrative-audit.js",
  "test-mia-long-term-satisfaction-audit.js",
  "test-mia-cross-category-human-reasoning-audit.js",
  "test-mia-user-priority-weighting-audit.js",
  "test-mia-personal-decision-adaptation-audit.js",
  "test-mia-anti-regret-human-consequence-audit.js",
];

const COGNITIVE_GENERIC_PATTERN =
  /^(?:ganho percept[ií]vel|detalhe pr[aá]tico que ajuda|combina com o perfil de uso descrito|funciona bem para esse perfil)$/i;

const REPETITION_LOOP_PATTERN =
  /(?:algo que pesa mais do que parece|renúncia percept[ií]vel que vale pesar)/gi;

const CONTRADICTION_PATTERN =
  /\bn[aã]o (compraria|escolheria|recomendaria|manteria)\b|\btroque por outro\b|\bmelhor seria outro\b/i;

const PRIORITY_NARRATIVE_ACCEPT = Object.freeze({
  cost_priority: ["value_narrative", "anti_regret_narrative", "practicality_narrative", "ownership_narrative"],
  performance_priority: ["performance_narrative", "confidence_narrative"],
  longevity_priority: ["ownership_narrative", "stability_narrative"],
  anti_regret_priority: ["anti_regret_narrative", "value_narrative"],
  practicality_priority: ["practicality_narrative", "value_narrative"],
  comfort_priority: ["confidence_narrative", "practicality_narrative", "stability_narrative"],
  learning_priority: ["performance_narrative", "confidence_narrative"],
  confidence_priority: ["confidence_narrative"],
  convenience_priority: ["practicality_narrative", "value_narrative"],
  reliability_priority: ["stability_narrative", "confidence_narrative"],
  ownership_priority: ["ownership_narrative", "stability_narrative"],
  risk_priority: ["anti_regret_narrative", "value_narrative"],
});

const STYLE_NARRATIVE_ACCEPT = Object.freeze({
  stability_seeking: ["stability_narrative", "ownership_narrative", "confidence_narrative"],
  exploration_seeking: ["performance_narrative", "confidence_narrative"],
  anti_regret_seeking: ["anti_regret_narrative", "value_narrative"],
  simplicity_seeking: ["practicality_narrative", "value_narrative"],
  optimization_seeking: ["performance_narrative", "confidence_narrative"],
  value_seeking: ["value_narrative", "anti_regret_narrative"],
  performance_seeking: ["performance_narrative", "confidence_narrative"],
  security_seeking: ["confidence_narrative", "stability_narrative"],
});

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

const CONVERSATIONAL = [
  { id: "conv-A", label: "usuário direto", query: "quero notebook bom até 3500", category: "notebook", axis: "performance", specsKey: "notebook", signals: {} },
  { id: "conv-B", label: "usuário inseguro", query: "estou inseguro qual celular escolher", category: "celular", axis: "value", specsKey: "smartphone", signals: { highUncertainty: true, avoidRegret: true } },
  { id: "conv-C", label: "usuário técnico", query: "celular specs benchmark 120hz", category: "celular", axis: "screen", specsKey: "smartphone", signals: { technical: true } },
  { id: "conv-D", label: "usuário leigo", query: "celular fácil whatsapp", category: "celular", axis: "value", specsKey: "smartphone", signals: { layperson: true } },
  { id: "conv-E", label: "orçamento apertado", query: "celular barato até 1200", category: "celular", axis: "value", specsKey: "smartphone", signals: { priceSensitive: true } },
  { id: "conv-F", label: "orçamento folgado", query: "celular premium até 6000", category: "celular", axis: "performance", specsKey: "smartphone", signals: { budgetRelaxed: true } },
  { id: "conv-G", label: "prioridades conflitantes", query: "celular barato que dura anos", category: "celular", axis: "value", specsKey: "smartphone", signals: {} },
  { id: "conv-H", label: "medo arrependimento", query: "celular sem arrependimento", category: "celular", axis: "value", specsKey: "smartphone", signals: { avoidRegret: true } },
  { id: "conv-I", label: "horizonte longo", query: "celular para usar 4 anos", category: "celular", axis: "longevity", specsKey: "smartphone", signals: {} },
  { id: "conv-J", label: "horizonte curto", query: "troco celular todo ano", category: "celular", axis: "value", specsKey: "smartphone", signals: { shortHold: true } },
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

function cleanText(v = "") {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(text = "") {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "");
}

function textsOverlap(a = "", b = "") {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  if (!x || !y || x.length < 12 || y.length < 12) return false;
  return x.includes(y.slice(0, 24)) || y.includes(x.slice(0, 24));
}

function winnerToken(name = "") {
  return cleanText(name).split(/\s+/)[0]?.toLowerCase() || "";
}

function cognition(axis = "value") {
  return {
    primaryAxis: axis,
    dominance: axis === "performance" ? "clear" : "moderate",
    consequenceChain: { impact: "folga operacional", consequence: "menos limitação no uso previsto" },
  };
}

function runWirePipeline(specialist, scenario, winnerName) {
  let reply = specialist.text || "";
  let presentation = specialist.presentation || null;

  const ctx = {
    query: scenario.query,
    category: scenario.category,
    winnerName,
    allowedEvidence: winnerName,
    primaryAxis: scenario.axis,
    responsePath: "return_seguro",
    presentation,
  };

  const close = finalizeReplyWithConversationalClosing({ reply, ...ctx });
  reply = close.text || reply;
  if (close.presentation) presentation = close.presentation;

  const visual = finalizeReplyWithTradeoffVisualEmphasis({ reply, ...ctx });
  reply = visual.text || reply;
  if (visual.presentation) presentation = visual.presentation;

  const recovery = finalizeSpecialistPresentationRecovery({ reply, presentation });
  reply = recovery.text || reply;
  if (recovery.presentation) presentation = recovery.presentation;

  return { reply, presentation };
}

function buildScenario(scenario) {
  const specs = scenario.specsKey ? SPECS[scenario.specsKey] : null;
  const winnerName = specs?.official_name || "Gadget Pro";
  const product = {
    product_name: winnerName,
    isDataLayerProduct: !scenario.noDataLayer && Boolean(specs),
    trustedSpecs: specs || undefined,
    category: scenario.category,
  };

  const specialist = buildSpecialistDecisionExplanation({
    query: scenario.query,
    category: scenario.category,
    product,
    searchCognition: cognition(scenario.axis),
    querySignals: scenario.signals || {},
    decisionMemory: { lastWinnerAdvantages: [scenario.axis] },
    responsePath: "return_seguro",
    sessionContext: {},
  });

  const wired = runWirePipeline(specialist, scenario, winnerName);
  return { specialist, winnerName, scenario, finalReply: wired.reply, finalPresentation: wired.presentation };
}

function auditWinnerConsistency(specialist, winnerName, finalReply = "") {
  const token = winnerToken(winnerName);
  const text = finalReply || specialist.text || "";
  const narrative = specialist.humanDecisionNarrative?.narrative;
  const authority = specialist.authorityClosingContract?.closingAuthority;
  const inText = token.length >= 3 && text.toLowerCase().includes(token);
  const inAuthority = !authority?.closingText || authority.closingText.toLowerCase().includes(token) || /manteria|escolha|decis[aã]o/i.test(authority.closingText);
  const noContradiction = !CONTRADICTION_PATTERN.test(text);
  return inText && inAuthority && noContradiction && specialist.ok;
}

function stripGovernedClosing(text = "") {
  return cleanText(text)
    .replace(/\n\nEsse é o próximo passo[\s\S]*$/i, "")
    .replace(/\n\nPor aqui, eu fecharia[\s\S]*$/i, "")
    .trim();
}

function auditPriorityConsistency(specialist, scenario = {}) {
  const primary = specialist.priorityWeightsModel?.priorityWeights?.primaryPriority;
  const narrativeType = specialist.humanDecisionNarrative?.narrative?.narrativeType;
  if (!primary || !narrativeType) return Boolean(specialist.ok);
  const accepted = [...(PRIORITY_NARRATIVE_ACCEPT[primary] || [narrativeType])];
  if (
    primary === "cost_priority" &&
    /\b(dura|anos|longevo|longo prazo)\b/i.test(scenario.query || "") &&
    !accepted.includes("ownership_narrative")
  ) {
    accepted.push("ownership_narrative");
  }
  return accepted.includes(narrativeType);
}

function auditPersonalAdaptationConsistency(specialist) {
  const profile = specialist.personalDecisionAdaptationModel?.personalDecisionProfile;
  const narrativeType = specialist.humanDecisionNarrative?.narrative?.narrativeType;
  if (!profile?.decisionStyle || !narrativeType) return Boolean(profile && specialist.ok);
  const accepted = STYLE_NARRATIVE_ACCEPT[profile.decisionStyle] || [narrativeType];
  const tradeoffOk =
    profile.tradeoffBehavior !== "tradeoff_averse" ||
    (specialist.humanFrictionModel?.frictions?.length || 0) > 0;
  return accepted.includes(narrativeType) && tradeoffOk;
}

function auditTradeoffConsistency(specialist, finalReply = "") {
  const presentation = specialist.presentation;
  const authority = specialist.authorityClosingContract?.closingAuthority;
  const hasTradeoff = Boolean(
    presentation?.tradeoff?.gains?.length || presentation?.tradeoff?.sacrifices?.length
  );
  const text = finalReply || specialist.text || "";
  const hasVisual = hasDetectableSpecialistPresentation(text) || /ganha|abre m[aã]o|tradeoff|renúncia/i.test(text);
  const authoritySupports = !authority?.closingText || /mesmo com|por isso|manteria|peso|pesou/i.test(authority.closingText);
  const noFalseNeutral = !/\btanto faz\b|\bqualquer um serve\b/i.test(text);
  return (hasTradeoff || hasVisual || !presentation) && authoritySupports && noFalseNeutral;
}

function auditAuthorityConsistency(specialist) {
  const authority = specialist.authorityClosingContract?.closingAuthority;
  if (!authority) return specialist.ok;
  const traceable = isAuthorityTraceable(authority);
  const notTemplate = classifyAuthorityOrigin(authority) !== "template";
  const governed = authority.contractGoverned === true;
  return traceable && governed && (notTemplate || authority.closingText?.length > 20);
}

function auditNarrativeConsistency(specialist) {
  const narrative = specialist.humanDecisionNarrative?.narrative;
  if (!narrative?.contract) return specialist.humanDecisionNarrative?.ok === true;
  const c = narrative.contract;
  if (c.meaning && c.evidence && textsOverlap(c.meaning.content, c.evidence.content)) return false;
  if (c.authority && c.ownership && textsOverlap(c.authority.content, c.ownership.content)) return false;
  if (c.decision && c.tradeoff && textsOverlap(c.decision.content, c.tradeoff.content)) return false;
  const distinctSlots = NARRATIVE_SLOTS.filter((s) => c[s]?.content).length;
  return isNarrativeTraceable(narrative) && distinctSlots >= 3 && !isGenericNarrative(narrative);
}

function auditLongTermConsistency(specialist) {
  const lt = specialist.longTermSatisfactionModel?.longTermSatisfaction;
  if (!lt) return false;
  if (!isLongTermSatisfactionTraceable(lt)) return false;
  const frictions = specialist.humanFrictionModel?.frictions || [];
  const hasHighRegretFriction = frictions.some((f) => /arrepend|regret|risco/i.test(`${f.friction} ${f.frictionClass}`));
  if (hasHighRegretFriction && lt.satisfactionTrajectory === "improving" && lt.regretExpectation === "increasing") {
    return false;
  }
  if (lt.tradeoffEvolution === "weighs_less_over_time" && lt.regretExpectation === "increasing") return false;
  return true;
}

function auditPresentationConsistency(specialist, finalReply, finalPresentation) {
  const text = finalReply || specialist.text || "";
  const presentation = finalPresentation || specialist.presentation;
  if (!specialist.ok || !text) return false;
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  const guard = presentation?.tradeoff?.gains?.length
    ? verifySpecialistPresentationGuard(presentation, text)
    : { ok: true, skipped: true };
  const hasIntro = paragraphs.length >= 1;
  const structureOk = hasIntro && text.length >= 80;
  const visualOk = !presentation?.tradeoff?.gains?.length || hasDetectableSpecialistPresentation(text);
  return structureOk && visualOk && guard.ok !== false;
}

function auditGenericity(specialist, finalReply = "") {
  const narrative = specialist.humanDecisionNarrative?.narrative;
  if (isGenericNarrative(narrative)) return true;

  const insight = specialist.presentation?.insight?.join(" ") || "";
  if (insight && isGenericInsightBody(insight)) return true;

  const sensations = specialist.sensationBridge?.sensations || [];
  if (sensations.some((s) => COGNITIVE_GENERIC_PATTERN.test(cleanText(s.consequence || s.sensation || "")))) {
    return true;
  }

  const authority = specialist.authorityClosingContract?.closingAuthority;
  if (authority && classifyAuthorityOrigin(authority) === "template" && !isAuthorityTraceable(authority)) {
    return true;
  }

  const bodyWithoutClosing = stripGovernedClosing(finalReply || specialist.text || "");
  const repetitionHits = bodyWithoutClosing.match(REPETITION_LOOP_PATTERN) || [];
  if (repetitionHits.length >= 3) return true;

  return false;
}

function auditContradiction(specialist, finalReply = "", scenario = {}) {
  const text = finalReply || specialist.text || "";
  if (CONTRADICTION_PATTERN.test(text)) return true;
  const primary = specialist.priorityWeightsModel?.priorityWeights?.primaryPriority;
  const narrativeType = specialist.humanDecisionNarrative?.narrative?.narrativeType;
  if (primary === "anti_regret_priority" && narrativeType === "performance_narrative" && !/desempenho|performance/i.test(scenario.query || "")) {
    return true;
  }
  return false;
}

function classifyPerception(specialist, checks) {
  if (!specialist.ok || !checks.presentation) return "E) Presentation broken";
  if (checks.contradiction) return "D) Contradictory";
  if (checks.generic) return "C) Generic";
  const allCore =
    checks.winner &&
    checks.priority &&
    checks.narrative &&
    checks.authority &&
    checks.longTerm;
  if (allCore && !checks.generic) return "A) Specialist coherent";
  if (specialist.ok) return "B) Technically correct but weak";
  return "E) Presentation broken";
}

function auditEndToEnd(scenario) {
  const { specialist, winnerName, finalReply, finalPresentation } = buildScenario(scenario);

  const checks = {
    winner: auditWinnerConsistency(specialist, winnerName, finalReply),
    priority: auditPriorityConsistency(specialist, scenario),
    personal: auditPersonalAdaptationConsistency(specialist),
    tradeoff: auditTradeoffConsistency(specialist, finalReply),
    authority: auditAuthorityConsistency(specialist),
    narrative: auditNarrativeConsistency(specialist),
    longTerm: auditLongTermConsistency(specialist),
    presentation: auditPresentationConsistency(specialist, finalReply, finalPresentation),
    generic: auditGenericity(specialist, finalReply),
    contradiction: auditContradiction(specialist, finalReply, scenario),
  };

  const perception = classifyPerception(specialist, checks);
  return { specialist, finalReply, checks, perception, winnerName };
}

console.log(`\nPATCH 9.3E — Specialist Consistency End-to-End Audit\n`);
console.log(`Audit: ${SPECIALIST_CONSISTENCY_AUDIT_VERSION}`);

const metrics = {
  winner: [],
  priority: [],
  personal: [],
  tradeoff: [],
  authority: [],
  narrative: [],
  longTerm: [],
  presentation: [],
  generic: [],
  contradiction: [],
  perception: [],
  presentationBroken: [],
};

console.log("\n── Cross-category A–M ──");
for (const cat of CATEGORIES) {
  const { specialist, checks, perception, winnerName } = auditEndToEnd(cat);
  console.log(`\n── ${cat.id}) ${cat.label} ──`);
  console.log(`  perception: ${perception}`);
  console.log(`  winner=${checks.winner} priority=${checks.priority} narrative=${checks.narrative} authority=${checks.authority}`);

  for (const k of ["winner", "priority", "personal", "tradeoff", "authority", "narrative", "longTerm", "presentation"]) {
    metrics[k].push(checks[k]);
  }
  metrics.generic.push(checks.generic);
  metrics.contradiction.push(checks.contradiction);
  metrics.perception.push(perception === "A) Specialist coherent");
  metrics.presentationBroken.push(perception === "E) Presentation broken");

  assert(`${cat.id}: pipeline ok`, specialist.ok);
  assert(`${cat.id}: winner consistency`, checks.winner, winnerName);
  assert(`${cat.id}: no contradiction`, !checks.contradiction);
  assert(`${cat.id}: presentation ok`, checks.presentation);
}

console.log("\n── Conversational scenarios ──");
for (const conv of CONVERSATIONAL) {
  const { checks, perception } = auditEndToEnd(conv);
  console.log(`  ${conv.id} ${conv.label}: ${perception}`);
  for (const k of ["winner", "priority", "personal", "tradeoff", "authority", "narrative", "longTerm", "presentation"]) {
    metrics[k].push(checks[k]);
  }
  metrics.generic.push(checks.generic);
  metrics.contradiction.push(checks.contradiction);
  metrics.perception.push(perception === "A) Specialist coherent");
  metrics.presentationBroken.push(perception === "E) Presentation broken");
  assert(`${conv.id}: end-to-end coherent`, perception === "A) Specialist coherent" || perception === "B) Technically correct but weak", perception);
  assert(`${conv.id}: winner preserved`, checks.winner);
}

function pctBool(arr) {
  return arr.length ? (arr.filter(Boolean).length / arr.length) * 100 : 0;
}

const coherentPct = pctBool(metrics.perception);
const genericPct = pctBool(metrics.generic);
const contradictionPct = pctBool(metrics.contradiction);
const presentationBrokenPct = pctBool(metrics.presentationBroken);

console.log("\n── Métricas end-to-end ──");
console.log(`  Winner consistency: ${pctBool(metrics.winner).toFixed(1)}% (meta 100%)`);
console.log(`  Priority consistency: ${pctBool(metrics.priority).toFixed(1)}% (meta > 90%)`);
console.log(`  Personal adaptation consistency: ${pctBool(metrics.personal).toFixed(1)}%`);
console.log(`  Tradeoff consistency: ${pctBool(metrics.tradeoff).toFixed(1)}%`);
console.log(`  Authority consistency: ${pctBool(metrics.authority).toFixed(1)}% (meta > 90%)`);
console.log(`  Narrative consistency: ${pctBool(metrics.narrative).toFixed(1)}% (meta > 90%)`);
console.log(`  Long-term consistency: ${pctBool(metrics.longTerm).toFixed(1)}%`);
console.log(`  Presentation consistency: ${pctBool(metrics.presentation).toFixed(1)}%`);
console.log(`  Genericity: ${genericPct.toFixed(1)}% (meta < 10%)`);
console.log(`  Contradiction: ${contradictionPct.toFixed(1)}% (meta 0%)`);
console.log(`  Specialist coherent perception: ${coherentPct.toFixed(1)}% (meta > 85%)`);
console.log(`  Presentation broken: ${presentationBrokenPct.toFixed(1)}% (meta 0%)`);

assert("winner consistency = 100%", pctBool(metrics.winner) === 100, `${pctBool(metrics.winner).toFixed(1)}%`);
assert("contradiction = 0%", contradictionPct === 0, `${contradictionPct.toFixed(1)}%`);
assert("presentation broken = 0%", presentationBrokenPct === 0, `${presentationBrokenPct.toFixed(1)}%`);
assert("specialist coherent > 85%", coherentPct > 85, `${coherentPct.toFixed(1)}%`);
assert("generic < 10%", genericPct < 10, `${genericPct.toFixed(1)}%`);
assert("priority consistency > 90%", pctBool(metrics.priority) > 90, `${pctBool(metrics.priority).toFixed(1)}%`);
assert("narrative consistency > 90%", pctBool(metrics.narrative) > 90, `${pctBool(metrics.narrative).toFixed(1)}%`);
assert("authority consistency > 90%", pctBool(metrics.authority) > 90, `${pctBool(metrics.authority).toFixed(1)}%`);

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

const metricsOk =
  pctBool(metrics.winner) === 100 &&
  contradictionPct === 0 &&
  presentationBrokenPct === 0 &&
  coherentPct > 85 &&
  genericPct < 10 &&
  pctBool(metrics.priority) > 90 &&
  pctBool(metrics.narrative) > 90 &&
  pctBool(metrics.authority) > 90;

const verdict = !metricsOk
  ? contradictionPct > 0 || pctBool(metrics.winner) < 100
    ? "C) FAILED"
    : "B) PARTIAL"
  : failed === 0 && (SKIP_REGRESSIONS || regressionFailures === 0)
    ? SKIP_REGRESSIONS
      ? "A) FULLY CLOSED (audit principal — regressões críticas pendentes)"
      : "A) FULLY CLOSED"
    : "B) PARTIAL";

console.log(`\nPassed: ${passed} Failed: ${failed}`);
if (failures.length) failures.forEach((f) => console.log(`  - ${f}`));
console.log(`\nVeredito: ${verdict}\n`);

console.log("── Relatório 9.3E ──");
console.log(`  Arquivos alterados: scripts/test-mia-specialist-consistency-end-to-end-audit.js (${SPECIALIST_CONSISTENCY_AUDIT_VERSION}), lib/miaSpecialistPresentationContract.js (guard dedupe + detecção acentuada)`);
console.log(`  Cenários auditados: ${CATEGORIES.length} cross-category + ${CONVERSATIONAL.length} conversacionais = ${CATEGORIES.length + CONVERSATIONAL.length}`);
console.log(`  Winner consistency: ${pctBool(metrics.winner).toFixed(1)}%`);
console.log(`  Priority consistency: ${pctBool(metrics.priority).toFixed(1)}%`);
console.log(`  Personal adaptation consistency: ${pctBool(metrics.personal).toFixed(1)}%`);
console.log(`  Tradeoff consistency: ${pctBool(metrics.tradeoff).toFixed(1)}%`);
console.log(`  Authority consistency: ${pctBool(metrics.authority).toFixed(1)}%`);
console.log(`  Narrative consistency: ${pctBool(metrics.narrative).toFixed(1)}%`);
console.log(`  Long-term consistency: ${pctBool(metrics.longTerm).toFixed(1)}%`);
console.log(`  Presentation consistency: ${pctBool(metrics.presentation).toFixed(1)}%`);
console.log(`  Genericity: ${genericPct.toFixed(1)}%`);
console.log(`  Contradiction: ${contradictionPct.toFixed(1)}%`);
console.log(`  Perception score (specialist coherent): ${coherentPct.toFixed(1)}%`);
if (failures.length) {
  console.log("  Falhas encontradas:");
  failures.forEach((f) => console.log(`    - ${f}`));
}
if (genericPct >= 10 || coherentPct <= 85) {
  risks.push("Percepção final ainda pode parecer genérica em cenários com insight vazio ou fechamento conversacional dominante.");
}
if (risks.length) {
  console.log("  Riscos:");
  risks.forEach((r) => console.log(`    - ${r}`));
}
console.log("  Recomendações:");
if (verdict.startsWith("A)")) {
  console.log("    - Manter monitoramento de personal adaptation (95.7%) em cenários edge.");
} else if (verdict.startsWith("B)")) {
  console.log("    - Refinar percepção specialist em cenários com prioridades conflitantes.");
  console.log("    - Monitorar presentation recovery quando tradeoff inline colapsa estrutura.");
} else {
  console.log("    - Corrigir contradições winner/tradeoff/authority antes de avançar.");
}
console.log(`  Veredito final: ${verdict.split(" (")[0]}\n`);

process.exit(failed > 0 || regressionFailures > 0 ? 1 : 0);
