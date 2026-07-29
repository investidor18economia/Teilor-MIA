/**
 * PATCH B.3 — Executive Platform Growth display mapping (B.3.0).
 * Sources: GET /api/temporal-metrics (growth + platform_activity)
 *          GET /api/executive-metrics (current + offset previous period).
 * No SQL · No Supabase · No fetch.
 */

import {
  FOUNDER_EXECUTIVE_GROWTH_INDICATORS,
  FOUNDER_EXECUTIVE_GROWTH_CATALOG_VERSION,
  EXECUTIVE_GROWTH_NARRATIVE_RULES,
  EXECUTIVE_GROWTH_ACCELERATION_THRESHOLD,
  EXECUTIVE_GROWTH_VELOCITY_HIGH,
  EXECUTIVE_GROWTH_VELOCITY_MODERATE,
  classifyExecutiveGrowthBadge,
} from "./miaFounderExecutiveGrowthCatalog.js";
import {
  classifyTrendDirection,
  formatTrendDirectionLabel,
  formatTrendPercent,
  formatActivityDayLabel,
} from "./miaFounderGrowthDisplay.js";
import { formatFounderMetricValue } from "./miaFounderCockpitDisplay.js";
import { formatPublicMetricNumber } from "./miaPublicMetricsDisplay.js";

export const FOUNDER_EXECUTIVE_GROWTH_DISPLAY_VERSION = "B.3.0";

/**
 * Period-over-period pct from two official snapshot values (mapper-only).
 * @param {unknown} current
 * @param {unknown} previous
 */
export function computePeriodChangePct(current, previous) {
  const cur = Number(current);
  const prev = Number(previous);
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return (cur - prev) / prev;
}

/**
 * @param {unknown} latestPct
 * @param {unknown} previousPct
 */
export function classifyGrowthAcceleration(latestPct, previousPct) {
  if (latestPct == null || previousPct == null) return "unknown";
  const latest = Number(latestPct);
  const prev = Number(previousPct);
  if (!Number.isFinite(latest) || !Number.isFinite(prev)) return "unknown";
  const delta = latest - prev;
  if (delta > EXECUTIVE_GROWTH_ACCELERATION_THRESHOLD) return "accelerating";
  if (delta < -EXECUTIVE_GROWTH_ACCELERATION_THRESHOLD) return "decelerating";
  return "stable";
}

/**
 * @param {unknown} pct
 */
export function classifyGrowthVelocity(pct) {
  if (pct == null || Number.isNaN(Number(pct))) return "unknown";
  const n = Math.abs(Number(pct));
  if (n >= EXECUTIVE_GROWTH_VELOCITY_HIGH) return "high";
  if (n >= EXECUTIVE_GROWTH_VELOCITY_MODERATE) return "moderate";
  if (n > 0) return "low";
  return "flat";
}

/** @param {string} velocity */
export function formatGrowthVelocityLabel(velocity) {
  if (velocity === "high") return "Alta";
  if (velocity === "moderate") return "Moderada";
  if (velocity === "low") return "Baixa";
  if (velocity === "flat") return "Plana";
  return "Indisponível";
}

/**
 * @param {{
 *   dauDirection?: string,
 *   wauDirection?: string,
 *   acceleration?: string,
 *   engagementDirection?: string,
 *   periodDirection?: string,
 * }} signals
 */
export function resolveExecutiveGrowthNarrative(signals) {
  const dauUp = signals.dauDirection === "up";
  const wauUp = signals.wauDirection === "up";
  const dauDown = signals.dauDirection === "down";
  const engagementStable = signals.engagementDirection === "stable";
  const periodDown = signals.periodDirection === "down";
  const overallStable =
    signals.dauDirection === "stable" &&
    signals.wauDirection === "stable" &&
    signals.engagementDirection === "stable";

  if (dauUp && wauUp) {
    return EXECUTIVE_GROWTH_NARRATIVE_RULES.find((r) => r.id === "consistent_growth")?.text;
  }
  if (signals.acceleration === "accelerating") {
    return EXECUTIVE_GROWTH_NARRATIVE_RULES.find((r) => r.id === "platform_accelerated")?.text;
  }
  if (signals.acceleration === "decelerating") {
    return EXECUTIVE_GROWTH_NARRATIVE_RULES.find((r) => r.id === "pace_slowed")?.text;
  }
  if (dauUp && engagementStable) {
    return EXECUTIVE_GROWTH_NARRATIVE_RULES.find((r) => r.id === "users_up_engagement_stable")?.text;
  }
  if (dauDown || periodDown) {
    return EXECUTIVE_GROWTH_NARRATIVE_RULES.find((r) => r.id === "attention_needed")?.text;
  }
  if (overallStable) {
    return EXECUTIVE_GROWTH_NARRATIVE_RULES.find((r) => r.id === "stable_platform")?.text;
  }
  return EXECUTIVE_GROWTH_NARRATIVE_RULES.find((r) => r.id === "healthy_default")?.text;
}

/**
 * @param {Record<string, unknown>|null|undefined} executiveCurrent
 * @param {Record<string, unknown>|null|undefined} executivePrevious
 * @param {Record<string, unknown>|null|undefined} temporal
 */
export function mapExecutiveGrowthToFounderDisplay(executiveCurrent, executivePrevious, temporal) {
  const growthSeries = Array.isArray(temporal?.growth?.series) ? temporal.growth.series : [];
  const platformSeries = Array.isArray(temporal?.platform_activity?.series)
    ? temporal.platform_activity.series
    : [];
  const partialErrors = Array.isArray(temporal?.partial_errors) ? [...temporal.partial_errors] : [];
  if (executivePrevious?.partial_errors?.length) {
    partialErrors.push(...executivePrevious.partial_errors.map((e) => ({ ...e, scope: "previous_period" })));
  }

  const latestGrowth = growthSeries[0] || null;
  const prevGrowth = growthSeries[1] || null;
  const latestPlatform = platformSeries[0] || null;
  const prevPlatform = platformSeries[1] || null;

  const dauPct = latestGrowth?.crescimento_dau_visitors_pct ?? null;
  const wauPct = latestGrowth?.crescimento_wau_visitors_pct ?? null;
  const mauPct = latestGrowth?.crescimento_mau_visitors_pct ?? null;
  const prevDauPct = prevGrowth?.crescimento_dau_visitors_pct ?? null;

  const dauDirection = classifyTrendDirection(dauPct);
  const wauDirection = classifyTrendDirection(wauPct);
  const mauDirection = classifyTrendDirection(mauPct);
  const acceleration = classifyGrowthAcceleration(dauPct, prevDauPct);
  const velocity = classifyGrowthVelocity(dauPct);

  const curPlatform = executiveCurrent?.platform ?? {};
  const prevPlatformSnap = executivePrevious?.platform ?? null;
  const hasPeriodCompare = prevPlatformSnap != null && executivePrevious != null;

  const sessionPeriodPct = hasPeriodCompare
    ? computePeriodChangePct(curPlatform.total_sessions, prevPlatformSnap.total_sessions)
    : null;
  const questionPeriodPct = hasPeriodCompare
    ? computePeriodChangePct(curPlatform.questions, prevPlatformSnap.questions)
    : null;
  const conversationPeriodPct = hasPeriodCompare
    ? computePeriodChangePct(curPlatform.conversations, prevPlatformSnap.conversations)
    : null;

  const sessionDailyPct = computePeriodChangePct(
    latestPlatform?.total_sessions,
    prevPlatform?.total_sessions
  );
  const questionDailyPct = computePeriodChangePct(latestPlatform?.questions, prevPlatform?.questions);
  const conversationDailyPct = computePeriodChangePct(
    latestPlatform?.conversations,
    prevPlatform?.conversations
  );

  const engagementDirection = classifyTrendDirection(
    sessionDailyPct ?? questionDailyPct ?? conversationDailyPct
  );
  const periodDirection = classifyTrendDirection(
    sessionPeriodPct ?? questionPeriodPct ?? conversationPeriodPct
  );

  const overallDirections = [dauDirection, wauDirection, mauDirection].filter((d) => d !== "unknown");
  const upCount = overallDirections.filter((d) => d === "up").length;
  const downCount = overallDirections.filter((d) => d === "down").length;
  let overallTrendDirection = "stable";
  if (upCount >= 2) overallTrendDirection = "up";
  else if (downCount >= 2) overallTrendDirection = "down";

  const narrative = resolveExecutiveGrowthNarrative({
    dauDirection,
    wauDirection,
    acceleration,
    engagementDirection,
    periodDirection,
  });

  const healthScore =
    dauDirection === "up" && periodDirection !== "down" && acceleration !== "decelerating"
      ? "healthy"
      : "neutral";

  const headlineBadge = classifyExecutiveGrowthBadge({
    trendPct: dauPct,
    acceleration,
    healthScore: healthScore === "healthy" ? "healthy" : undefined,
  });

  const indicatorValues = {
    user_growth: {
      pct: dauPct,
      direction: dauDirection,
      directionLabel: formatTrendDirectionLabel(dauDirection),
      pctFormatted: formatTrendPercent(dauPct),
      value: latestGrowth?.dau_visitors,
      valueFormatted: formatPublicMetricNumber(latestGrowth?.dau_visitors),
    },
    session_growth: {
      pct: sessionPeriodPct,
      direction: classifyTrendDirection(sessionPeriodPct),
      directionLabel: formatTrendDirectionLabel(classifyTrendDirection(sessionPeriodPct)),
      pctFormatted: formatTrendPercent(sessionPeriodPct),
      value: curPlatform.total_sessions,
      valueFormatted: formatFounderMetricValue({ format: "number", value: curPlatform.total_sessions }),
      hint: hasPeriodCompare ? "Período atual vs anterior (offset oficial)." : "Comparativo indisponível.",
    },
    question_growth: {
      pct: questionPeriodPct,
      direction: classifyTrendDirection(questionPeriodPct),
      directionLabel: formatTrendDirectionLabel(classifyTrendDirection(questionPeriodPct)),
      pctFormatted: formatTrendPercent(questionPeriodPct),
      value: curPlatform.questions,
      valueFormatted: formatFounderMetricValue({ format: "number", value: curPlatform.questions }),
      hint: hasPeriodCompare ? "Período atual vs anterior (offset oficial)." : "Comparativo indisponível.",
    },
    conversation_growth: {
      pct: conversationPeriodPct,
      direction: classifyTrendDirection(conversationPeriodPct),
      directionLabel: formatTrendDirectionLabel(classifyTrendDirection(conversationPeriodPct)),
      pctFormatted: formatTrendPercent(conversationPeriodPct),
      value: curPlatform.conversations,
      valueFormatted: formatFounderMetricValue({ format: "number", value: curPlatform.conversations }),
      hint: hasPeriodCompare ? "Período atual vs anterior (offset oficial)." : "Comparativo indisponível.",
    },
    overall_trend: {
      pct: dauPct,
      direction: overallTrendDirection,
      directionLabel: formatTrendDirectionLabel(overallTrendDirection),
      pctFormatted: formatTrendPercent(dauPct),
      detail: `DAU ${formatTrendDirectionLabel(dauDirection)} · WAU ${formatTrendDirectionLabel(wauDirection)} · MAU ${formatTrendDirectionLabel(mauDirection)}`,
    },
    growth_velocity: {
      velocity,
      velocityLabel: formatGrowthVelocityLabel(velocity),
      pct: dauPct,
      pctFormatted: formatTrendPercent(dauPct),
    },
    growth_acceleration: {
      acceleration,
      accelerationLabel:
        acceleration === "accelerating"
          ? "Acelerando"
          : acceleration === "decelerating"
            ? "Desacelerando"
            : acceleration === "stable"
              ? "Estável"
              : "Indisponível",
      latestPct: dauPct,
      previousPct: prevDauPct,
      latestFormatted: formatTrendPercent(dauPct),
      previousFormatted: formatTrendPercent(prevDauPct),
    },
    daily_engagement: {
      sessionDailyPct,
      questionDailyPct,
      conversationDailyPct,
      direction: engagementDirection,
      directionLabel: formatTrendDirectionLabel(engagementDirection),
      sessionsFormatted: formatPublicMetricNumber(latestPlatform?.total_sessions),
      questionsFormatted: formatPublicMetricNumber(latestPlatform?.questions),
      referenceDay: formatActivityDayLabel(latestPlatform?.activity_day ?? latestGrowth?.activity_day),
    },
  };

  const indicators = FOUNDER_EXECUTIVE_GROWTH_INDICATORS.map((def) => {
    const data = indicatorValues[def.id] ?? {};
    const badge = classifyExecutiveGrowthBadge({
      trendPct: data.pct,
      periodPct: data.pct,
      acceleration: def.id === "growth_acceleration" ? data.acceleration : undefined,
    });
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      priority: def.priority,
      kind: def.kind,
      ...data,
      badge,
    };
  }).sort((a, b) => a.priority - b.priority);

  let status = "success";
  if (!temporal) status = "error";
  else if (!growthSeries.length && !platformSeries.length) status = "empty";
  else if (partialErrors.length || !hasPeriodCompare) status = "partial";

  return {
    meta: {
      display_version: FOUNDER_EXECUTIVE_GROWTH_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_GROWTH_CATALOG_VERSION,
      temporal_version: temporal?.temporal_version ?? null,
      reference_day: latestGrowth?.activity_day ?? latestPlatform?.activity_day ?? null,
      reference_day_label: formatActivityDayLabel(
        latestGrowth?.activity_day ?? latestPlatform?.activity_day
      ),
      period_compare_available: hasPeriodCompare,
      computed_at: temporal?.computed_at ?? executiveCurrent?.computed_at ?? null,
      status,
      partial_errors: partialErrors,
    },
    narrative: {
      headline: narrative,
      badge: headlineBadge,
    },
    indicators,
    trends: {
      dau: { pct: dauPct, direction: dauDirection, pctFormatted: formatTrendPercent(dauPct) },
      wau: { pct: wauPct, direction: wauDirection, pctFormatted: formatTrendPercent(wauPct) },
      mau: { pct: mauPct, direction: mauDirection, pctFormatted: formatTrendPercent(mauPct) },
    },
  };
}
