/**
 * PATCH 11.1 — GET /api/executive-metrics
 * Single Source of Truth for consolidated MIA metrics (aggregates only).
 */

import { buildExecutiveMetricsResponse } from "../../lib/miaExecutiveMetricsApi.js";
import {
  applyPublicCorsHeaders,
  applyPublicSecurityHeaders,
  sendPublicApiError,
  validatePublicHttpMethod,
} from "../../lib/miaPublicApiHardening.js";
import { withMiaObservability } from "../../lib/miaObservability.js";

export default withMiaObservability(async function executiveMetricsHandler(req, res) {
  applyPublicSecurityHeaders(res);

  if (req.method === "OPTIONS") {
    const cors = applyPublicCorsHeaders(req, res);
    if (cors.crossOrigin && !cors.originAllowed) {
      return res.status(403).json({
        error: "origin_not_allowed",
        reasonCode: "public_api_origin_not_allowed",
      });
    }
    res.setHeader("Allow", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    return res.status(204).end();
  }

  const methodCheck = validatePublicHttpMethod(req, ["GET"]);
  if (!methodCheck.ok) {
    return sendPublicApiError(res, methodCheck.response, {
      allowHeader: methodCheck.allowHeader,
    });
  }

  const cors = applyPublicCorsHeaders(req, res);
  if (cors.crossOrigin && cors.originAllowed) {
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  }
  if (cors.crossOrigin && !cors.originAllowed) {
    return res.status(403).json({
      error: "origin_not_allowed",
      reasonCode: "public_api_origin_not_allowed",
    });
  }

  try {
    const windowDays = Number.parseInt(String(req.query?.days ?? req.query?.window_days ?? ""), 10);
    const bypassCache = String(req.query?.fresh ?? "") === "1";
    const payload = await buildExecutiveMetricsResponse({
      windowDays: Number.isFinite(windowDays) ? windowDays : undefined,
      bypassCache,
    });

    applyPublicSecurityHeaders(res, {
      varyOrigin: cors.crossOrigin && cors.originAllowed,
    });

    return res.status(200).json(payload);
  } catch (err) {
    applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });
    return res.status(500).json({
      error: "executive_metrics_unavailable",
      reasonCode: "executive_metrics_internal_error",
      metrics_version: "11.1.0",
    });
  }
}, { endpoint: "/api/executive-metrics" });
