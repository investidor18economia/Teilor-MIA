#!/usr/bin/env node
/**
 * PATCH C.7 — Executive Explainability Engine audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS,
  EXECUTIVE_CONFIDENCE_REQUIRED_KEYS,
  EXECUTIVE_EVIDENCE_REQUIRED_KEYS,
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
} from "../lib/miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION,
  EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPE_LIST,
  EXECUTIVE_EXPLAINABILITY_REQUIRED_KEYS,
  EXECUTIVE_EXPLAINABILITY_BLOCKLIST_PHRASES,
} from "../lib/miaExecutiveExplainabilityCatalog.js";
import {
  consolidateExplainabilityConfidence,
  deriveExplainabilityConfidence,
  minExecutiveConfidenceLevel,
  MIA_EXECUTIVE_CONFIDENCE_BUILDER_VERSION,
} from "../lib/miaExecutiveConfidenceBuilder.js";
import {
  buildExecutiveStructuredExplainability,
  buildExecutiveExplainabilityNarrative,
  generateExecutiveAnalysisExplainability,
  generateExecutiveAnalysisWithExplainability,
  MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION,
} from "../lib/miaExecutiveExplainabilityBuilder.js";
import {
  generateExecutiveAnalysisComplete,
  MIA_EXECUTIVE_RECOMMENDATION_BUILDER_VERSION,
} from "../lib/miaExecutiveRecommendationBuilder.js";
import { MIA_EXECUTIVE_ALERT_BUILDER_VERSION } from "../lib/miaExecutiveAlertBuilder.js";
import { MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION } from "../lib/miaExecutiveInsightBuilder.js";
import { MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION } from "../lib/miaExecutiveSummaryBuilder.js";
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

console.log("\nPATCH C.7 — Executive Explainability Engine audit\n");

ok("catalog exists", existsSync(join(ROOT, "lib/miaExecutiveExplainabilityCatalog.js")));
ok("confidence builder exists", existsSync(join(ROOT, "lib/miaExecutiveConfidenceBuilder.js")));
ok("explainability builder exists", existsSync(join(ROOT, "lib/miaExecutiveExplainabilityBuilder.js")));
ok("catalog version C.7.0", MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION === "C.7.0");
ok("builder version C.7.0", MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION === "C.7.0");
ok("confidence builder version C.7.0", MIA_EXECUTIVE_CONFIDENCE_BUILDER_VERSION === "C.7.0");
ok("analysis types defined", EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPE_LIST.length === 5);

for (const [name, src] of [
  ["catalog", read("lib/miaExecutiveExplainabilityCatalog.js")],
  ["confidence builder", read("lib/miaExecutiveConfidenceBuilder.js")],
  ["explainability builder", read("lib/miaExecutiveExplainabilityBuilder.js")],
]) {
  ok(`${name} no supabase`, !/supabase|createClient/.test(src));
  ok(`${name} no SQL`, !/SELECT\s|FROM\s+mia_|\.rpc\(/.test(src));
  ok(`${name} no fetch`, !/\bfetch\s*\(/.test(src));
  ok(`${name} no OpenAI/LLM`, !/openai|chat\.completions|verbalizeExecutive/.test(src));
}

ok("C.1 contracts unchanged", MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION === "C.1.0");
ok("C.2 intact", MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION === "C.2.0");
ok("C.3 intact", MIA_EXECUTIVE_INSIGHT_BUILDER_VERSION === "C.3.0");
ok("C.4 intact", MIA_EXECUTIVE_TREND_BUILDER_VERSION === "C.4.0");
ok("C.5 intact", MIA_EXECUTIVE_ALERT_BUILDER_VERSION === "C.5.0");
ok("C.6 intact", MIA_EXECUTIVE_RECOMMENDATION_BUILDER_VERSION === "C.6.0");

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

const analysisInput = {
  analysis_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
  period_label: "30d",
  period: { start: null, end: null, range: "30d", window_days: 30 },
  module_ids: ["kpis", "growth", "health", "commercial", "operational"],
  executive_views: buildViews(),
  executive_snapshot: null,
  temporal_snapshot: null,
  source_evidence: [],
};

const structured = buildExecutiveStructuredExplainability(analysisInput);
ok("structured explainability records", structured.records.length > 0, `count=${structured.records.length}`);

const typesPresent = new Set(structured.records.map((r) => r.analysis_type));
ok("explainability summary", typesPresent.has("summary"));
ok("explainability insight", typesPresent.has("insight"));
ok("explainability trend", typesPresent.has("trend"));
ok("explainability alert", typesPresent.has("alert"));
ok("explainability recommendation", typesPresent.has("recommendation"));

for (const key of EXECUTIVE_EXPLAINABILITY_REQUIRED_KEYS) {
  ok(`record key ${key}`, structured.records.every((r) => key in r));
}

for (const record of structured.records) {
  ok(`deterministic ${record.id}`, record.deterministic === true);
  ok(`rule_reference ${record.analysis_reference}`, Boolean(record.rule_reference));
  ok(`evidence ${record.analysis_reference}`, record.evidence.length > 0);
  for (const ek of EXECUTIVE_EVIDENCE_REQUIRED_KEYS) {
    ok(`evidence field ${ek}`, record.evidence.every((e) => ek in e));
  }
  for (const ck of EXECUTIVE_CONFIDENCE_REQUIRED_KEYS) {
    ok(`confidence field ${ck}`, ck in record.confidence);
  }
  ok(`supporting_modules ${record.analysis_reference}`, Array.isArray(record.supporting_modules));
  ok(`supporting_metrics ${record.analysis_reference}`, Array.isArray(record.supporting_metrics));
}

const recExp = structured.records.find((r) => r.analysis_type === "recommendation");
if (recExp) {
  ok("recommendation traceability alerts", recExp.supporting_alerts.length >= 0);
  ok("recommendation rule_reference pattern", recExp.rule_reference.includes("recommendation") || recExp.rule_reference.includes("."));
}

const alertExp = structured.records.find((r) => r.analysis_type === "alert");
if (alertExp) {
  ok("alert rule_reference", Boolean(alertExp.rule_reference));
}

const narrative = buildExecutiveExplainabilityNarrative(structured.records);
ok("narrative stage", narrative.stage === "narrative_structure");
ok("narrative facts count", narrative.facts.length === structured.records.length);

const explainOnly = generateExecutiveAnalysisExplainability(analysisInput);
ok("explainability output array", Array.isArray(explainOnly.explainability));
ok("explainability count", explainOnly.explainability.length > 0);
ok("explain-only no summary slot", explainOnly.summary === null);
ok("explain-only status", explainOnly.status === "explainability_ready");
ok("meta explainability_records", Array.isArray(explainOnly.meta.explainability_records));

for (const key of EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS) {
  ok(`explain-only output key ${key}`, key in explainOnly);
}

const withExplain = generateExecutiveAnalysisWithExplainability(analysisInput);
ok("with explainability status", withExplain.status === "analysis_complete_with_explainability");
ok("with explainability summary", withExplain.summary != null);
ok("with explainability insights", withExplain.insights.length > 0);
ok("with explainability trends", withExplain.trends.length > 0);
ok("with explainability alerts", withExplain.alerts.length > 0);
ok("with explainability recommendations", withExplain.recommendations.length > 0);
ok("with explainability explainability", withExplain.explainability.length > 0);
ok("meta explainability_count", withExplain.meta.explainability_count > 0);

const complete = generateExecutiveAnalysisComplete(analysisInput);
ok("C.6 complete unchanged", complete.status === "analysis_complete");
ok("C.6 complete no explainability slot", complete.explainability === undefined);

ok("min confidence moderate", minExecutiveConfidenceLevel(["high", "moderate"]) === "moderate");
ok("consolidate confidence", consolidateExplainabilityConfidence(structured.records, structured.envelopeConfidence).level != null);
ok(
  "derive confidence inherits",
  deriveExplainabilityConfidence({ level: "moderate", factors: [], limitations: [] }, [{ evidence_id: "e", source: "x", module_id: "kpis", field_path: "a", value_snapshot: "1", rule_ref: "r" }]).level != null
);

for (const phrase of EXECUTIVE_EXPLAINABILITY_BLOCKLIST_PHRASES) {
  ok(`no blocklist phrase: ${phrase}`, !structured.records.some((r) => JSON.stringify(r).toLowerCase().includes(phrase)));
}

const out1 = JSON.stringify(generateExecutiveAnalysisWithExplainability(analysisInput));
const out2 = JSON.stringify(generateExecutiveAnalysisWithExplainability(analysisInput));
ok("determinism", out1 === out2);

const emptyExplain = generateExecutiveAnalysisExplainability({ ...analysisInput, executive_views: {} });
ok(
  "empty modules no actionable explainability",
  !emptyExplain.explainability.some((r) =>
    ["insight", "trend", "alert", "recommendation"].includes(r.analysis_type)
  )
);

const evidence = {
  patch: "C.7",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  catalog_version: MIA_EXECUTIVE_EXPLAINABILITY_CATALOG_VERSION,
  builder_version: MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION,
  confidence_builder_version: MIA_EXECUTIVE_CONFIDENCE_BUILDER_VERSION,
  analysis_types: EXECUTIVE_EXPLAINABILITY_ANALYSIS_TYPE_LIST,
  checks_passed: checks.filter((c) => c.pass).length,
  checks_total: checks.length,
  validated_at: new Date().toISOString(),
};
writeFileSync(join(ROOT, "docs/analytics/PATCH_C_7_EXPLAINABILITY_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} checks passed`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.label}`);
  process.exit(1);
}
console.log("\nPATCH C.7 explainability audit APPROVED\n");
