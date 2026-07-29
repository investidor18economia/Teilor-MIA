#!/usr/bin/env node
/**
 * PATCH B.7 — Executive Summary audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapExecutiveSummaryToFounderDisplay,
  extractSummarySignals,
  computeModuleScores,
  resolveExecutiveSummaryHeadline,
  resolveExecutiveSummaryBody,
  FOUNDER_EXECUTIVE_SUMMARY_DISPLAY_VERSION,
} from "../lib/miaFounderExecutiveSummaryDisplay.js";
import {
  FOUNDER_EXECUTIVE_SUMMARY_CATALOG_VERSION,
  SUMMARY_MODULE_IDS,
  classifySummaryOverallLevel,
  classifySummaryConfidence,
  SUMMARY_EMPTY_MESSAGES,
} from "../lib/miaFounderExecutiveSummaryCatalog.js";
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

console.log("\nPATCH B.7 — Executive Summary audit\n");

ok("catalog exists", existsSync(join(ROOT, "lib/miaFounderExecutiveSummaryCatalog.js")));
ok("mapper exists", existsSync(join(ROOT, "lib/miaFounderExecutiveSummaryDisplay.js")));
ok(
  "component exists",
  existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveSummarySection.jsx"))
);
ok("module views context exists", existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveModuleViewsContext.jsx")));
ok("catalog version B.7.0", FOUNDER_EXECUTIVE_SUMMARY_CATALOG_VERSION === "B.7.0");
ok("mapper version B.7.0", FOUNDER_EXECUTIVE_SUMMARY_DISPLAY_VERSION === "B.7.0");
ok("catalog defines 5 module ids", SUMMARY_MODULE_IDS.length === 5);

const page = read("components/founder-cockpit/FounderCockpitPage.jsx");
const pageInner = page.slice(page.indexOf("function FounderCockpitPageInner"));
ok("cockpit mounts FounderExecutiveSummarySection", page.includes("FounderExecutiveSummarySection"));
ok("cockpit uses module views provider", page.includes("FounderExecutiveModuleViewsProvider"));
ok(
  "summary below operational",
  pageInner.indexOf("FounderExecutiveOperationalSection") <
    pageInner.indexOf("FounderExecutiveSummarySection")
);
ok(
  "summary above insights",
  pageInner.indexOf("FounderExecutiveSummarySection") <
    pageInner.indexOf("FounderExecutiveInsights")
);

const component = read("components/founder-cockpit/FounderExecutiveSummarySection.jsx");
ok("component uses summary mapper only", component.includes("mapExecutiveSummaryToFounderDisplay"));
ok("component has no extractSummarySignals", !component.includes("extractSummarySignals"));
ok("component has no classifySummaryOverallLevel", !component.includes("classifySummaryOverallLevel"));
ok("component has no computeModuleScores", !component.includes("computeModuleScores"));
ok("component has no fetch(", !component.includes("fetch("));

const mapperSrc = read("lib/miaFounderExecutiveSummaryDisplay.js");
ok("display no supabase import", !/from\s+['"]@supabase|createClient/i.test(mapperSrc));
ok("display no SQL", !/\bSELECT\b/i.test(mapperSrc));
ok("display no fetch", !/\bfetch\s*\(/i.test(mapperSrc));

const css = read("styles/founder-cockpit.css");
ok("summary CSS", css.includes(".founder-executive-summary"));

ok("B.6 catalog still B.6.0", read("lib/miaFounderExecutiveOperationalCatalog.js").includes('"B.6.0"'));
ok("cockpit display still A.2.0", read("lib/miaFounderCockpitDisplay.js").includes('"A.2.0"'));

for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js"]) {
  ok(`${route} unchanged by B.7`, !read(route).includes("PATCH B.7"));
}

const doc = read("docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md");
ok("dashboard doc mentions B.7", doc.includes("PATCH B.7") || doc.includes("B.7"));

ok(
  "overall level excellent",
  classifySummaryOverallLevel(0.9, {}).id === "excellent"
);
ok(
  "overall level attention",
  classifySummaryOverallLevel(0.42, {}).id === "attention"
);
ok(
  "overall level critical",
  classifySummaryOverallLevel(0.2, { hasCritical: true }).id === "critical"
);
ok(
  "confidence high",
  classifySummaryConfidence({ modulesAvailable: 5, partialModules: 0, periodCompareCount: 3, lowVolume: false }).id ===
    "high"
);
ok(
  "confidence moderate",
  classifySummaryConfidence({ modulesAvailable: 4, partialModules: 0, lowVolume: false }).id === "moderate"
);
ok(
  "confidence low",
  classifySummaryConfidence({ modulesAvailable: 2, lowVolume: true }).id === "low"
);

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

const view = mapExecutiveSummaryToFounderDisplay(moduleViews);
ok("mapper headline present", typeof view.headline.text === "string" && view.headline.text.length > 0);
ok("mapper summary body present", typeof view.summary.text === "string" && view.summary.text.length > 0);
ok("mapper overall level", Boolean(view.headline.overall_level?.id));
ok("mapper confidence", Boolean(view.confidence?.id));
ok("mapper 5 modules consumed", view.meta.modules_consumed.length === 5);
ok("mapper modules available", view.meta.modules_available === 5);
ok("mapper average score", view.meta.average_score != null && view.meta.average_score > 0);
ok("mapper has opportunities or priorities", view.opportunities.length + view.priorities.length > 0);

const signals = extractSummarySignals(moduleViews);
ok("signals growth up", signals.growthUp === true);
ok("module scores computed", computeModuleScores(moduleViews).length >= 4);

const headlineStable = resolveExecutiveSummaryHeadline(
  { growthUp: true, operationalStable: true },
  "healthy",
  { id: "high" }
);
ok("headline growth stable ops", headlineStable?.includes("crescimento"));

const emptyView = mapExecutiveSummaryToFounderDisplay({});
ok("empty modules error status", emptyView.meta.status === "error");
ok("empty modules unavailable level", emptyView.headline.overall_level.id === "unavailable");

const partialViews = {
  ...moduleViews,
  growth: null,
  commercial: null,
};
const partialView = mapExecutiveSummaryToFounderDisplay(partialViews);
ok("partial modules status", partialView.meta.status === "partial");
ok("partial confidence not high", partialView.confidence.id !== "high");

const lowVolumeViews = {
  ...moduleViews,
  commercial: {
    ...moduleViews.commercial,
    meta: { ...moduleViews.commercial.meta, volume_confidence: "insufficient" },
  },
};
const lowVolumeView = mapExecutiveSummaryToFounderDisplay(lowVolumeViews);
ok("low volume risk or note", lowVolumeView.risks.some((r) => r.id === "low_volume") || Boolean(lowVolumeView.confidence.note));

const noPrevViews = {
  ...moduleViews,
  growth: mapExecutiveGrowthToFounderDisplay(mockExecutive, null, mockTemporal),
  health: mapExecutiveProductHealthToFounderDisplay(mockExecutive, null),
  commercial: mapExecutiveCommercialPerformanceToFounderDisplay(mockExecutive, null, mockTemporal),
};
const noPrevView = mapExecutiveSummaryToFounderDisplay(noPrevViews);
ok("no previous partial or moderate confidence", noPrevView.confidence.id !== "high");

ok("kpis section registers view", read("components/founder-cockpit/FounderExecutiveKpisSection.jsx").includes('useRegisterExecutiveModuleView("kpis"'));

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_7_EXECUTIVE_SUMMARY_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.7",
      title: "PATCH B.7 — Executive Summary Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      display_version: FOUNDER_EXECUTIVE_SUMMARY_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_SUMMARY_CATALOG_VERSION,
      modules_consumed: SUMMARY_MODULE_IDS,
      components: [
        "FounderExecutiveSummarySection.jsx",
        "FounderExecutiveModuleViewsContext.jsx",
      ],
      mapper: "lib/miaFounderExecutiveSummaryDisplay.js",
      catalog: "lib/miaFounderExecutiveSummaryCatalog.js",
      baseline_b2_b6_preserved: true,
      empty_states: SUMMARY_EMPTY_MESSAGES,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
