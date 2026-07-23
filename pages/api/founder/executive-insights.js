/**
 * PATCH 11.4 — GET /api/founder/executive-insights (private, founder gate).
 */

import { buildExecutiveInsightsResponse } from "../../../lib/miaExecutiveInsightsApi.js";
import { requireFounderGate } from "../../../lib/miaFounderAccess.js";
import { applyPublicSecurityHeaders } from "../../../lib/miaPublicApiHardening.js";

const VALID_DAYS = new Set([7, 30, 90, 365]);

function parseDays(raw) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return VALID_DAYS.has(n) ? n : 30;
}

export default async function founderExecutiveInsightsHandler(req, res) {
  applyPublicSecurityHeaders(res);

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const gate = requireFounderGate(req);
  if (!gate.ok) {
    return res.status(401).json({ error: "founder_gate_required", reasonCode: "founder_auth_required" });
  }

  try {
    const windowDays = parseDays(req.query?.days ?? req.query?.window_days);
    const bypassCache = String(req.query?.fresh ?? "") === "1";
    const skipLlm = String(req.query?.no_llm ?? "") === "1";

    const payload = await buildExecutiveInsightsResponse({
      windowDays,
      bypassCache,
      skipLlm,
    });

    return res.status(200).json(payload);
  } catch {
    return res.status(500).json({
      error: "executive_insights_unavailable",
      insights_version: "11.4.0",
    });
  }
}
