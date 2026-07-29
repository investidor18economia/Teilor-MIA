/**
 * PATCH B.6 — Executive Operational Indicators catalog (Single Source of Truth).
 */

export const FOUNDER_EXECUTIVE_OPERATIONAL_CATALOG_VERSION = "B.6.0";

export const OPERATIONAL_API_DURATION_EXCELLENT_MS = 500;
export const OPERATIONAL_API_DURATION_GOOD_MS = 1500;
export const OPERATIONAL_API_DURATION_ATTENTION_MS = 3000;

export const OPERATIONAL_FRESHNESS_EXCELLENT_MS = 10 * 60 * 1000;
export const OPERATIONAL_FRESHNESS_GOOD_MS = 60 * 60 * 1000;
export const OPERATIONAL_FRESHNESS_ATTENTION_MS = 24 * 60 * 60 * 1000;

export const OPERATIONAL_INDEX_EXCELLENT = 85;
export const OPERATIONAL_INDEX_GOOD = 65;
export const OPERATIONAL_INDEX_ATTENTION = 45;

export const OPERATIONAL_EXPECTED_EXECUTIVE_GROUPS = 10;

export const OPERATIONAL_BADGE_IDS = Object.freeze({
  STABLE: "stable",
  HEALTHY: "healthy",
  ATTENTION: "attention",
  CRITICAL: "critical",
  UNAVAILABLE: "unavailable",
});

export const OPERATIONAL_BADGE_LABELS = Object.freeze({
  stable: "Estável",
  healthy: "Saudável",
  attention: "Atenção",
  critical: "Crítico",
  unavailable: "Indisponível",
});

export const OPERATIONAL_EMPTY_MESSAGES = Object.freeze({
  metric_unavailable: "Métrica indisponível no contrato atual.",
  environment_missing: "Ambiente não informado pelo snapshot.",
  update_missing: "Última atualização indisponível.",
  version_missing: "Versão não informada.",
  temporal_unavailable: "Camada temporal indisponível.",
});

/**
 * @type {ReadonlyArray<{
 *   id: string,
 *   title: string,
 *   description: string,
 *   priority: number,
 *   kind: string,
 *   source: string,
 *   format: string,
 * }>}
 */
export const FOUNDER_EXECUTIVE_OPERATIONAL_INDICATORS = Object.freeze([
  {
    id: "operational_stability",
    title: "Estabilidade operacional",
    description: "Síntese: snapshot íntegro, API responsiva, dados recentes.",
    priority: 1,
    kind: "composite",
    source: "derived",
    format: "text",
  },
  {
    id: "data_availability",
    title: "Disponibilidade dos dados",
    description: "Grupos executivos carregados vs esperados (RPC parcial).",
    priority: 2,
    kind: "coverage",
    source: "executive.groups",
    format: "text",
  },
  {
    id: "snapshot_integrity",
    title: "Integridade do snapshot",
    description: "Ausência de partial_errors no snapshot executivo.",
    priority: 3,
    kind: "integrity",
    source: "executive.partial_errors",
    format: "text",
  },
  {
    id: "update_freshness",
    title: "Tempo de atualização",
    description: "Idade de system.last_update ou computed_at.",
    priority: 4,
    kind: "freshness",
    source: "system.last_update",
    format: "text",
  },
  {
    id: "api_response_time",
    title: "Tempo de resposta da API",
    description: "performance.total_duration_ms do snapshot executivo.",
    priority: 5,
    kind: "latency",
    source: "performance.total_duration_ms",
    format: "duration",
  },
  {
    id: "temporal_layer_consistency",
    title: "Consistência da camada temporal",
    description: "temporal_version oficial + partial_errors temporais.",
    priority: 6,
    kind: "temporal",
    source: "temporal.temporal_version",
    format: "text",
  },
  {
    id: "environment_consistency",
    title: "Consistência do ambiente",
    description: "system.environment informado e reconhecido.",
    priority: 7,
    kind: "environment",
    source: "system.environment",
    format: "text",
  },
  {
    id: "version_integrity",
    title: "Integridade das versões",
    description: "metrics_version + analytics_version + build_version.",
    priority: 8,
    kind: "version",
    source: "system + metrics_version",
    format: "text",
  },
  {
    id: "executive_operational_index",
    title: "Índice executivo operacional",
    description: "Índice 0–100 dos sinais operacionais disponíveis.",
    priority: 9,
    kind: "index",
    source: "derived",
    format: "score",
  },
]);

export const EXECUTIVE_OPERATIONAL_NARRATIVE_RULES = Object.freeze([
  {
    id: "all_stable",
    when: "all_stable",
    text: "A operação permanece estável.",
  },
  {
    id: "services_normal",
    when: "services_normal",
    text: "Todos os serviços monitorados estão respondendo normalmente.",
  },
  {
    id: "update_attention",
    when: "update_stale",
    text: "Há sinais de atenção no tempo de atualização.",
  },
  {
    id: "degradation",
    when: "degradation",
    text: "Existe degradação operacional que merece investigação.",
  },
  {
    id: "environment_consistent",
    when: "environment_ok",
    text: "O ambiente permanece consistente.",
  },
  {
    id: "healthy_default",
    when: "default",
    text: "Indicadores operacionais dentro do padrão observado.",
  },
]);

/**
 * @param {number|null|undefined} ageMs
 */
export function classifyOperationalFreshness(ageMs) {
  if (ageMs == null || !Number.isFinite(ageMs)) return "unknown";
  if (ageMs <= OPERATIONAL_FRESHNESS_EXCELLENT_MS) return "excellent";
  if (ageMs <= OPERATIONAL_FRESHNESS_GOOD_MS) return "healthy";
  if (ageMs >= OPERATIONAL_FRESHNESS_ATTENTION_MS) return "attention";
  return "stable";
}

/**
 * @param {number|null|undefined} durationMs
 */
export function classifyOperationalLatency(durationMs) {
  if (durationMs == null || !Number.isFinite(Number(durationMs))) return "unknown";
  const n = Number(durationMs);
  if (n <= OPERATIONAL_API_DURATION_EXCELLENT_MS) return "excellent";
  if (n <= OPERATIONAL_API_DURATION_GOOD_MS) return "healthy";
  if (n >= OPERATIONAL_API_DURATION_ATTENTION_MS) return "attention";
  return "stable";
}

/**
 * @param {string} level
 */
export function operationalLevelToScore(level) {
  if (level === "excellent") return 1;
  if (level === "healthy" || level === "stable") return 0.75;
  if (level === "attention") return 0.45;
  if (level === "critical") return 0.2;
  return null;
}

/**
 * @param {{ level?: string, critical?: boolean, unavailable?: boolean }} input
 */
export function classifyOperationalBadge(input = {}) {
  if (input.unavailable) {
    return { id: OPERATIONAL_BADGE_IDS.UNAVAILABLE, label: OPERATIONAL_BADGE_LABELS.unavailable };
  }
  if (input.critical || input.level === "critical") {
    return { id: OPERATIONAL_BADGE_IDS.CRITICAL, label: OPERATIONAL_BADGE_LABELS.critical };
  }
  if (input.level === "attention") {
    return { id: OPERATIONAL_BADGE_IDS.ATTENTION, label: OPERATIONAL_BADGE_LABELS.attention };
  }
  if (input.level === "excellent" || input.level === "healthy") {
    return { id: OPERATIONAL_BADGE_IDS.HEALTHY, label: OPERATIONAL_BADGE_LABELS.healthy };
  }
  if (input.level === "stable") {
    return { id: OPERATIONAL_BADGE_IDS.STABLE, label: OPERATIONAL_BADGE_LABELS.stable };
  }
  return null;
}
