/**
 * PATCH A.3 — GET /api/temporal-metrics
 * Reusable temporal series layer for Founder / Executive / Public dashboards.
 */

import { buildTemporalSeriesResponse } from "../../lib/miaTemporalSeriesApi.js";
import {
  applyPublicCorsHeaders,
  applyPublicSecurityHeaders,
  sendPublicApiError,
  validatePublicHttpMethod,
} from "../../lib/miaPublicApiHardening.js";
import { withMiaObservability } from "../../lib/miaObservability.js";
import { parseTemporalSeriesGroups } from "../../lib/miaTemporalSeriesCatalog.js";

export default withMiaObservability(async function temporalMetricsHandler(req, res) {
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
    const offsetDays = Number.parseInt(String(req.query?.offset_days ?? req.query?.offset ?? ""), 10);
    const bypassCache = String(req.query?.fresh ?? "") === "1";
    const seriesGroups = parseTemporalSeriesGroups(req.query?.series ?? req.query?.groups);

    if (String(req.query?.series ?? req.query?.groups ?? "").trim() !== "" && seriesGroups.length === 0) {
      applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });
      return res.status(400).json({
        error: "invalid_series_groups",
        reasonCode: "temporal_invalid_series_groups",
        temporal_version: "A.3.0",
      });
    }

    const result = await buildTemporalSeriesResponse({
      windowDays: Number.isFinite(windowDays) ? windowDays : undefined,
      offsetDays: Number.isFinite(offsetDays) ? offsetDays : undefined,
      granularity: req.query?.granularity,
      seriesGroups,
      bypassCache,
    });

    applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });

    if (!result.ok) {
      return res.status(400).json({
        error: result.error,
        reasonCode: `temporal_${result.error}`,
        temporal_version: "A.3.0",
      });
    }

    const { ok: _ok, ...payload } = result;
    return res.status(200).json(payload);
  } catch {
    applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });
    return res.status(500).json({
      error: "temporal_metrics_unavailable",
      reasonCode: "temporal_metrics_internal_error",
      temporal_version: "A.3.0",
    });
  }
}, { endpoint: "/api/temporal-metrics" });
