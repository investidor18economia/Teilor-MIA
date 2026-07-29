/**
 * PATCH B.7 — Executive Summary catalog (Single Source of Truth).
 */

export const FOUNDER_EXECUTIVE_SUMMARY_CATALOG_VERSION = "B.7.0";

export const SUMMARY_MODULE_IDS = Object.freeze([
  "kpis",
  "growth",
  "health",
  "commercial",
  "operational",
]);

export const SUMMARY_OVERALL_LEVEL_IDS = Object.freeze({
  EXCELLENT: "excellent",
  VERY_HEALTHY: "very_healthy",
  HEALTHY: "healthy",
  STABLE: "stable",
  ATTENTION: "attention",
  CRITICAL: "critical",
  UNAVAILABLE: "unavailable",
});

export const SUMMARY_OVERALL_LEVEL_LABELS = Object.freeze({
  excellent: "Excelente",
  very_healthy: "Muito saudável",
  healthy: "Saudável",
  stable: "Estável",
  attention: "Atenção",
  critical: "Crítico",
  unavailable: "Indisponível",
});

export const SUMMARY_CONFIDENCE_IDS = Object.freeze({
  HIGH: "high",
  MODERATE: "moderate",
  LOW: "low",
});

export const SUMMARY_CONFIDENCE_LABELS = Object.freeze({
  high: "Alta confiança",
  moderate: "Confiança moderada",
  low: "Baixa confiança",
});

export const SUMMARY_OVERALL_EXCELLENT = 0.85;
export const SUMMARY_OVERALL_VERY_HEALTHY = 0.75;
export const SUMMARY_OVERALL_HEALTHY = 0.65;
export const SUMMARY_OVERALL_STABLE = 0.5;
export const SUMMARY_OVERALL_ATTENTION = 0.35;

export const SUMMARY_MIN_MODULES_HIGH_CONFIDENCE = 5;
export const SUMMARY_MIN_MODULES_MODERATE_CONFIDENCE = 3;

export const SUMMARY_EMPTY_MESSAGES = Object.freeze({
  module_unavailable: "Módulo indisponível — síntese parcial.",
  no_modules: "Nenhum módulo executivo disponível para síntese.",
  low_volume: "Volume insuficiente para conclusões fortes.",
  no_period_compare: "Comparativo de período indisponível.",
  insufficient_data: "Dados insuficientes para síntese confiável.",
});

/** Map badge ids from B.2–B.6 to normalized score 0–1 (null = unknown). */
export const SUMMARY_BADGE_SCORE_MAP = Object.freeze({
  excellent: 1,
  growing: 0.85,
  healthy: 0.8,
  stable: 0.65,
  evolving: 0.72,
  accelerating: 0.9,
  decelerating: 0.45,
  attention: 0.4,
  critical: 0.15,
  degrading: 0.2,
  insufficient: null,
  unavailable: null,
});

export const EXECUTIVE_SUMMARY_PRIORITY_CATALOG = Object.freeze([
  {
    id: "commercial_bottleneck",
    source: "commercial",
    label: "Melhorar avanço das ofertas",
    when: "commercial_bottleneck",
    priority: 1,
  },
  {
    id: "commercial_advance_low",
    source: "commercial",
    label: "Melhorar avanço das ofertas",
    when: "commercial_advance_low",
    priority: 1,
  },
  {
    id: "growth_acquisition",
    source: "growth",
    label: "Expandir aquisição de usuários",
    when: "growth_dau_down",
    priority: 2,
  },
  {
    id: "engagement_recurring",
    source: "growth",
    label: "Aumentar engajamento recorrente",
    when: "growth_engagement_flat",
    priority: 3,
  },
  {
    id: "product_acceptance",
    source: "health",
    label: "Recuperar aceitação de recomendações",
    when: "health_acceptance_drop",
    priority: 2,
  },
  {
    id: "operational_degradation",
    source: "operational",
    label: "Investigar degradação operacional",
    when: "operational_degradation",
    priority: 1,
  },
  {
    id: "operational_freshness",
    source: "operational",
    label: "Revisar atualização dos dados",
    when: "operational_stale",
    priority: 3,
  },
  {
    id: "commercial_ctr",
    source: "commercial",
    label: "Elevar CTR de ofertas",
    when: "commercial_ctr_low",
    priority: 2,
  },
]);

export const EXECUTIVE_SUMMARY_OPPORTUNITY_CATALOG = Object.freeze([
  { id: "growth_consistent", label: "Crescimento consistente", when: "growth_up" },
  { id: "retention_good", label: "Boa retenção", when: "growth_stable_engagement" },
  { id: "commercial_activity", label: "Aumento da atividade comercial", when: "commercial_up" },
  { id: "operational_stable", label: "Operação estável", when: "operational_stable" },
  { id: "product_quality", label: "Qualidade do produto sólida", when: "health_excellent" },
  { id: "commercial_intent", label: "Intenção comercial em evolução", when: "commercial_intent_up" },
  { id: "kpis_positive", label: "KPIs estratégicos positivos", when: "kpis_majority_positive" },
]);

export const EXECUTIVE_SUMMARY_RISK_CATALOG = Object.freeze([
  { id: "commercial_bottleneck", label: "Gargalo comercial", when: "commercial_bottleneck" },
  { id: "low_volume", label: "Baixo volume para algumas métricas", when: "low_volume" },
  { id: "operational_degradation", label: "Degradação operacional", when: "operational_degradation" },
  { id: "low_active_users", label: "Poucos usuários ativos", when: "low_active_users" },
  { id: "growth_decline", label: "Sinais de desaceleração", when: "growth_dau_down" },
  { id: "health_acceptance", label: "Queda na aceitação", when: "health_acceptance_drop" },
  { id: "partial_data", label: "Dados parciais no período", when: "partial_modules" },
  { id: "no_period_compare", label: "Comparativo de período ausente", when: "no_period_compare" },
]);

export const EXECUTIVE_SUMMARY_HEADLINE_RULES = Object.freeze([
  {
    id: "growth_stable_ops",
    when: "growth_up_operational_stable",
    text: "A plataforma apresenta crescimento consistente com operação estável.",
  },
  {
    id: "overall_excellent",
    when: "overall_excellent",
    text: "A Teilor opera em patamar excelente nas principais dimensões executivas.",
  },
  {
    id: "attention_needed",
    when: "overall_attention",
    text: "A plataforma requer atenção em áreas prioritárias identificadas abaixo.",
  },
  {
    id: "critical_state",
    when: "overall_critical",
    text: "Existem sinais críticos que exigem ação imediata do Founder.",
  },
  {
    id: "stable_default",
    when: "overall_stable",
    text: "A plataforma mantém operação estável com evolução moderada.",
  },
  {
    id: "partial_data",
    when: "low_confidence",
    text: "Síntese disponível com limitações — volume ou cobertura parcial de dados.",
  },
  {
    id: "healthy_default",
    when: "default",
    text: "A Teilor demonstra evolução positiva nas métricas monitoradas.",
  },
]);

export const EXECUTIVE_SUMMARY_BODY_TEMPLATES = Object.freeze({
  excellent:
    "A Teilor demonstra evolução positiva nas principais métricas. O crescimento permanece saudável, o produto apresenta boa estabilidade e a operação continua consistente.",
  healthy:
    "Os módulos executivos indicam desempenho saudável no período. Oportunidades de otimização comercial e engajamento permanecem como alavancas de crescimento.",
  stable:
    "A operação permanece estável com sinais mistos entre crescimento, produto e comercial. Prioridades abaixo destacam onde concentrar esforços.",
  attention:
    "Há sinais de atenção em mais de uma dimensão executiva. Revisar prioridades e riscos antes de ampliar investimentos.",
  critical:
    "Múltiplos módulos reportam degradação ou risco elevado. Investigação operacional e comercial recomendada.",
  partial:
    "A síntese reflete apenas os módulos com dados disponíveis. Conclusões fortes não são geradas sem cobertura completa.",
});

/**
 * @param {number|null|undefined} avgScore
 * @param {{ hasCritical?: boolean, unavailable?: boolean }} ctx
 */
export function classifySummaryOverallLevel(avgScore, ctx = {}) {
  if (ctx.unavailable || avgScore == null || !Number.isFinite(avgScore)) {
    return {
      id: SUMMARY_OVERALL_LEVEL_IDS.UNAVAILABLE,
      label: SUMMARY_OVERALL_LEVEL_LABELS.unavailable,
    };
  }
  if (ctx.hasCritical || avgScore < SUMMARY_OVERALL_ATTENTION) {
    return {
      id: SUMMARY_OVERALL_LEVEL_IDS.CRITICAL,
      label: SUMMARY_OVERALL_LEVEL_LABELS.critical,
    };
  }
  if (avgScore < SUMMARY_OVERALL_STABLE) {
    return {
      id: SUMMARY_OVERALL_LEVEL_IDS.ATTENTION,
      label: SUMMARY_OVERALL_LEVEL_LABELS.attention,
    };
  }
  if (avgScore < SUMMARY_OVERALL_HEALTHY) {
    return {
      id: SUMMARY_OVERALL_LEVEL_IDS.STABLE,
      label: SUMMARY_OVERALL_LEVEL_LABELS.stable,
    };
  }
  if (avgScore < SUMMARY_OVERALL_VERY_HEALTHY) {
    return {
      id: SUMMARY_OVERALL_LEVEL_IDS.HEALTHY,
      label: SUMMARY_OVERALL_LEVEL_LABELS.healthy,
    };
  }
  if (avgScore < SUMMARY_OVERALL_EXCELLENT) {
    return {
      id: SUMMARY_OVERALL_LEVEL_IDS.VERY_HEALTHY,
      label: SUMMARY_OVERALL_LEVEL_LABELS.very_healthy,
    };
  }
  return {
    id: SUMMARY_OVERALL_LEVEL_IDS.EXCELLENT,
    label: SUMMARY_OVERALL_LEVEL_LABELS.excellent,
  };
}

/**
 * @param {{
 *   modulesAvailable?: number,
 *   modulesTotal?: number,
 *   periodCompareCount?: number,
 *   lowVolume?: boolean,
 *   partialModules?: number,
 * }} ctx
 */
export function classifySummaryConfidence(ctx = {}) {
  const available = ctx.modulesAvailable ?? 0;
  const partial = ctx.partialModules ?? 0;
  const periodCompare = ctx.periodCompareCount ?? 0;

  if (
    available >= SUMMARY_MIN_MODULES_HIGH_CONFIDENCE &&
    partial === 0 &&
    periodCompare >= 2 &&
    !ctx.lowVolume
  ) {
    return {
      id: SUMMARY_CONFIDENCE_IDS.HIGH,
      label: SUMMARY_CONFIDENCE_LABELS.high,
    };
  }
  if (available >= SUMMARY_MIN_MODULES_MODERATE_CONFIDENCE && !ctx.lowVolume) {
    return {
      id: SUMMARY_CONFIDENCE_IDS.MODERATE,
      label: SUMMARY_CONFIDENCE_LABELS.moderate,
    };
  }
  return {
    id: SUMMARY_CONFIDENCE_IDS.LOW,
    label: SUMMARY_CONFIDENCE_LABELS.low,
  };
}

/**
 * @param {string|null|undefined} badgeId
 */
export function summaryBadgeToScore(badgeId) {
  if (!badgeId) return null;
  const score = SUMMARY_BADGE_SCORE_MAP[badgeId];
  return score ?? null;
}
