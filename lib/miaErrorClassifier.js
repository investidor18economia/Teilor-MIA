/**
 * PATCH 7.2 — Error Analytics classification (pure logic).
 */

import {
  MIA_ERROR_LAYERS,
  MIA_ERROR_SEVERITIES,
  MIA_ERROR_TYPES,
  MIA_RECOVERY_METHODS,
  resolveReasonCodeMapping,
} from "./miaErrorReasonCodeCatalog.js";
import { MIA_RESPONSE_OUTCOMES } from "./miaResponseOutcomeClassifier.js";

const ERROR_RESPONSE_PATHS = new Set([
  "image_identification_failed",
  "image_search_error",
  "commercial_provider_unavailable",
  "unknown_response_path_fail_closed",
]);

/**
 * @param {{
 *   reasonCode?: string|null,
 *   responsePath?: string|null,
 *   httpStatus?: number,
 *   provider?: string|null,
 *   recovered?: boolean,
 *   recoveryMethod?: string|null,
 *   fallbackUsed?: boolean,
 *   responseDelivered?: boolean,
 *   responseOutcome?: string|null,
 *   error_type?: string|null,
 *   error_layer?: string|null,
 *   severity?: string|null,
 * }} ctx
 */
export function classifyErrorEvent(ctx = {}) {
  const httpStatus = Number(ctx.httpStatus) || 200;
  const responsePath = String(ctx.responsePath || "").trim().toLowerCase();
  const reasonCode =
    ctx.reasonCode ||
    (ERROR_RESPONSE_PATHS.has(responsePath) ? responsePath : null) ||
    (httpStatus >= 500 ? "chat_internal_error" : null) ||
    (httpStatus === 401 ? "internal_api_auth_invalid" : null) ||
    (httpStatus === 405 ? "internal_api_method_not_allowed" : null) ||
    null;

  const mapped = resolveReasonCodeMapping(reasonCode, {
    error_type: ctx.error_type || undefined,
    error_layer: ctx.error_layer || undefined,
    severity: ctx.severity || undefined,
  });

  const responseDelivered =
    ctx.responseDelivered != null
      ? !!ctx.responseDelivered
      : httpStatus >= 200 && httpStatus < 500;

  const fallbackUsed = !!ctx.fallbackUsed;
  const recovered =
    ctx.recovered != null
      ? !!ctx.recovered
      : mapped.default_recoverable ||
        (responseDelivered &&
          httpStatus < 500 &&
          ctx.responseOutcome !== MIA_RESPONSE_OUTCOMES.ERROR);

  let recoveryMethod = ctx.recoveryMethod || MIA_RECOVERY_METHODS.NONE;
  if (recovered && recoveryMethod === MIA_RECOVERY_METHODS.NONE) {
    if (fallbackUsed) recoveryMethod = MIA_RECOVERY_METHODS.FALLBACK;
    else if (responseDelivered && httpStatus === 200) {
      recoveryMethod = MIA_RECOVERY_METHODS.GRACEFUL_DEGRADATION;
    }
  }

  let severity = mapped.severity;
  if (!recovered && httpStatus >= 500) {
    severity = MIA_ERROR_SEVERITIES.CRITICAL;
  } else if (recovered && severity === MIA_ERROR_SEVERITIES.ERROR) {
    severity = MIA_ERROR_SEVERITIES.WARNING;
  }

  return {
    reason_code: mapped.reason_code,
    error_type: mapped.error_type,
    error_layer: mapped.error_layer,
    severity,
    recovered,
    recovery_method: recoveryMethod,
    fallback_used: fallbackUsed,
    response_delivered: responseDelivered,
    http_status: httpStatus,
    provider: ctx.provider ?? null,
    user_facing: mapped.user_facing === true,
  };
}

/**
 * Extract observational error signals from runtime enforcement accounting.
 *
 * @param {object} enforcementCtx
 * @param {{
 *   responseDelivered?: boolean,
 *   httpStatus?: number,
 *   responseOutcome?: string|null,
 *   fallbackUsed?: boolean,
 *   responsePath?: string|null,
 * }} ctx
 * @returns {Array<Record<string, unknown>>}
 */
export function extractRuntimeErrorSignals(enforcementCtx = {}, ctx = {}) {
  const signals = [];
  const pa = enforcementCtx?.providerAccounting || {};
  const responseDelivered = ctx.responseDelivered !== false;
  const httpStatus = Number(ctx.httpStatus) || 200;
  const fallbackUsed =
    !!ctx.fallbackUsed || ctx.responseOutcome === MIA_RESPONSE_OUTCOMES.FALLBACK;

  for (const providerRow of pa.providers || []) {
    const blocked = !!providerRow.blockedReason;
    const failed = !!providerRow.failed;
    if (!blocked && !failed) continue;

    const reasonCode =
      providerRow.costGuardReason ||
      providerRow.blockedReason ||
      (failed ? "provider_error" : null);

    signals.push({
      reasonCode,
      provider: providerRow.providerId || null,
      error_layer: MIA_ERROR_LAYERS.PROVIDER,
      recovered: responseDelivered && httpStatus === 200,
      recoveryMethod:
        fallbackUsed && responseDelivered
          ? MIA_RECOVERY_METHODS.FALLBACK
          : responseDelivered
            ? MIA_RECOVERY_METHODS.GRACEFUL_DEGRADATION
            : MIA_RECOVERY_METHODS.NONE,
      fallbackUsed,
      responseDelivered,
      httpStatus,
      responseOutcome: ctx.responseOutcome ?? null,
    });
  }

  for (const decision of pa.costGuardDecisions || []) {
    if (!decision.costGuardApplied || decision.costGuardAllowed) continue;
    signals.push({
      reasonCode: decision.costGuardReason || "budget_exhausted",
      provider: decision.providerId || null,
      error_layer: MIA_ERROR_LAYERS.PROVIDER,
      recovered: responseDelivered && httpStatus === 200,
      recoveryMethod: responseDelivered ? MIA_RECOVERY_METHODS.GRACEFUL_DEGRADATION : MIA_RECOVERY_METHODS.NONE,
      fallbackUsed,
      responseDelivered,
      httpStatus,
      responseOutcome: ctx.responseOutcome ?? null,
    });
  }

  if (enforcementCtx.unknownPathFailClosed) {
    signals.push({
      reasonCode: "unknown_response_path",
      error_layer: MIA_ERROR_LAYERS.CONTRACTS,
      recovered: responseDelivered,
      recoveryMethod: MIA_RECOVERY_METHODS.GRACEFUL_DEGRADATION,
      fallbackUsed,
      responseDelivered,
      httpStatus,
      responsePath: ctx.responsePath ?? enforcementCtx.normalizedResponsePath ?? null,
      responseOutcome: ctx.responseOutcome ?? null,
    });
  }

  if ((enforcementCtx.invariantFatalCount || 0) > 0) {
    signals.push({
      reasonCode: "contract_violation_fatal",
      error_type: MIA_ERROR_TYPES.CONTRACT_ERROR,
      error_layer: MIA_ERROR_LAYERS.CONTRACTS,
      severity: MIA_ERROR_SEVERITIES.CRITICAL,
      recovered: responseDelivered,
      recoveryMethod: responseDelivered ? MIA_RECOVERY_METHODS.GRACEFUL_DEGRADATION : MIA_RECOVERY_METHODS.NONE,
      fallbackUsed,
      responseDelivered,
      httpStatus,
      responseOutcome: ctx.responseOutcome ?? null,
    });
  }

  return signals;
}

/**
 * @param {string} requestId
 * @param {string} errorLayer
 * @param {string} reasonCode
 */
export function buildErrorDedupKey(requestId = "", errorLayer = "", reasonCode = "") {
  return `${String(requestId || "unknown")}|${String(errorLayer || "UNKNOWN")}|${String(reasonCode || "unknown").toLowerCase()}`;
}
