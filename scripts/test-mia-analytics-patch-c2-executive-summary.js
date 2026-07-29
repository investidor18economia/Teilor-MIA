#!/usr/bin/env node
/**
 * PATCH C.2 — Executive Summary Generator audit.
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
  MIA_EXECUTIVE_SUMMARY_CATALOG_VERSION,
  EXECUTIVE_SUMMARY_SECTION_IDS,
  EXECUTIVE_SUMMARY_EMPTY_MESSAGES,
} from "../lib/miaExecutiveSummaryCatalog.js";
import {
  buildExecutiveStructuredSummary,
  collectExecutiveSummaryInput,
  organizeExecutiveSummaryFacts,
  buildExecutiveSummarySections,
  buildExecutiveSummaryNarrative,
  generateExecutiveAnalysisSummary,
  mapStructuredSummaryToExecutiveSummary,
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

console.log("\nPATCH C.2 — Executive Summary Generator audit\n");

// ── Files ────────────────────────────────────────────────────────────
ok("catalog exists", existsSync(join(ROOT, "lib/miaExecutiveSummaryCatalog.js")));
ok("builder exists", existsSync(join(ROOT, "lib/miaExecutiveSummaryBuilder.js")));
ok("catalog version C.2.0", MIA_EXECUTIVE_SUMMARY_CATALOG_VERSION === "C.2.0");
ok("builder version C.2.0", MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION === "C.2.0");

const builderSrc = read("lib/miaExecutiveSummaryBuilder.js");
const catalogSrc = read("lib/miaExecutiveSummaryCatalog.js");
for (const [name, src] of [
  ["builder", builderSrc],
  ["catalog", catalogSrc],
]) {
  ok(`${name} no supabase`, !/supabase|createClient/.test(src));
  ok(`${name} no SQL`, !/SELECT\s|FROM\s+mia_|\.rpc\(/.test(src));
  ok(`${name} no fetch`, !/\bfetch\s*\(/.test(src));
  ok(`${name} no OpenAI/LLM`, !/openai|chat\.completions|verbalizeExecutive/.test(src));
}

// ── C.1 contracts preserved ──────────────────────────────────────────
ok("C.1 contracts version unchanged", MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION === "C.1.0");
ok("C.1 output template still pending", EXECUTIVE_ANALYSIS_OUTPUT_TEMPLATE.status === "pending");
ok("contracts file unchanged version", read("lib/miaExecutiveAnalysisContracts.js").includes('"C.1.0"'));

// ── Section structure ────────────────────────────────────────────────
ok("6 fixed sections defined", EXECUTIVE_SUMMARY_SECTION_IDS.length === 6);
ok("section overview", EXECUTIVE_SUMMARY_SECTION_IDS[0] === "overview");
ok("section conclusion last", EXECUTIVE_SUMMARY_SECTION_IDS[5] === "conclusion");
ok(
  "empty module message matches spec",
  EXECUTIVE_SUMMARY_EMPTY_MESSAGES.module_insufficient.includes("Dados insuficientes")
);

// ── Mock executive views (same as B.7) ───────────────────────────────
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

// ── Pipeline stages ──────────────────────────────────────────────────
const collected = collectExecutiveSummaryInput(analysisInput);
ok("collect normalizes 5 views", Object.keys(collected.views).length === 5);

const organized = organizeExecutiveSummaryFacts(collected);
ok("organize modules available", organized.modulesUsed.length === 5);
ok("organize confidence high", organized.confidence.level === "high");

const sections = buildExecutiveSummarySections(organized, collected);
ok("structure produces 6 sections", sections.length === 6);
ok(
  "structure section titles fixed",
  sections.map((s) => s.section_id).join(",") === EXECUTIVE_SUMMARY_SECTION_IDS.join(",")
);

const narrative = buildExecutiveSummaryNarrative(sections, organized, collected);
ok("narrative stage is summary", narrative.stage === "summary");
ok("narrative has sections", narrative.sections.length === 6);

const { structured } = buildExecutiveStructuredSummary(analysisInput);
ok("full build summary_id present", typeof structured.summary_id === "string");
ok("full build evidence present", structured.evidence.length > 0);
ok("full build limitations array", Array.isArray(structured.meta.limitations));
ok("overview section content", sections[0].content.length > 0);
ok("commercial section uses module", sections[3].module_ids.includes("commercial"));
ok("operational section uses module", sections[4].module_ids.includes("operational"));

// ── Analysis output contract ─────────────────────────────────────────
const output = generateExecutiveAnalysisSummary(analysisInput);
ok("output status summary_ready", output.status === "summary_ready");
ok("output has summary", output.summary != null);
ok("output no insights", output.insights.length === 0);
ok("output no trends", output.trends.length === 0);
ok("output no alerts", output.alerts.length === 0);
ok("output no recommendations", output.recommendations.length === 0);

for (const key of EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS) {
  ok(`output required key ${key}`, Object.prototype.hasOwnProperty.call(output, key));
}

for (const key of EXECUTIVE_CONFIDENCE_REQUIRED_KEYS) {
  ok(`confidence key ${key}`, Object.prototype.hasOwnProperty.call(output.confidence, key));
}

if (output.evidence.length > 0) {
  for (const key of EXECUTIVE_EVIDENCE_REQUIRED_KEYS) {
    ok(`evidence key ${key}`, Object.prototype.hasOwnProperty.call(output.evidence[0], key));
  }
}

const mapped = mapStructuredSummaryToExecutiveSummary(structured);
ok("mapped headline present", mapped.headline.length > 0);
ok("mapped body present", mapped.body.length > 0);

// ── Determinism ──────────────────────────────────────────────────────
const run1 = JSON.stringify(buildExecutiveStructuredSummary(analysisInput));
const run2 = JSON.stringify(buildExecutiveStructuredSummary(analysisInput));
ok("determinism identical output", run1 === run2);

const out1 = JSON.stringify(generateExecutiveAnalysisSummary(analysisInput));
const out2 = JSON.stringify(generateExecutiveAnalysisSummary(analysisInput));
ok("determinism analysis output", out1 === out2);

// ── Empty modules ────────────────────────────────────────────────────
const emptyOutput = generateExecutiveAnalysisSummary({
  ...analysisInput,
  executive_views: {},
});
ok("empty modules insufficient_data", emptyOutput.status === "insufficient_data");
ok("empty confidence insufficient", emptyOutput.confidence.level === "insufficient_data");
ok("empty summary still produced", emptyOutput.summary != null);

const emptyStructured = buildExecutiveStructuredSummary({ executive_views: {} }).structured;
ok("empty overview insufficient", emptyStructured.sections[0].status === "insufficient");

// ── Partial modules ────────────────────────────────────────────────────
const partialInput = {
  ...analysisInput,
  executive_views: { kpis: moduleViews.kpis, growth: moduleViews.growth, health: null, commercial: null, operational: moduleViews.operational },
};
const partialOutput = generateExecutiveAnalysisSummary(partialInput);
ok("partial modules not high confidence", partialOutput.confidence.level !== "high");
ok("partial commercial insufficient message", partialOutput.summary.body.includes("Dados insuficientes") || partialOutput.summary.body.includes("parcial"));

// ── Missing single module data ───────────────────────────────────────
const noCommercial = {
  ...analysisInput,
  executive_views: { ...moduleViews, commercial: { meta: { status: "error" } } },
};
const noCommercialOut = generateExecutiveAnalysisSummary(noCommercial);
const noCommercialSection = buildExecutiveStructuredSummary(noCommercial).structured.sections.find(
  (s) => s.section_id === "commercial"
);
ok(
  "missing commercial standardized message",
  noCommercialSection?.content === EXECUTIVE_SUMMARY_EMPTY_MESSAGES.module_insufficient
);

// ── Baseline B preserved ───────────────────────────────────────────────
ok("B.7 mapper unchanged", read("lib/miaFounderExecutiveSummaryDisplay.js").includes('"B.7.0"'));
ok(
  "cockpit still uses B.7 summary",
  read("components/founder-cockpit/FounderExecutiveSummarySection.jsx").includes(
    "mapExecutiveSummaryToFounderDisplay"
  )
);
ok("no analyst UI in cockpit yet", !read("components/founder-cockpit/FounderCockpitPage.jsx").includes("miaExecutiveSummaryBuilder"));

// ── Documentation ──────────────────────────────────────────────────────
const doc = read("docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md");
ok("doc mentions C.2", doc.includes("C.2"));
ok("doc mentions Summary Pipeline", doc.includes("Summary Pipeline") || doc.includes("Executive Summary Builder"));

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_C_2_SUMMARY_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "C.2",
      title: "PATCH C.2 — Executive Summary Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      builder_version: MIA_EXECUTIVE_SUMMARY_BUILDER_VERSION,
      catalog_version: MIA_EXECUTIVE_SUMMARY_CATALOG_VERSION,
      contracts_version: MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
      section_ids: EXECUTIVE_SUMMARY_SECTION_IDS,
      pipeline: ["collect", "organize", "structure", "narrative"],
      scope: "Deterministic executive summaries from Baseline B views only",
      excludes: ["insights", "trends", "alerts", "recommendations", "LLM"],
      baseline_b7_preserved: true,
      baseline_c1_preserved: true,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
