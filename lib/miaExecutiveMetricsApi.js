/**
 * PATCH 11.1 — Executive Metrics API collector (read-only aggregates via RPC).
 */

import { supabase, isSupabaseServiceRoleConfigured } from "./supabaseClient.js";
import { resolveBuildInfo, MIA_OBSERVABILITY_VERSION } from "./miaBuildInfo.js";
import {
  MIA_EXECUTIVE_METRICS_VERSION,
  MIA_EXECUTIVE_METRICS_DEFAULT_WINDOW_DAYS,
  MIA_EXECUTIVE_METRICS_RPC,
  MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS,
  MIA_EXECUTIVE_METRICS_CATEGORIES,
} from "./miaExecutiveMetricsCatalog.js";
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
      if (MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS.includes(lower)) {
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
async function fetchMetricGroup(client, rpcName, rpcParams) {
  const started = Date.now();
  const { data, error } = await client.rpc(rpcName, rpcParams);
  if (error && Number(rpcParams.p_offset_days) > 0 && /p_offset_days|does not exist|could not find|function.*not unique/i.test(String(error.message || error))) {
    return {
      ok: false,
      data: null,
      error: "period_offset_unavailable",
      duration_ms: Date.now() - started,
    };
  }
  return {
    ok: !error,
    data: data ?? null,
    error: error ? String(error.message || error.code || "rpc_failed").slice(0, 160) : null,
    duration_ms: Date.now() - started,
  };
}

/**
 * @param {{
 *   windowDays?: number,
 *   offsetDays?: number,
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
export async function buildExecutiveMetricsResponse(options = {}) {
  const windowDays = Math.max(
    1,
    Math.min(365, Number(options.windowDays ?? MIA_EXECUTIVE_METRICS_DEFAULT_WINDOW_DAYS) || MIA_EXECUTIVE_METRICS_DEFAULT_WINDOW_DAYS)
  );
  const offsetDays = Math.max(0, Math.min(365, Number(options.offsetDays ?? 0) || 0));
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
  const cacheKey = `executive-metrics:v${MIA_EXECUTIVE_METRICS_VERSION}:d${windowDays}:o${offsetDays}:${filterSuffix}`;

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
    if (cached) return cached;
  }

  const computedAt = new Date().toISOString();
  const buildInfo = resolveBuildInfo(options.env);
  const partialErrors = [];
  const groupTimings = {};

  const response = {
    metrics_version: MIA_EXECUTIVE_METRICS_VERSION,
    computed_at: computedAt,
    reference_period_days: windowDays,
    period_offset_days: offsetDays,
    filters_applied: {
      range: options.range ?? "30d",
      period_mode: options.periodMode ?? "rolling",
      start_date: options.startDate ?? null,
      end_date: options.endDate ?? null,
      category: options.category ?? null,
      product_id: options.productId ?? null,
      timezone: "UTC",
    },
    platform: null,
    conversation: null,
    recommendation: null,
    commerce: null,
    alerts: null,
    price_intelligence: null,
    savings: null,
    anti_regret: null,
    user_value: null,
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
    return setExecutiveMetricsCache(cacheKey, response, resolveExecutiveMetricsCacheTtlMs());
  }

  const rpcCategories = MIA_EXECUTIVE_METRICS_CATEGORIES.filter((c) => c !== "system");
  const results = await Promise.all(
    rpcCategories.map(async (category) => {
      const rpcName = MIA_EXECUTIVE_METRICS_RPC[category];
      if (!rpcName) return { category, ok: false, data: null, error: "rpc_not_defined", duration_ms: 0 };
      return { category, ...(await fetchMetricGroup(supabase, rpcName, rpcParams)) };
    })
  );

  for (const result of results) {
    groupTimings[result.category] = result.duration_ms;
    if (result.ok) {
      response[result.category] = result.data;
    } else {
      response[result.category] = null;
      partialErrors.push({ scope: result.category, error: result.error || "unknown" });
    }
  }

  response.performance = {
    total_duration_ms: Object.values(groupTimings).reduce((a, b) => a + b, 0),
    group_duration_ms: groupTimings,
    query_count: rpcCategories.length,
  };

  const privacyViolations = scanForbidden(response);
  if (privacyViolations.length > 0) {
    partialErrors.push({ scope: "privacy", error: "forbidden_keys_detected", details: privacyViolations.slice(0, 10) });
  }

  return setExecutiveMetricsCache(cacheKey, response, resolveExecutiveMetricsCacheTtlMs());
}

export { scanForbidden as scanExecutiveMetricsForbiddenKeys };
