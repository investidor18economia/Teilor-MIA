/**
 * PATCH 11.4 — Official thresholds for Executive AI Insights (centralized).
 */

export const EXECUTIVE_INSIGHTS_THRESHOLDS = Object.freeze({
  /** Minimum absolute change for count metrics to emit trend/decline */
  min_absolute_change: 5,
  /** Minimum relative change (%) for count metrics */
  min_percentage_change: 10,
  /** Minimum events in current period for high-confidence count comparison */
  min_sample_volume: 10,
  /** Minimum events in previous period for comparison */
  min_previous_sample_volume: 5,
  /** Minimum rate delta (0–1 scale) to emit rate insight — e.g. 0.05 = 5 pp */
  min_rate_point_change: 0.05,
  /** API total_duration_ms above this triggers system_health warning */
  api_latency_warning_ms: 5000,
  /** One metric must grow by this ratio vs another for divergence anomaly */
  divergence_growth_ratio: 1.25,
  /** Flat companion metric max growth ratio for divergence */
  divergence_companion_max_ratio: 1.05,
  /** Minimum window days for medium confidence */
  min_window_days_medium: 7,
});

export const EXECUTIVE_INSIGHTS_VERSION = "11.4.0";

export const EXECUTIVE_INSIGHTS_SEVERITY_ORDER = Object.freeze({
  critical: 0,
  warning: 1,
  opportunity: 2,
  info: 3,
});

export const EXECUTIVE_INSIGHTS_CONFIDENCE_ORDER = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
  insufficient_data: 3,
});

/** Metrics eligible for period-over-period comparison */
export const EXECUTIVE_INSIGHTS_METRIC_CATALOG = Object.freeze([
  { id: "platform.questions", category: "platform", path: ["platform", "questions"], kind: "count", label: "Perguntas" },
  { id: "platform.conversations", category: "platform", path: ["platform", "conversations"], kind: "count", label: "Conversas" },
  { id: "platform.total_sessions", category: "platform", path: ["platform", "total_sessions"], kind: "count", label: "Sessões" },
  { id: "platform.unique_visitors", category: "platform", path: ["platform", "unique_visitors"], kind: "count", label: "Visitantes únicos" },
  { id: "conversation.questions_sent", category: "conversation", path: ["conversation", "questions_sent"], kind: "count", label: "Perguntas (conversação)" },
  { id: "recommendation.recommendations_generated", category: "recommendation", path: ["recommendation", "recommendations_generated"], kind: "count", label: "Recomendações geradas" },
  { id: "recommendation.recommendation_acceptance_rate", category: "recommendation", path: ["recommendation", "recommendation_acceptance_rate"], kind: "rate", label: "Taxa de aceitação", not_satisfaction: true },
  { id: "recommendation.rejection_rate", category: "recommendation", path: ["recommendation", "rejection_rate"], kind: "rate", label: "Taxa de rejeição" },
  { id: "recommendation.runner_up_usage", category: "recommendation", path: ["recommendation", "runner_up_usage"], kind: "count", label: "Runner-up" },
  { id: "commerce.offers_returned", category: "commerce", path: ["commerce", "offers_returned"], kind: "count", label: "Ofertas analisadas" },
  { id: "commerce.offer_clicks", category: "commerce", path: ["commerce", "offer_clicks"], kind: "count", label: "Cliques em ofertas" },
  { id: "commerce.favorite_count", category: "commerce", path: ["commerce", "favorite_count"], kind: "count", label: "Favoritos" },
  { id: "alerts.alerts_active", category: "alerts", path: ["alerts", "alerts_active"], kind: "count", label: "Alertas ativos" },
  { id: "alerts.alerts_created", category: "alerts", path: ["alerts", "alerts_created"], kind: "count", label: "Alertas criados" },
  { id: "price_intelligence.events", category: "price_intelligence", path: ["price_intelligence", "events"], kind: "count", label: "Eventos Price Intelligence" },
  { id: "price_intelligence.average_price_quality_score", category: "price_intelligence", path: ["price_intelligence", "average_price_quality_score"], kind: "score", label: "Qualidade média de preço" },
  { id: "savings.potential_savings_total", category: "savings", path: ["savings", "potential_savings_total"], kind: "currency", label: "Economia potencial", not_realized: true },
  { id: "savings.opportunities_found", category: "savings", path: ["savings", "opportunities_found"], kind: "count", label: "Oportunidades" },
  { id: "anti_regret.events", category: "anti_regret", path: ["anti_regret", "events"], kind: "count", label: "Eventos Anti-Regret" },
  { id: "anti_regret.average_score", category: "anti_regret", path: ["anti_regret", "average_score"], kind: "score", label: "Score Anti-Regret médio" },
  { id: "user_value.events", category: "user_value", path: ["user_value", "events"], kind: "count", label: "Eventos User Value" },
  { id: "user_value.average_user_value", category: "user_value", path: ["user_value", "average_user_value"], kind: "score", label: "User Value médio", not_roi: true },
]);

export const EXECUTIVE_INSIGHTS_FORBIDDEN_LLM_TERMS = Object.freeze([
  "satisfação",
  "satisfacao",
  "comprou",
  "compra confirmada",
  "receita",
  "lucro",
  "causalidade comprovada",
  "economia realizada",
]);
