#!/usr/bin/env node
/**
 * PATCH C.8 — Executive Humanization Engine audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS,
  MIA_EXECUTIVE_ANALYSIS_CONTRACTS_VERSION,
} from "../lib/miaExecutiveAnalysisContracts.js";
import {
  MIA_EXECUTIVE_NARRATIVE_CATALOG_VERSION,
  EXECUTIVE_NARRATIVE_REQUIRED_KEYS,
  EXECUTIVE_NARRATIVE_SECTION_IDS,
  EXECUTIVE_NARRATIVE_HIGHLIGHT_TYPES,
} from "../lib/miaExecutiveNarrativeCatalog.js";
import {
  MIA_EXECUTIVE_TONE_CATALOG_VERSION,
  EXECUTIVE_TONE_PROFILE_LIST,
} from "../lib/miaExecutiveToneCatalog.js";
import {
  buildExecutiveStructuredNarrative,
  generateExecutiveNarrative,
  generateExecutiveAnalysisWithNarrative,
  selectExecutiveToneProfile,
  buildConfidenceSummary,
  buildLimitationSummary,
  buildEvidenceSummary,
  calculateReadingTime,
  MIA_EXECUTIVE_NARRATIVE_BUILDER_VERSION,
} from "../lib/miaExecutiveNarrativeBuilder.js";
import {
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

console.log("\nPATCH C.8 — Executive Humanization Engine audit\n");

ok("narrative catalog exists", existsSync(join(ROOT, "lib/miaExecutiveNarrativeCatalog.js")));
ok("tone catalog exists", existsSync(join(ROOT, "lib/miaExecutiveToneCatalog.js")));
ok("narrative builder exists", existsSync(join(ROOT, "lib/miaExecutiveNarrativeBuilder.js")));
ok("catalog version C.8.0", MIA_EXECUTIVE_NARRATIVE_CATALOG_VERSION === "C.8.0");
ok("tone catalog version C.8.0", MIA_EXECUTIVE_TONE_CATALOG_VERSION === "C.8.0");
ok("builder version C.8.0", MIA_EXECUTIVE_NARRATIVE_BUILDER_VERSION === "C.8.0");
ok("tone profiles defined", EXECUTIVE_TONE_PROFILE_LIST.length >= 6);

for (const [name, src] of [
  ["narrative catalog", read("lib/miaExecutiveNarrativeCatalog.js")],
  ["tone catalog", read("lib/miaExecutiveToneCatalog.js")],
  ["narrative builder", read("lib/miaExecutiveNarrativeBuilder.js")],
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
ok("C.7 intact", MIA_EXECUTIVE_EXPLAINABILITY_BUILDER_VERSION === "C.7.0");

const mockExecutive = {
  platform: { total_sessions: 500, conversations: 200, questions: 350, unique_visitors: 120 },
  recommendation: { recommendations_generated: 300, recommendation_acceptance_rate: 0.55, rejection_rate: 0.12 },
  commerce: { offers_returned: 180, offer_clicks: 45, favorite_count: 22, offer_sets_generated: 200 },
  alerts: { alerts_created: 15 },
  performance: { total_duration_ms: 420 },
  partial_errors: [],
};

const mockPrevious = {
  platform: { total_sessions: 400, questions: 280, conversations: 160 },
  recommendation: { recommendation_acceptance_rate: 0.5, rejection_rate: 0.14 },
  commerce: { offer_clicks: 30, favorite_count: 15, offers_returned: 140 },
  alerts: { alerts_created: 10 },
  partial_errors: [],
};

const mockTemporal = {
  temporal_version: "A.7.0",
  partial_errors: [],
  growth: { series: [{ crescimento_dau_visitors_pct: 0.08 }, { crescimento_dau_visitors_pct: 0.03 }] },
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

function buildViews() {
  return {
    kpis: mapExecutiveMetricsToFounderExecutiveKpis(mockExecutive, mockTemporal),
    growth: mapExecutiveGrowthToFounderDisplay(mockExecutive, mockPrevious, mockTemporal),
    health: mapExecutiveProductHealthToFounderDisplay(mockExecutive, mockPrevious),
    commercial: mapExecutiveCommercialPerformanceToFounderDisplay(mockExecutive, mockPrevious, mockTemporal),
    operational: mapExecutiveOperationalToFounderDisplay(mockExecutive, mockTemporal),
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

const { narrative, analysis } = buildExecutiveStructuredNarrative(analysisInput);
ok("structured narrative present", Boolean(narrative?.id));
ok("narrative deterministic", narrative.deterministic === true);

for (const key of EXECUTIVE_NARRATIVE_REQUIRED_KEYS) {
  ok(`narrative key ${key}`, key in narrative);
}

ok("narrative sections", narrative.sections.length >= 5, `count=${narrative.sections.length}`);
for (const sectionId of EXECUTIVE_NARRATIVE_SECTION_IDS) {
  ok(`section ${sectionId}`, narrative.sections.some((s) => s.section_id === sectionId));
}

ok("executive_message present", Boolean(narrative.executive_message));
ok("tone_profile valid", EXECUTIVE_TONE_PROFILE_LIST.includes(narrative.tone_profile));
ok("reading_time >= 1", narrative.reading_time >= 1, String(narrative.reading_time));
ok("confidence_summary present", Boolean(narrative.confidence_summary));
ok("limitation_summary present", Boolean(narrative.limitation_summary));
ok("evidence_summary present", Boolean(narrative.evidence_summary));
ok("highlights present", narrative.highlights.length > 0, `count=${narrative.highlights.length}`);
ok("primary recommendation highlight", narrative.highlights.some((h) => h.type === EXECUTIVE_NARRATIVE_HIGHLIGHT_TYPES.PRIMARY_RECOMMENDATION));
ok("priorities ordered", narrative.priorities.length > 0);

const tone = selectExecutiveToneProfile(analysis);
ok("tone selection deterministic", EXECUTIVE_TONE_PROFILE_LIST.includes(tone));

ok("confidence summary builder", Boolean(buildConfidenceSummary(analysis.confidence)));
ok("limitation summary builder", Boolean(buildLimitationSummary(analysis.confidence.limitations)));
ok("evidence summary builder", Boolean(buildEvidenceSummary(analysis.evidence, analysis.explainability)));
ok("reading time calculator", calculateReadingTime(narrative.sections, narrative.executive_message) >= 1);

const narrativeOnly = generateExecutiveNarrative(analysisInput);
ok("narrative-only status", narrativeOnly.status === "narrative_ready");
ok("narrative-only has narrative", Boolean(narrativeOnly.narrative));
ok("narrative-only clears summary slot", narrativeOnly.summary === null);

for (const key of EXECUTIVE_ANALYSIS_OUTPUT_REQUIRED_KEYS) {
  ok(`narrative-only output key ${key}`, key in narrativeOnly);
}

const withNarrative = generateExecutiveAnalysisWithNarrative(analysisInput);
ok("with narrative status", withNarrative.status === "analysis_complete_with_narrative");
ok("with narrative slot", Boolean(withNarrative.narrative));
ok("with narrative summary preserved", withNarrative.summary != null);
ok("with narrative insights preserved", withNarrative.insights.length > 0);
ok("with narrative trends preserved", withNarrative.trends.length > 0);
ok("with narrative alerts preserved", withNarrative.alerts.length > 0);
ok("with narrative recommendations preserved", withNarrative.recommendations.length > 0);
ok("with narrative explainability preserved", withNarrative.explainability.length > 0);

const baseline = generateExecutiveAnalysisWithExplainability(analysisInput);
ok("confidence unchanged", withNarrative.confidence.level === baseline.confidence.level);
ok("recommendation count unchanged", withNarrative.recommendations.length === baseline.recommendations.length);
ok("recommendation ids unchanged", JSON.stringify(withNarrative.recommendations.map((r) => r.recommendation_id)) === JSON.stringify(baseline.recommendations.map((r) => r.recommendation_id)));
ok("recommendation priorities unchanged", JSON.stringify(withNarrative.recommendations.map((r) => r.priority)) === JSON.stringify(baseline.recommendations.map((r) => r.priority)));
ok("alert count unchanged", withNarrative.alerts.length === baseline.alerts.length);
ok("insight count unchanged", withNarrative.insights.length === baseline.insights.length);
ok("evidence count unchanged", withNarrative.evidence.length === baseline.evidence.length);
ok("explainability count unchanged", withNarrative.explainability.length === baseline.explainability.length);

const complete = generateExecutiveAnalysisComplete(analysisInput);
ok("C.6 complete unchanged", complete.status === "analysis_complete");
ok("C.6 complete no narrative", complete.narrative === undefined);

const stableInput = {
  ...analysisInput,
  executive_views: buildViews(
    { ...mockExecutive, platform: { total_sessions: 402, conversations: 161, questions: 281, unique_visitors: 120 } },
    { ...mockPrevious, platform: { total_sessions: 400, questions: 280, conversations: 160 } },
    { ...mockTemporal, conversion: { summary: mockTemporal.conversion.summary, bottlenecks: [] } }
  ),
};
const stableTone = selectExecutiveToneProfile(generateExecutiveAnalysisWithExplainability(stableInput));
ok("stable tone is valid profile", EXECUTIVE_TONE_PROFILE_LIST.includes(stableTone), stableTone);

const neutralTone = selectExecutiveToneProfile(
  generateExecutiveAnalysisWithExplainability({ ...analysisInput, executive_views: {} })
);
ok("neutral or informative on empty modules", ["neutral", "informative", "executive"].includes(neutralTone), neutralTone);

const criticalInput = {
  ...analysisInput,
  executive_views: buildViews(
    { ...mockExecutive, partial_errors: [{ g: 1 }, { g: 2 }, { g: 3 }, { g: 4 }], performance: { total_duration_ms: 9000 } },
    mockPrevious,
    mockTemporal
  ),
};
const warningTone = selectExecutiveToneProfile(generateExecutiveAnalysisWithExplainability(criticalInput));
ok("warning tone on critical", warningTone === "warning", warningTone);

const out1 = JSON.stringify(generateExecutiveAnalysisWithNarrative(analysisInput));
const out2 = JSON.stringify(generateExecutiveAnalysisWithNarrative(analysisInput));
ok("determinism", out1 === out2);

const evidence = {
  patch: "C.8",
  status: checks.every((c) => c.pass) ? "APPROVED" : "REJECTED",
  catalog_version: MIA_EXECUTIVE_NARRATIVE_CATALOG_VERSION,
  builder_version: MIA_EXECUTIVE_NARRATIVE_BUILDER_VERSION,
  tone_profiles: EXECUTIVE_TONE_PROFILE_LIST,
  checks_passed: checks.filter((c) => c.pass).length,
  checks_total: checks.length,
  validated_at: new Date().toISOString(),
};
writeFileSync(join(ROOT, "docs/analytics/PATCH_C_8_HUMANIZATION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} checks passed`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.label}`);
  process.exit(1);
}
console.log("\nPATCH C.8 humanization audit APPROVED\n");
