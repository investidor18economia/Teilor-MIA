/**
 * PATCH B.3 — Executive Platform Growth catalog (Single Source of Truth).
 */

export const FOUNDER_EXECUTIVE_GROWTH_CATALOG_VERSION = "B.3.0";

/** Reuse A.4 stable band */
export const EXECUTIVE_GROWTH_TREND_THRESHOLD = 0.02;

export const EXECUTIVE_GROWTH_ACCELERATION_THRESHOLD = 0.005;

export const EXECUTIVE_GROWTH_VELOCITY_HIGH = 0.1;
export const EXECUTIVE_GROWTH_VELOCITY_MODERATE = 0.03;

export const EXECUTIVE_GROWTH_BADGE_IDS = Object.freeze({
  GROWING: "growing",
  STABLE: "stable",
  ATTENTION: "attention",
  ACCELERATING: "accelerating",
  DECELERATING: "decelerating",
  HEALTHY: "healthy",
});

export const EXECUTIVE_GROWTH_BADGE_LABELS = Object.freeze({
  growing: "Crescendo",
  stable: "Estável",
  attention: "Atenção",
  accelerating: "Acelerando",
  decelerating: "Desacelerando",
  healthy: "Saudável",
});

/**
 * @type {ReadonlyArray<{
 *   id: string,
 *   title: string,
 *   description: string,
 *   priority: number,
 *   kind: string,
 *   source: string,
 * }>}
 */
export const FOUNDER_EXECUTIVE_GROWTH_INDICATORS = Object.freeze([
  {
    id: "user_growth",
    title: "Crescimento de usuários",
    description: "Variação DAU visitantes (oficial — growth.crescimento_dau_visitors_pct).",
    priority: 1,
    kind: "trend_pct",
    source: "temporal.growth.crescimento_dau_visitors_pct",
  },
  {
    id: "session_growth",
    title: "Crescimento de sessões",
    description: "Comparativo período anterior vs atual (executive-metrics snapshot).",
    priority: 2,
    kind: "period_compare",
    source: "executive.platform.total_sessions",
  },
  {
    id: "question_growth",
    title: "Crescimento de perguntas",
    description: "Comparativo período anterior vs atual (executive-metrics snapshot).",
    priority: 3,
    kind: "period_compare",
    source: "executive.platform.questions",
  },
  {
    id: "conversation_growth",
    title: "Crescimento de conversas",
    description: "Comparativo período anterior vs atual (executive-metrics snapshot).",
    priority: 4,
    kind: "period_compare",
    source: "executive.platform.conversations",
  },
  {
    id: "overall_trend",
    title: "Tendência geral",
    description: "Síntese DAU + WAU + MAU (pct oficiais temporais).",
    priority: 5,
    kind: "composite_trend",
    source: "temporal.growth",
  },
  {
    id: "growth_velocity",
    title: "Velocidade de crescimento",
    description: "Magnitud do crescimento DAU diário (campo oficial).",
    priority: 6,
    kind: "velocity",
    source: "temporal.growth.crescimento_dau_visitors_pct",
  },
  {
    id: "growth_acceleration",
    title: "Aceleração",
    description: "Δ entre pct DAU do último dia vs dia anterior (ambos oficiais).",
    priority: 7,
    kind: "acceleration",
    source: "temporal.growth.series",
  },
  {
    id: "daily_engagement",
    title: "Engajamento diário",
    description: "Sessões e perguntas — último dia vs dia anterior (série platform_activity).",
    priority: 8,
    kind: "daily_compare",
    source: "temporal.platform_activity.series",
  },
]);

/**
 * Narrative rule keys → template (placeholders resolved in mapper).
 */
export const EXECUTIVE_GROWTH_NARRATIVE_RULES = Object.freeze([
  {
    id: "consistent_growth",
    when: "dau_up && wau_up",
    text: "Crescimento consistente nas últimas semanas.",
  },
  {
    id: "platform_accelerated",
    when: "acceleration_up",
    text: "A plataforma acelerou neste período.",
  },
  {
    id: "pace_slowed",
    when: "acceleration_down",
    text: "O ritmo caiu em relação ao período anterior.",
  },
  {
    id: "users_up_engagement_stable",
    when: "dau_up && engagement_stable",
    text: "Usuários continuam aumentando, mas o engajamento estabilizou.",
  },
  {
    id: "stable_platform",
    when: "overall_stable",
    text: "A plataforma manteve ritmo estável no período observado.",
  },
  {
    id: "attention_needed",
    when: "dau_down || period_down",
    text: "Sinais de desaceleração merecem atenção executiva.",
  },
  {
    id: "healthy_default",
    when: "default",
    text: "Atividade da plataforma dentro do padrão observado no período.",
  },
]);

/**
 * @param {{ trendPct?: unknown, periodPct?: unknown, acceleration?: string, healthScore?: string }} input
 */
export function classifyExecutiveGrowthBadge(input = {}) {
  if (input.acceleration === "accelerating") {
    return { id: EXECUTIVE_GROWTH_BADGE_IDS.ACCELERATING, label: EXECUTIVE_GROWTH_BADGE_LABELS.accelerating };
  }
  if (input.acceleration === "decelerating") {
    return { id: EXECUTIVE_GROWTH_BADGE_IDS.DECELERATING, label: EXECUTIVE_GROWTH_BADGE_LABELS.decelerating };
  }
  if (input.healthScore === "healthy") {
    return { id: EXECUTIVE_GROWTH_BADGE_IDS.HEALTHY, label: EXECUTIVE_GROWTH_BADGE_LABELS.healthy };
  }
  const pct = input.trendPct ?? input.periodPct;
  if (pct != null && !Number.isNaN(Number(pct))) {
    const n = Number(pct);
    if (n > EXECUTIVE_GROWTH_TREND_THRESHOLD) {
      return { id: EXECUTIVE_GROWTH_BADGE_IDS.GROWING, label: EXECUTIVE_GROWTH_BADGE_LABELS.growing };
    }
    if (n < -EXECUTIVE_GROWTH_TREND_THRESHOLD) {
      return { id: EXECUTIVE_GROWTH_BADGE_IDS.ATTENTION, label: EXECUTIVE_GROWTH_BADGE_LABELS.attention };
    }
    return { id: EXECUTIVE_GROWTH_BADGE_IDS.STABLE, label: EXECUTIVE_GROWTH_BADGE_LABELS.stable };
  }
  return null;
}
