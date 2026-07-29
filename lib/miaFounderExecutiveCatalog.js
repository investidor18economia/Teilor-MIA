/**
 * PATCH B.2 — Executive KPI catalog (Single Source of Truth for Phase B strategic KPIs).
 * Values must come from official API contracts — no frontend aggregation.
 */

export const FOUNDER_EXECUTIVE_CATALOG_VERSION = "B.2.0";

/** Reuses A.4 trend threshold — ±2% = stable */
export const EXECUTIVE_TREND_STABLE_THRESHOLD = 0.02;

/** Trend pct above 10% → Excelente */
export const EXECUTIVE_TREND_EXCELLENT_THRESHOLD = 0.1;

/** Rate thresholds — observational, documented in FOUNDER_EXECUTIVE_DASHBOARD.md */
export const EXECUTIVE_CTR_EXCELLENT_THRESHOLD = 0.05;
export const EXECUTIVE_CTR_ATTENTION_THRESHOLD = 0.01;
export const EXECUTIVE_CONVERSION_EXCELLENT_THRESHOLD = 0.03;
export const EXECUTIVE_CONVERSION_ATTENTION_THRESHOLD = 0.005;

export const EXECUTIVE_BADGE_IDS = Object.freeze({
  GROWING: "growing",
  STABLE: "stable",
  ATTENTION: "attention",
  EXCELLENT: "excellent",
  EVOLVING: "evolving",
});

export const EXECUTIVE_BADGE_LABELS = Object.freeze({
  growing: "Crescendo",
  stable: "Estável",
  attention: "Atenção",
  excellent: "Excelente",
  evolving: "Em evolução",
});

/**
 * Official strategic KPI definitions for PATCH B.2.
 * @type {ReadonlyArray<{
 *   id: string,
 *   label: string,
 *   category: string,
 *   group: string,
 *   format: string,
 *   source: { type: string, group?: string, field?: string, path?: string[] },
 *   fallback?: { type: string, path: string[] },
 *   trend?: { type: string, group?: string, field?: string } | null,
 *   hint?: string,
 *   futureContract?: string,
 * }>}
 */
export const FOUNDER_EXECUTIVE_KPI_CATALOG = Object.freeze([
  {
    id: "active_users",
    label: "Usuários Ativos",
    category: "strategic",
    group: "platform",
    format: "number",
    source: { type: "temporal", group: "growth", field: "dau_visitors" },
    fallback: { type: "executive", path: ["platform", "unique_visitors"] },
    trend: { type: "temporal", group: "growth", field: "crescimento_dau_visitors_pct" },
  },
  {
    id: "user_growth",
    label: "Crescimento de Usuários",
    category: "growth",
    group: "platform",
    format: "rate",
    source: { type: "temporal", group: "growth", field: "crescimento_dau_visitors_pct" },
    trend: { type: "temporal", group: "growth", field: "crescimento_dau_visitors_pct" },
  },
  {
    id: "session_growth",
    label: "Crescimento de Sessões",
    category: "growth",
    group: "platform",
    format: "number",
    source: { type: "executive", path: ["platform", "total_sessions"] },
    trend: null,
    futureContract: "crescimento_sessions_pct",
    hint: "Volume de sessões no período. Tendência pct aguarda contrato temporal (B.3).",
  },
  {
    id: "question_growth",
    label: "Crescimento de Perguntas",
    category: "growth",
    group: "platform",
    format: "number",
    source: { type: "executive", path: ["platform", "questions"] },
    trend: null,
    futureContract: "crescimento_questions_pct",
    hint: "Volume de perguntas no período. Tendência pct aguarda contrato temporal (B.3).",
  },
  {
    id: "recommendations_issued",
    label: "Recomendações Emitidas",
    category: "commercial",
    group: "recommendation",
    format: "number",
    source: { type: "executive", path: ["recommendation", "recommendations_generated"] },
    trend: null,
  },
  {
    id: "ctr",
    label: "CTR",
    category: "commercial",
    group: "conversion",
    format: "rate",
    source: { type: "temporal", group: "conversion", field: "taxa_clique_recomendacao", scope: "summary" },
    fallback: { type: "executive", path: ["commerce", "offer_clicks"] },
    trend: null,
    hint: "Taxa clique / recomendação — CONVERSION_DASHBOARD.",
  },
  {
    id: "conversion",
    label: "Conversão",
    category: "commercial",
    group: "conversion",
    format: "rate",
    source: {
      type: "temporal",
      group: "conversion",
      field: "conversao_acumulada_visitante",
      scope: "summary",
    },
    trend: null,
    hint: "Conversão acumulada por visitante — funil sequencial.",
  },
  {
    id: "active_products",
    label: "Produtos Ativos",
    category: "commercial",
    group: "products",
    format: "number",
    source: { type: "temporal", group: "products", field: "distinct_products", scope: "summary" },
    trend: null,
  },
  {
    id: "active_categories",
    label: "Categorias Ativas",
    category: "commercial",
    group: "categories",
    format: "number",
    source: { type: "temporal", group: "categories", field: "distinct_categories", scope: "summary" },
    trend: null,
  },
  {
    id: "overall_trend",
    label: "Tendência Geral",
    category: "executive",
    group: "platform",
    format: "trend",
    source: { type: "temporal", group: "growth", field: "crescimento_dau_visitors_pct" },
    trend: { type: "temporal", group: "growth", field: "crescimento_dau_visitors_pct" },
    hint: "Proxy oficial: crescimento DAU visitantes (GROWTH_DASHBOARD).",
  },
]);

/**
 * Deterministic badge from official trend pct or rate thresholds.
 * @param {{ trendPct?: unknown, rateValue?: unknown, kpiId?: string }} input
 */
export function classifyExecutiveBadge(input = {}) {
  const { trendPct, rateValue, kpiId } = input;

  if (trendPct != null && !Number.isNaN(Number(trendPct))) {
    const n = Number(trendPct);
    if (n >= EXECUTIVE_TREND_EXCELLENT_THRESHOLD) {
      return { id: EXECUTIVE_BADGE_IDS.EXCELLENT, label: EXECUTIVE_BADGE_LABELS.excellent };
    }
    if (n > EXECUTIVE_TREND_STABLE_THRESHOLD) {
      return { id: EXECUTIVE_BADGE_IDS.GROWING, label: EXECUTIVE_BADGE_LABELS.growing };
    }
    if (n > 0) {
      return { id: EXECUTIVE_BADGE_IDS.EVOLVING, label: EXECUTIVE_BADGE_LABELS.evolving };
    }
    if (n >= -EXECUTIVE_TREND_STABLE_THRESHOLD) {
      return { id: EXECUTIVE_BADGE_IDS.STABLE, label: EXECUTIVE_BADGE_LABELS.stable };
    }
    return { id: EXECUTIVE_BADGE_IDS.ATTENTION, label: EXECUTIVE_BADGE_LABELS.attention };
  }

  if (rateValue != null && !Number.isNaN(Number(rateValue))) {
    const r = Number(rateValue);
    if (kpiId === "ctr") {
      if (r >= EXECUTIVE_CTR_EXCELLENT_THRESHOLD) {
        return { id: EXECUTIVE_BADGE_IDS.EXCELLENT, label: EXECUTIVE_BADGE_LABELS.excellent };
      }
      if (r < EXECUTIVE_CTR_ATTENTION_THRESHOLD) {
        return { id: EXECUTIVE_BADGE_IDS.ATTENTION, label: EXECUTIVE_BADGE_LABELS.attention };
      }
      return { id: EXECUTIVE_BADGE_IDS.STABLE, label: EXECUTIVE_BADGE_LABELS.stable };
    }
    if (kpiId === "conversion") {
      if (r >= EXECUTIVE_CONVERSION_EXCELLENT_THRESHOLD) {
        return { id: EXECUTIVE_BADGE_IDS.EXCELLENT, label: EXECUTIVE_BADGE_LABELS.excellent };
      }
      if (r < EXECUTIVE_CONVERSION_ATTENTION_THRESHOLD) {
        return { id: EXECUTIVE_BADGE_IDS.ATTENTION, label: EXECUTIVE_BADGE_LABELS.attention };
      }
      return { id: EXECUTIVE_BADGE_IDS.EVOLVING, label: EXECUTIVE_BADGE_LABELS.evolving };
    }
  }

  return null;
}
