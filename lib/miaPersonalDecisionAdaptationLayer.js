/**
 * PATCH 9.3C — Personal Decision Adaptation Layer
 *
 * Adapta cognição ao perfil decisório momentâneo — sem memória permanente,
 * sem perfil fixo, sem copy ou decisão via LLM.
 */

import { extractBudget } from "./miaRoutingSafety.js";

export const PERSONAL_DECISION_ADAPTATION_VERSION = "9.3C.1";

export const DECISION_STYLES = Object.freeze([
  "security_seeking",
  "optimization_seeking",
  "simplicity_seeking",
  "exploration_seeking",
  "anti_regret_seeking",
  "value_seeking",
  "performance_seeking",
  "stability_seeking",
]);

export const RISK_TOLERANCES = Object.freeze(["low_risk", "moderate_risk", "high_risk"]);

export const UNCERTAINTY_TOLERANCES = Object.freeze([
  "low_uncertainty_tolerance",
  "moderate_uncertainty_tolerance",
  "high_uncertainty_tolerance",
]);

export const VALUE_INTERPRETATIONS = Object.freeze([
  "price_minimization",
  "balanced_equilibrium",
  "longevity_maximization",
  "performance_maximization",
  "regret_minimization",
  "simplicity_maximization",
]);

export const TRADEOFF_BEHAVIORS = Object.freeze([
  "tradeoff_averse",
  "tradeoff_balanced",
  "tradeoff_accepting",
]);

const PRIORITY_TO_STYLE_HINT = Object.freeze({
  cost_priority: "value_seeking",
  performance_priority: "performance_seeking",
  longevity_priority: "stability_seeking",
  anti_regret_priority: "anti_regret_seeking",
  practicality_priority: "simplicity_seeking",
  learning_priority: "optimization_seeking",
  comfort_priority: "security_seeking",
  confidence_priority: "security_seeking",
  convenience_priority: "simplicity_seeking",
  reliability_priority: "stability_seeking",
  ownership_priority: "stability_seeking",
  risk_priority: "anti_regret_seeking",
});

const STYLE_SIGNAL_RULES = Object.freeze([
  {
    style: "stability_seeking",
    patterns: [/\b(est[aá]vel|estabilidade|conservador|previs[ií]vel|confi[aá]vel|seguro|sem surpresa)\b/i],
    signalKeys: ["conservative", "stabilityFocused"],
  },
  {
    style: "exploration_seeking",
    patterns: [/\b(novo|novidade|lan[cç]amento|experimentar|testar|último modelo|ultimo modelo|inovador)\b/i],
    signalKeys: ["exploratory", "noveltySeeking"],
  },
  {
    style: "anti_regret_seeking",
    patterns: [/\b(arrepend|não quero errar|nao quero errar|sem arrependimento|decis[aã]o segura)\b/i],
    signalKeys: ["avoidRegret"],
  },
  {
    style: "simplicity_seeking",
    patterns: [/\b(simples|f[aá]cil|facil|pr[aá]tico|pratico|b[aá]sico|basico|direto ao ponto)\b/i],
    signalKeys: ["practicalityFocused", "layperson"],
  },
  {
    style: "optimization_seeking",
    patterns: [/\b(specs|especifica|t[eé]cnico|tecnico|otimizar|melhor custo|benchmark|comparar detalhe)\b/i],
    signalKeys: ["technical", "optimizationFocused"],
  },
  {
    style: "security_seeking",
    patterns: [/\b(seguran[cç]a|prote[cç][aã]o|garantia|suporte|marca conhecida)\b/i],
    signalKeys: ["securityFocused"],
  },
  {
    style: "performance_seeking",
    patterns: [/\b(desempenho|performance|potente|gamer|fps|multitarefa)\b/i],
    signalKeys: ["performanceFocused"],
  },
  {
    style: "value_seeking",
    patterns: [/\b(barato|econom|custo.?benef|gastar pouco|melhor pre[cç]o)\b/i],
    signalKeys: ["priceSensitive"],
  },
]);

const VALUE_FROM_PRIORITY = Object.freeze({
  cost_priority: "price_minimization",
  performance_priority: "performance_maximization",
  longevity_priority: "longevity_maximization",
  anti_regret_priority: "regret_minimization",
  practicality_priority: "simplicity_maximization",
  learning_priority: "balanced_equilibrium",
  comfort_priority: "balanced_equilibrium",
  reliability_priority: "longevity_maximization",
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clamp01(value = 0) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function scoreFromRules(query = "", userSignals = {}, rules = STYLE_SIGNAL_RULES) {
  const scores = Object.fromEntries(DECISION_STYLES.map((s) => [s, 0]));
  const traces = [];

  for (const rule of rules) {
    let score = 0;
    if (rule.patterns?.some((p) => p.test(query))) {
      score += 0.28;
      traces.push({ style: rule.style, source: "query", weight: 0.28 });
    }
    for (const key of rule.signalKeys || []) {
      if (userSignals[key]) {
        score += 0.32;
        traces.push({ style: rule.style, source: "signal", matched: key, weight: 0.32 });
      }
    }
    if (score > 0) scores[rule.style] += score;
  }

  return { scores, traces };
}

/**
 * @param {{
 *   context?: Record<string, unknown>,
 *   userSignals?: Record<string, unknown>,
 *   priorityWeights?: Record<string, unknown>|null,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   constraints?: string[],
 *   reasoning?: Record<string, unknown>,
 *   query?: string,
 *   budget?: number|null,
 * }} input
 */
export function adaptDecisionProfile(input = {}) {
  const query = cleanText(input.query || input.context?.query || "");
  const userSignals = input.userSignals || input.context?.userSignals || {};
  const priorityWeights = input.priorityWeights || input.context?.priorityWeights || null;
  const pw = priorityWeights?.weights ? priorityWeights : priorityWeights;
  const weights = pw?.weights || pw || {};
  const primary = pw?.primaryPriority || null;
  const acceptedSacrifices = pw?.tradeoffAcceptance || [];
  const budget = input.budget ?? extractBudget(query);
  const traces = [];

  const { scores, traces: styleTraces } = scoreFromRules(query, userSignals);
  traces.push(...styleTraces);

  if (primary && PRIORITY_TO_STYLE_HINT[primary]) {
    const hint = PRIORITY_TO_STYLE_HINT[primary];
    scores[hint] += 0.18;
    traces.push({ style: hint, source: "priority_hint", matched: primary, weight: 0.18 });
  }

  if (userSignals.conservative || userSignals.stabilityFocused) {
    scores.stability_seeking += 0.35;
    scores.security_seeking += 0.2;
    traces.push({ style: "stability_seeking", source: "profile_signal", matched: "conservative", weight: 0.35 });
  }

  if (userSignals.exploratory || userSignals.noveltySeeking) {
    scores.exploration_seeking += 0.4;
    scores.performance_seeking += 0.12;
    traces.push({ style: "exploration_seeking", source: "profile_signal", matched: "exploratory", weight: 0.4 });
  }

  if (userSignals.layperson) {
    scores.simplicity_seeking += 0.3;
    traces.push({ style: "simplicity_seeking", source: "profile_signal", matched: "layperson", weight: 0.3 });
  }

  if (userSignals.technical) {
    scores.optimization_seeking += 0.32;
    traces.push({ style: "optimization_seeking", source: "profile_signal", matched: "technical", weight: 0.32 });
  }

  const rankedStyles = Object.entries(scores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const decisionStyle = rankedStyles[0]?.[0] || PRIORITY_TO_STYLE_HINT[primary] || "value_seeking";

  let riskScore = 0.5;
  if (userSignals.conservative || userSignals.avoidRegret || userSignals.riskAverse) riskScore -= 0.28;
  if (userSignals.exploratory || userSignals.performanceFocused) riskScore += 0.22;
  if (budget != null && budget <= 1500) riskScore -= 0.18;
  if (userSignals.priceSensitive && budget != null && budget <= 2000) riskScore -= 0.1;
  if (userSignals.budgetRelaxed || (budget != null && budget >= 4000)) riskScore += 0.1;
  if (primary === "anti_regret_priority") riskScore -= 0.15;

  const riskTolerance =
    riskScore < 0.35 ? "low_risk" : riskScore > 0.62 ? "high_risk" : "moderate_risk";
  traces.push({ dimension: "riskTolerance", source: "risk_score", matched: riskScore.toFixed(2), value: riskTolerance });

  let uncertaintyScore = 0.5;
  if (userSignals.conservative || userSignals.layperson || userSignals.avoidRegret) uncertaintyScore -= 0.25;
  if (userSignals.highUncertainty || /\b(duvida|dúvida|incerto|n[aã]o sei|inseguro)\b/i.test(query)) {
    uncertaintyScore -= 0.32;
  }
  if (userSignals.exploratory) uncertaintyScore += 0.28;
  if (userSignals.technical && !userSignals.conservative) uncertaintyScore += 0.1;

  const uncertaintyTolerance =
    uncertaintyScore < 0.35
      ? "low_uncertainty_tolerance"
      : uncertaintyScore > 0.62
        ? "high_uncertainty_tolerance"
        : "moderate_uncertainty_tolerance";
  traces.push({
    dimension: "uncertaintyTolerance",
    source: "uncertainty_score",
    matched: uncertaintyScore.toFixed(2),
    value: uncertaintyTolerance,
  });

  let valueInterpretation = VALUE_FROM_PRIORITY[primary] || "balanced_equilibrium";
  if (decisionStyle === "exploration_seeking") valueInterpretation = "performance_maximization";
  if (decisionStyle === "stability_seeking" || decisionStyle === "security_seeking") {
    valueInterpretation = primary === "cost_priority" ? "balanced_equilibrium" : "longevity_maximization";
  }
  if (decisionStyle === "anti_regret_seeking") valueInterpretation = "regret_minimization";
  if (decisionStyle === "simplicity_seeking") valueInterpretation = "simplicity_maximization";
  if (decisionStyle === "value_seeking" && primary === "cost_priority") valueInterpretation = "price_minimization";
  traces.push({ dimension: "valueInterpretation", source: "style_priority", matched: decisionStyle, value: valueInterpretation });

  const sacrificeCount = acceptedSacrifices.length;
  let tradeoffBehavior = "tradeoff_balanced";
  if (userSignals.avoidRegret || sacrificeCount <= 2) tradeoffBehavior = "tradeoff_averse";
  if (userSignals.exploratory || sacrificeCount >= 5) tradeoffBehavior = "tradeoff_accepting";
  if (userSignals.conservative && sacrificeCount <= 3) tradeoffBehavior = "tradeoff_averse";
  if (primary === "performance_priority" && userSignals.budgetRelaxed) tradeoffBehavior = "tradeoff_accepting";
  traces.push({
    dimension: "tradeoffBehavior",
    source: "sacrifice_count",
    matched: String(sacrificeCount),
    value: tradeoffBehavior,
  });

  const confidence = clamp01(
    0.4 +
      (rankedStyles.length ? 0.2 : 0) +
      (primary ? 0.15 : 0) +
      Math.min(traces.filter((t) => t.source === "signal" || t.source === "profile_signal").length, 3) * 0.08
  );

  return {
    decisionStyle,
    riskTolerance,
    uncertaintyTolerance,
    valueInterpretation,
    tradeoffBehavior,
    confidence,
    trace: {
      styleScores: scores,
      sources: traces,
      primaryPriority: primary,
      temporary: true,
      sessionScoped: true,
    },
  };
}

/**
 * @param {{
 *   context?: Record<string, unknown>,
 *   userSignals?: Record<string, unknown>,
 *   querySignals?: Record<string, unknown>,
 *   priorityWeights?: Record<string, unknown>|null,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   constraints?: string[],
 *   reasoning?: Record<string, unknown>,
 *   query?: string,
 *   budget?: number|null,
 * }} input
 */
export function buildPersonalDecisionAdaptationModel(input = {}) {
  const userSignals = input.userSignals || input.querySignals || {};
  const priorityWeights = input.priorityWeights || userSignals.priorityWeights || null;

  const personalDecisionProfile = adaptDecisionProfile({
    ...input,
    userSignals,
    priorityWeights,
  });

  return {
    ok: Boolean(
      personalDecisionProfile.decisionStyle &&
        personalDecisionProfile.confidence >= 0.45 &&
        personalDecisionProfile.trace?.temporary === true
    ),
    personalDecisionProfile,
    version: PERSONAL_DECISION_ADAPTATION_VERSION,
    context: {
      query: cleanText(input.query || ""),
      temporary: true,
    },
  };
}

export function isPersonalAdaptationTraceable(profile = {}) {
  const p = profile?.personalDecisionProfile || profile;
  return Boolean(
    p?.decisionStyle &&
      DECISION_STYLES.includes(p.decisionStyle) &&
      RISK_TOLERANCES.includes(p.riskTolerance) &&
      UNCERTAINTY_TOLERANCES.includes(p.uncertaintyTolerance) &&
      VALUE_INTERPRETATIONS.includes(p.valueInterpretation) &&
      TRADEOFF_BEHAVIORS.includes(p.tradeoffBehavior) &&
      Array.isArray(p.trace?.sources) &&
      p.trace.sources.length > 0 &&
      p.trace?.temporary === true &&
      p.trace?.sessionScoped === true
  );
}

export function classifyPersonalAdaptationOrigin(profile = {}) {
  const p = profile?.personalDecisionProfile || profile;
  if (!p?.decisionStyle) return "placeholder";
  if (isPersonalAdaptationTraceable(p)) {
    if (p.confidence >= 0.7) return "real";
    return "derived";
  }
  if (p.riskTolerance) return "pseudo";
  return "placeholder";
}

export function profilesAreDistinct(a = {}, b = {}) {
  const pa = a?.personalDecisionProfile || a;
  const pb = b?.personalDecisionProfile || b;
  const dims = [
    "decisionStyle",
    "riskTolerance",
    "uncertaintyTolerance",
    "valueInterpretation",
    "tradeoffBehavior",
  ];
  return dims.some((d) => pa[d] && pb[d] && pa[d] !== pb[d]);
}
