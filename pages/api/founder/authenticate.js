/**
 * PATCH 11.3 — Founder cockpit authentication (sets gate cookie).
 */

import {
  authenticateFounderRequest,
  issueFounderGateToken,
  MIA_FOUNDER_GATE_COOKIE,
  MIA_FOUNDER_GATE_TTL_MS,
} from "../../../lib/miaFounderAccess.js";
import { applyPublicSecurityHeaders } from "../../../lib/miaPublicApiHardening.js";

function serializeCookie(name, value, maxAgeSec) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}

export default async function founderAuthenticateHandler(req, res) {
  applyPublicSecurityHeaders(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const body = req.body || {};
    const reqWithBody = {
      ...req,
      headers: {
        ...req.headers,
        ...(body.admin_key ? { "x-mia-admin-key": body.admin_key } : {}),
        ...(body.session_token
          ? { authorization: `Bearer ${body.session_token}`, "x-mia-session-token": body.session_token }
          : {}),
      },
    };

    const auth = await authenticateFounderRequest(reqWithBody);
    if (!auth.ok) {
      return res.status(auth.response?.statusCode || 401).json({
        error: auth.response?.error || "founder_auth_failed",
      });
    }

    const token =
      auth.gateToken ||
      issueFounderGateToken(
        { subject: auth.subject, method: auth.method === "session" ? "session" : "admin" },
        process.env
      );
    if (!token) {
      return res.status(500).json({ error: "gate_token_failed" });
    }

    res.setHeader(
      "Set-Cookie",
      serializeCookie(MIA_FOUNDER_GATE_COOKIE, token, Math.floor(MIA_FOUNDER_GATE_TTL_MS / 1000))
    );
    return res.status(200).json({ ok: true, method: auth.method });
  } catch {
    return res.status(500).json({ error: "founder_auth_internal_error" });
  }
}
