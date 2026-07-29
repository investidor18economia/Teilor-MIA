/**
 * PATCH A.8 — Founder Cockpit charts display mapping (formatting only — no aggregation).
 * Converts official temporal API series into chart-ready structures.
 */

import { mergeTemporalDailyRows } from "./miaFounderGrowthDisplay.js";
import { formatProductsActivityDayLabel, mapCategoryDistributionBars } from "./miaFounderProductsDisplay.js";
import { formatPerformanceDayLabel, formatPerformanceNumber, formatPerformanceRate } from "./miaFounderPerformanceDisplay.js";
import { formatPublicMetricNumber, formatPublicMetricRate } from "./miaPublicMetricsDisplay.js";

export const FOUNDER_CHARTS_DISPLAY_VERSION = "A.8.0";

export const FOUNDER_CHART_COLORS = Object.freeze([
  "#00c6ff",
  "#4ade80",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
]);

/** @param {Array<Record<string, unknown>>} rows @param {string} dayKey */
function sortRowsChronologically(rows, dayKey = "activity_day") {
  return [...rows].sort((a, b) => String(a[dayKey]).localeCompare(String(b[dayKey])));
}

/** @param {unknown} value @param {'number'|'rate'} format */
export function formatChartValue(value, format = "number") {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return format === "rate" ? formatPublicMetricRate(value) : formatPublicMetricNumber(value);
}

/**
 * @param {string} id @param {string} label @param {string} color @param {Array<number|null>} values @param {'number'|'rate'} [format]
 */
function chartSeries(id, label, color, values, format = "number") {
  return {
    id,
    label,
    color,
    format,
    values,
    formatted: values.map((v) => formatChartValue(v, format)),
  };
}

/**
 * Sessions & Users charts from growth + platform_activity.
 * @param {Record<string, unknown>|null|undefined} temporal
 */
export function mapTemporalToSessionsUsersCharts(temporal) {
  const growthSeries = Array.isArray(temporal?.growth?.series) ? temporal.growth.series : [];
  const platformSeries = Array.isArray(temporal?.platform_activity?.series)
    ? temporal.platform_activity.series
    : [];
  const limit = Math.max(growthSeries.length, platformSeries.length, 1);
  const rows = sortRowsChronologically(mergeTemporalDailyRows(growthSeries, platformSeries, limit));

  if (!rows.length) {
    return {
      meta: { status: "empty", charts_version: FOUNDER_CHARTS_DISPLAY_VERSION },
      activeUsers: null,
      sessionsActivity: null,
    };
  }

  const labels = rows.map((r) => r.activity_day_label);
  const days = rows.map((r) => r.activity_day);

  return {
    meta: {
      status: "ready",
      charts_version: FOUNDER_CHARTS_DISPLAY_VERSION,
      temporal_version: temporal?.temporal_version ?? null,
      point_count: rows.length,
      timezone: "UTC",
      source: "temporal-metrics growth,platform_activity",
    },
    activeUsers: {
      id: "sessions-active-users",
      title: "Usuários ativos (DAU)",
      question: "Como evoluíram os usuários ativos diários no período?",
      xLabels: labels,
      xDays: days,
      series: [
        chartSeries("dau_visitors", "DAU visitantes", FOUNDER_CHART_COLORS[0], rows.map((r) => r.dau_visitors ?? null)),
        chartSeries("new_visitors", "Novos visitantes", FOUNDER_CHART_COLORS[1], rows.map((r) => r.new_visitors ?? null)),
      ],
    },
    sessionsActivity: {
      id: "sessions-activity",
      title: "Sessões e perguntas",
      question: "Como evoluíram sessões e perguntas no período?",
      xLabels: labels,
      xDays: days,
      series: [
        chartSeries("total_sessions", "Sessões", FOUNDER_CHART_COLORS[0], rows.map((r) => r.total_sessions ?? null)),
        chartSeries("questions", "Perguntas", FOUNDER_CHART_COLORS[2], rows.map((r) => r.questions ?? null)),
      ],
    },
  };
}

/**
 * @param {Array<Record<string, unknown>>} dailyRows
 * @param {string} categoryKey
 * @param {string} valueKey
 * @param {number} [topN]
 */
function mapCategoryDailySeries(dailyRows, categoryKey, valueKey, topN = 3) {
  const categories = [...new Set(dailyRows.map((r) => String(r.category ?? "")).filter(Boolean))].slice(0, topN);
  const days = sortRowsChronologically(
    dailyRows.filter((r) => categories.includes(String(r.category ?? ""))),
    "activity_day"
  );
  const uniqueDays = [...new Set(days.map((r) => String(r.activity_day)))].sort();
  const labels = uniqueDays.map((d) => formatProductsActivityDayLabel(d));

  const series = categories.map((cat, idx) => {
    const values = uniqueDays.map((day) => {
      const row = dailyRows.find((r) => String(r.activity_day) === day && String(r.category) === cat);
      const raw = row?.[valueKey];
      return raw != null && !Number.isNaN(Number(raw)) ? Number(raw) : null;
    });
    return chartSeries(`cat-${cat}-${valueKey}`, cat, FOUNDER_CHART_COLORS[idx % FOUNDER_CHART_COLORS.length], values);
  });

  return { xLabels: labels, xDays: uniqueDays, series };
}

/**
 * Products & Categories charts.
 * @param {Record<string, unknown>|null|undefined} temporal
 * @param {{ category?: string|null }} [filters]
 */
export function mapTemporalToProductsCategoriesCharts(temporal, filters = {}) {
  const categoryDaily = Array.isArray(temporal?.categories?.daily) ? temporal.categories.daily : [];
  const productDaily = Array.isArray(temporal?.products?.daily) ? temporal.products.daily : [];
  const categoryRanking = Array.isArray(temporal?.categories?.ranking) ? temporal.categories.ranking : [];

  if (!categoryDaily.length && !productDaily.length && !categoryRanking.length) {
    return {
      meta: { status: "empty", charts_version: FOUNDER_CHARTS_DISPLAY_VERSION },
      categoryQuestions: null,
      categoryRecommendations: null,
      categoryShare: null,
      productAppearances: null,
    };
  }

  const filteredDaily = filters.category
    ? categoryDaily.filter((r) => String(r.category) === filters.category)
    : categoryDaily;

  const questionsDaily = filteredDaily.length
    ? mapCategoryDailySeries(
        filteredDaily,
        "category",
        "eventos_perguntas",
        filters.category ? 1 : 3
      )
    : null;

  const recommendationsDaily = filteredDaily.length
    ? mapCategoryDailySeries(
        filteredDaily,
        "category",
        "eventos_recomendacoes",
        filters.category ? 1 : 3
      )
    : null;

  const distribution = mapCategoryDistributionBars(
    categoryRanking,
    temporal?.categories?.summary?.total_eventos_categoria ?? 0,
    8
  );

  let productChart = null;
  if (productDaily.length) {
    const rows = sortRowsChronologically(productDaily).slice(-Math.min(productDaily.length, 30));
    const byDay = new Map();
    for (const row of rows) {
      const day = String(row.activity_day ?? "");
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, row);
    }
    const sortedDays = [...byDay.keys()].sort();
    productChart = {
      id: "products-appearances",
      title: "Aparições de produto (série diária oficial)",
      question: "Como evoluíram as aparições no recorte diário retornado pela API?",
      xLabels: sortedDays.map((d) => formatProductsActivityDayLabel(d)),
      xDays: sortedDays,
      series: [
        chartSeries(
          "total_aparicoes",
          "Aparições",
          FOUNDER_CHART_COLORS[0],
          sortedDays.map((d) => {
            const v = byDay.get(d)?.total_aparicoes;
            return v != null ? Number(v) : null;
          })
        ),
        chartSeries(
          "total_recomendacoes",
          "Recomendações",
          FOUNDER_CHART_COLORS[1],
          sortedDays.map((d) => {
            const v = byDay.get(d)?.total_recomendacoes;
            return v != null ? Number(v) : null;
          })
        ),
      ],
    };
  }

  return {
    meta: {
      status: "ready",
      charts_version: FOUNDER_CHARTS_DISPLAY_VERSION,
      temporal_version: temporal?.temporal_version ?? null,
      timezone: "UTC",
      source: "temporal-metrics products,categories",
      category_filter: filters.category ?? null,
    },
    categoryQuestions: questionsDaily?.series?.length
      ? {
          id: "categories-questions",
          title: "Perguntas por categoria",
          question: "Como evoluíram as perguntas por categoria no período?",
          ...questionsDaily,
        }
      : null,
    categoryRecommendations: recommendationsDaily?.series?.length
      ? {
          id: "categories-recommendations",
          title: "Recomendações por categoria",
          question: "Como evoluíram as recomendações exibidas por categoria?",
          ...recommendationsDaily,
        }
      : null,
    categoryShare: distribution.length
      ? {
          id: "categories-share",
          title: "Participação entre categorias",
          question: "Qual a distribuição relativa de eventos por categoria no período?",
          items: distribution.map((bar) => ({
            label: bar.label,
            value: bar.value,
            percent: bar.percent,
            formatted: `${formatPublicMetricNumber(bar.value)} · ${bar.percent}%`,
          })),
        }
      : null,
    productAppearances: productChart,
  };
}

/**
 * Performance & Conversion charts.
 * @param {Record<string, unknown>|null|undefined} temporal
 */
export function mapTemporalToPerformanceConversionCharts(temporal) {
  const conversion = temporal?.conversion ?? null;
  const daily = Array.isArray(conversion?.daily) ? conversion.daily : [];
  const funnelStages = Array.isArray(conversion?.funnel_stages) ? conversion.funnel_stages : [];

  if (!daily.length && !funnelStages.length) {
    return {
      meta: { status: "empty", charts_version: FOUNDER_CHARTS_DISPLAY_VERSION },
      ctrDaily: null,
      engagementDaily: null,
      funnelStages: null,
    };
  }

  const rows = sortRowsChronologically(daily);
  const labels = rows.map((r) => formatPerformanceDayLabel(r.activity_day));
  const days = rows.map((r) => r.activity_day);

  const STAGE_LABELS = {
    sessoes_iniciadas: "Sessões iniciadas",
    perguntas_enviadas: "Perguntas enviadas",
    recomendacoes_exibidas: "Recomendações exibidas",
    cliques_em_oferta: "Cliques em ofertas",
    favoritos_criados: "Favoritos criados",
    alertas_preco_criados: "Alertas de preço",
  };

  return {
    meta: {
      status: "ready",
      charts_version: FOUNDER_CHARTS_DISPLAY_VERSION,
      temporal_version: temporal?.temporal_version ?? null,
      point_count: rows.length,
      timezone: "UTC",
      source: "temporal-metrics conversion",
      funnel_note: "Funil exibido como snapshot do período — evolução diária do funil não disponível no contrato RPC.",
    },
    ctrDaily: rows.length
      ? {
          id: "performance-ctr",
          title: "CTR diária",
          question: "Como evoluiu a taxa de clique sobre recomendações?",
          xLabels: labels,
          xDays: days,
          series: [
            chartSeries(
              "taxa_clique_recomendacao",
              "CTR",
              FOUNDER_CHART_COLORS[0],
              rows.map((r) => r.taxa_clique_recomendacao ?? null),
              "rate"
            ),
          ],
        }
      : null,
    engagementDaily: rows.length
      ? {
          id: "performance-engagement",
          title: "Recomendações e cliques",
          question: "Como evoluíram recomendações e cliques no período?",
          xLabels: labels,
          xDays: days,
          series: [
            chartSeries(
              "eventos_recomendacoes",
              "Recomendações",
              FOUNDER_CHART_COLORS[0],
              rows.map((r) => r.eventos_recomendacoes ?? null)
            ),
            chartSeries(
              "eventos_cliques",
              "Cliques",
              FOUNDER_CHART_COLORS[1],
              rows.map((r) => r.eventos_cliques ?? null)
            ),
          ],
        }
      : null,
    funnelStages: funnelStages.length
      ? {
          id: "performance-funnel",
          title: "Funil de conversão (período)",
          question: "Quantos eventos em cada etapa do funil no período selecionado?",
          items: funnelStages.map((stage) => ({
            label: STAGE_LABELS[stage.etapa] ?? stage.etapa,
            value: Number(stage.eventos ?? 0),
            formatted: formatPerformanceNumber(stage.eventos),
            rate: stage.taxa_conversao_visitante,
            rateFormatted: formatPerformanceRate(stage.taxa_conversao_visitante),
          })),
        }
      : null,
  };
}

export const FOUNDER_CHARTS_FORBIDDEN_PATTERNS = [
  /visitor_id/i,
  /conversation_id/i,
  /user_email/i,
];

/** @param {string} text */
export function scanFounderChartsForbiddenContent(text = "") {
  const hits = [];
  for (const pattern of FOUNDER_CHARTS_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) hits.push(String(pattern));
  }
  return hits;
}
