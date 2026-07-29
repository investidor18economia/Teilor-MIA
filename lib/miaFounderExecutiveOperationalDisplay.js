/**
 * PATCH B.6 — Executive Operational Indicators display mapping (B.6.0).
 * Sources: GET /api/executive-metrics + GET /api/temporal-metrics (consistency probe).
 * No SQL · No Supabase · No fetch.
 */

import {
  FOUNDER_EXECUTIVE_OPERATIONAL_INDICATORS,
  FOUNDER_EXECUTIVE_OPERATIONAL_CATALOG_VERSION,
  EXECUTIVE_OPERATIONAL_NARRATIVE_RULES,
  OPERATIONAL_EMPTY_MESSAGES,
  OPERATIONAL_EXPECTED_EXECUTIVE_GROUPS,
  classifyOperationalFreshness,
  classifyOperationalLatency,
  operationalLevelToScore,
  classifyOperationalBadge,
} from "./miaFounderExecutiveOperationalCatalog.js";
import { formatFounderMetricValue } from "./miaFounderCockpitDisplay.js";
import { MIA_EXECUTIVE_METRICS_CATEGORIES } from "./miaExecutiveMetricsCatalog.js";
import { FOUNDER_GROWTH_DISPLAY_VERSION } from "./miaFounderGrowthDisplay.js";

export const FOUNDER_EXECUTIVE_OPERATIONAL_DISPLAY_VERSION = "B.6.0";

const KNOWN_ENVIRONMENTS = new Set(["production", "preview", "development", "staging", "test"]);

/**
 * @param {unknown} timestamp
 * @param {number} [nowMs]
 */
export function computeOperationalAgeMs(timestamp, nowMs = Date.now()) {
  if (!timestamp) return null;
  try {
    const ms = new Date(String(timestamp)).getTime();
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, nowMs - ms);
  } catch {
    return null;
  }
}

/**
 * @param {number|null|undefined} ageMs
 */
export function formatOperationalFreshnessLabel(ageMs) {
  if (ageMs == null || !Number.isFinite(ageMs)) return OPERATIONAL_EMPTY_MESSAGES.update_missing;
  const minutes = Math.round(ageMs / 60000);
  if (minutes < 1) return "Atualizado agora";
  if (minutes < 60) return `Atualizado há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Atualizado há ${hours} h`;
  const days = Math.round(hours / 24);
  return `Atualizado há ${days} d`;
}

/**
 * @param {Record<string, unknown>|null|undefined} executive
 */
export function countExecutiveGroupsLoaded(executive) {
  if (!executive || typeof executive !== "object") return 0;
  return MIA_EXECUTIVE_METRICS_CATEGORIES.filter((cat) => {
    const group = executive[cat];
    return group != null && typeof group === "object" && Object.keys(group).length > 0;
  }).length;
}

/**
 * @param {number[]} scores 0–1
 */
export function computeExecutiveOperationalIndex(scores) {
  const valid = scores.filter((v) => v != null && Number.isFinite(v));
  if (!valid.length) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100);
}

/**
 * @param {{
 *   snapshotIntegrity?: string,
 *   latencyLevel?: string,
 *   freshnessLevel?: string,
 *   temporalLevel?: string,
 *   degradation?: boolean,
 *   allStable?: boolean,
 *   servicesNormal?: boolean,
 *   updateStale?: boolean,
 *   environmentOk?: boolean,
 * }} signals
 */
export function resolveExecutiveOperationalNarrative(signals) {
  if (signals.degradation) {
    return EXECUTIVE_OPERATIONAL_NARRATIVE_RULES.find((r) => r.id === "degradation")?.text;
  }
  if (signals.updateStale) {
    return EXECUTIVE_OPERATIONAL_NARRATIVE_RULES.find((r) => r.id === "update_attention")?.text;
  }
  if (signals.allStable && signals.servicesNormal) {
    return EXECUTIVE_OPERATIONAL_NARRATIVE_RULES.find((r) => r.id === "all_stable")?.text;
  }
  if (signals.servicesNormal) {
    return EXECUTIVE_OPERATIONAL_NARRATIVE_RULES.find((r) => r.id === "services_normal")?.text;
  }
  if (signals.environmentOk) {
    return EXECUTIVE_OPERATIONAL_NARRATIVE_RULES.find((r) => r.id === "environment_consistent")?.text;
  }
  return EXECUTIVE_OPERATIONAL_NARRATIVE_RULES.find((r) => r.id === "healthy_default")?.text;
}

/**
 * @param {Record<string, unknown>|null|undefined} executiveCurrent
 * @param {Record<string, unknown>|null|undefined} temporal
 */
export function mapExecutiveOperationalToFounderDisplay(executiveCurrent, temporal) {
  const partialErrors = Array.isArray(executiveCurrent?.partial_errors)
    ? [...executiveCurrent.partial_errors]
    : [];
  const temporalErrors = Array.isArray(temporal?.partial_errors) ? [...temporal.partial_errors] : [];
  const allPartialErrors = [...partialErrors, ...temporalErrors];

  const system = executiveCurrent?.system ?? {};
  const performance = executiveCurrent?.performance ?? {};
  const platform = executiveCurrent?.platform ?? {};

  const apiDuration = performance.total_duration_ms ?? null;
  const latencyLevel = classifyOperationalLatency(apiDuration);

  const referenceTimestamp = system.last_update ?? executiveCurrent?.computed_at ?? null;
  const ageMs = computeOperationalAgeMs(referenceTimestamp);
  const freshnessLevel = classifyOperationalFreshness(ageMs);

  const groupsLoaded = countExecutiveGroupsLoaded(executiveCurrent);
  const dataAvailabilityPct = groupsLoaded / OPERATIONAL_EXPECTED_EXECUTIVE_GROUPS;
  const dataAvailabilityLevel =
    groupsLoaded >= OPERATIONAL_EXPECTED_EXECUTIVE_GROUPS
      ? "excellent"
      : groupsLoaded >= OPERATIONAL_EXPECTED_EXECUTIVE_GROUPS - 2
        ? "healthy"
        : groupsLoaded >= 4
          ? "stable"
          : groupsLoaded > 0
            ? "attention"
            : "critical";

  const snapshotIntegrityLevel = partialErrors.length === 0 ? "excellent" : partialErrors.length <= 2 ? "attention" : "critical";

  const temporalVersion = temporal?.temporal_version ?? null;
  const expectedTemporalVersion = "A.7.0";
  const temporalLevel =
    temporal == null
      ? "unknown"
      : temporalVersion === expectedTemporalVersion && temporalErrors.length === 0
        ? "excellent"
        : temporalErrors.length === 0
          ? "healthy"
          : "attention";

  const environment = system.environment ?? null;
  const environmentLevel =
    environment == null
      ? "unknown"
      : KNOWN_ENVIRONMENTS.has(String(environment).toLowerCase())
        ? "healthy"
        : "stable";

  const metricsVersion = executiveCurrent?.metrics_version ?? null;
  const analyticsVersion = system.analytics_version ?? null;
  const buildVersion = system.build_version ?? null;
  const versionsPresent = [metricsVersion, analyticsVersion, buildVersion].filter(Boolean).length;
  const versionLevel =
    versionsPresent === 3 ? "excellent" : versionsPresent === 2 ? "healthy" : versionsPresent === 1 ? "attention" : "unknown";

  const operationalStable =
    snapshotIntegrityLevel === "excellent" &&
    (latencyLevel === "excellent" || latencyLevel === "healthy" || latencyLevel === "stable") &&
    freshnessLevel !== "attention";

  const degradation =
    snapshotIntegrityLevel === "critical" ||
    latencyLevel === "attention" ||
    dataAvailabilityLevel === "critical";

  const servicesNormal =
    latencyLevel !== "attention" &&
    snapshotIntegrityLevel !== "critical" &&
    groupsLoaded >= 4;

  const narrative = resolveExecutiveOperationalNarrative({
    degradation,
    allStable: operationalStable,
    servicesNormal,
    updateStale: freshnessLevel === "attention",
    environmentOk: environmentLevel === "healthy" || environmentLevel === "stable",
  });

  const normalizedScores = [
    operationalLevelToScore(snapshotIntegrityLevel),
    operationalLevelToScore(latencyLevel),
    operationalLevelToScore(freshnessLevel),
    operationalLevelToScore(dataAvailabilityLevel),
    operationalLevelToScore(temporalLevel),
    operationalLevelToScore(environmentLevel),
    operationalLevelToScore(versionLevel),
  ].filter((v) => v != null);

  const operationalIndex = computeExecutiveOperationalIndex(normalizedScores);

  const indexLevel =
    operationalIndex == null
      ? "unknown"
      : operationalIndex >= 85
        ? "excellent"
        : operationalIndex >= 65
          ? "healthy"
          : operationalIndex >= 45
            ? "stable"
            : "attention";

  const headlineBadge = classifyOperationalBadge({
    level: degradation ? "critical" : indexLevel,
    critical: degradation,
  });

  const indicatorValues = {
    operational_stability: {
      level: operationalStable ? "excellent" : degradation ? "critical" : "stable",
      valueFormatted: operationalStable ? "Estável" : degradation ? "Degradada" : "Monitorada",
      detail: `Integridade ${snapshotIntegrityLevel} · latência ${latencyLevel} · freshness ${freshnessLevel}`,
    },
    data_availability: {
      level: dataAvailabilityLevel,
      valueFormatted: `${groupsLoaded}/${OPERATIONAL_EXPECTED_EXECUTIVE_GROUPS} grupos`,
      detail: platform.total_sessions != null ? "Platform group presente." : "Platform parcial.",
    },
    snapshot_integrity: {
      level: snapshotIntegrityLevel,
      valueFormatted: partialErrors.length === 0 ? "Íntegro" : `${partialErrors.length} aviso(s)`,
      detail: partialErrors.length ? partialErrors.map((e) => e.group || e.scope).join(", ") : "Sem partial_errors.",
    },
    update_freshness: {
      level: freshnessLevel,
      valueFormatted: formatOperationalFreshnessLabel(ageMs),
      detail: referenceTimestamp
        ? formatFounderMetricValue({ format: "datetime", value: referenceTimestamp })
        : OPERATIONAL_EMPTY_MESSAGES.update_missing,
    },
    api_response_time: {
      level: latencyLevel,
      valueFormatted: formatFounderMetricValue({ format: "duration", value: apiDuration }),
      detail: apiDuration != null ? "performance.total_duration_ms" : OPERATIONAL_EMPTY_MESSAGES.metric_unavailable,
    },
    temporal_layer_consistency: {
      level: temporalLevel,
      valueFormatted:
        temporalVersion != null
          ? `${temporalVersion}${temporalErrors.length ? ` · ${temporalErrors.length} aviso(s)` : ""}`
          : OPERATIONAL_EMPTY_MESSAGES.temporal_unavailable,
      detail: temporal ? `Esperado ${expectedTemporalVersion}` : "Fetch temporal não realizado.",
    },
    environment_consistency: {
      level: environmentLevel,
      valueFormatted: environment != null ? String(environment) : OPERATIONAL_EMPTY_MESSAGES.environment_missing,
      detail: environmentLevel === "healthy" ? "Ambiente reconhecido." : "Ambiente custom ou ausente.",
    },
    version_integrity: {
      level: versionLevel,
      valueFormatted:
        versionsPresent > 0
          ? `${versionsPresent}/3 versões`
          : OPERATIONAL_EMPTY_MESSAGES.version_missing,
      detail: [metricsVersion, analyticsVersion, buildVersion].filter(Boolean).join(" · ") || "—",
    },
    executive_operational_index: {
      level: indexLevel,
      value: operationalIndex,
      valueFormatted: operationalIndex != null ? `${operationalIndex}/100` : "—",
      detail: `${normalizedScores.length} sinais operacionais considerados.`,
    },
  };

  const indicators = FOUNDER_EXECUTIVE_OPERATIONAL_INDICATORS.map((def) => {
    const data = indicatorValues[def.id] ?? {};
    const badge = classifyOperationalBadge({
      level: data.level,
      critical: data.level === "critical",
      unavailable: data.level === "unknown" && def.id !== "executive_operational_index",
    });
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      priority: def.priority,
      kind: def.kind,
      format: def.format,
      ...data,
      badge,
    };
  }).sort((a, b) => a.priority - b.priority);

  let status = "success";
  if (!executiveCurrent) status = "error";
  else if (degradation || partialErrors.length > 0 || temporalErrors.length > 0) status = "partial";
  else if (!platform || Object.keys(platform).length === 0) status = "empty";

  return {
    meta: {
      display_version: FOUNDER_EXECUTIVE_OPERATIONAL_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_OPERATIONAL_CATALOG_VERSION,
      metrics_version: metricsVersion,
      temporal_version: temporalVersion,
      growth_display_reference: FOUNDER_GROWTH_DISPLAY_VERSION,
      groups_loaded: groupsLoaded,
      partial_errors: allPartialErrors,
      computed_at: executiveCurrent?.computed_at ?? temporal?.computed_at ?? null,
      status,
    },
    narrative: {
      headline: narrative,
      badge: headlineBadge,
    },
    operational_index: {
      value: operationalIndex,
      formatted: operationalIndex != null ? `${operationalIndex}/100` : "—",
    },
    indicators,
  };
}
