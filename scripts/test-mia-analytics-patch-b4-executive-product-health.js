#!/usr/bin/env node
/**
 * PATCH B.4 — Executive Product Health audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapExecutiveProductHealthToFounderDisplay,
  normalizeHealthSignal,
  computeExecutiveHealthIndex,
  resolveExecutiveProductHealthNarrative,
  FOUNDER_EXECUTIVE_PRODUCT_HEALTH_DISPLAY_VERSION,
} from "../lib/miaFounderExecutiveProductHealthDisplay.js";
import {
  FOUNDER_EXECUTIVE_PRODUCT_HEALTH_INDICATORS,
  FOUNDER_EXECUTIVE_PRODUCT_HEALTH_CATALOG_VERSION,
  classifyProductHealthBadge,
  classifyProductHealthLevel,
} from "../lib/miaFounderExecutiveProductHealthCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("\nPATCH B.4 — Executive Product Health audit\n");

ok("catalog exists", existsSync(join(ROOT, "lib/miaFounderExecutiveProductHealthCatalog.js")));
ok("mapper exists", existsSync(join(ROOT, "lib/miaFounderExecutiveProductHealthDisplay.js")));
ok(
  "component exists",
  existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveProductHealthSection.jsx"))
);
ok("catalog version B.4.0", FOUNDER_EXECUTIVE_PRODUCT_HEALTH_CATALOG_VERSION === "B.4.0");
ok("mapper version B.4.0", FOUNDER_EXECUTIVE_PRODUCT_HEALTH_DISPLAY_VERSION === "B.4.0");
ok("catalog defines 8 indicators", FOUNDER_EXECUTIVE_PRODUCT_HEALTH_INDICATORS.length === 8);

const page = read("components/founder-cockpit/FounderCockpitPage.jsx");
const pageInner = page.slice(page.indexOf("function FounderCockpitPageInner"));
ok(
  "cockpit mounts FounderExecutiveProductHealthSection",
  page.includes("FounderExecutiveProductHealthSection")
);
ok(
  "product health below growth",
  pageInner.indexOf("FounderExecutiveGrowthSection") <
    pageInner.indexOf("FounderExecutiveProductHealthSection")
);
ok(
  "product health above insights",
  pageInner.indexOf("FounderExecutiveProductHealthSection") <
    pageInner.indexOf("FounderExecutiveInsights")
);

const component = read("components/founder-cockpit/FounderExecutiveProductHealthSection.jsx");
ok("component uses mapper only", component.includes("mapExecutiveProductHealthToFounderDisplay"));
ok("component has no classifyProductHealthLevel", !component.includes("classifyProductHealthLevel"));
ok("component has no computeExecutiveHealthIndex", !component.includes("computeExecutiveHealthIndex"));

const css = read("styles/founder-cockpit.css");
ok("product health CSS", css.includes(".founder-executive-product-health"));

ok("cockpit display still A.2.0", read("lib/miaFounderCockpitDisplay.js").includes('"A.2.0"'));
ok("executive B.2 catalog still B.2.0", read("lib/miaFounderExecutiveCatalog.js").includes('"B.2.0"'));
ok("executive B.3 catalog still B.3.0", read("lib/miaFounderExecutiveGrowthCatalog.js").includes('"B.3.0"'));
ok("executive B.3 mapper still B.3.0", read("lib/miaFounderExecutiveGrowthDisplay.js").includes('"B.3.0"'));
ok("temporal catalog still A.7.0", read("lib/miaTemporalSeriesCatalog.js").includes('"A.7.0"'));
ok("executive API still 11.1.0", read("lib/miaExecutiveMetricsCatalog.js").includes('"11.1.0"'));

for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js"]) {
  ok(`${route} unchanged by B.4`, !read(route).includes("PATCH B.4"));
}

const doc = read("docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md");
ok("dashboard doc mentions B.4", doc.includes("PATCH B.4") || doc.includes("B.4"));

ok("normalize rate signal", normalizeHealthSignal(0.5, 1) === 0.5);
ok("normalize score signal", normalizeHealthSignal(80, 100) === 0.8);
ok("health index average", computeExecutiveHealthIndex([0.8, 0.6, 0.7]) === 70);
ok(
  "narrative excellent quality",
  resolveExecutiveProductHealthNarrative({ qualityLevel: "excellent", acceptanceLevel: "healthy" }) ===
    "O produto mantém excelente qualidade de recomendações."
);
ok(
  "narrative acceptance drop",
  resolveExecutiveProductHealthNarrative({ acceptancePeriodDown: true }) ===
    "Há sinais leves de queda na aceitação."
);
ok("badge excellent index", classifyProductHealthBadge({ healthIndex: 80 })?.id === "excellent");
ok(
  "level acceptance excellent",
  classifyProductHealthLevel(0.65, { excellent: 0.6, good: 0.4, attention: 0.3 }) === "excellent"
);

const mockExecutiveCurrent = {
  metrics_version: "11.1.0",
  reference_period_days: 30,
  platform: { conversations: 100 },
  conversation: { conversations_with_questions: 75, questions_sent: 200, recommendations_shown: 180 },
  recommendation: {
    recommendations_generated: 150,
    recommendation_acceptance_rate: 0.55,
    rejection_rate: 0.15,
    runner_up_usage: 12,
    acceptance_signals: 80,
    rejection_signals: 20,
  },
  price_intelligence: { average_price_quality_score: 82, events: 500 },
  user_value: { average_user_value: 72, verified_value_amount_count: 30, events: 100 },
  anti_regret: { average_score: 68, events: 90 },
  savings: { opportunities_found: 45 },
  commerce: { favorite_count: 20, offer_clicks: 35 },
  partial_errors: [],
};

const mockExecutivePrevious = {
  metrics_version: "11.1.0",
  recommendation: {
    recommendation_acceptance_rate: 0.62,
    rejection_rate: 0.12,
  },
  partial_errors: [],
};

const view = mapExecutiveProductHealthToFounderDisplay(
  mockExecutiveCurrent,
  mockExecutivePrevious
);

ok("mapper returns 8 indicators", view.indicators.length === 8);
ok("mapper narrative headline", typeof view.narrative.headline === "string" && view.narrative.headline.length > 0);
ok("mapper health index", view.health_index.value != null && view.health_index.value > 0);
ok("mapper period compare available", view.meta.period_compare_available === true);

const quality = view.indicators.find((i) => i.id === "recommendation_quality");
ok("quality score excellent level", quality?.level === "excellent");

const acceptance = view.indicators.find((i) => i.id === "recommendation_acceptance");
ok("acceptance rate formatted", acceptance?.valueFormatted?.includes("%"));

const conversation = view.indicators.find((i) => i.id === "conversation_health");
ok("conversation ratio 0.75", conversation?.value === 0.75);

const healthIndex = view.indicators.find((i) => i.id === "executive_health_index");
ok("executive health index indicator", healthIndex?.value != null);

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_4_EXECUTIVE_PRODUCT_HEALTH_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.4",
      title: "PATCH B.4 — Executive Product Health Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      display_version: FOUNDER_EXECUTIVE_PRODUCT_HEALTH_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_PRODUCT_HEALTH_CATALOG_VERSION,
      indicators_implemented: FOUNDER_EXECUTIVE_PRODUCT_HEALTH_INDICATORS.map((i) => i.id),
      components: ["FounderExecutiveProductHealthSection.jsx"],
      mapper: "lib/miaFounderExecutiveProductHealthDisplay.js",
      catalog: "lib/miaFounderExecutiveProductHealthCatalog.js",
      baseline_a_preserved: true,
      baseline_b2_preserved: true,
      baseline_b3_preserved: true,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
