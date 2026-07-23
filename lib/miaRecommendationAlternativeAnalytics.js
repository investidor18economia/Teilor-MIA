/**
 * PATCH 9.4 — Runner-up / alternative analytics derived layer (SQL + helpers).
 * No new event emission — reuses 9.1, 9.2, 9.3.
 */

import { shouldEnterCommercialSearchAnalyticsDomain } from "./miaCommercialSearchClassifier.js";

export {
  MIA_RECOMMENDATION_ALTERNATIVE_CATALOG_VERSION,
  MIA_RUNNER_UP_SOURCES,
  MIA_SCORE_GAP_BUCKETS,
  MIA_RUNNER_UP_COMPETITIVENESS,
  MIA_ALTERNATIVE_MATCH_METHODS,
  MIA_ALTERNATIVE_MATCH_CONFIDENCE,
  MIA_ALTERNATIVE_RELATIONSHIPS,
  MIA_ALTERNATIVE_OUTCOMES,
  MIA_ALTERNATIVE_RECOVERY_CLASSES,
  MIA_ALTERNATIVE_DIVERSITY_CLASSES,
  MIA_ALTERNATIVE_EVIDENCE_LEVELS,
} from "./miaRecommendationAlternativeCatalog.js";

export {
  classifyScoreGapBucket,
  classifyRunnerUpCompetitiveness,
  resolveRunnerUpDisplayState,
  matchAlternativeToRunnerUp,
  classifyWinnerRunnerUpDiversity,
  buildRunnerUpAlternativeDecisionEnrichment,
  classifyAlternativeRecoveryOutcome,
  classifyRunnerUpBecameWinner,
} from "./miaRecommendationAlternativeClassifier.js";

export {
  resolveWinnerAndRunnerUpRanks,
} from "./miaRecommendationDecisionClassifier.js";

export {
  decisionProductsMatchFamily,
  hashSafeFamilyKey,
  resolveSafeProductFamilyKey,
} from "./miaRecommendationDecisionIdentity.js";

/**
 * @param {{ commercialPermission?: string, interactionMode?: string }} [input]
 */
export function isAlternativeAnalyticsDomainAllowed(input = {}) {
  return shouldEnterCommercialSearchAnalyticsDomain({
    commercialPermission: input.commercialPermission,
    interactionMode: input.interactionMode,
  });
}
