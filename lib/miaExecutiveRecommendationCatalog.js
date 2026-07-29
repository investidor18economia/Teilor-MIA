/**
 * PATCH C.6 — Executive Recommendation catalog (C.6.0).
 * Types, rules, thresholds — single source of truth.
 * No SQL · no fetch · no LLM.
 */

import { EXECUTIVE_ANALYSIS_MODULE_IDS } from "./miaExecutiveAnalysisContracts.js";
import { EXECUTIVE_ALERT_PRIORITIES } from "./miaExecutiveAlertCatalog.js";

export const MIA_EXECUTIVE_RECOMMENDATION_CATALOG_VERSION = "C.6.0";

export const EXECUTIVE_RECOMMENDATION_TYPES = Object.freeze({
  INVESTIGATE: "investigate",
  MONITOR: "monitor",
  VALIDATE: "validate",
  OPTIMIZE: "optimize",
  EXPAND: "expand",
  REDUCE_RISK: "reduce_risk",
  IMPROVE_QUALITY: "improve_quality",
  COLLECT_MORE_DATA: "collect_more_data",
  NO_ACTION: "no_action",
});

export const EXECUTIVE_RECOMMENDATION_CATEGORIES = Object.freeze({
  GROWTH: "growth",
  PRODUCT: "product",
  COMMERCIAL: "commercial",
  OPERATIONAL: "operational",
  CROSS_MODULE: "cross_module",
  DATA_QUALITY: "data_quality",
  GENERAL: "general",
});

export const EXECUTIVE_RECOMMENDATION_PRIORITIES = Object.freeze({
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
});

export const EXECUTIVE_RECOMMENDATION_PRIORITY_RANK = Object.freeze({
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
});

export const EXECUTIVE_RECOMMENDATION_REVIEW_AFTER = Object.freeze({
  NEXT_PERIOD: "next_period",
  NEXT_SNAPSHOT: "next_snapshot",
  SEVEN_DAYS: "7_days",
  THIRTY_DAYS: "30_days",
  NONE: "none",
});

export const EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES = Object.freeze({
  REDUCE_UNCERTAINTY: "reduce_uncertainty",
  VALIDATE_HYPOTHESIS: "validate_hypothesis",
  IMPROVE_STABILITY: "improve_stability",
  CONFIRM_TREND: "confirm_trend",
  IMPROVE_DATA_QUALITY: "improve_data_quality",
  CAPTURE_OPPORTUNITY: "capture_opportunity",
  MAINTAIN_STABILITY: "maintain_stability",
  NO_CHANGE_EXPECTED: "no_change_expected",
});

export const EXECUTIVE_RECOMMENDATION_CONFIDENCE_RANK = Object.freeze({
  high: 3,
  moderate: 2,
  low: 1,
  insufficient_data: 0,
});

export const EXECUTIVE_RECOMMENDATION_CONFIDENCE_GATES = Object.freeze({
  p0_min: "moderate",
  p1_min: "moderate",
  p2_min: "low",
  p3_min: "low",
});

export const EXECUTIVE_RECOMMENDATION_EMPTY_MESSAGES = Object.freeze({
  no_recommendations: "Nenhuma recomendação acionável elegível no período analisado.",
  insufficient: "Dados insuficientes para emitir recomendações confiáveis.",
  no_action: "Nenhuma ação prioritária identificada — manter acompanhamento de rotina.",
});

export const EXECUTIVE_RECOMMENDATION_SPECULATION_BLOCKLIST = Object.freeze([
  /\bacho\b/i,
  /\btalvez\b/i,
  /\bparece\b/i,
  /\bprovavelmente\b/i,
  /\bpossivelmente\b/i,
]);

export const EXECUTIVE_RECOMMENDATION_CAUSALITY_BLOCKLIST = Object.freeze([
  /\bporque\b/i,
  /\bdevido a\b/i,
  /\bcausad[oa] por\b/i,
  /\bresultado de\b/i,
  /\bconsequência de\b/i,
]);

/** Deterministic rules — triggered by alerts, trends, or insights. */
export const EXECUTIVE_RECOMMENDATION_RULES = Object.freeze([
  {
    id: "investigate_operational_critical",
    recommendation_key: "operational.investigate_critical",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.OPERATIONAL,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.INVESTIGATE,
    when: "alert_key",
    match: ["operational.critical"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P0,
    min_confidence: "moderate",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.REDUCE_UNCERTAINTY,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_SNAPSHOT,
    dedup_group: "operational_investigate",
    rule_ref: "C.6.rec.investigate_operational_critical",
    title: "Investigar degradação operacional crítica",
    description_template:
      "Investigar indicadores operacionais em estado crítico registrados no período.",
    rationale_template:
      "Recomendação gerada porque alerta operacional crítico (P0) com confiança {confidence_level}.",
  },
  {
    id: "investigate_cross_module",
    recommendation_key: "cross_module.investigate_deterioration",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.CROSS_MODULE,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.INVESTIGATE,
    when: "alert_key",
    match: ["cross_module.deterioration"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P1,
    min_confidence: "moderate",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.VALIDATE_HYPOTHESIS,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_PERIOD,
    dedup_group: "cross_module_investigate",
    rule_ref: "C.6.rec.investigate_cross_module",
    title: "Investigar convergência negativa entre módulos",
    description_template:
      "Investigar sinais negativos simultâneos em crescimento e performance comercial.",
    rationale_template:
      "Recomendação gerada porque alerta cross-module de alta prioridade converge com {alert_count} alerta(s) relacionado(s).",
  },
  {
    id: "optimize_commercial_bottleneck",
    recommendation_key: "commercial.optimize_bottleneck",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.COMMERCIAL,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.OPTIMIZE,
    when: "alert_key",
    match: ["commercial.bottleneck"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P1,
    min_confidence: "moderate",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.IMPROVE_STABILITY,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_PERIOD,
    dedup_group: "commercial_optimize",
    rule_ref: "C.6.rec.optimize_commercial_bottleneck",
    title: "Otimizar gargalo principal do funil comercial",
    description_template:
      "Revisar etapa de gargalo identificada no funil comercial para reduzir abandono na transição.",
    rationale_template:
      "Recomendação gerada porque alerta de gargalo comercial com prioridade {alert_priority} e confiança {confidence_level}.",
  },
  {
    id: "validate_acceptance_drop",
    recommendation_key: "product.validate_acceptance",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.PRODUCT,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.VALIDATE,
    when: "alert_key",
    match: ["product.acceptance_drop"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P1,
    min_confidence: "moderate",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.CONFIRM_TREND,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_PERIOD,
    dedup_group: "product_validate",
    rule_ref: "C.6.rec.validate_acceptance_drop",
    title: "Validar queda na aceitação de recomendações",
    description_template:
      "Validar se a queda na taxa de aceitação persiste no próximo comparativo de período.",
    rationale_template:
      "Recomendação gerada porque alerta de queda na aceitação com confiança {confidence_level}.",
  },
  {
    id: "validate_commercial_decline",
    recommendation_key: "commercial.validate_decline",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.COMMERCIAL,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.VALIDATE,
    when: "alert_key",
    match: ["commercial.decline"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P2,
    min_confidence: "moderate",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.CONFIRM_TREND,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_PERIOD,
    dedup_group: "commercial_validate",
    rule_ref: "C.6.rec.validate_commercial_decline",
    title: "Validar queda comercial confirmada",
    description_template:
      "Validar persistência da queda comercial observada antes de escalar acompanhamento.",
    rationale_template:
      "Recomendação gerada porque tendência/alerta de queda comercial com confiança {confidence_level}.",
  },
  {
    id: "monitor_growth_decline",
    recommendation_key: "growth.monitor_decline",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.GROWTH,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.MONITOR,
    when: "alert_key",
    match: ["growth.decline"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P2,
    min_confidence: "moderate",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.CONFIRM_TREND,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_PERIOD,
    dedup_group: "growth_monitor",
    rule_ref: "C.6.rec.monitor_growth_decline",
    title: "Monitorar queda de crescimento",
    description_template:
      "Acompanhar indicadores de crescimento no próximo período para confirmar direção.",
    rationale_template:
      "Recomendação gerada porque alerta de queda em indicador de crescimento com confiança {confidence_level}.",
  },
  {
    id: "investigate_operational_degradation",
    recommendation_key: "operational.investigate_degradation",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.OPERATIONAL,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.INVESTIGATE,
    when: "alert_key",
    match: ["operational.degradation"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P2,
    min_confidence: "moderate",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.REDUCE_UNCERTAINTY,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_SNAPSHOT,
    dedup_group: "operational_investigate",
    rule_ref: "C.6.rec.investigate_operational_degradation",
    title: "Investigar degradação operacional",
    description_template: "Investigar sinais de degradação operacional registrados no período.",
    rationale_template:
      "Recomendação gerada porque alerta operacional com prioridade {alert_priority}.",
  },
  {
    id: "collect_data_low_volume",
    recommendation_key: "commercial.collect_more_data",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.DATA_QUALITY,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.COLLECT_MORE_DATA,
    when: "alert_key",
    match: ["commercial.low_volume"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P2,
    min_confidence: "low",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.IMPROVE_DATA_QUALITY,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.THIRTY_DAYS,
    dedup_group: "data_collect",
    rule_ref: "C.6.rec.collect_data_low_volume",
    title: "Ampliar volume de dados comerciais",
    description_template:
      "Aguardar maior volume de eventos comerciais para análises de alta confiança.",
    rationale_template:
      "Recomendação gerada porque volume comercial insuficiente limita confiança analítica.",
  },
  {
    id: "collect_data_modules_missing",
    recommendation_key: "data.collect_modules",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.DATA_QUALITY,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.COLLECT_MORE_DATA,
    when: "alert_key",
    match: ["data.modules_missing"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P2,
    min_confidence: "low",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.IMPROVE_DATA_QUALITY,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_SNAPSHOT,
    dedup_group: "data_collect",
    rule_ref: "C.6.rec.collect_data_modules_missing",
    title: "Restaurar módulos executivos indisponíveis",
    description_template:
      "Verificar disponibilidade de módulos executivos ausentes que limitam a análise.",
    rationale_template:
      "Recomendação gerada porque {modules_missing} módulo(s) executivo(s) indisponível(is).",
  },
  {
    id: "reduce_risk_cross_module",
    recommendation_key: "cross_module.reduce_risk",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.CROSS_MODULE,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.REDUCE_RISK,
    when: "insight_id",
    match: ["cross_module_decoupling"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P2,
    min_confidence: "moderate",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.VALIDATE_HYPOTHESIS,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_PERIOD,
    dedup_group: "cross_module_risk",
    rule_ref: "C.6.rec.reduce_risk_cross_module",
    title: "Reduzir risco de divergência entre módulos",
    description_template:
      "Acompanhar divergência observada entre crescimento e performance comercial.",
    rationale_template:
      "Recomendação gerada porque insight de desacoplamento cross-module com confiança {confidence_level}.",
  },
  {
    id: "expand_aligned_growth",
    recommendation_key: "growth.expand_aligned",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.GROWTH,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.EXPAND,
    when: "insight_id",
    match: ["cross_module_aligned_growth", "growth_dau_positive"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P3,
    min_confidence: "moderate",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.CAPTURE_OPPORTUNITY,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.THIRTY_DAYS,
    dedup_group: "growth_expand",
    rule_ref: "C.6.rec.expand_aligned_growth",
    title: "Expandir acompanhamento de crescimento alinhado",
    description_template:
      "Manter foco executivo em indicadores de crescimento com sinais positivos convergentes.",
    rationale_template:
      "Recomendação gerada porque insight de crescimento positivo com confiança {confidence_level}.",
  },
  {
    id: "improve_quality_data",
    recommendation_key: "data.improve_quality",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.DATA_QUALITY,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.IMPROVE_QUALITY,
    when: "insight_id",
    match: ["commercial_low_volume"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P3,
    min_confidence: "low",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.IMPROVE_DATA_QUALITY,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.THIRTY_DAYS,
    dedup_group: "data_quality",
    rule_ref: "C.6.rec.improve_quality_data",
    title: "Melhorar qualidade de leitura comercial",
    description_template:
      "Aguardar ou ampliar cobertura de eventos comerciais para leituras mais confiáveis.",
    rationale_template:
      "Recomendação gerada porque insight de volume comercial insuficiente.",
  },
  {
    id: "monitor_platform_stable",
    recommendation_key: "general.monitor_stable",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.GENERAL,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.MONITOR,
    when: "insight_id",
    match: ["platform_broad_stability", "operational_stable"],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P3,
    min_confidence: "moderate",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.MAINTAIN_STABILITY,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_PERIOD,
    dedup_group: "general_monitor",
    rule_ref: "C.6.rec.monitor_platform_stable",
    title: "Monitorar estabilidade da plataforma",
    description_template:
      "Manter acompanhamento de rotina — indicadores registram estabilidade no período.",
    rationale_template:
      "Recomendação gerada porque insight de estabilidade com confiança {confidence_level}.",
  },
  {
    id: "no_action_stable",
    recommendation_key: "general.no_action",
    category: EXECUTIVE_RECOMMENDATION_CATEGORIES.GENERAL,
    recommendation_type: EXECUTIVE_RECOMMENDATION_TYPES.NO_ACTION,
    when: "no_action_eligible",
    match: [],
    base_priority: EXECUTIVE_RECOMMENDATION_PRIORITIES.P3,
    min_confidence: "low",
    expected_outcome: EXECUTIVE_RECOMMENDATION_EXPECTED_OUTCOMES.NO_CHANGE_EXPECTED,
    review_after: EXECUTIVE_RECOMMENDATION_REVIEW_AFTER.NEXT_PERIOD,
    dedup_group: "no_action",
    rule_ref: "C.6.rec.no_action_stable",
    title: "Nenhuma ação prioritária no período",
    description_template:
      "Manter acompanhamento de rotina — nenhum alerta relevante ou tendência preocupante identificada.",
    rationale_template:
      "Recomendação gerada porque nenhum alerta de severidade média ou superior e nenhuma tendência de queda confirmada.",
  },
]);

export const EXECUTIVE_RECOMMENDATION_MODULE_IDS = Object.freeze([...EXECUTIVE_ANALYSIS_MODULE_IDS]);

export const EXECUTIVE_ALERT_PRIORITY_TO_RECOMMENDATION = Object.freeze({
  [EXECUTIVE_ALERT_PRIORITIES.P0]: EXECUTIVE_RECOMMENDATION_PRIORITIES.P0,
  [EXECUTIVE_ALERT_PRIORITIES.P1]: EXECUTIVE_RECOMMENDATION_PRIORITIES.P1,
  [EXECUTIVE_ALERT_PRIORITIES.P2]: EXECUTIVE_RECOMMENDATION_PRIORITIES.P2,
  [EXECUTIVE_ALERT_PRIORITIES.P3]: EXECUTIVE_RECOMMENDATION_PRIORITIES.P3,
});

export const EXECUTIVE_RECOMMENDATION_ALERT_SEVERITY_BLOCK_FOR_NO_ACTION = Object.freeze([
  "critical",
  "high",
  "medium",
]);
