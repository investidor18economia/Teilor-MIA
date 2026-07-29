/**
 * PATCH C.6 — Executive Recommendation rules (C.6.0).
 * Priority, confidence, eligibility — deterministic only.
 * No SQL · no fetch · no LLM.
 */

import {
  EXECUTIVE_RECOMMENDATION_PRIORITIES,
  EXECUTIVE_RECOMMENDATION_PRIORITY_RANK,
  EXECUTIVE_RECOMMENDATION_CONFIDENCE_RANK,
  EXECUTIVE_RECOMMENDATION_CONFIDENCE_GATES,
  EXECUTIVE_RECOMMENDATION_SPECULATION_BLOCKLIST,
  EXECUTIVE_RECOMMENDATION_CAUSALITY_BLOCKLIST,
  EXECUTIVE_ALERT_PRIORITY_TO_RECOMMENDATION,
} from "./miaExecutiveRecommendationCatalog.js";

/**
 * @param {string} level
 * @param {string} minLevel
 */
export function meetsRecommendationMinConfidence(level, minLevel) {
  return (
    (EXECUTIVE_RECOMMENDATION_CONFIDENCE_RANK[level] ?? 0) >=
    (EXECUTIVE_RECOMMENDATION_CONFIDENCE_RANK[minLevel] ?? 0)
  );
}

/**
 * @param {string} priority
 */
export function priorityConfidenceGate(priority) {
  switch (priority) {
    case EXECUTIVE_RECOMMENDATION_PRIORITIES.P0:
      return EXECUTIVE_RECOMMENDATION_CONFIDENCE_GATES.p0_min;
    case EXECUTIVE_RECOMMENDATION_PRIORITIES.P1:
      return EXECUTIVE_RECOMMENDATION_CONFIDENCE_GATES.p1_min;
    case EXECUTIVE_RECOMMENDATION_PRIORITIES.P2:
      return EXECUTIVE_RECOMMENDATION_CONFIDENCE_GATES.p2_min;
    default:
      return EXECUTIVE_RECOMMENDATION_CONFIDENCE_GATES.p3_min;
  }
}

/**
 * @param {string} basePriority
 * @param {string|null} alertPriority
 * @param {number} sourceCount
 */
export function calculateRecommendationPriority(basePriority, alertPriority = null, sourceCount = 1) {
  let priority = basePriority;

  if (alertPriority && EXECUTIVE_ALERT_PRIORITY_TO_RECOMMENDATION[alertPriority]) {
    const alertRec = EXECUTIVE_ALERT_PRIORITY_TO_RECOMMENDATION[alertPriority];
    const baseRank = EXECUTIVE_RECOMMENDATION_PRIORITY_RANK[priority] ?? 99;
    const alertRank = EXECUTIVE_RECOMMENDATION_PRIORITY_RANK[alertRec] ?? 99;
    if (alertRank < baseRank) priority = alertRec;
  }

  if (sourceCount >= 2 && priority === EXECUTIVE_RECOMMENDATION_PRIORITIES.P2) {
    priority = EXECUTIVE_RECOMMENDATION_PRIORITIES.P1;
  }

  return priority;
}

/**
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence[]} confidences
 */
export function consolidateRecommendationConfidence(confidences) {
  if (!confidences.length) {
    return {
      level: "insufficient_data",
      factors: [],
      limitations: ["Sem fontes de confiança."],
      modules_available: null,
      modules_total: null,
    };
  }

  const levels = confidences.map((c) => c.level);
  const minRank = Math.min(...levels.map((l) => EXECUTIVE_RECOMMENDATION_CONFIDENCE_RANK[l] ?? 0));
  let level = "insufficient_data";
  if (minRank >= 3) level = "high";
  else if (minRank >= 2) level = "moderate";
  else if (minRank >= 1) level = "low";

  const factors = [...new Set(confidences.flatMap((c) => c.factors))];
  const limitations = [...new Set(confidences.flatMap((c) => c.limitations))];
  const modules_available = confidences.find((c) => c.modules_available != null)?.modules_available ?? null;
  const modules_total = confidences.find((c) => c.modules_total != null)?.modules_total ?? null;

  return { level, factors, limitations, modules_available, modules_total };
}

/**
 * @param {string} priority
 * @param {import("./miaExecutiveAnalysisContracts.js").ExecutiveConfidence} confidence
 */
export function passesRecommendationConfidenceGate(priority, confidence) {
  return meetsRecommendationMinConfidence(confidence.level, priorityConfidenceGate(priority));
}

/**
 * @param {string} text
 */
export function containsSpeculativeLanguage(text) {
  if (!text) return false;
  return EXECUTIVE_RECOMMENDATION_SPECULATION_BLOCKLIST.some((re) => re.test(text));
}

/**
 * @param {string} text
 */
export function containsRecommendationCausality(text) {
  if (!text) return false;
  return EXECUTIVE_RECOMMENDATION_CAUSALITY_BLOCKLIST.some((re) => re.test(text));
}

/**
 * @param {{ priority: string, recommendation_key: string }} a
 * @param {{ priority: string, recommendation_key: string }} b
 */
export function compareRecommendationsForOrdering(a, b) {
  const pr =
    (EXECUTIVE_RECOMMENDATION_PRIORITY_RANK[a.priority] ?? 99) -
    (EXECUTIVE_RECOMMENDATION_PRIORITY_RANK[b.priority] ?? 99);
  if (pr !== 0) return pr;
  return a.recommendation_key.localeCompare(b.recommendation_key);
}

export { EXECUTIVE_RECOMMENDATION_PRIORITIES };
