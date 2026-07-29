/**
 * PATCH B.8 — Executive UI polish catalog (presentation copy only — B.8.0).
 * No metrics · No mappers · No business rules.
 */

export const FOUNDER_EXECUTIVE_POLISH_CATALOG_VERSION = "B.8.0";

export const EXECUTIVE_POLISH_SOURCE_FOOTER =
  "Dados oficiais do Cockpit · sem agregação no frontend.";

export const EXECUTIVE_MODULE_DISCLAIMERS = Object.freeze({
  kpis: `Visão executiva de decisão rápida · ${EXECUTIVE_POLISH_SOURCE_FOOTER}`,
  growth: `Evolução da plataforma · API Temporal + comparativo executivo · ${EXECUTIVE_POLISH_SOURCE_FOOTER}`,
  health: `Saúde do produto · snapshot executivo · ${EXECUTIVE_POLISH_SOURCE_FOOTER}`,
  commercial: `Performance comercial · snapshot + conversão temporal · ${EXECUTIVE_POLISH_SOURCE_FOOTER}`,
  operational: `Saúde operacional · snapshot system/performance · ${EXECUTIVE_POLISH_SOURCE_FOOTER}`,
  summary: `Síntese dos módulos B.2–B.6 · sem novas métricas · ${EXECUTIVE_POLISH_SOURCE_FOOTER}`,
});

export const EXECUTIVE_POLISH_EMPTY_MESSAGES = Object.freeze({
  loading: "Carregando indicadores executivos…",
  partial: "Alguns sinais retornaram parcialmente.",
  unavailable: "Indisponível no período selecionado.",
  retry: "Tentar novamente",
});

export const EXECUTIVE_SECTION_ORDER = Object.freeze([
  "mod-kpis-estrategicos",
  "mod-crescimento-plataforma",
  "mod-saude-produto",
  "mod-performance-comercial",
  "mod-indicadores-operacionais",
  "mod-resumo-executivo",
  "executive-ai-insights",
]);
