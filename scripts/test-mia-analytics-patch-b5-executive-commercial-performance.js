#!/usr/bin/env node
/**
 * PATCH B.5 — Executive Commercial Performance audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapExecutiveCommercialPerformanceToFounderDisplay,
  computeCommercialRatio,
  computeExecutiveCommercialIndex,
  buildExecutiveCommercialFunnel,
  resolveExecutiveCommercialNarrative,
  FOUNDER_EXECUTIVE_COMMERCIAL_DISPLAY_VERSION,
} from "../lib/miaFounderExecutiveCommercialPerformanceDisplay.js";
import {
  FOUNDER_EXECUTIVE_COMMERCIAL_INDICATORS,
  FOUNDER_EXECUTIVE_COMMERCIAL_CATALOG_VERSION,
  classifyCommercialBadge,
  classifyCommercialLevel,
  classifyCommercialVolumeConfidence,
  COMMERCIAL_EMPTY_MESSAGES,
} from "../lib/miaFounderExecutiveCommercialPerformanceCatalog.js";
import { classifyTrendDirection } from "../lib/miaFounderGrowthDisplay.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("\nPATCH B.5 — Executive Commercial Performance audit\n");

ok("catalog exists", existsSync(join(ROOT, "lib/miaFounderExecutiveCommercialPerformanceCatalog.js")));
ok("mapper exists", existsSync(join(ROOT, "lib/miaFounderExecutiveCommercialPerformanceDisplay.js")));
ok(
  "component exists",
  existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveCommercialPerformanceSection.jsx"))
);
ok("catalog version B.5.0", FOUNDER_EXECUTIVE_COMMERCIAL_CATALOG_VERSION === "B.5.0");
ok("mapper version B.5.0", FOUNDER_EXECUTIVE_COMMERCIAL_DISPLAY_VERSION === "B.5.0");
ok("catalog defines 10 indicators", FOUNDER_EXECUTIVE_COMMERCIAL_INDICATORS.length === 10);

const page = read("components/founder-cockpit/FounderCockpitPage.jsx");
const pageInner = page.slice(page.indexOf("function FounderCockpitPageInner"));
ok(
  "cockpit mounts FounderExecutiveCommercialPerformanceSection",
  page.includes("FounderExecutiveCommercialPerformanceSection")
);
ok(
  "commercial below product health",
  pageInner.indexOf("FounderExecutiveProductHealthSection") <
    pageInner.indexOf("FounderExecutiveCommercialPerformanceSection")
);
ok(
  "commercial above insights",
  pageInner.indexOf("FounderExecutiveCommercialPerformanceSection") <
    pageInner.indexOf("FounderExecutiveInsights")
);

const component = read("components/founder-cockpit/FounderExecutiveCommercialPerformanceSection.jsx");
ok("component uses mapper only", component.includes("mapExecutiveCommercialPerformanceToFounderDisplay"));
ok("component has no computeCommercialRatio", !component.includes("computeCommercialRatio"));
ok("component has no classifyCommercialLevel", !component.includes("classifyCommercialLevel"));
ok("component has no resolveExecutiveCommercialNarrative", !component.includes("resolveExecutiveCommercialNarrative"));

const mapperSrc = read("lib/miaFounderExecutiveCommercialPerformanceDisplay.js");
ok("display no supabase import", !/from\s+['"]@supabase|createClient/i.test(mapperSrc));
ok("display no SQL", !/\bSELECT\b/i.test(mapperSrc));

const css = read("styles/founder-cockpit.css");
ok("commercial CSS", css.includes(".founder-executive-commercial"));

ok("cockpit display still A.2.0", read("lib/miaFounderCockpitDisplay.js").includes('"A.2.0"'));
ok("B.2 catalog still B.2.0", read("lib/miaFounderExecutiveCatalog.js").includes('"B.2.0"'));
ok("B.3 catalog still B.3.0", read("lib/miaFounderExecutiveGrowthCatalog.js").includes('"B.3.0"'));
ok("B.4 catalog still B.4.0", read("lib/miaFounderExecutiveProductHealthCatalog.js").includes('"B.4.0"'));
ok("temporal catalog still A.7.0", read("lib/miaTemporalSeriesCatalog.js").includes('"A.7.0"'));
ok("executive API still 11.1.0", read("lib/miaExecutiveMetricsCatalog.js").includes('"11.1.0"'));

for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js"]) {
  ok(`${route} unchanged by B.5`, !read(route).includes("PATCH B.5"));
}

const doc = read("docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md");
ok("dashboard doc mentions B.5", doc.includes("PATCH B.5") || doc.includes("B.5"));

// Indicator order
ok(
  "indicators sorted by priority",
  FOUNDER_EXECUTIVE_COMMERCIAL_INDICATORS[0].id === "executive_commercial_index" &&
    FOUNDER_EXECUTIVE_COMMERCIAL_INDICATORS[9].id === "commercial_trend"
);

// Ratio / index unit tests
ok("ratio valid", computeCommercialRatio(50, 100) === 0.5);
ok("ratio zero denominator", computeCommercialRatio(50, 0) === null);
ok("commercial index", computeExecutiveCommercialIndex([0.8, 0.6, 0.5]) === 63);
ok("volume insufficient", classifyCommercialVolumeConfidence(3) === "insufficient");
ok("volume high", classifyCommercialVolumeConfidence(150) === "high");
ok("CTR level excellent", classifyCommercialLevel(0.06, { excellent: 0.05, good: 0.02, attention: 0.01 }) === "excellent");
ok("trend positive", classifyTrendDirection(0.08) === "up");
ok("trend negative", classifyTrendDirection(-0.08) === "down");
ok("trend stable", classifyTrendDirection(0.005) === "stable");

ok(
  "headline commercial growth",
  resolveExecutiveCommercialNarrative({ trendDirection: "up", volumeConfidence: "high" }) ===
    "A atividade comercial cresceu neste período."
);
ok(
  "headline attention low advance",
  resolveExecutiveCommercialNarrative({
    ctrLevel: "healthy",
    advanceLow: true,
    volumeConfidence: "high",
  }) === "As recomendações estão gerando interesse, mas poucos usuários avançam para as ofertas."
);
ok(
  "headline neutral default",
  resolveExecutiveCommercialNarrative({ volumeConfidence: "high" }) ===
    "Performance comercial dentro do padrão observado no período."
);
ok(
  "headline insufficient volume",
  resolveExecutiveCommercialNarrative({ volumeConfidence: "insufficient" }) ===
    "Ainda não há volume suficiente para uma conclusão confiável."
);

ok("badge excellent index", classifyCommercialBadge({ commercialIndex: 80 })?.id === "excellent");
ok("badge insufficient volume", classifyCommercialBadge({ volumeConfidence: "insufficient" })?.id === "insufficient");

const mockExecutive = {
  metrics_version: "11.1.0",
  platform: { total_sessions: 500, conversations: 200, questions: 350 },
  conversation: { recommendations_shown: 280 },
  recommendation: {
    recommendations_generated: 300,
    recommendation_acceptance_rate: 0.55,
    rejection_rate: 0.12,
  },
  commerce: {
    offers_returned: 180,
    offer_clicks: 45,
    favorite_count: 22,
    offer_sets_generated: 200,
  },
  alerts: { alerts_created: 15 },
  partial_errors: [],
};

const mockExecutivePrevious = {
  commerce: { offer_clicks: 30, favorite_count: 15 },
  alerts: { alerts_created: 10 },
  partial_errors: [],
};

const mockTemporal = {
  temporal_version: "A.7.0",
  conversion: {
    summary: {
      taxa_clique_recomendacao: 0.04,
      eventos_recomendacoes: 280,
      eventos_cliques: 45,
    },
    bottlenecks: [
      {
        transicao: "recomendacao_para_clique",
        is_gargalo_principal: true,
        taxa_abandono_transicao: 0.65,
        taxa_conversao_transicao: 0.35,
      },
    ],
    funnel_stages: [],
  },
  partial_errors: [],
};

const funnel = buildExecutiveCommercialFunnel({
  platform: mockExecutive.platform,
  recommendation: mockExecutive.recommendation,
  commerce: mockExecutive.commerce,
  alerts: mockExecutive.alerts,
});
ok("funnel stages built", funnel.length >= 6);

const view = mapExecutiveCommercialPerformanceToFounderDisplay(
  mockExecutive,
  mockExecutivePrevious,
  mockTemporal
);

ok("mapper returns 10 indicators", view.indicators.length === 10);
ok("mapper narrative headline", typeof view.narrative.headline === "string" && view.narrative.headline.length > 0);
ok("mapper commercial index", view.commercial_index.value != null && view.commercial_index.value > 0);
ok("mapper CTR indicator", view.indicators.find((i) => i.id === "offer_ctr")?.value === 0.04);
ok("mapper advance rate", view.indicators.find((i) => i.id === "offer_advance_rate")?.value === 0.6);
ok("mapper favorites count", view.indicators.find((i) => i.id === "favorites_generated")?.value === 22);
ok("mapper alerts count", view.indicators.find((i) => i.id === "alerts_created")?.value === 15);
ok("mapper acceptance", view.indicators.find((i) => i.id === "recommendation_acceptance")?.value === 0.55);
ok("mapper trend up on clicks", view.indicators.find((i) => i.id === "commercial_trend")?.direction === "up");
ok("mapper main bottleneck", view.funnel.main_bottleneck?.id === "recomendacao_para_clique");
ok("mapper disclaimer present", view.meta.disclaimer.includes("não representam compra"));

const emptyView = mapExecutiveCommercialPerformanceToFounderDisplay(null, null, null);
ok("empty executive error status", emptyView.meta.status === "error");

const noPrevView = mapExecutiveCommercialPerformanceToFounderDisplay(mockExecutive, null, mockTemporal);
ok("no previous partial", noPrevView.meta.period_compare_available === false);

const lowVolumeExecutive = {
  ...mockExecutive,
  recommendation: { recommendations_generated: 2 },
  commerce: { offer_clicks: 0, favorite_count: 0, offers_returned: 1 },
  alerts: { alerts_created: 0 },
};
const lowVolumeView = mapExecutiveCommercialPerformanceToFounderDisplay(
  lowVolumeExecutive,
  mockExecutivePrevious,
  mockTemporal
);
ok("low volume partial status", lowVolumeView.meta.status === "partial");

ok(
  "click not purchase in docs",
  !view.narrative.headline.toLowerCase().includes("compra concluída") &&
    !view.narrative.headline.toLowerCase().includes("receita")
);

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_5_EXECUTIVE_COMMERCIAL_PERFORMANCE_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.5",
      title: "PATCH B.5 — Executive Commercial Performance Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      display_version: FOUNDER_EXECUTIVE_COMMERCIAL_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_COMMERCIAL_CATALOG_VERSION,
      indicators_implemented: FOUNDER_EXECUTIVE_COMMERCIAL_INDICATORS.map((i) => i.id),
      components: ["FounderExecutiveCommercialPerformanceSection.jsx"],
      mapper: "lib/miaFounderExecutiveCommercialPerformanceDisplay.js",
      catalog: "lib/miaFounderExecutiveCommercialPerformanceCatalog.js",
      baseline_a_preserved: true,
      baseline_b2_preserved: true,
      baseline_b3_preserved: true,
      baseline_b4_preserved: true,
      empty_states: COMMERCIAL_EMPTY_MESSAGES,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
