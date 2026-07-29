/**
 * PATCH B.2 — Founder Executive display mapping (B.2.0 — formatting and composition only).
 * Sources: GET /api/executive-metrics + GET /api/temporal-metrics (official contracts).
 */

import {
  FOUNDER_EXECUTIVE_KPI_CATALOG,
  FOUNDER_EXECUTIVE_CATALOG_VERSION,
  classifyExecutiveBadge,
} from "./miaFounderExecutiveCatalog.js";
import {
  classifyTrendDirection,
  formatTrendDirectionLabel,
  formatTrendPercent,
  FOUNDER_GROWTH_TREND_THRESHOLD,
} from "./miaFounderGrowthDisplay.js";
import { formatFounderMetricValue } from "./miaFounderCockpitDisplay.js";

export const FOUNDER_EXECUTIVE_DISPLAY_VERSION = "B.2.0";

export { FOUNDER_EXECUTIVE_CATALOG_VERSION, FOUNDER_GROWTH_TREND_THRESHOLD };

/**
 * @param {Record<string, unknown>|null|undefined} executive
 * @param {string[]} path
 */
function readExecutivePath(executive, path) {
  let cur = executive;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return null;
    cur = /** @type {Record<string, unknown>} */ (cur)[key];
  }
  return cur ?? null;
}

/**
 * @param {Record<string, unknown>|null|undefined} temporal
 * @param {string} group
 * @param {string} field
 * @param {string} [scope]
 */
function readTemporalField(temporal, group, field, scope) {
  const groupData = temporal?.[group];
  if (groupData == null || typeof groupData !== "object") return null;
  if (scope === "summary") {
    const summary = /** @type {Record<string, unknown>} */ (groupData).summary;
    if (summary && typeof summary === "object") {
      return /** @type {Record<string, unknown>} */ (summary)[field] ?? null;
    }
    return null;
  }
  const series = /** @type {Record<string, unknown>} */ (groupData).series;
  if (!Array.isArray(series) || !series.length) return null;
  const latest = series[0];
  if (!latest || typeof latest !== "object") return null;
  return /** @type {Record<string, unknown>} */ (latest)[field] ?? null;
}

/**
 * @param {typeof FOUNDER_EXECUTIVE_KPI_CATALOG[number]} def
 * @param {Record<string, unknown>|null|undefined} executive
 * @param {Record<string, unknown>|null|undefined} temporal
 */
function resolveKpiValue(def, executive, temporal) {
  const src = def.source;
  if (src.type === "executive" && src.path) {
    return readExecutivePath(executive, src.path);
  }
  if (src.type === "temporal" && src.group && src.field) {
    const value = readTemporalField(temporal, src.group, src.field, src.scope);
    if (value != null) return value;
  }
  if (def.fallback?.type === "executive" && def.fallback.path) {
    return readExecutivePath(executive, def.fallback.path);
  }
  return null;
}

/**
 * @param {typeof FOUNDER_EXECUTIVE_KPI_CATALOG[number]} def
 * @param {Record<string, unknown>|null|undefined} temporal
 */
function resolveKpiTrendPct(def, temporal) {
  if (!def.trend || def.trend.type !== "temporal") return null;
  if (!def.trend.group || !def.trend.field) return null;
  return readTemporalField(temporal, def.trend.group, def.trend.field, def.trend.scope);
}

/**
 * @param {Record<string, unknown>|null|undefined} executive
 * @param {Record<string, unknown>|null|undefined} temporal
 */
export function mapExecutiveMetricsToFounderExecutiveKpis(executive, temporal) {
  const growthSeries = Array.isArray(temporal?.growth?.series) ? temporal.growth.series : [];
  const partialErrors = [
    ...(Array.isArray(executive?.partial_errors) ? executive.partial_errors : []),
    ...(Array.isArray(temporal?.partial_errors) ? temporal.partial_errors : []),
  ];

  const kpis = FOUNDER_EXECUTIVE_KPI_CATALOG.map((def) => {
    const rawValue = resolveKpiValue(def, executive, temporal);
    const trendPct = resolveKpiTrendPct(def, temporal);
    const direction = def.trend ? classifyTrendDirection(trendPct) : null;

    const metric = {
      id: def.id,
      label: def.label,
      value: def.format === "trend" ? trendPct : rawValue,
      format: def.format === "trend" ? "rate" : def.format,
      category: def.category,
      group: def.group,
      hint: def.hint ?? null,
      futureContract: def.futureContract ?? null,
    };

    const badge = classifyExecutiveBadge({
      trendPct: def.trend ? trendPct : null,
      rateValue: def.format === "rate" && !def.trend ? rawValue : null,
      kpiId: def.id,
    });

    const trend =
      def.trend && trendPct != null
        ? {
            pct: trendPct,
            pctFormatted: formatTrendPercent(trendPct),
            direction,
            directionLabel: formatTrendDirectionLabel(direction),
          }
        : null;

    return {
      ...metric,
      displayValue:
        def.format === "trend"
          ? formatTrendPercent(trendPct)
          : formatFounderMetricValue(metric),
      badge,
      trend,
      highlight: def.id === "overall_trend",
    };
  });

  const groups = Object.freeze([
    {
      id: "grp-platform",
      title: "Plataforma",
      kpiIds: ["active_users", "user_growth", "session_growth", "question_growth", "overall_trend"],
    },
    {
      id: "grp-commercial",
      title: "Comercial",
      kpiIds: ["recommendations_issued", "ctr", "conversion", "active_products", "active_categories"],
    },
  ]);

  let status = "success";
  if (!executive) status = "error";
  else if (!temporal) status = "partial";
  else if (partialErrors.length) status = "partial";
  else if (!growthSeries.length) status = "empty";

  return {
    meta: {
      display_version: FOUNDER_EXECUTIVE_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_CATALOG_VERSION,
      metrics_version: executive?.metrics_version ?? null,
      temporal_version: temporal?.temporal_version ?? null,
      computed_at: temporal?.computed_at ?? executive?.computed_at ?? null,
      reference_period_days: executive?.reference_period_days ?? temporal?.window_days ?? null,
      partial_errors: partialErrors,
      status,
      kpi_count: kpis.length,
    },
    groups,
    kpis,
  };
}
