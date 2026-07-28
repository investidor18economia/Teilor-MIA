/**
 * PATCH A.6 — Founder Performance & Conversion display mapping (formatting only — no aggregation).
 * Source: GET /api/temporal-metrics?series=conversion + executive-metrics snapshot complement.
 */

import {
  formatPublicMetricNumber,
  formatPublicMetricRate,
} from "./miaPublicMetricsDisplay.js";

export const FOUNDER_PERFORMANCE_DISPLAY_VERSION = "A.6.0";

const STAGE_LABELS = {
  sessoes_iniciadas: "Sessões iniciadas",
  perguntas_enviadas: "Perguntas enviadas",
  recomendacoes_exibidas: "Recomendações exibidas",
  cliques_em_oferta: "Cliques em ofertas",
  favoritos_criados: "Favoritos criados",
  alertas_preco_criados: "Alertas de preço",
};

const TRANSITION_LABELS = {
  sessao_para_pergunta: "Sessão → pergunta",
  pergunta_para_recomendacao: "Pergunta → recomendação",
  recomendacao_para_clique: "Recomendação → clique",
  clique_para_favorito: "Clique → favorito",
  favorito_para_alerta: "Favorito → alerta",
};

/** @param {unknown} value */
export function formatPerformanceNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return formatPublicMetricNumber(value);
}

/** @param {unknown} value */
export function formatPerformanceRate(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return formatPublicMetricRate(value);
}

/** @param {string} activityDay */
export function formatPerformanceDayLabel(activityDay) {
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
 * @param {Record<string, unknown>|null|undefined} temporal
 * @param {{
 *   snapshotRecommendation?: { metrics?: Array<{ id: string, label: string, value: unknown, format?: string }> },
 *   snapshotCommerce?: { metrics?: Array<{ id: string, label: string, value: unknown, format?: string }> },
 *   snapshotConversation?: { metrics?: Array<{ id: string, label: string, value: unknown, format?: string }> },
 *   snapshotAlerts?: { metrics?: Array<{ id: string, label: string, value: unknown, format?: string }> },
 * }} [context]
 */
export function mapTemporalMetricsToFounderPerformanceConversion(temporal, context = {}) {
  const conversionData = temporal?.conversion ?? null;
  const partialErrors = Array.isArray(temporal?.partial_errors) ? temporal.partial_errors : [];
  const hasConversion = conversionData != null;
  const summary = conversionData?.summary ?? {};
  const funnelStages = Array.isArray(conversionData?.funnel_stages) ? conversionData.funnel_stages : [];
  const bottlenecks = Array.isArray(conversionData?.bottlenecks) ? conversionData.bottlenecks : [];
  const daily = Array.isArray(conversionData?.daily) ? conversionData.daily : [];

  let status = "success";
  if (!temporal) {
    status = "error";
  } else if (!hasConversion) {
    status = "error";
  } else if (partialErrors.length > 0) {
    status = "partial";
  } else if (!funnelStages.length && !summary.eventos_recomendacoes) {
    status = "empty";
  }

  const summaryMetrics = [
    { id: "eventos_recomendacoes", label: "Recomendações exibidas (período)", value: summary.eventos_recomendacoes, format: "number" },
    { id: "eventos_cliques", label: "Cliques em ofertas (período)", value: summary.eventos_cliques, format: "number" },
    { id: "taxa_clique_recomendacao", label: "CTR geral", value: summary.taxa_clique_recomendacao, format: "rate" },
    { id: "taxa_favoritos_recomendacao", label: "Taxa de favoritos", value: summary.taxa_favoritos_recomendacao, format: "rate" },
    { id: "taxa_alertas_recomendacao", label: "Taxa de alertas", value: summary.taxa_alertas_recomendacao, format: "rate" },
    {
      id: "conversao_acumulada_visitante",
      label: "Conversão acumulada (visitante)",
      value: summary.conversao_acumulada_visitante,
      format: "rate",
    },
  ];

  const funnelTable = funnelStages.map((stage) => ({
    ordem: stage.ordem,
    etapa: STAGE_LABELS[stage.etapa] ?? stage.etapa,
    eventos: stage.eventos,
    visitantes_sequenciais: stage.visitantes_sequenciais,
    taxa_conversao_visitante: stage.taxa_conversao_visitante,
    abandono_visitante: stage.abandono_visitante,
    conversao_acumulada_visitante: stage.conversao_acumulada_visitante,
    eventos_formatted: formatPerformanceNumber(stage.eventos),
    visitantes_formatted: formatPerformanceNumber(stage.visitantes_sequenciais),
    taxa_formatted: formatPerformanceRate(stage.taxa_conversao_visitante),
    abandono_formatted: formatPerformanceRate(stage.abandono_visitante),
    acumulada_formatted: formatPerformanceRate(stage.conversao_acumulada_visitante),
  }));

  const mainBottleneck = bottlenecks.find((b) => b.is_gargalo_principal === true) ?? bottlenecks[0] ?? null;

  const bottleneckCards = bottlenecks.map((b) => ({
    id: b.transicao,
    label: TRANSITION_LABELS[b.transicao] ?? b.transicao,
    taxa_abandono: b.taxa_abandono_transicao,
    taxa_conversao: b.taxa_conversao_transicao,
    is_gargalo: b.is_gargalo_principal === true,
    taxa_abandono_formatted: formatPerformanceRate(b.taxa_abandono_transicao),
    taxa_conversao_formatted: formatPerformanceRate(b.taxa_conversao_transicao),
  }));

  const recentDays = daily.slice(0, 7).map((row) => ({
    activity_day: row.activity_day,
    activity_day_label: formatPerformanceDayLabel(row.activity_day),
    eventos_recomendacoes: row.eventos_recomendacoes,
    eventos_cliques: row.eventos_cliques,
    taxa_clique_recomendacao: row.taxa_clique_recomendacao,
    eventos_recomendacoes_formatted: formatPerformanceNumber(row.eventos_recomendacoes),
    eventos_cliques_formatted: formatPerformanceNumber(row.eventos_cliques),
    ctr_formatted: formatPerformanceRate(row.taxa_clique_recomendacao),
  }));

  const snapshotRecommendation = context.snapshotRecommendation?.metrics || [];
  const snapshotCommerce = context.snapshotCommerce?.metrics || [];
  const snapshotConversation = context.snapshotConversation?.metrics || [];
  const snapshotAlerts = context.snapshotAlerts?.metrics || [];

  const snapshotReference = [
    ...snapshotRecommendation.filter((m) => ["generated", "runner_up", "acceptance", "rejection"].includes(m.id)),
    ...snapshotConversation.filter((m) => ["recommendations_shown"].includes(m.id)),
    ...snapshotCommerce.filter((m) => ["clicks", "favorites"].includes(m.id)),
    ...snapshotAlerts.filter((m) => ["alerts_created"].includes(m.id)),
  ].map((m) => ({
    ...m,
    source: "executive-metrics snapshot",
    hint: "Totais agregados do período — complementar ao funil temporal.",
  }));

  const unavailableMetrics = [
    {
      id: "recommendations_clicked_distinct",
      label: "Recomendações clicadas (contagem distinta de decisões)",
      reason: "API expõe cliques em ofertas (offer_click), não cliques por recomendação individual.",
    },
    {
      id: "abandonment_rate_global",
      label: "Taxa de abandono global única",
      reason: "Abandono oficial por transição do funil (PATCH 5.3) — exibido por etapa, não agregado.",
    },
    {
      id: "cohort_funnel",
      label: "Funil por cohort de aquisição",
      reason: "Reservado para camada estratégica PATCH 5.3 Q2 — fora do escopo A.6 operacional.",
    },
  ];

  return {
    meta: {
      display_version: FOUNDER_PERFORMANCE_DISPLAY_VERSION,
      temporal_version: temporal?.temporal_version ?? null,
      reference_period_days: temporal?.reference_period_days ?? null,
      reference_day: conversionData?.reference_day ?? null,
      reference_day_label: formatPerformanceDayLabel(conversionData?.reference_day),
      computed_at: temporal?.computed_at ?? null,
      status,
      partial_errors: partialErrors,
      groups_loaded: { conversion: hasConversion },
    },
    summaryMetrics,
    funnelTable,
    mainBottleneck: mainBottleneck
      ? {
          transicao: TRANSITION_LABELS[mainBottleneck.transicao] ?? mainBottleneck.transicao,
          etapa_origem: mainBottleneck.etapa_origem,
          etapa_destino: mainBottleneck.etapa_destino,
          taxa_abandono: mainBottleneck.taxa_abandono_transicao,
          taxa_abandono_formatted: formatPerformanceRate(mainBottleneck.taxa_abandono_transicao),
        }
      : null,
    bottleneckCards,
    recentDays,
    snapshotReference,
    unavailableMetrics,
  };
}

export const FOUNDER_PERFORMANCE_FORBIDDEN_PATTERNS = [
  /visitor_id/i,
  /conversation_id/i,
  /query_text/i,
  /user_email/i,
];

/** @param {string} text */
export function scanFounderPerformanceForbiddenContent(text = "") {
  const hits = [];
  for (const pattern of FOUNDER_PERFORMANCE_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) hits.push(String(pattern));
  }
  return hits;
}
