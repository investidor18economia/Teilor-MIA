/**
 * PATCH 12E — In-memory MVP metrics (no Redis/Prometheus).
 */

const metrics = {
  requests: 0,
  errors: 0,
  status4xx: 0,
  status5xx: 0,
  totalDurationMs: 0,
  cacheHit: 0,
  cacheMiss: 0,
  byEndpoint: Object.create(null),
};

function ensureEndpoint(endpoint = "unknown") {
  if (!metrics.byEndpoint[endpoint]) {
    metrics.byEndpoint[endpoint] = {
      requests: 0,
      errors: 0,
      status4xx: 0,
      status5xx: 0,
      totalDurationMs: 0,
    };
  }
  return metrics.byEndpoint[endpoint];
}

export function recordRequestMetric({
  endpoint = "unknown",
  status = 200,
  durationMs = 0,
  error = false,
} = {}) {
  metrics.requests += 1;
  metrics.totalDurationMs += durationMs;
  if (error) metrics.errors += 1;
  if (status >= 500) metrics.status5xx += 1;
  else if (status >= 400) metrics.status4xx += 1;

  const bucket = ensureEndpoint(endpoint);
  bucket.requests += 1;
  bucket.totalDurationMs += durationMs;
  if (error) bucket.errors += 1;
  if (status >= 500) bucket.status5xx += 1;
  else if (status >= 400) bucket.status4xx += 1;
}

export function recordCacheMetric({ hit = false } = {}) {
  if (hit) metrics.cacheHit += 1;
  else metrics.cacheMiss += 1;
}

export function getMetricsSnapshot() {
  const avgLatencyMs =
    metrics.requests > 0 ? Math.round(metrics.totalDurationMs / metrics.requests) : 0;

  return {
    requests: metrics.requests,
    errors: metrics.errors,
    status4xx: metrics.status4xx,
    status5xx: metrics.status5xx,
    avgLatencyMs,
    cacheHit: metrics.cacheHit,
    cacheMiss: metrics.cacheMiss,
    byEndpoint: { ...metrics.byEndpoint },
  };
}

export function resetMetricsForTests() {
  metrics.requests = 0;
  metrics.errors = 0;
  metrics.status4xx = 0;
  metrics.status5xx = 0;
  metrics.totalDurationMs = 0;
  metrics.cacheHit = 0;
  metrics.cacheMiss = 0;
  metrics.byEndpoint = Object.create(null);
}
