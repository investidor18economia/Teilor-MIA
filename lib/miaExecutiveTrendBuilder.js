/**
 * PATCH C.4 — Executive Trend Builder (C.4.0).
 * Pipeline: collect → validate → evaluate → classify → deduplicate → narrative.
 * Consumes Executive Views only — no SQL · no Supabase · no fetch · no LLM.
 */

import {
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  EXECUTIVE_ANALYSIS_MODULE_IDS,
} from "./miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_TREND_CATALOG_VERSION,
  EXECUTIVE_TREND_SIGNAL_DEFINITIONS,
  EXECUTIVE_TREND_TYPES,
  EXECUTIVE_TREND_TYPES_BLOCKED,
  EXECUTIVE_TREND_STATUSES,
  EXECUTIVE_TREND_EMPTY_MESSAGES,
  EXECUTIVE_TREND_DIRECTIONS,
} from "./miaExecutiveTrendCatalog.js";
import {
  normalizeViewDirection,
  classifyTrendDirectionFromDelta,
  classifyTrendMagnitude,
  classifyTrendType,
  classifyTrendStatus,
  classifyTrendConfidence,
  buildTrendInterpretation,
  describeExecutiveRelevance,
  containsCausalLanguage,
} from "./miaExecutiveTrendRules.js";
import { collectExecutiveSummaryInput, isModuleAvailable, isModulePartial } from "./miaExecutiveSummaryBuilder.js";
import { generateExecutiveAnalysisWithSummaryAndInsights } from "./miaExecutiveInsightBuilder.js";

export const MIA_EXECUTIVE_TREND_BUILDER_VERSION = "C.4.0";

/**
 * @typedef {Record<string, Record<string, unknown>|null>} ExecutiveModuleViews
 */

/**
 * @typedef {Object} ExecutiveStructuredTrend
 * @property {string} trend_id
 * @property {string} signal_key
 * @property {string} metric_label
 * @property {string} title
 * @property {string} description
 * @property {string} category
 * @property {string} direction
 * @property {string} trend_type
 * @property {string} status
 * @property {string} magnitude
 * @property {number|null} current_value
 * @property {number|null} previous_value
 * @property {number|null} absolute_change
 * @property {number|null} relative_change
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"]} period
 * @property {string|null} comparison_period
 * @property {string[]} modules_involved
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 * @property {string[]} limitations
 * @property {string} interpretation
 * @property {string} executive_relevance
 * @property {string} dedup_group
 * @property {number} priority
 * @property {Object} meta
 */

function makeEvidence(moduleId, fieldPath, value, ruleRef) {
  const safePath = fieldPath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return {
    evidence_id: `ev_c4_${moduleId}_${safePath}_${ruleRef.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
    source: "executive_views",
    module_id: moduleId,
    field_path: fieldPath,
    value_snapshot: value != null ? String(value) : null,
    rule_ref: ruleRef,
  };
}

function findIndicator(view, indicatorId) {
  const list = Array.isArray(view?.indicators) ? view.indicators : [];
  return list.find((i) => i.id === indicatorId) ?? null;
}

/**
 * @param {ExecutiveModuleViews} views
 * @param {typeof EXECUTIVE_TREND_SIGNAL_DEFINITIONS[number]} def
 */
function extractSignalFromView(views, def) {
  const view = views[def.module_id];
  const moduleAvailable = isModuleAvailable(view);
  const periodCompareAvailable = Boolean(view?.meta?.period_compare_available);
  const partialModule = isModulePartial(view);
  const lowVolume = view?.meta?.volume_confidence === "insufficient";

  if (!moduleAvailable) {
    return {
      signal_key: def.signal_key,
      module_available: false,
      period_compare_available: false,
      kind: def.kind,
      direction: EXECUTIVE_TREND_DIRECTIONS.UNKNOWN,
    };
  }

  const indicator = findIndicator(view, def.indicator_id);

  if (def.kind === "acceleration") {
    const acceleration = indicator?.acceleration ?? "unknown";
    let direction = EXECUTIVE_TREND_DIRECTIONS.UNKNOWN;
    if (acceleration === "accelerating") direction = EXECUTIVE_TREND_DIRECTIONS.UP;
    else if (acceleration === "decelerating") direction = EXECUTIVE_TREND_DIRECTIONS.DOWN;
    else if (acceleration === "stable") direction = EXECUTIVE_TREND_DIRECTIONS.STABLE;

    return {
      signal_key: def.signal_key,
      metric_label: def.metric_label,
      category: def.category,
      module_id: def.module_id,
      kind: def.kind,
      semantics: def.semantics,
      dedup_group: def.dedup_group,
      priority: def.priority,
      module_available: true,
      period_compare_available: periodCompareAvailable,
      partial_module: partialModule,
      low_volume: lowVolume,
      direction,
      acceleration,
      current_value: indicator?.latestPct ?? null,
      previous_value: indicator?.previousPct ?? null,
      absolute_change: null,
      relative_change:
        indicator?.latestPct != null && indicator?.previousPct != null
          ? Number(indicator.latestPct) - Number(indicator.previousPct)
          : null,
      observations_count: indicator?.latestPct != null && indicator?.previousPct != null ? 2 : 0,
      field_path: `${def.module_id}.indicators.${def.indicator_id}.acceleration`,
    };
  }

  const direction = normalizeViewDirection(indicator?.direction);
  let relativeChange = null;
  if (def.kind === "rate_delta") {
    relativeChange = indicator?.periodDelta ?? null;
  } else if (def.kind === "pct") {
    relativeChange = indicator?.pct ?? indicator?.value ?? null;
  }

  const computedDirection =
    indicator?.direction != null
      ? direction
      : classifyTrendDirectionFromDelta(relativeChange, def.kind === "rate_delta" ? 0.01 : 0.02);

  return {
    signal_key: def.signal_key,
    metric_label: def.metric_label,
    category: def.category,
    module_id: def.module_id,
    kind: def.kind,
    semantics: def.semantics,
    dedup_group: def.dedup_group,
    priority: def.priority,
    module_available: true,
    period_compare_available: periodCompareAvailable,
    partial_module: partialModule,
    low_volume: lowVolume,
    direction: computedDirection,
    acceleration: null,
    current_value: indicator?.value ?? null,
    previous_value: null,
    absolute_change: def.kind === "rate_delta" ? indicator?.periodDelta ?? null : null,
    relative_change: def.kind === "pct" ? indicator?.pct ?? relativeChange : relativeChange,
    observations_count: periodCompareAvailable ? 2 : 0,
    field_path: `${def.module_id}.indicators.${def.indicator_id}`,
  };
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function collectExecutiveTrendInput(input = {}) {
  return collectExecutiveSummaryInput(input);
}

/**
 * @param {ReturnType<typeof collectExecutiveTrendInput>} collected
 */
export function collectTemporalSignals(collected) {
  return EXECUTIVE_TREND_SIGNAL_DEFINITIONS.map((def) =>
    extractSignalFromView(collected.views, def)
  );
}

/**
 * @param {ReturnType<typeof extractSignalFromView>} signal
 */
export function validateTemporalSignal(signal) {
  return classifyTrendStatus(signal);
}

/**
 * @param {ReturnType<typeof collectTemporalSignals>} signals
 * @param {ReturnType<typeof collectExecutiveTrendInput>} collected
 */
export function evaluateTrendSignals(signals, collected) {
  const period = collected.period;
  const periodLabel = collected.period_label;
  const comparisonPeriod = period?.range ? `previous_${period.range}` : "previous_period";

  /** @type {ExecutiveStructuredTrend[]} */
  const trends = [];

  for (const signal of signals) {
    const { status, limitations } = validateTemporalSignal(signal);

    if (status === EXECUTIVE_TREND_STATUSES.INSUFFICIENT) {
      continue;
    }

    const deltaForMagnitude = signal.relative_change ?? signal.absolute_change;
    const magnitude = classifyTrendMagnitude(deltaForMagnitude, signal.kind);
    const trendType = classifyTrendType(
      signal.direction,
      signal.semantics,
      status,
      signal.acceleration
    );

    if (EXECUTIVE_TREND_TYPES_BLOCKED.includes(trendType)) continue;

    const confidence = classifyTrendConfidence(
      status,
      magnitude,
      limitations,
      signal.period_compare_available
    );

    if (confidence.level === "insufficient_data") continue;

    const periodKey = period?.range ?? periodLabel ?? "unknown";
    const interpretation = buildTrendInterpretation({
      metric_label: signal.metric_label,
      magnitude,
      direction: signal.direction,
      trend_type: trendType,
      status,
      period,
      period_label: periodLabel,
    });

    if (containsCausalLanguage(interpretation)) continue;

    const evidence = [
      makeEvidence(
        signal.module_id,
        signal.field_path,
        signal.relative_change ?? signal.absolute_change ?? signal.acceleration,
        `C.4.trend.${signal.signal_key}`
      ),
      makeEvidence(
        signal.module_id,
        `${signal.field_path}.direction`,
        signal.direction,
        `C.4.trend.${signal.signal_key}.direction`
      ),
    ];

    if (signal.current_value != null) {
      evidence.push(
        makeEvidence(
          signal.module_id,
          `${signal.field_path}.current_value`,
          signal.current_value,
          `C.4.trend.${signal.signal_key}.current`
        )
      );
    }
    if (signal.previous_value != null) {
      evidence.push(
        makeEvidence(
          signal.module_id,
          `${signal.field_path}.previous_value`,
          signal.previous_value,
          `C.4.trend.${signal.signal_key}.previous`
        )
      );
    }

    trends.push({
      trend_id: `tr_c4_${signal.signal_key}_${periodKey}`,
      signal_key: signal.signal_key,
      metric_label: signal.metric_label,
      title: signal.metric_label,
      description: interpretation,
      category: signal.category,
      direction: signal.direction,
      trend_type: trendType,
      status,
      magnitude,
      current_value: signal.current_value,
      previous_value: signal.previous_value,
      absolute_change: signal.absolute_change,
      relative_change: signal.relative_change,
      period,
      comparison_period: comparisonPeriod,
      modules_involved: [signal.module_id],
      confidence: {
        ...confidence,
        modules_available: 1,
        modules_total: EXECUTIVE_ANALYSIS_MODULE_IDS.length,
      },
      evidence,
      limitations,
      interpretation,
      executive_relevance: describeExecutiveRelevance(signal.direction, signal.semantics),
      dedup_group: signal.dedup_group,
      priority: signal.priority,
      meta: {
        observations_count: signal.observations_count,
        contract_version: MIA_EXECUTIVE_TREND_CATALOG_VERSION,
        rule_ref: `C.4.trend.${signal.signal_key}`,
      },
    });
  }

  return trends.sort((a, b) => a.priority - b.priority);
}

/**
 * @param {ExecutiveStructuredTrend[]} trends
 */
export function deduplicateExecutiveTrends(trends) {
  /** @type {Map<string, ExecutiveStructuredTrend>} */
  const byKey = new Map();

  for (const trend of trends) {
    const key = `${trend.dedup_group}:${trend.trend_type}:${trend.direction}:${trend.period?.range ?? "na"}`;
    const existing = byKey.get(key);
    if (!existing || trend.priority < existing.priority) {
      byKey.set(key, trend);
    }
  }

  const deduped = [...byKey.values()];
  const seenLabels = new Set();
  return deduped.filter((t) => {
    const labelKey = t.metric_label.toLowerCase();
    if (seenLabels.has(labelKey)) return false;
    seenLabels.add(labelKey);
    return true;
  });
}

/**
 * @param {ExecutiveStructuredTrend} structured
 */
export function mapStructuredTrendToExecutiveTrend(structured) {
  return {
    trend_id: structured.trend_id,
    metric_label: structured.metric_label,
    direction: structured.direction,
    change_pct: structured.relative_change,
    confidence: structured.confidence,
    evidence: structured.evidence,
  };
}

/**
 * @param {ExecutiveStructuredTrend[]} trends
 * @param {ReturnType<typeof collectExecutiveTrendInput>} collected
 */
export function buildExecutiveTrendNarrative(trends, collected) {
  return {
    narrative_version: MIA_EXECUTIVE_TREND_BUILDER_VERSION,
    stage: "interpretation",
    trends,
    meta: {
      period_label: collected.period_label,
      trend_count: trends.length,
    },
  };
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function buildExecutiveStructuredTrends(input = {}) {
  const collected = collectExecutiveTrendInput(input);
  const signals = collectTemporalSignals(collected);
  const candidates = evaluateTrendSignals(signals, collected);
  const trends = deduplicateExecutiveTrends(candidates);
  const narrative = buildExecutiveTrendNarrative(trends, collected);

  return {
    trends,
    narrative,
    period: collected.period,
    modules_used: EXECUTIVE_ANALYSIS_MODULE_IDS.filter((id) => isModuleAvailable(collected.views[id])),
    signals_collected: signals.length,
  };
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisTrends(input = {}) {
  const { trends, narrative, period, modules_used } = buildExecutiveStructuredTrends(input);
  const mapped = trends.map(mapStructuredTrendToExecutiveTrend);
  const allEvidence = trends.flatMap((t) => t.evidence);

  let envelopeLevel = "insufficient_data";
  if (mapped.length > 0) {
    const levels = trends.map((t) => t.confidence.level);
    if (levels.includes("high")) envelopeLevel = "high";
    else if (levels.includes("moderate")) envelopeLevel = "moderate";
    else envelopeLevel = "low";
  }

  const status =
    mapped.length > 0 ? "trends_ready" : envelopeLevel === "insufficient_data" ? "no_trends" : "no_trends";

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status,
    confidence: {
      level: envelopeLevel,
      factors: mapped.length ? [`${mapped.length} tendência(s) detectada(s).`] : [],
      limitations: mapped.length ? [] : [EXECUTIVE_TREND_EMPTY_MESSAGES.insufficient],
      modules_available: modules_used.length,
      modules_total: EXECUTIVE_ANALYSIS_MODULE_IDS.length,
    },
    evidence: allEvidence,
    summary: null,
    insights: [],
    trends: mapped,
    alerts: [],
    recommendations: [],
    meta: {
      period,
      modules: modules_used,
      builder_version: MIA_EXECUTIVE_TREND_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_TREND_CATALOG_VERSION,
      narrative_stage: narrative.stage,
      trend_records: trends,
      blocked_types: EXECUTIVE_TREND_TYPES_BLOCKED,
      supported_types: [
        EXECUTIVE_TREND_TYPES.GROWTH,
        EXECUTIVE_TREND_TYPES.DECLINE,
        EXECUTIVE_TREND_TYPES.STABILITY,
        EXECUTIVE_TREND_TYPES.ACCELERATION,
        EXECUTIVE_TREND_TYPES.DECELERATION,
        EXECUTIVE_TREND_TYPES.PRELIMINARY_SIGNAL,
      ],
      empty_message: mapped.length === 0 ? EXECUTIVE_TREND_EMPTY_MESSAGES.insufficient : null,
    },
  };
}

/**
 * Combined C.2 + C.3 + C.4 output.
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisWithSummaryInsightsAndTrends(input = {}) {
  const base = generateExecutiveAnalysisWithSummaryAndInsights(input);
  const trendsOutput = generateExecutiveAnalysisTrends(input);

  const combinedEvidence = [...base.evidence, ...trendsOutput.evidence];
  const combinedLimitations = [
    ...new Set([...(base.meta?.limitations ?? []), ...(trendsOutput.meta?.limitations ?? [])]),
  ];

  const rank = { high: 3, moderate: 2, low: 1, insufficient_data: 0 };
  const levels = [base.confidence.level, trendsOutput.confidence.level];
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
      factors: [...base.confidence.factors, ...trendsOutput.confidence.factors],
      limitations: combinedLimitations,
      modules_available: base.confidence.modules_available,
      modules_total: base.confidence.modules_total,
    },
    evidence: combinedEvidence,
    summary: base.summary,
    insights: base.insights,
    trends: trendsOutput.trends,
    alerts: [],
    recommendations: [],
    meta: {
      ...base.meta,
      trend_builder_version: trendsOutput.meta.builder_version,
      trend_records: trendsOutput.meta.trend_records,
      trend_count: trendsOutput.trends.length,
      limitations: combinedLimitations,
    },
  };
}

export { EXECUTIVE_TREND_EMPTY_MESSAGES, EXECUTIVE_TREND_TYPES_BLOCKED };
