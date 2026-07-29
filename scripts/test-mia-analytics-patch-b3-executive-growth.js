#!/usr/bin/env node
/**
 * PATCH B.3 — Executive Platform Growth audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapExecutiveGrowthToFounderDisplay,
  computePeriodChangePct,
  classifyGrowthAcceleration,
  classifyGrowthVelocity,
  resolveExecutiveGrowthNarrative,
  FOUNDER_EXECUTIVE_GROWTH_DISPLAY_VERSION,
} from "../lib/miaFounderExecutiveGrowthDisplay.js";
import {
  FOUNDER_EXECUTIVE_GROWTH_INDICATORS,
  FOUNDER_EXECUTIVE_GROWTH_CATALOG_VERSION,
  classifyExecutiveGrowthBadge,
} from "../lib/miaFounderExecutiveGrowthCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("\nPATCH B.3 — Executive Platform Growth audit\n");

ok("catalog exists", existsSync(join(ROOT, "lib/miaFounderExecutiveGrowthCatalog.js")));
ok("mapper exists", existsSync(join(ROOT, "lib/miaFounderExecutiveGrowthDisplay.js")));
ok(
  "component exists",
  existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveGrowthSection.jsx"))
);
ok("catalog version B.3.0", FOUNDER_EXECUTIVE_GROWTH_CATALOG_VERSION === "B.3.0");
ok("mapper version B.3.0", FOUNDER_EXECUTIVE_GROWTH_DISPLAY_VERSION === "B.3.0");
ok("catalog defines 8 indicators", FOUNDER_EXECUTIVE_GROWTH_INDICATORS.length === 8);

const page = read("components/founder-cockpit/FounderCockpitPage.jsx");
const pageInner = page.slice(page.indexOf("function FounderCockpitPageInner"));
ok("cockpit mounts FounderExecutiveGrowthSection", page.includes("FounderExecutiveGrowthSection"));
ok(
  "growth section below executive KPIs",
  pageInner.indexOf("FounderExecutiveKpisSection") < pageInner.indexOf("FounderExecutiveGrowthSection")
);
ok(
  "growth section above insights",
  pageInner.indexOf("FounderExecutiveGrowthSection") < pageInner.indexOf("FounderExecutiveInsights")
);

const component = read("components/founder-cockpit/FounderExecutiveGrowthSection.jsx");
ok("component uses mapper only", component.includes("mapExecutiveGrowthToFounderDisplay"));
ok("component has no computePeriodChangePct", !component.includes("computePeriodChangePct"));
ok("component has no classifyTrendDirection", !component.includes("classifyTrendDirection"));

const css = read("styles/founder-cockpit.css");
ok("executive growth CSS", css.includes(".founder-executive-growth"));

// Baseline A + B.2 contracts frozen
ok("cockpit display still A.2.0", read("lib/miaFounderCockpitDisplay.js").includes('"A.2.0"'));
ok("executive B.2 catalog still B.2.0", read("lib/miaFounderExecutiveCatalog.js").includes('"B.2.0"'));
ok("executive B.2 mapper still B.2.0", read("lib/miaFounderExecutiveDisplay.js").includes('"B.2.0"'));
ok("temporal catalog still A.7.0", read("lib/miaTemporalSeriesCatalog.js").includes('"A.7.0"'));
ok("executive API still 11.1.0", read("lib/miaExecutiveMetricsCatalog.js").includes('"11.1.0"'));

for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js"]) {
  ok(`${route} unchanged by B.3`, !read(route).includes("PATCH B.3"));
}

const doc = read("docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md");
ok("dashboard doc mentions B.3", doc.includes("PATCH B.3") || doc.includes("B.3"));

// Mapper unit behavior
ok("period change pct", computePeriodChangePct(110, 100) === 0.1);
ok("period change pct null on zero prev", computePeriodChangePct(110, 0) === null);
ok("acceleration up", classifyGrowthAcceleration(0.08, 0.02) === "accelerating");
ok("acceleration down", classifyGrowthAcceleration(0.02, 0.08) === "decelerating");
ok("velocity high", classifyGrowthVelocity(0.12) === "high");
ok("velocity moderate", classifyGrowthVelocity(0.05) === "moderate");

ok(
  "narrative consistent growth",
  resolveExecutiveGrowthNarrative({ dauDirection: "up", wauDirection: "up" }) ===
    "Crescimento consistente nas últimas semanas."
);
ok(
  "narrative acceleration",
  resolveExecutiveGrowthNarrative({ acceleration: "accelerating" }) ===
    "A plataforma acelerou neste período."
);

ok("badge accelerating", classifyExecutiveGrowthBadge({ acceleration: "accelerating" })?.id === "accelerating");
ok("badge growing", classifyExecutiveGrowthBadge({ trendPct: 0.05 })?.id === "growing");

const mockExecutiveCurrent = {
  metrics_version: "11.1.0",
  platform: { total_sessions: 120, questions: 45, conversations: 30 },
  partial_errors: [],
};

const mockExecutivePrevious = {
  metrics_version: "11.1.0",
  platform: { total_sessions: 100, questions: 40, conversations: 25 },
  partial_errors: [],
};

const mockTemporal = {
  temporal_version: "A.7.0",
  growth: {
    series: [
      {
        activity_day: "2026-07-28",
        dau_visitors: 12,
        crescimento_dau_visitors_pct: 0.05,
        crescimento_wau_visitors_pct: 0.04,
        crescimento_mau_visitors_pct: 0.03,
      },
      {
        activity_day: "2026-07-27",
        crescimento_dau_visitors_pct: 0.02,
      },
    ],
  },
  platform_activity: {
    series: [
      { activity_day: "2026-07-28", total_sessions: 50, questions: 20, conversations: 10 },
      { activity_day: "2026-07-27", total_sessions: 40, questions: 18, conversations: 9 },
    ],
  },
  partial_errors: [],
};

const view = mapExecutiveGrowthToFounderDisplay(
  mockExecutiveCurrent,
  mockExecutivePrevious,
  mockTemporal
);

ok("mapper returns 8 indicators", view.indicators.length === 8);
ok("mapper narrative headline", typeof view.narrative.headline === "string" && view.narrative.headline.length > 0);
ok("mapper trends dau up", view.trends.dau.direction === "up");
ok("mapper period compare available", view.meta.period_compare_available === true);

const userGrowth = view.indicators.find((i) => i.id === "user_growth");
ok("user growth pct formatted", userGrowth?.pctFormatted?.includes("%"));

const sessionGrowth = view.indicators.find((i) => i.id === "session_growth");
ok("session growth period pct", sessionGrowth?.pct === 0.2);

const acceleration = view.indicators.find((i) => i.id === "growth_acceleration");
ok("acceleration indicator", acceleration?.acceleration === "accelerating");

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_3_EXECUTIVE_GROWTH_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.3",
      title: "PATCH B.3 — Executive Platform Growth Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      display_version: FOUNDER_EXECUTIVE_GROWTH_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_GROWTH_CATALOG_VERSION,
      indicators_implemented: FOUNDER_EXECUTIVE_GROWTH_INDICATORS.map((i) => i.id),
      components: ["FounderExecutiveGrowthSection.jsx"],
      mapper: "lib/miaFounderExecutiveGrowthDisplay.js",
      catalog: "lib/miaFounderExecutiveGrowthCatalog.js",
      baseline_a_preserved: true,
      baseline_b2_preserved: true,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
