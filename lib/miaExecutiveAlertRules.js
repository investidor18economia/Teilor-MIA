/**
 * PATCH C.5 — Executive Alert rules (C.5.0).
 * Severity, urgency, priority, confidence gates — deterministic only.
 * No SQL · no fetch · no LLM.
 */

import {
  EXECUTIVE_ALERT_SEVERITIES,
  EXECUTIVE_ALERT_SEVERITY_RANK,
  EXECUTIVE_ALERT_URGENCIES,
  EXECUTIVE_ALERT_PRIORITIES,
  EXECUTIVE_ALERT_STATUSES,
  EXECUTIVE_ALERT_CONFIDENCE_RANK,
  EXECUTIVE_ALERT_CONFIDENCE_GATES,
  EXECUTIVE_ALERT_CAUSALITY_BLOCKLIST,
  EXECUTIVE_ALERT_RECOMMENDATION_BLOCKLIST,
  EXECUTIVE_ALERT_THRESHOLDS,
} from "./miaExecutiveAlertCatalog.js";
import {
  EXECUTIVE_TREND_TYPES,
  EXECUTIVE_TREND_STATUSES,
  EXECUTIVE_TREND_MAGNITUDES,
} from "./miaExecutiveTrendCatalog.js";

const MAGNITUDE_RANK = Object.freeze({
  negligible: 0,
  small: 1,
  moderate: 2,
  strong: 3,
  unknown: -1,
});

/**
 * @param {string} level
 * @param {string} minLevel
 */
export function meetsAlertMinConfidence(level, minLevel) {
  return (EXECUTIVE_ALERT_CONFIDENCE_RANK[level] ?? 0) >= (EXECUTIVE_ALERT_CONFIDENCE_RANK[minLevel] ?? 0);
}

/**
 * @param {string} severity
 */
export function severityConfidenceGate(severity) {
  switch (severity) {
    case EXECUTIVE_ALERT_SEVERITIES.CRITICAL:
      return EXECUTIVE_ALERT_CONFIDENCE_GATES.critical_min;
    case EXECUTIVE_ALERT_SEVERITIES.HIGH:
      return EXECUTIVE_ALERT_CONFIDENCE_GATES.high_min;
    case EXECUTIVE_ALERT_SEVERITIES.MEDIUM:
      return EXECUTIVE_ALERT_CONFIDENCE_GATES.medium_min;
    default:
      return EXECUTIVE_ALERT_CONFIDENCE_GATES.low_min;
  }
}

/**
 * @param {string} severity
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 */
export function passesConfidenceGate(severity, confidence) {
  const required = severityConfidenceGate(severity);
  return meetsAlertMinConfidence(confidence.level, required);
}

/**
 * @param {string} severity
 * @param {string} baseUrgency
 * @param {{ trend_type?: string, magnitude?: string, operational_critical?: boolean }} context
 */
export function calculateAlertUrgency(severity, baseUrgency, context = {}) {
  if (severity === EXECUTIVE_ALERT_SEVERITIES.CRITICAL || context.operational_critical) {
    return EXECUTIVE_ALERT_URGENCIES.IMMEDIATE;
  }
  if (
    context.trend_type === EXECUTIVE_TREND_TYPES.DECLINE &&
    (context.magnitude === EXECUTIVE_TREND_MAGNITUDES.STRONG ||
      context.magnitude === EXECUTIVE_TREND_MAGNITUDES.MODERATE)
  ) {
    return EXECUTIVE_ALERT_URGENCIES.SOON;
  }
  if (severity === EXECUTIVE_ALERT_SEVERITIES.HIGH) {
    return baseUrgency === EXECUTIVE_ALERT_URGENCIES.IMMEDIATE
      ? EXECUTIVE_ALERT_URGENCIES.IMMEDIATE
      : EXECUTIVE_ALERT_URGENCIES.SOON;
  }
  if (severity === EXECUTIVE_ALERT_SEVERITIES.MEDIUM) {
    return EXECUTIVE_ALERT_URGENCIES.MONITOR;
  }
  return baseUrgency ?? EXECUTIVE_ALERT_URGENCIES.MONITOR;
}

/**
 * @param {string} severity
 * @param {string} urgency
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 * @param {number} modulesCount
 */
export function calculateAlertPriority(severity, urgency, confidence, modulesCount = 1) {
  const sevRank = EXECUTIVE_ALERT_SEVERITY_RANK[severity] ?? 0;
  const confRank = EXECUTIVE_ALERT_CONFIDENCE_RANK[confidence.level] ?? 0;
  const multiModule = modulesCount >= 2;

  if (
    sevRank >= EXECUTIVE_ALERT_SEVERITY_RANK.critical &&
    urgency === EXECUTIVE_ALERT_URGENCIES.IMMEDIATE &&
    confRank >= EXECUTIVE_ALERT_CONFIDENCE_RANK.moderate
  ) {
    return EXECUTIVE_ALERT_PRIORITIES.P0;
  }
  if (
    sevRank >= EXECUTIVE_ALERT_SEVERITY_RANK.high ||
    (urgency === EXECUTIVE_ALERT_URGENCIES.IMMEDIATE && confRank >= EXECUTIVE_ALERT_CONFIDENCE_RANK.moderate)
  ) {
    return EXECUTIVE_ALERT_PRIORITIES.P1;
  }
  if (sevRank >= EXECUTIVE_ALERT_SEVERITY_RANK.medium || multiModule) {
    return EXECUTIVE_ALERT_PRIORITIES.P2;
  }
  return EXECUTIVE_ALERT_PRIORITIES.P3;
}

/**
 * Downgrade severity when confidence insufficient — never upgrade.
 * @param {string} severity
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 */
export function adjustSeverityForConfidence(severity, confidence) {
  if (passesConfidenceGate(severity, confidence)) return severity;

  const rank = EXECUTIVE_ALERT_SEVERITY_RANK[severity] ?? 0;
  if (rank >= EXECUTIVE_ALERT_SEVERITY_RANK.high) {
    return EXECUTIVE_ALERT_SEVERITIES.MEDIUM;
  }
  if (rank >= EXECUTIVE_ALERT_SEVERITY_RANK.medium) {
    return EXECUTIVE_ALERT_SEVERITIES.LOW;
  }
  return EXECUTIVE_ALERT_SEVERITIES.INFORMATIONAL;
}

/**
 * @param {string} text
 */
export function containsCausalLanguage(text) {
  if (!text) return false;
  return EXECUTIVE_ALERT_CAUSALITY_BLOCKLIST.some((re) => re.test(text));
}

/**
 * @param {string} text
 */
export function containsRecommendationLanguage(text) {
  if (!text) return false;
  return EXECUTIVE_ALERT_RECOMMENDATION_BLOCKLIST.some((re) => re.test(text));
}

/**
 * @param {{ magnitude?: string, confidence?: import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence, within_tolerance?: boolean, volume_insufficient?: boolean }} candidate
 */
export function shouldSuppressNoise(candidate) {
  if (candidate.within_tolerance) return true;
  if (candidate.volume_insufficient && candidate.magnitude === EXECUTIVE_TREND_MAGNITUDES.NEGLIGIBLE) {
    return true;
  }
  if (
    candidate.magnitude === EXECUTIVE_TREND_MAGNITUDES.NEGLIGIBLE ||
    candidate.magnitude === "negligible"
  ) {
    return true;
  }
  if (candidate.confidence?.level === "insufficient_data") return true;
  return false;
}

/**
 * @param {string} magnitude
 * @param {string} minMagnitude
 */
export function magnitudeMeetsMinimum(magnitude, minMagnitude = EXECUTIVE_ALERT_THRESHOLDS.trend_decline_magnitude_min) {
  return (MAGNITUDE_RANK[magnitude] ?? -1) >= (MAGNITUDE_RANK[minMagnitude] ?? 1);
}

/**
 * @param {import("./miaExecutiveTrendCatalog.js").EXECUTIVE_TREND_TYPES[keyof typeof import("./miaExecutiveTrendCatalog.js").EXECUTIVE_TREND_TYPES]} trendType
 * @param {string} direction
 * @param {string} semantics
 * @param {string} magnitude
 * @param {string} status
 */
export function isTrendEligibleForAlert(trendType, direction, semantics, magnitude, status) {
  if (trendType !== EXECUTIVE_TREND_TYPES.DECLINE) return false;
  if (direction !== "down") return false;
  if (status === EXECUTIVE_TREND_STATUSES.INSUFFICIENT) return false;
  if (!magnitudeMeetsMinimum(magnitude)) return false;
  if (semantics === "higher_is_better" || semantics === "neutral") return true;
  return false;
}

/**
 * @param {string} severity
 * @param {string} urgency
 * @param {string} priority
 * @param {string} impactLevel
 */
export function deriveAlertStatus(severity, urgency, priority, impactLevel) {
  if (severity === EXECUTIVE_ALERT_SEVERITIES.INFORMATIONAL) {
    return EXECUTIVE_ALERT_STATUSES.MONITORING;
  }
  if (priority === EXECUTIVE_ALERT_PRIORITIES.P3 && urgency === EXECUTIVE_ALERT_URGENCIES.NONE) {
    return EXECUTIVE_ALERT_STATUSES.MONITORING;
  }
  if (impactLevel === "unknown" && severity === EXECUTIVE_ALERT_SEVERITIES.LOW) {
    return EXECUTIVE_ALERT_STATUSES.MONITORING;
  }
  return EXECUTIVE_ALERT_STATUSES.ACTIVE;
}

/**
 * Sort key for stable ordering: priority asc, severity desc, alert_key asc.
 * @param {{ priority: string, severity: string, alert_key: string }} a
 * @param {{ priority: string, severity: string, alert_key: string }} b
 */
export function compareAlertsForOrdering(a, b) {
  const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const pr =
    (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
  if (pr !== 0) return pr;
  const sr =
    (EXECUTIVE_ALERT_SEVERITY_RANK[b.severity] ?? 0) -
    (EXECUTIVE_ALERT_SEVERITY_RANK[a.severity] ?? 0);
  if (sr !== 0) return sr;
  return a.alert_key.localeCompare(b.alert_key);
}

export {
  EXECUTIVE_ALERT_SEVERITIES,
  EXECUTIVE_ALERT_URGENCIES,
  EXECUTIVE_ALERT_PRIORITIES,
  EXECUTIVE_ALERT_STATUSES,
};
