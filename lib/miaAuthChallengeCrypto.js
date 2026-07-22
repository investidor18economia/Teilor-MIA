/**
 * PATCH 3.3A — OTP generation and secure hashing for auth challenges.
 */

import crypto from "crypto";

export const MIA_AUTH_CHALLENGE_SECRET_ENV = "MIA_AUTH_CHALLENGE_SECRET";
export const MIA_AUTH_OTP_TTL_MS = 10 * 60 * 1000;
export const MIA_AUTH_OTP_LENGTH = 6;
export const MIA_AUTH_MAX_ATTEMPTS = 5;
export const MIA_AUTH_CHALLENGE_PURPOSE = "login_otp";

export function resolveAuthChallengeSecret(env = process.env) {
  return String(
    env[MIA_AUTH_CHALLENGE_SECRET_ENV] ||
      env.MIA_USER_SESSION_SECRET ||
      env.API_SHARED_KEY ||
      ""
  ).trim();
}

export function generateAuthOtpCode(length = MIA_AUTH_OTP_LENGTH) {
  const size = Number.isFinite(length) && length > 0 ? length : MIA_AUTH_OTP_LENGTH;
  let code = "";
  for (let index = 0; index < size; index += 1) {
    code += String(crypto.randomInt(0, 10));
  }
  return code;
}

export function hashAuthOtpCode(challengeId, code, env = process.env) {
  const secret = resolveAuthChallengeSecret(env);
  const id = String(challengeId || "").trim();
  const normalizedCode = String(code || "").trim();
  if (!secret || !id || !normalizedCode) return "";
  return crypto.createHmac("sha256", secret).update(`${id}:${normalizedCode}`).digest("hex");
}

export function verifyAuthOtpCode(challengeId, code, expectedHash, env = process.env) {
  const computed = hashAuthOtpCode(challengeId, code, env);
  const expected = String(expectedHash || "").trim();
  if (!computed || !expected) return false;

  const computedBuffer = Buffer.from(computed);
  const expectedBuffer = Buffer.from(expected);
  if (computedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(computedBuffer, expectedBuffer);
}

export function buildAuthChallengeExpiry(now = Date.now()) {
  return new Date(now + MIA_AUTH_OTP_TTL_MS).toISOString();
}

export function isAuthChallengeExpired(expiresAt, now = Date.now()) {
  const expiresMs = Date.parse(String(expiresAt || ""));
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs <= now;
}
