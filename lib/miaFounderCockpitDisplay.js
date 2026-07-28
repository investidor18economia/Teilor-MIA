/**
 * PATCH 11.3 + PATCH A.2 — Founder cockpit display mapping (formatting only — no aggregation).
 * All values from GET /api/executive-metrics.
 */

import {
  formatPublicMetricCurrency,
  formatPublicMetricNumber,
  formatPublicMetricRate,
  scanPublicMetricsForbiddenContent,
} from "./miaPublicMetricsDisplay.js";

export { formatPublicMetricCurrency, formatPublicMetricNumber, formatPublicMetricRate, scanPublicMetricsForbiddenContent };

export const FOUNDER_COCKPIT_DISPLAY_VERSION = "A.2.0";

export const FOUNDER_COCKPIT_PERIOD_OPTIONS = Object.freeze([
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 365, label: "365 dias" },
]);

/**
 * @param {Record<string, number|string>|null|undefined} distribution
 */
export function mapDistributionToBars(distribution) {
  if (!distribution || typeof distribution !== "object") return [];
  const entries = Object.entries(distribution)
    .map(([label, value]) => ({ label, value: Number(value) || 0 }))
    .filter((item) => item.value > 0);
  const total = entries.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return [];
  return entries
    .sort((a, b) => b.value - a.value)
    .map((item) => ({
      label: item.label,
      value: item.value,
      percent: Math.round((item.value / total) * 1000) / 10,
    }));
}

/**
 * @param {Record<string, unknown>|null|undefined} metrics
 */
export function mapExecutiveMetricsToFounderCockpit(metrics) {
  const platform = metrics?.platform || {};
  const conversation = metrics?.conversation || {};
  const recommendation = metrics?.recommendation || {};
  const commerce = metrics?.commerce || {};
  const alerts = metrics?.alerts || {};
  const priceIntelligence = metrics?.price_intelligence || {};
  const savings = metrics?.savings || {};
  const antiRegret = metrics?.anti_regret || {};
  const userValue = metrics?.user_value || {};
  const system = metrics?.system || {};
  const performance = metrics?.performance || {};

  const windowDays = metrics?.reference_period_days ?? platform.window_days ?? 30;

  const overview = [
    { id: "conversations", label: "Conversas", value: platform.conversations, format: "number" },
    { id: "questions", label: "Perguntas", value: platform.questions, format: "number" },
    { id: "sessions", label: "Sessões", value: platform.total_sessions, format: "number" },
    { id: "visitors", label: "Visitantes", value: platform.unique_visitors, format: "number" },
    {
      id: "recommendations",
      label: "Recomendações",
      value: recommendation.recommendations_generated,
      format: "number",
    },
    {
      id: "recommendations_shown",
      label: "Recomendações exibidas",
      value: conversation.recommendations_shown,
      format: "number",
    },
    { id: "offer_clicks", label: "Cliques em ofertas", value: commerce.offer_clicks, format: "number" },
    { id: "alerts", label: "Alertas ativos", value: alerts.alerts_active, format: "number" },
    {
      id: "potential_savings",
      label: "Economia potencial",
      value: savings.potential_savings_total,
      format: "currency",
      hint: "Observacional — não representa economia realizada.",
    },
    {
      id: "avg_user_value",
      label: "User Value médio",
      value: userValue.average_user_value,
      format: "score",
      hint: "Score observacional 0–100 — não é ROI.",
    },
  ];

  return {
    meta: {
      display_version: FOUNDER_COCKPIT_DISPLAY_VERSION,
      metrics_version: metrics?.metrics_version ?? null,
      computed_at: metrics?.computed_at ?? null,
      reference_period_days: windowDays,
      partial_errors: metrics?.partial_errors ?? [],
    },
    overview,
    modules: {
      platform: {
        id: "mod-plataforma",
        title: "Plataforma",
        metrics: [
          { id: "sessions", label: "Sessões", value: platform.total_sessions },
          { id: "visitors", label: "Visitantes únicos", value: platform.unique_visitors },
          { id: "conversations", label: "Conversas", value: platform.conversations },
          { id: "questions", label: "Perguntas", value: platform.questions },
        ],
      },
      conversation: {
        id: "mod-conversacao",
        title: "Conversação",
        metrics: [
          { id: "questions_sent", label: "Perguntas enviadas", value: conversation.questions_sent },
          {
            id: "recommendations_shown",
            label: "Recomendações exibidas",
            value: conversation.recommendations_shown,
          },
          {
            id: "conversations_with_questions",
            label: "Conversas com perguntas",
            value: conversation.conversations_with_questions,
          },
        ],
      },
      recommendation: {
        id: "mod-recomendacoes",
        title: "Recomendações",
        metrics: [
          {
            id: "generated",
            label: "Recomendações geradas",
            value: recommendation.recommendations_generated,
          },
          { id: "runner_up", label: "Runner-up", value: recommendation.runner_up_usage },
          {
            id: "acceptance_signals",
            label: "Sinais de aceitação",
            value: recommendation.acceptance_signals,
            hint: "Sinais observacionais — não representa satisfação.",
          },
          {
            id: "rejection_signals",
            label: "Sinais de rejeição",
            value: recommendation.rejection_signals,
            hint: "Sinais observacionais — não representa insatisfação.",
          },
          {
            id: "acceptance",
            label: "Taxa de aceitação",
            value: recommendation.recommendation_acceptance_rate,
            format: "rate",
          },
          {
            id: "rejection",
            label: "Taxa de rejeição",
            value: recommendation.rejection_rate,
            format: "rate",
          },
        ],
      },
      commerce: {
        id: "mod-comercial",
        title: "Comercial",
        metrics: [
          {
            id: "offer_sets",
            label: "Conjuntos de ofertas",
            value: commerce.offer_sets_generated,
          },
          {
            id: "offers_returned",
            label: "Ofertas retornadas",
            value: commerce.offers_returned,
          },
          { id: "providers_used", label: "Provedores utilizados", value: commerce.providers_used },
          { id: "clicks", label: "Cliques em ofertas", value: commerce.offer_clicks },
          { id: "favorites", label: "Favoritos", value: commerce.favorite_count },
        ],
      },
      alerts: {
        id: "mod-alertas",
        title: "Alertas de preço",
        metrics: [
          { id: "alerts_created", label: "Alertas criados", value: alerts.alerts_created },
          { id: "alerts_active", label: "Alertas ativos", value: alerts.alerts_active },
          { id: "target_reached", label: "Metas atingidas", value: alerts.target_reached },
          {
            id: "notifications_sent",
            label: "Notificações enviadas",
            value: alerts.notifications_sent,
          },
        ],
      },
      priceIntelligence: {
        id: "mod-price-intelligence",
        title: "Price Intelligence",
        metrics: [
          { id: "events", label: "Eventos", value: priceIntelligence.events },
          {
            id: "avg_quality",
            label: "Qualidade média",
            value: priceIntelligence.average_price_quality_score,
            format: "score",
          },
        ],
        distribution: mapDistributionToBars(priceIntelligence.confidence_distribution),
        distributionTitle: "Distribuição de confiança",
      },
      savings: {
        id: "mod-economia",
        title: "Economia",
        disclaimer: "Economia potencial. Não representa economia efetivamente realizada.",
        metrics: [
          {
            id: "potential_total",
            label: "Economia potencial identificada",
            value: savings.potential_savings_total,
            format: "currency",
          },
          {
            id: "average_potential",
            label: "Economia potencial média",
            value: savings.average_potential_savings,
            format: "currency",
            hint: "Média por oportunidade com valor positivo.",
          },
          { id: "opportunities", label: "Oportunidades", value: savings.opportunities_found },
        ],
      },
      antiRegret: {
        id: "mod-anti-regret",
        title: "Anti-Regret",
        metrics: [
          { id: "events", label: "Eventos", value: antiRegret.events },
          { id: "avg_score", label: "Score médio", value: antiRegret.average_score, format: "score" },
        ],
        distribution: mapDistributionToBars(antiRegret.confidence_distribution),
        distributionTitle: "Distribuição de confiança",
      },
      userValue: {
        id: "mod-user-value",
        title: "User Value",
        metrics: [
          { id: "events", label: "Eventos", value: userValue.events },
          {
            id: "avg_value",
            label: "Score médio",
            value: userValue.average_user_value,
            format: "score",
          },
          {
            id: "verified_value_count",
            label: "Valores verificados",
            value: userValue.verified_value_amount_count,
            hint: "Eventos com valor verificado registrado.",
          },
        ],
        distribution: mapDistributionToBars(userValue.value_status_distribution),
        distributionTitle: "Distribuição por status",
      },
      system: {
        id: "mod-sistema",
        title: "Sistema",
        metrics: [
          {
            id: "analytics_version",
            label: "Versão Analytics",
            value: system.analytics_version,
            format: "text",
          },
          { id: "build", label: "Build", value: system.build_version, format: "text" },
          { id: "environment", label: "Ambiente", value: system.environment, format: "text" },
          {
            id: "last_update",
            label: "Última atualização",
            value: system.last_update ?? metrics?.computed_at,
            format: "datetime",
          },
          {
            id: "api_duration",
            label: "Tempo de resposta da API",
            value: performance.total_duration_ms,
            format: "duration",
          },
        ],
        status: metrics?.partial_errors?.length ? "partial" : "ok",
      },
    },
  };
}

/**
 * @param {{ format?: string, value: unknown }} metric
 */
export function formatFounderMetricValue(metric) {
  if (metric.format === "rate") return formatPublicMetricRate(metric.value);
  if (metric.format === "currency") return formatPublicMetricCurrency(metric.value);
  if (metric.format === "score") {
    if (metric.value == null || Number.isNaN(Number(metric.value))) return "—";
    return Number(metric.value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  if (metric.format === "duration") {
    if (metric.value == null) return "—";
    return `${Number(metric.value).toLocaleString("pt-BR")} ms`;
  }
  if (metric.format === "datetime" && metric.value) {
    try {
      return new Date(String(metric.value)).toLocaleString("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return String(metric.value);
    }
  }
  if (metric.format === "text") return metric.value != null ? String(metric.value) : "—";
  const n = Number(metric.value);
  const useCompact = Number.isFinite(n) && n >= 10_000;
  const useSuffix = Number.isFinite(n) && n >= 1_000;
  return formatPublicMetricNumber(metric.value, { compact: useCompact, suffix: useSuffix ? "+" : "" });
}

export const FOUNDER_COCKPIT_FORBIDDEN_PATTERNS = [
  /visitor_id/i,
  /conversation_id/i,
  /request_id/i,
  /query_text/i,
  /user_email/i,
  /@gmail/i,
];

/**
 * @param {string} text
 */
export function scanFounderCockpitForbiddenContent(text = "") {
  const hits = [];
  for (const pattern of FOUNDER_COCKPIT_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) hits.push(String(pattern));
  }
  return hits;
}
