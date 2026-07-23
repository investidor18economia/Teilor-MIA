/**
 * PATCH 11.3 — Founder cockpit access control (gate cookie + allowlist).
 */

import crypto from "crypto";
import { getUserSessionSecret } from "./miaAuthSecrets.js";
import { validateMiaAdminApiKey } from "./miaPriceAlertDryRun.js";
import {
  extractUserSessionToken,
  verifyUserSessionToken,
} from "./miaUserSessionToken.js";
import { findUserByEmail } from "./miaAuthUser.js";
import { supabase, isSupabaseServiceRoleConfigured } from "./supabaseClient.js";

export const MIA_FOUNDER_ALLOWED_EMAILS_ENV = "MIA_FOUNDER_ALLOWED_EMAILS";
export const MIA_FOUNDER_GATE_COOKIE = "mia_founder_gate";
export const MIA_FOUNDER_GATE_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * @param {Record<string, string|undefined>} [env]
 */
export function resolveFounderAllowedEmails(env = process.env) {
  return String(env[MIA_FOUNDER_ALLOWED_EMAILS_ENV] || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {string} email
 * @param {Record<string, string|undefined>} [env]
 */
export function isFounderEmail(email, env = process.env) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  const allowed = resolveFounderAllowedEmails(env);
  return allowed.length > 0 && allowed.includes(normalized);
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signBody(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

/**
 * @param {{ subject: string, method: "admin" | "session" }} input
 * @param {Record<string, string|undefined>} [env]
 * @param {number} [now]
 */
export function issueFounderGateToken(input, env = process.env, now = Date.now()) {
  const secret = getUserSessionSecret(env);
  const subject = String(input?.subject || "").trim();
  if (!subject) return null;

  const payload = {
    sub: subject,
    method: input.method === "session" ? "session" : "admin",
    iat: now,
    exp: now + MIA_FOUNDER_GATE_TTL_MS,
    ver: 1,
    purpose: "founder_gate",
  };
  const body = encodePayload(payload);
  return `${body}.${signBody(body, secret)}`;
}

/**
 * @param {string} token
 * @param {Record<string, string|undefined>} [env]
 * @param {number} [now]
 */
export function verifyFounderGateToken(token, env = process.env, now = Date.now()) {
  try {
    getUserSessionSecret(env);
  } catch {
    return { ok: false, reason: "secret_not_configured" };
  }

  const raw = String(token || "").trim();
  if (!raw) return { ok: false, reason: "missing_token" };

  const parts = raw.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid_token" };

  const [body, signature] = parts;
  const secret = getUserSessionSecret(env);
  const expected = signBody(body, secret);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.purpose !== "founder_gate" || Number(payload.ver) !== 1) {
      return { ok: false, reason: "invalid_purpose" };
    }
    if (!payload.sub || Number(payload.exp) <= now) {
      return { ok: false, reason: "expired" };
    }
    return {
      ok: true,
      subject: String(payload.sub),
      method: payload.method === "session" ? "session" : "admin",
    };
  } catch {
    return { ok: false, reason: "parse_failed" };
  }
}

/**
 * @param {import("http").IncomingMessage} req
 */
export function extractFounderGateFromRequest(req = {}) {
  const cookieHeader = String(req.headers?.cookie || "");
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${MIA_FOUNDER_GATE_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {Record<string, string|undefined>} [env]
 */
export function requireFounderGate(req, env = process.env) {
  const token = extractFounderGateFromRequest(req);
  const verified = verifyFounderGateToken(token, env);
  if (!verified.ok) {
    return { ok: false, response: { statusCode: 401, error: "founder_gate_required" } };
  }
  return { ok: true, subject: verified.subject, method: verified.method };
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {Record<string, string|undefined>} [env]
 */
export async function authenticateFounderRequest(req, env = process.env) {
  const gate = requireFounderGate(req, env);
  if (gate.ok) return gate;

  const admin = validateMiaAdminApiKey(req);
  if (admin.ok) {
    return {
      ok: true,
      subject: "admin",
      method: "admin",
      gateToken: issueFounderGateToken({ subject: "admin", method: "admin" }, env),
    };
  }

  const sessionToken = extractUserSessionToken(req);
  if (sessionToken) {
    const verified = verifyUserSessionToken(sessionToken, env);
    if (!verified.ok) {
      return { ok: false, response: { statusCode: 401, error: "session_invalid" } };
    }

    if (!isSupabaseServiceRoleConfigured()) {
      return { ok: false, response: { statusCode: 503, error: "user_lookup_unavailable" } };
    }

    const { data: userRow, error } = await supabase
      .from("users")
      .select("id, email, email_normalized")
      .eq("id", verified.userId)
      .limit(1)
      .maybeSingle();

    if (error || !userRow) {
      return { ok: false, response: { statusCode: 403, error: "user_not_found" } };
    }

    const email = String(userRow.email_normalized || userRow.email || "").trim().toLowerCase();
    if (!isFounderEmail(email, env)) {
      return { ok: false, response: { statusCode: 403, error: "founder_access_denied" } };
    }

    return {
      ok: true,
      subject: email,
      method: "session",
      gateToken: issueFounderGateToken({ subject: email, method: "session" }, env),
    };
  }

  return { ok: false, response: { statusCode: 401, error: "founder_auth_required" } };
}

/**
 * @param {string} userId
 * @param {Record<string, string|undefined>} [env]
 */
export async function isFounderUserId(userId, env = process.env) {
  if (!isSupabaseServiceRoleConfigured()) return false;
  const { data } = await supabase
    .from("users")
    .select("email, email_normalized")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  const email = String(data.email_normalized || data.email || "").trim().toLowerCase();
  return isFounderEmail(email, env);
}

export { findUserByEmail };
