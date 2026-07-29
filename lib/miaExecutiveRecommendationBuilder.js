/**
 * PATCH C.6 — Executive Recommendation Builder (C.6.0).
 * Pipeline: collect → validate → rules → priority → confidence → dedup → narrative.
 * Consumes Executive Views + C.3 insights + C.4 trends + C.5 alerts only.
 * No SQL · no Supabase · no fetch · no LLM.
 */

import {
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  EXECUTIVE_ANALYSIS_MODULE_IDS,
} from "./miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_RECOMMENDATION_CATALOG_VERSION,
  EXECUTIVE_RECOMMENDATION_RULES,
  EXECUTIVE_RECOMMENDATION_TYPES,
  EXECUTIVE_RECOMMENDATION_EMPTY_MESSAGES,
  EXECUTIVE_RECOMMENDATION_ALERT_SEVERITY_BLOCK_FOR_NO_ACTION,
  EXECUTIVE_RECOMMENDATION_PRIORITY_RANK,
} from "./miaExecutiveRecommendationCatalog.js";
import {
  calculateRecommendationPriority,
  consolidateRecommendationConfidence,
  passesRecommendationConfidenceGate,
  containsSpeculativeLanguage,
  containsRecommendationCausality,
  compareRecommendationsForOrdering,
  meetsRecommendationMinConfidence,
} from "./miaExecutiveRecommendationRules.js";
import {
  collectExecutiveAlertInput,
  buildExecutiveStructuredAlerts,
} from "./miaExecutiveAlertBuilder.js";
import { generateExecutiveAnalysisWithSummaryInsightsTrendsAndAlerts } from "./miaExecutiveAlertBuilder.js";
import { buildExecutiveStructuredInsights } from "./miaExecutiveInsightBuilder.js";
import { buildExecutiveStructuredTrends } from "./miaExecutiveTrendBuilder.js";
import { isModuleAvailable } from "./miaExecutiveSummaryBuilder.js";
import { EXECUTIVE_TREND_TYPES } from "./miaExecutiveTrendCatalog.js";

export const MIA_EXECUTIVE_RECOMMENDATION_BUILDER_VERSION = "C.6.0";

/**
 * @typedef {Object} ExecutiveStructuredRecommendation
 * @property {string} recommendation_id
 * @property {string} recommendation_key
 * @property {string} title
 * @property {string} description
 * @property {string} recommendation_type
 * @property {string} category
 * @property {string} priority
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 * @property {string[]} source_alerts
 * @property {string[]} source_trends
 * @property {string[]} source_insights
 * @property {string[]} modules_involved
 * @property {string} rationale
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveEvidence[]} evidence
 * @property {string[]} limitations
 * @property {string} expected_outcome
 * @property {string} review_after
 * @property {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput["period"]} period
 * @property {string} dedup_group
 * @property {{ builder_version: string, catalog_version: string, rule_ref: string }} meta
 */

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
 * @param {string} moduleId
 * @param {string} fieldPath
 * @param {unknown} value
 * @param {string} ruleRef
 */
function makeEvidence(moduleId, fieldPath, value, ruleRef) {
  const safePath = fieldPath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return {
    evidence_id: `ev_c6_${moduleId}_${safePath}_${ruleRef.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
    source: "executive_analysis",
    module_id: moduleId,
    field_path: fieldPath,
    value_snapshot: value != null ? String(value) : null,
    rule_ref: ruleRef,
  };
}

/**
 * @param {import("./miaExecutiveInsightBuilder.js").ExecutiveStructuredInsight[]} insights
 * @param {string} ruleId
 */
function findInsightsByRuleId(insights, ruleId) {
  return insights.filter((i) => i.insight_id.includes(`_${ruleId}_`) || i.insight_id.includes(`_${ruleId}`));
}

/**
 * @param {import("./miaExecutiveAlertBuilder.js").ExecutiveStructuredAlert[]} alerts
 */
function isNoActionEligible(alerts, trends) {
  const relevantAlerts = alerts.filter((a) =>
    EXECUTIVE_RECOMMENDATION_ALERT_SEVERITY_BLOCK_FOR_NO_ACTION.includes(a.severity)
  );
  if (relevantAlerts.length > 0) return false;

  const declineTrends = trends.filter(
    (t) => t.trend_type === EXECUTIVE_TREND_TYPES.DECLINE && t.direction === "down"
  );
  if (declineTrends.some((t) => t.magnitude === "moderate" || t.magnitude === "strong")) {
    return false;
  }

  return true;
}

/**
 * Suppress low-priority insight-only recommendations when alert-driven ones exist.
 * @param {ExecutiveStructuredRecommendation[]} candidates
 */
export function suppressRedundantRecommendations(candidates) {
  const hasAlertDriven = candidates.some(
    (c) =>
      c.source_alerts.length > 0 &&
      (c.priority === "P0" || c.priority === "P1" || c.priority === "P2")
  );
  if (!hasAlertDriven) return candidates;
  return candidates.filter(
    (c) =>
      !(
        c.source_alerts.length === 0 &&
        c.priority === "P3" &&
        (c.recommendation_type === EXECUTIVE_RECOMMENDATION_TYPES.MONITOR ||
          c.recommendation_type === EXECUTIVE_RECOMMENDATION_TYPES.EXPAND)
      )
  );
}

/**
 * @param {ReturnType<typeof collectExecutiveAlertInput>} collected
 * @param {ReturnType<typeof buildExecutiveStructuredAlerts>} alertBundle
 * @param {ReturnType<typeof buildExecutiveStructuredInsights>} insightBundle
 * @param {ReturnType<typeof buildExecutiveStructuredTrends>} trendBundle
 */
export function collectRecommendationCandidates(collected, alertBundle, insightBundle, trendBundle) {
  const period = collected.period;
  const periodKey = period?.range ?? collected.period_label ?? "unknown";
  const alerts = alertBundle.alerts;
  const insights = insightBundle.insights;
  const trends = trendBundle.trends;
  const envelopeConfidence = alertBundle.envelopeConfidence;

  /** @type {ExecutiveStructuredRecommendation[]} */
  const candidates = [];
  const triggeredRuleIds = new Set();

  for (const rule of EXECUTIVE_RECOMMENDATION_RULES) {
    if (rule.when === "no_action_eligible") continue;

    /** @type {typeof alerts} */
    let matchedAlerts = [];
    /** @type {typeof insights} */
    let matchedInsights = [];
    /** @type {typeof trends} */
    let matchedTrends = [];

    if (rule.when === "alert_key") {
      matchedAlerts = alerts.filter((a) => rule.match.includes(a.alert_key));
      if (matchedAlerts.length === 0) continue;
    } else if (rule.when === "insight_id") {
      for (const insightRuleId of rule.match) {
        matchedInsights.push(...findInsightsByRuleId(insights, insightRuleId));
      }
      matchedInsights = [...new Map(matchedInsights.map((i) => [i.insight_id, i])).values()];
      if (matchedInsights.length === 0) continue;
      const hasConflictingAlert = alerts.some(
        (a) =>
          EXECUTIVE_RECOMMENDATION_ALERT_SEVERITY_BLOCK_FOR_NO_ACTION.includes(a.severity) &&
          rule.recommendation_type === EXECUTIVE_RECOMMENDATION_TYPES.EXPAND
      );
      if (hasConflictingAlert && rule.recommendation_type === EXECUTIVE_RECOMMENDATION_TYPES.EXPAND) {
        continue;
      }
    } else {
      continue;
    }

    const sourceConfidences = [
      ...matchedAlerts.map((a) => a.confidence),
      ...matchedInsights.map((i) => i.confidence),
      ...matchedTrends.map((t) => t.confidence),
    ];
    const confidence = consolidateRecommendationConfidence(
      sourceConfidences.length ? sourceConfidences : [envelopeConfidence]
    );

    if (!meetsRecommendationMinConfidence(confidence.level, rule.min_confidence)) continue;

    const alertPriority = matchedAlerts[0]?.priority ?? null;
    const priority = calculateRecommendationPriority(
      rule.base_priority,
      alertPriority,
      matchedAlerts.length + matchedInsights.length
    );

    if (!passesRecommendationConfidenceGate(priority, confidence)) continue;

    const description = applyTemplate(rule.description_template, {
      confidence_level: confidence.level,
      alert_priority: alertPriority ?? "—",
      alert_count: matchedAlerts.length,
      modules_missing: EXECUTIVE_ANALYSIS_MODULE_IDS.length - envelopeConfidence.modules_available,
    });
    const rationale = applyTemplate(rule.rationale_template, {
      confidence_level: confidence.level,
      alert_priority: alertPriority ?? "—",
      alert_count: matchedAlerts.length,
      modules_missing: EXECUTIVE_ANALYSIS_MODULE_IDS.length - (envelopeConfidence.modules_available ?? 0),
    });

    if (containsSpeculativeLanguage(description) || containsSpeculativeLanguage(rationale)) continue;
    if (containsRecommendationCausality(description)) continue;

    const evidence = [
      ...matchedAlerts.flatMap((a) => a.evidence),
      ...matchedInsights.flatMap((i) => i.evidence),
      ...matchedTrends.flatMap((t) => t.evidence),
    ];
    if (evidence.length === 0) {
      evidence.push(makeEvidence("meta", "recommendation.rule", rule.id, rule.rule_ref));
    }

    const modulesInvolved = [
      ...new Set([
        ...matchedAlerts.flatMap((a) => a.modules_involved),
        ...matchedInsights.flatMap((i) => i.modules_involved),
        ...matchedTrends.flatMap((t) => t.modules_involved),
      ]),
    ];

    candidates.push({
      recommendation_id: `rec_c6_${rule.recommendation_key.replace(/\./g, "_")}_${periodKey}`,
      recommendation_key: rule.recommendation_key,
      title: rule.title,
      description,
      recommendation_type: rule.recommendation_type,
      category: rule.category,
      priority,
      confidence: {
        ...confidence,
        factors: [...confidence.factors, `Regra: ${rule.rule_ref}`],
      },
      source_alerts: matchedAlerts.map((a) => a.alert_id),
      source_trends: matchedTrends.map((t) => t.trend_id),
      source_insights: matchedInsights.map((i) => i.insight_id),
      modules_involved: modulesInvolved,
      rationale,
      evidence,
      limitations: confidence.limitations,
      expected_outcome: rule.expected_outcome,
      review_after: rule.review_after,
      period,
      dedup_group: rule.dedup_group,
      meta: {
        builder_version: MIA_EXECUTIVE_RECOMMENDATION_BUILDER_VERSION,
        catalog_version: MIA_EXECUTIVE_RECOMMENDATION_CATALOG_VERSION,
        rule_ref: rule.rule_ref,
      },
    });
    triggeredRuleIds.add(rule.id);
  }

  const filtered = suppressRedundantRecommendations(candidates);

  const noActionRule = EXECUTIVE_RECOMMENDATION_RULES.find((r) => r.when === "no_action_eligible");
  if (
    noActionRule &&
    filtered.length === 0 &&
    isNoActionEligible(alerts, trends) &&
    meetsRecommendationMinConfidence(envelopeConfidence.level, noActionRule.min_confidence)
  ) {
    const confidence = consolidateRecommendationConfidence([envelopeConfidence]);
    const description = noActionRule.description_template;
    const rationale = noActionRule.rationale_template;

    filtered.push({
      recommendation_id: `rec_c6_no_action_${periodKey}`,
      recommendation_key: noActionRule.recommendation_key,
      title: noActionRule.title,
      description,
      recommendation_type: noActionRule.recommendation_type,
      category: noActionRule.category,
      priority: noActionRule.base_priority,
      confidence: {
        ...confidence,
        factors: [...confidence.factors, `Regra: ${noActionRule.rule_ref}`],
      },
      source_alerts: [],
      source_trends: [],
      source_insights: [],
      modules_involved: EXECUTIVE_ANALYSIS_MODULE_IDS.filter((id) =>
        isModuleAvailable(collected.views[id])
      ),
      rationale,
      evidence: [makeEvidence("meta", "recommendation.no_action", true, noActionRule.rule_ref)],
      limitations: envelopeConfidence.limitations,
      expected_outcome: noActionRule.expected_outcome,
      review_after: noActionRule.review_after,
      period,
      dedup_group: noActionRule.dedup_group,
      meta: {
        builder_version: MIA_EXECUTIVE_RECOMMENDATION_BUILDER_VERSION,
        catalog_version: MIA_EXECUTIVE_RECOMMENDATION_CATALOG_VERSION,
        rule_ref: noActionRule.rule_ref,
      },
    });
  }

  return { candidates: filtered, envelopeConfidence, period };
}

/**
 * @param {ExecutiveStructuredRecommendation[]} candidates
 */
export function deduplicateExecutiveRecommendations(candidates) {
  /** @type {Map<string, ExecutiveStructuredRecommendation>} */
  const byGroup = new Map();

  for (const candidate of candidates) {
    const key = `${candidate.dedup_group}:${candidate.period?.range ?? "na"}`;
    const existing = byGroup.get(key);
    if (!existing) {
      byGroup.set(key, candidate);
      continue;
    }

    const existingRank = EXECUTIVE_RECOMMENDATION_PRIORITY_RANK[existing.priority] ?? 99;
    const candidateRank = EXECUTIVE_RECOMMENDATION_PRIORITY_RANK[candidate.priority] ?? 99;

    if (candidateRank < existingRank) {
      byGroup.set(key, {
        ...candidate,
        source_alerts: [...new Set([...existing.source_alerts, ...candidate.source_alerts])],
        source_insights: [...new Set([...existing.source_insights, ...candidate.source_insights])],
        source_trends: [...new Set([...existing.source_trends, ...candidate.source_trends])],
        evidence: [...existing.evidence, ...candidate.evidence],
        modules_involved: [...new Set([...existing.modules_involved, ...candidate.modules_involved])],
      });
    } else {
      byGroup.set(key, {
        ...existing,
        source_alerts: [...new Set([...existing.source_alerts, ...candidate.source_alerts])],
        source_insights: [...new Set([...existing.source_insights, ...candidate.source_insights])],
        source_trends: [...new Set([...existing.source_trends, ...candidate.source_trends])],
        evidence: [...existing.evidence, ...candidate.evidence],
        modules_involved: [...new Set([...existing.modules_involved, ...candidate.modules_involved])],
      });
    }
  }

  return [...byGroup.values()];
}

/**
 * @param {ExecutiveStructuredRecommendation} structured
 */
export function mapStructuredRecommendationToExecutiveRecommendation(structured) {
  return {
    recommendation_id: structured.recommendation_id,
    headline: structured.title,
    rationale: structured.rationale,
    confidence: structured.confidence,
    evidence: structured.evidence,
    priority: structured.priority,
  };
}

/**
 * @param {ExecutiveStructuredRecommendation[]} recommendations
 * @param {{ envelopeConfidence: import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence }} context
 */
export function buildExecutiveRecommendationNarrative(recommendations, context) {
  return {
    narrative_version: MIA_EXECUTIVE_RECOMMENDATION_BUILDER_VERSION,
    stage: "interpretation",
    recommendations,
    confidence: context.envelopeConfidence,
    meta: {
      recommendation_count: recommendations.length,
      types: [...new Set(recommendations.map((r) => r.recommendation_type))],
    },
  };
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function buildExecutiveStructuredRecommendations(input = {}) {
  const collected = collectExecutiveAlertInput(input);
  const alertBundle = buildExecutiveStructuredAlerts(input);
  const insightBundle = buildExecutiveStructuredInsights(input);
  const trendBundle = buildExecutiveStructuredTrends(input);

  const { candidates, envelopeConfidence, period } = collectRecommendationCandidates(
    collected,
    alertBundle,
    insightBundle,
    trendBundle
  );

  const recommendations = deduplicateExecutiveRecommendations(candidates).sort(
    compareRecommendationsForOrdering
  );
  const narrative = buildExecutiveRecommendationNarrative(recommendations, { envelopeConfidence });

  return {
    recommendations,
    narrative,
    envelopeConfidence,
    period,
    modules_used: EXECUTIVE_ANALYSIS_MODULE_IDS.filter((id) => isModuleAvailable(collected.views[id])),
    alertBundle,
    insightBundle,
    trendBundle,
  };
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisRecommendations(input = {}) {
  const { recommendations, narrative, envelopeConfidence, period, modules_used } =
    buildExecutiveStructuredRecommendations(input);

  const mapped = recommendations.map(mapStructuredRecommendationToExecutiveRecommendation);
  const allEvidence = recommendations.flatMap((r) => r.evidence);

  let envelopeLevel = "insufficient_data";
  if (mapped.length > 0) {
    const levels = recommendations.map((r) => r.confidence.level);
    if (levels.includes("high")) envelopeLevel = "high";
    else if (levels.includes("moderate")) envelopeLevel = "moderate";
    else envelopeLevel = "low";
  } else if (envelopeConfidence.level !== "insufficient_data") {
    envelopeLevel = envelopeConfidence.level;
  }

  const status =
    mapped.length > 0
      ? "recommendations_ready"
      : envelopeLevel === "insufficient_data"
        ? "no_recommendations"
        : "no_recommendations";

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status,
    confidence: {
      level: envelopeLevel,
      factors: mapped.length
        ? [...envelopeConfidence.factors, `${mapped.length} recomendação(ões) elegível(is).`]
        : envelopeConfidence.factors,
      limitations: mapped.length
        ? envelopeConfidence.limitations
        : [...envelopeConfidence.limitations, EXECUTIVE_RECOMMENDATION_EMPTY_MESSAGES.no_recommendations],
      modules_available: envelopeConfidence.modules_available,
      modules_total: envelopeConfidence.modules_total,
    },
    evidence: allEvidence,
    summary: null,
    insights: [],
    trends: [],
    alerts: [],
    recommendations: mapped,
    meta: {
      period,
      modules: modules_used,
      builder_version: MIA_EXECUTIVE_RECOMMENDATION_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_RECOMMENDATION_CATALOG_VERSION,
      narrative_stage: narrative.stage,
      recommendation_records: recommendations,
      empty_message: mapped.length === 0 ? EXECUTIVE_RECOMMENDATION_EMPTY_MESSAGES.no_recommendations : null,
    },
  };
}

/**
 * Full C.2 + C.3 + C.4 + C.5 + C.6 output.
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveAnalysisInput} input
 */
export function generateExecutiveAnalysisComplete(input = {}) {
  const base = generateExecutiveAnalysisWithSummaryInsightsTrendsAndAlerts(input);
  const recsOutput = generateExecutiveAnalysisRecommendations(input);

  const combinedEvidence = [...base.evidence, ...recsOutput.evidence];
  const combinedLimitations = [
    ...new Set([...(base.meta?.limitations ?? []), ...(recsOutput.meta?.limitations ?? [])]),
  ];

  const rank = { high: 3, moderate: 2, low: 1, insufficient_data: 0 };
  const levels = [base.confidence.level, recsOutput.confidence.level];
  const minRank = Math.min(...levels.map((l) => rank[l] ?? 0));
  let combinedLevel = "insufficient_data";
  if (minRank >= 3) combinedLevel = "high";
  else if (minRank >= 2) combinedLevel = "moderate";
  else if (minRank >= 1) combinedLevel = "low";

  return {
    analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
    status: "analysis_complete",
    confidence: {
      level: combinedLevel,
      factors: [...base.confidence.factors, ...recsOutput.confidence.factors],
      limitations: combinedLimitations,
      modules_available: base.confidence.modules_available,
      modules_total: base.confidence.modules_total,
    },
    evidence: combinedEvidence,
    summary: base.summary,
    insights: base.insights,
    trends: base.trends,
    alerts: base.alerts,
    recommendations: recsOutput.recommendations,
    meta: {
      ...base.meta,
      recommendation_builder_version: recsOutput.meta.builder_version,
      recommendation_records: recsOutput.meta.recommendation_records,
      recommendation_count: recsOutput.recommendations.length,
      limitations: combinedLimitations,
    },
  };
}

export { EXECUTIVE_RECOMMENDATION_EMPTY_MESSAGES };
