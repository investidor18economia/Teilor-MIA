/**
 * PATCH 11.1 — In-memory TTL cache for executive metrics API responses.
 * API-layer cache only — not persisted metric snapshots.
 */

const DEFAULT_TTL_MS = Number(process.env.MIA_EXECUTIVE_METRICS_CACHE_TTL_MS || 300_000);

let cacheMap = new Map();

/**
 * @param {number} [ttlMs]
 */
export function resolveExecutiveMetricsCacheTtlMs(ttlMs) {
  const parsed = Number(ttlMs ?? process.env.MIA_EXECUTIVE_METRICS_CACHE_TTL_MS ?? DEFAULT_TTL_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL_MS;
}

/**
 * @param {string} cacheKey
 */
export function getExecutiveMetricsCache(cacheKey) {
  const cacheEntry = cacheMap.get(cacheKey);
  if (!cacheEntry) return null;
  if (Date.now() >= cacheEntry.expiresAt) {
    cacheMap.delete(cacheKey);
    return null;
  }
  return { ...cacheEntry.payload, cache: { hit: true, ttl_ms: cacheEntry.ttlMs, cached_at: cacheEntry.cachedAt } };
}

/**
 * @param {string} cacheKey
 * @param {object} payload
 * @param {number} [ttlMs]
 */
export function setExecutiveMetricsCache(cacheKey, payload, ttlMs = resolveExecutiveMetricsCacheTtlMs()) {
  if (ttlMs <= 0) return payload;
  const cachedAt = new Date().toISOString();
  cacheMap.set(cacheKey, {
    payload,
    ttlMs,
    cachedAt,
    expiresAt: Date.now() + ttlMs,
  });
  return { ...payload, cache: { hit: false, ttl_ms: ttlMs, cached_at: cachedAt } };
}

/** Test-only */
export function clearExecutiveMetricsCache() {
  cacheMap.clear();
}
