/**
 * PATCH C.5 — Executive Alert catalog (C.5.0).
 * Severities, urgencies, priorities, rules, thresholds — single source of truth.
 * No SQL · no fetch · no LLM.
 */

import { EXECUTIVE_ANALYSIS_MODULE_IDS } from "./miaExecutiveAnalysisContracts.js";

export const MIA_EXECUTIVE_ALERT_CATALOG_VERSION = "C.5.0";

export const EXECUTIVE_ALERT_CATEGORIES = Object.freeze({
  GROWTH: "growth",
  PRODUCT: "product",
  COMMERCIAL: "commercial",
  OPERATIONAL: "operational",
  CROSS_MODULE: "cross_module",
  DATA_QUALITY: "data_quality",
  GENERAL: "general",
});

export const EXECUTIVE_ALERT_SEVERITIES = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  INFORMATIONAL: "informational",
});

export const EXECUTIVE_ALERT_SEVERITY_RANK = Object.freeze({
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  informational: 1,
});

export const EXECUTIVE_ALERT_URGENCIES = Object.freeze({
  IMMEDIATE: "immediate",
  SOON: "soon",
  MONITOR: "monitor",
  NONE: "none",
});

export const EXECUTIVE_ALERT_PRIORITIES = Object.freeze({
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
});

export const EXECUTIVE_ALERT_STATUSES = Object.freeze({
  ACTIVE: "active",
  MONITORING: "monitoring",
  SUPPRESSED: "suppressed",
  INSUFFICIENT_DATA: "insufficient_data",
});

export const EXECUTIVE_ALERT_SOURCE_TYPES = Object.freeze({
  METRIC: "metric",
  INSIGHT: "insight",
  TREND: "trend",
  DATA_QUALITY: "data_quality",
});

export const EXECUTIVE_ALERT_IMPACT_TYPES = Object.freeze({
  PLATFORM_GROWTH: "platform_growth",
  PRODUCT_HEALTH: "product_health",
  COMMERCIAL_PERFORMANCE: "commercial_performance",
  OPERATIONAL_HEALTH: "operational_health",
  FOUNDER_VISIBILITY: "founder_visibility",
  DATA_RELIABILITY: "data_reliability",
});

export const EXECUTIVE_ALERT_IMPACT_LEVELS = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  UNKNOWN: "unknown",
});

export const EXECUTIVE_ALERT_CONFIDENCE_GATES = Object.freeze({
  critical_min: "moderate",
  high_min: "moderate",
  medium_min: "low",
  low_min: "low",
});

export const EXECUTIVE_ALERT_EMPTY_MESSAGES = Object.freeze({
  no_alerts: "Nenhum alerta estratégico elegível no período analisado.",
  insufficient: "Dados insuficientes para emitir alertas confiáveis.",
  suppressed_noise: "Sinal suprimido por controle de ruído.",
  confidence_blocked: "Alerta bloqueado — confiança abaixo do mínimo exigido.",
});

export const EXECUTIVE_ALERT_CAUSALITY_BLOCKLIST = Object.freeze([
  /\bporque\b/i,
  /\bdevido a\b/i,
  /\bcausad[oa] por\b/i,
  /\bresultado de\b/i,
  /\bconsequência de\b/i,
]);

export const EXECUTIVE_ALERT_RECOMMENDATION_BLOCKLIST = Object.freeze([
  /\bfaça\b/i,
  /\bpriorize\b/i,
  /\bcorrija\b/i,
  /\binvista\b/i,
  /\breduza\b/i,
  /\baumente\b/i,
  /\brevise\b/i,
  /\bmude a estratégia\b/i,
]);

export const EXECUTIVE_ALERT_THRESHOLDS = Object.freeze({
  health_index_critical: 40,
  health_index_attention: 55,
  commercial_index_attention: 45,
  operational_index_critical: 35,
  modules_missing_alert: 2,
  trend_decline_magnitude_min: "small",
  acceptance_drop_min: -0.02,
});

/** Rules that can trigger alerts — ordered by severity rank. */
export const EXECUTIVE_ALERT_RULES = Object.freeze([
  {
    id: "operational_critical",
    alert_key: "operational.critical",
    category: EXECUTIVE_ALERT_CATEGORIES.OPERATIONAL,
    source_type: EXECUTIVE_ALERT_SOURCE_TYPES.METRIC,
    when: "operational_critical",
    base_severity: EXECUTIVE_ALERT_SEVERITIES.CRITICAL,
    base_urgency: EXECUTIVE_ALERT_URGENCIES.IMMEDIATE,
    impact_type: EXECUTIVE_ALERT_IMPACT_TYPES.OPERATIONAL_HEALTH,
    impact_level: EXECUTIVE_ALERT_IMPACT_LEVELS.HIGH,
    dedup_group: "operational_critical",
    suppresses: ["operational.degradation"],
    min_confidence: "moderate",
    rule_ref: "C.5.alert.operational_critical",
    title: "Degradação operacional crítica",
    message_template: "Indicadores operacionais registram estado crítico: {headline}.",
  },
  {
    id: "cross_module_deterioration",
    alert_key: "cross_module.deterioration",
    category: EXECUTIVE_ALERT_CATEGORIES.CROSS_MODULE,
    source_type: EXECUTIVE_ALERT_SOURCE_TYPES.INSIGHT,
    when: "cross_module_negative",
    base_severity: EXECUTIVE_ALERT_SEVERITIES.HIGH,
    base_urgency: EXECUTIVE_ALERT_URGENCIES.SOON,
    impact_type: EXECUTIVE_ALERT_IMPACT_TYPES.FOUNDER_VISIBILITY,
    impact_level: EXECUTIVE_ALERT_IMPACT_LEVELS.HIGH,
    dedup_group: "cross_module_deterioration",
    suppresses: ["growth.decline", "commercial.decline"],
    min_confidence: "moderate",
    rule_ref: "C.5.alert.cross_module_deterioration",
    title: "Convergência negativa entre módulos",
    message_template:
      "Crescimento e performance comercial registram sinais negativos simultâneos no período.",
  },
  {
    id: "commercial_bottleneck",
    alert_key: "commercial.bottleneck",
    category: EXECUTIVE_ALERT_CATEGORIES.COMMERCIAL,
    source_type: EXECUTIVE_ALERT_SOURCE_TYPES.METRIC,
    when: "commercial_bottleneck",
    base_severity: EXECUTIVE_ALERT_SEVERITIES.HIGH,
    base_urgency: EXECUTIVE_ALERT_URGENCIES.SOON,
    impact_type: EXECUTIVE_ALERT_IMPACT_TYPES.COMMERCIAL_PERFORMANCE,
    impact_level: EXECUTIVE_ALERT_IMPACT_LEVELS.HIGH,
    dedup_group: "commercial_bottleneck",
    suppresses: [],
    min_confidence: "moderate",
    rule_ref: "C.5.alert.commercial_bottleneck",
    title: "Gargalo principal no funil comercial",
    message_template: "Funil comercial com gargalo principal identificado ({bottleneck_id}).",
  },
  {
    id: "product_acceptance_drop",
    alert_key: "product.acceptance_drop",
    category: EXECUTIVE_ALERT_CATEGORIES.PRODUCT,
    source_type: EXECUTIVE_ALERT_SOURCE_TYPES.METRIC,
    when: "health_acceptance_drop",
    base_severity: EXECUTIVE_ALERT_SEVERITIES.HIGH,
    base_urgency: EXECUTIVE_ALERT_URGENCIES.SOON,
    impact_type: EXECUTIVE_ALERT_IMPACT_TYPES.PRODUCT_HEALTH,
    impact_level: EXECUTIVE_ALERT_IMPACT_LEVELS.MEDIUM,
    dedup_group: "product_acceptance_drop",
    suppresses: [],
    min_confidence: "moderate",
    rule_ref: "C.5.alert.product_acceptance_drop",
    title: "Queda na aceitação de recomendações",
    message_template: "Taxa de aceitação registra queda confirmada em relação ao período anterior.",
  },
  {
    id: "trend_strategic_decline",
    alert_key: "trend.strategic_decline",
    category: EXECUTIVE_ALERT_CATEGORIES.GENERAL,
    source_type: EXECUTIVE_ALERT_SOURCE_TYPES.TREND,
    when: "trend_decline_negative",
    base_severity: EXECUTIVE_ALERT_SEVERITIES.MEDIUM,
    base_urgency: EXECUTIVE_ALERT_URGENCIES.MONITOR,
    impact_type: EXECUTIVE_ALERT_IMPACT_TYPES.FOUNDER_VISIBILITY,
    impact_level: EXECUTIVE_ALERT_IMPACT_LEVELS.MEDIUM,
    dedup_group: "trend_decline",
    suppresses: [],
    min_confidence: "moderate",
    rule_ref: "C.5.alert.trend_strategic_decline",
    title: "Queda confirmada em indicador estratégico",
    message_template: "{metric_label} apresentou queda {magnitude} no período analisado.",
  },
  {
    id: "operational_degradation",
    alert_key: "operational.degradation",
    category: EXECUTIVE_ALERT_CATEGORIES.OPERATIONAL,
    source_type: EXECUTIVE_ALERT_SOURCE_TYPES.INSIGHT,
    when: "operational_degradation",
    base_severity: EXECUTIVE_ALERT_SEVERITIES.MEDIUM,
    base_urgency: EXECUTIVE_ALERT_URGENCIES.MONITOR,
    impact_type: EXECUTIVE_ALERT_IMPACT_TYPES.OPERATIONAL_HEALTH,
    impact_level: EXECUTIVE_ALERT_IMPACT_LEVELS.MEDIUM,
    dedup_group: "operational_degradation",
    suppresses: [],
    min_confidence: "moderate",
    rule_ref: "C.5.alert.operational_degradation",
    title: "Degradação operacional registrada",
    message_template: "Operação registra degradação observável: {headline}.",
  },
  {
    id: "commercial_low_volume",
    alert_key: "commercial.low_volume",
    category: EXECUTIVE_ALERT_CATEGORIES.DATA_QUALITY,
    source_type: EXECUTIVE_ALERT_SOURCE_TYPES.DATA_QUALITY,
    when: "commercial_low_volume",
    base_severity: EXECUTIVE_ALERT_SEVERITIES.LOW,
    base_urgency: EXECUTIVE_ALERT_URGENCIES.MONITOR,
    impact_type: EXECUTIVE_ALERT_IMPACT_TYPES.DATA_RELIABILITY,
    impact_level: EXECUTIVE_ALERT_IMPACT_LEVELS.LOW,
    dedup_group: "commercial_low_volume",
    suppresses: [],
    min_confidence: "low",
    rule_ref: "C.5.alert.commercial_low_volume",
    title: "Volume comercial insuficiente para leitura forte",
    message_template: "Volume de eventos comerciais abaixo do mínimo para alertas de alta confiança.",
  },
  {
    id: "data_modules_missing",
    alert_key: "data.modules_missing",
    category: EXECUTIVE_ALERT_CATEGORIES.DATA_QUALITY,
    source_type: EXECUTIVE_ALERT_SOURCE_TYPES.DATA_QUALITY,
    when: "modules_missing",
    base_severity: EXECUTIVE_ALERT_SEVERITIES.MEDIUM,
    base_urgency: EXECUTIVE_ALERT_URGENCIES.MONITOR,
    impact_type: EXECUTIVE_ALERT_IMPACT_TYPES.DATA_RELIABILITY,
    impact_level: EXECUTIVE_ALERT_IMPACT_LEVELS.MEDIUM,
    dedup_group: "data_modules_missing",
    suppresses: [],
    min_confidence: "low",
    rule_ref: "C.5.alert.data_modules_missing",
    title: "Módulos executivos essenciais indisponíveis",
    message_template: "{missing_count} módulo(s) executivo(s) indisponível(is) — análise parcial.",
  },
]);

export const EXECUTIVE_ALERT_MODULE_IDS = Object.freeze([...EXECUTIVE_ANALYSIS_MODULE_IDS]);

export const EXECUTIVE_ALERT_CONFIDENCE_RANK = Object.freeze({
  high: 3,
  moderate: 2,
  low: 1,
  insufficient_data: 0,
});
