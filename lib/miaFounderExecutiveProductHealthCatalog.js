/**
 * PATCH B.4 — Executive Product Health catalog (Single Source of Truth).
 */

export const FOUNDER_EXECUTIVE_PRODUCT_HEALTH_CATALOG_VERSION = "B.4.0";

export const PRODUCT_HEALTH_ACCEPTANCE_EXCELLENT = 0.6;
export const PRODUCT_HEALTH_ACCEPTANCE_GOOD = 0.4;
export const PRODUCT_HEALTH_ACCEPTANCE_ATTENTION = 0.3;

export const PRODUCT_HEALTH_REJECTION_EXCELLENT = 0.2;
export const PRODUCT_HEALTH_REJECTION_ATTENTION = 0.4;

export const PRODUCT_HEALTH_QUALITY_EXCELLENT = 80;
export const PRODUCT_HEALTH_QUALITY_GOOD = 60;
export const PRODUCT_HEALTH_QUALITY_ATTENTION = 50;

export const PRODUCT_HEALTH_SCORE_EXCELLENT = 70;
export const PRODUCT_HEALTH_SCORE_GOOD = 50;
export const PRODUCT_HEALTH_SCORE_ATTENTION = 40;

export const PRODUCT_HEALTH_CONVERSATION_EXCELLENT = 0.7;
export const PRODUCT_HEALTH_CONVERSATION_GOOD = 0.5;
export const PRODUCT_HEALTH_CONVERSATION_ATTENTION = 0.35;

export const PRODUCT_HEALTH_INDEX_EXCELLENT = 75;
export const PRODUCT_HEALTH_INDEX_GOOD = 55;
export const PRODUCT_HEALTH_INDEX_ATTENTION = 40;

export const PRODUCT_HEALTH_PERIOD_DELTA_ATTENTION = -0.05;

export const PRODUCT_HEALTH_BADGE_IDS = Object.freeze({
  EXCELLENT: "excellent",
  HEALTHY: "healthy",
  STABLE: "stable",
  ATTENTION: "attention",
  DEGRADING: "degrading",
});

export const PRODUCT_HEALTH_BADGE_LABELS = Object.freeze({
  excellent: "Excelente",
  healthy: "Saudável",
  stable: "Estável",
  attention: "Atenção",
  degrading: "Degradando",
});

/**
 * @type {ReadonlyArray<{
 *   id: string,
 *   title: string,
 *   description: string,
 *   priority: number,
 *   kind: string,
 *   source: string,
 *   format: string,
 * }>}
 */
export const FOUNDER_EXECUTIVE_PRODUCT_HEALTH_INDICATORS = Object.freeze([
  {
    id: "recommendation_quality",
    title: "Qualidade das recomendações",
    description: "Score médio de qualidade de preço (price_intelligence.average_price_quality_score).",
    priority: 1,
    kind: "score",
    source: "executive.price_intelligence.average_price_quality_score",
    format: "score",
  },
  {
    id: "recommendation_acceptance",
    title: "Aceitação das recomendações",
    description: "Taxa oficial de aceitação (recommendation.recommendation_acceptance_rate).",
    priority: 2,
    kind: "rate",
    source: "executive.recommendation.recommendation_acceptance_rate",
    format: "rate",
  },
  {
    id: "recommendation_rejection",
    title: "Rejeição",
    description: "Taxa oficial de rejeição (recommendation.rejection_rate).",
    priority: 3,
    kind: "rate_inverse",
    source: "executive.recommendation.rejection_rate",
    format: "rate",
  },
  {
    id: "user_confidence",
    title: "Confiança do usuário",
    description: "Score médio observacional (user_value.average_user_value + anti_regret.average_score).",
    priority: 4,
    kind: "composite_score",
    source: "executive.user_value.average_user_value",
    format: "score",
  },
  {
    id: "runner_up_usage",
    title: "Uso de runner-up",
    description: "Utilização de alternativas (recommendation.runner_up_usage).",
    priority: 5,
    kind: "volume",
    source: "executive.recommendation.runner_up_usage",
    format: "number",
  },
  {
    id: "conversation_health",
    title: "Saúde das conversas",
    description: "Conversas com perguntas / total de conversas (snapshot oficial).",
    priority: 6,
    kind: "ratio",
    source: "executive.conversation.conversations_with_questions / platform.conversations",
    format: "rate",
  },
  {
    id: "overall_product_quality",
    title: "Qualidade geral do produto",
    description: "Síntese qualidade + aceitação + confiança (campos oficiais disponíveis).",
    priority: 7,
    kind: "composite_index",
    source: "derived",
    format: "score",
  },
  {
    id: "executive_health_index",
    title: "Índice executivo de saúde",
    description: "Índice 0–100 derivado dos sinais oficiais do período.",
    priority: 8,
    kind: "health_index",
    source: "derived",
    format: "score",
  },
]);

export const EXECUTIVE_PRODUCT_HEALTH_NARRATIVE_RULES = Object.freeze([
  {
    id: "excellent_quality",
    when: "quality_excellent && acceptance_good",
    text: "O produto mantém excelente qualidade de recomendações.",
  },
  {
    id: "acceptance_drop",
    when: "acceptance_period_down",
    text: "Há sinais leves de queda na aceitação.",
  },
  {
    id: "confidence_high",
    when: "user_confidence_high",
    text: "A confiança permanece elevada.",
  },
  {
    id: "users_finding_value",
    when: "value_signals_positive",
    text: "Usuários continuam encontrando valor.",
  },
  {
    id: "conversation_attention",
    when: "conversation_low",
    text: "Existe um ponto de atenção nas conversas.",
  },
  {
    id: "rejection_attention",
    when: "rejection_high",
    text: "Sinais de rejeição merecem atenção executiva.",
  },
  {
    id: "healthy_default",
    when: "default",
    text: "Saúde do produto dentro do padrão observado no período.",
  },
]);

/**
 * @param {number|null|undefined} value
 * @param {{ excellent: number, good: number, attention: number, inverse?: boolean }} thresholds
 */
export function classifyProductHealthLevel(value, thresholds) {
  if (value == null || Number.isNaN(Number(value))) return "unknown";
  const n = Number(value);
  if (thresholds.inverse) {
    if (n <= thresholds.excellent) return "excellent";
    if (n <= thresholds.good) return "healthy";
    if (n >= thresholds.attention) return "attention";
    return "stable";
  }
  if (n >= thresholds.excellent) return "excellent";
  if (n >= thresholds.good) return "healthy";
  if (n < thresholds.attention) return "attention";
  return "stable";
}

/**
 * @param {{ level?: string, periodDelta?: number|null, healthIndex?: number|null }} input
 */
export function classifyProductHealthBadge(input = {}) {
  if (input.periodDelta != null && Number(input.periodDelta) <= PRODUCT_HEALTH_PERIOD_DELTA_ATTENTION) {
    return { id: PRODUCT_HEALTH_BADGE_IDS.DEGRADING, label: PRODUCT_HEALTH_BADGE_LABELS.degrading };
  }
  if (input.healthIndex != null && !Number.isNaN(Number(input.healthIndex))) {
    const idx = Number(input.healthIndex);
    if (idx >= PRODUCT_HEALTH_INDEX_EXCELLENT) {
      return { id: PRODUCT_HEALTH_BADGE_IDS.EXCELLENT, label: PRODUCT_HEALTH_BADGE_LABELS.excellent };
    }
    if (idx >= PRODUCT_HEALTH_INDEX_GOOD) {
      return { id: PRODUCT_HEALTH_BADGE_IDS.HEALTHY, label: PRODUCT_HEALTH_BADGE_LABELS.healthy };
    }
    if (idx < PRODUCT_HEALTH_INDEX_ATTENTION) {
      return { id: PRODUCT_HEALTH_BADGE_IDS.ATTENTION, label: PRODUCT_HEALTH_BADGE_LABELS.attention };
    }
    return { id: PRODUCT_HEALTH_BADGE_IDS.STABLE, label: PRODUCT_HEALTH_BADGE_LABELS.stable };
  }
  if (input.level === "excellent") {
    return { id: PRODUCT_HEALTH_BADGE_IDS.EXCELLENT, label: PRODUCT_HEALTH_BADGE_LABELS.excellent };
  }
  if (input.level === "healthy") {
    return { id: PRODUCT_HEALTH_BADGE_IDS.HEALTHY, label: PRODUCT_HEALTH_BADGE_LABELS.healthy };
  }
  if (input.level === "attention") {
    return { id: PRODUCT_HEALTH_BADGE_IDS.ATTENTION, label: PRODUCT_HEALTH_BADGE_LABELS.attention };
  }
  if (input.level === "stable") {
    return { id: PRODUCT_HEALTH_BADGE_IDS.STABLE, label: PRODUCT_HEALTH_BADGE_LABELS.stable };
  }
  return null;
}
