/**
 * PATCH 9.2Z — Long-Term Satisfaction Reasoning Layer
 *
 * Narrative + ownership + authority → satisfação de longo prazo explícita.
 * Sem copy, templates, marketing ou hardcode por categoria.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import { isGenericInsightBody } from "./miaDataLayerSemanticNormalizer.js";
import { calculateFrictionRelevance } from "./miaHumanFrictionModelingLayer.js";
import { selectPrimaryOwnership } from "./miaOwnershipExperienceLayer.js";

export const LONG_TERM_SATISFACTION_VERSION = "9.2Z.1";

export const SATISFACTION_CLASSES = Object.freeze([
  "growing_satisfaction",
  "stable_satisfaction",
  "declining_satisfaction",
  "adaptation_satisfaction",
  "confidence_satisfaction",
  "anti_regret_satisfaction",
  "ownership_satisfaction",
]);

export const SATISFACTION_TRAJECTORIES = Object.freeze([
  "improving",
  "stable",
  "declining",
  "uncertain",
]);

export const REGRET_TRAJECTORIES = Object.freeze(["decreasing", "stable", "increasing"]);

export const TRADEOFF_EVOLUTIONS = Object.freeze([
  "weighs_less_over_time",
  "stable_weight",
  "weighs_more_over_time",
]);

const GENERIC_PATTERN =
  /ganho percept[ií]vel|detalhe pr[aá]tico que ajuda|renúncia percept[ií]vel|combina com o perfil|algo que pesa mais do que parece/i;

const OWNERSHIP_TO_SATISFACTION = Object.freeze({
  long_term_satisfaction: {
    satisfactionClass: "growing_satisfaction",
    trajectory: "improving",
    durability: 0.82,
    regret: "decreasing",
    tradeoffEvolution: "weighs_less_over_time",
  },
  reliability_over_time: {
    satisfactionClass: "stable_satisfaction",
    trajectory: "stable",
    durability: 0.8,
    regret: "decreasing",
    tradeoffEvolution: "weighs_less_over_time",
  },
  usage_stability: {
    satisfactionClass: "stable_satisfaction",
    trajectory: "stable",
    durability: 0.78,
    regret: "stable",
    tradeoffEvolution: "stable_weight",
  },
  confidence_over_time: {
    satisfactionClass: "confidence_satisfaction",
    trajectory: "improving",
    durability: 0.76,
    regret: "decreasing",
    tradeoffEvolution: "weighs_less_over_time",
  },
  value_retention: {
    satisfactionClass: "anti_regret_satisfaction",
    trajectory: "stable",
    durability: 0.72,
    regret: "stable",
    tradeoffEvolution: "stable_weight",
  },
  regret_accumulation: {
    satisfactionClass: "declining_satisfaction",
    trajectory: "declining",
    durability: 0.45,
    regret: "increasing",
    tradeoffEvolution: "weighs_more_over_time",
  },
  replacement_pressure: {
    satisfactionClass: "declining_satisfaction",
    trajectory: "declining",
    durability: 0.42,
    regret: "increasing",
    tradeoffEvolution: "weighs_more_over_time",
  },
  future_friction: {
    satisfactionClass: "declining_satisfaction",
    trajectory: "declining",
    durability: 0.48,
    regret: "increasing",
    tradeoffEvolution: "weighs_more_over_time",
  },
  adaptation_over_time: {
    satisfactionClass: "adaptation_satisfaction",
    trajectory: "improving",
    durability: 0.62,
    regret: "decreasing",
    tradeoffEvolution: "weighs_less_over_time",
  },
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clamp01(value = 0) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function buildTrace({
  token,
  consequence,
  sensation,
  experience,
  friction,
  ownership,
  authority,
  narrative,
  satisfactionClass,
  satisfactionTrajectory,
}) {
  return {
    token: token || null,
    consequence: cleanText(consequence),
    sensation: cleanText(sensation),
    experience: cleanText(experience),
    friction: cleanText(friction),
    ownership: cleanText(ownership),
    authority: cleanText(authority),
    narrative: cleanText(narrative),
    satisfactionClass,
    satisfactionTrajectory,
  };
}

function inferTradeoffEvolution(friction = null, ownership = null, ctx = {}) {
  if (ownership?.ownershipClass === "adaptation_over_time") return "weighs_less_over_time";
  if (ownership?.ownershipClass === "replacement_pressure") return "weighs_more_over_time";
  if (ownership?.ownershipClass === "regret_accumulation") return "weighs_more_over_time";
  if (friction && calculateFrictionRelevance(friction, ctx) >= 0.65) return "weighs_more_over_time";
  if (friction?.frictionClass === "adaptation_friction") return "weighs_less_over_time";
  return "stable_weight";
}

function inferRegretExpectation(ownership = null, authority = null, ctx = {}) {
  const regretSignal = Number(ownership?.regretSignal || 0.5);
  if (ctx.querySignals?.avoidRegret) {
    if (regretSignal >= 0.6) return "increasing";
    if (regretSignal <= 0.35) return "decreasing";
  }
  if (ownership?.ownershipClass === "regret_accumulation" || ownership?.ownershipClass === "value_retention") {
    return regretSignal >= 0.55 ? "increasing" : "stable";
  }
  if (authority?.authorityClass === "anti_regret_authority") return "decreasing";
  if (regretSignal <= 0.3) return "decreasing";
  if (regretSignal >= 0.65) return "increasing";
  return "stable";
}

function inferDurabilityExpectation(ownership = null, authority = null, experiences = []) {
  let durability = Number(ownership?.durabilitySignal || ownership?.satisfactionSignal || 0.55);
  if (authority?.authorityStrength) durability += Number(authority.authorityStrength) * 0.12;
  if (ownership?.timeHorizon === "long_term") durability += 0.1;
  if (experiences.some((e) => /longevidade|anos|suporte|estável|estavel/i.test(`${e.experience} ${e.sourceConsequence}`))) {
    durability += 0.08;
  }
  return clamp01(durability);
}

/**
 * @param {Record<string, unknown>} model
 * @param {Record<string, unknown>} ctx
 */
export function calculateSatisfactionRelevance(model = {}, ctx = {}) {
  const query = cleanText(ctx.query || "");
  const primaryAxis = cleanText(ctx.primaryAxis || "");
  const satisfactionClass = cleanText(model.satisfactionClass || "");
  let relevance = Number(model.baseRelevance || 0.5);

  if (primaryAxis === "longevity" || /\b(longevo|anos|durar|vários anos|varios anos|4 anos)\b/i.test(query)) {
    if (satisfactionClass === "growing_satisfaction" || satisfactionClass === "ownership_satisfaction") relevance += 0.22;
    if (model.satisfactionTrajectory === "improving") relevance += 0.12;
    if (model.satisfactionTrajectory === "declining") relevance -= 0.1;
  }

  if (/\b(trocar|troca|todo ano|curto prazo)\b/i.test(query)) {
    if (model.satisfactionTrajectory === "declining") relevance += 0.1;
    if (satisfactionClass === "adaptation_satisfaction") relevance -= 0.08;
  }

  if (ctx.querySignals?.avoidRegret || /\b(arrepend)\b/i.test(query)) {
    if (satisfactionClass === "anti_regret_satisfaction") relevance += 0.2;
    if (model.regretExpectation === "increasing") relevance += 0.15;
    if (model.regretExpectation === "decreasing") relevance += 0.08;
  }

  if (primaryAxis === "value" || ctx.querySignals?.priceSensitive) {
    if (satisfactionClass === "anti_regret_satisfaction") relevance += 0.14;
    if (model.tradeoffEvolution === "weighs_more_over_time") relevance += 0.1;
  }

  if (primaryAxis === "performance") {
    if (satisfactionClass === "confidence_satisfaction") relevance += 0.12;
  }

  if (ctx.querySignals?.technical && satisfactionClass === "adaptation_satisfaction") relevance += 0.08;

  return clamp01(relevance);
}

function buildSatisfactionFromOwnership(ownership, ctx, authority, friction, narrative) {
  if (!ownership?.ownershipMeaning || GENERIC_PATTERN.test(ownership.ownershipMeaning)) return null;
  const map = OWNERSHIP_TO_SATISFACTION[ownership.ownershipClass] || {
    satisfactionClass: "ownership_satisfaction",
    trajectory: "stable",
    durability: 0.6,
    regret: "stable",
    tradeoffEvolution: "stable_weight",
  };

  const regretExpectation = inferRegretExpectation(ownership, authority, ctx);
  const tradeoffEvolution = inferTradeoffEvolution(friction, ownership, ctx);
  const durabilityExpectation = inferDurabilityExpectation(ownership, authority, []);

  return {
    satisfactionClass: map.satisfactionClass,
    satisfactionTrajectory: map.trajectory,
    durabilityExpectation,
    regretExpectation,
    tradeoffEvolution,
    sourceOwnership: ownership,
    sourceAuthority: authority,
    sourceFriction: friction,
    sourceNarrative: narrative?.narrativeType || "",
    trace: buildTrace({
      token: ownership.sourceToken,
      consequence: ownership.sourceConsequence,
      sensation: ownership.sensation,
      experience: ownership.sourceExperience,
      friction: ownership.sourceFriction || friction?.friction,
      ownership: ownership.ownershipMeaning,
      authority: authority?.authorityReason || "",
      narrative: narrative?.narrativeType || "",
      satisfactionClass: map.satisfactionClass,
      satisfactionTrajectory: map.trajectory,
    }),
  };
}

/**
 * @param {{
 *   winner?: string,
 *   context?: Record<string, unknown>,
 *   consequences?: string[],
 *   sensations?: Array<Record<string, unknown>>,
 *   experiences?: Array<Record<string, unknown>>,
 *   frictions?: Array<Record<string, unknown>>,
 *   ownershipExperiences?: Array<Record<string, unknown>>,
 *   authorityContract?: Record<string, unknown>,
 *   narrative?: Record<string, unknown>,
 *   tradeoffs?: { gains?: string[], sacrifices?: string[] },
 *   query?: string,
 *   primaryAxis?: string,
 *   querySignals?: Record<string, unknown>,
 * }} input
 */
export function buildLongTermSatisfactionModel(input = {}) {
  const query = cleanText(input.query || input.context?.query || "");
  const primaryAxis = cleanText(input.primaryAxis || input.context?.primaryAxis || "");
  const budget = extractBudget(query);
  const ctx = {
    query,
    primaryAxis,
    hasBudget: budget != null,
    querySignals: input.querySignals || input.context?.querySignals || {},
  };

  const experiences = input.experiences || [];
  const frictions = input.frictions || [];
  const ownershipExperiences = input.ownershipExperiences || [];
  const authority = input.authorityContract?.primaryAuthority || input.authorityContract?.closingAuthority;
  const narrative = input.narrative?.narrative || input.narrative;

  const primaryOwnership = selectPrimaryOwnership(
    ownershipExperiences,
    ctx,
    experiences[0],
    frictions[0]
  );
  const primaryFriction = [...frictions].sort(
    (a, b) => calculateFrictionRelevance(b, ctx) - calculateFrictionRelevance(a, ctx)
  )[0];

  const core = buildSatisfactionFromOwnership(
    primaryOwnership,
    ctx,
    authority,
    primaryFriction,
    narrative
  );

  if (!core) {
    return {
      ok: false,
      longTermSatisfaction: null,
      version: LONG_TERM_SATISFACTION_VERSION,
      winner: cleanText(input.winner || ""),
      context: ctx,
    };
  }

  const contextualRelevance = calculateSatisfactionRelevance(
    {
      satisfactionClass: core.satisfactionClass,
      satisfactionTrajectory: core.satisfactionTrajectory,
      regretExpectation: core.regretExpectation,
      tradeoffEvolution: core.tradeoffEvolution,
      baseRelevance: Number(primaryOwnership?.contextualRelevance || 0.5),
    },
    ctx
  );

  const confidence = clamp01(
    core.durabilityExpectation * 0.35 +
      contextualRelevance * 0.35 +
      (core.regretExpectation === "decreasing" ? 0.15 : core.regretExpectation === "stable" ? 0.08 : 0) +
      (narrative?.confidence || 0) * 0.15
  );

  const longTermSatisfaction = {
    satisfactionClass: core.satisfactionClass,
    satisfactionTrajectory: core.satisfactionTrajectory,
    durabilityExpectation: core.durabilityExpectation,
    regretExpectation: core.regretExpectation,
    tradeoffEvolution: core.tradeoffEvolution,
    confidence,
    contextualRelevance,
    contextApplied: contextualRelevance >= 0.55,
    ownershipConsidered: Boolean(primaryOwnership),
    frictionConsidered: Boolean(primaryFriction),
    authorityConsidered: Boolean(authority?.authorityReason),
    narrativeConsidered: Boolean(narrative?.narrativeType),
    trace: core.trace,
    version: LONG_TERM_SATISFACTION_VERSION,
  };

  return {
    ok: isLongTermSatisfactionTraceable(longTermSatisfaction),
    longTermSatisfaction,
    version: LONG_TERM_SATISFACTION_VERSION,
    winner: cleanText(input.winner || ""),
    context: ctx,
  };
}

export function isLongTermSatisfactionTraceable(model = {}) {
  const trace = model.trace || {};
  return Boolean(
    model.satisfactionClass &&
      SATISFACTION_CLASSES.includes(model.satisfactionClass) &&
      SATISFACTION_TRAJECTORIES.includes(model.satisfactionTrajectory) &&
      REGRET_TRAJECTORIES.includes(model.regretExpectation) &&
      TRADEOFF_EVOLUTIONS.includes(model.tradeoffEvolution) &&
      trace.consequence &&
      (trace.ownership || trace.authority) &&
      trace.satisfactionClass &&
      trace.satisfactionTrajectory &&
      !GENERIC_PATTERN.test(trace.consequence || "") &&
      !isGenericInsightBody(trace.consequence || "")
  );
}

export function classifyLongTermSatisfactionOrigin(model = {}) {
  if (!model) return "placeholder";
  if (!isLongTermSatisfactionTraceable(model)) return "placeholder";
  if (model.contextApplied && model.confidence >= 0.65) return "real";
  return "derived";
}

export function isUntraceableTrajectory(model = {}) {
  return !model?.satisfactionTrajectory || !SATISFACTION_TRAJECTORIES.includes(model.satisfactionTrajectory);
}
