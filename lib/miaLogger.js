/**
 * PATCH 12E — Structured observability logger.
 */

import { redactLogFields } from "./miaLogRedaction.js";
import { getObservabilityContext } from "./miaObservabilityContext.js";
import { recordRequestMetric, recordCacheMetric } from "./miaMetrics.js";

function writeLog(level, fields = {}) {
  const ctx = getObservabilityContext();
  const entry = redactLogFields({
    timestamp: new Date().toISOString(),
    level,
    requestId: fields.requestId || ctx?.requestId || null,
    correlationId: fields.correlationId || ctx?.correlationId || null,
    endpoint: fields.endpoint || ctx?.endpoint || null,
    operation: fields.operation || ctx?.operation || null,
    provider: fields.provider || ctx?.provider || null,
    reasonCode: fields.reasonCode || null,
    durationMs: fields.durationMs ?? null,
    status: fields.status ?? null,
    ...fields,
  });

  const line = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return entry;
  }
  process.stdout.write(`${line}\n`);
  return entry;
}

export function logInfo(fields = {}) {
  return writeLog("info", fields);
}

export function logWarn(fields = {}) {
  return writeLog("warn", fields);
}

export function logError(fields = {}) {
  return writeLog("error", { ...fields, error: true });
}

export function logAudit(fields = {}) {
  return writeLog("audit", fields);
}

export function logMetric(fields = {}) {
  const entry = writeLog("metric", fields);
  if (fields.cacheHit === true || fields.cacheMiss === true) {
    recordCacheMetric({ hit: fields.cacheHit === true });
  }
  return entry;
}

export function logRequestComplete({
  endpoint,
  status,
  durationMs,
  reasonCode = null,
  operation = null,
  provider = null,
  error = false,
} = {}) {
  recordRequestMetric({ endpoint, status, durationMs, error });
  return logInfo({
    endpoint,
    status,
    durationMs,
    reasonCode,
    operation,
    provider,
    event: "request_complete",
  });
}

export function logProviderEvent({
  provider,
  outcome,
  durationMs = null,
  reasonCode = null,
  cacheHit = null,
} = {}) {
  if (cacheHit === true || cacheHit === false) {
    recordCacheMetric({ hit: cacheHit === true });
  }
  return logMetric({
    event: "provider_event",
    provider,
    outcome,
    durationMs,
    reasonCode,
    cacheHit: cacheHit === true,
    cacheMiss: cacheHit === false,
  });
}
