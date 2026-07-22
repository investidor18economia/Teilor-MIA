/**
 * PATCH 3.3A — In-memory rate limiting for auth challenge endpoints.
 */

import crypto from "crypto";
import { resolveClientIp } from "./miaPerimeterRateLimit.js";

const DEFAULT_STORE = new Map();

export const MIA_AUTH_REQUEST_WINDOW_MS = 15 * 60 * 1000;
export const MIA_AUTH_REQUEST_MAX_PER_EMAIL = 3;
export const MIA_AUTH_REQUEST_MAX_PER_IP = 12;

function hashRateLimitKey(prefix, value, salt = "mia-auth-rate-v1") {
  return crypto
    .createHash("sha256")
    .update(`${salt}:${prefix}:${String(value || "").trim()}`)
    .digest("hex")
    .slice(0, 32);
}

function evaluateBucket(store, key, windowMs, maxRequests, now = Date.now()) {
  let entry = store.get(key);
  if (!entry || now - entry.windowStartedAt >= windowMs) {
    entry = { windowStartedAt: now, count: 0 };
  }

  if (entry.count >= maxRequests) {
    store.set(key, entry);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - entry.windowStartedAt)) / 1000)),
    };
  }

  entry.count += 1;
  store.set(key, entry);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function checkAuthRequestRateLimit(
  { emailNormalized, req } = {},
  {
    windowMs = MIA_AUTH_REQUEST_WINDOW_MS,
    maxPerEmail = MIA_AUTH_REQUEST_MAX_PER_EMAIL,
    maxPerIp = MIA_AUTH_REQUEST_MAX_PER_IP,
    now = Date.now(),
  } = {},
  store = DEFAULT_STORE
) {
  const emailKey = hashRateLimitKey("email", emailNormalized);
  const ipKey = hashRateLimitKey("ip", resolveClientIp(req));

  const emailResult = evaluateBucket(store, emailKey, windowMs, maxPerEmail, now);
  if (!emailResult.allowed) return { ok: false, scope: "email", ...emailResult };

  const ipResult = evaluateBucket(store, ipKey, windowMs, maxPerIp, now);
  if (!ipResult.allowed) return { ok: false, scope: "ip", ...ipResult };

  return { ok: true, retryAfterSeconds: 0 };
}

export function resetAuthRateLimitStore(store = DEFAULT_STORE) {
  store.clear();
}
