/**
 * PATCH B.7 — Executive Summary display mapping (B.7.0).
 * Consumes view outputs from B.2–B.6 only — no SQL · no Supabase · no fetch.
 */

import {
  FOUNDER_EXECUTIVE_SUMMARY_CATALOG_VERSION,
  SUMMARY_MODULE_IDS,
  SUMMARY_EMPTY_MESSAGES,
  EXECUTIVE_SUMMARY_PRIORITY_CATALOG,
  EXECUTIVE_SUMMARY_OPPORTUNITY_CATALOG,
  EXECUTIVE_SUMMARY_RISK_CATALOG,
  EXECUTIVE_SUMMARY_HEADLINE_RULES,
  EXECUTIVE_SUMMARY_BODY_TEMPLATES,
  classifySummaryOverallLevel,
  classifySummaryConfidence,
  summaryBadgeToScore,
} from "./miaFounderExecutiveSummaryCatalog.js";

export const FOUNDER_EXECUTIVE_SUMMARY_DISPLAY_VERSION = "B.7.0";

const LOW_ACTIVE_USERS_THRESHOLD = 10;

/**
 * @typedef {{
 *   kpis?: Record<string, unknown>|null,
 *   growth?: Record<string, unknown>|null,
 *   health?: Record<string, unknown>|null,
 *   commercial?: Record<string, unknown>|null,
 *   operational?: Record<string, unknown>|null,
 * }} ExecutiveModuleViews
 */

/**
 * @param {Record<string, unknown>|null|undefined} view
 */
function isModuleAvailable(view) {
  return view != null && view.meta?.status !== "error";
}

/**
 * @param {Record<string, unknown>|null|undefined} view
 */
function isModulePartial(view) {
  return view?.meta?.status === "partial" || (view?.meta?.partial_errors?.length ?? 0) > 0;
}

/**
 * @param {ExecutiveModuleViews} moduleViews
 */
export function extractSummarySignals(moduleViews) {
  const kpis = moduleViews.kpis ?? null;
  const growth = moduleViews.growth ?? null;
  const health = moduleViews.health ?? null;
  const commercial = moduleViews.commercial ?? null;
  const operational = moduleViews.operational ?? null;

  const kpiList = Array.isArray(kpis?.kpis) ? kpis.kpis : [];
  const positiveKpis = kpiList.filter((k) => {
    const id = k.badge?.id;
    return id === "excellent" || id === "growing" || id === "evolving" || id === "stable";
  }).length;
  const attentionKpis = kpiList.filter((k) => k.badge?.id === "attention").length;

  const dauDirection = growth?.trends?.dau?.direction ?? null;
  const growthBadgeId = growth?.narrative?.badge?.id ?? null;
  const growthUp = dauDirection === "up" || growthBadgeId === "growing" || growthBadgeId === "accelerating";
  const growthDown = dauDirection === "down" || growthBadgeId === "attention" || growthBadgeId === "decelerating";
  const engagementStable =
    growth?.indicators?.find?.((i) => i.id === "daily_engagement")?.direction === "stable" ||
    (!growthDown && !growthUp);

  const healthIndex = health?.health_index?.value ?? null;
  const healthLevel = health?.health_index?.level ?? null;
  const acceptanceIndicator = health?.indicators?.find?.((i) => i.id === "recommendation_acceptance");
  const acceptanceDrop =
    acceptanceIndicator?.periodDelta != null && acceptanceIndicator.periodDelta <= -0.02;

  const commercialIndex = commercial?.commercial_index?.value ?? null;
  const volumeConfidence = commercial?.meta?.volume_confidence ?? null;
  const lowVolume = volumeConfidence === "insufficient";
  const commercialTrend = commercial?.indicators?.find?.((i) => i.id === "commercial_trend");
  const commercialUp = commercialTrend?.direction === "up";
  const commercialBottleneck = Boolean(commercial?.funnel?.main_bottleneck?.id);
  const advanceIndicator = commercial?.indicators?.find?.((i) => i.id === "offer_advance_rate");
  const commercialAdvanceLow = advanceIndicator?.level === "attention";
  const ctrIndicator = commercial?.indicators?.find?.((i) => i.id === "offer_ctr");
  const commercialCtrLow = ctrIndicator?.level === "attention";
  const intentIndicator = commercial?.indicators?.find?.((i) => i.id === "commercial_intent");
  const commercialIntentUp = intentIndicator?.direction === "up";

  const operationalIndex = operational?.operational_index?.value ?? null;
  const operationalHeadline = operational?.narrative?.headline ?? "";
  const operationalDegradation =
    operational?.narrative?.badge?.id === "critical" ||
    operationalHeadline.toLowerCase().includes("degradação");
  const operationalStable =
    operational?.narrative?.badge?.id === "stable" ||
    operational?.narrative?.badge?.id === "healthy" ||
    operationalHeadline.toLowerCase().includes("estável");
  const operationalStale = operationalHeadline.toLowerCase().includes("atualização");

  const activeUsersKpi = kpiList.find((k) => k.id === "active_users");
  const lowActiveUsers =
    activeUsersKpi?.value != null &&
    Number.isFinite(Number(activeUsersKpi.value)) &&
    Number(activeUsersKpi.value) < LOW_ACTIVE_USERS_THRESHOLD;

  const modulesAvailable = SUMMARY_MODULE_IDS.filter((id) => isModuleAvailable(moduleViews[id])).length;
  const partialModules = SUMMARY_MODULE_IDS.filter((id) => isModulePartial(moduleViews[id])).length;
  const periodCompareCount = [
    growth?.meta?.period_compare_available,
    health?.meta?.period_compare_available,
    commercial?.meta?.period_compare_available,
  ].filter(Boolean).length;
  const noPeriodCompare = periodCompareCount === 0;

  return {
    positiveKpis,
    attentionKpis,
    kpiTotal: kpiList.length,
    growthUp,
    growthDown,
    engagementStable,
    healthIndex,
    healthLevel,
    healthExcellent: healthLevel === "excellent" || (healthIndex != null && healthIndex >= 75),
    acceptanceDrop,
    commercialIndex,
    lowVolume,
    commercialUp,
    commercialBottleneck,
    commercialAdvanceLow,
    commercialCtrLow,
    commercialIntentUp,
    operationalIndex,
    operationalDegradation,
    operationalStable,
    operationalStale,
    lowActiveUsers,
    modulesAvailable,
    partialModules,
    periodCompareCount,
    noPeriodCompare,
  };
}

/**
 * @param {ExecutiveModuleViews} moduleViews
 */
export function computeModuleScores(moduleViews) {
  const scores = [];

  const kpis = moduleViews.kpis;
  if (isModuleAvailable(kpis) && Array.isArray(kpis.kpis) && kpis.kpis.length) {
    const badgeScores = kpis.kpis
      .map((k) => summaryBadgeToScore(k.badge?.id))
      .filter((v) => v != null);
    if (badgeScores.length) {
      scores.push(badgeScores.reduce((a, b) => a + b, 0) / badgeScores.length);
    }
  }

  const growth = moduleViews.growth;
  if (isModuleAvailable(growth)) {
    const badgeScore = summaryBadgeToScore(growth.narrative?.badge?.id);
    const dauDir = growth.trends?.dau?.direction;
    let growthScore = badgeScore;
    if (growthScore == null) {
      if (dauDir === "up") growthScore = 0.85;
      else if (dauDir === "down") growthScore = 0.35;
      else if (dauDir === "stable") growthScore = 0.65;
    }
    if (growthScore != null) scores.push(growthScore);
  }

  const health = moduleViews.health;
  if (isModuleAvailable(health) && health.health_index?.value != null) {
    scores.push(Number(health.health_index.value) / 100);
  } else if (isModuleAvailable(health)) {
    const badgeScore = summaryBadgeToScore(health.narrative?.badge?.id);
    if (badgeScore != null) scores.push(badgeScore);
  }

  const commercial = moduleViews.commercial;
  if (isModuleAvailable(commercial) && commercial.commercial_index?.value != null) {
    if (commercial.meta?.volume_confidence !== "insufficient") {
      scores.push(Number(commercial.commercial_index.value) / 100);
    }
  } else if (isModuleAvailable(commercial)) {
    const badgeScore = summaryBadgeToScore(commercial.narrative?.badge?.id);
    if (badgeScore != null) scores.push(badgeScore);
  }

  const operational = moduleViews.operational;
  if (isModuleAvailable(operational) && operational.operational_index?.value != null) {
    scores.push(Number(operational.operational_index.value) / 100);
  } else if (isModuleAvailable(operational)) {
    const badgeScore = summaryBadgeToScore(operational.narrative?.badge?.id);
    if (badgeScore != null) scores.push(badgeScore);
  }

  return scores;
}

/**
 * @param {ReturnType<typeof extractSummarySignals>} signals
 * @param {{ id: string, label: string, when: string, priority?: number }} item
 */
function priorityMatches(signals, item) {
  switch (item.when) {
    case "commercial_bottleneck":
      return signals.commercialBottleneck;
    case "commercial_advance_low":
      return signals.commercialAdvanceLow;
    case "growth_dau_down":
      return signals.growthDown;
    case "growth_engagement_flat":
      return signals.engagementStable && !signals.growthUp;
    case "health_acceptance_drop":
      return signals.acceptanceDrop;
    case "operational_degradation":
      return signals.operationalDegradation;
    case "operational_stale":
      return signals.operationalStale;
    case "commercial_ctr_low":
      return signals.commercialCtrLow;
    default:
      return false;
  }
}

/**
 * @param {ReturnType<typeof extractSummarySignals>} signals
 * @param {{ id: string, label: string, when: string }} item
 */
function opportunityMatches(signals, item) {
  switch (item.when) {
    case "growth_up":
      return signals.growthUp;
    case "growth_stable_engagement":
      return signals.engagementStable && !signals.growthDown;
    case "commercial_up":
      return signals.commercialUp;
    case "operational_stable":
      return signals.operationalStable && !signals.operationalDegradation;
    case "health_excellent":
      return signals.healthExcellent;
    case "commercial_intent_up":
      return signals.commercialIntentUp;
    case "kpis_majority_positive":
      return signals.kpiTotal > 0 && signals.positiveKpis > signals.kpiTotal / 2;
    default:
      return false;
  }
}

/**
 * @param {ReturnType<typeof extractSummarySignals>} signals
 * @param {{ id: string, label: string, when: string }} item
 */
function riskMatches(signals, item) {
  switch (item.when) {
    case "commercial_bottleneck":
      return signals.commercialBottleneck;
    case "low_volume":
      return signals.lowVolume;
    case "operational_degradation":
      return signals.operationalDegradation;
    case "low_active_users":
      return signals.lowActiveUsers;
    case "growth_dau_down":
      return signals.growthDown;
    case "health_acceptance_drop":
      return signals.acceptanceDrop;
    case "partial_modules":
      return signals.partialModules > 0;
    case "no_period_compare":
      return signals.noPeriodCompare && signals.modulesAvailable >= 2;
    default:
      return false;
  }
}

/**
 * @param {ReturnType<typeof extractSummarySignals>} signals
 * @param {string} overallLevelId
 * @param {{ id: string, label: string }} confidence
 */
export function resolveExecutiveSummaryHeadline(signals, overallLevelId, confidence) {
  if (confidence.id === "low") {
    return EXECUTIVE_SUMMARY_HEADLINE_RULES.find((r) => r.id === "partial_data")?.text;
  }
  if (overallLevelId === "critical") {
    return EXECUTIVE_SUMMARY_HEADLINE_RULES.find((r) => r.id === "critical_state")?.text;
  }
  if (overallLevelId === "attention") {
    return EXECUTIVE_SUMMARY_HEADLINE_RULES.find((r) => r.id === "attention_needed")?.text;
  }
  if (signals.growthUp && signals.operationalStable) {
    return EXECUTIVE_SUMMARY_HEADLINE_RULES.find((r) => r.id === "growth_stable_ops")?.text;
  }
  if (overallLevelId === "excellent" || overallLevelId === "very_healthy") {
    return EXECUTIVE_SUMMARY_HEADLINE_RULES.find((r) => r.id === "overall_excellent")?.text;
  }
  if (overallLevelId === "stable") {
    return EXECUTIVE_SUMMARY_HEADLINE_RULES.find((r) => r.id === "stable_default")?.text;
  }
  return EXECUTIVE_SUMMARY_HEADLINE_RULES.find((r) => r.id === "healthy_default")?.text;
}

/**
 * @param {string} overallLevelId
 * @param {{ id: string, label: string }} confidence
 * @param {ReturnType<typeof extractSummarySignals>} signals
 * @param {ExecutiveModuleViews} moduleViews
 */
export function resolveExecutiveSummaryBody(overallLevelId, confidence, signals, moduleViews) {
  if (confidence.id === "low" || signals.modulesAvailable < SUMMARY_MODULE_IDS.length) {
    const parts = [];
    if (isModuleAvailable(moduleViews.growth) && moduleViews.growth?.narrative?.headline) {
      parts.push(moduleViews.growth.narrative.headline);
    }
    if (isModuleAvailable(moduleViews.health) && moduleViews.health?.narrative?.headline) {
      parts.push(moduleViews.health.narrative.headline);
    }
    if (parts.length) {
      return `${EXECUTIVE_SUMMARY_BODY_TEMPLATES.partial} ${parts.join(" ")}`.trim();
    }
    return EXECUTIVE_SUMMARY_BODY_TEMPLATES.partial;
  }

  let base = EXECUTIVE_SUMMARY_BODY_TEMPLATES.healthy;
  if (overallLevelId === "excellent" || overallLevelId === "very_healthy") {
    base = EXECUTIVE_SUMMARY_BODY_TEMPLATES.excellent;
  } else if (overallLevelId === "stable") {
    base = EXECUTIVE_SUMMARY_BODY_TEMPLATES.stable;
  } else if (overallLevelId === "attention" || overallLevelId === "critical") {
    base = EXECUTIVE_SUMMARY_BODY_TEMPLATES.attention;
  }

  const commercialNarrative = moduleViews.commercial?.narrative?.headline;
  if (
    signals.commercialBottleneck &&
    commercialNarrative &&
    !base.toLowerCase().includes("conversão")
  ) {
    return `${base} A principal oportunidade está na evolução da conversão comercial.`;
  }
  if (signals.commercialUp && !signals.commercialBottleneck) {
    return `${base} A atividade comercial mostra tração no período.`;
  }
  return base;
}

/**
 * @param {ExecutiveModuleViews} moduleViews
 */
export function mapExecutiveSummaryToFounderDisplay(moduleViews = {}) {
  const normalizedViews = {
    kpis: moduleViews.kpis ?? null,
    growth: moduleViews.growth ?? null,
    health: moduleViews.health ?? null,
    commercial: moduleViews.commercial ?? null,
    operational: moduleViews.operational ?? null,
  };

  const signals = extractSummarySignals(normalizedViews);
  const moduleScores = computeModuleScores(normalizedViews);
  const avgScore =
    moduleScores.length > 0
      ? moduleScores.reduce((a, b) => a + b, 0) / moduleScores.length
      : null;

  const hasCritical =
    signals.operationalDegradation ||
    normalizedViews.operational?.narrative?.badge?.id === "critical" ||
    (avgScore != null && avgScore < 0.35);

  const overallLevel = classifySummaryOverallLevel(avgScore, {
    hasCritical,
    unavailable: signals.modulesAvailable === 0,
  });

  const confidence = classifySummaryConfidence({
    modulesAvailable: signals.modulesAvailable,
    modulesTotal: SUMMARY_MODULE_IDS.length,
    periodCompareCount: signals.periodCompareCount,
    lowVolume: signals.lowVolume,
    partialModules: signals.partialModules,
  });

  const headline = resolveExecutiveSummaryHeadline(signals, overallLevel.id, confidence);
  const summary = resolveExecutiveSummaryBody(overallLevel.id, confidence, signals, normalizedViews);

  const seenPriority = new Set();
  const priorities = EXECUTIVE_SUMMARY_PRIORITY_CATALOG.filter((item) =>
    priorityMatches(signals, item)
  )
    .sort((a, b) => a.priority - b.priority)
    .filter((item) => {
      if (seenPriority.has(item.label)) return false;
      seenPriority.add(item.label);
      return true;
    })
    .slice(0, 3)
    .map((item, index) => ({
      rank: index + 1,
      id: item.id,
      label: item.label,
      source: item.source,
    }));

  const opportunities = EXECUTIVE_SUMMARY_OPPORTUNITY_CATALOG.filter((item) =>
    opportunityMatches(signals, item)
  )
    .slice(0, 5)
    .map((item) => ({ id: item.id, label: item.label }));

  const risks = EXECUTIVE_SUMMARY_RISK_CATALOG.filter((item) => riskMatches(signals, item))
    .slice(0, 5)
    .map((item) => ({ id: item.id, label: item.label }));

  let confidenceNote = null;
  if (confidence.id === "low") {
    confidenceNote = "Algumas conclusões possuem baixa confiança devido ao volume reduzido de dados.";
  } else if (signals.lowVolume) {
    confidenceNote = SUMMARY_EMPTY_MESSAGES.low_volume;
  } else if (signals.noPeriodCompare) {
    confidenceNote = SUMMARY_EMPTY_MESSAGES.no_period_compare;
  } else if (signals.partialModules > 0) {
    confidenceNote = `${signals.partialModules} módulo(s) com dados parciais no período.`;
  }

  const modulesConsumed = SUMMARY_MODULE_IDS.map((id) => ({
    id,
    available: isModuleAvailable(normalizedViews[id]),
    status: normalizedViews[id]?.meta?.status ?? "missing",
    partial: isModulePartial(normalizedViews[id]),
  }));

  let status = "success";
  if (signals.modulesAvailable === 0) status = "error";
  else if (signals.partialModules > 0 || confidence.id !== "high") status = "partial";

  return {
    meta: {
      display_version: FOUNDER_EXECUTIVE_SUMMARY_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_SUMMARY_CATALOG_VERSION,
      modules_consumed: modulesConsumed,
      modules_available: signals.modulesAvailable,
      modules_total: SUMMARY_MODULE_IDS.length,
      average_score: avgScore != null ? Math.round(avgScore * 100) : null,
      status,
    },
    headline: {
      text: headline ?? SUMMARY_EMPTY_MESSAGES.insufficient_data,
      overall_level: overallLevel,
    },
    summary: {
      text: summary,
    },
    confidence: {
      ...confidence,
      note: confidenceNote,
    },
    priorities,
    opportunities,
    risks,
    modules: modulesConsumed,
  };
}
