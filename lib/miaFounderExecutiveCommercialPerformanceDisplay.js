/**
 * PATCH B.5 — Executive Commercial Performance display mapping (B.5.0).
 * Sources: GET /api/executive-metrics + GET /api/temporal-metrics?series=conversion
 * No SQL · No Supabase · No fetch.
 */

import {
  FOUNDER_EXECUTIVE_COMMERCIAL_INDICATORS,
  FOUNDER_EXECUTIVE_COMMERCIAL_CATALOG_VERSION,
  EXECUTIVE_COMMERCIAL_NARRATIVE_RULES,
  COMMERCIAL_FUNNEL_STAGE_IDS,
  COMMERCIAL_EMPTY_MESSAGES,
  COMMERCIAL_CTR_EXCELLENT,
  COMMERCIAL_CTR_GOOD,
  COMMERCIAL_CTR_ATTENTION,
  COMMERCIAL_ADVANCE_EXCELLENT,
  COMMERCIAL_ADVANCE_GOOD,
  COMMERCIAL_ADVANCE_ATTENTION,
  COMMERCIAL_ACCEPTANCE_EXCELLENT,
  COMMERCIAL_ACCEPTANCE_GOOD,
  COMMERCIAL_ACCEPTANCE_ATTENTION,
  classifyCommercialLevel,
  classifyCommercialBadge,
  classifyCommercialVolumeConfidence,
} from "./miaFounderExecutiveCommercialPerformanceCatalog.js";
import { computePeriodChangePct } from "./miaFounderExecutiveGrowthDisplay.js";
import {
  classifyTrendDirection,
  formatTrendDirectionLabel,
  formatTrendPercent,
} from "./miaFounderGrowthDisplay.js";
import { formatFounderMetricValue } from "./miaFounderCockpitDisplay.js";
import { formatPublicMetricRate } from "./miaPublicMetricsDisplay.js";

export const FOUNDER_EXECUTIVE_COMMERCIAL_DISPLAY_VERSION = "B.5.0";

const BOTTLENECK_LABELS = {
  sessao_para_pergunta: "Sessão → pergunta",
  pergunta_para_recomendacao: "Pergunta → recomendação",
  recomendacao_para_clique: "Recomendação → clique",
  clique_para_favorito: "Clique → favorito",
  favorito_para_alerta: "Favorito → alerta",
};

/**
 * Safe ratio — returns null when denominator invalid (never invent rates).
 * @param {unknown} numerator
 * @param {unknown} denominator
 */
export function computeCommercialRatio(numerator, denominator) {
  const num = Number(numerator);
  const den = Number(denominator);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

/**
 * @param {number[]} normalizedValues 0–1
 */
export function computeExecutiveCommercialIndex(normalizedValues) {
  const valid = normalizedValues.filter((v) => v != null && Number.isFinite(v));
  if (!valid.length) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100);
}

/**
 * @param {Record<string, unknown>} groups
 */
export function buildExecutiveCommercialFunnel(groups) {
  const platform = groups.platform ?? {};
  const recommendation = groups.recommendation ?? {};
  const commerce = groups.commerce ?? {};
  const alerts = groups.alerts ?? {};

  const values = {
    sessions: platform.total_sessions,
    conversations: platform.conversations,
    questions: platform.questions,
    recommendations: recommendation.recommendations_generated,
    offers: commerce.offers_returned,
    clicks: commerce.offer_clicks,
    favorites: commerce.favorite_count,
    alerts: alerts.alerts_created,
  };

  return COMMERCIAL_FUNNEL_STAGE_IDS.map((def) => {
    const value = values[def.id];
    const hasEvents = value != null && Number.isFinite(Number(value)) && Number(value) > 0;
    return {
      id: def.id,
      label: def.label,
      value,
      valueFormatted: formatFounderMetricValue({ format: "number", value }),
      hasEvents,
      available: value != null && !Number.isNaN(Number(value)),
    };
  }).filter((stage) => stage.available);
}

/**
 * @param {{
 *   trendDirection?: string,
 *   ctrLevel?: string,
 *   advanceLevel?: string,
 *   advanceLow?: boolean,
 *   favoritesOrAlertsUp?: boolean,
 *   bottleneckOffersClicks?: boolean,
 *   volumeConfidence?: string,
 *   overallStable?: boolean,
 * }} signals
 */
export function resolveExecutiveCommercialNarrative(signals) {
  if (signals.volumeConfidence === "insufficient") {
    return EXECUTIVE_COMMERCIAL_NARRATIVE_RULES.find((r) => r.id === "insufficient_volume")?.text;
  }
  if (signals.trendDirection === "up") {
    return EXECUTIVE_COMMERCIAL_NARRATIVE_RULES.find((r) => r.id === "commercial_growth")?.text;
  }
  if (signals.bottleneckOffersClicks) {
    return EXECUTIVE_COMMERCIAL_NARRATIVE_RULES.find((r) => r.id === "bottleneck_offers_clicks")?.text;
  }
  if (
    (signals.ctrLevel === "excellent" || signals.ctrLevel === "healthy") &&
    signals.advanceLow
  ) {
    return EXECUTIVE_COMMERCIAL_NARRATIVE_RULES.find((r) => r.id === "interest_low_advance")?.text;
  }
  if (signals.ctrLevel === "excellent" || signals.ctrLevel === "healthy") {
    return EXECUTIVE_COMMERCIAL_NARRATIVE_RULES.find((r) => r.id === "healthy_ctr")?.text;
  }
  if (signals.favoritesOrAlertsUp) {
    return EXECUTIVE_COMMERCIAL_NARRATIVE_RULES.find((r) => r.id === "intent_growth")?.text;
  }
  if (signals.overallStable) {
    return EXECUTIVE_COMMERCIAL_NARRATIVE_RULES.find((r) => r.id === "stable_opportunities")?.text;
  }
  return EXECUTIVE_COMMERCIAL_NARRATIVE_RULES.find((r) => r.id === "healthy_default")?.text;
}

/**
 * @param {Record<string, unknown>|null|undefined} executiveCurrent
 * @param {Record<string, unknown>|null|undefined} executivePrevious
 * @param {Record<string, unknown>|null|undefined} temporal
 */
export function mapExecutiveCommercialPerformanceToFounderDisplay(
  executiveCurrent,
  executivePrevious,
  temporal
) {
  const partialErrors = Array.isArray(executiveCurrent?.partial_errors)
    ? [...executiveCurrent.partial_errors]
    : [];
  if (executivePrevious?.partial_errors?.length) {
    partialErrors.push(
      ...executivePrevious.partial_errors.map((e) => ({ ...e, scope: "previous_period" }))
    );
  }
  if (temporal?.partial_errors?.length) {
    partialErrors.push(...temporal.partial_errors);
  }

  const platform = executiveCurrent?.platform ?? {};
  const conversation = executiveCurrent?.conversation ?? {};
  const recommendation = executiveCurrent?.recommendation ?? {};
  const commerce = executiveCurrent?.commerce ?? {};
  const alerts = executiveCurrent?.alerts ?? {};

  const prevCommerce = executivePrevious?.commerce ?? null;
  const prevAlerts = executivePrevious?.alerts ?? null;
  const hasPeriodCompare = executivePrevious != null;

  const conversionSummary = temporal?.conversion?.summary ?? {};
  const bottlenecks = Array.isArray(temporal?.conversion?.bottlenecks)
    ? temporal.conversion.bottlenecks
    : [];
  const mainBottleneck =
    bottlenecks.find((b) => b.is_gargalo_principal === true) ?? bottlenecks[0] ?? null;

  const ctr = conversionSummary.taxa_clique_recomendacao ?? null;
  const ctrLevel = classifyCommercialLevel(ctr, {
    excellent: COMMERCIAL_CTR_EXCELLENT,
    good: COMMERCIAL_CTR_GOOD,
    attention: COMMERCIAL_CTR_ATTENTION,
  });

  const offerAdvanceRate = computeCommercialRatio(
    commerce.offers_returned,
    recommendation.recommendations_generated
  );
  const advanceLevel = classifyCommercialLevel(offerAdvanceRate, {
    excellent: COMMERCIAL_ADVANCE_EXCELLENT,
    good: COMMERCIAL_ADVANCE_GOOD,
    attention: COMMERCIAL_ADVANCE_ATTENTION,
  });

  const acceptanceRate = recommendation.recommendation_acceptance_rate ?? null;
  const acceptanceLevel = classifyCommercialLevel(acceptanceRate, {
    excellent: COMMERCIAL_ACCEPTANCE_EXCELLENT,
    good: COMMERCIAL_ACCEPTANCE_GOOD,
    attention: COMMERCIAL_ACCEPTANCE_ATTENTION,
  });

  const utilizationRate = computeCommercialRatio(
    conversation.recommendations_shown,
    recommendation.recommendations_generated
  );

  const intentNumerator =
    Number(commerce.favorite_count ?? 0) + Number(alerts.alerts_created ?? 0);
  const intentRate = computeCommercialRatio(intentNumerator, recommendation.recommendations_generated);

  const clicksPeriodPct = hasPeriodCompare
    ? computePeriodChangePct(commerce.offer_clicks, prevCommerce?.offer_clicks)
    : null;
  const favoritesPeriodPct = hasPeriodCompare
    ? computePeriodChangePct(commerce.favorite_count, prevCommerce?.favorite_count)
    : null;
  const alertsPeriodPct = hasPeriodCompare
    ? computePeriodChangePct(alerts.alerts_created, prevAlerts?.alerts_created)
    : null;

  const trendDirection = classifyTrendDirection(clicksPeriodPct);
  const favoritesOrAlertsUp =
    (favoritesPeriodPct != null && favoritesPeriodPct > 0) ||
    (alertsPeriodPct != null && alertsPeriodPct > 0);

  const funnelStages = buildExecutiveCommercialFunnel({
    platform,
    recommendation,
    commerce,
    alerts,
  });
  const stagesWithEvents = funnelStages.filter((s) => s.hasEvents).length;
  const funnelDepthLabel =
    funnelStages.length > 0
      ? `${stagesWithEvents}/${funnelStages.length} etapas com eventos`
      : COMMERCIAL_EMPTY_MESSAGES.no_data;

  const totalCommercialEvents =
    Number(recommendation.recommendations_generated ?? 0) +
    Number(commerce.offer_clicks ?? 0) +
    Number(commerce.favorite_count ?? 0);
  const volumeConfidence = classifyCommercialVolumeConfidence(totalCommercialEvents);

  const normalizedForIndex = [
    ctr != null ? Math.min(1, Number(ctr) / COMMERCIAL_CTR_EXCELLENT) : null,
    offerAdvanceRate,
    acceptanceRate,
    intentRate,
    utilizationRate,
  ].filter((v) => v != null);

  const commercialIndex = computeExecutiveCommercialIndex(normalizedForIndex);

  const bottleneckOffersClicks =
    mainBottleneck?.transicao === "recomendacao_para_clique" ||
    mainBottleneck?.transicao === "pergunta_para_recomendacao";

  const narrative = resolveExecutiveCommercialNarrative({
    trendDirection,
    ctrLevel,
    advanceLevel,
    advanceLow: advanceLevel === "attention" || advanceLevel === "unknown",
    favoritesOrAlertsUp,
    bottleneckOffersClicks,
    volumeConfidence,
    overallStable: trendDirection === "stable" && ctrLevel === "stable",
  });

  const headlineBadge = classifyCommercialBadge({
    commercialIndex,
    volumeConfidence,
    trendDirection,
  });

  const indicatorValues = {
    executive_commercial_index: {
      value: commercialIndex,
      level: classifyCommercialLevel(commercialIndex, {
        excellent: 75,
        good: 55,
        attention: 40,
      }),
      valueFormatted: commercialIndex != null ? `${commercialIndex}/100` : "—",
      detail: `${normalizedForIndex.length} sinais considerados · confiança: ${volumeConfidence}`,
      volumeConfidence,
    },
    offer_advance_rate: {
      value: offerAdvanceRate,
      level: advanceLevel,
      valueFormatted:
        offerAdvanceRate != null
          ? formatFounderMetricValue({ format: "rate", value: offerAdvanceRate })
          : COMMERCIAL_EMPTY_MESSAGES.zero_denominator,
      detail: `${formatFounderMetricValue({ format: "number", value: commerce.offers_returned })} ofertas / ${formatFounderMetricValue({ format: "number", value: recommendation.recommendations_generated })} recomendações`,
    },
    offer_ctr: {
      value: ctr,
      level: ctrLevel,
      valueFormatted:
        ctr != null
          ? formatFounderMetricValue({ format: "rate", value: ctr })
          : COMMERCIAL_EMPTY_MESSAGES.metric_unavailable,
      hint: "Observacional — clique não representa compra concluída.",
    },
    commercial_intent: {
      value: intentRate,
      level: classifyCommercialLevel(intentRate, {
        excellent: 0.15,
        good: 0.08,
        attention: 0.03,
      }),
      valueFormatted:
        intentRate != null
          ? formatFounderMetricValue({ format: "rate", value: intentRate })
          : COMMERCIAL_EMPTY_MESSAGES.zero_denominator,
      detail: "Favoritos + alertas — interesse futuro, não receita.",
    },
    favorites_generated: {
      value: commerce.favorite_count,
      level: Number(commerce.favorite_count) > 0 ? "healthy" : "stable",
      valueFormatted: formatFounderMetricValue({ format: "number", value: commerce.favorite_count }),
      periodDelta: favoritesPeriodPct,
      periodDeltaFormatted: formatTrendPercent(favoritesPeriodPct),
      direction: classifyTrendDirection(favoritesPeriodPct),
      directionLabel: formatTrendDirectionLabel(classifyTrendDirection(favoritesPeriodPct)),
    },
    alerts_created: {
      value: alerts.alerts_created,
      level: Number(alerts.alerts_created) > 0 ? "healthy" : "stable",
      valueFormatted: formatFounderMetricValue({ format: "number", value: alerts.alerts_created }),
      periodDelta: alertsPeriodPct,
      periodDeltaFormatted: formatTrendPercent(alertsPeriodPct),
      direction: classifyTrendDirection(alertsPeriodPct),
      directionLabel: formatTrendDirectionLabel(classifyTrendDirection(alertsPeriodPct)),
    },
    recommendation_acceptance: {
      value: acceptanceRate,
      level: acceptanceLevel,
      valueFormatted: formatFounderMetricValue({ format: "rate", value: acceptanceRate }),
      hint: "Sinais observacionais — não representa satisfação.",
    },
    recommendation_utilization: {
      value: utilizationRate,
      level: classifyCommercialLevel(utilizationRate, {
        excellent: 0.8,
        good: 0.5,
        attention: 0.3,
      }),
      valueFormatted:
        utilizationRate != null
          ? formatFounderMetricValue({ format: "rate", value: utilizationRate })
          : COMMERCIAL_EMPTY_MESSAGES.zero_denominator,
      detail: "Exibidas / geradas no período.",
    },
    funnel_depth: {
      value: stagesWithEvents,
      level: stagesWithEvents >= 5 ? "healthy" : stagesWithEvents >= 3 ? "stable" : "attention",
      valueFormatted: funnelDepthLabel,
      detail:
        stagesWithEvents === 0
          ? COMMERCIAL_EMPTY_MESSAGES.insufficient_volume
          : `${stagesWithEvents} etapas ativas no funil comercial.`,
    },
    commercial_trend: {
      value: clicksPeriodPct,
      level: classifyCommercialLevel(
        clicksPeriodPct != null ? Math.abs(clicksPeriodPct) : null,
        { excellent: 0.1, good: 0.03, attention: 0 }
      ),
      valueFormatted: formatTrendPercent(clicksPeriodPct),
      direction: trendDirection,
      directionLabel: formatTrendDirectionLabel(trendDirection),
      hint: hasPeriodCompare
        ? "Cliques em ofertas vs período anterior (offset oficial)."
        : COMMERCIAL_EMPTY_MESSAGES.previous_empty,
    },
  };

  const indicators = FOUNDER_EXECUTIVE_COMMERCIAL_INDICATORS.map((def) => {
    const data = indicatorValues[def.id] ?? {};
    const badge = classifyCommercialBadge({
      level: data.level,
      trendDirection: data.direction,
      volumeConfidence: def.id === "executive_commercial_index" ? data.volumeConfidence : undefined,
      commercialIndex: def.id === "executive_commercial_index" ? data.value : undefined,
    });
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      priority: def.priority,
      kind: def.kind,
      format: def.format,
      ...data,
      badge,
    };
  }).sort((a, b) => a.priority - b.priority);

  let status = "success";
  if (!executiveCurrent) status = "error";
  else if (!funnelStages.length && !conversionSummary.eventos_recomendacoes) status = "empty";
  else if (partialErrors.length || !hasPeriodCompare || volumeConfidence === "insufficient") {
    status = "partial";
  }

  return {
    meta: {
      display_version: FOUNDER_EXECUTIVE_COMMERCIAL_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_COMMERCIAL_CATALOG_VERSION,
      metrics_version: executiveCurrent?.metrics_version ?? null,
      temporal_version: temporal?.temporal_version ?? null,
      period_compare_available: hasPeriodCompare,
      volume_confidence: volumeConfidence,
      computed_at: executiveCurrent?.computed_at ?? temporal?.computed_at ?? null,
      status,
      partial_errors: partialErrors,
      disclaimer:
        "Sinais comerciais observacionais — cliques, favoritos e alertas não representam compra concluída.",
    },
    narrative: {
      headline: narrative,
      badge: headlineBadge,
    },
    commercial_index: {
      value: commercialIndex,
      formatted: commercialIndex != null ? `${commercialIndex}/100` : "—",
      volumeConfidence,
    },
    funnel: {
      stages: funnelStages,
      main_bottleneck: mainBottleneck
        ? {
            id: mainBottleneck.transicao,
            label: BOTTLENECK_LABELS[mainBottleneck.transicao] ?? mainBottleneck.transicao,
            abandonmentFormatted: formatPublicMetricRate(mainBottleneck.taxa_abandono_transicao),
            conversionFormatted: formatPublicMetricRate(mainBottleneck.taxa_conversao_transicao),
          }
        : null,
    },
    indicators,
  };
}
