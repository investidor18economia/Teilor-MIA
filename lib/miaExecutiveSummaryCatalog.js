/**
 * PATCH C.2 — Executive Summary catalog (C.2.0).
 * Deterministic section templates, highlight/attention rules, empty states.
 * Consumes Baseline B Executive Views only — no SQL · no fetch · no LLM.
 */

import { EXECUTIVE_ANALYSIS_MODULE_IDS } from "./miaExecutiveAnalysisContracts.js";

export const MIA_EXECUTIVE_SUMMARY_CATALOG_VERSION = "C.2.0";

export const EXECUTIVE_SUMMARY_SECTION_IDS = Object.freeze([
  "overview",
  "highlights",
  "attention",
  "commercial",
  "operational",
  "conclusion",
]);

export const EXECUTIVE_SUMMARY_SECTION_TITLES = Object.freeze({
  overview: "Visão Geral",
  highlights: "Principais Destaques",
  attention: "Pontos de Atenção",
  commercial: "Situação Comercial",
  operational: "Situação Operacional",
  conclusion: "Conclusão Geral",
});

export const EXECUTIVE_SUMMARY_MODULE_IDS = Object.freeze([...EXECUTIVE_ANALYSIS_MODULE_IDS]);

export const EXECUTIVE_SUMMARY_EMPTY_MESSAGES = Object.freeze({
  module_insufficient:
    "Dados insuficientes para gerar um resumo confiável deste módulo.",
  no_modules:
    "Dados insuficientes para gerar um resumo confiável — nenhum módulo executivo disponível.",
  no_highlights: "Nenhum destaque positivo confirmado nos módulos disponíveis.",
  no_attention: "Nenhum ponto de atenção confirmado nos módulos disponíveis.",
  partial_overview:
    "Síntese parcial — alguns módulos executivos não possuem dados suficientes.",
});

export const EXECUTIVE_SUMMARY_OVERVIEW_TEMPLATES = Object.freeze({
  all_modules:
    "Plataforma com {modules_available} de {modules_total} módulos executivos disponíveis no período.",
  partial_modules:
    "Plataforma com dados parciais — {modules_available} de {modules_total} módulos executivos disponíveis.",
  no_modules: EXECUTIVE_SUMMARY_EMPTY_MESSAGES.no_modules,
});

export const EXECUTIVE_SUMMARY_CONCLUSION_TEMPLATES = Object.freeze({
  consolidated:
    "Estado consolidado do período: {overall_label}. Módulos participantes: {module_list}.",
  partial:
    "Estado consolidado parcial do período: {overall_label}. Limitações: {limitations_count} registrada(s).",
  insufficient: "Estado consolidado indisponível — dados insuficientes para síntese confiável.",
});

/** Positive fact rules — ordered by priority (deterministic). Max 3 applied. */
export const EXECUTIVE_SUMMARY_HIGHLIGHT_CATALOG = Object.freeze([
  {
    id: "growth_up",
    priority: 1,
    module_id: "growth",
    when: "growth_up",
    template: "Crescimento: {headline}",
    field_path: "growth.narrative.headline",
    rule_ref: "C.2.highlight.growth_up",
  },
  {
    id: "health_excellent",
    priority: 2,
    module_id: "health",
    when: "health_excellent",
    template: "Saúde do produto: {headline}",
    field_path: "health.narrative.headline",
    rule_ref: "C.2.highlight.health_excellent",
  },
  {
    id: "kpis_majority_positive",
    priority: 3,
    module_id: "kpis",
    when: "kpis_majority_positive",
    template: "KPIs: {positive_count} de {total_count} indicadores em estado positivo.",
    field_path: "kpis.kpis",
    rule_ref: "C.2.highlight.kpis_majority_positive",
  },
  {
    id: "commercial_up",
    priority: 4,
    module_id: "commercial",
    when: "commercial_up",
    template: "Performance comercial: {headline}",
    field_path: "commercial.narrative.headline",
    rule_ref: "C.2.highlight.commercial_up",
  },
  {
    id: "operational_stable",
    priority: 5,
    module_id: "operational",
    when: "operational_stable",
    template: "Operação: {headline}",
    field_path: "operational.narrative.headline",
    rule_ref: "C.2.highlight.operational_stable",
  },
  {
    id: "commercial_intent_up",
    priority: 6,
    module_id: "commercial",
    when: "commercial_intent_up",
    template: "Intenção comercial com direção positiva no período.",
    field_path: "commercial.indicators.commercial_intent.direction",
    rule_ref: "C.2.highlight.commercial_intent_up",
  },
]);

/** Attention fact rules — ordered by priority. Max 3 applied. */
export const EXECUTIVE_SUMMARY_ATTENTION_CATALOG = Object.freeze([
  {
    id: "operational_degradation",
    priority: 1,
    module_id: "operational",
    when: "operational_degradation",
    template: "Operação: {headline}",
    field_path: "operational.narrative.headline",
    rule_ref: "C.2.attention.operational_degradation",
  },
  {
    id: "commercial_bottleneck",
    priority: 2,
    module_id: "commercial",
    when: "commercial_bottleneck",
    template: "Funil comercial: gargalo principal identificado ({bottleneck_id}).",
    field_path: "commercial.funnel.main_bottleneck.id",
    rule_ref: "C.2.attention.commercial_bottleneck",
  },
  {
    id: "growth_down",
    priority: 3,
    module_id: "growth",
    when: "growth_down",
    template: "Crescimento: {headline}",
    field_path: "growth.narrative.headline",
    rule_ref: "C.2.attention.growth_down",
  },
  {
    id: "low_volume",
    priority: 4,
    module_id: "commercial",
    when: "low_volume",
    template: "Volume comercial insuficiente para leitura forte no período.",
    field_path: "commercial.meta.volume_confidence",
    rule_ref: "C.2.attention.low_volume",
  },
  {
    id: "health_acceptance_drop",
    priority: 5,
    module_id: "health",
    when: "health_acceptance_drop",
    template: "Saúde: queda confirmada na taxa de aceitação de recomendações.",
    field_path: "health.indicators.recommendation_acceptance.periodDelta",
    rule_ref: "C.2.attention.health_acceptance_drop",
  },
  {
    id: "partial_modules",
    priority: 6,
    module_id: "kpis",
    when: "partial_modules",
    template: "{partial_count} módulo(s) com dados parciais no período.",
    field_path: "meta.partial_modules",
    rule_ref: "C.2.attention.partial_modules",
  },
  {
    id: "commercial_advance_low",
    priority: 7,
    module_id: "commercial",
    when: "commercial_advance_low",
    template: "Taxa de avanço comercial em nível de atenção.",
    field_path: "commercial.indicators.offer_advance_rate.level",
    rule_ref: "C.2.attention.commercial_advance_low",
  },
]);

export const EXECUTIVE_SUMMARY_OVERALL_LABELS = Object.freeze({
  excellent: "excelente",
  very_healthy: "muito saudável",
  healthy: "saudável",
  stable: "estável",
  attention: "atenção",
  critical: "crítico",
  unavailable: "indisponível",
});

export const EXECUTIVE_SUMMARY_CONFIDENCE_THRESHOLDS = Object.freeze({
  min_modules_high: 5,
  min_modules_moderate: 3,
});
