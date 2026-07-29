#!/usr/bin/env node
/**
 * PATCH C.6 — Executive Recommendation Generator audit.
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
  MIA_EXECUTIVE_RECOMMENDATION_CATALOG_VERSION,
  EXECUTIVE_RECOMMENDATION_RULES,
  EXECUTIVE_RECOMMENDATION_TYPES,
  EXECUTIVE_RECOMMENDATION_PRIORITIES,
  EXECUTIVE_RECOMMENDATION_EMPTY_MESSAGES,
} from "../lib/miaExecutiveRecommendationCatalog.js";
import {
  calculateRecommendationPriority,
  consolidateRecommendationConfidence,
  passesRecommendationConfidenceGate,
  containsSpeculativeLanguage,
  containsRecommendationCausality,
  compareRecommendationsForOrdering,
  meetsRecommendationMinConfidence,
} from "../lib/miaExecutiveRecommendationRules.js";
import {
  collectRecommendationCandidates,
  suppressRedundantRecommendations,
  deduplicateExecutiveRecommendations,
  buildExecutiveStructuredRecommendations,
  generateExecutiveAnalysisRecommendations,
  generateExecutiveAnalysisComplete,
  mapStructuredRecommendationToExecutiveRecommendation,
  MIA_EXECUTIVE_RECOMMENDATION_BUILDER_VERSION,
} from "../lib/miaExecutiveRecommendationBuilder.js";
import {
  generateExecutiveAnalysisWithSummaryInsightsTrendsAndAlerts,
  MIA_EXECUTIVE_ALERT_BUILDER_VERSION,
} from "../lib/miaExecutiveAlertBuilder.js";
import {
  generateExecutiveAnalysisInsights,
  MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION,
} from "../lib/miaExecutiveInsightBuilder.js";
import {
  generateExecutiveAnalysisSummary,
  MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION,
} from "../lib/miaExecutiveSummaryBuilder.js";
import { MIA_EXECUTIVE_TREND_BUILDER_VERSION } from "../lib/miaExecutiveTrendBuilder.js";
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

console.log("\nPATCH C.6 — Executive Recommendation Generator audit\n");

ok("catalog exists", existsSync(join(ROOT, "lib/miaExecutiveRecommendationCatalog.js")));
ok("rules exists", existsSync(join(ROOT, "lib/miaExecutiveRecommendationRules.js")));
ok("builder exists", existsSync(join(ROOT, "lib/miaExecutiveRecommendationBuilder.js")));
ok("catalog version C.6.0", MIA_EXECUTIVE_RECOMMENDATION_CATALOG_VERSION === "C.6.0");
ok("builder version C.6.0", MIA_EXECUTIVE_RECOMMENDATION_BUILDER_VERSION === "C.6.0");
ok("recommendation rules defined", EXECUTIVE_RECOMMENDATION_RULES.length >= 10);

const builderSrc = read("lib/miaExecutiveRecommendationBuilder.js");
for (const [name, src] of [
  ["builder", builderSrc],
  ["catalog", read("lib/miaExecutiveRecommendationCatalog.js")],
  ["rules", read("lib/miaExecutiveRecommendationRules.js")],
]) {
  ok(`${name} no supabase`, !/supabase|createClient/.test(src));
  ok(`${name} no SQL`, !/SELECT\s|FROM\s+mia_|\.rpc\(/.test(src));
  ok(`${name} no fetch`, !/\bfetch\s*\(/.test(src));
  ok(`${name} no OpenAI/LLM`, !/openai|chat\.completions|verbalizeExecutive/.test(src));
}

ok("C.1 contracts unchanged", MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION === "C.1.0");
ok("C.1 output template pending", EXECUTIVE_ANALYSIS_OUTPUT_TEMPLATE.status === "pending");
ok("C.2 intact", MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION === "C.2.0");
ok("C.3 intact", MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION === "C.3.0");
ok("C.4 intact", MIA_EXECUTIVE_TREND_BUILDER_VERSION === "C.4.0");
ok("C.5 intact", MIA_EXECUTIVE_ALERT_BUILDER_VERSION === "C.5.0");

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
  user_value: { average_user_value: 0.68 },
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
  partial_errors: [],
  growth: {
    series: [
      { crescimento_dau_visitors_pct: 0.08, crescimento_wau_visitors_pct: 0.05 },
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

function buildViews(executive = mockExecutive, previous = mockExecutivePrevious, temporal = mockTemporal) {
  return {
    kpis: mapExecutiveMetricsToFounderExecutiveKpis(executive, temporal),
    growth: mapExecutiveGrowthToFounderDisplay(executive, previous, temporal),
    health: mapExecutiveProductHealthToFounderDisplay(executive, previous),
    commercial: mapExecutiveCommercialPerformanceToFounderDisplay(executive, previous, temporal),
    operational: mapExecutiveOperationalToFounderDisplay(executive, temporal),
  };
}

const moduleViews = buildViews();
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

const { recommendations: structuredRecs } = buildExecutiveStructuredRecommendations(analysisInput);
ok("structured recommendations present", structuredRecs.length > 0, `count=${structuredRecs.length}`);
ok("optimize recommendation", structuredRecs.some((r) => r.recommendation_type === EXECUTIVE_RECOMMENDATION_TYPES.OPTIMIZE));
ok("recommendation has rationale", Boolean(structuredRecs[0]?.rationale));
ok("recommendation has expected_outcome", Boolean(structuredRecs[0]?.expected_outcome));
ok("recommendation has review_after", Boolean(structuredRecs[0]?.review_after));
ok("recommendation has evidence", structuredRecs[0]?.evidence?.length > 0);
ok("recommendation has source_alerts", structuredRecs.some((r) => r.source_alerts.length > 0));

const recOutput = generateExecutiveAnalysisRecommendations(analysisInput);
ok("output recommendations array", Array.isArray(recOutput.recommendations));
ok("output alerts empty in recs-only", recOutput.alerts.length === 0);
ok("meta recommendation_records", Array.isArray(recOutput.meta.recommendation_records));

for (const key of EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS) ok(`output key ${key}`, key in recOutput);
if (recOutput.recommendations[0]) {
  ok("mapped headline", Boolean(recOutput.recommendations[0].headline));
  ok("mapped rationale", Boolean(recOutput.recommendations[0].rationale));
  ok("mapped priority", Boolean(recOutput.recommendations[0].priority));
}

const criticalExecutive = {
  ...mockExecutive,
  partial_errors: [
    { group: "a" },
    { group: "b" },
    { group: "c" },
    { group: "d" },
  ],
  performance: { total_duration_ms: 9000 },
};
const criticalRecs = buildExecutiveStructuredRecommendations({
  ...analysisInput,
  executive_views: buildViews(criticalExecutive),
}).recommendations;
ok("investigate P0", criticalRecs.some((r) => r.recommendation_type === EXECUTIVE_RECOMMENDATION_TYPES.INVESTIGATE && r.priority === EXECUTIVE_RECOMMENDATION_PRIORITIES.P0));

const stableTemporal = {
  ...mockTemporal,
  conversion: {
    summary: { taxa_clique_recomendacao: 0.04, eventos_recomendacoes: 280, eventos_cliques: 45 },
    bottlenecks: [],
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
const stableRecs = buildExecutiveStructuredRecommendations({
  ...analysisInput,
  executive_views: buildViews(stableExecutive, stablePrevious, stableTemporal),
}).recommendations;
ok(
  "no_action or monitor on stable",
  stableRecs.some(
    (r) =>
      r.recommendation_type === EXECUTIVE_RECOMMENDATION_TYPES.NO_ACTION ||
      r.recommendation_type === EXECUTIVE_RECOMMENDATION_TYPES.MONITOR
  )
);

const lowVolumeExecutive = {
  ...mockExecutive,
  recommendation: { recommendations_generated: 2, recommendation_acceptance_rate: 0.5, rejection_rate: 0.1 },
  commerce: { offers_returned: 1, offer_clicks: 0, favorite_count: 1, offer_sets_generated: 2 },
};
const lowVolumeRecs = buildExecutiveStructuredRecommendations({
  ...analysisInput,
  executive_views: buildViews(lowVolumeExecutive),
}).recommendations;
ok(
  "collect_more_data recommendation",
  lowVolumeRecs.some((r) => r.recommendation_type === EXECUTIVE_RECOMMENDATION_TYPES.COLLECT_MORE_DATA)
);

const emptyRecs = generateExecutiveAnalysisRecommendations({ ...analysisInput, executive_views: {} });
ok("empty modules no recommendations", emptyRecs.recommendations.length === 0);

ok("priority P1 for alert-driven", calculateRecommendationPriority(EXECUTIVE_RECOMMENDATION_PRIORITIES.P2, "P1", 1) === EXECUTIVE_RECOMMENDATION_PRIORITIES.P1);
ok("confidence gate P0", passesRecommendationConfidenceGate("P0", { level: "moderate" }));
ok("confidence gate blocks insufficient", !passesRecommendationConfidenceGate("P1", { level: "insufficient_data" }));
ok("consolidate confidence high", consolidateRecommendationConfidence([{ level: "high", factors: [], limitations: [] }]).level === "high");
ok("speculation blocklist", containsSpeculativeLanguage("Talvez seja necessário"));
ok("causality blocklist on metric text", containsRecommendationCausality("Queda causada por abandono"));

const dupCandidates = [
  {
    recommendation_id: "a",
    recommendation_key: "test.a",
    dedup_group: "g1",
    priority: "P2",
    period: analysisInput.period,
    source_alerts: ["a1"],
    source_insights: [],
    source_trends: [],
    evidence: [{ evidence_id: "e1" }],
    modules_involved: ["growth"],
  },
  {
    recommendation_id: "b",
    recommendation_key: "test.b",
    dedup_group: "g1",
    priority: "P1",
    period: analysisInput.period,
    source_alerts: ["a2"],
    source_insights: [],
    source_trends: [],
    evidence: [{ evidence_id: "e2" }],
    modules_involved: ["commercial"],
  },
];
const deduped = deduplicateExecutiveRecommendations(dupCandidates);
ok("dedup keeps higher priority", deduped.length === 1 && deduped[0].priority === "P1");

const suppressed = suppressRedundantRecommendations([
  { source_alerts: ["x"], priority: "P1", recommendation_type: "optimize" },
  { source_alerts: [], priority: "P3", recommendation_type: "monitor" },
]);
ok("suppress redundant P3 monitor", suppressed.length === 1);

for (const rec of structuredRecs) {
  ok(`no speculation: ${rec.recommendation_key}`, !containsSpeculativeLanguage(rec.rationale));
}

const out1 = JSON.stringify(generateExecutiveAnalysisRecommendations(analysisInput));
const out2 = JSON.stringify(generateExecutiveAnalysisRecommendations(analysisInput));
ok("determinism", out1 === out2);

const complete = generateExecutiveAnalysisComplete(analysisInput);
ok("complete has summary", complete.summary != null);
ok("complete has insights", complete.insights.length > 0);
ok("complete has trends", complete.trends.length > 0);
ok("complete has alerts", complete.alerts.length > 0);
ok("complete has recommendations", complete.recommendations.length > 0);
ok("complete status analysis_complete", complete.status === "analysis_complete");

const c5Combined = generateExecutiveAnalysisWithSummaryInsightsTrendsAndAlerts(analysisInput);
ok("C.5 combined still no recommendations", c5Combined.recommendations.length === 0);
ok("C.3 still works", generateExecutiveAnalysisInsights(analysisInput).insights.length > 0);
ok("C.2 still works", generateExecutiveAnalysisSummary(analysisInput).summary != null);

const types = new Set(EXECUTIVE_RECOMMENDATION_RULES.map((r) => r.recommendation_type));
ok("type investigate defined", types.has(EXECUTIVE_RECOMMENDATION_TYPES.INVESTIGATE));
ok("type monitor defined", types.has(EXECUTIVE_RECOMMENDATION_TYPES.MONITOR));
ok("type validate defined", types.has(EXECUTIVE_RECOMMENDATION_TYPES.VALIDATE));
ok("type optimize defined", types.has(EXECUTIVE_RECOMMENDATION_TYPES.OPTIMIZE));
ok("type expand defined", types.has(EXECUTIVE_RECOMMENDATION_TYPES.EXPAND));
ok("type reduce_risk defined", types.has(EXECUTIVE_RECOMMENDATION_TYPES.REDUCE_RISK));
ok("type improve_quality defined", types.has(EXECUTIVE_RECOMMENDATION_TYPES.IMPROVE_QUALITY));
ok("type collect_more_data defined", types.has(EXECUTIVE_RECOMMENDATION_TYPES.COLLECT_MORE_DATA));
ok("type no_action defined", types.has(EXECUTIVE_RECOMMENDATION_TYPES.NO_ACTION));

const mapped = mapStructuredRecommendationToExecutiveRecommendation(structuredRecs[0]);
ok("mapped recommendation_id", Boolean(mapped.recommendation_id));

const ordered = [...structuredRecs].sort(compareRecommendationsForOrdering);
ok("ordering stable", JSON.stringify(ordered.map((r) => r.priority)) === JSON.stringify([...structuredRecs].sort(compareRecommendationsForOrdering).map((r) => r.priority)));

const evidence = {
  patch: "C.6",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  catalog_version: MIA_EXECUTIVE_RECOMMENDATION_CATALOG_VERSION,
  builder_version: MIA_EXECUTIVE_RECOMMENDATION_BUILDER_VERSION,
  rules_count: EXECUTIVE_RECOMMENDATION_RULES.length,
  supported_types: Object.values(EXECUTIVE_RECOMMENDATION_TYPES),
  checks_passed: checks.filter((c) => c.pass).length,
  checks_total: checks.length,
  validated_at: new Date().toISOString(),
};
writeFileSync(join(ROOT, "docs/analytics/PATCH_C_6_RECOMMENDATIONS_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} checks passed`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.label}`);
  process.exit(1);
}
console.log("\nPATCH C.6 recommendations audit APPROVED\n");
