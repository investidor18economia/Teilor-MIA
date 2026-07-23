/**
 * PATCH 11.4 — Executive AI Insights API builder.
 */

import { EXECUTIVE_INSIGHTS_VERSION } from "./miaExecutiveInsightsThresholds.js";
import { buildExecutiveMetricsPeriodComparison } from "./miaExecutiveInsightsCompare.js";
import {
  generateDeterministicInsights,
  buildDeterministicExecutiveSummary,
  resolveDataQuality,
  scanInsightsForbiddenContent,
} from "./miaExecutiveInsightsEngine.js";
import { verbalizeExecutiveInsights, isExecutiveInsightsLlmEnabled } from "./miaExecutiveInsightsLlm.js";
import {
  getExecutiveInsightsCache,
  setExecutiveInsightsCache,
  resolveExecutiveInsightsCacheTtlMs,
} from "./miaExecutiveInsightsCache.js";

/**
 * @param {{ windowDays?: number, bypassCache?: boolean, skipLlm?: boolean, env?: Record<string, string|undefined> }} [options]
 */
export async function buildExecutiveInsightsResponse(options = {}) {
  const windowDays = Math.max(1, Math.min(365, Number(options.windowDays ?? 30) || 30));
  const cacheKey = `executive-insights:v${EXECUTIVE_INSIGHTS_VERSION}:d${windowDays}`;

  if (!options.bypassCache) {
    const cached = getExecutiveInsightsCache(cacheKey);
    if (cached) return cached;
  }

  const started = Date.now();
  const comparison = await buildExecutiveMetricsPeriodComparison({
    windowDays,
    bypassCache: options.bypassCache,
    env: options.env,
  });

  const insights = generateDeterministicInsights({
    current: comparison.current,
    previous: comparison.previous ?? {},
    windowDays,
    partialErrors: comparison.partialErrors,
  });

  const deterministicSummary = buildDeterministicExecutiveSummary(insights);
  const dataQuality = resolveDataQuality({ partialErrors: comparison.partialErrors });

  const limitations = [
    "Métricas agregadas — variações indicam padrões observados, não causas comprovadas.",
    "Taxa de aceitação não mede satisfação.",
    "Economia potencial não representa economia realizada.",
  ];

  let executiveSummary = deterministicSummary;
  let llmMeta = { attempted: false, ok: false, reason: null, duration_ms: 0 };

  if (!options.skipLlm && isExecutiveInsightsLlmEnabled(options.env)) {
    llmMeta.attempted = true;
    const llmStart = Date.now();
    const llm = await verbalizeExecutiveInsights(
      { deterministicSummary, insights, windowDays, limitations },
      options.env
    );
    llmMeta.duration_ms = Date.now() - llmStart;
    llmMeta.ok = llm.ok;
    llmMeta.reason = llm.reason ?? null;
    if (llm.ok && llm.summary) {
      executiveSummary = { ...deterministicSummary, ...llm.summary, source: "llm" };
    }
  }

  const response = {
    insights_version: EXECUTIVE_INSIGHTS_VERSION,
    computed_at: new Date().toISOString(),
    reference_period: comparison.reference_period,
    executive_summary: executiveSummary,
    insights,
    data_quality: dataQuality,
    performance: {
      total_duration_ms: Date.now() - started,
      metrics_current_ms: comparison.timings.metrics_current_ms,
      metrics_previous_ms: comparison.timings.metrics_previous_ms,
      engine_ms:
        Date.now() -
        started -
        comparison.timings.metrics_current_ms -
        comparison.timings.metrics_previous_ms -
        llmMeta.duration_ms,
      llm: llmMeta,
      insights_count: insights.length,
    },
    transparency: {
      notice:
        "Os insights são produzidos a partir de métricas agregadas da Teilor. Variações indicam padrões observados, não causas comprovadas.",
      hypothesis_label: "Hipótese para investigação. Não representa causalidade comprovada.",
    },
  };

  const forbidden = scanInsightsForbiddenContent(response);
  if (forbidden.length) {
    response.data_quality = {
      ...response.data_quality,
      status: "degraded",
      privacy_scan: forbidden.slice(0, 5),
    };
  }

  return setExecutiveInsightsCache(cacheKey, response, resolveExecutiveInsightsCacheTtlMs());
}
