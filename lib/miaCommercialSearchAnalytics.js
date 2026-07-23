/**
 * PATCH 8.1 — Commercial Search Analytics
 *
 * Server-side INSERT into analytics_events (mirrors PATCH 6.4 / 7.x pattern).
 * Observational only — fire-and-forget; never alters commercial pipeline decisions.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { getSharedRequestState } from "./miaSharedRequestState.js";
import {
  beginCommercialSearchTracker,
  buildCommercialSearchDedupKey,
  createCommercialSearchTracker,
  finalizeCommercialSearchTracker,
  isCommercialSearchTrackerEmitEligible,
  markCommercialSearchTrackerEmitted,
  updateCommercialSearchTrackerFromPipeline,
} from "./miaCommercialSearchTracker.js";
import { sanitizeCommercialSearchQueryText } from "./miaCommercialSearchQuerySanitizer.js";

export const MIA_COMMERCIAL_SEARCH_ANALYTICS_VERSION = "8.1.0";
export const MIA_COMMERCIAL_SEARCH_ANALYTICS_EVENT = "mia_commercial_search";
export const MIA_COMMERCIAL_SEARCH_ANALYTICS_CATEGORY = "commercial_search";
export const MIA_COMMERCIAL_SEARCH_TEST_ANALYTICS_CATEGORY = "commercial_search_test";

const FORBIDDEN_METADATA_KEYS = new Set([
  "user_email",
  "email",
  "resend_api_key",
  "api_key",
  "admin_key",
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "stack",
  "stack_trace",
]);

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMetadataValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = String(key).toLowerCase();
      if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) continue;
      if (normalizedKey.includes("secret") || normalizedKey.includes("password")) continue;
      if (normalizedKey.includes("stack")) continue;
      out[key] = sanitizeMetadataValue(nested, depth + 1);
    }
    return out;
  }
  return null;
}

function getCommercialSearchAnalyticsBucket() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return null;
  if (!sharedState.commercialSearchAnalytics) {
    sharedState.commercialSearchAnalytics = createCommercialSearchTracker({
      requestId: sharedState.requestId || null,
      analyticsContext: sharedState.responseAnalytics?.analyticsContext || {},
      endpoint: sharedState.analyticsContext?.endpoint || "/api/chat-gpt4o",
    });
  }
  return sharedState.commercialSearchAnalytics;
}

function sharedStateDedupStore() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return {};
  if (!sharedState.commercialSearchAnalyticsDedup) {
    sharedState.commercialSearchAnalyticsDedup = {};
  }
  return sharedState.commercialSearchAnalyticsDedup;
}

function shouldEmitCommercialSearchEvent(requestId) {
  const bucket = getCommercialSearchAnalyticsBucket();
  if (!isCommercialSearchTrackerEmitEligible(bucket)) return false;
  const dedupKey = buildCommercialSearchDedupKey(
    requestId || "unknown",
    MIA_COMMERCIAL_SEARCH_ANALYTICS_EVENT,
    MIA_COMMERCIAL_SEARCH_ANALYTICS_VERSION
  );
  const store = sharedStateDedupStore();
  if (store[dedupKey]) return false;
  store[dedupKey] = true;
  return true;
}

/**
 * @param {object} input
 */
export function initializeCommercialSearchAnalyticsTracking(input = {}) {
  const tracker = getCommercialSearchAnalyticsBucket();
  return beginCommercialSearchTracker(tracker, input);
}

/**
 * @param {object} input
 */
export function updateCommercialSearchAnalyticsFromPipeline(input = {}) {
  const tracker = getCommercialSearchAnalyticsBucket();
  return updateCommercialSearchTrackerFromPipeline(tracker, input);
}

/**
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   metadata?: Record<string, unknown>|null,
 *   controlledTest?: boolean,
 *   queryText?: string|null,
 * }} input
 */
export function buildCommercialSearchAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const metadata = sanitizeMetadataValue({
    event_version: MIA_COMMERCIAL_SEARCH_ANALYTICS_VERSION,
    request_id: input.requestId ?? null,
    ...(input.metadata || {}),
  });

  const category = input.controlledTest
    ? MIA_COMMERCIAL_SEARCH_TEST_ANALYTICS_CATEGORY
    : MIA_COMMERCIAL_SEARCH_ANALYTICS_CATEGORY;

  const queryText =
    sanitizeCommercialSearchQueryText(input.queryText) ||
    metadata?.normalized_commercial_query ||
    metadata?.extracted_commercial_query ||
    metadata?.original_query ||
    null;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_COMMERCIAL_SEARCH_ANALYTICS_EVENT,
      visitor_id: isAnalyticsUuid(analyticsContext.visitor_id)
        ? analyticsContext.visitor_id
        : null,
      session_id: isAnalyticsUuid(analyticsContext.session_id)
        ? analyticsContext.session_id
        : null,
      conversation_id: isAnalyticsUuid(analyticsContext.conversation_id)
        ? analyticsContext.conversation_id
        : null,
      user_id: isAnalyticsUuid(analyticsContext.user_id) ? analyticsContext.user_id : null,
      category,
      query_text: queryText,
      metadata,
    }),
    summary: sanitizeMetadataValue({
      event_version: MIA_COMMERCIAL_SEARCH_ANALYTICS_VERSION,
      intent_type: metadata?.intent_type ?? null,
      search_execution_status: metadata?.search_execution_status ?? null,
      search_path: metadata?.search_path ?? null,
      search_result_status: metadata?.search_result_status ?? null,
      results_count: metadata?.results_count ?? 0,
      runtime_mode: metadata?.runtime_mode ?? null,
      request_id: input.requestId ?? null,
    }),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildCommercialSearchAnalyticsPayload>[0]} input
 */
export async function emitCommercialSearchAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildCommercialSearchAnalyticsPayload(input);
    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA Commercial Search Analytics] insert failed:", {
        event: built.payload.event_name,
        code: String(error.code || "insert_error").slice(0, 80),
      });
      return {
        ok: false,
        code: "analytics_insert_failed",
        error: String(error.message || "insert_failed").slice(0, 160),
        summary: built.summary,
      };
    }

    return {
      ok: true,
      event_name: built.payload.event_name,
      summary: built.summary,
    };
  } catch (err) {
    console.warn("[MIA Commercial Search Analytics] unexpected error:", {
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return {
      ok: false,
      code: "analytics_internal_error",
      error: String(err?.message || "unknown_error").slice(0, 160),
    };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildCommercialSearchAnalyticsPayload>[0]} input
 */
export function scheduleCommercialSearchAnalytics(supabase, input = {}) {
  void emitCommercialSearchAnalytics(supabase, input).catch(() => {});
}

/**
 * Safe subset for API response body (retrocompatible extension).
 *
 * @param {Record<string, unknown>|null|undefined} summary
 */
export function buildCommercialSearchRecommendationMetadata(summary = null) {
  if (!summary || typeof summary !== "object") return {};
  return sanitizeMetadataValue({
    commercial_search_event_version: summary.event_version ?? null,
    commercial_search_execution_status: summary.search_execution_status ?? null,
    commercial_search_path: summary.search_path ?? null,
    commercial_search_result_status: summary.search_result_status ?? null,
    commercial_search_results_count: summary.results_count ?? null,
    commercial_search_runtime_mode: summary.runtime_mode ?? null,
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   body?: Record<string, unknown>|null,
 *   responsePath?: string|null,
 *   httpStatus?: number,
 *   controlledTest?: boolean,
 * }} input
 */
export function instrumentCommercialSearchAnalyticsForDelivery(supabase, input = {}) {
  const tracker = getCommercialSearchAnalyticsBucket();
  if (!tracker?.active) return null;

  const metadata = finalizeCommercialSearchTracker(tracker, {
    body: input.body,
    responsePath: input.responsePath,
    httpStatus: input.httpStatus,
  });
  if (!metadata) return null;

  const requestId = input.requestId || tracker.requestId || null;
  if (!shouldEmitCommercialSearchEvent(requestId)) return null;

  markCommercialSearchTrackerEmitted(tracker);

  const built = buildCommercialSearchAnalyticsPayload({
    requestId,
    analyticsContext: input.analyticsContext || tracker.analyticsContext,
    metadata,
    controlledTest: input.controlledTest,
    queryText: metadata.normalized_commercial_query,
  });

  scheduleCommercialSearchAnalytics(supabase, {
    requestId,
    analyticsContext: input.analyticsContext || tracker.analyticsContext,
    metadata: built.payload.metadata,
    controlledTest: input.controlledTest,
    queryText: built.payload.query_text,
  });

  return built.summary;
}

export {
  beginCommercialSearchTracker,
  buildCommercialSearchDedupKey,
  createCommercialSearchTracker,
  finalizeCommercialSearchTracker,
  updateCommercialSearchTrackerFromPipeline,
} from "./miaCommercialSearchTracker.js";

export {
  shouldEnterCommercialSearchAnalyticsDomain,
  resolveCommercialSearchIntentType,
  resolveCommercialSearchRuntimeMode,
  resolveQueryExtractionStatus,
  resolveQueryChangeType,
  resolveCommercialGateStatus,
  resolveSearchExecutionStatus,
  resolveCommercialSearchPath,
  resolveSearchResultStatus,
  resolveCommercialSearchTerminationStage,
} from "./miaCommercialSearchClassifier.js";
