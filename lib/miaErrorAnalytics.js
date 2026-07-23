/**
 * PATCH 7.2 — Error Reliability Analytics
 *
 * Server-side INSERT into analytics_events (mirrors PATCH 7.1 pattern).
 * Observational only — fire-and-forget; never alters runtime behavior.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import {
  buildErrorDedupKey,
  classifyErrorEvent,
  extractRuntimeErrorSignals,
} from "./miaErrorClassifier.js";
import { getSharedRequestState } from "./miaSharedRequestState.js";
import { MIA_RESPONSE_OUTCOMES } from "./miaResponseOutcomeClassifier.js";

export const MIA_ERROR_ANALYTICS_VERSION = "7.2.0";
export const MIA_ERROR_ANALYTICS_EVENT = "mia_error_event";
export const MIA_ERROR_ANALYTICS_CATEGORY = "reliability_error";
export const MIA_ERROR_TEST_ANALYTICS_CATEGORY = "reliability_error_test";

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

function getErrorAnalyticsBucket() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return null;
  if (!sharedState.errorAnalytics) {
    sharedState.errorAnalytics = { emittedKeys: {} };
  }
  return sharedState.errorAnalytics;
}

function shouldEmitErrorEvent(requestId, classification) {
  const bucket = getErrorAnalyticsBucket();
  const dedupKey = buildErrorDedupKey(
    requestId || "unknown",
    classification.error_layer,
    classification.reason_code
  );
  if (bucket?.emittedKeys?.[dedupKey]) {
    return false;
  }
  if (bucket) {
    bucket.emittedKeys[dedupKey] = true;
  }
  return true;
}

/**
 * @param {{
 *   requestId?: string|null,
 *   analyticsContext?: object,
 *   query?: string|null,
 *   endpoint?: string|null,
 *   httpStatus?: number,
 *   reasonCode?: string|null,
 *   responsePath?: string|null,
 *   provider?: string|null,
 *   recovered?: boolean,
 *   recoveryMethod?: string|null,
 *   fallbackUsed?: boolean,
 *   responseDelivered?: boolean,
 *   responseOutcome?: string|null,
 *   error_type?: string|null,
 *   error_layer?: string|null,
 *   severity?: string|null,
 *   controlledTest?: boolean,
 * }} input
 */
export function buildErrorAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const classification = classifyErrorEvent({
    reasonCode: input.reasonCode,
    responsePath: input.responsePath,
    httpStatus: input.httpStatus,
    provider: input.provider,
    recovered: input.recovered,
    recoveryMethod: input.recoveryMethod,
    fallbackUsed: input.fallbackUsed,
    responseDelivered: input.responseDelivered,
    responseOutcome: input.responseOutcome,
    error_type: input.error_type,
    error_layer: input.error_layer,
    severity: input.severity,
  });

  const metadata = sanitizeMetadataValue({
    event_version: MIA_ERROR_ANALYTICS_VERSION,
    request_id: input.requestId ?? null,
    endpoint: input.endpoint || "/api/chat-gpt4o",
    http_status: classification.http_status,
    error_type: classification.error_type,
    error_layer: classification.error_layer,
    reason_code: classification.reason_code,
    severity: classification.severity,
    recovered: classification.recovered,
    recovery_method: classification.recovery_method,
    fallback_used: classification.fallback_used,
    response_delivered: classification.response_delivered,
    response_outcome: input.responseOutcome ?? null,
    response_path: input.responsePath ?? null,
    provider: classification.provider,
    user_facing: classification.user_facing === true,
    controlled_test: !!input.controlledTest,
    not_market_real: !!input.controlledTest,
  });

  const category = input.controlledTest
    ? MIA_ERROR_TEST_ANALYTICS_CATEGORY
    : MIA_ERROR_ANALYTICS_CATEGORY;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_ERROR_ANALYTICS_EVENT,
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
      query_text: String(input.query || "").slice(0, 500) || null,
      metadata,
    }),
    summary: {
      event_version: MIA_ERROR_ANALYTICS_VERSION,
      error_type: classification.error_type,
      error_layer: classification.error_layer,
      reason_code: classification.reason_code,
      severity: classification.severity,
      recovered: classification.recovered,
      recovery_method: classification.recovery_method,
      response_outcome: input.responseOutcome ?? null,
    },
    classification,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildErrorAnalyticsPayload>[0]} input
 */
export async function emitErrorAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client" };
  }

  try {
    const built = buildErrorAnalyticsPayload(input);
    if (!shouldEmitErrorEvent(input.requestId, built.classification)) {
      return { ok: true, code: "deduplicated", summary: built.summary };
    }

    const { error } = await supabase.from("analytics_events").insert(built.payload);

    if (error) {
      console.warn("[MIA Error Analytics] insert failed:", {
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
    console.warn("[MIA Error Analytics] unexpected error:", {
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
 * @param {Parameters<typeof buildErrorAnalyticsPayload>[0]} input
 */
export function scheduleErrorAnalytics(supabase, input = {}) {
  void emitErrorAnalytics(supabase, input).catch(() => {});
}

/**
 * Emit error events for recovered runtime signals (provider blocks, contract repairs).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {object} enforcementCtx
 * @param {Parameters<typeof buildErrorAnalyticsPayload>[0]} baseInput
 */
export function scheduleRuntimeRecoveredErrorAnalytics(supabase, enforcementCtx = {}, baseInput = {}) {
  const responseOutcome = baseInput.responseOutcome ?? null;
  const fallbackUsed =
    !!baseInput.fallbackUsed || responseOutcome === MIA_RESPONSE_OUTCOMES.FALLBACK;

  const signals = extractRuntimeErrorSignals(enforcementCtx, {
    responseDelivered: baseInput.responseDelivered !== false,
    httpStatus: baseInput.httpStatus ?? 200,
    responseOutcome,
    fallbackUsed,
    responsePath: baseInput.responsePath ?? null,
  });

  for (const signal of signals) {
    scheduleErrorAnalytics(supabase, {
      ...baseInput,
      reasonCode: signal.reasonCode,
      provider: signal.provider,
      recovered: signal.recovered,
      recoveryMethod: signal.recoveryMethod,
      fallbackUsed: signal.fallbackUsed,
      responseDelivered: signal.responseDelivered,
      httpStatus: signal.httpStatus,
      responseOutcome: signal.responseOutcome,
      error_type: signal.error_type,
      error_layer: signal.error_layer,
      severity: signal.severity,
      responsePath: signal.responsePath ?? baseInput.responsePath ?? null,
    });
  }
}

/**
 * Emit explicit error analytics when HTTP status or outcome indicates platform error.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildErrorAnalyticsPayload>[0]} input
 */
export function scheduleExplicitErrorAnalytics(supabase, input = {}) {
  const httpStatus = Number(input.httpStatus) || 200;
  const outcome = input.responseOutcome ?? null;
  const isExplicitError =
    httpStatus >= 400 ||
    outcome === MIA_RESPONSE_OUTCOMES.ERROR ||
    !!input.reasonCode;

  if (!isExplicitError) return;
  scheduleErrorAnalytics(supabase, input);
}
