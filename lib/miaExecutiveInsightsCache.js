/**
 * PATCH 11.4 — In-memory TTL cache for executive insights responses.
 */

const DEFAULT_TTL_MS = Number(process.env.MIA_EXECUTIVE_INSIGHTS_CACHE_TTL_MS || 300_000);

/** @type {Map<string, { payload: object, expiresAt: number, ttlMs: number, cachedAt: string }>} */
const cacheMap = new Map();

export function resolveExecutiveInsightsCacheTtlMs(ttlMs) {
  const parsed = Number(ttlMs ?? process.env.MIA_EXECUTIVE_INSIGHTS_CACHE_TTL_MS ?? DEFAULT_TTL_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TTL_MS;
}

/**
 * @param {string} cacheKey
 */
export function getExecutiveInsightsCache(cacheKey) {
  const entry = cacheMap.get(cacheKey);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cacheMap.delete(cacheKey);
    return null;
  }
  return {
    ...entry.payload,
    cache: { hit: true, ttl_ms: entry.ttlMs, cached_at: entry.cachedAt },
  };
}

/**
 * @param {string} cacheKey
 * @param {object} payload
 * @param {number} [ttlMs]
 */
export function setExecutiveInsightsCache(cacheKey, payload, ttlMs = resolveExecutiveInsightsCacheTtlMs()) {
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
export function clearExecutiveInsightsCache() {
  cacheMap.clear();
}
