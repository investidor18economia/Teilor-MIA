/**
 * PATCH A.3 — Temporal Series API collector (read-only aggregates via RPC).
 */

import { supabase, isSupabaseServiceRoleConfigured } from "./supabaseClient.js";
import { resolveBuildInfo, MIA_OBSERVABILITY_VERSION } from "./miaBuildInfo.js";
import {
  MIA_TEMPORAL_SERIES_VERSION,
  MIA_TEMPORAL_SERIES_DEFAULT_WINDOW_DAYS,
  MIA_TEMPORAL_SERIES_RPC,
  MIA_TEMPORAL_SERIES_FORBIDDEN_KEYS,
  MIA_TEMPORAL_SERIES_GROUPS,
  normalizeTemporalGranularity,
  normalizeTemporalWindowDays,
  normalizeTemporalOffsetDays,
  parseTemporalSeriesGroups,
  projectTemporalSeriesByGranularity,
} from "./miaTemporalSeriesCatalog.js";
import {
  getExecutiveMetricsCache,
  setExecutiveMetricsCache,
  resolveExecutiveMetricsCacheTtlMs,
} from "./miaExecutiveMetricsCache.js";
import {
  buildAnalyticsFilterCacheSuffix,
  buildAnalyticsFilterRpcParams,
} from "./miaAnalyticsFilterParams.js";

/**
 * @param {unknown} value
 * @param {string} path
 * @param {string[]} hits
 */
function scanForbidden(value, path = "", hits = []) {
  if (value == null) return hits;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      scanForbidden(value[i], `${path}[${i}]`, hits);
    }
    return hits;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (MIA_TEMPORAL_SERIES_FORBIDDEN_KEYS.includes(lower)) {
        hits.push(`${path}.${key}`.replace(/^\./, ""));
      }
      if (/@|https:\/\//.test(String(child ?? ""))) {
        hits.push(`${path}.${key}:suspect_value`.replace(/^\./, ""));
      }
      scanForbidden(child, `${path}.${key}`, hits);
    }
    return hits;
  }
  return hits;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} rpcName
 * @param {Record<string, unknown>} rpcParams
 */
async function fetchTemporalSeriesGroup(client, rpcName, rpcParams) {
  const started = Date.now();
  const { data, error } = await client.rpc(rpcName, rpcParams);
  return {
    ok: !error,
    data: data ?? null,
    error: error ? String(error.message || error.code || "rpc_failed").slice(0, 160) : null,
    duration_ms: Date.now() - started,
  };
}

/**
 * @param {Record<string, unknown>|null} groupData
 * @param {"day"|"week"|"month"} granularity
 * @param {string} group
 */
function shapeTemporalGroupResponse(groupData, granularity, group) {
  if (!groupData || typeof groupData !== "object") return null;
  if (group === "products" || group === "categories" || group === "conversion") {
    return { ...groupData, granularity };
  }
  const series = Array.isArray(groupData.series) ? groupData.series : [];
  return {
    ...groupData,
    granularity,
    series: projectTemporalSeriesByGranularity(series, granularity, group),
  };
}

/**
 * @param {{
 *   windowDays?: number,
 *   offsetDays?: number,
 *   granularity?: string,
 *   seriesGroups?: string[],
 *   startDate?: string|null,
 *   endDate?: string|null,
 *   category?: string|null,
 *   productId?: string|null,
 *   periodMode?: string,
 *   range?: string,
 *   bypassCache?: boolean,
 *   env?: Record<string, string|undefined>,
 * }} [options]
 */
export async function buildTemporalSeriesResponse(options = {}) {
  const windowDays = normalizeTemporalWindowDays(
    options.windowDays ?? MIA_TEMPORAL_SERIES_DEFAULT_WINDOW_DAYS
  );
  const offsetDays = normalizeTemporalOffsetDays(options.offsetDays ?? 0);
  const granularity = normalizeTemporalGranularity(options.granularity ?? "day");
  if (!granularity) {
    return {
      ok: false,
      error: "invalid_granularity",
      temporal_version: MIA_TEMPORAL_SERIES_VERSION,
    };
  }

  const requestedGroups = options.seriesGroups?.length
    ? options.seriesGroups.filter((group) => MIA_TEMPORAL_SERIES_GROUPS.includes(group))
    : [...MIA_TEMPORAL_SERIES_GROUPS];

  if (!requestedGroups.length) {
    return {
      ok: false,
      error: "invalid_series_groups",
      temporal_version: MIA_TEMPORAL_SERIES_VERSION,
    };
  }

  const filterSuffix = buildAnalyticsFilterCacheSuffix({
    range: options.range ?? "30d",
    start_date: options.startDate ?? null,
    end_date: options.endDate ?? null,
    window_days: windowDays,
    period_mode: options.periodMode ?? "rolling",
    category: options.category ?? null,
    product_id: options.productId ?? null,
    offset_days: offsetDays,
  });
  const cacheKey = `temporal-metrics:v${MIA_TEMPORAL_SERIES_VERSION}:d${windowDays}:o${offsetDays}:g${granularity}:s${requestedGroups.join(",")}:${filterSuffix}`;

  const rpcParams = buildAnalyticsFilterRpcParams({
    window_days: windowDays,
    offset_days: offsetDays,
    start_date: options.startDate ?? null,
    end_date: options.endDate ?? null,
    period_mode: options.periodMode ?? "rolling",
    category: options.category ?? null,
    product_id: options.productId ?? null,
    range: options.range ?? "30d",
  });

  if (!options.bypassCache) {
    const cached = getExecutiveMetricsCache(cacheKey);
    if (cached) return { ok: true, ...cached };
  }

  const computedAt = new Date().toISOString();
  const buildInfo = resolveBuildInfo(options.env);
  const partialErrors = [];
  const groupTimings = {};

  /** @type {Record<string, unknown>} */
  const response = {
    temporal_version: MIA_TEMPORAL_SERIES_VERSION,
    computed_at: computedAt,
    reference_period_days: windowDays,
    period_offset_days: offsetDays,
    granularity,
    series_groups: requestedGroups,
    filters_applied: {
      range: options.range ?? "30d",
      period_mode: options.periodMode ?? "rolling",
      start_date: options.startDate ?? null,
      end_date: options.endDate ?? null,
      category: options.category ?? null,
      product_id: options.productId ?? null,
      timezone: "UTC",
    },
    growth: null,
    platform_activity: null,
    products: null,
    categories: null,
    conversion: null,
    system: {
      analytics_version: MIA_OBSERVABILITY_VERSION,
      build_version: buildInfo.commit || buildInfo.buildId || null,
      environment: buildInfo.environment || null,
      last_update: computedAt,
    },
    partial_errors: partialErrors,
  };

  if (!isSupabaseServiceRoleConfigured()) {
    partialErrors.push({ scope: "supabase", error: "service_role_not_configured" });
    return {
      ok: true,
      ...setExecutiveMetricsCache(cacheKey, response, resolveExecutiveMetricsCacheTtlMs()),
    };
  }

  const results = await Promise.all(
    requestedGroups.map(async (group) => {
      const rpcName = MIA_TEMPORAL_SERIES_RPC[group];
      if (!rpcName) return { group, ok: false, data: null, error: "rpc_not_defined", duration_ms: 0 };
      return { group, ...(await fetchTemporalSeriesGroup(supabase, rpcName, rpcParams)) };
    })
  );

  for (const result of results) {
    groupTimings[result.group] = result.duration_ms;
    if (result.ok) {
      response[result.group] = shapeTemporalGroupResponse(result.data, granularity, result.group);
    } else {
      response[result.group] = null;
      partialErrors.push({ scope: result.group, error: result.error || "unknown" });
    }
  }

  response.performance = {
    total_duration_ms: Object.values(groupTimings).reduce((a, b) => a + b, 0),
    group_duration_ms: groupTimings,
    query_count: requestedGroups.length,
  };

  const privacyViolations = scanForbidden(response);
  if (privacyViolations.length > 0) {
    partialErrors.push({
      scope: "privacy",
      error: "forbidden_keys_detected",
      details: privacyViolations.slice(0, 10),
    });
  }

  const payload = setExecutiveMetricsCache(cacheKey, response, resolveExecutiveMetricsCacheTtlMs());
  return { ok: true, ...payload };
}

export { scanForbidden as scanTemporalSeriesForbiddenKeys };
