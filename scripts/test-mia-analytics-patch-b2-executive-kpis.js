#!/usr/bin/env node
/**
 * PATCH B.2 — Executive Strategic KPIs audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapExecutiveMetricsToFounderExecutiveKpis,
  FOUNDER_EXECUTIVE_DISPLAY_VERSION,
} from "../lib/miaFounderExecutiveDisplay.js";
import {
  FOUNDER_EXECUTIVE_KPI_CATALOG,
  FOUNDER_EXECUTIVE_CATALOG_VERSION,
  classifyExecutiveBadge,
} from "../lib/miaFounderExecutiveCatalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("\nPATCH B.2 — Executive Strategic KPIs audit\n");

ok("catalog exists", existsSync(join(ROOT, "lib/miaFounderExecutiveCatalog.js")));
ok("mapper exists", existsSync(join(ROOT, "lib/miaFounderExecutiveDisplay.js")));
ok("component exists", existsSync(join(ROOT, "components/founder-cockpit/FounderExecutiveKpisSection.jsx")));
ok("catalog version B.2.0", FOUNDER_EXECUTIVE_CATALOG_VERSION === "B.2.0");
ok("mapper version B.2.0", FOUNDER_EXECUTIVE_DISPLAY_VERSION === "B.2.0");
ok("catalog defines 10 KPIs", FOUNDER_EXECUTIVE_KPI_CATALOG.length === 10);

const page = read("components/founder-cockpit/FounderCockpitPage.jsx");
const pageInner = page.slice(page.indexOf("function FounderCockpitPageInner"));
ok("cockpit mounts FounderExecutiveKpisSection", page.includes("FounderExecutiveKpisSection"));
ok(
  "executive KPIs above insights",
  pageInner.indexOf("FounderExecutiveKpisSection") < pageInner.indexOf("FounderExecutiveInsights")
);

const cockpitPage = read("pages/cockpit-fundador.jsx");
ok("SSR passes executiveMetrics raw", cockpitPage.includes("executiveMetrics: metrics"));
ok("page uses executiveMetrics prop", cockpitPage.includes("executiveMetrics={executiveMetrics}"));

const css = read("styles/founder-cockpit.css");
ok("executive KPI CSS", css.includes(".founder-executive-kpis"));

// Baseline A contracts frozen
ok("cockpit display still A.2.0", read("lib/miaFounderCockpitDisplay.js").includes('"A.2.0"'));
ok("filters catalog still A.7.0", read("lib/miaFounderFiltersCatalog.js").includes('"A.7.0"'));
ok("charts display still A.8.0", read("lib/miaFounderChartsDisplay.js").includes('"A.8.0"'));
ok("temporal catalog still A.7.0", read("lib/miaTemporalSeriesCatalog.js").includes('"A.7.0"'));
ok("executive API still 11.1.0", read("lib/miaExecutiveMetricsCatalog.js").includes('"11.1.0"'));

for (const route of ["pages/api/executive-metrics.js", "pages/api/temporal-metrics.js"]) {
  ok(`${route} unchanged by B.2`, !read(route).includes("PATCH B.2"));
}

const doc = read("docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md");
ok("dashboard doc mentions B.2", doc.includes("PATCH B.2") || doc.includes("B.2"));

// Mapper unit behavior
const mockExecutive = {
  metrics_version: "11.1.0",
  reference_period_days: 30,
  platform: { total_sessions: 120, unique_visitors: 80, questions: 45 },
  recommendation: { recommendations_generated: 30 },
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
      },
    ],
  },
  conversion: {
    summary: {
      taxa_clique_recomendacao: 0.04,
      conversao_acumulada_visitante: 0.02,
    },
  },
  products: { summary: { distinct_products: 8 } },
  categories: { summary: { distinct_categories: 5 } },
  partial_errors: [],
};

const view = mapExecutiveMetricsToFounderExecutiveKpis(mockExecutive, mockTemporal);
ok("mapper returns 10 KPIs", view.kpis.length === 10);
ok("mapper has 2 groups", view.groups.length === 2);

const activeUsers = view.kpis.find((k) => k.id === "active_users");
ok("active users from temporal DAU", activeUsers?.value === 12);
ok("active users badge growing", activeUsers?.badge?.id === "growing");

const overall = view.kpis.find((k) => k.id === "overall_trend");
ok("overall trend has direction up", overall?.trend?.direction === "up");

const ctr = view.kpis.find((k) => k.id === "ctr");
ok("CTR from conversion summary", ctr?.value === 0.04);

const sessionGrowth = view.kpis.find((k) => k.id === "session_growth");
ok("session volume from executive snapshot", sessionGrowth?.value === 120);
ok("session growth no frontend trend", sessionGrowth?.trend == null);

ok("badge excellent threshold", classifyExecutiveBadge({ trendPct: 0.12 })?.id === "excellent");
ok("badge attention on negative trend", classifyExecutiveBadge({ trendPct: -0.05 })?.id === "attention");

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_B_2_EXECUTIVE_KPIS_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "B.2",
      title: "PATCH B.2 — Executive Strategic KPIs Evidence",
      status: passed === checks.length ? "APPROVED" : "REJECTED",
      validated_at: new Date().toISOString(),
      display_version: FOUNDER_EXECUTIVE_DISPLAY_VERSION,
      catalog_version: FOUNDER_EXECUTIVE_CATALOG_VERSION,
      kpis_implemented: FOUNDER_EXECUTIVE_KPI_CATALOG.map((k) => k.id),
      components: ["FounderExecutiveKpisSection.jsx", "FounderMetricCard (badge/trend extension)"],
      mapper: "lib/miaFounderExecutiveDisplay.js",
      catalog: "lib/miaFounderExecutiveCatalog.js",
      baseline_a_preserved: true,
      checks: { total: checks.length, passed, items: checks },
    },
    null,
    2
  )
);

process.exit(checks.length - passed ? 1 : 0);
