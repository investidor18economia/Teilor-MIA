/**
 * PATCH 3.3A / 3.3A.2 — OTP generation and secure hashing for auth challenges.
 */

import crypto from "crypto";
import { getAuthOtpSecret, MIA_AUTH_OTP_SECRET_ENV } from "./miaAuthSecrets.js";

export { MIA_AUTH_OTP_SECRET_ENV };
export const MIA_AUTH_OTP_HMAC_VERSION = "v1";
export const MIA_AUTH_OTP_TTL_MS = 10 * 60 * 1000;
export const MIA_AUTH_OTP_LENGTH = 6;
export const MIA_AUTH_MAX_ATTEMPTS = 5;
export const MIA_AUTH_CHALLENGE_PURPOSE = "login_otp";

/** @deprecated Use MIA_AUTH_OTP_SECRET_ENV */
export const MIA_AUTH_CHALLENGE_SECRET_ENV = MIA_AUTH_OTP_SECRET_ENV;

export function buildAuthOtpHmacMessage(
  challengeId,
  code,
  purpose = MIA_AUTH_CHALLENGE_PURPOSE
) {
  const id = String(challengeId || "").trim();
  const normalizedCode = String(code || "").trim();
  const normalizedPurpose = String(purpose || MIA_AUTH_CHALLENGE_PURPOSE).trim();
  return `mia-auth-otp:${MIA_AUTH_OTP_HMAC_VERSION}:${normalizedPurpose}:${id}:${normalizedCode}`;
}

export function generateAuthOtpCode(length = MIA_AUTH_OTP_LENGTH) {
  const size = Number.isFinite(length) && length > 0 ? length : MIA_AUTH_OTP_LENGTH;
  let code = "";
  for (let index = 0; index < size; index += 1) {
    code += String(crypto.randomInt(0, 10));
  }
  return code;
}

export function hashAuthOtpCode(
  challengeId,
  code,
  env = process.env,
  purpose = MIA_AUTH_CHALLENGE_PURPOSE
) {
  const secret = getAuthOtpSecret(env);
  const message = buildAuthOtpHmacMessage(challengeId, code, purpose);
  if (!message.includes(":") || message.endsWith(":")) return "";
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
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
