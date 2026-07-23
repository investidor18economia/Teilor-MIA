/**
 * PATCH 11.3 — Founder cockpit logout (clears gate cookie).
 */

import { MIA_FOUNDER_GATE_COOKIE } from "../../../lib/miaFounderAccess.js";
import { applyPublicSecurityHeaders } from "../../../lib/miaPublicApiHardening.js";

export default function founderLogoutHandler(req, res) {
  applyPublicSecurityHeaders(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${MIA_FOUNDER_GATE_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
  );
  return res.status(200).json({ ok: true });
}
