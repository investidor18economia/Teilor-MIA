/**
 * PATCH 9.4 — Runner-up / alternative classification (observational, no ranking mutation).
 */

import {
  MIA_ALTERNATIVE_DIVERSITY_CLASSES,
  MIA_ALTERNATIVE_MATCH_CONFIDENCE,
  MIA_ALTERNATIVE_MATCH_METHODS,
  MIA_ALTERNATIVE_RECOVERY_CLASSES,
  MIA_RUNNER_UP_COMPETITIVENESS,
  MIA_RUNNER_UP_SOURCES,
  MIA_SCORE_GAP_BUCKETS,
  MIA_SCORE_GAP_CLOSE_MAX,
  MIA_SCORE_GAP_MODERATE_MAX,
  MIA_SCORE_GAP_VERY_CLOSE_MAX,
} from "./miaRecommendationAlternativeCatalog.js";
import {
  decisionProductsMatchFamily,
  extractDecisionProviderId,
  hashSafeFamilyKey,
  resolveSafeProductFamilyKey,
} from "./miaRecommendationDecisionIdentity.js";
import { resolveWinnerAndRunnerUpRanks } from "./miaRecommendationDecisionClassifier.js";

/**
 * @param {number|null|undefined} scoreGap
 */
export function classifyScoreGapBucket(scoreGap = null) {
  if (scoreGap == null || !Number.isFinite(scoreGap)) return MIA_SCORE_GAP_BUCKETS.UNKNOWN;
  if (scoreGap <= 0) return MIA_SCORE_GAP_BUCKETS.TIE;
  if (scoreGap <= MIA_SCORE_GAP_VERY_CLOSE_MAX) return MIA_SCORE_GAP_BUCKETS.VERY_CLOSE;
  if (scoreGap <= MIA_SCORE_GAP_CLOSE_MAX) return MIA_SCORE_GAP_BUCKETS.CLOSE;
  if (scoreGap <= MIA_SCORE_GAP_MODERATE_MAX) return MIA_SCORE_GAP_BUCKETS.MODERATE;
  return MIA_SCORE_GAP_BUCKETS.WIDE;
}

/**
 * @param {number|null|undefined} scoreGap
 * @param {boolean} [runnerUpPresent]
 * @param {boolean} [scoresAvailable]
 */
export function classifyRunnerUpCompetitiveness(
  scoreGap = null,
  runnerUpPresent = false,
  scoresAvailable = false
) {
  if (!runnerUpPresent) return MIA_RUNNER_UP_COMPETITIVENESS.UNKNOWN;
  if (!scoresAvailable || scoreGap == null || !Number.isFinite(scoreGap)) {
    return MIA_RUNNER_UP_COMPETITIVENESS.NOT_COMPARABLE;
  }
  if (scoreGap <= 0) return MIA_RUNNER_UP_COMPETITIVENESS.EQUIVALENT;
  if (scoreGap <= MIA_SCORE_GAP_VERY_CLOSE_MAX) return MIA_RUNNER_UP_COMPETITIVENESS.HIGHLY_COMPETITIVE;
  if (scoreGap <= MIA_SCORE_GAP_CLOSE_MAX) return MIA_RUNNER_UP_COMPETITIVENESS.COMPETITIVE;
  return MIA_RUNNER_UP_COMPETITIVENESS.DISTANT;
}

/**
 * @param {Array<Record<string, unknown>>} displayProducts
 * @param {Record<string, unknown>|null} runnerUpProduct
 */
export function resolveRunnerUpDisplayState(displayProducts = [], runnerUpProduct = null) {
  if (!runnerUpProduct) {
    return {
      runner_up_in_display_products: false,
      runner_up_in_delivery: false,
      runner_up_display_position: null,
      display_second_card_is_cognitive_runner_up: false,
    };
  }

  let displayPosition = null;
  for (let index = 0; index < displayProducts.length; index += 1) {
    if (decisionProductsMatchFamily(displayProducts[index], runnerUpProduct)) {
      displayPosition = index + 1;
      break;
    }
  }

  const secondCard = displayProducts[1] || null;
  const displaySecondIsRunnerUp =
    !!secondCard && decisionProductsMatchFamily(secondCard, runnerUpProduct);

  return {
    runner_up_in_display_products: displayPosition != null,
    runner_up_in_delivery: displayPosition != null,
    runner_up_display_position: displayPosition,
    display_second_card_is_cognitive_runner_up: displaySecondIsRunnerUp,
  };
}

/**
 * @param {string|null|undefined} alternativeFamilyHash
 * @param {string|null|undefined} runnerUpFamilyHash
 * @param {string|null|undefined} winnerFamilyHash
 */
export function matchAlternativeToRunnerUp(
  alternativeFamilyHash = null,
  runnerUpFamilyHash = null,
  winnerFamilyHash = null
) {
  if (!alternativeFamilyHash || !runnerUpFamilyHash) {
    return {
      match_method: MIA_ALTERNATIVE_MATCH_METHODS.UNRESOLVED,
      match_confidence: MIA_ALTERNATIVE_MATCH_CONFIDENCE.UNRESOLVED,
      is_runner_up_match: false,
    };
  }

  if (alternativeFamilyHash === runnerUpFamilyHash) {
    return {
      match_method: MIA_ALTERNATIVE_MATCH_METHODS.EXACT_FAMILY_MATCH,
      match_confidence: MIA_ALTERNATIVE_MATCH_CONFIDENCE.HIGH,
      is_runner_up_match: true,
    };
  }

  if (winnerFamilyHash && alternativeFamilyHash === winnerFamilyHash) {
    return {
      match_method: MIA_ALTERNATIVE_MATCH_METHODS.NO_MATCH,
      match_confidence: MIA_ALTERNATIVE_MATCH_CONFIDENCE.HIGH,
      is_runner_up_match: false,
    };
  }

  return {
    match_method: MIA_ALTERNATIVE_MATCH_METHODS.NO_MATCH,
    match_confidence: MIA_ALTERNATIVE_MATCH_CONFIDENCE.MEDIUM,
    is_runner_up_match: false,
  };
}

/**
 * @param {Record<string, unknown>|null} winner
 * @param {Record<string, unknown>|null} runnerUp
 */
export function classifyWinnerRunnerUpDiversity(winner = null, runnerUp = null) {
  if (!winner || !runnerUp) {
    return {
      same_family: null,
      same_brand: null,
      same_category: null,
      same_provider: null,
      alternative_diversity_class: MIA_ALTERNATIVE_DIVERSITY_CLASSES.UNKNOWN,
    };
  }

  const winnerFamily = resolveSafeProductFamilyKey(winner);
  const runnerFamily = resolveSafeProductFamilyKey(runnerUp);
  const sameFamily = !!winnerFamily && winnerFamily === runnerFamily;

  const winnerBrand = String(winner.brand || winner.metadata?.brand || "").trim().toLowerCase();
  const runnerBrand = String(runnerUp.brand || runnerUp.metadata?.brand || "").trim().toLowerCase();
  const sameBrand = !!winnerBrand && winnerBrand === runnerBrand;

  const winnerCategory = String(winner.category || winner.metadata?.category || "").trim().toLowerCase();
  const runnerCategory = String(runnerUp.category || runnerUp.metadata?.category || "")
    .trim()
    .toLowerCase();
  const sameCategory = !!winnerCategory && winnerCategory === runnerCategory;

  const winnerProvider = extractDecisionProviderId(winner);
  const runnerProvider = extractDecisionProviderId(runnerUp);
  const sameProvider = !!winnerProvider && winnerProvider === runnerProvider;

  let diversityClass = MIA_ALTERNATIVE_DIVERSITY_CLASSES.UNKNOWN;
  if (sameFamily) diversityClass = MIA_ALTERNATIVE_DIVERSITY_CLASSES.SAME_FAMILY_VARIANT;
  else if (sameBrand) diversityClass = MIA_ALTERNATIVE_DIVERSITY_CLASSES.SAME_BRAND_DIFFERENT_FAMILY;
  else if (sameCategory) diversityClass = MIA_ALTERNATIVE_DIVERSITY_CLASSES.DIFFERENT_BRAND_SAME_CATEGORY;
  else if (!sameBrand && !sameCategory) diversityClass = MIA_ALTERNATIVE_DIVERSITY_CLASSES.DIFFERENT_FEATURE_PROFILE;

  return {
    same_family: sameFamily,
    same_brand: sameBrand || null,
    same_category: sameCategory || null,
    same_provider: sameProvider || null,
    alternative_diversity_class: diversityClass,
  };
}

/**
 * @param {object} input
 */
export function buildRunnerUpAlternativeDecisionEnrichment(input = {}) {
  const winner = input.selectedBestProduct || null;
  const rankedProducts = Array.isArray(input.rankedProducts) ? input.rankedProducts : [];
  const displayProducts = Array.isArray(input.displayProducts) ? input.displayProducts : [];

  const rankInfo = resolveWinnerAndRunnerUpRanks(rankedProducts, winner);
  const runnerUp = rankInfo.runnerUpProduct;
  const runnerUpFamilyKey = runnerUp ? resolveSafeProductFamilyKey(runnerUp) : null;
  const runnerUpFamilyHash = runnerUpFamilyKey ? hashSafeFamilyKey(runnerUpFamilyKey) : null;

  const displayState = resolveRunnerUpDisplayState(displayProducts, runnerUp);
  const scoreGap = input.scoreGap ?? null;
  const scoresAvailable =
    input.scoresAvailable ??
    (input.winnerScore != null &&
      input.runnerUpScore != null &&
      Number.isFinite(input.winnerScore) &&
      Number.isFinite(input.runnerUpScore));

  const diversity = classifyWinnerRunnerUpDiversity(winner, runnerUp);

  return {
    runner_up_source: rankInfo.runnerUpPresent
      ? MIA_RUNNER_UP_SOURCES.RANKED_PRODUCTS_SCAN
      : MIA_RUNNER_UP_SOURCES.UNAVAILABLE,
    runner_up_valid: rankInfo.runnerUpPresent && !!runnerUpFamilyHash,
    runner_up_identity_available: !!runnerUpFamilyHash,
    runner_up_product_family: runnerUpFamilyHash,
    runner_up_provider: runnerUp ? extractDecisionProviderId(runnerUp) : null,
    runner_up_in_ranking: rankInfo.runnerUpPresent,
    runner_up_in_display_products: displayState.runner_up_in_display_products,
    runner_up_in_delivery: displayState.runner_up_in_delivery,
    runner_up_display_position: displayState.runner_up_display_position,
    display_second_card_is_cognitive_runner_up: displayState.display_second_card_is_cognitive_runner_up,
    score_gap_bucket: classifyScoreGapBucket(scoreGap),
    runner_up_competitiveness: classifyRunnerUpCompetitiveness(
      scoreGap,
      rankInfo.runnerUpPresent,
      scoresAvailable
    ),
    ...diversity,
  };
}

/**
 * @param {object} input
 */
export function classifyAlternativeRecoveryOutcome(input = {}) {
  const rejectionExplicit = input.rejectionExplicit === true || input.refinementPresent === true;
  if (!rejectionExplicit) return MIA_ALTERNATIVE_RECOVERY_CLASSES.UNRESOLVED;

  if (input.newSearchRecovery === true) return MIA_ALTERNATIVE_RECOVERY_CLASSES.RECOVERED_BY_NEW_SEARCH;
  if (input.acceptanceOnRunnerUp === true) return MIA_ALTERNATIVE_RECOVERY_CLASSES.RECOVERED_BY_RUNNER_UP;
  if (input.acceptanceOnAlternative === true) {
    return MIA_ALTERNATIVE_RECOVERY_CLASSES.RECOVERED_BY_OTHER_ALTERNATIVE;
  }
  if (input.replacementObserved === true) return MIA_ALTERNATIVE_RECOVERY_CLASSES.NOT_RECOVERED;
  return MIA_ALTERNATIVE_RECOVERY_CLASSES.UNRESOLVED;
}

/**
 * @param {string|null|undefined} priorRunnerUpFamily
 * @param {string|null|undefined} newWinnerFamily
 */
export function classifyRunnerUpBecameWinner(priorRunnerUpFamily = null, newWinnerFamily = null) {
  const match = matchAlternativeToRunnerUp(newWinnerFamily, priorRunnerUpFamily, null);
  return {
    runner_up_became_winner: match.is_runner_up_match === true,
    match_method: match.match_method,
    match_confidence: match.match_confidence,
  };
}
