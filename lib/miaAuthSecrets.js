/**
 * PATCH 3.3A.2 — Strict cryptographic secret resolution (no cross-domain fallback).
 */

export const MIA_USER_SESSION_SECRET_ENV = "MIA_USER_SESSION_SECRET";
export const MIA_AUTH_OTP_SECRET_ENV = "MIA_AUTH_OTP_SECRET";
export const MIA_AUTH_RATE_LIMIT_SECRET_ENV = "MIA_AUTH_RATE_LIMIT_SECRET";

export const MIA_AUTH_SECRET_ERROR_CODES = {
  USER_SESSION: "mia_user_session_secret_missing",
  OTP: "mia_auth_otp_secret_missing",
  RATE_LIMIT: "mia_auth_rate_limit_secret_missing",
};

export const AUTH_PUBLIC_UNAVAILABLE = "auth_temporarily_unavailable";

export const MIA_AUTH_SECRET_MIN_LENGTH = 32;

export class MiaAuthSecretError extends Error {
  constructor(code) {
    super(code);
    this.name = "MiaAuthSecretError";
    this.code = code;
  }
}

export function isMiaAuthSecretError(error) {
  return error instanceof MiaAuthSecretError;
}

function readStrictSecret(env, envKey, errorCode) {
  const value = String(env?.[envKey] ?? "").trim();
  if (!value || value.length < MIA_AUTH_SECRET_MIN_LENGTH) {
    throw new MiaAuthSecretError(errorCode);
  }
  return value;
}

export function getUserSessionSecret(env = process.env) {
  return readStrictSecret(
    env,
    MIA_USER_SESSION_SECRET_ENV,
    MIA_AUTH_SECRET_ERROR_CODES.USER_SESSION
  );
}

export function getAuthOtpSecret(env = process.env) {
  return readStrictSecret(env, MIA_AUTH_OTP_SECRET_ENV, MIA_AUTH_SECRET_ERROR_CODES.OTP);
}

export function getAuthRateLimitSecret(env = process.env) {
  return readStrictSecret(
    env,
    MIA_AUTH_RATE_LIMIT_SECRET_ENV,
    MIA_AUTH_SECRET_ERROR_CODES.RATE_LIMIT
  );
}

export function mapAuthSecretErrorToPublicResponse(error) {
  if (!isMiaAuthSecretError(error)) return null;
  return {
    status: 503,
    body: {
      success: false,
      error: AUTH_PUBLIC_UNAVAILABLE,
      reasonCode: AUTH_PUBLIC_UNAVAILABLE,
    },
    logReasonCode: error.code,
  };
}
