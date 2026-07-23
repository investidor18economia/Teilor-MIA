/**
 * PATCH 11.1 — Executive Metrics official catalog (Single Source of Truth).
 */

export const MIA_EXECUTIVE_METRICS_VERSION = "11.1.0";

export const MIA_EXECUTIVE_METRICS_DEFAULT_WINDOW_DAYS = 30;

export const MIA_EXECUTIVE_METRICS_CATEGORIES = Object.freeze([
  "platform",
  "conversation",
  "recommendation",
  "commerce",
  "alerts",
  "price_intelligence",
  "savings",
  "anti_regret",
  "user_value",
  "system",
]);

/** RPC function map — one per category for partial resilience */
export const MIA_EXECUTIVE_METRICS_RPC = Object.freeze({
  platform: "mia_executive_metrics_platform",
  conversation: "mia_executive_metrics_conversation",
  recommendation: "mia_executive_metrics_recommendation",
  commerce: "mia_executive_metrics_commerce",
  alerts: "mia_executive_metrics_alerts",
  price_intelligence: "mia_executive_metrics_price_intelligence",
  savings: "mia_executive_metrics_savings",
  anti_regret: "mia_executive_metrics_anti_regret",
  user_value: "mia_executive_metrics_user_value",
});

/** Forbidden keys in API responses (aggregates only) */
export const MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS = Object.freeze([
  "query",
  "query_text",
  "prompt",
  "message",
  "response",
  "product_name",
  "product_title",
  "email",
  "phone",
  "visitor_id",
  "request_id",
  "decision_request_id",
  "conversation_id",
  "user_id",
  "session_id",
  "alert_id",
  "url",
  "image_url",
]);

export const MIA_EXECUTIVE_METRICS_DEFINITIONS = Object.freeze({
  platform: {
    total_sessions: {
      description: "Distinct tab sessions started in window",
      grain: "session",
      denominator: "rolling_window_days",
      source: "session_started",
    },
    unique_visitors: {
      description: "Distinct visitors with any production activity in window",
      grain: "visitor",
      denominator: "rolling_window_days",
      source: "analytics_events.visitor_id",
    },
    conversations: {
      description: "Distinct conversation threads in window",
      grain: "conversation",
      denominator: "rolling_window_days",
      source: "analytics_events.conversation_id",
    },
    questions: {
      description: "Questions sent to MIA in window",
      grain: "event",
      denominator: "rolling_window_days",
      source: "mia_question_sent",
    },
  },
  recommendation: {
    recommendations_generated: {
      description: "Decision outcomes recorded (observational — not purchases)",
      grain: "event",
      source: "mia_recommendation_decision",
    },
    recommendation_acceptance_rate: {
      description: "Acceptance signals / (acceptance + rejection) — not satisfaction",
      grain: "ratio",
      source: "9.2 / 9.3 signals",
    },
  },
  savings: {
    potential_savings_total: {
      description: "Sum of potential savings — UNVERIFIED, not realized savings",
      grain: "monetary_observational",
      source: "mia_savings_estimation 10.2.0",
    },
  },
  user_value: {
    average_user_value: {
      description: "Observational score 0–100 — not ROI",
      grain: "score_internal",
      source: "mia_user_value_outcome 10.5.0",
    },
  },
});
