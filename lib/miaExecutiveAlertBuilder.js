/**
 * PATCH C.5 — Executive Alert Builder (C.5.0).
 * Pipeline: collect candidates → validate → rules → severity/urgency/priority
 * → noise suppression → dedup → superior suppression → narrative.
 * Consumes Executive Views + C.3 insights + C.4 trends only.
 * No SQL · no Supabase · no fetch · no LLM.
 */

import {
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  EXECUTIVE_ANALYSIS_MODULE_IDS,
} from "./miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_ALERT_CATALOG_VERSION,
  EXECUTIVE_ALERT_RULES,
  EXECUTIVE_ALERT_CATEGORIES,
  EXECUTIVE_ALERT_SEVERITIES,
  EXECUTIVE_ALERT_SEVERITY_RANK,
  EXECUTIVE_ALERT_SOURCE_TYPES,
  EXECUTIVE_ALERT_EMPTY_MESSAGES,
  EXECUTIVE_ALERT_CONFIDENCE_RANK,
  EXECUTIVE_ALERT_THRESHOLDS,
} from "./miaExecutiveAlertCatalog.js";
import {
  calculateAlertUrgency,
  calculateAlertPriority,
  adjustSeverityForConfidence,
  passesConfidenceGate,
  shouldSuppressNoise,
  containsCausalLanguage,
  containsRecommendationLanguage,
  isTrendEligibleForAlert,
  deriveAlertStatus,
  compareAlertsForOrdering,
  meetsAlertMinConfidence,
} from "./miaExecutiveAlertRules.js";
import {
  collectExecutiveInsightInput,
  buildExecutiveStructuredInsights,
} from "./miaExecutiveInsightBuilder.js";
import {
  isModuleAvailable,
  isModulePartial,
} from "./miaExecutiveSummaryBuilder.js";
import {
  buildExecutiveStructuredTrends,
} from "./miaExecutiveTrendBuilder.js";
import { generateExecutiveAnalysisWithSummaryInsightsAndTrends } from "./miaExecutiveTrendBuilder.js";
import { EXECUTIVE_TREND_SIGNAL_DEFINITIONS } from "./miaExecutiveTrendCatalog.js";

export const MIA_EXECUTIVE_ALERT_BUILDER_VERSION = "C.5.0";

/**
 * @typedef {Object} ExecutiveStructuredAlert
 * @property {string} alert_id
 * @property {string} alert_key
 * @property {string} title
 * @property {string} description
 * @property {string} category
 * @property {string} severity
 * @property {string} urgency
 * @property {string} priority
 * @property {string} status
 * @property {{ type: string, level: string }} impact
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 * @property {string} source_type
 * @property {string[]} source_ids
 * @property {string[]} modules_involved
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"]} period
 * @property {string[]} limitations
 * @property {string[]} triggered_rules
 * @property {string} dedup_group
 * @property {{ builder_version: string, catalog_version: string, rule_ref: string }} meta
 */

/**
 * @param {string} moduleId
 * @param {string} fieldPath
 * @param {unknown} value
 * @param {string} ruleRef
 */
function makeEvidence(moduleId, fieldPath, value, ruleRef) {
  const safePath = fieldPath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return {
    evidence_id: `ev_c5_${moduleId}_${safePath}_${ruleRef.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
    source: "executive_analysis",
    module_id: moduleId,
    field_path: fieldPath,
    value_snapshot: value != null ? String(value) : null,
    rule_ref: ruleRef,
  };
}

/**
 * @param {string} template
 * @param {Record<string, string|number>} vars
 */
function applyTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (text, [key, val]) => text.replace(new RegExp(`\\{${key}\\}`, "g"), String(val)),
    template
  );
}

/**
 * @param {Record<string, Record<string, unknown>|null>} views
 */
function extractAlertSignals(views) {
  const growth = views.growth ?? null;
  const health = views.health ?? null;
  const commercial = views.commercial ?? null;
  const operational = views.operational ?? null;

  const dauDirection = growth?.trends?.dau?.direction ?? null;
  const growthBadgeId = growth?.narrative?.badge?.id ?? null;
  const growthDown =
    dauDirection === "down" || growthBadgeId === "attention" || growthBadgeId === "decelerating";
  const growthUp =
    dauDirection === "up" || growthBadgeId === "growing" || growthBadgeId === "accelerating";

  const acceptanceIndicator = health?.indicators?.find?.((i) => i.id === "recommendation_acceptance");
  const acceptanceDrop =
    acceptanceIndicator?.periodDelta != null &&
    acceptanceIndicator.periodDelta <= EXECUTIVE_ALERT_THRESHOLDS.acceptance_drop_min;

  const volumeConfidence = commercial?.meta?.volume_confidence ?? null;
  const lowVolume = volumeConfidence === "insufficient";
  const commercialTrend = commercial?.indicators?.find?.((i) => i.id === "commercial_trend");
  const commercialDown = commercialTrend?.direction === "down";
  const commercialUp = commercialTrend?.direction === "up";
  const commercialBottleneck = Boolean(commercial?.funnel?.main_bottleneck?.id);
  const bottleneckId = commercial?.funnel?.main_bottleneck?.id ?? "";

  const operationalBadgeId = operational?.narrative?.badge?.id ?? null;
  const operationalHeadline = operational?.narrative?.headline ?? "";
  const operationalCritical = operationalBadgeId === "critical";
  const operationalDegradation =
    operationalCritical || operationalHeadline.toLowerCase().includes("degradação");

  const modulesAvailable = EXECUTIVE_ANALYSIS_MODULE_IDS.filter((id) => isModuleAvailable(views[id]));
  const modulesMissing = EXECUTIVE_ANALYSIS_MODULE_IDS.length - modulesAvailable.length;

  const crossModuleNegative = growthDown && commercialDown;

  return {
    views,
    growthDown,
    growthUp,
    commercialDown,
    commercialUp,
    acceptanceDrop,
    lowVolume,
    commercialBottleneck,
    bottleneckId,
    operationalCritical,
    operationalDegradation,
    operationalHeadline,
    crossModuleNegative,
    modulesAvailable,
    modulesMissing,
    modulesAvailableCount: modulesAvailable.length,
  };
}

/**
 * @param {ReturnType<typeof extractAlertSignals>} signals
 */
function classifyAlertEnvelopeConfidence(signals) {
  const limitations = [];
  const factors = [];
  let level = "insufficient_data";

  if (signals.modulesAvailableCount === 0) {
    limitations.push(EXECUTIVE_ALERT_EMPTY_MESSAGES.insufficient);
    return {
      level,
      factors,
      limitations,
      modules_available: 0,
      modules_total: EXECUTIVE_ANALYSIS_MODULE_IDS.length,
    };
  }

  if (signals.modulesAvailableCount >= 3) {
    level = signals.modulesAvailableCount === EXECUTIVE_ANALYSIS_MODULE_IDS.length ? "high" : "moderate";
    factors.push(`${signals.modulesAvailableCount} módulos executivos disponíveis.`);
  } else {
    level = "low";
    limitations.push("Poucos módulos para alertas cross-module.");
  }

  if (signals.lowVolume) {
    limitations.push("Volume comercial insuficiente para alertas de alta confiança.");
  }

  const partialCount = EXECUTIVE_ANALYSIS_MODULE_IDS.filter((id) =>
    isModulePartial(signals.views[id])
  ).length;
  if (partialCount > 0) {
    if (level === "high") level = "moderate";
    limitations.push(`${partialCount} módulo(s) com dados parciais.`);
  }

  return {
    level,
    factors,
    limitations,
    modules_available: signals.modulesAvailableCount,
    modules_total: EXECUTIVE_ANALYSIS_MODULE_IDS.length,
  };
}

/**
 * @param {ReturnType<typeof extractAlertSignals>} signals
 * @param {string} when
 */
function alertRuleMatches(signals, when) {
  switch (when) {
    case "operational_critical":
      return signals.operationalCritical;
    case "operational_degradation":
      return signals.operationalDegradation && !signals.operationalCritical;
    case "commercial_bottleneck":
      return signals.commercialBottleneck;
    case "health_acceptance_drop":
      return signals.acceptanceDrop;
    case "cross_module_negative":
      return signals.crossModuleNegative;
    case "commercial_low_volume":
      return signals.lowVolume;
    case "modules_missing":
      return signals.modulesMissing >= EXECUTIVE_ALERT_THRESHOLDS.modules_missing_alert;
    default:
      return false;
  }
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function collectExecutiveAlertInput(input = {}) {
  return collectExecutiveInsightInput(input);
}

/**
 * @param {ReturnType<typeof collectExecutiveAlertInput>} collected
 * @param {ReturnType<typeof buildExecutiveStructuredInsights>} insightBundle
 * @param {ReturnType<typeof buildExecutiveStructuredTrends>} trendBundle
 */
export function collectAlertCandidates(collected, insightBundle, trendBundle) {
  const signals = extractAlertSignals(collected.views);
  const envelopeConfidence = classifyAlertEnvelopeConfidence(signals);
  const period = collected.period;
  const periodKey = period?.range ?? collected.period_label ?? "unknown";

  /** @type {Array<ExecutiveStructuredAlert & { rule_id: string, suppresses: string[], magnitude?: string, within_tolerance?: boolean, volume_insufficient?: boolean }>} */
  const candidates = [];

  if (!meetsAlertMinConfidence(envelopeConfidence.level, "low")) {
    return { candidates, signals, envelopeConfidence, period };
  }

  for (const rule of EXECUTIVE_ALERT_RULES) {
    if (rule.when === "trend_decline_negative") continue;
    if (!alertRuleMatches(signals, rule.when)) continue;

    const requiredModules = rule.category === EXECUTIVE_ALERT_CATEGORIES.CROSS_MODULE
      ? ["growth", "commercial"]
      : rule.category === EXECUTIVE_ALERT_CATEGORIES.OPERATIONAL
        ? ["operational"]
        : rule.category === EXECUTIVE_ALERT_CATEGORIES.COMMERCIAL
          ? ["commercial"]
          : rule.category === EXECUTIVE_ALERT_CATEGORIES.PRODUCT
            ? ["health"]
            : rule.category === EXECUTIVE_ALERT_CATEGORIES.DATA_QUALITY
              ? []
              : EXECUTIVE_ANALYSIS_MODULE_IDS;

    if (
      requiredModules.length > 0 &&
      !requiredModules.every((id) => isModuleAvailable(collected.views[id]))
    ) {
      continue;
    }

    if (!meetsAlertMinConfidence(envelopeConfidence.level, rule.min_confidence)) continue;

    const evidence = [];
    if (rule.when === "operational_critical" || rule.when === "operational_degradation") {
      evidence.push(
        makeEvidence("operational", "operational.narrative.headline", signals.operationalHeadline, rule.rule_ref)
      );
      evidence.push(
        makeEvidence(
          "operational",
          "operational.narrative.badge.id",
          collected.views.operational?.narrative?.badge?.id,
          rule.rule_ref
        )
      );
    } else if (rule.when === "commercial_bottleneck") {
      evidence.push(
        makeEvidence("commercial", "commercial.funnel.main_bottleneck.id", signals.bottleneckId, rule.rule_ref)
      );
    } else if (rule.when === "health_acceptance_drop") {
      const acc = collected.views.health?.indicators?.find?.((i) => i.id === "recommendation_acceptance");
      evidence.push(
        makeEvidence(
          "health",
          "health.indicators.recommendation_acceptance.periodDelta",
          acc?.periodDelta,
          rule.rule_ref
        )
      );
    } else if (rule.when === "cross_module_negative") {
      evidence.push(
        makeEvidence("growth", "growth.trends.dau.direction", collected.views.growth?.trends?.dau?.direction, rule.rule_ref)
      );
      evidence.push(
        makeEvidence(
          "commercial",
          "commercial.indicators.commercial_trend.direction",
          collected.views.commercial?.indicators?.find?.((i) => i.id === "commercial_trend")?.direction,
          rule.rule_ref
        )
      );
    } else if (rule.when === "commercial_low_volume") {
      evidence.push(
        makeEvidence(
          "commercial",
          "commercial.meta.volume_confidence",
          collected.views.commercial?.meta?.volume_confidence,
          rule.rule_ref
        )
      );
    } else if (rule.when === "modules_missing") {
      evidence.push(
        makeEvidence("meta", "modules_missing", signals.modulesMissing, rule.rule_ref)
      );
    }

    const description = applyTemplate(rule.message_template, {
      headline: signals.operationalHeadline || "—",
      bottleneck_id: signals.bottleneckId || "—",
      missing_count: signals.modulesMissing,
      metric_label: "—",
      magnitude: "—",
    });

    if (containsCausalLanguage(description) || containsRecommendationLanguage(description)) continue;

    const confidence = {
      level: envelopeConfidence.level,
      factors: [...envelopeConfidence.factors, `Regra: ${rule.rule_ref}`],
      limitations: [...envelopeConfidence.limitations],
      modules_available: envelopeConfidence.modules_available,
      modules_total: envelopeConfidence.modules_total,
    };

    let severity = rule.base_severity;
    severity = adjustSeverityForConfidence(severity, confidence);
    if (!passesConfidenceGate(severity, confidence) && severity !== EXECUTIVE_ALERT_SEVERITIES.INFORMATIONAL) {
      continue;
    }

    const urgency = calculateAlertUrgency(severity, rule.base_urgency, {
      operational_critical: signals.operationalCritical,
    });
    const modulesInvolved =
      rule.category === EXECUTIVE_ALERT_CATEGORIES.CROSS_MODULE
        ? ["growth", "commercial"].filter((id) => isModuleAvailable(collected.views[id]))
        : requiredModules.filter((id) => isModuleAvailable(collected.views[id]));
    const priority = calculateAlertPriority(severity, urgency, confidence, modulesInvolved.length);
    const status = deriveAlertStatus(severity, urgency, priority, rule.impact_level);

    candidates.push({
      alert_id: `al_c5_${rule.alert_key.replace(/\./g, "_")}_${periodKey}`,
      alert_key: rule.alert_key,
      title: rule.title,
      description,
      category: rule.category,
      severity,
      urgency,
      priority,
      status,
      impact: { type: rule.impact_type, level: rule.impact_level },
      confidence,
      source_type: rule.source_type,
      source_ids: [rule.id],
      modules_involved: modulesInvolved,
      evidence,
      period,
      limitations: confidence.limitations,
      triggered_rules: [rule.rule_ref],
      dedup_group: rule.dedup_group,
      meta: {
        builder_version: MIA_EXECUTIVE_ALERT_BUILDER_VERSION,
        catalog_version: MIA_EXECUTIVE_ALERT_CATALOG_VERSION,
        rule_ref: rule.rule_ref,
      },
      rule_id: rule.id,
      suppresses: [...rule.suppresses],
      volume_insufficient: signals.lowVolume,
    });
  }

  for (const trend of trendBundle.trends) {
    const trendRule = EXECUTIVE_ALERT_RULES.find((r) => r.when === "trend_decline_negative");
    if (!trendRule) continue;

    const signalDef = EXECUTIVE_TREND_SIGNAL_DEFINITIONS.find((s) => s.signal_key === trend.signal_key);
    const semantics = signalDef?.semantics ?? "higher_is_better";
    if (
      !isTrendEligibleForAlert(
        trend.trend_type,
        trend.direction,
        semantics,
        trend.magnitude,
        trend.status
      )
    ) {
      continue;
    }

    if (shouldSuppressNoise({ magnitude: trend.magnitude, confidence: trend.confidence })) continue;
    if (!meetsAlertMinConfidence(trend.confidence.level, trendRule.min_confidence)) continue;

    const description = applyTemplate(trendRule.message_template, {
      metric_label: trend.metric_label,
      magnitude: trend.magnitude,
      headline: "—",
      bottleneck_id: "—",
      missing_count: 0,
    });

    if (containsCausalLanguage(description) || containsRecommendationLanguage(description)) continue;

    let severity = trend.magnitude === "strong" ? EXECUTIVE_ALERT_SEVERITIES.HIGH : trendRule.base_severity;
    severity = adjustSeverityForConfidence(severity, trend.confidence);
    if (!passesConfidenceGate(severity, trend.confidence)) continue;

    const urgency = calculateAlertUrgency(severity, trendRule.base_urgency, {
      trend_type: trend.trend_type,
      magnitude: trend.magnitude,
    });
    const priority = calculateAlertPriority(
      severity,
      urgency,
      trend.confidence,
      trend.modules_involved.length
    );
    const status = deriveAlertStatus(severity, urgency, priority, trendRule.impact_level);

    const trendAlertKey =
      trend.category === "growth"
        ? "growth.decline"
        : trend.category === "commercial"
          ? "commercial.decline"
          : `${trendRule.alert_key}.${trend.signal_key}`;

    candidates.push({
      alert_id: `al_c5_trend_${trend.signal_key}_${periodKey}`,
      alert_key: trendAlertKey,
      title: trendRule.title,
      description,
      category:
        trend.category === "growth"
          ? EXECUTIVE_ALERT_CATEGORIES.GROWTH
          : trend.category === "commercial"
            ? EXECUTIVE_ALERT_CATEGORIES.COMMERCIAL
            : trend.category === "product"
              ? EXECUTIVE_ALERT_CATEGORIES.PRODUCT
              : EXECUTIVE_ALERT_CATEGORIES.GENERAL,
      severity,
      urgency,
      priority,
      status,
      impact: { type: trendRule.impact_type, level: trendRule.impact_level },
      confidence: trend.confidence,
      source_type: EXECUTIVE_ALERT_SOURCE_TYPES.TREND,
      source_ids: [trend.trend_id],
      modules_involved: trend.modules_involved,
      evidence: trend.evidence,
      period: trend.period,
      limitations: [...(trend.limitations ?? []), ...(trend.confidence.limitations ?? [])],
      triggered_rules: [trendRule.rule_ref, trend.meta?.rule_ref].filter(Boolean),
      dedup_group: `${trendRule.dedup_group}:${trend.signal_key}`,
      meta: {
        builder_version: MIA_EXECUTIVE_ALERT_BUILDER_VERSION,
        catalog_version: MIA_EXECUTIVE_ALERT_CATALOG_VERSION,
        rule_ref: trendRule.rule_ref,
      },
      rule_id: trendRule.id,
      suppresses: [],
      magnitude: trend.magnitude,
    });
  }

  return { candidates, signals, envelopeConfidence, period };
}

/**
 * @param {Array<ExecutiveStructuredAlert & { suppresses?: string[] }>} candidates
 */
export function deduplicateExecutiveAlerts(candidates) {
  /** @type {Map<string, typeof candidates[number]>} */
  const byGroup = new Map();

  for (const candidate of candidates) {
    const key = `${candidate.dedup_group}:${candidate.period?.range ?? "na"}`;
    const existing = byGroup.get(key);
    if (!existing) {
      byGroup.set(key, candidate);
      continue;
    }
    const existingRank = EXECUTIVE_ALERT_SEVERITY_RANK[existing.severity] ?? 0;
    const candidateRank = EXECUTIVE_ALERT_SEVERITY_RANK[candidate.severity] ?? 0;
    if (candidateRank > existingRank) {
      byGroup.set(key, {
        ...candidate,
        evidence: [...existing.evidence, ...candidate.evidence],
        source_ids: [...new Set([...existing.source_ids, ...candidate.source_ids])],
        modules_involved: [...new Set([...existing.modules_involved, ...candidate.modules_involved])],
        triggered_rules: [...new Set([...existing.triggered_rules, ...candidate.triggered_rules])],
      });
    } else {
      byGroup.set(key, {
        ...existing,
        evidence: [...existing.evidence, ...candidate.evidence],
        source_ids: [...new Set([...existing.source_ids, ...candidate.source_ids])],
        modules_involved: [...new Set([...existing.modules_involved, ...candidate.modules_involved])],
        triggered_rules: [...new Set([...existing.triggered_rules, ...candidate.triggered_rules])],
      });
    }
  }

  return [...byGroup.values()];
}

/**
 * @param {Array<ExecutiveStructuredAlert & { suppresses?: string[], alert_key: string }>} alerts
 */
export function applySuperiorAlertSuppression(alerts) {
  const alertKeys = new Set(alerts.map((a) => a.alert_key));
  const absorbedBy = new Map();

  for (const alert of alerts) {
    for (const subKey of alert.suppresses ?? []) {
      if (alertKeys.has(subKey)) {
        absorbedBy.set(subKey, alert.alert_key);
      }
    }
  }

  return alerts
    .filter((a) => !absorbedBy.has(a.alert_key))
    .map((a) => ({
      ...a,
      meta: {
        ...a.meta,
        absorbed_alerts: [...absorbedBy.entries()]
          .filter(([, parent]) => parent === a.alert_key)
          .map(([key]) => key),
      },
    }));
}

/**
 * @param {Array<ExecutiveStructuredAlert & { magnitude?: string, volume_insufficient?: boolean, within_tolerance?: boolean, confidence: import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence }>} candidates
 */
export function applyAlertNoiseSuppression(candidates) {
  return candidates.filter((c) => {
    if (shouldSuppressNoise(c)) return false;
    if (c.severity === EXECUTIVE_ALERT_SEVERITIES.INFORMATIONAL) return false;
    return true;
  });
}

/**
 * @param {ExecutiveStructuredAlert} structured
 */
export function mapStructuredAlertToExecutiveAlert(structured) {
  return {
    alert_id: structured.alert_id,
    severity: structured.severity,
    message: structured.description,
    confidence: structured.confidence,
    evidence: structured.evidence,
  };
}

/**
 * @param {ExecutiveStructuredAlert[]} alerts
 * @param {{ envelopeConfidence: import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence, period: import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"] }} context
 */
export function buildExecutiveAlertNarrative(alerts, context) {
  return {
    narrative_version: MIA_EXECUTIVE_ALERT_BUILDER_VERSION,
    stage: "interpretation",
    alerts,
    confidence: context.envelopeConfidence,
    meta: {
      alert_count: alerts.length,
      categories: [...new Set(alerts.map((a) => a.category))],
      severities: [...new Set(alerts.map((a) => a.severity))],
    },
  };
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function buildExecutiveStructuredAlerts(input = {}) {
  const collected = collectExecutiveAlertInput(input);
  const insightBundle = buildExecutiveStructuredInsights(input);
  const trendBundle = buildExecutiveStructuredTrends(input);
  const { candidates, envelopeConfidence, period } = collectAlertCandidates(
    collected,
    insightBundle,
    trendBundle
  );

  const afterNoise = applyAlertNoiseSuppression(candidates);
  const deduped = deduplicateExecutiveAlerts(afterNoise);
  const alerts = applySuperiorAlertSuppression(deduped).sort(compareAlertsForOrdering);
  const narrative = buildExecutiveAlertNarrative(alerts, { envelopeConfidence, period });

  return {
    alerts,
    narrative,
    envelopeConfidence,
    period,
    modules_used: EXECUTIVE_ANALYSIS_MODULE_IDS.filter((id) => isModuleAvailable(collected.views[id])),
  };
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisAlerts(input = {}) {
  const { alerts, narrative, envelopeConfidence, period, modules_used } =
    buildExecutiveStructuredAlerts(input);

  const mapped = alerts.map(mapStructuredAlertToExecutiveAlert);
  const allEvidence = alerts.flatMap((a) => a.evidence);

  let envelopeLevel = "insufficient_data";
  if (mapped.length > 0) {
    const levels = alerts.map((a) => a.confidence.level);
    if (levels.includes("high")) envelopeLevel = "high";
    else if (levels.includes("moderate")) envelopeLevel = "moderate";
    else envelopeLevel = "low";
  } else if (envelopeConfidence.level !== "insufficient_data") {
    envelopeLevel = envelopeConfidence.level;
  }

  const status =
    mapped.length > 0
      ? "alerts_ready"
      : envelopeLevel === "insufficient_data"
        ? "no_alerts"
        : "no_alerts";

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status,
    confidence: {
      level: envelopeLevel,
      factors: mapped.length
        ? [...envelopeConfidence.factors, `${mapped.length} alerta(s) elegível(is).`]
        : envelopeConfidence.factors,
      limitations: mapped.length
        ? envelopeConfidence.limitations
        : [...envelopeConfidence.limitations, EXECUTIVE_ALERT_EMPTY_MESSAGES.no_alerts],
      modules_available: envelopeConfidence.modules_available,
      modules_total: envelopeConfidence.modules_total,
    },
    evidence: allEvidence,
    summary: null,
    insights: [],
    trends: [],
    alerts: mapped,
    recommendations: [],
    meta: {
      period,
      modules: modules_used,
      builder_version: MIA_EXECUTIVE_ALERT_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_ALERT_CATALOG_VERSION,
      narrative_stage: narrative.stage,
      alert_records: alerts,
      empty_message: mapped.length === 0 ? EXECUTIVE_ALERT_EMPTY_MESSAGES.no_alerts : null,
    },
  };
}

/**
 * Combined C.2 + C.3 + C.4 + C.5 output.
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisWithSummaryInsightsTrendsAndAlerts(input = {}) {
  const base = generateExecutiveAnalysisWithSummaryInsightsAndTrends(input);
  const alertsOutput = generateExecutiveAnalysisAlerts(input);

  const combinedEvidence = [...base.evidence, ...alertsOutput.evidence];
  const combinedLimitations = [
    ...new Set([...(base.meta?.limitations ?? []), ...(alertsOutput.meta?.limitations ?? [])]),
  ];

  const rank = { high: 3, moderate: 2, low: 1, insufficient_data: 0 };
  const levels = [base.confidence.level, alertsOutput.confidence.level];
  const minRank = Math.min(...levels.map((l) => rank[l] ?? 0));
  let combinedLevel = "insufficient_data";
  if (minRank >= 3) combinedLevel = "high";
  else if (minRank >= 2) combinedLevel = "moderate";
  else if (minRank >= 1) combinedLevel = "low";

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status: "analysis_ready",
    confidence: {
      level: combinedLevel,
      factors: [...base.confidence.factors, ...alertsOutput.confidence.factors],
      limitations: combinedLimitations,
      modules_available: base.confidence.modules_available,
      modules_total: base.confidence.modules_total,
    },
    evidence: combinedEvidence,
    summary: base.summary,
    insights: base.insights,
    trends: base.trends,
    alerts: alertsOutput.alerts,
    recommendations: [],
    meta: {
      ...base.meta,
      alert_builder_version: alertsOutput.meta.builder_version,
      alert_records: alertsOutput.meta.alert_records,
      alert_count: alertsOutput.alerts.length,
      limitations: combinedLimitations,
    },
  };
}

export { EXECUTIVE_ALERT_EMPTY_MESSAGES };
