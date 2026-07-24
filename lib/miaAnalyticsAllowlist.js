/**
 * PATCH 12D — Public analytics ingestion allowlist and payload limits.
 * PATCH 2.2 — normalized row assembly via miaAnalyticsPayload.js
 */

import { assembleAnalyticsInsertRow } from "./miaAnalyticsPayload.js";

export const ALLOWED_ANALYTICS_EVENTS = Object.freeze([
  "session_started",
  "user_authenticated",
  "mia_question_sent",
  "mia_recommendation_shown",
  "favorite_created",
  "price_alert_created",
  "offer_click",
]);

export const ANALYTICS_MAX_STRING_CHARS = 512;
export const ANALYTICS_MAX_QUERY_CHARS = 2000;
export const ANALYTICS_MAX_METADATA_JSON_CHARS = 4000;

function cleanString(value, maxChars = ANALYTICS_MAX_STRING_CHARS) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxChars);
}

export function validateAnalyticsTrackRequest(body = {}) {
  const safeBody = body && typeof body === "object" ? body : {};
  const eventName = cleanString(safeBody.event_name, 128);
  if (!eventName) {
    return {
      ok: false,
      statusCode: 400,
      payload: { error: "event_name_required", reasonCode: "analytics_event_required" },
    };
  }

  if (!ALLOWED_ANALYTICS_EVENTS.includes(eventName)) {
    return {
      ok: false,
      statusCode: 400,
      payload: { error: "event_not_allowed", reasonCode: "analytics_event_not_allowed" },
    };
  }

  let metadata = safeBody.metadata;
  if (metadata != null && typeof metadata !== "object") {
    return {
      ok: false,
      statusCode: 400,
      payload: { error: "invalid_metadata", reasonCode: "analytics_invalid_metadata" },
    };
  }

  const metadataJson = metadata ? JSON.stringify(metadata) : "{}";
  if (metadataJson.length > ANALYTICS_MAX_METADATA_JSON_CHARS) {
    return {
      ok: false,
      statusCode: 413,
      payload: { error: "metadata_too_large", reasonCode: "analytics_payload_too_large" },
    };
  }

  return {
    ok: true,
    row: assembleAnalyticsInsertRow({
      event_name: eventName,
      visitor_id: cleanString(safeBody.visitor_id, 128),
      session_id: cleanString(safeBody.session_id, 128),
      conversation_id: cleanString(safeBody.conversation_id, 128),
      user_id: cleanString(safeBody.user_id, 128),
      category: cleanString(safeBody.category, 64),
      product_name: cleanString(safeBody.product_name),
      product_brand: cleanString(safeBody.product_brand),
      product_id: cleanString(safeBody.product_id),
      query_text: cleanString(safeBody.query_text, ANALYTICS_MAX_QUERY_CHARS),
      recommendation_name: cleanString(safeBody.recommendation_name),
      offer_store: cleanString(safeBody.offer_store),
      offer_price: safeBody.offer_price == null ? null : Number(safeBody.offer_price),
      offer_url: cleanString(safeBody.offer_url, 2048),
      metadata: metadata || {},
    }),
  };
}
