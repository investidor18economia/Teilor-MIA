/**
 * PATCH 10.5 — Derive user value outcome from observational evidence only.
 *
 * Score formula (documented in SAVINGS_OUTCOMES_USER_VALUE_ANALYTICS.md):
 * - Base: 40 (neutral — value not yet verified)
 * - Component contributions weighted by MIA_VALUE_COMPONENT_WEIGHTS
 * - Clamped [0, 100]
 * - verified_value_amount always null unless transactional evidence exists
 */

import {
  MIA_TIME_SAVED_BUCKET,
  MIA_USER_VALUE_SCORE_MAX,
  MIA_USER_VALUE_SCORE_MIN,
  MIA_USER_VALUE_SCORE_NEUTRAL_BASE,
  MIA_VALUE_COMPONENT,
  MIA_VALUE_COMPONENT_WEIGHTS,
  MIA_VALUE_CONFIDENCE,
  MIA_VALUE_EVIDENCE,
  MIA_VALUE_LAYER,
  MIA_VALUE_OUTCOME_STATUS,
  MIA_VALUE_TYPE,
  MIA_VERIFIED_VALUE_UNAVAILABLE,
} from "./miaUserValueOutcomeCatalog.js";
import { MIA_SAVINGS_TYPE } from "./miaSavingsEstimationCatalog.js";
import {
  MIA_PRICE_CONFIDENCE,
  MIA_PRICE_QUALITY,
} from "./miaPriceIntelligenceCatalog.js";
import { buildAntiRegretFoundationMetadata } from "./miaAntiRegretFoundationClassifier.js";
import { buildPriceIntelligenceFromOfferSetMetadata } from "./miaPriceIntelligenceClassifier.js";
import { buildWinnerVsMinimumEstimation } from "./miaSavingsEstimationClassifier.js";

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function roundMoney(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function clampScore(value) {
  if (value == null || !Number.isFinite(value)) return MIA_USER_VALUE_SCORE_NEUTRAL_BASE;
  return Math.max(MIA_USER_VALUE_SCORE_MIN, Math.min(MIA_USER_VALUE_SCORE_MAX, Math.round(value)));
}

/**
 * @param {Record<string, unknown>} decision
 * @param {Record<string, unknown>} offerSet
 */
export function resolveTimeSavedBucket(decision = {}, offerSet = {}) {
  const candidates = num(decision.candidate_count) ?? num(offerSet.raw_offers_count) ?? 0;
  const delivered = num(offerSet.delivered_offers_count) ?? 0;
  const turns = num(decision.conversation_turn_count) ?? 0;
  const comparisons = delivered > 1 ? delivered - 1 : 0;

  const depthScore = candidates + comparisons * 2 + turns;
  if (depthScore === 0) return MIA_TIME_SAVED_BUCKET.UNKNOWN;
  if (depthScore >= 12) return MIA_TIME_SAVED_BUCKET.HIGH;
  if (depthScore >= 7) return MIA_TIME_SAVED_BUCKET.MEDIUM;
  if (depthScore >= 3) return MIA_TIME_SAVED_BUCKET.LOW;
  return MIA_TIME_SAVED_BUCKET.VERY_LOW;
}

/**
 * @param {Record<string, unknown>} savings
 * @param {object[]} [acceptanceSignals]
 * @param {object[]} [rejectionSignals]
 * @param {string|null} [alertStage]
 */
export function resolveValueAmounts(savings = {}, acceptanceSignals = [], rejectionSignals = [], alertStage = null) {
  let potentialAmount = null;
  const savingsType = savings.savings_type ?? null;
  const savingsAmount = num(savings.savings_amount);

  if (savingsType === MIA_SAVINGS_TYPE.OBSERVED && savingsAmount != null && savingsAmount > 0) {
    potentialAmount = roundMoney(savingsAmount);
  } else if (savingsType === MIA_SAVINGS_TYPE.UNVERIFIED && savingsAmount != null && savingsAmount > 0) {
    potentialAmount = roundMoney(savingsAmount);
  }

  let observedAmount = null;
  if (acceptanceSignals.length > 0 || alertStage === "TARGET_REACHED") {
    observedAmount = potentialAmount;
  }

  return {
    potential_value_amount: potentialAmount,
    observed_value_amount: observedAmount,
    verified_value_amount: null,
    verified_value_status: MIA_VERIFIED_VALUE_UNAVAILABLE,
  };
}

/**
 * @param {Record<string, unknown>} savings
 * @param {object[]} acceptanceSignals
 * @param {string|null} alertStage
 */
export function resolveValueType(savings = {}, acceptanceSignals = [], alertStage = null) {
  if (alertStage === "TARGET_REACHED") return MIA_VALUE_TYPE.ALERT_SUCCESS;
  if (alertStage === "ACTIVE" || alertStage === "REQUESTED") return MIA_VALUE_TYPE.PRICE_DROP;

  const hasFavorite = acceptanceSignals.some((s) =>
    String(s.signal_type || s.source_event_name || "").includes("FAVORIT")
  );
  const hasClick = acceptanceSignals.some((s) =>
    String(s.signal_type || s.source_event_name || "").includes("CLICK")
  );
  if (hasFavorite || hasClick) return MIA_VALUE_TYPE.PRODUCT_DISCOVERY;

  const savingsType = savings.savings_type ?? null;
  if (savingsType === MIA_SAVINGS_TYPE.OBSERVED) return MIA_VALUE_TYPE.PRICE_OPPORTUNITY;
  if (acceptanceSignals.length > 0) return MIA_VALUE_TYPE.DECISION_SUPPORT;

  return MIA_VALUE_TYPE.UNKNOWN;
}

/**
 * @param {string|null} observedAmount
 * @param {object[]} acceptanceSignals
 * @param {string|null} alertStage
 */
export function resolveOutcomeStatus(observedAmount, acceptanceSignals = [], alertStage = null) {
  if (alertStage === "TARGET_REACHED" || acceptanceSignals.length > 0 || observedAmount != null) {
    return MIA_VALUE_OUTCOME_STATUS.OBSERVED;
  }
  return MIA_VALUE_OUTCOME_STATUS.POTENTIAL;
}

/**
 * @param {Record<string, unknown>} priceIntel
 * @param {Record<string, unknown>} savings
 * @param {Record<string, unknown>} decision
 * @param {Record<string, unknown>} antiRegretMeta
 * @param {{ acceptanceCount?: number, alertStage?: string|null }} [post]
 */
export function collectValueEvidence(priceIntel = {}, savings = {}, decision = {}, antiRegretMeta = {}, post = {}) {
  /** @type {string[]} */
  const evidence = [];

  if (priceIntel.price_quality || priceIntel.price_confidence) {
    evidence.push(MIA_VALUE_EVIDENCE.PRICE_INTELLIGENCE);
  }
  if (savings.savings_type && savings.savings_type !== MIA_SAVINGS_TYPE.UNKNOWN) {
    evidence.push(MIA_VALUE_EVIDENCE.SAVINGS_ESTIMATION);
  }
  if (bool(decision.decision_valid) === true || bool(decision.winner_present) === true) {
    evidence.push(MIA_VALUE_EVIDENCE.DECISION_CONTEXT);
  }
  if (bool(decision.runner_up_present) === true) {
    evidence.push(MIA_VALUE_EVIDENCE.RUNNER_UP);
  }
  if (antiRegretMeta.anti_regret_score != null) {
    evidence.push(MIA_VALUE_EVIDENCE.ANTI_REGRET);
  }
  if ((post.acceptanceCount ?? 0) > 0) {
    evidence.push(MIA_VALUE_EVIDENCE.ACCEPTANCE_SIGNAL);
  }
  if (post.alertStage === "TARGET_REACHED") {
    evidence.push(MIA_VALUE_EVIDENCE.ALERT_TARGET_REACHED);
  } else if (post.alertStage) {
    evidence.push(MIA_VALUE_EVIDENCE.ALERT_LIFECYCLE);
  }

  return [...new Set(evidence)];
}

/**
 * @param {Record<string, unknown>} priceIntel
 * @param {Record<string, unknown>} savings
 * @param {Record<string, unknown>} decision
 * @param {Record<string, unknown>} antiRegretMeta
 * @param {{ acceptanceCount?: number, alertStage?: string|null }} [post]
 */
export function computeValueComponentScores(priceIntel = {}, savings = {}, decision = {}, antiRegretMeta = {}, post = {}) {
  const components = {};

  const priceQuality = priceIntel.price_quality ?? null;
  if (priceQuality === MIA_PRICE_QUALITY.HIGH) components[MIA_VALUE_COMPONENT.PRICE] = 1;
  else if (priceQuality === MIA_PRICE_QUALITY.MEDIUM) components[MIA_VALUE_COMPONENT.PRICE] = 0.6;
  else if (priceQuality === MIA_PRICE_QUALITY.LOW) components[MIA_VALUE_COMPONENT.PRICE] = 0.2;

  const savingsType = savings.savings_type ?? null;
  const savingsAmount = num(savings.savings_amount) ?? 0;
  if (savingsType === MIA_SAVINGS_TYPE.OBSERVED && savingsAmount > 0) {
    components[MIA_VALUE_COMPONENT.SAVINGS] = Math.min(1, savingsAmount / 200);
  } else if (savingsType === MIA_SAVINGS_TYPE.UNVERIFIED && savingsAmount > 0) {
    components[MIA_VALUE_COMPONENT.SAVINGS] = Math.min(0.5, savingsAmount / 300);
  }

  if (bool(decision.decision_valid) === true) {
    components[MIA_VALUE_COMPONENT.DECISION] = 0.8;
  } else if (bool(decision.winner_present) === true) {
    components[MIA_VALUE_COMPONENT.DECISION] = 0.4;
  }

  const priceConfidence = priceIntel.price_confidence ?? null;
  if (priceConfidence === MIA_PRICE_CONFIDENCE.HIGH) {
    components[MIA_VALUE_COMPONENT.CONFIDENCE] = 1;
  } else if (priceConfidence === MIA_PRICE_CONFIDENCE.MEDIUM) {
    components[MIA_VALUE_COMPONENT.CONFIDENCE] = 0.6;
  } else if (priceConfidence === MIA_PRICE_CONFIDENCE.LOW) {
    components[MIA_VALUE_COMPONENT.CONFIDENCE] = 0.3;
  }

  const antiScore = num(antiRegretMeta.anti_regret_score);
  if (antiScore != null) {
    components[MIA_VALUE_COMPONENT.ANTI_REGRET] = antiScore / 100;
  }

  if (post.alertStage) {
    components[MIA_VALUE_COMPONENT.ALERTS] = post.alertStage === "TARGET_REACHED" ? 1 : 0.5;
  }
  if ((post.acceptanceCount ?? 0) > 0) {
    components[MIA_VALUE_COMPONENT.FAVORITES] = 0.5;
    components[MIA_VALUE_COMPONENT.OFFER_CLICKS] = 0.4;
  }

  return components;
}

/**
 * @param {Record<string, number>} components
 */
export function computeUserValueScoreFromComponents(components = {}) {
  let score = MIA_USER_VALUE_SCORE_NEUTRAL_BASE;
  for (const [component, factor] of Object.entries(components)) {
    const weight = MIA_VALUE_COMPONENT_WEIGHTS[component] ?? 0;
    if (weight <= 0 || factor == null) continue;
    score += weight * Math.max(0, Math.min(1, factor));
  }
  return clampScore(score);
}

/**
 * @param {string[]} evidence
 * @param {Record<string, number>} components
 * @param {string} outcomeStatus
 */
export function resolveValueConfidence(evidence = [], components = {}, outcomeStatus = "") {
  const uniqueEvidence = evidence.length;
  const activeComponents = Object.keys(components).length;

  if (uniqueEvidence === 0) return MIA_VALUE_CONFIDENCE.UNKNOWN;
  if (outcomeStatus === MIA_VALUE_OUTCOME_STATUS.VERIFIED) return MIA_VALUE_CONFIDENCE.HIGH;
  if (uniqueEvidence >= 4 && activeComponents >= 3) return MIA_VALUE_CONFIDENCE.HIGH;
  if (uniqueEvidence >= 2 && activeComponents >= 2) return MIA_VALUE_CONFIDENCE.MEDIUM;
  return MIA_VALUE_CONFIDENCE.LOW;
}

/**
 * @param {string[]} evidence
 */
export function resolvePrimaryValueSource(evidence = []) {
  if (!evidence.length) return MIA_VALUE_EVIDENCE.UNKNOWN;
  const priority = [
    MIA_VALUE_EVIDENCE.SAVINGS_ESTIMATION,
    MIA_VALUE_EVIDENCE.PRICE_INTELLIGENCE,
    MIA_VALUE_EVIDENCE.ALERT_TARGET_REACHED,
    MIA_VALUE_EVIDENCE.ACCEPTANCE_SIGNAL,
    MIA_VALUE_EVIDENCE.DECISION_CONTEXT,
    MIA_VALUE_EVIDENCE.ANTI_REGRET,
  ];
  for (const item of priority) {
    if (evidence.includes(item)) return item;
  }
  return evidence[0];
}

/**
 * @param {{
 *   requestId?: string|null,
 *   offerSetMetadata?: Record<string, unknown>,
 *   decisionMetadata?: Record<string, unknown>|null,
 *   priceIntelligenceMetadata?: Record<string, unknown>|null,
 *   savingsMetadata?: Record<string, unknown>|null,
 *   antiRegretMetadata?: Record<string, unknown>|null,
 *   acceptanceSignals?: object[],
 *   rejectionSignals?: object[],
 *   alertStage?: string|null,
 *   source?: string|null,
 * }} input
 */
export function buildUserValueOutcomeMetadata(input = {}) {
  const requestId = input.requestId ?? null;
  const decisionRequestId = input.decisionRequestId ?? requestId ?? null;
  const offerSet = input.offerSetMetadata || {};
  const decision = input.decisionMetadata || {};
  const priceIntel =
    input.priceIntelligenceMetadata ||
    buildPriceIntelligenceFromOfferSetMetadata(offerSet, { requestId, decisionRequestId });
  const savings =
    input.savingsMetadata ||
    buildWinnerVsMinimumEstimation(offerSet, priceIntel, { requestId, decisionRequestId });
  const antiRegret =
    input.antiRegretMetadata ||
    buildAntiRegretFoundationMetadata({
      requestId,
      offerSetMetadata: offerSet,
      decisionMetadata: decision,
      priceIntelligenceMetadata: priceIntel,
      savingsMetadata: savings,
      acceptanceSignals: input.acceptanceSignals,
      rejectionSignals: input.rejectionSignals,
      alertStage: input.alertStage ?? null,
    });

  const acceptanceSignals = Array.isArray(input.acceptanceSignals) ? input.acceptanceSignals : [];
  const rejectionSignals = Array.isArray(input.rejectionSignals) ? input.rejectionSignals : [];
  const alertStage = input.alertStage ?? null;

  const amounts = resolveValueAmounts(savings, acceptanceSignals, rejectionSignals, alertStage);
  const valueType = resolveValueType(savings, acceptanceSignals, alertStage);
  const outcomeStatus = resolveOutcomeStatus(amounts.observed_value_amount, acceptanceSignals, alertStage);
  const timeSavedBucket = resolveTimeSavedBucket(decision, offerSet);

  const post = {
    acceptanceCount: acceptanceSignals.length,
    alertStage,
  };
  const evidence = collectValueEvidence(priceIntel, savings, decision, antiRegret, post);
  const components = computeValueComponentScores(priceIntel, savings, decision, antiRegret, post);
  const userValueScore = computeUserValueScoreFromComponents(components);
  const valueConfidence = resolveValueConfidence(evidence, components, outcomeStatus);

  const valueLayer =
    outcomeStatus === MIA_VALUE_OUTCOME_STATUS.OBSERVED
      ? MIA_VALUE_LAYER.OBSERVED_VALUE
      : outcomeStatus === MIA_VALUE_OUTCOME_STATUS.POTENTIAL
        ? MIA_VALUE_LAYER.POTENTIAL_VALUE
        : MIA_VALUE_LAYER.UNKNOWN_VALUE;

  return {
    request_id: requestId,
    decision_request_id: decisionRequestId,
    event_version: "10.5.0",
    source: input.source || "offer_set_derived",
    source_event_version: "8.3.0",
    offer_set_event_version: "8.3.0",
    decision_event_version: "9.1.0",
    price_intelligence_event_version: "10.1.0",
    savings_estimation_event_version: "10.2.0",
    anti_regret_event_version: "10.4.0",
    user_value_score: userValueScore,
    value_status: outcomeStatus,
    value_layer: valueLayer,
    value_type: valueType,
    value_confidence: valueConfidence,
    primary_value_source: resolvePrimaryValueSource(evidence),
    primary_evidence: evidence[0] ?? MIA_VALUE_EVIDENCE.UNKNOWN,
    supporting_evidence_count: evidence.length,
    value_evidence: evidence.slice(0, 8),
    value_component_count: Object.keys(components).length,
    potential_value_amount: amounts.potential_value_amount,
    observed_value_amount: amounts.observed_value_amount,
    verified_value_amount: null,
    verified_value_status: MIA_VERIFIED_VALUE_UNAVAILABLE,
    time_saved_bucket: timeSavedBucket,
    price_quality: priceIntel.price_quality ?? null,
    price_confidence: priceIntel.price_confidence ?? null,
    savings_type: savings.savings_type ?? null,
    anti_regret_score: antiRegret.anti_regret_score ?? null,
    search_path: offerSet.search_path ?? null,
    winner_provider_id: offerSet.winner_provider_id ?? null,
    purchase_confirmed: false,
    roi_assumed: false,
    satisfaction_assumed: false,
    value_verified: false,
    outcome_valid:
      !!requestId && (bool(offerSet.winner_present) === true || evidence.length > 0),
    occurred_at: new Date().toISOString(),
  };
}
