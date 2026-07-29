/**
 * PATCH C.1 — Executive Analyst contracts (structure only — C.1.0).
 * No analysis behavior · No LLM calls · No fetch · No DB access.
 *
 * Phase C — MIA como Analista da Empresa.
 * Source of truth: Baseline B Executive Views + official APIs only.
 */

/** @typedef {"high"|"moderate"|"low"|"insufficient_data"} ExecutiveConfidenceLevel */

/** @typedef {"fact"|"interpretation"|"summary"|"verbalization"} ExecutiveNarrativeStage */

/**
 * Evidence trace for explainability (required on every future analysis output).
 * @typedef {Object} ExecutiveEvidence
 * @property {string} evidence_id
 * @property {string} source
 * @property {string} module_id
 * @property {string} field_path
 * @property {string|null} value_snapshot
 * @property {string} rule_ref
 */

/**
 * Confidence envelope (required on every future analysis output).
 * @typedef {Object} ExecutiveConfidence
 * @property {ExecutiveConfidenceLevel} level
 * @property {string[]} factors
 * @property {string[]} limitations
 * @property {number|null} modules_available
 * @property {number|null} modules_total
 */

/**
 * Input contract for Executive Analysis Layer (future PATCHes).
 * @typedef {Object} ExecutiveAnalysisInput
 * @property {string} analysis_version
 * @property {string|null} period_label
 * @property {{ start: string|null, end: string|null, range: string|null, window_days: number|null }} period
 * @property {string[]} module_ids
 * @property {Record<string, Record<string, unknown>|null>} executive_views
 * @property {Record<string, unknown>|null} executive_snapshot
 * @property {Record<string, unknown>|null} temporal_snapshot
 * @property {ExecutiveEvidence[]} source_evidence
 */

/**
 * @typedef {Object} ExecutiveInsight
 * @property {string} insight_id
 * @property {string} title
 * @property {string} body
 * @property {ExecutiveConfidence} confidence
 * @property {ExecutiveEvidence[]} evidence
 * @property {string[]} modules_involved
 * @property {ExecutiveNarrativeStage} stage
 */

/**
 * @typedef {Object} ExecutiveRecommendation
 * @property {string} recommendation_id
 * @property {string} headline
 * @property {string} rationale
 * @property {ExecutiveConfidence} confidence
 * @property {ExecutiveEvidence[]} evidence
 * @property {string|null} priority
 */

/**
 * @typedef {Object} ExecutiveAlert
 * @property {string} alert_id
 * @property {string} severity
 * @property {string} message
 * @property {ExecutiveConfidence} confidence
 * @property {ExecutiveEvidence[]} evidence
 */

/**
 * @typedef {Object} ExecutiveTrend
 * @property {string} trend_id
 * @property {string} metric_label
 * @property {"up"|"down"|"stable"|"unknown"} direction
 * @property {number|null} change_pct
 * @property {ExecutiveConfidence} confidence
 * @property {ExecutiveEvidence[]} evidence
 */

/**
 * @typedef {Object} ExecutiveSummary
 * @property {string} summary_id
 * @property {string} headline
 * @property {string} body
 * @property {ExecutiveConfidence} confidence
 * @property {ExecutiveEvidence[]} evidence
 * @property {string[]} priorities
 * @property {string[]} opportunities
 * @property {string[]} risks
 */

/**
 * @typedef {Object} ExecutiveAnalysisOutput
 * @property {string} analysis_version
 * @property {string} status
 * @property {ExecutiveConfidence} confidence
 * @property {ExecutiveEvidence[]} evidence
 * @property {ExecutiveSummary|null} summary
 * @property {ExecutiveInsight[]} insights
 * @property {ExecutiveTrend[]} trends
 * @property {ExecutiveAlert[]} alerts
 * @property {ExecutiveRecommendation[]} recommendations
 * @property {{ period: ExecutiveAnalysisInput["period"], modules: string[] }} meta
 */

export const MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION = "C.1.0";

export const EXECUTIVE_ANALYSIS_MODULE_IDS = Object.freeze([
  "kpis",
  "growth",
  "health",
  "commercial",
  "operational",
]);

export const EXECUTIVE_NARRATIVE_STAGES = Object.freeze([
  "fact",
  "interpretation",
  "summary",
  "verbalization",
]);

export const EXECUTIVE_CONFIDENCE_LEVELS = Object.freeze([
  "high",
  "moderate",
  "low",
  "insufficient_data",
]);

export const EXECUTIVE_ANALYSIS_INPUT_TEMPLATE = Object.freeze({
  analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  period_label: null,
  period: Object.freeze({ start: null, end: null, range: null, window_days: null }),
  module_ids: [],
  executive_views: Object.freeze({}),
  executive_snapshot: null,
  temporal_snapshot: null,
  source_evidence: [],
});

export const EXECUTIVE_ANALYSIS_OUTPUT_TEMPLATE = Object.freeze({
  analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  status: "pending",
  confidence: Object.freeze({
    level: "insufficient_data",
    factors: [],
    limitations: ["PATCH C.1 — analysis behavior not implemented"],
    modules_available: null,
    modules_total: EXECUTIVE_ANALYSIS_MODULE_IDS.length,
  }),
  evidence: [],
  summary: null,
  insights: [],
  trends: [],
  alerts: [],
  recommendations: [],
  meta: Object.freeze({ period: EXECUTIVE_ANALYSIS_INPUT_TEMPLATE.period, modules: [] }),
});

export const EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS = Object.freeze([
  "analysis_version",
  "status",
  "confidence",
  "evidence",
  "summary",
  "insights",
  "trends",
  "alerts",
  "recommendations",
  "meta",
]);

export const EXECUTIVE_CONFIDENCE_REQUIRED_KEYS = Object.freeze([
  "level",
  "factors",
  "limitations",
  "modules_available",
  "modules_total",
]);

export const EXECUTIVE_EVIDENCE_REQUIRED_KEYS = Object.freeze([
  "evidence_id",
  "source",
  "module_id",
  "field_path",
  "value_snapshot",
  "rule_ref",
]);
