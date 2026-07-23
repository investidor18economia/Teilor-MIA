/**
 * PATCH 8.1 — Commercial Search Analytics classifiers (observational only).
 */

import { COMMERCIAL_PERMISSION } from "./miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";
import {
  getCommercialRuntimeMode,
  isCommercialRuntimeShadow,
  isCommercialRuntimeControlled,
} from "./productSourceAdapter/commercialRuntimeMode.js";
import {
  areSanitizedCommercialQueriesEqual,
  sanitizeCommercialSearchQueryText,
} from "./miaCommercialSearchQuerySanitizer.js";
import {
  MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES,
  MIA_COMMERCIAL_SEARCH_GATE_STATUSES,
  MIA_COMMERCIAL_SEARCH_INTENT_TYPES,
  MIA_COMMERCIAL_SEARCH_PATHS,
  MIA_COMMERCIAL_SEARCH_QUERY_CHANGE_TYPES,
  MIA_COMMERCIAL_SEARCH_QUERY_EXTRACTION_STATUSES,
  MIA_COMMERCIAL_SEARCH_RESULT_STATUSES,
  MIA_COMMERCIAL_SEARCH_RUNTIME_MODES,
  MIA_COMMERCIAL_SEARCH_TERMINATION_STAGES,
} from "./miaCommercialSearchCatalog.js";

/**
 * @param {{ commercialPermission?: string|null, interactionMode?: string|null }} input
 */
export function shouldEnterCommercialSearchAnalyticsDomain(input = {}) {
  const permission = input.commercialPermission || null;
  if (permission === COMMERCIAL_PERMISSION.DENY) return false;
  if (permission === COMMERCIAL_PERMISSION.ALLOW || permission === COMMERCIAL_PERMISSION.MIXED) {
    return true;
  }
  const mode = input.interactionMode || null;
  if (mode === MIA_INTERACTION_MODES.MIXED || mode === MIA_INTERACTION_MODES.COMMERCE) {
    return true;
  }
  return false;
}

/**
 * @param {{ interactionMode?: string|null, commercialPermission?: string|null }} input
 */
export function resolveCommercialSearchIntentType(input = {}) {
  const mode = input.interactionMode || null;
  const permission = input.commercialPermission || null;
  if (mode === MIA_INTERACTION_MODES.MIXED || permission === COMMERCIAL_PERMISSION.MIXED) {
    return MIA_COMMERCIAL_SEARCH_INTENT_TYPES.MIXED;
  }
  return MIA_COMMERCIAL_SEARCH_INTENT_TYPES.COMMERCIAL;
}

/**
 * @param {string|null|undefined} [override]
 */
export function resolveCommercialSearchRuntimeMode(override = null) {
  const mode = getCommercialRuntimeMode(override);
  if (isCommercialRuntimeShadow(mode)) return MIA_COMMERCIAL_SEARCH_RUNTIME_MODES.SHADOW;
  if (isCommercialRuntimeControlled(mode)) return MIA_COMMERCIAL_SEARCH_RUNTIME_MODES.CONTROLLED;
  if (mode === "legacy") return MIA_COMMERCIAL_SEARCH_RUNTIME_MODES.LEGACY;
  return MIA_COMMERCIAL_SEARCH_RUNTIME_MODES.UNKNOWN;
}

/**
 * @param {{
 *   mixedSegmentationApplied?: boolean,
 *   validation?: { valid?: boolean, reason?: string|null }|null,
 *   commercialPipelineQuery?: string|null,
 *   intentType?: string|null,
 * }} input
 */
export function resolveQueryExtractionStatus(input = {}) {
  if (input.intentType !== MIA_COMMERCIAL_SEARCH_INTENT_TYPES.MIXED && !input.mixedSegmentationApplied) {
    return MIA_COMMERCIAL_SEARCH_QUERY_EXTRACTION_STATUSES.NOT_REQUIRED;
  }
  const validation = input.validation || {};
  const query = sanitizeCommercialSearchQueryText(input.commercialPipelineQuery);
  if (!query) {
    return MIA_COMMERCIAL_SEARCH_QUERY_EXTRACTION_STATUSES.FAILED;
  }
  if (validation.valid === false) {
    return MIA_COMMERCIAL_SEARCH_QUERY_EXTRACTION_STATUSES.PARTIAL;
  }
  if (input.mixedSegmentationApplied) {
    return MIA_COMMERCIAL_SEARCH_QUERY_EXTRACTION_STATUSES.SUCCESS;
  }
  return MIA_COMMERCIAL_SEARCH_QUERY_EXTRACTION_STATUSES.PARTIAL;
}

/**
 * @param {{
 *   originalQuery?: string|null,
 *   extractedQuery?: string|null,
 *   normalizedQuery?: string|null,
 *   mixedSegmentationApplied?: boolean,
 * }} input
 */
export function resolveQueryChangeType(input = {}) {
  const original = sanitizeCommercialSearchQueryText(input.originalQuery);
  const extracted = sanitizeCommercialSearchQueryText(input.extractedQuery);
  const normalized = sanitizeCommercialSearchQueryText(input.normalizedQuery);
  const effective = normalized || extracted || original;

  if (!original || areSanitizedCommercialQueriesEqual(original, effective)) {
    return MIA_COMMERCIAL_SEARCH_QUERY_CHANGE_TYPES.NONE;
  }

  const extractionChanged =
    !!input.mixedSegmentationApplied &&
    extracted != null &&
    !areSanitizedCommercialQueriesEqual(original, extracted);
  const normalizationChanged =
    normalized != null &&
    extracted != null &&
    !areSanitizedCommercialQueriesEqual(extracted, normalized);

  if (extractionChanged && normalizationChanged) {
    return MIA_COMMERCIAL_SEARCH_QUERY_CHANGE_TYPES.EXTRACTION_AND_NORMALIZATION;
  }
  if (extractionChanged) {
    return MIA_COMMERCIAL_SEARCH_QUERY_CHANGE_TYPES.EXTRACTION;
  }
  if (normalizationChanged || (effective != null && !areSanitizedCommercialQueriesEqual(original, effective))) {
    return MIA_COMMERCIAL_SEARCH_QUERY_CHANGE_TYPES.NORMALIZATION;
  }
  return MIA_COMMERCIAL_SEARCH_QUERY_CHANGE_TYPES.NONE;
}

/**
 * @param {{ commercialEntryAllowed?: boolean|null, allowed?: boolean|null, reasonCode?: string|null }} gateResult
 */
export function resolveCommercialGateStatus(gateResult = {}) {
  if (!gateResult || typeof gateResult !== "object") {
    return MIA_COMMERCIAL_SEARCH_GATE_STATUSES.UNKNOWN;
  }
  if (gateResult.commercialEntryAllowed === true || gateResult.allowed === true) {
    return MIA_COMMERCIAL_SEARCH_GATE_STATUSES.PASSED;
  }
  if (gateResult.commercialEntryAllowed === false || gateResult.allowed === false) {
    return MIA_COMMERCIAL_SEARCH_GATE_STATUSES.BLOCKED;
  }
  return MIA_COMMERCIAL_SEARCH_GATE_STATUSES.UNKNOWN;
}

/**
 * @param {{
 *   gateStatus?: string|null,
 *   searchExecuted?: boolean,
 *   aborted?: boolean,
 *   failed?: boolean,
 * }} input
 */
export function resolveSearchExecutionStatus(input = {}) {
  if (input.failed) return MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.FAILED;
  if (input.aborted) return MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.ABORTED;
  if (input.gateStatus === MIA_COMMERCIAL_SEARCH_GATE_STATUSES.BLOCKED) {
    return MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.NOT_EXECUTED;
  }
  if (input.searchExecuted) return MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.EXECUTED;
  return MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.NOT_EXECUTED;
}

/**
 * @param {{
 *   searchExecuted?: boolean,
 *   dataLayerAttempted?: boolean,
 *   dataLayerUsedAsPrimarySource?: boolean,
 *   providerContinuationRequired?: boolean,
 *   hasPriorityFollowUp?: boolean,
 * }} input
 */
export function resolveCommercialSearchPath(input = {}) {
  if (input.hasPriorityFollowUp || input.searchExecuted === false) {
    return MIA_COMMERCIAL_SEARCH_PATHS.NO_SEARCH;
  }
  if (!input.dataLayerAttempted && input.providerContinuationRequired) {
    return MIA_COMMERCIAL_SEARCH_PATHS.PROVIDER_ONLY;
  }
  if (input.dataLayerUsedAsPrimarySource && input.providerContinuationRequired) {
    return MIA_COMMERCIAL_SEARCH_PATHS.DATA_LAYER_THEN_PROVIDER;
  }
  if (input.dataLayerUsedAsPrimarySource && !input.providerContinuationRequired) {
    return MIA_COMMERCIAL_SEARCH_PATHS.DATA_LAYER_ONLY;
  }
  if (input.providerContinuationRequired) {
    return MIA_COMMERCIAL_SEARCH_PATHS.PROVIDER_ONLY;
  }
  if (input.dataLayerAttempted) {
    return MIA_COMMERCIAL_SEARCH_PATHS.DATA_LAYER_ONLY;
  }
  return MIA_COMMERCIAL_SEARCH_PATHS.UNKNOWN;
}

/**
 * results_count = commercial product candidates usable after search/ranking (not offer cards).
 *
 * @param {{
 *   resultsCount?: number,
 *   fallbackUsed?: boolean,
 *   searchExecuted?: boolean,
 *   gateStatus?: string|null,
 *   executionStatus?: string|null,
 * }} input
 */
export function resolveSearchResultStatus(input = {}) {
  const executionStatus = input.executionStatus || null;
  const gateStatus = input.gateStatus || null;

  if (
    gateStatus === MIA_COMMERCIAL_SEARCH_GATE_STATUSES.BLOCKED ||
    executionStatus === MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.NOT_EXECUTED
  ) {
    return MIA_COMMERCIAL_SEARCH_RESULT_STATUSES.NOT_APPLICABLE;
  }

  const count = Number(input.resultsCount) || 0;
  if (!input.searchExecuted && count === 0) {
    return MIA_COMMERCIAL_SEARCH_RESULT_STATUSES.NOT_APPLICABLE;
  }
  if (input.fallbackUsed && count > 0) {
    return MIA_COMMERCIAL_SEARCH_RESULT_STATUSES.FALLBACK_RESULT;
  }
  if (count <= 0) {
    return MIA_COMMERCIAL_SEARCH_RESULT_STATUSES.NO_RESULTS;
  }
  return MIA_COMMERCIAL_SEARCH_RESULT_STATUSES.RESULTS_FOUND;
}

/**
 * @param {{
 *   gateStatus?: string|null,
 *   searchExecuted?: boolean,
 *   dataLayerAttempted?: boolean,
 *   providerContinuationRequired?: boolean,
 *   rankingCompleted?: boolean,
 *   responsePath?: string|null,
 * }} input
 */
export function resolveCommercialSearchTerminationStage(input = {}) {
  if (input.gateStatus === MIA_COMMERCIAL_SEARCH_GATE_STATUSES.BLOCKED) {
    return MIA_COMMERCIAL_SEARCH_TERMINATION_STAGES.COMMERCIAL_GATE;
  }
  if (!input.searchExecuted) {
    if (input.responsePath) {
      return MIA_COMMERCIAL_SEARCH_TERMINATION_STAGES.RESPONSE_BUILDER;
    }
    return MIA_COMMERCIAL_SEARCH_TERMINATION_STAGES.QUERY_EXTRACTION;
  }
  if (input.providerContinuationRequired && !input.rankingCompleted) {
    return MIA_COMMERCIAL_SEARCH_TERMINATION_STAGES.PROVIDER_ROUTER;
  }
  if (input.dataLayerAttempted && !input.rankingCompleted) {
    return MIA_COMMERCIAL_SEARCH_TERMINATION_STAGES.DATA_LAYER;
  }
  if (input.rankingCompleted || input.responsePath) {
    return MIA_COMMERCIAL_SEARCH_TERMINATION_STAGES.RESPONSE_BUILDER;
  }
  return MIA_COMMERCIAL_SEARCH_TERMINATION_STAGES.UNKNOWN;
}
