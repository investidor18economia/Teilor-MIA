/**
 * PATCH A.3 — Temporal Series official catalog (Single Source of Truth).
 * Definitions align with EXECUTIVE_METRICS.md and GROWTH_DASHBOARD.md.
 */

import { MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS } from "./miaExecutiveMetricsCatalog.js";

export const MIA_TEMPORAL_SERIES_VERSION = "A.6.0";

export const MIA_TEMPORAL_SERIES_DEFAULT_WINDOW_DAYS = 30;

export const MIA_TEMPORAL_SERIES_VALID_WINDOWS = Object.freeze([7, 30, 90, 365]);

export const MIA_TEMPORAL_SERIES_GRANULARITIES = Object.freeze(["day", "week", "month"]);

export const MIA_TEMPORAL_SERIES_GROUPS = Object.freeze([
  "growth",
  "platform_activity",
  "products",
  "categories",
  "conversion",
]);

/** Default groups when `series` query param omitted (backward compatible with A.3) */
export const MIA_TEMPORAL_SERIES_DEFAULT_GROUPS = Object.freeze(["growth", "platform_activity"]);

/** RPC function map — one per series group for partial resilience */
export const MIA_TEMPORAL_SERIES_RPC = Object.freeze({
  growth: "mia_temporal_series_growth",
  platform_activity: "mia_temporal_series_platform_activity",
  products: "mia_temporal_series_products",
  categories: "mia_temporal_series_categories",
  conversion: "mia_temporal_series_conversion",
});

/** Reuse executive privacy forbidden keys — temporal responses are aggregates only */
export const MIA_TEMPORAL_SERIES_FORBIDDEN_KEYS = MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS;

export const MIA_TEMPORAL_SERIES_DEFINITIONS = Object.freeze({
  growth: {
    grain: "day",
    source: "docs/analytics/GROWTH_DASHBOARD.md Query 1",
    metrics: {
      dau_visitors: { section: "EXECUTIVE_METRICS §3.2", rolling: false },
      dau_users: { section: "EXECUTIVE_METRICS §4.2", rolling: false },
      wau_visitors: { section: "EXECUTIVE_METRICS §3.3", rolling: true, window_days: 7 },
      wau_users: { section: "EXECUTIVE_METRICS §4.3", rolling: true, window_days: 7 },
      mau_visitors: { section: "EXECUTIVE_METRICS §3.4", rolling: true, window_days: 30 },
      mau_users: { section: "EXECUTIVE_METRICS §4.4", rolling: true, window_days: 30 },
      new_visitors: { section: "EXECUTIVE_METRICS §3.5", rolling: false },
      returning_visitors: { section: "EXECUTIVE_METRICS §3.6", rolling: false },
      anonymous_visitors: { section: "EXECUTIVE_METRICS §3.7", rolling: false },
      authenticated_users: { section: "EXECUTIVE_METRICS §4.5", rolling: false },
      taxa_autenticacao: { section: "EXECUTIVE_METRICS §5.3", rolling: false },
      crescimento_dau_visitors_pct: { section: "GROWTH_DASHBOARD derived", rolling: false },
      crescimento_dau_users_pct: { section: "GROWTH_DASHBOARD derived", rolling: false },
      crescimento_wau_visitors_pct: { section: "GROWTH_DASHBOARD derived", rolling: true },
      crescimento_wau_users_pct: { section: "GROWTH_DASHBOARD derived", rolling: true },
      crescimento_mau_visitors_pct: { section: "GROWTH_DASHBOARD derived", rolling: true },
      crescimento_mau_users_pct: { section: "GROWTH_DASHBOARD derived", rolling: true },
    },
    granularity_views: {
      day: "full daily series",
      week: "wau_visitors, wau_users + rolling WAU growth pct",
      month: "mau_visitors, mau_users + rolling MAU growth pct",
    },
  },
  platform_activity: {
    grain: "day",
    source: "platform RPC + analytics-daily-sessions.sql",
    metrics: {
      total_sessions: { section: "EXECUTIVE_METRICS platform.total_sessions", event: "session_started" },
      conversations: { section: "EXECUTIVE_METRICS platform.conversations", grain: "conversation" },
      questions: { section: "EXECUTIVE_METRICS platform.questions", event: "mia_question_sent" },
      recommendations_shown: {
        section: "conversation RPC",
        event: "mia_recommendation_shown",
      },
    },
    granularity_views: {
      day: "full daily series",
    },
  },
  products: {
    grain: "rolling_window",
    source: "docs/analytics/PRODUCTS_CATEGORIES_DASHBOARD.md Query 1 + 4",
    metrics: {
      distinct_products: { section: "PATCH 4.4 summary", rolling: true },
      total_aparicoes: { section: "PATCH 4.4 Query 1", rolling: true },
      total_recomendacoes: { section: "PATCH 4.4", event: "mia_recommendation_shown" },
      total_cliques: { section: "PATCH 4.4", event: "offer_click" },
      total_favoritos: { section: "PATCH 4.4", event: "favorite_created" },
      total_alertas: { section: "PATCH 4.4", event: "price_alert_created" },
      sinais_intencao_compra: { section: "PATCH 4.4 derived" },
      taxa_clique_recomendacao: { section: "CONVERSION_DASHBOARD" },
    },
    granularity_views: {
      day: "ranking + daily rows",
    },
  },
  categories: {
    grain: "rolling_window",
    source: "docs/analytics/PRODUCTS_CATEGORIES_DASHBOARD.md Query 2 + 3",
    metrics: {
      distinct_categories: { section: "PATCH 4.4 summary", rolling: true },
      total_perguntas: { section: "PATCH 4.4", event: "mia_question_sent" },
      total_recomendacoes: { section: "PATCH 4.4", event: "mia_recommendation_shown" },
      total_cliques: { section: "PATCH 4.4", event: "offer_click" },
      total_eventos_categoria: { section: "PATCH 4.4 Query 2" },
      taxa_conversao_pergunta_recomendacao: { section: "CONVERSION_DASHBOARD" },
      taxa_conversao_recomendacao_clique: { section: "CONVERSION_DASHBOARD" },
      taxa_intencao_pos_recomendacao: { section: "PATCH 4.4 derived" },
    },
    granularity_views: {
      day: "ranking + daily rows",
    },
  },
  conversion: {
    grain: "rolling_window",
    source: "docs/analytics/CONVERSION_DASHBOARD.md + CONVERSION_STRATEGIC_ANALYTICS.md",
    metrics: {
      eventos_recomendacoes: { section: "PATCH 4.3", event: "mia_recommendation_shown" },
      eventos_cliques: { section: "PATCH 4.3", event: "offer_click" },
      eventos_favoritos: { section: "PATCH 4.3", event: "favorite_created" },
      eventos_alertas: { section: "PATCH 4.3", event: "price_alert_created" },
      taxa_clique_recomendacao: { section: "CONVERSION_DASHBOARD CTR" },
      taxa_favoritos_recomendacao: { section: "PATCH 4.3 derived" },
      taxa_alertas_recomendacao: { section: "PATCH 4.3 derived" },
      conversao_acumulada_visitante: { section: "PATCH 4.3 Q1 sequential" },
      taxa_conversao_visitante: { section: "PATCH 4.3 funnel stages" },
      taxa_abandono_transicao: { section: "PATCH 5.3 Q1 bottleneck" },
    },
    granularity_views: {
      day: "summary + funnel_stages + bottlenecks + daily",
    },
  },
});

/** Fields retained per API granularity (service-layer projection — no new SQL) */
export const MIA_TEMPORAL_GRANULARITY_FIELDS = Object.freeze({
  day: null,
  week: Object.freeze([
    "activity_day",
    "wau_visitors",
    "wau_users",
    "crescimento_wau_visitors_pct",
    "crescimento_wau_users_pct",
  ]),
  month: Object.freeze([
    "activity_day",
    "mau_visitors",
    "mau_users",
    "crescimento_mau_visitors_pct",
    "crescimento_mau_users_pct",
  ]),
});

/**
 * @param {unknown} granularity
 */
export function normalizeTemporalGranularity(granularity) {
  const value = String(granularity ?? "day").toLowerCase();
  return MIA_TEMPORAL_SERIES_GRANULARITIES.includes(value) ? value : null;
}

/**
 * @param {unknown} windowDays
 */
export function normalizeTemporalWindowDays(windowDays) {
  const parsed = Number.parseInt(String(windowDays ?? ""), 10);
  if (!Number.isFinite(parsed)) return MIA_TEMPORAL_SERIES_DEFAULT_WINDOW_DAYS;
  return Math.max(1, Math.min(365, parsed));
}

/**
 * @param {unknown} offsetDays
 */
export function normalizeTemporalOffsetDays(offsetDays) {
  const parsed = Number.parseInt(String(offsetDays ?? ""), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(365, parsed));
}

/**
 * @param {unknown} raw
 */
export function parseTemporalSeriesGroups(raw) {
  if (raw == null || String(raw).trim() === "") {
    return [...MIA_TEMPORAL_SERIES_DEFAULT_GROUPS];
  }
  const requested = String(raw)
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(requested)];
  return unique.filter((group) => MIA_TEMPORAL_SERIES_GROUPS.includes(group));
}

/**
 * @param {Array<Record<string, unknown>>} series
 * @param {"day"|"week"|"month"} granularity
 * @param {"growth"|"platform_activity"} group
 */
export function projectTemporalSeriesByGranularity(series, granularity, group) {
  if (!Array.isArray(series) || granularity === "day") return series;
  if (group !== "growth") return series;

  const fields = MIA_TEMPORAL_GRANULARITY_FIELDS[granularity];
  if (!fields) return series;

  return series.map((point) => {
    /** @type {Record<string, unknown>} */
    const projected = {};
    for (const field of fields) {
      if (field in point) projected[field] = point[field];
    }
    return projected;
  });
}
