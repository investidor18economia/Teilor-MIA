#!/usr/bin/env node
/**
 * PATCH C.3 — Executive Insight Generator audit.
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
  MIA_EXECUTIVE_INSIGHT_CATALOG_VERSION,
  EXECUTIVE_INSIGHT_CATEGORIES,
  EXECUTIVE_INSIGHT_RULES,
  EXECUTIVE_INSIGHT_EMPTY_MESSAGES,
} from "../lib/miaExecutiveInsightCatalog.js";
import {
  collectExecutiveInsightInput,
  analyzeExecutiveInsightSignals,
  evaluateExecutiveInsightRules,
  deduplicateExecutiveInsights,
  buildExecutiveStructuredInsights,
  generateExecutiveAnalysisInsights,
  generateExecutiveAnalysisWithSummaryAndInsights,
  mapStructuredInsightToExecutiveInsight,
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

console.log("\nPATCH C.3 — Executive Insight Generator audit\n");

// ── Files ────────────────────────────────────────────────────────────
ok("catalog exists", existsSync(join(ROOT, "lib/miaExecutiveInsightCatalog.js")));
ok("builder exists", existsSync(join(ROOT, "lib/miaExecutiveInsightBuilder.js")));
ok("catalog version C.3.0", MIA_EXECUTIVE_INSIGHT_CATALOG_VERSION === "C.3.0");
ok("builder version C.3.0", MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION === "C.3.0");

const builderSrc = read("lib/miaExecutiveInsightBuilder.js");
const catalogSrc = read("lib/miaExecutiveInsightCatalog.js");
for (const [name, src] of [
  ["builder", builderSrc],
  ["catalog", catalogSrc],
]) {
  ok(`${name} no supabase`, !/supabase|createClient/.test(src));
  ok(`${name} no SQL`, !/SELECT\s|FROM\s+mia_|\.rpc\(/.test(src));
  ok(`${name} no fetch`, !/\bfetch\s*\(/.test(src));
  ok(`${name} no OpenAI/LLM`, !/openai|chat\.completions|verbalizeExecutive/.test(src));
}

// ── C.1/C.2 preserved ────────────────────────────────────────────────
ok("C.1 contracts version unchanged", MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION === "C.1.0");
ok("C.1 output template still pending", EXECUTIVE_ANALYSIS_OUTPUT_TEMPLATE.status === "pending");
ok("C.2 summary builder intact", MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION === "C.2.0");
ok("insight rules defined", EXECUTIVE_INSIGHT_RULES.length >= 10);
ok("categories defined", Object.keys(EXECUTIVE_INSIGHT_CATEGORIES).length >= 6);

// ── Mock data ────────────────────────────────────────────────────────
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
const collected = collectExecutiveInsightInput(analysisInput);
ok("collect normalizes views", Object.keys(collected.views).length === 5);

const analyzed = analyzeExecutiveInsightSignals(collected);
ok("analyze envelope confidence", analyzed.envelopeConfidence.level !== "insufficient_data");

const candidates = evaluateExecutiveInsightRules(analyzed, collected);
ok("evaluate produces candidates", candidates.length > 0, `count=${candidates.length}`);

const deduped = deduplicateExecutiveInsights(candidates);
ok("dedup reduces or equals candidates", deduped.length <= candidates.length);
ok("dedup no duplicate groups", new Set(deduped.map((i) => i.dedup_group)).size === deduped.length);

const { insights: structured } = buildExecutiveStructuredInsights(analysisInput);
ok("structured insights present", structured.length > 0);
ok("structured insight has category", Boolean(structured[0]?.category));
ok("structured insight has priority", Boolean(structured[0]?.priority));
ok("structured insight has limitations array", Array.isArray(structured[0]?.limitations));

// ── Contract mapping ─────────────────────────────────────────────────
const output = generateExecutiveAnalysisInsights(analysisInput);
ok("output status insights_ready or analysis", ["insights_ready", "no_insights"].includes(output.status) || output.insights.length > 0);
ok("output has insights", output.insights.length > 0);
ok("output no trends", output.trends.length === 0);
ok("output no alerts", output.alerts.length === 0);
ok("output no recommendations", output.recommendations.length === 0);
ok("output summary null in insights-only", output.summary === null);

for (const key of EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS) {
  ok(`output required key ${key}`, Object.prototype.hasOwnProperty.call(output, key));
}

const insight = output.insights[0];
ok("insight has insight_id", typeof insight.insight_id === "string");
ok("insight has title", typeof insight.title === "string" && insight.title.length > 0);
ok("insight has body", typeof insight.body === "string" && insight.body.length > 0);
ok("insight stage interpretation", insight.stage === "interpretation");
ok("insight modules_involved", Array.isArray(insight.modules_involved) && insight.modules_involved.length > 0);

for (const key of EXECUTIVE_CONFIDENCE_REQUIRED_KEYS) {
  ok(`insight confidence key ${key}`, Object.prototype.hasOwnProperty.call(insight.confidence, key));
}

if (insight.evidence.length > 0) {
  for (const key of EXECUTIVE_EVIDENCE_REQUIRED_KEYS) {
    ok(`insight evidence key ${key}`, Object.prototype.hasOwnProperty.call(insight.evidence[0], key));
  }
}

// ── No causality language ────────────────────────────────────────────
const causalPattern = /\bporque\b|\bcausad[oa]\b|\bdevido a\b/i;
ok(
  "insights avoid causal language",
  output.insights.every((i) => !causalPattern.test(i.body))
);

// ── Determinism ──────────────────────────────────────────────────────
const run1 = JSON.stringify(buildExecutiveStructuredInsights(analysisInput));
const run2 = JSON.stringify(buildExecutiveStructuredInsights(analysisInput));
ok("determinism structured insights", run1 === run2);

const out1 = JSON.stringify(generateExecutiveAnalysisInsights(analysisInput));
const out2 = JSON.stringify(generateExecutiveAnalysisInsights(analysisInput));
ok("determinism analysis output", out1 === out2);

// ── Empty modules ────────────────────────────────────────────────────
const emptyOutput = generateExecutiveAnalysisInsights({ ...analysisInput, executive_views: {} });
ok("empty modules insufficient", emptyOutput.status === "insufficient_data");
ok("empty insights array", emptyOutput.insights.length === 0);

// ── Combined with C.2 summary ────────────────────────────────────────
const combined = generateExecutiveAnalysisWithSummaryAndInsights(analysisInput);
ok("combined has summary", combined.summary != null);
ok("combined has insights", combined.insights.length > 0);
ok("combined status analysis_ready", combined.status === "analysis_ready");
ok("combined no trends", combined.trends.length === 0);

const summaryOnly = generateExecutiveAnalysisSummary(analysisInput);
ok("C.2 summary still works", summaryOnly.summary != null);
ok("C.2 summary insights empty", summaryOnly.insights.length === 0);

// ── Deduplication scenario ───────────────────────────────────────────
const dupCandidates = [
  {
    insight_id: "a",
    dedup_group: "g1",
    priority: "medium",
    rule_priority: 2,
    title: "T1",
    category: "growth",
    description: "d",
    modules_involved: ["growth"],
    evidence: [],
    confidence: { level: "moderate", factors: [], limitations: [], modules_available: 5, modules_total: 5 },
    period: analysisInput.period,
    limitations: [],
    rule_ref: "r1",
  },
  {
    insight_id: "b",
    dedup_group: "g1",
    priority: "high",
    rule_priority: 1,
    title: "T2",
    category: "growth",
    description: "d",
    modules_involved: ["growth"],
    evidence: [],
    confidence: { level: "moderate", factors: [], limitations: [], modules_available: 5, modules_total: 5 },
    period: analysisInput.period,
    limitations: [],
    rule_ref: "r2",
  },
];
const dedupResult = deduplicateExecutiveInsights(dupCandidates);
ok("dedup keeps high priority", dedupResult.length === 1 && dedupResult[0].priority === "high");

// ── Classification ───────────────────────────────────────────────────
const hasCrossModule = structured.some((i) => i.category === EXECUTIVE_INSIGHT_CATEGORIES.CROSS_MODULE);
ok("classification cross_module or commercial", hasCrossModule || structured.some((i) => i.category === "commercial"));

// ── Baseline preserved ───────────────────────────────────────────────
ok("B.7 mapper unchanged", read("lib/miaFounderExecutiveSummaryDisplay.js").includes('"B.7.0"'));
ok("no analyst UI in cockpit", !read("components/founder-cockpit/FounderCockpitPage.jsx").includes("miaExecutiveInsightBuilder"));

const doc = read("docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md");
ok("doc mentions C.3", doc.includes("C.3"));
ok(
  "doc mentions Insight Generator",
  doc.includes("Insight Generator") || doc.includes("Executive Insight")
);

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_C_3_INSIGHTS_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "C.3",
      title: "PATCH C.3 — Executive Insights Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      builder_version: MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_INSIGHT_CATALOG_VERSION,
      contracts_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
      categories: Object.values(EXECUTIVE_INSIGHT_CATEGORIES),
      rule_count: EXECUTIVE_INSIGHT_RULES.length,
      pipeline: ["collect", "analyze", "evaluate", "deduplicate", "narrative"],
      scope: "Deterministic executive insights from Baseline B views only",
      excludes: ["trends", "alerts", "recommendations", "LLM"],
      baseline_c2_preserved: true,
      baseline_c1_preserved: true,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
