/**
 * PATCH 12E — Request/correlation context propagation.
 */

import { AsyncLocalStorage } from "async_hooks";
import crypto from "crypto";

export const miaObservabilityStorage = new AsyncLocalStorage();

function cleanHeader(value) {
  const text = String(value || "").trim();
  return text.length > 0 ? text.slice(0, 128) : "";
}

export function createRequestId(existing = "") {
  const provided = cleanHeader(existing);
  if (provided) return provided;
  return crypto.randomUUID();
}

export function createCorrelationId(existing = "", requestId = "") {
  const provided = cleanHeader(existing);
  if (provided) return provided;
  return requestId || crypto.randomUUID();
}

export function initObservabilityContext(req = {}, options = {}) {
  const requestId = createRequestId(
    req.headers?.["x-request-id"] || req.headers?.["X-Request-Id"]
  );
  const correlationId = createCorrelationId(
    req.headers?.["x-correlation-id"] || req.headers?.["X-Correlation-Id"],
    requestId
  );

  return {
    requestId,
    correlationId,
    endpoint: options.endpoint || "unknown",
    operation: options.operation || null,
    startedAtMs: Date.now(),
    provider: null,
  };
}

export function getObservabilityContext() {
  return miaObservabilityStorage.getStore() || null;
}

export function runWithObservabilityContext(context, fn) {
  return miaObservabilityStorage.run(context, fn);
}

export function setObservabilityOperation(operation = "") {
  const store = getObservabilityContext();
  if (store) store.operation = operation;
}

export function setObservabilityProvider(provider = "") {
  const store = getObservabilityContext();
  if (store) store.provider = provider;
}

export function getPropagationHeaders(context = getObservabilityContext()) {
  if (!context) return {};
  return {
    "x-request-id": context.requestId,
    "x-correlation-id": context.correlationId,
  };
}
