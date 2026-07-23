/**
 * PATCH 8.1 — Commercial Search Analytics request-scoped tracker.
 */

import {
  resolveCommercialGateStatus,
  resolveCommercialSearchIntentType,
  resolveCommercialSearchPath,
  resolveCommercialSearchRuntimeMode,
  resolveCommercialSearchTerminationStage,
  resolveQueryChangeType,
  resolveQueryExtractionStatus,
  resolveSearchExecutionStatus,
  resolveSearchResultStatus,
  shouldEnterCommercialSearchAnalyticsDomain,
} from "./miaCommercialSearchClassifier.js";
import { sanitizeCommercialSearchQueryText } from "./miaCommercialSearchQuerySanitizer.js";
import {
  MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES,
  MIA_COMMERCIAL_SEARCH_GATE_STATUSES,
} from "./miaCommercialSearchCatalog.js";

/**
 * @param {string} requestId
 * @param {string} eventName
 * @param {string} eventVersion
 */
export function buildCommercialSearchDedupKey(requestId, eventName, eventVersion) {
  return `${requestId}|${eventName}|${eventVersion}`;
}

/**
 * @param {object} [seed]
 */
export function createCommercialSearchTracker(seed = {}) {
  return {
    active: false,
    finalized: false,
    emitted: false,
    startedAt: Date.now(),
    requestId: seed.requestId ?? null,
    analyticsContext: seed.analyticsContext || {},
    originalQuery: seed.originalQuery ?? null,
    extractedCommercialQuery: seed.extractedCommercialQuery ?? null,
    normalizedCommercialQuery: seed.normalizedCommercialQuery ?? null,
    intentType: seed.intentType ?? null,
    commercialIntent: seed.commercialIntent ?? null,
    runtimeMode: seed.runtimeMode ?? resolveCommercialSearchRuntimeMode(),
    gateStatus: seed.gateStatus ?? MIA_COMMERCIAL_SEARCH_GATE_STATUSES.UNKNOWN,
    mixedSegmentationApplied: !!seed.mixedSegmentationApplied,
    validation: seed.validation ?? null,
    category: seed.category ?? null,
    productDomain: seed.productDomain ?? null,
    endpoint: seed.endpoint || "/api/chat-gpt4o",
    controlledTest: !!seed.controlledTest,
    dataLayerAttempted: false,
    dataLayerUsedAsPrimarySource: false,
    providerContinuationRequired: false,
    searchExecuted: false,
    hasPriorityFollowUp: false,
    rankingCompleted: false,
    resultsCount: 0,
    fallbackUsed: false,
    aborted: false,
    failed: false,
    responsePath: null,
    intent: seed.intent ?? null,
  };
}

/**
 * @param {ReturnType<typeof createCommercialSearchTracker>|null|undefined} tracker
 * @param {object} input
 */
export function beginCommercialSearchTracker(tracker, input = {}) {
  if (!tracker || tracker.finalized) return tracker;

  const domainAllowed = shouldEnterCommercialSearchAnalyticsDomain({
    commercialPermission: input.commercialPermission,
    interactionMode: input.interactionMode,
  });
  if (!domainAllowed) return tracker;

  tracker.active = true;
  tracker.originalQuery = input.originalQuery ?? tracker.originalQuery;
  tracker.extractedCommercialQuery =
    input.extractedCommercialQuery ??
    input.commercialPipelineQuery ??
    tracker.extractedCommercialQuery;
  tracker.normalizedCommercialQuery =
    input.normalizedCommercialQuery ??
    input.commercialQuery ??
    tracker.normalizedCommercialQuery;
  tracker.mixedSegmentationApplied = !!input.mixedSegmentationApplied;
  tracker.validation = input.validation ?? tracker.validation;
  tracker.intentType = resolveCommercialSearchIntentType({
    interactionMode: input.interactionMode,
    commercialPermission: input.commercialPermission,
  });
  tracker.commercialIntent = input.commercialIntent ?? input.intent ?? tracker.commercialIntent;
  tracker.intent = input.intent ?? tracker.intent;
  tracker.gateStatus = resolveCommercialGateStatus(input.commercialEntryGateResult);
  tracker.runtimeMode = resolveCommercialSearchRuntimeMode(input.runtimeModeOverride);
  tracker.category = input.category ?? tracker.category;
  tracker.productDomain = input.productDomain ?? input.category ?? tracker.productDomain;
  return tracker;
}

/**
 * @param {ReturnType<typeof createCommercialSearchTracker>|null|undefined} tracker
 * @param {object} input
 */
export function updateCommercialSearchTrackerFromPipeline(tracker, input = {}) {
  if (!tracker?.active || tracker.finalized) return tracker;

  if (input.dataLayerAttempted != null) tracker.dataLayerAttempted = !!input.dataLayerAttempted;
  if (input.dataLayerUsedAsPrimarySource != null) {
    tracker.dataLayerUsedAsPrimarySource = !!input.dataLayerUsedAsPrimarySource;
  }
  if (input.providerContinuationRequired != null) {
    tracker.providerContinuationRequired = !!input.providerContinuationRequired;
  }
  if (input.searchExecuted != null) tracker.searchExecuted = !!input.searchExecuted;
  if (input.hasPriorityFollowUp != null) tracker.hasPriorityFollowUp = !!input.hasPriorityFollowUp;
  if (input.rankingCompleted != null) tracker.rankingCompleted = !!input.rankingCompleted;
  if (input.resultsCount != null) tracker.resultsCount = Math.max(0, Number(input.resultsCount) || 0);
  if (input.fallbackUsed != null) tracker.fallbackUsed = !!input.fallbackUsed;
  if (input.aborted != null) tracker.aborted = !!input.aborted;
  if (input.failed != null) tracker.failed = !!input.failed;
  if (input.responsePath != null) tracker.responsePath = input.responsePath;
  if (input.category != null) tracker.category = input.category;
  if (input.productDomain != null) tracker.productDomain = input.productDomain;

  return tracker;
}

/**
 * @param {ReturnType<typeof createCommercialSearchTracker>|null|undefined} tracker
 * @param {{ responsePath?: string|null, body?: Record<string, unknown>|null, httpStatus?: number }} [input]
 */
export function finalizeCommercialSearchTracker(tracker, input = {}) {
  if (!tracker?.active || tracker.finalized) return null;

  const body = input.body && typeof input.body === "object" ? input.body : {};
  const prices = Array.isArray(body.prices) ? body.prices : [];
  if (tracker.resultsCount === 0 && prices.length > 0) {
    tracker.resultsCount = prices.length;
  }

  tracker.responsePath = input.responsePath ?? tracker.responsePath;
  tracker.finalized = true;

  const queryExtractionStatus = resolveQueryExtractionStatus({
    mixedSegmentationApplied: tracker.mixedSegmentationApplied,
    validation: tracker.validation,
    commercialPipelineQuery: tracker.extractedCommercialQuery,
    intentType: tracker.intentType,
  });
  const queryChangeType = resolveQueryChangeType({
    originalQuery: tracker.originalQuery,
    extractedQuery: tracker.extractedCommercialQuery,
    normalizedQuery: tracker.normalizedCommercialQuery,
    mixedSegmentationApplied: tracker.mixedSegmentationApplied,
  });
  const queryChanged = queryChangeType !== "NONE";
  const executionStatus = resolveSearchExecutionStatus({
    gateStatus: tracker.gateStatus,
    searchExecuted: tracker.searchExecuted,
    aborted: tracker.aborted,
    failed: tracker.failed || (Number(input.httpStatus) || 0) >= 500,
  });
  const searchPath = resolveCommercialSearchPath({
    searchExecuted: tracker.searchExecuted,
    dataLayerAttempted: tracker.dataLayerAttempted,
    dataLayerUsedAsPrimarySource: tracker.dataLayerUsedAsPrimarySource,
    providerContinuationRequired: tracker.providerContinuationRequired,
    hasPriorityFollowUp: tracker.hasPriorityFollowUp,
  });
  const searchResultStatus = resolveSearchResultStatus({
    resultsCount: tracker.resultsCount,
    fallbackUsed: tracker.fallbackUsed,
    searchExecuted: tracker.searchExecuted,
    gateStatus: tracker.gateStatus,
    executionStatus,
  });
  const terminationStage = resolveCommercialSearchTerminationStage({
    gateStatus: tracker.gateStatus,
    searchExecuted: tracker.searchExecuted,
    dataLayerAttempted: tracker.dataLayerAttempted,
    providerContinuationRequired: tracker.providerContinuationRequired,
    rankingCompleted: tracker.rankingCompleted,
    responsePath: tracker.responsePath,
  });

  return {
    runtime_mode: tracker.runtimeMode,
    intent_type: tracker.intentType,
    commercial_intent: tracker.commercialIntent,
    original_query: sanitizeCommercialSearchQueryText(tracker.originalQuery),
    extracted_commercial_query: sanitizeCommercialSearchQueryText(tracker.extractedCommercialQuery),
    normalized_commercial_query: sanitizeCommercialSearchQueryText(tracker.normalizedCommercialQuery),
    query_extraction_status: queryExtractionStatus,
    query_changed: queryChanged,
    query_change_type: queryChangeType,
    commercial_gate_status: tracker.gateStatus,
    search_execution_status: executionStatus,
    search_path: searchPath,
    data_layer_attempted: tracker.dataLayerAttempted,
    provider_continuation_required: tracker.providerContinuationRequired,
    category: tracker.category,
    product_domain: tracker.productDomain,
    search_result_status: searchResultStatus,
    results_count: tracker.resultsCount,
    termination_stage: terminationStage,
    fallback_used: tracker.fallbackUsed,
    endpoint: tracker.endpoint,
    source: "server",
    intent: tracker.intent,
    response_path: tracker.responsePath,
    has_priority_follow_up: tracker.hasPriorityFollowUp,
    controlled_test: tracker.controlledTest,
    not_market_real: tracker.controlledTest,
  };
}

export function isCommercialSearchTrackerEmitEligible(tracker) {
  return !!tracker?.active && tracker.finalized && !tracker.emitted;
}

export function markCommercialSearchTrackerEmitted(tracker) {
  if (tracker) tracker.emitted = true;
}
