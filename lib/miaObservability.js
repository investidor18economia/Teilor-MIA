/**
 * PATCH 12E — API observability wrapper and helpers.
 */

import {
  getObservabilityContext,
  getPropagationHeaders,
  initObservabilityContext,
  runWithObservabilityContext,
} from "./miaObservabilityContext.js";
import { logError, logInfo, logRequestComplete } from "./miaLogger.js";

export function applyObservabilityResponseHeaders(res, context) {
  if (!context) return;
  res.setHeader("x-request-id", context.requestId);
  res.setHeader("x-correlation-id", context.correlationId);
}

export function beginMiaObservedRequest(req, res, options = {}) {
  const context = initObservabilityContext(req, options);
  applyObservabilityResponseHeaders(res, context);
  logInfo({
    event: "request_start",
    endpoint: context.endpoint,
    operation: options.operation || "request",
    method: req.method || null,
  });
  return context;
}

export function finishMiaObservedRequest(res, context, {
  reasonCode = null,
  operation = null,
  provider = null,
  error = false,
} = {}) {
  if (!context) return;
  const durationMs = Date.now() - context.startedAtMs;
  const status = res.statusCode || 200;
  logRequestComplete({
    endpoint: context.endpoint,
    status,
    durationMs,
    reasonCode,
    operation: operation || context.operation,
    provider: provider || context.provider,
    error,
  });
}

export function logObservedError(error, fields = {}) {
  logError({
    event: "unexpected_error",
    reasonCode: fields.reasonCode || "internal_error",
    message: error?.message || String(error),
    ...fields,
  });
}

export function withMiaObservability(handler, options = {}) {
  const endpoint = options.endpoint || "unknown";

  return async function observedHandler(req, res) {
    const context = beginMiaObservedRequest(req, res, { endpoint, ...options });

    return runWithObservabilityContext(context, async () => {
      try {
        await handler(req, res);
      } catch (error) {
        logObservedError(error, {
          endpoint,
          reasonCode: options.errorReasonCode || "internal_error",
        });
        if (!res.headersSent) {
          res.status(500).json({
            error: "internal_error",
            reasonCode: "internal_error",
          });
        }
      } finally {
        finishMiaObservedRequest(res, context, {
          error: (res.statusCode || 200) >= 500,
        });
      }
    });
  };
}

export { getObservabilityContext, getPropagationHeaders };
