/**
 * PATCH C.4 — Executive Trend catalog (C.4.0).
 * Single source of truth for directions, types, magnitudes, semantics, thresholds.
 * No SQL · no fetch · no LLM.
 */

import { EXECUTIVE_ANALYSIS_MODULE_IDS } from "./miaExecutiveAnalysisContracts.js";

export const MIA_EXECUTIVE_TREND_CATALOG_VERSION = "C.4.0";

export const EXECUTIVE_TREND_DIRECTIONS = Object.freeze({
  UP: "up",
  DOWN: "down",
  STABLE: "stable",
  MIXED: "mixed",
  UNKNOWN: "unknown",
});

export const EXECUTIVE_TREND_TYPES = Object.freeze({
  GROWTH: "growth",
  DECLINE: "decline",
  STABILITY: "stability",
  ACCELERATION: "acceleration",
  DECELERATION: "deceleration",
  REVERSAL: "reversal",
  PERSISTENCE: "persistence",
  VOLATILITY: "volatility",
  PRELIMINARY_SIGNAL: "preliminary_signal",
  INSUFFICIENT_DATA: "insufficient_data",
});

export const EXECUTIVE_TREND_TYPES_SUPPORTED = Object.freeze([
  EXECUTIVE_TREND_TYPES.GROWTH,
  EXECUTIVE_TREND_TYPES.DECLINE,
  EXECUTIVE_TREND_TYPES.STABILITY,
  EXECUTIVE_TREND_TYPES.ACCELERATION,
  EXECUTIVE_TREND_TYPES.DECELERATION,
  EXECUTIVE_TREND_TYPES.PRELIMINARY_SIGNAL,
  EXECUTIVE_TREND_TYPES.INSUFFICIENT_DATA,
]);

export const EXECUTIVE_TREND_TYPES_BLOCKED = Object.freeze([
  EXECUTIVE_TREND_TYPES.REVERSAL,
  EXECUTIVE_TREND_TYPES.PERSISTENCE,
  EXECUTIVE_TREND_TYPES.VOLATILITY,
]);

export const EXECUTIVE_TREND_STATUSES = Object.freeze({
  CONFIRMED: "confirmed",
  PRELIMINARY: "preliminary",
  INSUFFICIENT: "insufficient",
  STATE_ONLY: "state_only",
});

export const EXECUTIVE_TREND_MAGNITUDES = Object.freeze({
  NEGLIGIBLE: "negligible",
  SMALL: "small",
  MODERATE: "moderate",
  STRONG: "strong",
  UNKNOWN: "unknown",
});

export const EXECUTIVE_TREND_CATEGORIES = Object.freeze({
  GROWTH: "growth",
  PRODUCT: "product",
  COMMERCIAL: "commercial",
  OPERATIONAL: "operational",
  PLATFORM: "platform",
  GENERAL: "general",
});

export const EXECUTIVE_TREND_SEMANTICS = Object.freeze({
  HIGHER_IS_BETTER: "higher_is_better",
  LOWER_IS_BETTER: "lower_is_better",
  NEUTRAL: "neutral",
});

export const EXECUTIVE_TREND_CONFIDENCE_LEVELS = Object.freeze({
  HIGH: "high",
  MODERATE: "moderate",
  LOW: "low",
  INSUFFICIENT: "insufficient_data",
});

export const EXECUTIVE_TREND_EMPTY_MESSAGES = Object.freeze({
  insufficient:
    "Os dados disponíveis ainda não permitem confirmar uma tendência para este indicador.",
  no_period_compare: "Comparativo de período indisponível para este módulo.",
  low_volume: "Volume insuficiente para tendência confirmada.",
  module_unavailable: "Módulo executivo indisponível.",
  blocked_type:
    "Tipo de tendência preparado no contrato, porém bloqueado por evidência temporal insuficiente.",
});

export const EXECUTIVE_TREND_MAGNITUDE_THRESHOLDS_PCT = Object.freeze({
  negligible: 0.01,
  small: 0.03,
  moderate: 0.08,
  strong: 0.15,
});

export const EXECUTIVE_TREND_MAGNITUDE_THRESHOLDS_RATE = Object.freeze({
  negligible: 0.005,
  small: 0.02,
  moderate: 0.05,
  strong: 0.1,
});

export const EXECUTIVE_TREND_CONFIRMED_MIN_PCT = 0.02;
export const EXECUTIVE_TREND_CONFIRMED_MIN_RATE_DELTA = 0.01;
export const EXECUTIVE_TREND_MIN_OBSERVATIONS_CONFIRMED = 2;
export const EXECUTIVE_TREND_MIN_OBSERVATIONS_PERSISTENCE = 3;

export const EXECUTIVE_TREND_CAUSALITY_BLOCKLIST = Object.freeze([
  /\bporque\b/i,
  /\bdevido a\b/i,
  /\bcausad[oa] por\b/i,
  /\bresultado de\b/i,
  /\bconsequência de\b/i,
]);

export const EXECUTIVE_TREND_SIGNAL_DEFINITIONS = Object.freeze([
  {
    signal_key: "growth.user_growth",
    metric_label: "Crescimento de usuários (DAU)",
    category: "growth",
    module_id: "growth",
    indicator_id: "user_growth",
    kind: "pct",
    semantics: EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER,
    dedup_group: "growth_user",
    priority: 1,
  },
  {
    signal_key: "growth.session_growth",
    metric_label: "Crescimento de sessões",
    category: "growth",
    module_id: "growth",
    indicator_id: "session_growth",
    kind: "pct",
    semantics: EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER,
    dedup_group: "growth_session",
    priority: 2,
  },
  {
    signal_key: "growth.question_growth",
    metric_label: "Crescimento de perguntas",
    category: "growth",
    module_id: "growth",
    indicator_id: "question_growth",
    kind: "pct",
    semantics: EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER,
    dedup_group: "growth_question",
    priority: 3,
  },
  {
    signal_key: "growth.conversation_growth",
    metric_label: "Crescimento de conversas",
    category: "growth",
    module_id: "growth",
    indicator_id: "conversation_growth",
    kind: "pct",
    semantics: EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER,
    dedup_group: "growth_conversation",
    priority: 4,
  },
  {
    signal_key: "growth.overall_trend",
    metric_label: "Tendência geral de crescimento",
    category: "growth",
    module_id: "growth",
    indicator_id: "overall_trend",
    kind: "pct",
    semantics: EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER,
    dedup_group: "growth_overall",
    priority: 5,
  },
  {
    signal_key: "growth.acceleration",
    metric_label: "Aceleração de crescimento DAU",
    category: "growth",
    module_id: "growth",
    indicator_id: "growth_acceleration",
    kind: "acceleration",
    semantics: EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER,
    dedup_group: "growth_acceleration",
    priority: 6,
  },
  {
    signal_key: "health.recommendation_acceptance",
    metric_label: "Taxa de aceitação de recomendações",
    category: "product",
    module_id: "health",
    indicator_id: "recommendation_acceptance",
    kind: "rate_delta",
    semantics: EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER,
    dedup_group: "health_acceptance",
    priority: 7,
  },
  {
    signal_key: "health.recommendation_rejection",
    metric_label: "Taxa de rejeição de recomendações",
    category: "product",
    module_id: "health",
    indicator_id: "recommendation_rejection",
    kind: "rate_delta",
    semantics: EXECUTIVE_TREND_SEMANTICS.LOWER_IS_BETTER,
    dedup_group: "health_rejection",
    priority: 8,
  },
  {
    signal_key: "commercial.trend",
    metric_label: "Tendência comercial (cliques em ofertas)",
    category: "commercial",
    module_id: "commercial",
    indicator_id: "commercial_trend",
    kind: "pct",
    semantics: EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER,
    dedup_group: "commercial_trend",
    priority: 9,
  },
  {
    signal_key: "commercial.favorites",
    metric_label: "Favoritos gerados",
    category: "commercial",
    module_id: "commercial",
    indicator_id: "favorites_generated",
    kind: "pct",
    semantics: EXECUTIVE_TREND_SEMANTICS.NEUTRAL,
    dedup_group: "commercial_favorites",
    priority: 10,
  },
  {
    signal_key: "commercial.alerts",
    metric_label: "Alertas criados",
    category: "commercial",
    module_id: "commercial",
    indicator_id: "alerts_created",
    kind: "pct",
    semantics: EXECUTIVE_TREND_SEMANTICS.NEUTRAL,
    dedup_group: "commercial_alerts",
    priority: 11,
  },
]);

export const EXECUTIVE_TREND_MODULE_IDS = Object.freeze([...EXECUTIVE_ANALYSIS_MODULE_IDS]);

export const EXECUTIVE_TREND_INTERPRETATION_TEMPLATES = Object.freeze({
  confirmed_up:
    "{metric_label} apresentou alta {magnitude_label} em relação ao período anterior ({period_label}).",
  confirmed_down:
    "{metric_label} apresentou queda {magnitude_label} em relação ao período anterior ({period_label}).",
  confirmed_stable: "{metric_label} manteve estabilidade em relação ao período anterior ({period_label}).",
  acceleration: "{metric_label} registra aceleração observável entre observações temporais disponíveis.",
  deceleration: "{metric_label} registra desaceleração observável entre observações temporais disponíveis.",
  preliminary:
    "{metric_label} apresenta variação preliminar — evidência temporal insuficiente para tendência confirmada.",
  insufficient: "Os dados disponíveis ainda não permitem confirmar uma tendência para este indicador.",
});

export const EXECUTIVE_TREND_MAGNITUDE_LABELS = Object.freeze({
  negligible: "negligível",
  small: "pequena",
  moderate: "moderada",
  strong: "forte",
  unknown: "indeterminada",
});
