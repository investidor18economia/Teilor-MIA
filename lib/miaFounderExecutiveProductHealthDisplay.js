/**
 * PATCH B.4 — Executive Product Health display mapping (B.4.0).
 * Sources: GET /api/executive-metrics (current + optional offset previous period).
 * No SQL · No Supabase · No fetch.
 */

import {
  FOUNDER_EXECUTIVE_PRODUCT_HEALTH_INDICATORS,
  FOUNDER_EXECUTIVE_PRODUCT_HEALTH_CATALOG_VERSION,
  EXECUTIVE_PRODUCT_HEALTH_NARRATIVE_RULES,
  PRODUCT_HEALTH_ACCEPTANCE_EXCELLENT,
  PRODUCT_HEALTH_ACCEPTANCE_GOOD,
  PRODUCT_HEALTH_ACCEPTANCE_ATTENTION,
  PRODUCT_HEALTH_REJECTION_EXCELLENT,
  PRODUCT_HEALTH_REJECTION_ATTENTION,
  PRODUCT_HEALTH_QUALITY_EXCELLENT,
  PRODUCT_HEALTH_QUALITY_GOOD,
  PRODUCT_HEALTH_QUALITY_ATTENTION,
  PRODUCT_HEALTH_SCORE_EXCELLENT,
  PRODUCT_HEALTH_SCORE_GOOD,
  PRODUCT_HEALTH_SCORE_ATTENTION,
  PRODUCT_HEALTH_CONVERSATION_EXCELLENT,
  PRODUCT_HEALTH_CONVERSATION_GOOD,
  PRODUCT_HEALTH_CONVERSATION_ATTENTION,
  classifyProductHealthLevel,
  classifyProductHealthBadge,
} from "./miaFounderExecutiveProductHealthCatalog.js";
import { computePeriodChangePct } from "./miaFounderExecutiveGrowthDisplay.js";
import { formatFounderMetricValue } from "./miaFounderCockpitDisplay.js";
import { formatPublicMetricRate } from "./miaPublicMetricsDisplay.js";

export const FOUNDER_EXECUTIVE_PRODUCT_HEALTH_DISPLAY_VERSION = "B.4.0";

/**
 * @param {Record<string, unknown>|null|undefined} executive
 * @param {string[]} path
 */
function readExecutivePath(executive, path) {
  let cur = executive;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return null;
    cur = /** @type {Record<string, unknown>} */ (cur)[key];
  }
  return cur ?? null;
}

/**
 * @param {unknown} value
 * @param {number} max
 */
export function normalizeHealthSignal(value, max = 100) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  if (max <= 1) return Math.max(0, Math.min(1, n));
  return Math.max(0, Math.min(1, n / max));
}

/**
 * @param {number[]} values
 */
export function computeExecutiveHealthIndex(values) {
  const valid = values.filter((v) => v != null && Number.isFinite(v));
  if (!valid.length) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100);
}

/**
 * @param {{
 *   qualityLevel?: string,
 *   acceptanceLevel?: string,
 *   acceptancePeriodDown?: boolean,
 *   userConfidenceHigh?: boolean,
 *   valueSignalsPositive?: boolean,
 *   conversationLow?: boolean,
 *   rejectionHigh?: boolean,
 * }} signals
 */
export function resolveExecutiveProductHealthNarrative(signals) {
  if (signals.qualityLevel === "excellent" && ["excellent", "healthy", "stable"].includes(signals.acceptanceLevel ?? "")) {
    return EXECUTIVE_PRODUCT_HEALTH_NARRATIVE_RULES.find((r) => r.id === "excellent_quality")?.text;
  }
  if (signals.acceptancePeriodDown) {
    return EXECUTIVE_PRODUCT_HEALTH_NARRATIVE_RULES.find((r) => r.id === "acceptance_drop")?.text;
  }
  if (signals.rejectionHigh) {
    return EXECUTIVE_PRODUCT_HEALTH_NARRATIVE_RULES.find((r) => r.id === "rejection_attention")?.text;
  }
  if (signals.conversationLow) {
    return EXECUTIVE_PRODUCT_HEALTH_NARRATIVE_RULES.find((r) => r.id === "conversation_attention")?.text;
  }
  if (signals.userConfidenceHigh) {
    return EXECUTIVE_PRODUCT_HEALTH_NARRATIVE_RULES.find((r) => r.id === "confidence_high")?.text;
  }
  if (signals.valueSignalsPositive) {
    return EXECUTIVE_PRODUCT_HEALTH_NARRATIVE_RULES.find((r) => r.id === "users_finding_value")?.text;
  }
  return EXECUTIVE_PRODUCT_HEALTH_NARRATIVE_RULES.find((r) => r.id === "healthy_default")?.text;
}

/**
 * @param {Record<string, unknown>|null|undefined} executiveCurrent
 * @param {Record<string, unknown>|null|undefined} executivePrevious
 */
export function mapExecutiveProductHealthToFounderDisplay(executiveCurrent, executivePrevious) {
  const partialErrors = Array.isArray(executiveCurrent?.partial_errors)
    ? [...executiveCurrent.partial_errors]
    : [];
  if (executivePrevious?.partial_errors?.length) {
    partialErrors.push(
      ...executivePrevious.partial_errors.map((e) => ({ ...e, scope: "previous_period" }))
    );
  }

  const recommendation = executiveCurrent?.recommendation ?? {};
  const conversation = executiveCurrent?.conversation ?? {};
  const platform = executiveCurrent?.platform ?? {};
  const priceIntelligence = executiveCurrent?.price_intelligence ?? {};
  const userValue = executiveCurrent?.user_value ?? {};
  const antiRegret = executiveCurrent?.anti_regret ?? {};
  const savings = executiveCurrent?.savings ?? {};
  const commerce = executiveCurrent?.commerce ?? {};

  const prevRecommendation = executivePrevious?.recommendation ?? null;
  const hasPeriodCompare = prevRecommendation != null && executivePrevious != null;

  const qualityScore = priceIntelligence.average_price_quality_score ?? null;
  const acceptanceRate = recommendation.recommendation_acceptance_rate ?? null;
  const rejectionRate = recommendation.rejection_rate ?? null;
  const userValueScore = userValue.average_user_value ?? null;
  const antiRegretScore = antiRegret.average_score ?? null;
  const runnerUpUsage = recommendation.runner_up_usage ?? null;

  const totalConversations = Number(platform.conversations);
  const conversationsWithQuestions = Number(conversation.conversations_with_questions);
  const conversationRatio =
    Number.isFinite(totalConversations) && totalConversations > 0 && Number.isFinite(conversationsWithQuestions)
      ? conversationsWithQuestions / totalConversations
      : null;

  const acceptancePeriodDelta = hasPeriodCompare
    ? computePeriodChangePct(acceptanceRate, prevRecommendation.recommendation_acceptance_rate)
    : null;
  const rejectionPeriodDelta = hasPeriodCompare
    ? computePeriodChangePct(rejectionRate, prevRecommendation.rejection_rate)
    : null;

  const qualityLevel = classifyProductHealthLevel(qualityScore, {
    excellent: PRODUCT_HEALTH_QUALITY_EXCELLENT,
    good: PRODUCT_HEALTH_QUALITY_GOOD,
    attention: PRODUCT_HEALTH_QUALITY_ATTENTION,
  });
  const acceptanceLevel = classifyProductHealthLevel(acceptanceRate, {
    excellent: PRODUCT_HEALTH_ACCEPTANCE_EXCELLENT,
    good: PRODUCT_HEALTH_ACCEPTANCE_GOOD,
    attention: PRODUCT_HEALTH_ACCEPTANCE_ATTENTION,
  });
  const rejectionLevel = classifyProductHealthLevel(rejectionRate, {
    excellent: PRODUCT_HEALTH_REJECTION_EXCELLENT,
    good: PRODUCT_HEALTH_REJECTION_ATTENTION,
    attention: PRODUCT_HEALTH_REJECTION_ATTENTION,
    inverse: true,
  });
  const userConfidenceScore =
    userValueScore != null && antiRegretScore != null
      ? (Number(userValueScore) + Number(antiRegretScore)) / 2
      : userValueScore ?? antiRegretScore;
  const userConfidenceLevel = classifyProductHealthLevel(userConfidenceScore, {
    excellent: PRODUCT_HEALTH_SCORE_EXCELLENT,
    good: PRODUCT_HEALTH_SCORE_GOOD,
    attention: PRODUCT_HEALTH_SCORE_ATTENTION,
  });
  const conversationLevel = classifyProductHealthLevel(conversationRatio, {
    excellent: PRODUCT_HEALTH_CONVERSATION_EXCELLENT,
    good: PRODUCT_HEALTH_CONVERSATION_GOOD,
    attention: PRODUCT_HEALTH_CONVERSATION_ATTENTION,
  });

  const normalizedSignals = [
    normalizeHealthSignal(acceptanceRate, 1),
    rejectionRate != null ? 1 - Number(rejectionRate) : null,
    normalizeHealthSignal(qualityScore, 100),
    normalizeHealthSignal(userConfidenceScore, 100),
    normalizeHealthSignal(antiRegretScore, 100),
    conversationRatio,
  ].filter((v) => v != null);

  const overallQualityIndex = computeExecutiveHealthIndex(
    [
      normalizeHealthSignal(qualityScore, 100),
      normalizeHealthSignal(acceptanceRate, 1),
      normalizeHealthSignal(userConfidenceScore, 100),
    ].filter((v) => v != null)
  );

  const executiveHealthIndex = computeExecutiveHealthIndex(normalizedSignals);

  const valueSignalsPositive =
    Number(savings.opportunities_found) > 0 ||
    Number(commerce.favorite_count) > 0 ||
    Number(userValue.verified_value_amount_count) > 0;

  const narrative = resolveExecutiveProductHealthNarrative({
    qualityLevel,
    acceptanceLevel,
    acceptancePeriodDown:
      acceptancePeriodDelta != null && acceptancePeriodDelta <= -0.02,
    userConfidenceHigh: userConfidenceLevel === "excellent" || userConfidenceLevel === "healthy",
    valueSignalsPositive,
    conversationLow: conversationLevel === "attention",
    rejectionHigh: rejectionLevel === "attention",
  });

  const headlineBadge = classifyProductHealthBadge({ healthIndex: executiveHealthIndex });

  const indicatorValues = {
    recommendation_quality: {
      value: qualityScore,
      level: qualityLevel,
      valueFormatted: formatFounderMetricValue({ format: "score", value: qualityScore }),
      detail: priceIntelligence.events != null ? `${priceIntelligence.events} eventos no período` : null,
    },
    recommendation_acceptance: {
      value: acceptanceRate,
      level: acceptanceLevel,
      valueFormatted: formatFounderMetricValue({ format: "rate", value: acceptanceRate }),
      periodDelta: acceptancePeriodDelta,
      periodDeltaFormatted: formatPublicMetricRate(acceptancePeriodDelta),
      hint: hasPeriodCompare ? "Comparativo vs período anterior (offset oficial)." : "Comparativo indisponível.",
    },
    recommendation_rejection: {
      value: rejectionRate,
      level: rejectionLevel,
      valueFormatted: formatFounderMetricValue({ format: "rate", value: rejectionRate }),
      periodDelta: rejectionPeriodDelta,
      periodDeltaFormatted: formatPublicMetricRate(rejectionPeriodDelta),
      hint: "Taxa observacional — não representa insatisfação direta.",
    },
    user_confidence: {
      value: userConfidenceScore,
      level: userConfidenceLevel,
      valueFormatted: formatFounderMetricValue({ format: "score", value: userConfidenceScore }),
      detail: `User Value ${formatFounderMetricValue({ format: "score", value: userValueScore })} · Anti-Regret ${formatFounderMetricValue({ format: "score", value: antiRegretScore })}`,
    },
    runner_up_usage: {
      value: runnerUpUsage,
      level: runnerUpUsage != null && Number(runnerUpUsage) > 0 ? "healthy" : "stable",
      valueFormatted: formatFounderMetricValue({ format: "number", value: runnerUpUsage }),
      detail: "Alternativas exibidas quando aplicável.",
    },
    conversation_health: {
      value: conversationRatio,
      level: conversationLevel,
      valueFormatted: formatFounderMetricValue({ format: "rate", value: conversationRatio }),
      detail: `${formatFounderMetricValue({ format: "number", value: conversationsWithQuestions })} / ${formatFounderMetricValue({ format: "number", value: platform.conversations })} conversas`,
    },
    overall_product_quality: {
      value: overallQualityIndex,
      level: classifyProductHealthLevel(overallQualityIndex, {
        excellent: 75,
        good: 55,
        attention: 40,
      }),
      valueFormatted: overallQualityIndex != null ? `${overallQualityIndex}/100` : "—",
      detail: "Qualidade + aceitação + confiança (média normalizada).",
    },
    executive_health_index: {
      value: executiveHealthIndex,
      level: classifyProductHealthLevel(executiveHealthIndex, {
        excellent: 75,
        good: 55,
        attention: 40,
      }),
      valueFormatted: executiveHealthIndex != null ? `${executiveHealthIndex}/100` : "—",
      detail: `${normalizedSignals.length} sinais oficiais considerados.`,
    },
  };

  const indicators = FOUNDER_EXECUTIVE_PRODUCT_HEALTH_INDICATORS.map((def) => {
    const data = indicatorValues[def.id] ?? {};
    const badge = classifyProductHealthBadge({
      level: data.level,
      periodDelta: data.periodDelta,
      healthIndex: def.id === "executive_health_index" ? data.value : undefined,
    });
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      priority: def.priority,
      kind: def.kind,
      format: def.format,
      ...data,
      badge,
    };
  }).sort((a, b) => a.priority - b.priority);

  const groupsAvailable = [
    recommendation && Object.keys(recommendation).length ? "recommendation" : null,
    conversation && Object.keys(conversation).length ? "conversation" : null,
    priceIntelligence && Object.keys(priceIntelligence).length ? "price_intelligence" : null,
    userValue && Object.keys(userValue).length ? "user_value" : null,
    antiRegret && Object.keys(antiRegret).length ? "anti_regret" : null,
  ].filter(Boolean);

  let status = "success";
  if (!executiveCurrent) status = "error";
  else if (!groupsAvailable.length) status = "empty";
  else if (partialErrors.length || !hasPeriodCompare) status = "partial";

  return {
    meta: {
      display_version: FOUNDER_EXECUTIVE_PRODUCT_HEALTH_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_PRODUCT_HEALTH_CATALOG_VERSION,
      metrics_version: executiveCurrent?.metrics_version ?? null,
      reference_period_days: executiveCurrent?.reference_period_days ?? null,
      period_compare_available: hasPeriodCompare,
      groups_available: groupsAvailable,
      computed_at: executiveCurrent?.computed_at ?? null,
      status,
      partial_errors: partialErrors,
    },
    narrative: {
      headline: narrative,
      badge: headlineBadge,
    },
    health_index: {
      value: executiveHealthIndex,
      level: classifyProductHealthLevel(executiveHealthIndex, {
        excellent: 75,
        good: 55,
        attention: 40,
      }),
      formatted: executiveHealthIndex != null ? `${executiveHealthIndex}/100` : "—",
    },
    indicators,
  };
}
