#!/usr/bin/env node
/**
 * PATCH B.6 — Executive Operational Indicators audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapExecutiveOperationalToFounderDisplay,
  computeOperationalAgeMs,
  formatOperationalFreshnessLabel,
  countExecutiveGroupsLoaded,
  computeExecutiveOperationalIndex,
  resolveExecutiveOperationalNarrative,
  FOUNDER_EXECUTIVE_OPERATIONAL_DISPLAY_VERSION,
} from "../lib/miaFounderExecutiveOperationalDisplay.js";
import {
  FOUNDER_EXECUTIVE_OPERATIONAL_INDICATORS,
  FOUNDER_EXECUTIVE_OPERATIONAL_CATALOG_VERSION,
  classifyOperationalFreshness,
  classifyOperationalLatency,
  classifyOperationalBadge,
  OPERATIONAL_EMPTY_MESSAGES,
} from "../lib/miaFounderExecutiveOperationalCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("\nPATCH B.6 — Executive Operational Indicators audit\n");

ok("catalog exists", existsSync(join(ROOT, "lib/miaFounderExecutiveOperationalCatalog.js")));
ok("mapper exists", existsSync(join(ROOT, "lib/miaFounderExecutiveOperationalDisplay.js")));
ok(
  "component exists",
  existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveOperationalSection.jsx"))
);
ok("catalog version B.6.0", FOUNDER_EXECUTIVE_OPERATIONAL_CATALOG_VERSION === "B.6.0");
ok("mapper version B.6.0", FOUNDER_EXECUTIVE_OPERATIONAL_DISPLAY_VERSION === "B.6.0");
ok("catalog defines 9 indicators", FOUNDER_EXECUTIVE_OPERATIONAL_INDICATORS.length === 9);

const page = read("components/founder-cockpit/FounderCockpitPage.jsx");
const pageInner = page.slice(page.indexOf("function FounderCockpitPageInner"));
ok("cockpit mounts FounderExecutiveOperationalSection", page.includes("FounderExecutiveOperationalSection"));
ok(
  "operational below commercial",
  pageInner.indexOf("FounderExecutiveCommercialPerformanceSection") <
    pageInner.indexOf("FounderExecutiveOperationalSection")
);
ok(
  "operational above insights",
  pageInner.indexOf("FounderExecutiveOperationalSection") <
    pageInner.indexOf("FounderExecutiveInsights")
);

const component = read("components/founder-cockpit/FounderExecutiveOperationalSection.jsx");
ok("component uses mapper only", component.includes("mapExecutiveOperationalToFounderDisplay"));
ok("component has no computeExecutiveOperationalIndex", !component.includes("computeExecutiveOperationalIndex"));
ok("component has no classifyOperationalLatency", !component.includes("classifyOperationalLatency"));
ok("component has no resolveExecutiveOperationalNarrative", !component.includes("resolveExecutiveOperationalNarrative"));

const mapperSrc = read("lib/miaFounderExecutiveOperationalDisplay.js");
ok("display no supabase import", !/from\s+['"]@supabase|createClient/i.test(mapperSrc));
ok("display no SQL", !/\bSELECT\b/i.test(mapperSrc));

const css = read("styles/founder-cockpit.css");
ok("operational CSS", css.includes(".founder-executive-operational"));

ok("cockpit display still A.2.0", read("lib/miaFounderCockpitDisplay.js").includes('"A.2.0"'));
ok("B.2 catalog still B.2.0", read("lib/miaFounderExecutiveCatalog.js").includes('"B.2.0"'));
ok("B.3 catalog still B.3.0", read("lib/miaFounderExecutiveGrowthCatalog.js").includes('"B.3.0"'));
ok("B.4 catalog still B.4.0", read("lib/miaFounderExecutiveProductHealthCatalog.js").includes('"B.4.0"'));
ok("B.5 catalog still B.5.0", read("lib/miaFounderExecutiveCommercialPerformanceCatalog.js").includes('"B.5.0"'));
ok("temporal catalog still A.7.0", read("lib/miaTemporalSeriesCatalog.js").includes('"A.7.0"'));
ok("executive API still 11.1.0", read("lib/miaExecutiveMetricsCatalog.js").includes('"11.1.0"'));

for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js"]) {
  ok(`${route} unchanged by B.6`, !read(route).includes("PATCH B.6"));
}

const doc = read("docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md");
ok("dashboard doc mentions B.6", doc.includes("PATCH B.6") || doc.includes("B.6"));

ok(
  "indicators sorted by priority",
  FOUNDER_EXECUTIVE_OPERATIONAL_INDICATORS[0].id === "operational_stability" &&
    FOUNDER_EXECUTIVE_OPERATIONAL_INDICATORS[8].id === "executive_operational_index"
);

// Unit tests — freshness / latency / index
const now = Date.parse("2026-07-23T12:00:00.000Z");
ok("freshness excellent", classifyOperationalFreshness(5 * 60 * 1000) === "excellent");
ok("freshness attention", classifyOperationalFreshness(25 * 60 * 60 * 1000) === "attention");
ok("latency excellent", classifyOperationalLatency(400) === "excellent");
ok("latency attention", classifyOperationalLatency(3500) === "attention");
ok("latency unknown", classifyOperationalLatency(null) === "unknown");
ok("operational index", computeExecutiveOperationalIndex([1, 0.75, 0.75]) === 83);
ok("operational index empty", computeExecutiveOperationalIndex([]) === null);
ok(
  "age ms computed",
  computeOperationalAgeMs("2026-07-23T11:00:00.000Z", now) === 60 * 60 * 1000
);
ok(
  "freshness label minutes",
  formatOperationalFreshnessLabel(30 * 60 * 1000).includes("30 min")
);

ok(
  "narrative all stable",
  resolveExecutiveOperationalNarrative({ allStable: true, servicesNormal: true }) ===
    "A operação permanece estável."
);
ok(
  "narrative services normal",
  resolveExecutiveOperationalNarrative({ servicesNormal: true }) ===
    "Todos os serviços monitorados estão respondendo normalmente."
);
ok(
  "narrative update attention",
  resolveExecutiveOperationalNarrative({ updateStale: true }) ===
    "Há sinais de atenção no tempo de atualização."
);
ok(
  "narrative degradation",
  resolveExecutiveOperationalNarrative({ degradation: true }) ===
    "Existe degradação operacional que merece investigação."
);
ok(
  "narrative environment ok",
  resolveExecutiveOperationalNarrative({ environmentOk: true }) === "O ambiente permanece consistente."
);
ok(
  "narrative default",
  resolveExecutiveOperationalNarrative({}) === "Indicadores operacionais dentro do padrão observado."
);

ok("badge critical", classifyOperationalBadge({ level: "critical" })?.id === "critical");
ok("badge unavailable", classifyOperationalBadge({ unavailable: true })?.id === "unavailable");
ok("badge attention", classifyOperationalBadge({ level: "attention" })?.id === "attention");
ok("badge healthy", classifyOperationalBadge({ level: "healthy" })?.id === "healthy");

const mockExecutive = {
  metrics_version: "11.1.0",
  computed_at: "2026-07-23T11:55:00.000Z",
  system: {
    analytics_version: "11.1.0",
    build_version: "prod-20260723",
    environment: "production",
    last_update: "2026-07-23T11:50:00.000Z",
  },
  performance: { total_duration_ms: 420 },
  platform: { total_sessions: 500 },
  conversation: { recommendations_shown: 200 },
  recommendation: { recommendations_generated: 300 },
  commerce: { offer_clicks: 45 },
  alerts: { alerts_created: 15 },
  price_intelligence: { score: 0.8 },
  savings: { total_saved: 100 },
  anti_regret: { score: 0.7 },
  user_value: { score: 0.6 },
  partial_errors: [],
};

const mockTemporal = {
  temporal_version: "A.7.0",
  partial_errors: [],
  computed_at: "2026-07-23T11:55:00.000Z",
};

const view = mapExecutiveOperationalToFounderDisplay(mockExecutive, mockTemporal);
ok("mapper returns 9 indicators", view.indicators.length === 9);
ok("mapper narrative headline", typeof view.narrative.headline === "string" && view.narrative.headline.length > 0);
ok("mapper operational index", view.operational_index.value != null && view.operational_index.value > 0);
ok("mapper api latency", view.indicators.find((i) => i.id === "api_response_time")?.level === "excellent");
ok("mapper snapshot integrity", view.indicators.find((i) => i.id === "snapshot_integrity")?.level === "excellent");
ok("mapper temporal consistency", view.indicators.find((i) => i.id === "temporal_layer_consistency")?.level === "excellent");
ok("mapper environment", view.indicators.find((i) => i.id === "environment_consistency")?.valueFormatted === "production");
ok("mapper groups loaded", countExecutiveGroupsLoaded(mockExecutive) === 10);

const degradedExecutive = {
  ...mockExecutive,
  performance: { total_duration_ms: 4000 },
  partial_errors: [{ group: "commerce" }, { group: "alerts" }, { group: "savings" }],
};
const degradedView = mapExecutiveOperationalToFounderDisplay(degradedExecutive, {
  ...mockTemporal,
  partial_errors: [{ scope: "growth" }],
});
ok("degraded narrative", degradedView.narrative.headline.includes("degradação"));
ok("degraded partial status", degradedView.meta.status === "partial");

const emptyView = mapExecutiveOperationalToFounderDisplay(null, null);
ok("empty executive error status", emptyView.meta.status === "error");

const noTemporalView = mapExecutiveOperationalToFounderDisplay(mockExecutive, null);
ok(
  "no temporal unavailable label",
  noTemporalView.indicators.find((i) => i.id === "temporal_layer_consistency")?.valueFormatted.includes(
    OPERATIONAL_EMPTY_MESSAGES.temporal_unavailable
  )
);

const missingEnvExecutive = {
  ...mockExecutive,
  system: { ...mockExecutive.system, environment: null },
};
const missingEnvView = mapExecutiveOperationalToFounderDisplay(missingEnvExecutive, mockTemporal);
ok(
  "missing environment message",
  missingEnvView.indicators.find((i) => i.id === "environment_consistency")?.valueFormatted ===
    OPERATIONAL_EMPTY_MESSAGES.environment_missing
);

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_6_EXECUTIVE_OPERATIONAL_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.6",
      title: "PATCH B.6 — Executive Operational Indicators Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      display_version: FOUNDER_EXECUTIVE_OPERATIONAL_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_OPERATIONAL_CATALOG_VERSION,
      indicators_implemented: FOUNDER_EXECUTIVE_OPERATIONAL_INDICATORS.map((i) => i.id),
      components: ["FounderExecutiveOperationalSection.jsx"],
      mapper: "lib/miaFounderExecutiveOperationalDisplay.js",
      catalog: "lib/miaFounderExecutiveOperationalCatalog.js",
      baseline_a_preserved: true,
      baseline_b2_preserved: true,
      baseline_b3_preserved: true,
      baseline_b4_preserved: true,
      baseline_b5_preserved: true,
      empty_states: OPERATIONAL_EMPTY_MESSAGES,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
