/**
 * PATCH B.5 — Executive Commercial Performance catalog (Single Source of Truth).
 */

export const FOUNDER_EXECUTIVE_COMMERCIAL_CATALOG_VERSION = "B.5.0";

export const COMMERCIAL_CTR_EXCELLENT = 0.05;
export const COMMERCIAL_CTR_GOOD = 0.02;
export const COMMERCIAL_CTR_ATTENTION = 0.01;

export const COMMERCIAL_ADVANCE_EXCELLENT = 0.5;
export const COMMERCIAL_ADVANCE_GOOD = 0.25;
export const COMMERCIAL_ADVANCE_ATTENTION = 0.1;

export const COMMERCIAL_ACCEPTANCE_EXCELLENT = 0.6;
export const COMMERCIAL_ACCEPTANCE_GOOD = 0.4;
export const COMMERCIAL_ACCEPTANCE_ATTENTION = 0.3;

export const COMMERCIAL_INDEX_EXCELLENT = 75;
export const COMMERCIAL_INDEX_GOOD = 55;
export const COMMERCIAL_INDEX_ATTENTION = 40;

export const COMMERCIAL_VOLUME_HIGH = 100;
export const COMMERCIAL_VOLUME_MEDIUM = 20;
export const COMMERCIAL_VOLUME_LOW = 5;

export const COMMERCIAL_TREND_THRESHOLD = 0.02;

export const COMMERCIAL_BADGE_IDS = Object.freeze({
  EXCELLENT: "excellent",
  HEALTHY: "healthy",
  STABLE: "stable",
  ATTENTION: "attention",
  GROWING: "growing",
  INSUFFICIENT: "insufficient",
});

export const COMMERCIAL_BADGE_LABELS = Object.freeze({
  excellent: "Excelente",
  healthy: "Saudável",
  stable: "Estável",
  attention: "Atenção",
  growing: "Crescendo",
  insufficient: "Volume insuficiente",
});

export const COMMERCIAL_FUNNEL_STAGE_IDS = Object.freeze([
  { id: "sessions", label: "Sessões", source: "platform.total_sessions" },
  { id: "conversations", label: "Conversas", source: "platform.conversations" },
  { id: "questions", label: "Perguntas", source: "platform.questions" },
  { id: "recommendations", label: "Recomendações", source: "recommendation.recommendations_generated" },
  { id: "offers", label: "Ofertas", source: "commerce.offers_returned" },
  { id: "clicks", label: "Cliques", source: "commerce.offer_clicks" },
  { id: "favorites", label: "Favoritos", source: "commerce.favorite_count" },
  { id: "alerts", label: "Alertas", source: "alerts.alerts_created" },
]);

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
export const FOUNDER_EXECUTIVE_COMMERCIAL_INDICATORS = Object.freeze([
  {
    id: "executive_commercial_index",
    title: "Índice executivo comercial",
    description: "Síntese 0–100 de CTR, avanço, aceitação e intenção (sinais observacionais).",
    priority: 1,
    kind: "composite_index",
    source: "derived",
    format: "score",
  },
  {
    id: "offer_advance_rate",
    title: "Taxa de avanço para ofertas",
    description: "Ofertas retornadas / recomendações geradas (snapshot executivo).",
    priority: 2,
    kind: "rate",
    source: "commerce.offers_returned / recommendation.recommendations_generated",
    format: "rate",
  },
  {
    id: "offer_ctr",
    title: "CTR de ofertas",
    description: "Taxa oficial de clique (conversion.summary.taxa_clique_recomendacao).",
    priority: 3,
    kind: "rate",
    source: "temporal.conversion.summary.taxa_clique_recomendacao",
    format: "rate",
  },
  {
    id: "commercial_intent",
    title: "Intenção comercial",
    description: "Favoritos + alertas vs recomendações — sinal de interesse futuro, não compra.",
    priority: 4,
    kind: "intent_rate",
    source: "commerce.favorite_count + alerts.alerts_created",
    format: "rate",
  },
  {
    id: "favorites_generated",
    title: "Favoritos gerados",
    description: "Volume de favoritos (commerce.favorite_count).",
    priority: 5,
    kind: "volume",
    source: "commerce.favorite_count",
    format: "number",
  },
  {
    id: "alerts_created",
    title: "Alertas criados",
    description: "Volume de alertas de preço (alerts.alerts_created).",
    priority: 6,
    kind: "volume",
    source: "alerts.alerts_created",
    format: "number",
  },
  {
    id: "recommendation_acceptance",
    title: "Aceitação de recomendações",
    description: "Taxa oficial (recommendation.recommendation_acceptance_rate).",
    priority: 7,
    kind: "rate",
    source: "recommendation.recommendation_acceptance_rate",
    format: "rate",
  },
  {
    id: "recommendation_utilization",
    title: "Aproveitamento das recomendações",
    description: "Recomendações exibidas / geradas (conversation + recommendation).",
    priority: 8,
    kind: "rate",
    source: "conversation.recommendations_shown / recommendation.recommendations_generated",
    format: "rate",
  },
  {
    id: "funnel_depth",
    title: "Profundidade do funil",
    description: "Etapas com eventos comprovados / etapas mapeadas (snapshot + temporal).",
    priority: 9,
    kind: "depth",
    source: "funnel.stages",
    format: "text",
  },
  {
    id: "commercial_trend",
    title: "Tendência comercial",
    description: "Variação de cliques em ofertas vs período anterior (offset oficial).",
    priority: 10,
    kind: "trend",
    source: "commerce.offer_clicks period compare",
    format: "trend_pct",
  },
]);

export const EXECUTIVE_COMMERCIAL_NARRATIVE_RULES = Object.freeze([
  {
    id: "commercial_growth",
    when: "trend_up",
    text: "A atividade comercial cresceu neste período.",
  },
  {
    id: "interest_low_advance",
    when: "ctr_ok && advance_low",
    text: "As recomendações estão gerando interesse, mas poucos usuários avançam para as ofertas.",
  },
  {
    id: "healthy_ctr",
    when: "ctr_high",
    text: "O CTR está saudável e indica intenção comercial consistente.",
  },
  {
    id: "intent_growth",
    when: "favorites_or_alerts_up",
    text: "Há crescimento em favoritos e alertas, sinalizando interesse futuro.",
  },
  {
    id: "stable_opportunities",
    when: "stable",
    text: "A geração de oportunidades está estável.",
  },
  {
    id: "bottleneck_offers_clicks",
    when: "bottleneck_offers_clicks",
    text: "O principal gargalo está entre ofertas exibidas e cliques.",
  },
  {
    id: "insufficient_volume",
    when: "insufficient_volume",
    text: "Ainda não há volume suficiente para uma conclusão confiável.",
  },
  {
    id: "healthy_default",
    when: "default",
    text: "Performance comercial dentro do padrão observado no período.",
  },
]);

export const COMMERCIAL_EMPTY_MESSAGES = Object.freeze({
  no_data: "Nenhum dado comercial disponível neste período.",
  insufficient_volume: "Ainda não há volume comercial suficiente para avaliar esta etapa.",
  zero_denominator: "Denominador indisponível — taxa não calculada.",
  previous_empty: "Período anterior sem eventos comparáveis.",
  metric_unavailable: "Métrica indisponível no contrato atual.",
});

/**
 * @param {number|null|undefined} totalEvents
 */
export function classifyCommercialVolumeConfidence(totalEvents) {
  if (totalEvents == null || !Number.isFinite(Number(totalEvents))) return "unknown";
  const n = Number(totalEvents);
  if (n >= COMMERCIAL_VOLUME_HIGH) return "high";
  if (n >= COMMERCIAL_VOLUME_MEDIUM) return "medium";
  if (n >= COMMERCIAL_VOLUME_LOW) return "low";
  return "insufficient";
}

/**
 * @param {number|null|undefined} value
 * @param {{ excellent: number, good: number, attention: number, inverse?: boolean }} thresholds
 */
export function classifyCommercialLevel(value, thresholds) {
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
 * @param {{ level?: string, trendDirection?: string, volumeConfidence?: string, commercialIndex?: number|null }} input
 */
export function classifyCommercialBadge(input = {}) {
  if (input.volumeConfidence === "insufficient") {
    return { id: COMMERCIAL_BADGE_IDS.INSUFFICIENT, label: COMMERCIAL_BADGE_LABELS.insufficient };
  }
  if (input.commercialIndex != null && !Number.isNaN(Number(input.commercialIndex))) {
    const idx = Number(input.commercialIndex);
    if (idx >= COMMERCIAL_INDEX_EXCELLENT) {
      return { id: COMMERCIAL_BADGE_IDS.EXCELLENT, label: COMMERCIAL_BADGE_LABELS.excellent };
    }
    if (idx >= COMMERCIAL_INDEX_GOOD) {
      return { id: COMMERCIAL_BADGE_IDS.HEALTHY, label: COMMERCIAL_BADGE_LABELS.healthy };
    }
    if (idx < COMMERCIAL_INDEX_ATTENTION) {
      return { id: COMMERCIAL_BADGE_IDS.ATTENTION, label: COMMERCIAL_BADGE_LABELS.attention };
    }
    return { id: COMMERCIAL_BADGE_IDS.STABLE, label: COMMERCIAL_BADGE_LABELS.stable };
  }
  if (input.trendDirection === "up") {
    return { id: COMMERCIAL_BADGE_IDS.GROWING, label: COMMERCIAL_BADGE_LABELS.growing };
  }
  if (input.level === "excellent") {
    return { id: COMMERCIAL_BADGE_IDS.EXCELLENT, label: COMMERCIAL_BADGE_LABELS.excellent };
  }
  if (input.level === "healthy") {
    return { id: COMMERCIAL_BADGE_IDS.HEALTHY, label: COMMERCIAL_BADGE_LABELS.healthy };
  }
  if (input.level === "attention") {
    return { id: COMMERCIAL_BADGE_IDS.ATTENTION, label: COMMERCIAL_BADGE_LABELS.attention };
  }
  if (input.level === "stable") {
    return { id: COMMERCIAL_BADGE_IDS.STABLE, label: COMMERCIAL_BADGE_LABELS.stable };
  }
  return null;
}
