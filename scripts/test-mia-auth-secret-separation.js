/**
 * PATCH 3.3A.2 — Cryptographic secret separation tests.
 */
import crypto from "crypto";
import {
  getAuthOtpSecret,
  getAuthRateLimitSecret,
  getUserSessionSecret,
  isMiaAuthSecretError,
  MiaAuthSecretError,
  MIA_AUTH_SECRET_ERROR_CODES,
  AUTH_PUBLIC_UNAVAILABLE,
  mapAuthSecretErrorToPublicResponse,
} from "../lib/miaAuthSecrets.js";
import {
  buildAuthOtpHmacMessage,
  hashAuthOtpCode,
  verifyAuthOtpCode,
  MIA_AUTH_CHALLENGE_PURPOSE,
} from "../lib/miaAuthChallengeCrypto.js";
import {
  buildAuthRateLimitHmacMessage,
  hashAuthRateLimitKey,
  MIA_AUTH_RATE_LIMIT_SCOPES,
} from "../lib/miaAuthRateLimit.js";
import { issueUserSessionToken, verifyUserSessionToken } from "../lib/miaUserSessionToken.js";

const SESSION_SECRET = "patch-33a2-session-secret-32chars-min";
const OTP_SECRET = "patch-33a2-otp-secret-32chars-minimum-x";
const RATE_SECRET = "patch-33a2-rate-limit-secret-32chars-min";
const API_SHARED_KEY = "patch-33a2-api-shared-key-32chars-min-x";

const FULL_ENV = {
  MIA_USER_SESSION_SECRET: SESSION_SECRET,
  MIA_AUTH_OTP_SECRET: OTP_SECRET,
  MIA_AUTH_RATE_LIMIT_SECRET: RATE_SECRET,
  API_SHARED_KEY,
};

const USER_U1 = "11111111-2222-4333-8444-555555555555";

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

function assertThrowsCode(label, fn, code) {
  try {
    fn();
    failed += 1;
    console.error(`  ❌ ${label} (no throw)`);
  } catch (error) {
    assert(label, isMiaAuthSecretError(error) && error.code === code);
  }
}

console.log("\nPATCH 3.3A.2 — cryptographic secret separation tests\n");

// Presence
{
  assert("session secret resolves", getUserSessionSecret(FULL_ENV) === SESSION_SECRET);
  assert("OTP secret resolves", getAuthOtpSecret(FULL_ENV) === OTP_SECRET);
  assert("rate limit secret resolves", getAuthRateLimitSecret(FULL_ENV) === RATE_SECRET);
}

// Absence — no fallback to API_SHARED_KEY
{
  assertThrowsCode(
    "missing session secret throws",
    () => getUserSessionSecret({ API_SHARED_KEY }),
    MIA_AUTH_SECRET_ERROR_CODES.USER_SESSION
  );
  assertThrowsCode(
    "missing OTP secret throws",
    () => getAuthOtpSecret({ API_SHARED_KEY, MIA_USER_SESSION_SECRET: SESSION_SECRET }),
    MIA_AUTH_SECRET_ERROR_CODES.OTP
  );
  assertThrowsCode(
    "missing rate limit secret throws",
    () => getAuthRateLimitSecret({ API_SHARED_KEY, MIA_AUTH_OTP_SECRET: OTP_SECRET }),
    MIA_AUTH_SECRET_ERROR_CODES.RATE_LIMIT
  );
}

// Independence
{
  const challengeId = crypto.randomUUID();
  const code = "123456";
  const otpHash = hashAuthOtpCode(challengeId, code, FULL_ENV);
  const rateHash = hashAuthRateLimitKey(
    MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_EMAIL,
    "user@example.com",
    FULL_ENV
  );
  const token = issueUserSessionToken(USER_U1, FULL_ENV);

  assert("API_SHARED_KEY alone cannot issue session", (() => {
    try {
      issueUserSessionToken(USER_U1, { API_SHARED_KEY });
      return false;
    } catch (error) {
      return isMiaAuthSecretError(error);
    }
  })());

  assertThrowsCode(
    "API_SHARED_KEY alone cannot hash OTP",
    () => hashAuthOtpCode(challengeId, code, { API_SHARED_KEY }),
    MIA_AUTH_SECRET_ERROR_CODES.OTP
  );

  assertThrowsCode(
    "API_SHARED_KEY alone cannot hash rate limit key",
    () => hashAuthRateLimitKey(MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_EMAIL, "user@example.com", { API_SHARED_KEY }),
    MIA_AUTH_SECRET_ERROR_CODES.RATE_LIMIT
  );

  assert(
    "session secret does not validate OTP hash from session secret",
    !verifyAuthOtpCode(challengeId, code, otpHash, {
      MIA_USER_SESSION_SECRET: SESSION_SECRET,
      MIA_AUTH_OTP_SECRET: "wrong-otp-secret-32chars-minimum-xx",
    })
  );

  assert(
    "OTP secret change invalidates prior OTP hash",
    hashAuthOtpCode(challengeId, code, {
      ...FULL_ENV,
      MIA_AUTH_OTP_SECRET: "different-otp-secret-32chars-min-y",
    }) !== otpHash
  );

  assert(
    "rate limit secret change invalidates prior key hash",
    hashAuthRateLimitKey(MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_EMAIL, "user@example.com", {
      ...FULL_ENV,
      MIA_AUTH_RATE_LIMIT_SECRET: "different-rate-secret-32chars-min",
    }) !== rateHash
  );

  assert("session token verifies with session secret", verifyUserSessionToken(token, FULL_ENV).ok === true);

  const legacyBody = Buffer.from(
    JSON.stringify({ uid: USER_U1, iat: Date.now(), exp: Date.now() + 60000, ver: 1, purpose: "session" })
  ).toString("base64url");
  const legacySig = crypto.createHmac("sha256", API_SHARED_KEY).update(legacyBody).digest("base64url");
  const legacyToken = `${legacyBody}.${legacySig}`;
  assert(
    "legacy token signed by API_SHARED_KEY rejected",
    verifyUserSessionToken(legacyToken, FULL_ENV).ok === false
  );
}

// Context separation
{
  const challengeId = crypto.randomUUID();
  const hashA = hashAuthOtpCode(challengeId, "111111", FULL_ENV);
  const hashB = hashAuthOtpCode(crypto.randomUUID(), "111111", FULL_ENV);
  assert("OTP hash changes with challenge_id", hashA !== hashB);

  const msgDefault = buildAuthOtpHmacMessage(challengeId, "111111", MIA_AUTH_CHALLENGE_PURPOSE);
  const msgOther = buildAuthOtpHmacMessage(challengeId, "111111", "other_purpose");
  assert("OTP message includes purpose", msgDefault !== msgOther);

  const emailHash = hashAuthRateLimitKey(
    MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_EMAIL,
    "203.0.113.1",
    FULL_ENV
  );
  const originHash = hashAuthRateLimitKey(
    MIA_AUTH_RATE_LIMIT_SCOPES.REQUEST_ORIGIN,
    "203.0.113.1",
    FULL_ENV
  );
  assert("same value different scopes produce different hashes", emailHash !== originHash);

  const emailMsg = buildAuthRateLimitHmacMessage("request_email", "x");
  const originMsg = buildAuthRateLimitHmacMessage("request_origin", "x");
  assert("rate limit message encodes scope", emailMsg !== originMsg);
}

// Public error mapping
{
  const mapped = mapAuthSecretErrorToPublicResponse(
    new MiaAuthSecretError(MIA_AUTH_SECRET_ERROR_CODES.OTP)
  );
  assert("public response is generic", mapped?.body?.reasonCode === AUTH_PUBLIC_UNAVAILABLE);
  assert("public response hides env name", !JSON.stringify(mapped?.body).includes("MIA_AUTH"));
  assert("internal log keeps typed code", mapped?.logReasonCode === MIA_AUTH_SECRET_ERROR_CODES.OTP);
}

// Session issuance failure without secret
{
  assertThrowsCode(
    "issue session throws without secret",
    () => issueUserSessionToken(USER_U1, { API_SHARED_KEY }),
    MIA_AUTH_SECRET_ERROR_CODES.USER_SESSION
  );
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
