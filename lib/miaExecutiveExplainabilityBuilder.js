/**
 * PATCH C.7 — Executive Explainability Builder (C.7.0).
 * Pipeline: collect C.2–C.6 → build records → consolidate confidence → narrative.
 * Consumes Summary, Insights, Trends, Alerts, Recommendations only.
 * No SQL · no Supabase · no fetch · no LLM.
 */

import {
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  EXECUTIVE_ANALYSIS_MODULE_IDS,
} from "./miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION,
  EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES,
  EXECUTIVE_EXPLAINABILITY_EMPTY_MESSAGES,
  EXECUTIVE_EXPLAINABILITY_NARRATIVE_PIPELINE,
} from "./miaExecutiveExplainabilityCatalog.js";
import {
  consolidateExplainabilityConfidence,
  deriveExplainabilityConfidence,
} from "./miaExecutiveConfidenceBuilder.js";
import { buildExecutiveStructuredSummary } from "./miaExecutiveSummaryBuilder.js";
import { buildExecutiveStructuredInsights } from "./miaExecutiveInsightBuilder.js";
import { buildExecutiveStructuredTrends } from "./miaExecutiveTrendBuilder.js";
import { buildExecutiveStructuredAlerts } from "./miaExecutiveAlertBuilder.js";
import { buildExecutiveStructuredRecommendations } from "./miaExecutiveRecommendationBuilder.js";
import { generateExecutiveAnalysisComplete } from "./miaExecutiveRecommendationBuilder.js";

export const MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION = "C.7.0";

/**
 * @typedef {Object} ExecutiveExplainability
 * @property {string} id
 * @property {string} analysis_type
 * @property {string} analysis_reference
 * @property {string} rule_reference
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 * @property {string[]} limitations
 * @property {string[]} supporting_modules
 * @property {string[]} supporting_metrics
 * @property {string[]} supporting_alerts
 * @property {string[]} supporting_trends
 * @property {string[]} supporting_insights
 * @property {string[]} supporting_recommendations
 * @property {true} deterministic
 * @property {string} generated_at
 * @property {{ builder_version: string, catalog_version: string, narrative_stage: string, trace?: Record<string, string[]> }} meta
 */

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 */
function extractSupportingMetrics(evidence = []) {
  return [...new Set(evidence.map((e) => e.field_path).filter(Boolean))];
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"]} period
 * @param {string} analysisReference
 */
function deriveDeterministicGeneratedAt(period, analysisReference) {
  const anchor = period?.end ?? period?.start ?? period?.range ?? "unknown";
  return `deterministic:${anchor}:${analysisReference}`;
}

/**
 * @param {string} analysisType
 * @param {string} analysisReference
 * @param {string} ruleReference
 */
function buildExplainabilityId(analysisType, analysisReference, ruleReference) {
  const safeRule = ruleReference.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `exp_c7_${analysisType}_${analysisReference}_${safeRule}`.slice(0, 180);
}

/**
 * @param {import("./miaExecutiveInsightBuilder.js").ExecutiveStructuredInsight[]} insights
 */
function buildInsightIndex(insights) {
  return new Map(insights.map((i) => [i.insight_id, i]));
}

/**
 * @param {import("./miaExecutiveTrendBuilder.js").ExecutiveStructuredTrend[]} trends
 */
function buildTrendIndex(trends) {
  return new Map(trends.map((t) => [t.trend_id, t]));
}

/**
 * @param {import("./miaExecutiveAlertBuilder.js").ExecutiveStructuredAlert[]} alerts
 */
function buildAlertIndex(alerts) {
  const byId = new Map(alerts.map((a) => [a.alert_id, a]));
  const byKey = new Map(alerts.map((a) => [a.alert_key, a]));
  return { byId, byKey };
}

/**
 * Resolve trace links from alert source_ids to insight/trend ids.
 * @param {import("./miaExecutiveAlertBuilder.js").ExecutiveStructuredAlert} alert
 * @param {ReturnType<typeof buildInsightIndex>} insightIndex
 * @param {ReturnType<typeof buildTrendIndex>} trendIndex
 */
function resolveAlertTraceLinks(alert, insightIndex, trendIndex) {
  const supportingInsights = [];
  const supportingTrends = [];

  for (const sourceId of alert.source_ids ?? []) {
    if (insightIndex.has(sourceId)) supportingInsights.push(sourceId);
    if (trendIndex.has(sourceId)) supportingTrends.push(sourceId);
    if (sourceId.startsWith("insight_") && insightIndex.has(sourceId)) {
      supportingInsights.push(sourceId);
    }
    if (sourceId.startsWith("trend_") && trendIndex.has(sourceId)) {
      supportingTrends.push(sourceId);
    }
  }

  for (const insight of insightIndex.values()) {
    if (alert.modules_involved.some((m) => insight.modules_involved.includes(m))) {
      if (alert.triggered_rules?.some((r) => insight.rule_ref?.includes(r.split(".")[1] ?? ""))) {
        if (!supportingInsights.includes(insight.insight_id)) {
          supportingInsights.push(insight.insight_id);
        }
      }
    }
  }

  for (const trend of trendIndex.values()) {
    if (alert.source_type === "trend" && alert.source_ids.includes(trend.trend_id)) {
      if (!supportingTrends.includes(trend.trend_id)) supportingTrends.push(trend.trend_id);
    }
  }

  return {
    supporting_insights: [...new Set(supportingInsights)],
    supporting_trends: [...new Set(supportingTrends)],
  };
}

/**
 * @param {ReturnType<typeof buildExecutiveStructuredSummary>["structured"]} structured
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"]} period
 */
function buildExplainabilityForSummary(structured, period) {
  if (!structured?.summary_id || !structured.evidence?.length) return null;

  const ruleReference =
    structured.evidence.find((e) => e.rule_ref)?.rule_ref ?? "summary.executive.overview";

  return {
    id: buildExplainabilityId(
      EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.SUMMARY,
      structured.summary_id,
      ruleReference
    ),
    analysis_type: EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.SUMMARY,
    analysis_reference: structured.summary_id,
    rule_reference: ruleReference,
    evidence: structured.evidence,
    confidence: deriveExplainabilityConfidence(structured.confidence, structured.evidence, [
      "Explicação derivada do Summary Builder C.2.",
    ]),
    limitations: structured.meta?.limitations ?? structured.confidence?.limitations ?? [],
    supporting_modules: structured.meta?.modules_used ?? [],
    supporting_metrics: extractSupportingMetrics(structured.evidence),
    supporting_alerts: [],
    supporting_trends: [],
    supporting_insights: [],
    supporting_recommendations: [],
    deterministic: true,
    generated_at: deriveDeterministicGeneratedAt(period, structured.summary_id),
    meta: {
      builder_version: MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION,
      narrative_stage: "record",
      trace: { executive_views: structured.meta?.modules_used ?? [] },
    },
  };
}

/**
 * @param {import("./miaExecutiveInsightBuilder.js").ExecutiveStructuredInsight} insight
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"]} period
 */
function buildExplainabilityForInsight(insight, period) {
  if (!insight?.insight_id || !insight.evidence?.length) return null;

  const ruleReference = insight.rule_ref ?? `insight.${insight.category}.default`;

  return {
    id: buildExplainabilityId(
      EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.INSIGHT,
      insight.insight_id,
      ruleReference
    ),
    analysis_type: EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.INSIGHT,
    analysis_reference: insight.insight_id,
    rule_reference: ruleReference,
    evidence: insight.evidence,
    confidence: deriveExplainabilityConfidence(insight.confidence, insight.evidence, [
      `Insight ${insight.category} — regra ${ruleReference}.`,
    ]),
    limitations: insight.limitations ?? [],
    supporting_modules: insight.modules_involved ?? [],
    supporting_metrics: extractSupportingMetrics(insight.evidence),
    supporting_alerts: [],
    supporting_trends: [],
    supporting_insights: [],
    supporting_recommendations: [],
    deterministic: true,
    generated_at: deriveDeterministicGeneratedAt(period, insight.insight_id),
    meta: {
      builder_version: MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION,
      narrative_stage: "record",
      trace: { executive_views: insight.modules_involved ?? [] },
    },
  };
}

/**
 * @param {import("./miaExecutiveTrendBuilder.js").ExecutiveStructuredTrend} trend
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"]} period
 */
function buildExplainabilityForTrend(trend, period) {
  if (!trend?.trend_id || !trend.evidence?.length) return null;

  const ruleReference = trend.signal_key ?? `trend.${trend.trend_type}.${trend.direction}`;

  return {
    id: buildExplainabilityId(
      EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.TREND,
      trend.trend_id,
      ruleReference
    ),
    analysis_type: EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.TREND,
    analysis_reference: trend.trend_id,
    rule_reference: ruleReference,
    evidence: trend.evidence,
    confidence: deriveExplainabilityConfidence(trend.confidence, trend.evidence, [
      `Tendência ${trend.trend_type} — sinal ${trend.signal_key}.`,
    ]),
    limitations: trend.limitations ?? [],
    supporting_modules: trend.modules_involved ?? [],
    supporting_metrics: extractSupportingMetrics(trend.evidence),
    supporting_alerts: [],
    supporting_trends: [],
    supporting_insights: [],
    supporting_recommendations: [],
    deterministic: true,
    generated_at: deriveDeterministicGeneratedAt(period, trend.trend_id),
    meta: {
      builder_version: MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION,
      narrative_stage: "record",
      trace: {
        executive_views: trend.modules_involved ?? [],
        metric_label: [trend.metric_label],
      },
    },
  };
}

/**
 * @param {import("./miaExecutiveAlertBuilder.js").ExecutiveStructuredAlert} alert
 * @param {ReturnType<typeof buildInsightIndex>} insightIndex
 * @param {ReturnType<typeof buildTrendIndex>} trendIndex
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"]} period
 */
function buildExplainabilityForAlert(alert, insightIndex, trendIndex, period) {
  if (!alert?.alert_id || !alert.evidence?.length) return null;

  const ruleReference =
    alert.meta?.rule_ref ??
    alert.triggered_rules?.[0] ??
    alert.alert_key ??
    `alert.${alert.category}.${alert.severity}`;

  const traceLinks = resolveAlertTraceLinks(alert, insightIndex, trendIndex);

  return {
    id: buildExplainabilityId(
      EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.ALERT,
      alert.alert_id,
      ruleReference
    ),
    analysis_type: EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.ALERT,
    analysis_reference: alert.alert_id,
    rule_reference: ruleReference,
    evidence: alert.evidence,
    confidence: deriveExplainabilityConfidence(alert.confidence, alert.evidence, [
      `Alerta ${alert.severity} — ${alert.alert_key}.`,
    ]),
    limitations: alert.limitations ?? [],
    supporting_modules: alert.modules_involved ?? [],
    supporting_metrics: extractSupportingMetrics(alert.evidence),
    supporting_alerts: [],
    supporting_trends: traceLinks.supporting_trends,
    supporting_insights: traceLinks.supporting_insights,
    supporting_recommendations: [],
    deterministic: true,
    generated_at: deriveDeterministicGeneratedAt(period, alert.alert_id),
    meta: {
      builder_version: MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION,
      narrative_stage: "record",
      trace: {
        executive_views: alert.modules_involved ?? [],
        triggered_rules: alert.triggered_rules ?? [],
        source_type: [alert.source_type],
      },
    },
  };
}

/**
 * @param {import("./miaExecutiveRecommendationBuilder.js").ExecutiveStructuredRecommendation} rec
 * @param {ReturnType<typeof buildAlertIndex>} alertIndex
 * @param {ReturnType<typeof buildTrendIndex>} trendIndex
 * @param {ReturnType<typeof buildInsightIndex>} insightIndex
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"]} period
 */
function buildExplainabilityForRecommendation(rec, alertIndex, trendIndex, insightIndex, period) {
  if (!rec?.recommendation_id || !rec.evidence?.length) return null;

  const ruleReference = rec.meta?.rule_ref ?? rec.recommendation_key ?? `recommendation.${rec.recommendation_type}`;

  const supportingAlerts = (rec.source_alerts ?? []).filter((k) => alertIndex.byKey.has(k) || alertIndex.byId.has(k));
  const supportingTrends = (rec.source_trends ?? []).filter((id) => trendIndex.has(id));
  const supportingInsights = (rec.source_insights ?? []).filter((id) => insightIndex.has(id));

  const trace = {
    recommendation_key: [rec.recommendation_key],
    source_alerts: supportingAlerts,
    source_trends: supportingTrends,
    source_insights: supportingInsights,
  };

  return {
    id: buildExplainabilityId(
      EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.RECOMMENDATION,
      rec.recommendation_id,
      ruleReference
    ),
    analysis_type: EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPES.RECOMMENDATION,
    analysis_reference: rec.recommendation_id,
    rule_reference: ruleReference,
    evidence: rec.evidence,
    confidence: deriveExplainabilityConfidence(rec.confidence, rec.evidence, [
      `Recomendação ${rec.recommendation_type} — ${rec.recommendation_key}.`,
    ]),
    limitations: rec.limitations ?? [],
    supporting_modules: rec.modules_involved ?? [],
    supporting_metrics: extractSupportingMetrics(rec.evidence),
    supporting_alerts: supportingAlerts,
    supporting_trends: supportingTrends,
    supporting_insights: supportingInsights,
    supporting_recommendations: [],
    deterministic: true,
    generated_at: deriveDeterministicGeneratedAt(period, rec.recommendation_id),
    meta: {
      builder_version: MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION,
      narrative_stage: "record",
      trace,
    },
  };
}

/**
 * @param {ExecutiveExplainability[]} records
 */
export function buildExecutiveExplainabilityNarrative(records) {
  return {
    narrative_version: MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION,
    stage: "narrative_structure",
    pipeline: EXECUTIVE_EXPLAINABILITY_NARRATIVE_PIPELINE,
    facts: records.map((r) => ({
      id: r.id,
      analysis_type: r.analysis_type,
      analysis_reference: r.analysis_reference,
      rule_reference: r.rule_reference,
      evidence_count: r.evidence.length,
      confidence_level: r.confidence.level,
      limitations_count: r.limitations.length,
    })),
    meta: {
      record_count: records.length,
      deterministic: true,
    },
  };
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function buildExecutiveStructuredExplainability(input = {}) {
  const { structured: summaryStructured } = buildExecutiveStructuredSummary(input);
  const insightBundle = buildExecutiveStructuredInsights(input);
  const trendBundle = buildExecutiveStructuredTrends(input);
  const alertBundle = buildExecutiveStructuredAlerts(input);
  const recBundle = buildExecutiveStructuredRecommendations(input);

  const period = insightBundle.period ?? summaryStructured.meta?.period ?? input.period ?? {};
  const insightIndex = buildInsightIndex(insightBundle.insights);
  const trendIndex = buildTrendIndex(trendBundle.trends);
  const alertIndex = buildAlertIndex(alertBundle.alerts);

  /** @type {ExecutiveExplainability[]} */
  const records = [];

  const summaryExp = buildExplainabilityForSummary(summaryStructured, period);
  if (summaryExp) records.push(summaryExp);

  for (const insight of insightBundle.insights) {
    const exp = buildExplainabilityForInsight(insight, period);
    if (exp) records.push(exp);
  }

  for (const trend of trendBundle.trends) {
    const exp = buildExplainabilityForTrend(trend, period);
    if (exp) records.push(exp);
  }

  for (const alert of alertBundle.alerts) {
    const exp = buildExplainabilityForAlert(alert, insightIndex, trendIndex, period);
    if (exp) records.push(exp);
  }

  for (const rec of recBundle.recommendations) {
    const exp = buildExplainabilityForRecommendation(rec, alertIndex, trendIndex, insightIndex, period);
    if (exp) records.push(exp);
  }

  const envelopeConfidence = consolidateExplainabilityConfidence(
    records,
    recBundle.envelopeConfidence ?? insightBundle.envelopeConfidence
  );

  const narrative = buildExecutiveExplainabilityNarrative(records);
  const allEvidence = records.flatMap((r) => r.evidence);

  return {
    records,
    narrative,
    envelopeConfidence,
    period,
    modules_used: EXECUTIVE_ANALYSIS_MODULE_IDS.filter((id) =>
      records.some((r) => r.supporting_modules.includes(id))
    ),
    allEvidence,
    bundles: { summaryStructured, insightBundle, trendBundle, alertBundle, recBundle },
  };
}

/**
 * Explainability-only output (C.7 scope).
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisExplainability(input = {}) {
  const { records, narrative, envelopeConfidence, period, modules_used, allEvidence } =
    buildExecutiveStructuredExplainability(input);

  const status =
    records.length > 0 ? "explainability_ready" : "no_explainability";

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status,
    confidence: envelopeConfidence,
    evidence: allEvidence,
    summary: null,
    insights: [],
    trends: [],
    alerts: [],
    recommendations: [],
    explainability: records,
    meta: {
      period,
      modules: modules_used,
      builder_version: MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION,
      narrative_stage: narrative.stage,
      explainability_records: records,
      explainability_count: records.length,
      empty_message: records.length === 0 ? EXECUTIVE_EXPLAINABILITY_EMPTY_MESSAGES.no_elements : null,
    },
  };
}

/**
 * Full C.2 + C.3 + C.4 + C.5 + C.6 + C.7 output.
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisWithExplainability(input = {}) {
  const base = generateExecutiveAnalysisComplete(input);
  const explainOutput = generateExecutiveAnalysisExplainability(input);

  const combinedEvidence = [...base.evidence, ...explainOutput.evidence];
  const combinedLimitations = [
    ...new Set([...(base.meta?.limitations ?? []), ...(explainOutput.confidence.limitations ?? [])]),
  ];

  const rank = { high: 3, moderate: 2, low: 1, insufficient_data: 0 };
  const levels = [base.confidence.level, explainOutput.confidence.level];
  const minRank = Math.min(...levels.map((l) => rank[l] ?? 0));
  let combinedLevel = "insufficient_data";
  if (minRank >= 3) combinedLevel = "high";
  else if (minRank >= 2) combinedLevel = "moderate";
  else if (minRank >= 1) combinedLevel = "low";

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status: "analysis_complete_with_explainability",
    confidence: {
      level: combinedLevel,
      factors: [...base.confidence.factors, ...explainOutput.confidence.factors],
      limitations: combinedLimitations,
      modules_available: base.confidence.modules_available,
      modules_total: base.confidence.modules_total,
    },
    evidence: combinedEvidence,
    summary: base.summary,
    insights: base.insights,
    trends: base.trends,
    alerts: base.alerts,
    recommendations: base.recommendations,
    explainability: explainOutput.explainability,
    meta: {
      ...base.meta,
      explainability_builder_version: explainOutput.meta.builder_version,
      explainability_records: explainOutput.meta.explainability_records,
      explainability_count: explainOutput.explainability.length,
      limitations: combinedLimitations,
    },
  };
}

export { EXECUTIVE_EXPLAINABILITY_EMPTY_MESSAGES };
