/**
 * PATCH A.3 — GET /api/temporal-metrics
 * Reusable temporal series layer for Founder / Executive / Public dashboards.
 */

import { buildTemporalSeriesResponse } from "../../lib/miaTemporalSeriesApi.js";
import {
  parseAnalyticsFiltersFromHttpQuery,
  buildExecutiveMetricsApiParams,
} from "../../lib/miaAnalyticsFilterParams.js";
import {
  applyPublicCorsHeaders,
  applyPublicSecurityHeaders,
  sendPublicApiError,
  validatePublicHttpMethod,
} from "../../lib/miaPublicApiHardening.js";
import { withMiaObservability } from "../../lib/miaObservability.js";
import { parseTemporalSeriesGroups, MIA_TEMPORAL_SERIES_VERSION } from "../../lib/miaTemporalSeriesCatalog.js";

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
    const parsed = parseAnalyticsFiltersFromHttpQuery(req.query ?? {});
    if (!parsed.ok) {
      applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });
      return res.status(400).json({
        error: parsed.error,
        reasonCode: `temporal_${parsed.error}`,
        temporal_version: MIA_TEMPORAL_SERIES_VERSION,
        filter_errors: parsed.filters.errors,
      });
    }

    const bypassCache = String(req.query?.fresh ?? "") === "1";
    const seriesGroups = parseTemporalSeriesGroups(req.query?.series ?? req.query?.groups);

    if (String(req.query?.series ?? req.query?.groups ?? "").trim() !== "" && seriesGroups.length === 0) {
      applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });
      return res.status(400).json({
        error: "invalid_series_groups",
        reasonCode: "temporal_invalid_series_groups",
        temporal_version: MIA_TEMPORAL_SERIES_VERSION,
      });
    }

    const result = await buildTemporalSeriesResponse({
      ...buildExecutiveMetricsApiParams(parsed.filters),
      granularity: req.query?.granularity,
      seriesGroups,
      bypassCache,
    });

    applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });

    if (!result.ok) {
      return res.status(400).json({
        error: result.error,
        reasonCode: `temporal_${result.error}`,
        temporal_version: MIA_TEMPORAL_SERIES_VERSION,
      });
    }

    const { ok: _ok, ...payload } = result;
    return res.status(200).json(payload);
  } catch {
    applyPublicSecurityHeaders(res, { varyOrigin: cors.crossOrigin && cors.originAllowed });
    return res.status(500).json({
      error: "temporal_metrics_unavailable",
      reasonCode: "temporal_metrics_internal_error",
      temporal_version: MIA_TEMPORAL_SERIES_VERSION,
    });
  }
}, { endpoint: "/api/temporal-metrics" });
