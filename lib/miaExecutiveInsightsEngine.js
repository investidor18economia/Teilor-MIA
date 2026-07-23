/**
 * PATCH 11.4 — Deterministic Executive Insights engine.
 * Teilor calculates facts; LLM only verbalizes (optional).
 */

import {
  EXECUTIVE_INSIGHTS_THRESHOLDS,
  EXECUTIVE_INSIGHTS_METRIC_CATALOG,
  EXECUTIVE_INSIGHTS_SEVERITY_ORDER,
} from "./miaExecutiveInsightsThresholds.js";

/**
 * @param {Record<string, unknown>|null|undefined} root
 * @param {string[]} path
 */
export function readMetricValue(root, path) {
  let cur = root;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[key];
  }
  if (cur == null) return null;
  const n = Number(cur);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {number|null} current
 * @param {number|null} previous
 */
export function computePeriodChange(current, previous) {
  if (current == null && previous == null) {
    return { absolute_change: null, percentage_change: null };
  }
  const cur = current ?? 0;
  const prev = previous ?? 0;
  const absolute_change = cur - prev;
  const percentage_change =
    prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 10000) / 100;
  return { absolute_change, percentage_change };
}

/**
 * @param {{ current: number|null, previous: number|null, kind: string, partialErrors: object[], category: string, windowDays: number }} input
 */
export function resolveInsightConfidence(input) {
  const { current, previous, kind, partialErrors, category, windowDays } = input;
  const t = EXECUTIVE_INSIGHTS_THRESHOLDS;

  if (partialErrors.some((e) => e.scope === category)) return "insufficient_data";
  if (current == null && previous == null) return "insufficient_data";

  if (kind === "count") {
    const curVol = current ?? 0;
    const prevVol = previous ?? 0;
    if (curVol === 0 && prevVol === 0) return "insufficient_data";
    if (curVol < t.min_sample_volume && prevVol < t.min_previous_sample_volume) return "low";
    if (curVol < t.min_sample_volume || prevVol < t.min_previous_sample_volume) return "medium";
    return windowDays >= t.min_window_days_medium ? "high" : "medium";
  }

  if (current == null || previous == null) return "low";
  return "medium";
}

/**
 * @param {{ kind: string, absolute_change: number|null, percentage_change: number|null, metricId: string, current: number|null, previous: number|null }} input
 */
export function passesChangeThreshold(input) {
  const t = EXECUTIVE_INSIGHTS_THRESHOLDS;
  const { kind, absolute_change, percentage_change, current, previous } = input;

  if (current == null && previous == null) return false;

  if (kind === "rate" || kind === "score") {
    return Math.abs(absolute_change ?? 0) >= t.min_rate_point_change;
  }

  const abs = Math.abs(absolute_change ?? 0);
  if (abs < t.min_absolute_change) return false;

  if (previous === 0 || previous == null) {
    return (current ?? 0) >= t.min_sample_volume;
  }

  if (percentage_change == null) return abs >= t.min_absolute_change;
  return Math.abs(percentage_change) >= t.min_percentage_change || abs >= t.min_absolute_change * 2;
}

/**
 * @param {object} params
 */
function buildComparisonInsight(params) {
  const {
    insight_id,
    category,
    type,
    severity,
    status,
    title,
    metric,
    metricLabel,
    kind,
    current,
    previous,
    confidence,
    disclaimers = [],
  } = params;

  const { absolute_change, percentage_change } = computePeriodChange(current, previous);

  return {
    insight_id,
    category,
    type,
    severity,
    status,
    title,
    metric,
    metric_label: metricLabel,
    kind,
    current_value: current,
    previous_value: previous,
    absolute_change,
    percentage_change:
      kind === "rate" ? Math.round((absolute_change ?? 0) * 10000) / 100 : percentage_change,
    change_unit: kind === "rate" ? "percentage_points" : "percent",
    confidence,
    disclaimers,
    evidence: [
      { metric, period: "current", value: current },
      { metric, period: "previous", value: previous },
    ],
    hypothesis: false,
  };
}

/**
 * @param {{ current: Record<string, unknown>, previous: Record<string, unknown>, windowDays: number, partialErrors?: object[] }} input
 */
export function generateDeterministicInsights(input) {
  const { current, previous, windowDays } = input;
  const partialErrors = input.partialErrors ?? [
    ...(current?.partial_errors ?? []),
    ...(previous?.partial_errors ?? []),
  ];
  const insights = [];
  const t = EXECUTIVE_INSIGHTS_THRESHOLDS;

  for (const def of EXECUTIVE_INSIGHTS_METRIC_CATALOG) {
    const curVal = readMetricValue(current, def.path);
    const prevVal = readMetricValue(previous, def.path);
    const confidence = resolveInsightConfidence({
      current: curVal,
      previous: prevVal,
      kind: def.kind,
      partialErrors,
      category: def.category,
      windowDays,
    });

    if (confidence === "insufficient_data" && curVal == null && prevVal == null) {
      insights.push({
        insight_id: `${def.id}_no_data`,
        category: def.category,
        type: "insufficient_data",
        severity: "info",
        status: "neutral",
        title: `Ainda não há volume suficiente para avaliar ${def.label.toLowerCase()}.`,
        metric: def.id,
        metric_label: def.label,
        kind: def.kind,
        current_value: curVal,
        previous_value: prevVal,
        confidence: "insufficient_data",
        evidence: [],
        disclaimers: def.not_realized ? ["Economia potencial — não representa economia realizada."] : [],
        hypothesis: false,
      });
      continue;
    }

    const { absolute_change, percentage_change } = computePeriodChange(curVal, prevVal);
    if (!passesChangeThreshold({ kind: def.kind, absolute_change, percentage_change, metricId: def.id, current: curVal, previous: prevVal })) {
      continue;
    }

    const growing = (absolute_change ?? 0) > 0;
    const baseType = growing ? "trend" : "decline";
    let severity = "info";
    let status = growing ? "positive" : "negative";
    let insightType = baseType;

    if (def.id.includes("rejection_rate") && (absolute_change ?? 0) > 0) {
      severity = "warning";
      status = "negative";
      insightType = "risk";
    } else if (def.id.includes("rejection_rate")) {
      severity = "warning";
      status = "negative";
    } else if (def.id.includes("recommendation_acceptance_rate")) {
      severity = growing ? "info" : "warning";
      status = growing ? "positive" : "negative";
    } else if (def.not_realized && growing) {
      severity = "opportunity";
    }

    const changeLabel =
      def.kind === "rate"
        ? `${Math.abs((absolute_change ?? 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`
        : percentage_change != null
          ? `${Math.abs(percentage_change).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
          : `${Math.abs(absolute_change ?? 0).toLocaleString("pt-BR")}`;

    const direction = growing ? "aumentou" : "diminuiu";
    let title = `${def.label} ${direction} ${changeLabel} em relação ao período anterior.`;

    const disclaimers = [];
    if (def.not_satisfaction) disclaimers.push("Taxa de aceitação observa sinais — não mede satisfação.");
    if (def.not_realized) disclaimers.push("Economia potencial — não representa economia realizada.");
    if (def.not_roi) disclaimers.push("User Value é score observacional — não é ROI.");

    insights.push(
      buildComparisonInsight({
        insight_id: `${def.id}_${growing ? "up" : "down"}`,
        category: def.category,
        type: insightType,
        severity,
        status,
        title,
        metric: def.id,
        metricLabel: def.label,
        kind: def.kind,
        current: curVal,
        previous: prevVal,
        confidence,
        disclaimers,
      })
    );
  }

  // Anomaly: questions up, recommendations flat
  const qCur = readMetricValue(current, ["platform", "questions"]);
  const qPrev = readMetricValue(previous, ["platform", "questions"]);
  const rCur = readMetricValue(current, ["recommendation", "recommendations_generated"]);
  const rPrev = readMetricValue(previous, ["recommendation", "recommendations_generated"]);
  if (qCur != null && qPrev != null && rCur != null && rPrev != null && qPrev > 0 && rPrev > 0) {
    const qRatio = qCur / qPrev;
    const rRatio = rCur / rPrev;
    if (qRatio >= t.divergence_growth_ratio && rRatio <= t.divergence_companion_max_ratio) {
      insights.push({
        insight_id: "anomaly_questions_without_recommendations",
        category: "platform",
        type: "anomaly",
        severity: "warning",
        status: "neutral",
        title:
          "O volume de perguntas cresceu, mas as recomendações não acompanharam no mesmo ritmo.",
        metric: "platform.questions_vs_recommendations",
        confidence: resolveInsightConfidence({
          current: qCur,
          previous: qPrev,
          kind: "count",
          partialErrors,
          category: "platform",
          windowDays,
        }),
        evidence: [
          { metric: "platform.questions", period: "current", value: qCur },
          { metric: "platform.questions", period: "previous", value: qPrev },
          { metric: "recommendation.recommendations_generated", period: "current", value: rCur },
          { metric: "recommendation.recommendations_generated", period: "previous", value: rPrev },
        ],
        disclaimers: ["Padrão observado — não indica causalidade comprovada."],
        hypothesis: true,
      });
    }
  }

  // Opportunity: alerts vs clicks
  const aCur = readMetricValue(current, ["alerts", "alerts_active"]);
  const aPrev = readMetricValue(previous, ["alerts", "alerts_active"]);
  const cCur = readMetricValue(current, ["commerce", "offer_clicks"]);
  const cPrev = readMetricValue(previous, ["commerce", "offer_clicks"]);
  if (aCur != null && aPrev != null && cCur != null && cPrev != null && aPrev > 0 && cPrev > 0) {
    const aRatio = aCur / aPrev;
    const cRatio = cCur / cPrev;
    if (aRatio >= t.divergence_growth_ratio && cRatio < aRatio) {
      insights.push({
        insight_id: "opportunity_alerts_vs_clicks",
        category: "commerce",
        type: "opportunity",
        severity: "opportunity",
        status: "positive",
        title:
          "Alertas ativos cresceram mais rapidamente que cliques em ofertas — hipótese para investigação operacional.",
        metric: "alerts.alerts_active_vs_commerce.offer_clicks",
        confidence: "medium",
        evidence: [
          { metric: "alerts.alerts_active", period: "current", value: aCur },
          { metric: "alerts.alerts_active", period: "previous", value: aPrev },
          { metric: "commerce.offer_clicks", period: "current", value: cCur },
          { metric: "commerce.offer_clicks", period: "previous", value: cPrev },
        ],
        disclaimers: [
          "Hipótese para investigação.",
          "Não representa causalidade comprovada.",
          "Não representa compras concluídas.",
        ],
        hypothesis: true,
      });
    }
  }

  // System health: API latency
  const latency = current?.performance?.total_duration_ms;
  const prevLatency = previous?.performance?.total_duration_ms;
  if (latency != null && latency >= t.api_latency_warning_ms) {
    insights.push({
      insight_id: "system_api_latency_high",
      category: "system",
      type: "system_health",
      severity: latency >= t.api_latency_warning_ms * 2 ? "critical" : "warning",
      status: "negative",
      title: `A latência de consolidação da API (${latency} ms) está acima do limite definido.`,
      metric: "system.performance.total_duration_ms",
      current_value: latency,
      previous_value: prevLatency,
      confidence: prevLatency != null ? "high" : "medium",
      evidence: [
        { metric: "performance.total_duration_ms", period: "current", value: latency },
        ...(prevLatency != null ? [{ metric: "performance.total_duration_ms", period: "previous", value: prevLatency }] : []),
      ],
      disclaimers: [],
      hypothesis: false,
    });
  }

  if (partialErrors.length > 0) {
    insights.push({
      insight_id: "system_partial_errors",
      category: "system",
      type: "system_health",
      severity: "warning",
      status: "neutral",
      title: `${partialErrors.length} grupo(s) de métricas retornaram parcialmente ou com erro.`,
      metric: "system.partial_errors",
      confidence: "medium",
      evidence: partialErrors.slice(0, 5).map((e) => ({ metric: e.scope, period: "current", value: e.error })),
      disclaimers: [],
      hypothesis: false,
    });
  }

  insights.sort(
    (a, b) =>
      (EXECUTIVE_INSIGHTS_SEVERITY_ORDER[a.severity] ?? 9) - (EXECUTIVE_INSIGHTS_SEVERITY_ORDER[b.severity] ?? 9)
  );

  return insights;
}

/**
 * @param {object[]} insights
 */
export function buildDeterministicExecutiveSummary(insights) {
  const actionable = insights.filter((i) => i.type !== "insufficient_data");
  const advances = actionable.filter((i) => i.status === "positive" && i.type === "trend");
  const risks = actionable.filter((i) => i.severity === "warning" || i.severity === "critical" || i.type === "risk");
  const opportunities = actionable.filter((i) => i.type === "opportunity");
  const investigations = actionable.filter((i) => i.hypothesis || i.type === "anomaly");

  const pick = (list) => list[0]?.title ?? null;

  const parts = [];
  if (advances.length) parts.push(`Principal avanço: ${pick(advances)}`);
  if (risks.length) parts.push(`Principal risco: ${pick(risks)}`);
  if (opportunities.length) parts.push(`Principal oportunidade: ${pick(opportunities)}`);
  if (investigations.length) parts.push(`Ponto para investigação: ${pick(investigations)}`);

  const overview =
    parts.length > 0
      ? parts.join(" ")
      : actionable.length === 0
        ? "Nenhuma mudança relevante acima dos limiares definidos neste período."
        : "Operação estável no período analisado, sem alertas críticos acima dos limiares.";

  const headline =
    risks.length > 0
      ? "Atenção recomendada em indicadores de risco"
      : advances.length > 0
        ? "Atividade em crescimento no período"
        : "Período estável";

  return {
    headline,
    overview,
    source: "deterministic",
    highlights: {
      main_advance: pick(advances),
      main_risk: pick(risks),
      main_opportunity: pick(opportunities),
      main_investigation: pick(investigations),
      general_condition: headline,
    },
  };
}

/**
 * @param {{ current: object, previous: object, partialErrors: object[] }} input
 */
export function resolveDataQuality(input) {
  const partial = input.partialErrors ?? [];
  const status = partial.length === 0 ? "complete" : partial.length <= 2 ? "partial" : "degraded";
  let confidence = "high";
  if (partial.some((e) => e.scope === "supabase" || e.error === "period_offset_unavailable")) {
    confidence = "insufficient_data";
  } else if (partial.length > 0) {
    confidence = "medium";
  }
  return { status, partial_errors: partial, confidence };
}

/**
 * @param {unknown} payload
 */
export function scanInsightsForbiddenContent(payload) {
  const blob = JSON.stringify(payload ?? {}).toLowerCase();
  const forbidden = [
    "visitor_id",
    "conversation_id",
    "request_id",
    "query_text",
    "product_name",
    "@gmail",
    "user_email",
  ];
  return forbidden.filter((term) => blob.includes(term));
}
