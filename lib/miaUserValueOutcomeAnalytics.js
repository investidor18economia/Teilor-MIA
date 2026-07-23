/**
 * PATCH 10.5 — User Value Outcome Analytics
 *
 * Observational only — consolidates value layers without assuming purchase or verified ROI.
 */

import { assembleAnalyticsInsertRow, isAnalyticsUuid } from "./miaAnalyticsPayload.js";
import { getSharedRequestState } from "./miaSharedRequestState.js";
import { MIA_USER_VALUE_OUTCOME_CATALOG_VERSION } from "./miaUserValueOutcomeCatalog.js";
import { buildUserValueOutcomeMetadata } from "./miaUserValueOutcomeClassifier.js";
import { buildPriceIntelligenceFromOfferSetMetadata } from "./miaPriceIntelligenceClassifier.js";
import { buildWinnerVsMinimumEstimation } from "./miaSavingsEstimationClassifier.js";
import { buildAntiRegretFoundationMetadata } from "./miaAntiRegretFoundationClassifier.js";

export const MIA_USER_VALUE_OUTCOME_ANALYTICS_VERSION = MIA_USER_VALUE_OUTCOME_CATALOG_VERSION;
export const MIA_USER_VALUE_OUTCOME_ANALYTICS_EVENT = "mia_user_value_outcome";
export const MIA_USER_VALUE_OUTCOME_ANALYTICS_CATEGORY = "user_value";
export const MIA_USER_VALUE_OUTCOME_TEST_ANALYTICS_CATEGORY = "user_value_test";

const FORBIDDEN_METADATA_KEYS = new Set([
  "user_email",
  "email",
  "query",
  "query_text",
  "product_name",
  "title",
  "link",
  "url",
  "offer_url",
  "thumbnail",
  "prices",
  "offers",
  "payload",
  "secret",
  "token",
  "authorization",
  "stack",
  "stack_trace",
  "message",
  "response",
  "prompt",
  "telefone",
  "phone",
]);

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.slice(0, 120);
    if (/bearer\s+/i.test(trimmed)) return "[redacted]";
    if (/https?:\/\//i.test(trimmed)) return "[redacted]";
    if (/@/.test(trimmed)) return "[redacted]";
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => sanitizeMetadataValue(item, depth + 1)).filter(Boolean);
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = String(key).toLowerCase();
      if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) continue;
      out[key] = sanitizeMetadataValue(nested, depth + 1);
    }
    return out;
  }
  return null;
}

/**
 * @param {string} requestId
 * @param {string} decisionRequestId
 * @param {string} eventName
 * @param {string} eventVersion
 */
export function buildUserValueOutcomeDedupKey(
  requestId,
  decisionRequestId,
  eventName,
  eventVersion
) {
  return `${requestId}|${decisionRequestId}|${eventName}|${eventVersion}`;
}

const globalDedupStore = {};

function sharedStateDedupStore() {
  const sharedState = getSharedRequestState();
  if (!sharedState) return globalDedupStore;
  if (!sharedState.userValueOutcomeAnalyticsDedup) {
    sharedState.userValueOutcomeAnalyticsDedup = {};
  }
  return sharedState.userValueOutcomeAnalyticsDedup;
}

function shouldEmitUserValueOutcomeEventScoped(requestId, decisionRequestId) {
  const dedupKey = buildUserValueOutcomeDedupKey(
    requestId || "unknown",
    decisionRequestId || requestId || "unknown",
    MIA_USER_VALUE_OUTCOME_ANALYTICS_EVENT,
    MIA_USER_VALUE_OUTCOME_ANALYTICS_VERSION
  );
  const store = sharedStateDedupStore();
  if (store[dedupKey]) return false;
  store[dedupKey] = true;
  globalDedupStore[dedupKey] = true;
  return true;
}

/**
 * @param {{
 *   requestId?: string|null,
 *   decisionRequestId?: string|null,
 *   analyticsContext?: object,
 *   offerSetMetadata?: Record<string, unknown>|null,
 *   decisionMetadata?: Record<string, unknown>|null,
 *   acceptanceSignals?: object[],
 *   rejectionSignals?: object[],
 *   alertStage?: string|null,
 *   controlledTest?: boolean,
 *   source?: string|null,
 * }} input
 */
export function buildUserValueOutcomeAnalyticsPayload(input = {}) {
  const analyticsContext = input.analyticsContext || {};
  const requestId = input.requestId ?? null;
  const decisionRequestId = input.decisionRequestId ?? requestId ?? null;
  const offerSetMetadata = input.offerSetMetadata || {};
  const priceIntel = buildPriceIntelligenceFromOfferSetMetadata(offerSetMetadata, {
    requestId,
    decisionRequestId,
  });
  const savings = buildWinnerVsMinimumEstimation(offerSetMetadata, priceIntel, {
    requestId,
    decisionRequestId,
  });
  const antiRegret = buildAntiRegretFoundationMetadata({
    requestId,
    offerSetMetadata,
    decisionMetadata: input.decisionMetadata || {},
    priceIntelligenceMetadata: priceIntel,
    savingsMetadata: savings,
    acceptanceSignals: input.acceptanceSignals,
    rejectionSignals: input.rejectionSignals,
    alertStage: input.alertStage ?? null,
  });

  const outcome = buildUserValueOutcomeMetadata({
    requestId,
    decisionRequestId,
    offerSetMetadata,
    decisionMetadata: input.decisionMetadata,
    priceIntelligenceMetadata: priceIntel,
    savingsMetadata: savings,
    antiRegretMetadata: antiRegret,
    acceptanceSignals: input.acceptanceSignals,
    rejectionSignals: input.rejectionSignals,
    alertStage: input.alertStage ?? null,
    source: input.source ?? null,
  });

  const category = input.controlledTest
    ? MIA_USER_VALUE_OUTCOME_TEST_ANALYTICS_CATEGORY
    : MIA_USER_VALUE_OUTCOME_ANALYTICS_CATEGORY;

  const metadata = sanitizeMetadataValue({
    event_version: MIA_USER_VALUE_OUTCOME_ANALYTICS_VERSION,
    ...outcome,
  });
  delete metadata.outcome_valid;

  return {
    payload: assembleAnalyticsInsertRow({
      event_name: MIA_USER_VALUE_OUTCOME_ANALYTICS_EVENT,
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
      query_text: null,
      metadata,
    }),
    summary: sanitizeMetadataValue({
      event_version: MIA_USER_VALUE_OUTCOME_ANALYTICS_VERSION,
      request_id: requestId,
      decision_request_id: decisionRequestId,
      user_value_score: metadata?.user_value_score ?? null,
      value_status: metadata?.value_status ?? null,
      value_type: metadata?.value_type ?? null,
      value_confidence: metadata?.value_confidence ?? null,
      potential_value_amount: metadata?.potential_value_amount ?? null,
      verified_value_amount: metadata?.verified_value_amount ?? null,
      outcome_valid: outcome.outcome_valid,
    }),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {Parameters<typeof buildUserValueOutcomeAnalyticsPayload>[0]} input
 */
export async function emitUserValueOutcomeAnalytics(supabase, input = {}) {
  if (!supabase) {
    return { ok: false, code: "missing_supabase_client", summary: null };
  }

  try {
    const built = buildUserValueOutcomeAnalyticsPayload(input);
    const requestId = input.requestId ?? null;
    const decisionRequestId = input.decisionRequestId ?? requestId ?? null;

    if (!requestId || !built.summary?.outcome_valid) {
      return { ok: false, code: "ineligible_outcome", summary: built.summary };
    }
    if (!shouldEmitUserValueOutcomeEventScoped(requestId, decisionRequestId)) {
      return { ok: false, code: "dedup_skipped", summary: built.summary };
    }

    const { error } = await supabase.from("analytics_events").insert(built.payload);
    if (error) {
      console.warn("[MIA User Value Outcome Analytics] insert failed:", {
        event: built.payload.event_name,
        code: String(error.code || "insert_error").slice(0, 80),
      });
      return { ok: false, code: "analytics_insert_failed", summary: built.summary };
    }

    return { ok: true, event_name: built.payload.event_name, summary: built.summary };
  } catch (err) {
    console.warn("[MIA User Value Outcome Analytics] unexpected error:", {
      message: String(err?.message || "unknown_error").slice(0, 120),
    });
    return { ok: false, code: "analytics_internal_error", summary: null };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {{
 *   decisionRequestId?: string|null,
 *   analyticsContext?: object,
 *   controlledTest?: boolean,
 * }} input
 */
export function scheduleUserValueOutcomeFromPostDecisionSignal(supabase, input = {}) {
  const decisionRequestId = input.decisionRequestId ?? null;
  if (!supabase || !decisionRequestId) return;

  void (async () => {
    const dedupKey = buildUserValueOutcomeDedupKey(
      decisionRequestId,
      decisionRequestId,
      MIA_USER_VALUE_OUTCOME_ANALYTICS_EVENT,
      MIA_USER_VALUE_OUTCOME_ANALYTICS_VERSION
    );
    if (globalDedupStore[dedupKey]) return;

    const { data: existing } = await supabase
      .from("analytics_events")
      .select("id")
      .eq("event_name", "mia_user_value_outcome")
      .eq("metadata->>decision_request_id", decisionRequestId)
      .limit(1);
    if ((existing || []).length > 0) return;

    const { data: rows } = await supabase
      .from("analytics_events")
      .select("event_name,metadata")
      .in("event_name", [
        "mia_recommendation_acceptance_signal",
        "mia_recommendation_rejection_signal",
        "mia_offer_set",
        "mia_recommendation_decision",
        "mia_price_alert_lifecycle",
        "mia_anti_regret_foundation",
      ])
      .or(
        `metadata->>request_id.eq.${decisionRequestId},metadata->>decision_request_id.eq.${decisionRequestId}`
      )
      .order("created_at", { ascending: true })
      .limit(50);

    let offerSetMetadata = null;
    let decisionMetadata = null;
    let antiRegretMetadata = null;
    const acceptanceSignals = [];
    const rejectionSignals = [];
    let alertStage = null;

    for (const row of rows || []) {
      const meta = row.metadata || {};
      if (row.event_name === "mia_offer_set" && meta.request_id === decisionRequestId) {
        offerSetMetadata = meta;
      } else if (
        row.event_name === "mia_recommendation_decision" &&
        meta.request_id === decisionRequestId
      ) {
        decisionMetadata = meta;
      } else if (
        row.event_name === "mia_anti_regret_foundation" &&
        meta.decision_request_id === decisionRequestId
      ) {
        antiRegretMetadata = meta;
      } else if (row.event_name === "mia_recommendation_acceptance_signal") {
        acceptanceSignals.push(meta);
      } else if (row.event_name === "mia_recommendation_rejection_signal") {
        rejectionSignals.push(meta);
      } else if (
        row.event_name === "mia_price_alert_lifecycle" &&
        meta.decision_request_id === decisionRequestId
      ) {
        alertStage = meta.lifecycle_stage ?? alertStage;
      }
    }

    if (!offerSetMetadata && !decisionMetadata) return;

    await emitUserValueOutcomeAnalytics(supabase, {
      requestId: decisionRequestId,
      decisionRequestId,
      analyticsContext: input.analyticsContext,
      offerSetMetadata,
      decisionMetadata,
      antiRegretMetadata,
      acceptanceSignals,
      rejectionSignals,
      alertStage,
      controlledTest: input.controlledTest,
      source: "post_decision_correlated",
    });
  })().catch(() => {});
}

export {
  MIA_VALUE_LAYER,
  MIA_VALUE_OUTCOME_STATUS,
  MIA_VALUE_TYPE,
  MIA_VALUE_CONFIDENCE,
  MIA_VALUE_EVIDENCE,
  MIA_VALUE_COMPONENT,
  MIA_TIME_SAVED_BUCKET,
} from "./miaUserValueOutcomeCatalog.js";

export {
  buildUserValueOutcomeMetadata,
  computeUserValueScoreFromComponents,
  resolveTimeSavedBucket,
  resolveValueAmounts,
} from "./miaUserValueOutcomeClassifier.js";
