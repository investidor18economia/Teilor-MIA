/**
 * PATCH A.5 — Founder Products & Categories display mapping (formatting only — no aggregation).
 * Source: GET /api/temporal-metrics?series=products,categories
 */

import {
  formatPublicMetricNumber,
  formatPublicMetricRate,
} from "./miaPublicMetricsDisplay.js";
import { formatFounderMetricValue } from "./miaFounderCockpitDisplay.js";

export const FOUNDER_PRODUCTS_DISPLAY_VERSION = "A.5.0";

/**
 * @param {string} activityDay
 */
export function formatProductsActivityDayLabel(activityDay) {
  if (!activityDay) return "—";
  try {
    return new Date(`${activityDay}T12:00:00Z`).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return String(activityDay);
  }
}

/**
 * @param {unknown} value
 */
export function formatProductsMetricNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return formatPublicMetricNumber(value);
}

/**
 * @param {unknown} value
 */
export function formatProductsMetricRate(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return formatPublicMetricRate(value);
}

/**
 * Build distribution bars from category ranking (percent of period total events).
 * @param {Array<Record<string, unknown>>} ranking
 * @param {number} periodTotal
 * @param {number} [limit]
 */
export function mapCategoryDistributionBars(ranking = [], periodTotal = 0, limit = 8) {
  const rows = ranking.slice(0, limit);
  const total = Number(periodTotal) > 0
    ? Number(periodTotal)
    : rows.reduce((sum, row) => sum + Number(row.total_eventos_categoria ?? 0), 0);
  if (!total) return [];
  return rows.map((row) => {
    const value = Number(row.total_eventos_categoria ?? 0);
    const percent = Math.round((value / total) * 1000) / 10;
    return {
      label: String(row.category ?? "—"),
      value,
      percent,
    };
  });
}

/**
 * @param {Record<string, unknown>|null|undefined} summary
 * @param {Array<{ id: string, label: string, key: string, format?: string }>} defs
 */
function mapSummaryMetrics(summary, defs) {
  return defs.map((def) => ({
    id: def.id,
    label: def.label,
    value: summary?.[def.key] ?? null,
    format: def.format || "number",
  }));
}

/**
 * @param {Record<string, unknown>|null|undefined} temporal
 * @param {{
 *   snapshotRecommendation?: { metrics?: Array<{ id: string, label: string, value: unknown, format?: string }> },
 *   snapshotCommerce?: { metrics?: Array<{ id: string, label: string, value: unknown, format?: string }> },
 * }} [context]
 */
export function mapTemporalMetricsToFounderProductsCategories(temporal, context = {}) {
  const productsData = temporal?.products ?? null;
  const categoriesData = temporal?.categories ?? null;
  const partialErrors = Array.isArray(temporal?.partial_errors) ? temporal.partial_errors : [];
  const hasProducts = productsData != null;
  const hasCategories = categoriesData != null;
  const productRanking = Array.isArray(productsData?.ranking) ? productsData.ranking : [];
  const categoryRanking = Array.isArray(categoriesData?.ranking) ? categoriesData.ranking : [];
  const productDaily = Array.isArray(productsData?.daily) ? productsData.daily : [];
  const categoryDaily = Array.isArray(categoriesData?.daily) ? categoriesData.daily : [];

  let status = "success";
  if (!temporal) {
    status = "error";
  } else if (!hasProducts && !hasCategories) {
    status = "error";
  } else if (partialErrors.length > 0 || !hasProducts || !hasCategories) {
    status = "partial";
  } else if (!productRanking.length && !categoryRanking.length) {
    status = "empty";
  }

  const productSummaryMetrics = mapSummaryMetrics(productsData?.summary, [
    { id: "distinct_products", label: "Produtos distintos", key: "distinct_products" },
    { id: "total_aparicoes", label: "Aparições de produto", key: "total_aparicoes" },
    { id: "total_recomendacoes", label: "Recomendações exibidas", key: "total_recomendacoes" },
    { id: "total_cliques", label: "Cliques em ofertas", key: "total_cliques" },
    { id: "total_favoritos", label: "Favoritos", key: "total_favoritos" },
    { id: "total_alertas", label: "Alertas de preço", key: "total_alertas" },
    {
      id: "taxa_clique_recomendacao",
      label: "Taxa clique / recomendação",
      key: "taxa_clique_recomendacao",
      format: "rate",
    },
  ]);

  const categorySummaryMetrics = mapSummaryMetrics(categoriesData?.summary, [
    { id: "distinct_categories", label: "Categorias distintas", key: "distinct_categories" },
    { id: "total_perguntas", label: "Perguntas por categoria", key: "total_perguntas" },
    { id: "total_recomendacoes", label: "Recomendações por categoria", key: "total_recomendacoes" },
    { id: "total_cliques", label: "Cliques por categoria", key: "total_cliques" },
    { id: "total_eventos_categoria", label: "Eventos de categoria", key: "total_eventos_categoria" },
    {
      id: "taxa_conversao_pergunta_recomendacao",
      label: "Taxa pergunta → recomendação",
      key: "taxa_conversao_pergunta_recomendacao",
      format: "rate",
    },
    {
      id: "taxa_conversao_recomendacao_clique",
      label: "Taxa recomendação → clique",
      key: "taxa_conversao_recomendacao_clique",
      format: "rate",
    },
  ]);

  const topProducts = productRanking.slice(0, 10).map((row, index) => ({
    rank: index + 1,
    product_label: row.product_label ?? "—",
    product_brand: row.product_brand ?? null,
    total_aparicoes: row.total_aparicoes,
    total_recomendacoes: row.total_recomendacoes,
    total_cliques: row.total_cliques,
    total_favoritos: row.total_favoritos,
    total_alertas: row.total_alertas,
    sinais_intencao_compra: row.sinais_intencao_compra,
    taxa_clique_recomendacao: row.taxa_clique_recomendacao,
    total_aparicoes_formatted: formatProductsMetricNumber(row.total_aparicoes),
    total_recomendacoes_formatted: formatProductsMetricNumber(row.total_recomendacoes),
    total_cliques_formatted: formatProductsMetricNumber(row.total_cliques),
    taxa_clique_formatted: formatProductsMetricRate(row.taxa_clique_recomendacao),
  }));

  const topCategories = categoryRanking.slice(0, 10).map((row, index) => ({
    rank: index + 1,
    category: row.category ?? "—",
    total_perguntas: row.total_perguntas,
    total_recomendacoes: row.total_recomendacoes,
    total_cliques: row.total_cliques,
    total_eventos_categoria: row.total_eventos_categoria,
    taxa_conversao_pergunta_recomendacao: row.taxa_conversao_pergunta_recomendacao,
    taxa_conversao_recomendacao_clique: row.taxa_conversao_recomendacao_clique,
    total_perguntas_formatted: formatProductsMetricNumber(row.total_perguntas),
    total_recomendacoes_formatted: formatProductsMetricNumber(row.total_recomendacoes),
    total_eventos_formatted: formatProductsMetricNumber(row.total_eventos_categoria),
    taxa_pergunta_rec_formatted: formatProductsMetricRate(row.taxa_conversao_pergunta_recomendacao),
  }));

  const categoryDistribution = mapCategoryDistributionBars(
    categoryRanking,
    categoriesData?.summary?.total_eventos_categoria ?? 0,
    8
  );

  const recentCategoryDays = categoryDaily.slice(0, 7).map((row) => ({
    activity_day: row.activity_day,
    activity_day_label: formatProductsActivityDayLabel(row.activity_day),
    category: row.category ?? "—",
    total_eventos: row.total_eventos,
    eventos_perguntas: row.eventos_perguntas,
    eventos_recomendacoes: row.eventos_recomendacoes,
    total_eventos_formatted: formatProductsMetricNumber(row.total_eventos),
    eventos_perguntas_formatted: formatProductsMetricNumber(row.eventos_perguntas),
  }));

  const recentProductDays = productDaily.slice(0, 7).map((row) => ({
    activity_day: row.activity_day,
    activity_day_label: formatProductsActivityDayLabel(row.activity_day),
    product_label: row.product_label ?? "—",
    total_aparicoes: row.total_aparicoes,
    total_recomendacoes: row.total_recomendacoes,
    total_cliques: row.total_cliques,
    total_aparicoes_formatted: formatProductsMetricNumber(row.total_aparicoes),
    taxa_clique_formatted: formatProductsMetricRate(row.taxa_clique_recomendacao),
  }));

  const snapshotRecommendation = context.snapshotRecommendation?.metrics || [];
  const snapshotCommerce = context.snapshotCommerce?.metrics || [];
  const snapshotReference = [
    ...snapshotRecommendation.filter((m) =>
      ["recommendations_generated", "recommendations_shown", "runner_up_usage"].includes(m.id)
    ),
    ...snapshotCommerce.filter((m) => ["offer_clicks", "favorite_count"].includes(m.id)),
  ].map((m) => ({
    ...m,
    source: "executive-metrics snapshot",
    hint: "Totais agregados do período — complementar ao ranking temporal.",
  }));

  const unavailableMetrics = [
    {
      id: "products_searched",
      label: "Produtos pesquisados (termo de busca)",
      reason: "Não existe dimensão oficial de busca por produto — apenas aparições com product_name em eventos comerciais.",
    },
    {
      id: "products_compared",
      label: "Produtos comparados",
      reason: "Evento compare_products não existe no Event Contract v1.",
    },
    {
      id: "products_viewed",
      label: "Produtos visualizados (page view)",
      reason: "Não há evento product_view — proxy oficial: aparições em recomendação/clique/favorito/alerta.",
    },
  ];

  return {
    meta: {
      display_version: FOUNDER_PRODUCTS_DISPLAY_VERSION,
      temporal_version: temporal?.temporal_version ?? null,
      reference_period_days: temporal?.reference_period_days ?? null,
      computed_at: temporal?.computed_at ?? null,
      status,
      partial_errors: partialErrors,
      groups_loaded: {
        products: hasProducts,
        categories: hasCategories,
      },
    },
    productSummaryMetrics,
    categorySummaryMetrics,
    topProducts,
    topCategories,
    categoryDistribution,
    recentCategoryDays,
    recentProductDays,
    snapshotReference,
    unavailableMetrics,
  };
}

export const FOUNDER_PRODUCTS_FORBIDDEN_PATTERNS = [
  /visitor_id/i,
  /conversation_id/i,
  /request_id/i,
  /query_text/i,
  /user_email/i,
  /@gmail/i,
  /"product_name"/i,
];

/**
 * @param {string} text
 */
export function scanFounderProductsForbiddenContent(text = "") {
  const hits = [];
  for (const pattern of FOUNDER_PRODUCTS_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) hits.push(String(pattern));
  }
  return hits;
}
