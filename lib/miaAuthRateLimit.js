/**
 * PATCH 3.3A.1 / 3.3A.2 — Distributed auth rate-limit key derivation.
 */

import crypto from "crypto";
import { getAuthRateLimitSecret, MIA_AUTH_RATE_LIMIT_SECRET_ENV } from "./miaAuthSecrets.js";
import { resolveClientIp } from "./miaPerimeterRateLimit.js";

export { MIA_AUTH_RATE_LIMIT_SECRET_ENV };
export const MIA_AUTH_RATE_LIMIT_HMAC_VERSION = "v1";
export const MIA_AUTH_REQUEST_WINDOW_SECONDS = 15 * 60;
export const MIA_AUTH_REQUEST_WINDOW_MS = MIA_AUTH_REQUEST_WINDOW_SECONDS * 1000;
export const MIA_AUTH_REQUEST_MAX_PER_EMAIL = 3;
export const MIA_AUTH_REQUEST_MAX_PER_IP = 12;

export const MIA_AUTH_RATE_LIMIT_SCOPES = {
  REQUEST_EMAIL: "request_email",
  REQUEST_ORIGIN: "request_origin",
};

export function buildAuthRateLimitHmacMessage(scope, value) {
  return `mia-auth-rate-limit:${MIA_AUTH_RATE_LIMIT_HMAC_VERSION}:${String(scope || "").trim()}:${String(value || "").trim()}`;
}

export function hashAuthRateLimitKey(scope, value, env = process.env) {
  const secret = getAuthRateLimitSecret(env);
  const normalizedScope = String(scope || "").trim();
  const normalizedValue = String(value || "").trim();
  if (!normalizedScope || !normalizedValue) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(buildAuthRateLimitHmacMessage(normalizedScope, normalizedValue))
    .digest("hex")
    .slice(0, 64);
}

export function buildAuthRequestRateLimitKeys({ emailNormalized, req } = {}, env = process.env) {
  const originValue = resolveClientIp(req) || "unknown";
  return {
    emailKeyHash: hashAuthRateLimitKey(
      MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_EMAIL,
      emailNormalized,
      env
    ),
    originKeyHash: hashAuthRateLimitKey(
      MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_ORIGIN,
      originValue,
      env
    ),
  };
}

export function parseAuthRateLimitRpcResult(result = {}) {
  if (result?.ok === false && result?.reason_code === "auth_rate_limited") {
    return {
      ok: false,
      scope: result.scope || "email",
      retryAfterSeconds: Number(result.retry_after_seconds) || 60,
    };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export function evaluateDistributedRateLimitBucket(
  store,
  { scope, keyHash, windowSeconds, maxRequests, nowMs = Date.now() } = {}
) {
  const windowStartMs =
    Math.floor(nowMs / 1000 / windowSeconds) * windowSeconds * 1000;
  const bucketKey = `${scope}:${keyHash}:${windowStartMs}`;
  const currentCount = Number(store.get(bucketKey) || 0) + 1;
  store.set(bucketKey, currentCount);

  if (currentCount > maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStartMs + windowSeconds * 1000 - nowMs) / 1000)
    );
    return { allowed: false, scope, retryAfterSeconds, count: currentCount };
  }

  return { allowed: true, retryAfterSeconds: 0, count: currentCount };
}
