/**
 * PATCH 11.4 — Period comparison via Executive Metrics collector (backend only).
 */

import { buildExecutiveMetricsResponse } from "./miaExecutiveMetricsApi.js";

/**
 * @param {number} days
 * @param {number} [offsetDays]
 */
export function buildReferencePeriodBounds(days, offsetDays = 0) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - offsetDays);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * @param {{ windowDays?: number, bypassCache?: boolean, env?: Record<string, string|undefined> }} [options]
 */
export async function buildExecutiveMetricsPeriodComparison(options = {}) {
  const windowDays = Math.max(1, Math.min(365, Number(options.windowDays ?? 30) || 30));
  const timings = { metrics_current_ms: 0, metrics_previous_ms: 0 };

  const t0 = Date.now();
  const current = await buildExecutiveMetricsResponse({
    windowDays,
    offsetDays: 0,
    bypassCache: options.bypassCache,
    env: options.env,
  });
  timings.metrics_current_ms = Date.now() - t0;

  const t1 = Date.now();
  let previous = null;
  let previousError = null;
  try {
    previous = await buildExecutiveMetricsResponse({
      windowDays,
      offsetDays: windowDays,
      bypassCache: options.bypassCache,
      env: options.env,
    });
  } catch (err) {
    previousError = String(err?.message || "previous_period_failed").slice(0, 120);
  }
  timings.metrics_previous_ms = Date.now() - t1;

  const partialErrors = [
    ...(current?.partial_errors ?? []),
    ...(previous?.partial_errors ?? []),
  ];
  if (previousError) {
    partialErrors.push({ scope: "previous_period", error: previousError });
  }
  if (previous?.partial_errors?.some((e) => e.error === "period_offset_unavailable")) {
    partialErrors.push({ scope: "previous_period", error: "period_offset_unavailable" });
  }

  return {
    windowDays,
    current,
    previous,
    reference_period: {
      days: windowDays,
      current: buildReferencePeriodBounds(windowDays, 0),
      previous: buildReferencePeriodBounds(windowDays, windowDays),
    },
    partialErrors,
    timings,
  };
}
