#!/usr/bin/env node
/**
 * PATCH C.4 — Executive Trend Generator audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS,
  EXECUTIVE_CONFIDENCE_REQUIRED_KEYS,
  EXECUTIVE_EVIDENCE_REQUIRED_KEYS,
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  EXECUTIVE_ANALYSIS_OUTPUT_TEMPLATE,
} from "../lib/miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_TREND_CATALOG_VERSION,
  EXECUTIVE_TREND_SIGNAL_DEFINITIONS,
  EXECUTIVE_TREND_TYPES,
  EXECUTIVE_TREND_TYPES_BLOCKED,
  EXECUTIVE_TREND_STATUSES,
  EXECUTIVE_TREND_DIRECTIONS,
  EXECUTIVE_TREND_SEMANTICS,
  EXECUTIVE_TREND_MAGNITUDES,
  EXECUTIVE_TREND_EMPTY_MESSAGES,
} from "../lib/miaExecutiveTrendCatalog.js";
import {
  classifyTrendDirectionFromDelta,
  classifyTrendMagnitude,
  classifyTrendType,
  classifyTrendStatus,
  classifyTrendConfidence,
  buildTrendInterpretation,
  describeExecutiveRelevance,
  containsCausalLanguage,
  normalizeViewDirection,
} from "../lib/miaExecutiveTrendRules.js";
import {
  collectExecutiveTrendInput,
  collectTemporalSignals,
  validateTemporalSignal,
  evaluateTrendSignals,
  deduplicateExecutiveTrends,
  buildExecutiveStructuredTrends,
  generateExecutiveAnalysisTrends,
  generateExecutiveAnalysisWithSummaryInsightsAndTrends,
  mapStructuredTrendToExecutiveTrend,
  MIA_EXECUTIVE_TREND_BUILDER_VERSION,
} from "../lib/miaExecutiveTrendBuilder.js";
import {
  generateExecutiveAnalysisInsights,
  MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION,
} from "../lib/miaExecutiveInsightBuilder.js";
import {
  generateExecutiveAnalysisSummary,
  MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION,
} from "../lib/miaExecutiveSummaryBuilder.js";
import { mapExecutiveMetricsToFounderExecutiveKpis } from "../lib/miaFounderExecutiveDisplay.js";
import { mapExecutiveGrowthToFounderDisplay } from "../lib/miaFounderExecutiveGrowthDisplay.js";
import { mapExecutiveProductHealthToFounderDisplay } from "../lib/miaFounderExecutiveProductHealthDisplay.js";
import { mapExecutiveCommercialPerformanceToFounderDisplay } from "../lib/miaFounderExecutiveCommercialPerformanceDisplay.js";
import { mapExecutiveOperationalToFounderDisplay } from "../lib/miaFounderExecutiveOperationalDisplay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("\nPATCH C.4 — Executive Trend Generator audit\n");

// ── Files ────────────────────────────────────────────────────────────
ok("catalog exists", existsSync(join(ROOT, "lib/miaExecutiveTrendCatalog.js")));
ok("rules exists", existsSync(join(ROOT, "lib/miaExecutiveTrendRules.js")));
ok("builder exists", existsSync(join(ROOT, "lib/miaExecutiveTrendBuilder.js")));
ok("catalog version C.4.0", MIA_EXECUTIVE_TREND_CATALOG_VERSION === "C.4.0");
ok("builder version C.4.0", MIA_EXECUTIVE_TREND_BUILDER_VERSION === "C.4.0");

const builderSrc = read("lib/miaExecutiveTrendBuilder.js");
const catalogSrc = read("lib/miaExecutiveTrendCatalog.js");
const rulesSrc = read("lib/miaExecutiveTrendRules.js");
for (const [name, src] of [
  ["builder", builderSrc],
  ["catalog", catalogSrc],
  ["rules", rulesSrc],
]) {
  ok(`${name} no supabase`, !/supabase|createClient/.test(src));
  ok(`${name} no SQL`, !/SELECT\s|FROM\s+mia_|\.rpc\(/.test(src));
  ok(`${name} no fetch`, !/\bfetch\s*\(/.test(src));
  ok(`${name} no OpenAI/LLM`, !/openai|chat\.completions|verbalizeExecutive/.test(src));
}

// ── C.1/C.2/C.3 preserved ────────────────────────────────────────────
ok("C.1 contracts version unchanged", MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION === "C.1.0");
ok("C.1 output template still pending", EXECUTIVE_ANALYSIS_OUTPUT_TEMPLATE.status === "pending");
ok("C.2 summary builder intact", MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION === "C.2.0");
ok("C.3 insight builder intact", MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION === "C.3.0");
ok("signal definitions defined", EXECUTIVE_TREND_SIGNAL_DEFINITIONS.length >= 10);
ok("blocked types defined", EXECUTIVE_TREND_TYPES_BLOCKED.length >= 3);

// ── Mock data (same pattern as C.3) ──────────────────────────────────
const mockExecutive = {
  metrics_version: "11.1.0",
  computed_at: "2026-07-23T11:55:00.000Z",
  reference_period_days: 30,
  platform: { total_sessions: 500, conversations: 200, questions: 350, unique_visitors: 120 },
  conversation: { recommendations_shown: 280, conversations_with_questions: 150 },
  recommendation: {
    recommendations_generated: 300,
    recommendation_acceptance_rate: 0.55,
    rejection_rate: 0.12,
  },
  commerce: { offers_returned: 180, offer_clicks: 45, favorite_count: 22, offer_sets_generated: 200 },
  alerts: { alerts_created: 15 },
  price_intelligence: { average_price_quality_score: 82 },
  savings: { opportunities_found: 10 },
  anti_regret: { average_score: 0.72 },
  user_value: { average_user_value: 0.68, verified_value_amount_count: 5 },
  system: {
    analytics_version: "11.1.0",
    build_version: "prod",
    environment: "production",
    last_update: "2026-07-23T11:50:00.000Z",
  },
  performance: { total_duration_ms: 420 },
  partial_errors: [],
};

const mockExecutivePrevious = {
  platform: { total_sessions: 400, questions: 280, conversations: 160 },
  recommendation: { recommendation_acceptance_rate: 0.5, rejection_rate: 0.14 },
  commerce: { offer_clicks: 30, favorite_count: 15, offers_returned: 140 },
  alerts: { alerts_created: 10 },
  partial_errors: [],
};

const mockTemporal = {
  temporal_version: "A.7.0",
  computed_at: "2026-07-23T11:55:00.000Z",
  partial_errors: [],
  growth: {
    series: [
      {
        activity_day: "2026-07-22",
        dau_visitors: 95,
        crescimento_dau_visitors_pct: 0.08,
        crescimento_wau_visitors_pct: 0.05,
        crescimento_mau_visitors_pct: 0.04,
      },
      { crescimento_dau_visitors_pct: 0.03 },
    ],
  },
  platform_activity: {
    series: [
      { total_sessions: 50, questions: 30, conversations: 20 },
      { total_sessions: 45, questions: 28, conversations: 18 },
    ],
  },
  conversion: {
    summary: { taxa_clique_recomendacao: 0.04, eventos_recomendacoes: 280, eventos_cliques: 45 },
    bottlenecks: [
      {
        transicao: "recomendacao_para_clique",
        is_gargalo_principal: true,
        taxa_abandono_transicao: 0.65,
        taxa_conversao_transicao: 0.35,
      },
    ],
  },
};

const moduleViews = {
  kpis: mapExecutiveMetricsToFounderExecutiveKpis(mockExecutive, mockTemporal),
  growth: mapExecutiveGrowthToFounderDisplay(mockExecutive, mockExecutivePrevious, mockTemporal),
  health: mapExecutiveProductHealthToFounderDisplay(mockExecutive, mockExecutivePrevious),
  commercial: mapExecutiveCommercialPerformanceToFounderDisplay(
    mockExecutive,
    mockExecutivePrevious,
    mockTemporal
  ),
  operational: mapExecutiveOperationalToFounderDisplay(mockExecutive, mockTemporal),
};

const analysisInput = {
  analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  period_label: "30d",
  period: { start: null, end: null, range: "30d", window_days: 30 },
  module_ids: ["kpis", "growth", "health", "commercial", "operational"],
  executive_views: moduleViews,
  executive_snapshot: null,
  temporal_snapshot: null,
  source_evidence: [],
};

// ── Pipeline ─────────────────────────────────────────────────────────
const collected = collectExecutiveTrendInput(analysisInput);
ok("collect normalizes views", Object.keys(collected.views).length === 5);

const signals = collectTemporalSignals(collected);
ok("collectTemporalSignals produces signals", signals.length === EXECUTIVE_TREND_SIGNAL_DEFINITIONS.length);

const validated = signals.map(validateTemporalSignal);
ok("validateTemporalSignal returns status", validated.every((v) => v.status != null));

const candidates = evaluateTrendSignals(signals, collected);
ok("evaluate produces candidates", candidates.length > 0, `count=${candidates.length}`);

const deduped = deduplicateExecutiveTrends(candidates);
ok("dedup reduces or equals candidates", deduped.length <= candidates.length);

const { trends: structured } = buildExecutiveStructuredTrends(analysisInput);
ok("structured trends present", structured.length > 0);
ok("structured trend has direction", Boolean(structured[0]?.direction));
ok("structured trend has magnitude", Boolean(structured[0]?.magnitude));
ok("structured trend has limitations array", Array.isArray(structured[0]?.limitations));

// ── Trend types: growth, decline, stability, acceleration ────────────
const trendRecords = structured;
const trendTypes = new Set(trendRecords.map((t) => t.trend_type));
ok("growth trend detected", trendTypes.has(EXECUTIVE_TREND_TYPES.GROWTH));
ok(
  "decline or stability trend detected",
  trendTypes.has(EXECUTIVE_TREND_TYPES.DECLINE) ||
    trendTypes.has(EXECUTIVE_TREND_TYPES.STABILITY) ||
    trendRecords.some((t) => t.direction === EXECUTIVE_TREND_DIRECTIONS.DOWN)
);
ok("acceleration trend detected", trendTypes.has(EXECUTIVE_TREND_TYPES.ACCELERATION));

// ── Rule unit tests ──────────────────────────────────────────────────
ok(
  "classifyTrendDirectionFromDelta up",
  classifyTrendDirectionFromDelta(0.05) === EXECUTIVE_TREND_DIRECTIONS.UP
);
ok(
  "classifyTrendDirectionFromDelta down",
  classifyTrendDirectionFromDelta(-0.05) === EXECUTIVE_TREND_DIRECTIONS.DOWN
);
ok(
  "classifyTrendDirectionFromDelta stable",
  classifyTrendDirectionFromDelta(0.005) === EXECUTIVE_TREND_DIRECTIONS.STABLE
);
ok(
  "classifyTrendMagnitude moderate pct",
  classifyTrendMagnitude(0.06, "pct") === EXECUTIVE_TREND_MAGNITUDES.MODERATE
);
ok(
  "classifyTrendType growth",
  classifyTrendType(EXECUTIVE_TREND_DIRECTIONS.UP, EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER, EXECUTIVE_TREND_STATUSES.CONFIRMED) ===
    EXECUTIVE_TREND_TYPES.GROWTH
);
ok(
  "classifyTrendType decline",
  classifyTrendType(EXECUTIVE_TREND_DIRECTIONS.DOWN, EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER, EXECUTIVE_TREND_STATUSES.CONFIRMED) ===
    EXECUTIVE_TREND_TYPES.DECLINE
);
ok(
  "classifyTrendType stability",
  classifyTrendType(EXECUTIVE_TREND_DIRECTIONS.STABLE, EXECUTIVE_TREND_SEMANTICS.NEUTRAL, EXECUTIVE_TREND_STATUSES.CONFIRMED) ===
    EXECUTIVE_TREND_TYPES.STABILITY
);
ok(
  "classifyTrendType acceleration",
  classifyTrendType(EXECUTIVE_TREND_DIRECTIONS.UP, EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER, EXECUTIVE_TREND_STATUSES.CONFIRMED, "accelerating") ===
    EXECUTIVE_TREND_TYPES.ACCELERATION
);

// ── Semantics ────────────────────────────────────────────────────────
const higherBetter = EXECUTIVE_TREND_SIGNAL_DEFINITIONS.find(
  (d) => d.semantics === EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER
);
const lowerBetter = EXECUTIVE_TREND_SIGNAL_DEFINITIONS.find(
  (d) => d.semantics === EXECUTIVE_TREND_SEMANTICS.LOWER_IS_BETTER
);
const neutral = EXECUTIVE_TREND_SIGNAL_DEFINITIONS.find(
  (d) => d.semantics === EXECUTIVE_TREND_SEMANTICS.NEUTRAL
);
ok("higher_is_better signal defined", Boolean(higherBetter));
ok("lower_is_better signal defined", Boolean(lowerBetter));
ok("neutral signal defined", Boolean(neutral));
ok(
  "describeExecutiveRelevance higher up",
  describeExecutiveRelevance(EXECUTIVE_TREND_DIRECTIONS.UP, EXECUTIVE_TREND_SEMANTICS.HIGHER_IS_BETTER).includes("maior-is-melhor")
);
ok(
  "describeExecutiveRelevance lower down",
  describeExecutiveRelevance(EXECUTIVE_TREND_DIRECTIONS.DOWN, EXECUTIVE_TREND_SEMANTICS.LOWER_IS_BETTER).includes("menor-is-melhor")
);
ok(
  "describeExecutiveRelevance neutral",
  describeExecutiveRelevance(EXECUTIVE_TREND_DIRECTIONS.UP, EXECUTIVE_TREND_SEMANTICS.NEUTRAL).includes("neutra")
);

// ── Contract mapping ─────────────────────────────────────────────────
const output = generateExecutiveAnalysisTrends(analysisInput);
ok(
  "output status trends_ready or no_trends",
  ["trends_ready", "no_trends"].includes(output.status)
);
ok("output has trends", output.trends.length > 0);
ok("output no insights", output.insights.length === 0);
ok("output no alerts", output.alerts.length === 0);
ok("output no recommendations", output.recommendations.length === 0);
ok("output summary null in trends-only", output.summary === null);

for (const key of EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS) {
  ok(`output required key ${key}`, Object.prototype.hasOwnProperty.call(output, key));
}

const trend = output.trends[0];
ok("trend has trend_id", typeof trend.trend_id === "string");
ok("trend has metric_label", typeof trend.metric_label === "string" && trend.metric_label.length > 0);
ok("trend has direction", typeof trend.direction === "string");

for (const key of EXECUTIVE_CONFIDENCE_REQUIRED_KEYS) {
  ok(`trend confidence key ${key}`, Object.prototype.hasOwnProperty.call(trend.confidence, key));
}

if (trend.evidence.length > 0) {
  for (const key of EXECUTIVE_EVIDENCE_REQUIRED_KEYS) {
    ok(`trend evidence key ${key}`, Object.prototype.hasOwnProperty.call(trend.evidence[0], key));
  }
}

// ── Magnitude, confidence, evidence, limitations on records ───────────
const confirmedTrend = trendRecords.find((t) => t.status === EXECUTIVE_TREND_STATUSES.CONFIRMED);
ok("confirmed trend has magnitude", Boolean(confirmedTrend?.magnitude));
ok("confirmed trend has confidence", Boolean(confirmedTrend?.confidence?.level));
ok("confirmed trend has evidence", Array.isArray(confirmedTrend?.evidence) && confirmedTrend.evidence.length > 0);
ok("confirmed trend has limitations array", Array.isArray(confirmedTrend?.limitations));

// ── No causality language ────────────────────────────────────────────
const causalPattern = /\bporque\b|\bcausad[oa]\b|\bdevido a\b|\bresultado de\b/i;
ok(
  "trends avoid causal language",
  trendRecords.every((t) => !causalPattern.test(t.interpretation))
);
ok("containsCausalLanguage detects porque", containsCausalLanguage("Isso aconteceu porque X"));
ok("containsCausalLanguage clean text", !containsCausalLanguage("Alta moderada em relação ao período anterior."));

// ── Determinism ──────────────────────────────────────────────────────
const run1 = JSON.stringify(buildExecutiveStructuredTrends(analysisInput));
const run2 = JSON.stringify(buildExecutiveStructuredTrends(analysisInput));
ok("determinism structured trends", run1 === run2);

const out1 = JSON.stringify(generateExecutiveAnalysisTrends(analysisInput));
const out2 = JSON.stringify(generateExecutiveAnalysisTrends(analysisInput));
ok("determinism analysis output", out1 === out2);

// ── Insufficient data ────────────────────────────────────────────────
const emptyOutput = generateExecutiveAnalysisTrends({ ...analysisInput, executive_views: {} });
ok("empty modules no trends", emptyOutput.trends.length === 0);
ok(
  "empty modules status no_trends or insufficient",
  emptyOutput.status === "no_trends" || emptyOutput.confidence.level === "insufficient_data"
);

// ── No period compare ────────────────────────────────────────────────
const noCompareViews = {
  ...moduleViews,
  growth: {
    ...moduleViews.growth,
    meta: { ...moduleViews.growth.meta, period_compare_available: false },
  },
};
const noCompareSignals = collectTemporalSignals(
  collectExecutiveTrendInput({ ...analysisInput, executive_views: noCompareViews })
);
const growthNoCompare = noCompareSignals.find((s) => s.signal_key === "growth.user_growth");
const noCompareStatus = validateTemporalSignal(growthNoCompare);
ok("no period compare insufficient", noCompareStatus.status === EXECUTIVE_TREND_STATUSES.INSUFFICIENT);
ok("no period compare limitation", noCompareStatus.limitations.includes("no_period_compare"));

// ── Deduplication scenario ───────────────────────────────────────────
const dupCandidates = [
  {
    trend_id: "a",
    dedup_group: "g1",
    trend_type: "growth",
    direction: "up",
    metric_label: "Metric A",
    priority: 2,
    period: analysisInput.period,
  },
  {
    trend_id: "b",
    dedup_group: "g1",
    trend_type: "growth",
    direction: "up",
    metric_label: "Metric B",
    priority: 1,
    period: analysisInput.period,
  },
];
const dedupResult = deduplicateExecutiveTrends(dupCandidates);
ok("dedup keeps lower priority number", dedupResult.length === 1 && dedupResult[0].priority === 1);

// ── Combined C.2 + C.3 + C.4 ───────────────────────────────────────
const combined = generateExecutiveAnalysisWithSummaryInsightsAndTrends(analysisInput);
ok("combined has summary", combined.summary != null);
ok("combined has insights", combined.insights.length > 0);
ok("combined has trends", combined.trends.length > 0);
ok("combined status analysis_ready", combined.status === "analysis_ready");
ok("combined no alerts", combined.alerts.length === 0);
ok("combined no recommendations", combined.recommendations.length === 0);

const insightsOnly = generateExecutiveAnalysisInsights(analysisInput);
ok("C.3 insights still works", insightsOnly.insights.length > 0);
ok("C.3 insights trends empty", insightsOnly.trends.length === 0);

const summaryOnly = generateExecutiveAnalysisSummary(analysisInput);
ok("C.2 summary still works", summaryOnly.summary != null);

// ── Decline scenario ─────────────────────────────────────────────────
const declineExecutive = {
  ...mockExecutive,
  platform: { total_sessions: 300, conversations: 120, questions: 200, unique_visitors: 80 },
};
const declinePrevious = {
  platform: { total_sessions: 500, questions: 350, conversations: 200 },
  recommendation: mockExecutivePrevious.recommendation,
  commerce: mockExecutivePrevious.commerce,
  alerts: mockExecutivePrevious.alerts,
  partial_errors: [],
};
const declineTemporal = {
  ...mockTemporal,
  growth: {
    series: [
      { crescimento_dau_visitors_pct: -0.06, crescimento_wau_visitors_pct: -0.04 },
      { crescimento_dau_visitors_pct: -0.02 },
    ],
  },
};
const declineViews = {
  ...moduleViews,
  growth: mapExecutiveGrowthToFounderDisplay(declineExecutive, declinePrevious, declineTemporal),
};
const declineInput = { ...analysisInput, executive_views: declineViews };
const declineTrends = buildExecutiveStructuredTrends(declineInput).trends;
ok(
  "decline scenario produces decline trends",
  declineTrends.some((t) => t.trend_type === EXECUTIVE_TREND_TYPES.DECLINE || t.direction === "down")
);

// ── Stability scenario ───────────────────────────────────────────────
const stableTemporal = {
  ...mockTemporal,
  growth: {
    series: [
      { crescimento_dau_visitors_pct: 0.005, crescimento_wau_visitors_pct: 0.004 },
      { crescimento_dau_visitors_pct: 0.004 },
    ],
  },
};
const stableExecutive = {
  ...mockExecutive,
  platform: { total_sessions: 402, conversations: 161, questions: 281, unique_visitors: 120 },
};
const stablePrevious = {
  platform: { total_sessions: 400, questions: 280, conversations: 160 },
  recommendation: mockExecutivePrevious.recommendation,
  commerce: mockExecutivePrevious.commerce,
  alerts: mockExecutivePrevious.alerts,
  partial_errors: [],
};
const stableViews = {
  ...moduleViews,
  growth: mapExecutiveGrowthToFounderDisplay(stableExecutive, stablePrevious, stableTemporal),
};
const stableTrends = buildExecutiveStructuredTrends({ ...analysisInput, executive_views: stableViews }).trends;
ok(
  "stability scenario produces stability or negligible",
  stableTrends.some(
    (t) =>
      t.trend_type === EXECUTIVE_TREND_TYPES.STABILITY ||
      t.direction === EXECUTIVE_TREND_DIRECTIONS.STABLE ||
      t.magnitude === EXECUTIVE_TREND_MAGNITUDES.NEGLIGIBLE
  )
);

// ── mapStructuredTrendToExecutiveTrend ───────────────────────────────
const mapped = mapStructuredTrendToExecutiveTrend(structured[0]);
ok("mapped trend has trend_id", Boolean(mapped.trend_id));
ok("mapped trend has change_pct", "change_pct" in mapped);

// ── normalizeViewDirection ───────────────────────────────────────────
ok("normalizeViewDirection accelerating", normalizeViewDirection("accelerating") === "up");
ok("normalizeViewDirection decelerating", normalizeViewDirection("decelerating") === "down");

// ── buildTrendInterpretation no causality ────────────────────────────
const interp = buildTrendInterpretation({
  metric_label: "Test Metric",
  magnitude: "moderate",
  direction: "up",
  trend_type: "growth",
  status: "confirmed",
  period: analysisInput.period,
  period_label: "30d",
});
ok("interpretation built", interp.length > 0);
ok("interpretation no causality", !containsCausalLanguage(interp));

// ── classifyTrendConfidence ──────────────────────────────────────────
const confConfirmed = classifyTrendConfidence(
  EXECUTIVE_TREND_STATUSES.CONFIRMED,
  EXECUTIVE_TREND_MAGNITUDES.STRONG,
  [],
  true
);
ok("confidence high for confirmed strong", confConfirmed.level === "high");

const confInsufficient = classifyTrendConfidence(EXECUTIVE_TREND_STATUSES.INSUFFICIENT, "unknown", [], false);
ok("confidence insufficient without compare", confInsufficient.level === "insufficient_data");

// ── Baseline preserved ───────────────────────────────────────────────
ok("B.7 mapper unchanged", read("lib/miaFounderExecutiveSummaryDisplay.js").includes('"B.7.0"'));
ok("no trend UI in cockpit", !read("components/founder-cockpit/FounderCockpitPage.jsx").includes("miaExecutiveTrendBuilder"));

const doc = read("docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md");
ok("doc mentions C.4", doc.includes("C.4"));
ok(
  "doc mentions Trend Generator",
  doc.includes("Trend Generator") || doc.includes("Executive Trend")
);

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_C_4_TRENDS_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "C.4",
      title: "PATCH C.4 — Executive Trends Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      builder_version: MIA_EXECUTIVE_TREND_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_TREND_CATALOG_VERSION,
      contracts_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
      signal_count: EXECUTIVE_TREND_SIGNAL_DEFINITIONS.length,
      blocked_types: EXECUTIVE_TREND_TYPES_BLOCKED,
      pipeline: ["collect", "validate", "evaluate", "deduplicate", "narrative"],
      scope: "Deterministic executive trends from Baseline B views only",
      excludes: ["alerts", "recommendations", "LLM"],
      baseline_c3_preserved: true,
      baseline_c2_preserved: true,
      baseline_c1_preserved: true,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
