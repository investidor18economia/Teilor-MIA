/**
 * PATCH C.3 — Executive Insight catalog (C.3.0).
 * Categories, priorities, deterministic rules, deduplication groups.
 * Consumes Baseline B Executive Views only — no SQL · no fetch · no LLM.
 */

import { EXECUTIVE_ANALYSIS_MODULE_IDS } from "./miaExecutiveAnalysisContracts.js";

export const MIA_EXECUTIVE_INSIGHT_CATALOG_VERSION = "C.3.0";

export const EXECUTIVE_INSIGHT_CATEGORIES = Object.freeze({
  GROWTH: "growth",
  PRODUCT: "product",
  COMMERCIAL: "commercial",
  OPERATIONAL: "operational",
  CROSS_MODULE: "cross_module",
  GENERAL: "general",
});

export const EXECUTIVE_INSIGHT_CATEGORY_LABELS = Object.freeze({
  growth: "Growth",
  product: "Product",
  commercial: "Commercial",
  operational: "Operational",
  cross_module: "Cross Module",
  general: "General",
});

export const EXECUTIVE_INSIGHT_PRIORITIES = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
});

export const EXECUTIVE_INSIGHT_PRIORITY_RANK = Object.freeze({
  high: 1,
  medium: 2,
  low: 3,
});

export const EXECUTIVE_INSIGHT_MODULE_IDS = Object.freeze([...EXECUTIVE_ANALYSIS_MODULE_IDS]);

export const EXECUTIVE_INSIGHT_EMPTY_MESSAGES = Object.freeze({
  insufficient_data: "Dados insuficientes para gerar insights confiáveis neste período.",
  no_rules_matched: "Nenhum insight relevante identificado com os módulos disponíveis.",
  modules_missing: "Módulos necessários ausentes para este insight.",
  confidence_too_low: "Confiança mínima não atingida para emitir insight.",
});

export const EXECUTIVE_INSIGHT_CONFIDENCE_THRESHOLDS = Object.freeze({
  min_modules_for_insights: 2,
  min_level_for_high_priority: "moderate",
});

/**
 * Deterministic insight rules — ordered by priority rank then rule priority.
 * `when` keys map to signal predicates in the builder.
 * `dedup_group` consolidates semantically equivalent insights.
 */
export const EXECUTIVE_INSIGHT_RULES = Object.freeze([
  {
    id: "cross_module_aligned_growth",
    category: EXECUTIVE_INSIGHT_CATEGORIES.CROSS_MODULE,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.HIGH,
    rule_priority: 1,
    dedup_group: "cross_positive_alignment",
    when: "cross_module_growth_alignment",
    required_modules: ["growth", "commercial", "kpis"],
    min_confidence: "moderate",
    title: "Crescimento consistente entre módulos",
    body_template:
      "Crescimento, performance comercial e KPIs registram direção positiva simultânea no período.",
    rule_ref: "C.3.insight.cross_module_aligned_growth",
    evidence_fields: [
      { module_id: "growth", field_path: "growth.narrative.headline" },
      { module_id: "commercial", field_path: "commercial.narrative.headline" },
      { module_id: "kpis", field_path: "kpis.kpis" },
    ],
  },
  {
    id: "commercial_bottleneck_observed",
    category: EXECUTIVE_INSIGHT_CATEGORIES.COMMERCIAL,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.HIGH,
    rule_priority: 2,
    dedup_group: "commercial_attention",
    when: "commercial_bottleneck",
    required_modules: ["commercial"],
    min_confidence: "moderate",
    title: "Gargalo principal identificado no funil comercial",
    body_template:
      "Funil comercial registra gargalo principal ({bottleneck_id}) no período analisado.",
    rule_ref: "C.3.insight.commercial_bottleneck_observed",
    evidence_fields: [{ module_id: "commercial", field_path: "commercial.funnel.main_bottleneck.id" }],
  },
  {
    id: "operational_degradation_observed",
    category: EXECUTIVE_INSIGHT_CATEGORIES.OPERATIONAL,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.HIGH,
    rule_priority: 3,
    dedup_group: "operational_attention",
    when: "operational_degradation",
    required_modules: ["operational"],
    min_confidence: "moderate",
    title: "Degradação operacional registrada",
    body_template: "Indicadores operacionais registram degradação: {operational_headline}.",
    rule_ref: "C.3.insight.operational_degradation_observed",
    evidence_fields: [{ module_id: "operational", field_path: "operational.narrative.headline" }],
  },
  {
    id: "product_acceptance_drop",
    category: EXECUTIVE_INSIGHT_CATEGORIES.PRODUCT,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.HIGH,
    rule_priority: 4,
    dedup_group: "product_attention",
    when: "health_acceptance_drop",
    required_modules: ["health"],
    min_confidence: "moderate",
    title: "Queda na aceitação de recomendações",
    body_template:
      "Taxa de aceitação de recomendações registra queda confirmada em relação ao período anterior.",
    rule_ref: "C.3.insight.product_acceptance_drop",
    evidence_fields: [
      { module_id: "health", field_path: "health.indicators.recommendation_acceptance.periodDelta" },
    ],
  },
  {
    id: "growth_dau_positive",
    category: EXECUTIVE_INSIGHT_CATEGORIES.GROWTH,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.MEDIUM,
    rule_priority: 5,
    dedup_group: "growth_positive",
    when: "growth_up",
    required_modules: ["growth"],
    min_confidence: "moderate",
    title: "Crescimento de audiência registrado",
    body_template: "Módulo de crescimento registra direção positiva: {growth_headline}.",
    rule_ref: "C.3.insight.growth_dau_positive",
    evidence_fields: [{ module_id: "growth", field_path: "growth.narrative.headline" }],
  },
  {
    id: "commercial_traction",
    category: EXECUTIVE_INSIGHT_CATEGORIES.COMMERCIAL,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.MEDIUM,
    rule_priority: 6,
    dedup_group: "commercial_positive",
    when: "commercial_up_no_bottleneck",
    required_modules: ["commercial"],
    min_confidence: "moderate",
    title: "Tração comercial observada",
    body_template: "Performance comercial registra direção positiva sem gargalo principal ativo.",
    rule_ref: "C.3.insight.commercial_traction",
    evidence_fields: [{ module_id: "commercial", field_path: "commercial.indicators.commercial_trend.direction" }],
  },
  {
    id: "product_health_excellent",
    category: EXECUTIVE_INSIGHT_CATEGORIES.PRODUCT,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.MEDIUM,
    rule_priority: 7,
    dedup_group: "product_positive",
    when: "health_excellent",
    required_modules: ["health"],
    min_confidence: "moderate",
    title: "Saúde do produto em nível excelente",
    body_template: "Índice de saúde do produto registra nível excelente: {health_headline}.",
    rule_ref: "C.3.insight.product_health_excellent",
    evidence_fields: [{ module_id: "health", field_path: "health.narrative.headline" }],
  },
  {
    id: "cross_module_decoupling",
    category: EXECUTIVE_INSIGHT_CATEGORIES.CROSS_MODULE,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.MEDIUM,
    rule_priority: 8,
    dedup_group: "cross_decoupling",
    when: "cross_module_decoupling",
    required_modules: ["growth", "commercial"],
    min_confidence: "moderate",
    title: "Desacoplamento entre indicadores de crescimento e comercial",
    body_template:
      "Crescimento e performance comercial registram direções distintas no mesmo período.",
    rule_ref: "C.3.insight.cross_module_decoupling",
    evidence_fields: [
      { module_id: "growth", field_path: "growth.trends.dau.direction" },
      { module_id: "commercial", field_path: "commercial.indicators.commercial_trend.direction" },
    ],
  },
  {
    id: "operational_stable",
    category: EXECUTIVE_INSIGHT_CATEGORIES.OPERATIONAL,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.LOW,
    rule_priority: 9,
    dedup_group: "operational_stable",
    when: "operational_stable",
    required_modules: ["operational"],
    min_confidence: "moderate",
    title: "Operação estável no período",
    body_template: "Indicadores operacionais registram estabilidade: {operational_headline}.",
    rule_ref: "C.3.insight.operational_stable",
    evidence_fields: [{ module_id: "operational", field_path: "operational.narrative.headline" }],
  },
  {
    id: "platform_broad_stability",
    category: EXECUTIVE_INSIGHT_CATEGORIES.GENERAL,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.LOW,
    rule_priority: 10,
    dedup_group: "general_stability",
    when: "platform_stability",
    required_modules: ["kpis", "growth", "health", "commercial", "operational"],
    min_confidence: "high",
    title: "Estabilidade prolongada entre módulos principais",
    body_template:
      "Todos os módulos executivos principais registram estado estável ou positivo no período.",
    rule_ref: "C.3.insight.platform_broad_stability",
    evidence_fields: [{ module_id: "meta", field_path: "modules_available" }],
  },
  {
    id: "kpis_majority_positive",
    category: EXECUTIVE_INSIGHT_CATEGORIES.GENERAL,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.MEDIUM,
    rule_priority: 11,
    dedup_group: "kpis_positive",
    when: "kpis_majority_positive",
    required_modules: ["kpis"],
    min_confidence: "moderate",
    title: "Maioria dos KPIs em estado positivo",
    body_template: "{positive_kpis} de {total_kpis} KPIs estratégicos em estado positivo.",
    rule_ref: "C.3.insight.kpis_majority_positive",
    evidence_fields: [{ module_id: "kpis", field_path: "kpis.kpis" }],
  },
  {
    id: "commercial_low_volume",
    category: EXECUTIVE_INSIGHT_CATEGORIES.COMMERCIAL,
    priority: EXECUTIVE_INSIGHT_PRIORITIES.LOW,
    rule_priority: 12,
    dedup_group: "commercial_limitation",
    when: "low_volume",
    required_modules: ["commercial"],
    min_confidence: "low",
    title: "Volume comercial insuficiente para leitura forte",
    body_template: "Volume de eventos comerciais insuficiente para insights de alta confiança.",
    rule_ref: "C.3.insight.commercial_low_volume",
    evidence_fields: [{ module_id: "commercial", field_path: "commercial.meta.volume_confidence" }],
  },
]);

export const EXECUTIVE_INSIGHT_CONFIDENCE_RANK = Object.freeze({
  high: 3,
  moderate: 2,
  low: 1,
  insufficient_data: 0,
});
