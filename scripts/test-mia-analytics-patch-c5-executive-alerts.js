#!/usr/bin/env node
/**
 * PATCH C.5 — Executive Alert Generator audit.
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
  MIA_EXECUTIVE_ALERT_CATALOG_VERSION,
  EXECUTIVE_ALERT_RULES,
  EXECUTIVE_ALERT_CATEGORIES,
  EXECUTIVE_ALERT_SEVERITIES,
  EXECUTIVE_ALERT_URGENCIES,
  EXECUTIVE_ALERT_PRIORITIES,
  EXECUTIVE_ALERT_STATUSES,
  EXECUTIVE_ALERT_SOURCE_TYPES,
  EXECUTIVE_ALERT_EMPTY_MESSAGES,
} from "../lib/miaExecutiveAlertCatalog.js";
import {
  calculateAlertPriority,
  calculateAlertUrgency,
  passesConfidenceGate,
  adjustSeverityForConfidence,
  shouldSuppressNoise,
  containsCausalLanguage,
  containsRecommendationLanguage,
  isTrendEligibleForAlert,
  compareAlertsForOrdering,
  deriveAlertStatus,
} from "../lib/miaExecutiveAlertRules.js";
import {
  collectExecutiveAlertInput,
  collectAlertCandidates,
  applyAlertNoiseSuppression,
  deduplicateExecutiveAlerts,
  applySuperiorAlertSuppression,
  buildExecutiveStructuredAlerts,
  generateExecutiveAnalysisAlerts,
  generateExecutiveAnalysisWithSummaryInsightsTrendsAndAlerts,
  mapStructuredAlertToExecutiveAlert,
  MIA_EXECUTIVE_ALERT_BUILDER_VERSION,
} from "../lib/miaExecutiveAlertBuilder.js";
import {
  generateExecutiveAnalysisWithSummaryInsightsAndTrends,
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
import { EXECUTIVE_TREND_TYPES, EXECUTIVE_TREND_STATUSES } from "../lib/miaExecutiveTrendCatalog.js";
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

console.log("\nPATCH C.5 — Executive Alert Generator audit\n");

// ── Files ────────────────────────────────────────────────────────────
ok("catalog exists", existsSync(join(ROOT, "lib/miaExecutiveAlertCatalog.js")));
ok("rules exists", existsSync(join(ROOT, "lib/miaExecutiveAlertRules.js")));
ok("builder exists", existsSync(join(ROOT, "lib/miaExecutiveAlertBuilder.js")));
ok("catalog version C.5.0", MIA_EXECUTIVE_ALERT_CATALOG_VERSION === "C.5.0");
ok("builder version C.5.0", MIA_EXECUTIVE_ALERT_BUILDER_VERSION === "C.5.0");
ok("alert rules defined", EXECUTIVE_ALERT_RULES.length >= 6);

const builderSrc = read("lib/miaExecutiveAlertBuilder.js");
const catalogSrc = read("lib/miaExecutiveAlertCatalog.js");
const rulesSrc = read("lib/miaExecutiveAlertRules.js");
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

// ── C.1–C.4 preserved ────────────────────────────────────────────────
ok("C.1 contracts version unchanged", MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION === "C.1.0");
ok("C.1 output template still pending", EXECUTIVE_ANALYSIS_OUTPUT_TEMPLATE.status === "pending");
ok("C.2 summary builder intact", MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION === "C.2.0");
ok("C.3 insight builder intact", MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION === "C.3.0");
ok("C.4 trend builder intact", MIA_EXECUTIVE_TREND_BUILDER_VERSION === "C.4.0");

// ── Mock fixtures ────────────────────────────────────────────────────
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

// ── Pipeline ─────────────────────────────────────────────────────────
const collected = collectExecutiveAlertInput(analysisInput);
ok("collect normalizes views", Object.keys(collected.views).length === 5);

const { alerts: structuredAlerts } = buildExecutiveStructuredAlerts(analysisInput);
ok("structured alerts present", structuredAlerts.length > 0, `count=${structuredAlerts.length}`);
ok(
  "commercial bottleneck alert",
  structuredAlerts.some((a) => a.alert_key === "commercial.bottleneck")
);
ok("alert has severity", Boolean(structuredAlerts[0]?.severity));
ok("alert has urgency", Boolean(structuredAlerts[0]?.urgency));
ok("alert has priority", Boolean(structuredAlerts[0]?.priority));
ok("alert has evidence", structuredAlerts[0]?.evidence?.length > 0);
ok("alert has triggered_rules", structuredAlerts[0]?.triggered_rules?.length > 0);

const alertOutput = generateExecutiveAnalysisAlerts(analysisInput);
ok("output has alerts array", Array.isArray(alertOutput.alerts));
ok("output recommendations empty", alertOutput.recommendations.length === 0);
ok("output trends empty in alerts-only", alertOutput.trends.length === 0);
ok("meta alert_records", Array.isArray(alertOutput.meta.alert_records));

for (const key of EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS) {
  ok(`output key ${key}`, key in alertOutput);
}
for (const key of EXECUTIVE_CONFIDENCE_REQUIRED_KEYS) {
  ok(`confidence key ${key}`, key in alertOutput.confidence);
}
if (alertOutput.alerts[0]) {
  for (const key of EXECUTIVE_EVIDENCE_REQUIRED_KEYS) {
    ok(`evidence key ${key}`, key in alertOutput.alerts[0].evidence[0]);
  }
}

// ── Severity levels ──────────────────────────────────────────────────
ok("high severity alert", structuredAlerts.some((a) => a.severity === EXECUTIVE_ALERT_SEVERITIES.HIGH));

const criticalExecutive = {
  ...mockExecutive,
  partial_errors: [
    { group: "a", scope: "x" },
    { group: "b", scope: "y" },
    { group: "c", scope: "z" },
    { group: "d", scope: "w" },
  ],
  performance: { total_duration_ms: 9000 },
};
const criticalViews = buildViews(criticalExecutive);
const criticalAlerts = buildExecutiveStructuredAlerts({
  ...analysisInput,
  executive_views: criticalViews,
}).alerts;
ok(
  "critical operational alert",
  criticalAlerts.some((a) => a.severity === EXECUTIVE_ALERT_SEVERITIES.CRITICAL)
);
ok(
  "critical urgency immediate",
  criticalAlerts.some((a) => a.urgency === EXECUTIVE_ALERT_URGENCIES.IMMEDIATE)
);
ok("critical priority P0", criticalAlerts.some((a) => a.priority === EXECUTIVE_ALERT_PRIORITIES.P0));

// ── Cross-module ─────────────────────────────────────────────────────
const declineExecutive = {
  ...mockExecutive,
  platform: { total_sessions: 300, conversations: 120, questions: 200, unique_visitors: 80 },
  commerce: { offers_returned: 100, offer_clicks: 20, favorite_count: 10, offer_sets_generated: 120 },
};
const declinePrevious = {
  platform: { total_sessions: 500, questions: 350, conversations: 200 },
  recommendation: mockExecutivePrevious.recommendation,
  commerce: { offer_clicks: 45, favorite_count: 22, offers_returned: 180 },
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
  conversion: {
    ...mockTemporal.conversion,
    summary: { taxa_clique_recomendacao: 0.02, eventos_recomendacoes: 200, eventos_cliques: 20 },
  },
};
const declineViews = {
  ...moduleViews,
  growth: mapExecutiveGrowthToFounderDisplay(declineExecutive, declinePrevious, declineTemporal),
  commercial: mapExecutiveCommercialPerformanceToFounderDisplay(
    declineExecutive,
    declinePrevious,
    declineTemporal
  ),
};
const crossAlerts = buildExecutiveStructuredAlerts({
  ...analysisInput,
  executive_views: declineViews,
}).alerts;
ok(
  "cross-module or decline alert",
  crossAlerts.some(
    (a) =>
      a.category === EXECUTIVE_ALERT_CATEGORIES.CROSS_MODULE ||
      a.alert_key === "growth.decline" ||
      a.alert_key === "commercial.decline"
  )
);

// ── Data quality ─────────────────────────────────────────────────────
const sparseViews = {
  kpis: moduleViews.kpis,
  growth: null,
  health: null,
  commercial: null,
  operational: moduleViews.operational,
};
const sparseAlerts = buildExecutiveStructuredAlerts({
  ...analysisInput,
  executive_views: sparseViews,
}).alerts;
ok(
  "data quality modules missing",
  sparseAlerts.some((a) => a.category === EXECUTIVE_ALERT_CATEGORIES.DATA_QUALITY)
);

const lowVolumeExecutive = {
  ...mockExecutive,
  recommendation: { recommendations_generated: 2, recommendation_acceptance_rate: 0.5, rejection_rate: 0.1 },
  commerce: { offers_returned: 1, offer_clicks: 0, favorite_count: 1, offer_sets_generated: 2 },
};
const lowVolumeViews = buildViews(lowVolumeExecutive);
const lowVolumeAlerts = buildExecutiveStructuredAlerts({
  ...analysisInput,
  executive_views: lowVolumeViews,
}).alerts;
ok(
  "low volume data quality alert",
  lowVolumeAlerts.some((a) => a.alert_key === "commercial.low_volume") ||
    lowVolumeAlerts.some((a) => a.category === EXECUTIVE_ALERT_CATEGORIES.DATA_QUALITY)
);

// ── Empty / insufficient ─────────────────────────────────────────────
const emptyOutput = generateExecutiveAnalysisAlerts({ ...analysisInput, executive_views: {} });
ok("empty modules no alerts", emptyOutput.alerts.length === 0);
ok("empty status no_alerts", emptyOutput.status === "no_alerts");

// ── Rule unit tests ──────────────────────────────────────────────────
ok(
  "urgency differs from severity concept",
  calculateAlertUrgency(EXECUTIVE_ALERT_SEVERITIES.MEDIUM, EXECUTIVE_ALERT_URGENCIES.MONITOR) ===
    EXECUTIVE_ALERT_URGENCIES.MONITOR
);
ok(
  "priority P1 for high severity",
  calculateAlertPriority(
    EXECUTIVE_ALERT_SEVERITIES.HIGH,
    EXECUTIVE_ALERT_URGENCIES.SOON,
    { level: "moderate", factors: [], limitations: [], modules_available: 5, modules_total: 5 },
    1
  ) === EXECUTIVE_ALERT_PRIORITIES.P1
);
ok(
  "confidence gate critical",
  passesConfidenceGate(EXECUTIVE_ALERT_SEVERITIES.CRITICAL, { level: "moderate" })
);
ok(
  "confidence gate blocks insufficient",
  !passesConfidenceGate(EXECUTIVE_ALERT_SEVERITIES.HIGH, { level: "insufficient_data" })
);
ok(
  "severity downgrade on low confidence",
  adjustSeverityForConfidence(EXECUTIVE_ALERT_SEVERITIES.HIGH, { level: "low" }) ===
    EXECUTIVE_ALERT_SEVERITIES.MEDIUM
);
ok("noise suppress negligible", shouldSuppressNoise({ magnitude: "negligible" }));
ok(
  "trend eligible decline",
  isTrendEligibleForAlert(EXECUTIVE_TREND_TYPES.DECLINE, "down", "higher_is_better", "moderate", EXECUTIVE_TREND_STATUSES.CONFIRMED)
);
ok(
  "trend not eligible growth type",
  !isTrendEligibleForAlert(EXECUTIVE_TREND_TYPES.GROWTH, "up", "higher_is_better", "moderate", EXECUTIVE_TREND_STATUSES.CONFIRMED)
);

// ── Deduplication ────────────────────────────────────────────────────
const dupCandidates = [
  {
    alert_id: "a",
    alert_key: "test.a",
    dedup_group: "g1",
    severity: EXECUTIVE_ALERT_SEVERITIES.MEDIUM,
    period: analysisInput.period,
    evidence: [{ evidence_id: "e1" }],
    source_ids: ["s1"],
    modules_involved: ["growth"],
    triggered_rules: ["r1"],
    suppresses: [],
  },
  {
    alert_id: "b",
    alert_key: "test.b",
    dedup_group: "g1",
    severity: EXECUTIVE_ALERT_SEVERITIES.HIGH,
    period: analysisInput.period,
    evidence: [{ evidence_id: "e2" }],
    source_ids: ["s2"],
    modules_involved: ["commercial"],
    triggered_rules: ["r2"],
    suppresses: [],
  },
];
const deduped = deduplicateExecutiveAlerts(dupCandidates);
ok("dedup keeps higher severity", deduped.length === 1 && deduped[0].severity === EXECUTIVE_ALERT_SEVERITIES.HIGH);
ok("dedup merges evidence", deduped[0].evidence.length === 2);

// ── Superior suppression ─────────────────────────────────────────────
const parentAlert = {
  alert_key: "cross_module.deterioration",
  severity: EXECUTIVE_ALERT_SEVERITIES.HIGH,
  suppresses: ["growth.decline", "commercial.decline"],
};
const childAlert = { alert_key: "growth.decline", severity: EXECUTIVE_ALERT_SEVERITIES.MEDIUM, suppresses: [] };
const suppressed = applySuperiorAlertSuppression([parentAlert, childAlert]);
ok("superior suppression removes child", suppressed.length === 1 && suppressed[0].alert_key === "cross_module.deterioration");

// ── Noise suppression pipeline ───────────────────────────────────────
const noisy = applyAlertNoiseSuppression([
  { severity: EXECUTIVE_ALERT_SEVERITIES.MEDIUM, magnitude: "negligible", confidence: { level: "moderate" } },
  { severity: EXECUTIVE_ALERT_SEVERITIES.HIGH, confidence: { level: "moderate" } },
]);
ok("noise pipeline filters negligible", noisy.length === 1);

// ── Causality / recommendations ────────────────────────────────────────
for (const alert of structuredAlerts) {
  ok(`no causality: ${alert.alert_key}`, !containsCausalLanguage(alert.description));
  ok(`no recommendations: ${alert.alert_key}`, !containsRecommendationLanguage(alert.description));
}
ok("causal blocklist works", containsCausalLanguage("Queda porque usuários desistiram"));
ok("recommendation blocklist works", containsRecommendationLanguage("Priorize correção imediata"));

// ── Determinism ──────────────────────────────────────────────────────
const out1 = JSON.stringify(generateExecutiveAnalysisAlerts(analysisInput));
const out2 = JSON.stringify(generateExecutiveAnalysisAlerts(analysisInput));
ok("determinism alerts output", out1 === out2);

// ── Combined C.2 + C.3 + C.4 + C.5 ───────────────────────────────────
const combined = generateExecutiveAnalysisWithSummaryInsightsTrendsAndAlerts(analysisInput);
ok("combined has summary", combined.summary != null);
ok("combined has insights", combined.insights.length > 0);
ok("combined has trends", combined.trends.length > 0);
ok("combined has alerts", combined.alerts.length > 0);
ok("combined status analysis_ready", combined.status === "analysis_ready");
ok("combined no recommendations", combined.recommendations.length === 0);

const trendsOnlyCombined = generateExecutiveAnalysisWithSummaryInsightsAndTrends(analysisInput);
ok("C.4 combined still no alerts", trendsOnlyCombined.alerts.length === 0);

ok("C.3 insights still works", generateExecutiveAnalysisInsights(analysisInput).insights.length > 0);
ok("C.2 summary still works", generateExecutiveAnalysisSummary(analysisInput).summary != null);

// ── mapStructuredAlertToExecutiveAlert ───────────────────────────────
const mapped = mapStructuredAlertToExecutiveAlert(structuredAlerts[0]);
ok("mapped alert_id", Boolean(mapped.alert_id));
ok("mapped severity", Boolean(mapped.severity));
ok("mapped message", Boolean(mapped.message));

// ── Ordering stability ─────────────────────────────────────────────────
const ordered = [...structuredAlerts].sort(compareAlertsForOrdering);
ok("ordering stable", JSON.stringify(ordered.map((a) => a.priority)) === JSON.stringify([...structuredAlerts].sort(compareAlertsForOrdering).map((a) => a.priority)));

// ── Status active/monitoring ───────────────────────────────────────────
ok(
  "derive status active for high",
  deriveAlertStatus(EXECUTIVE_ALERT_SEVERITIES.HIGH, EXECUTIVE_ALERT_URGENCIES.SOON, EXECUTIVE_ALERT_PRIORITIES.P1, "high") ===
    EXECUTIVE_ALERT_STATUSES.ACTIVE
);

// ── Source types catalog ───────────────────────────────────────────────
ok("source types include metric", Boolean(EXECUTIVE_ALERT_SOURCE_TYPES.METRIC));
ok("source types include trend", Boolean(EXECUTIVE_ALERT_SOURCE_TYPES.TREND));

// ── Evidence JSON ──────────────────────────────────────────────────────
const evidence = {
  patch: "C.5",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  catalog_version: MIA_EXECUTIVE_ALERT_CATALOG_VERSION,
  builder_version: MIA_EXECUTIVE_ALERT_BUILDER_VERSION,
  contracts_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  rules_count: EXECUTIVE_ALERT_RULES.length,
  supported_alerts: [
    "operational.critical",
    "operational.degradation",
    "commercial.bottleneck",
    "product.acceptance_drop",
    "cross_module.deterioration",
    "growth.decline",
    "commercial.decline",
    "commercial.low_volume",
    "data.modules_missing",
  ],
  unsupported: ["lifecycle resolved", "recommendations", "LLM severity"],
  checks_passed: checks.filter((c) => c.pass).length,
  checks_total: checks.length,
  validated_at: new Date().toISOString(),
};
writeFileSync(join(ROOT, "docs/analytics/PATCH_C_5_ALERTS_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} checks passed`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.label}${f.detail ? `: ${f.detail}` : ""}`);
  process.exit(1);
}
console.log("\nPATCH C.5 alerts audit APPROVED\n");
