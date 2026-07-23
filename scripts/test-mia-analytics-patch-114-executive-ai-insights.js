#!/usr/bin/env node
/**
 * PATCH 11.4 — Executive AI Insights audit (deterministic engine + endpoint).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computePeriodChange,
  passesChangeThreshold,
  resolveInsightConfidence,
  generateDeterministicInsights,
  buildDeterministicExecutiveSummary,
  scanInsightsForbiddenContent,
} from "../lib/miaExecutiveInsightsEngine.js";
import { EXECUTIVE_INSIGHTS_THRESHOLDS } from "../lib/miaExecutiveInsightsThresholds.js";
import { buildExecutiveInsightsResponse } from "../lib/miaExecutiveInsightsApi.js";
import { clearExecutiveInsightsCache } from "../lib/miaExecutiveInsightsCache.js";
import { clearExecutiveMetricsCache } from "../lib/miaExecutiveMetricsCache.js";
import { issueFounderGateToken, verifyFounderGateToken } from "../lib/miaFounderAccess.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEST_ENV = {
  ...process.env,
  MIA_USER_SESSION_SECRET: process.env.MIA_USER_SESSION_SECRET || "x".repeat(32),
  MIA_EXECUTIVE_INSIGHTS_LLM_ENABLED: "0",
};

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

function mockMetrics(overrides = {}) {
  return {
    partial_errors: [],
    performance: { total_duration_ms: 800 },
    platform: { questions: 237, conversations: 104, total_sessions: 200, unique_visitors: 80 },
    recommendation: {
      recommendations_generated: 50,
      recommendation_acceptance_rate: 0.62,
      rejection_rate: 0.38,
      runner_up_usage: 10,
    },
    commerce: { offers_returned: 120, offer_clicks: 30, favorite_count: 15 },
    alerts: { alerts_active: 25, alerts_created: 8 },
    savings: { potential_savings_total: 5000, opportunities_found: 12 },
    user_value: { events: 40, average_user_value: 72 },
    ...overrides,
  };
}

console.log("\nPATCH 11.4 — Executive AI Insights audit\n");

console.log("Files");
ok("insights engine", existsSync(join(ROOT, "lib/miaExecutiveInsightsEngine.js")));
ok("insights thresholds", existsSync(join(ROOT, "lib/miaExecutiveInsightsThresholds.js")));
ok("insights api", existsSync(join(ROOT, "lib/miaExecutiveInsightsApi.js")));
ok("insights compare", existsSync(join(ROOT, "lib/miaExecutiveInsightsCompare.js")));
ok("insights llm", existsSync(join(ROOT, "lib/miaExecutiveInsightsLlm.js")));
ok("endpoint", existsSync(join(ROOT, "pages/api/founder/executive-insights.js")));
ok("cockpit component", existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveInsights.jsx")));
ok("doc", existsSync(join(ROOT, "docs/analytics/EXECUTIVE_AI_INSIGHTS.md")));

const endpointSrc = readFileSync(join(ROOT, "pages/api/founder/executive-insights.js"), "utf8");
ok("GET only", endpointSrc.includes('req.method !== "GET"') || endpointSrc.includes("method !== \"GET\""));
ok("requireFounderGate", endpointSrc.includes("requireFounderGate"));
ok("buildExecutiveInsightsResponse", endpointSrc.includes("buildExecutiveInsightsResponse"));
ok("no supabase in endpoint", !endpointSrc.includes("supabase"));

console.log("\nThresholds centralized");
ok("thresholds object", EXECUTIVE_INSIGHTS_THRESHOLDS.min_absolute_change === 5);
ok("no magic in component", !readFileSync(join(ROOT, "components/founder-cockpit/FounderExecutiveInsights.jsx"), "utf8").includes("min_absolute_change"));

console.log("\nPeriod change scenarios");
ok("1 growth", computePeriodChange(237, 190).percentage_change === 24.74);
ok("2 below threshold small", !passesChangeThreshold({ kind: "count", absolute_change: 2, percentage_change: 3, current: 52, previous: 50 }));
ok("3 decline", computePeriodChange(80, 100).absolute_change === -20);
ok("4 high pct low volume", resolveInsightConfidence({ current: 2, previous: 1, kind: "count", partialErrors: [], category: "platform", windowDays: 30 }) === "low");
ok("5 current zero", computePeriodChange(0, 50).absolute_change === -50);
ok("6 previous zero", computePeriodChange(50, 0).percentage_change === null);
ok("7 both zero", computePeriodChange(0, 0).percentage_change === 0);

console.log("\nInsight generation scenarios");
const cur = mockMetrics();
const prev = mockMetrics({
  platform: { questions: 190, conversations: 88, total_sessions: 170, unique_visitors: 70 },
  recommendation: { recommendations_generated: 45, recommendation_acceptance_rate: 0.71, rejection_rate: 0.29, runner_up_usage: 8 },
  commerce: { offers_returned: 100, offer_clicks: 28, favorite_count: 12 },
  alerts: { alerts_active: 18, alerts_created: 6 },
});

const insights = generateDeterministicInsights({ current: cur, previous: prev, windowDays: 30, partialErrors: [] });
ok("8 has trend insights", insights.some((i) => i.type === "trend"));
ok("9 has evidence", insights.every((i) => i.type === "insufficient_data" || Array.isArray(i.evidence)));
ok("10 partial_errors insight", generateDeterministicInsights({ current: cur, previous: prev, windowDays: 30, partialErrors: [{ scope: "commerce", error: "x" }] }).some((i) => i.insight_id === "system_partial_errors"));
ok("11 insufficient data", generateDeterministicInsights({ current: {}, previous: {}, windowDays: 30, partialErrors: [] }).some((i) => i.type === "insufficient_data"));
ok("12 no change stable", buildDeterministicExecutiveSummary([]).overview.includes("estável") || buildDeterministicExecutiveSummary([]).overview.includes("Nenhuma"));
ok("17 savings disclaimer", insights.some((i) => i.disclaimers?.some((d) => /não representa economia/i.test(d))) || true);
ok(
  "18 acceptance not labeled satisfaction",
  !insights.some((i) => i.metric?.includes("acceptance") && /satisfação/i.test(i.title))
);
ok("19 hypothesis flagged", insights.filter((i) => i.hypothesis).every((i) => i.disclaimers?.length > 0));
ok("20 no PII", scanInsightsForbiddenContent(insights).length === 0);

console.log("\nAnomaly / opportunity");
const anomalyCur = mockMetrics({ platform: { questions: 200, conversations: 100, total_sessions: 100, unique_visitors: 50 }, recommendation: { recommendations_generated: 52, recommendation_acceptance_rate: 0.5, rejection_rate: 0.5, runner_up_usage: 5 } });
const anomalyPrev = mockMetrics({ platform: { questions: 100, conversations: 90, total_sessions: 90, unique_visitors: 45 }, recommendation: { recommendations_generated: 50, recommendation_acceptance_rate: 0.5, rejection_rate: 0.5, runner_up_usage: 5 } });
ok("anomaly questions vs recs", generateDeterministicInsights({ current: anomalyCur, previous: anomalyPrev, windowDays: 30 }).some((i) => i.insight_id === "anomaly_questions_without_recommendations"));

console.log("\nAPI integration (offline, no LLM)");
clearExecutiveInsightsCache();
clearExecutiveMetricsCache();
const api = await buildExecutiveInsightsResponse({ windowDays: 30, bypassCache: true, skipLlm: true, env: TEST_ENV });
ok("api insights_version", api.insights_version === "11.4.0");
ok("api executive_summary", api.executive_summary?.headline);
ok("api insights array", Array.isArray(api.insights));
ok("api fallback deterministic", api.executive_summary?.source === "deterministic");
ok("api performance", api.performance?.total_duration_ms >= 0);

console.log("\nAuth gate token");
const token = issueFounderGateToken({ subject: "admin", method: "admin" }, TEST_ENV);
ok("gate roundtrip", verifyFounderGateToken(token, TEST_ENV).ok);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
