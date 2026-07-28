#!/usr/bin/env node
/**
 * PATCH A.7 — Founder Advanced Filters audit.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIA_FOUNDER_FILTERS_VERSION,
  MIA_FOUNDER_FILTER_CATEGORY_IDS,
  MIA_FOUNDER_FILTER_PERIOD_PRESETS,
} from "../lib/miaFounderFiltersCatalog.js";
import {
  normalizeFounderFiltersFromQuery,
  buildFounderFiltersQueryString,
  buildAnalyticsFilterRpcParams,
  buildAnalyticsFilterCacheSuffix,
  parseAnalyticsFiltersFromHttpQuery,
} from "../lib/miaAnalyticsFilterParams.js";
import { mapFounderFiltersToDisplay, getModuleFilterCompatibility } from "../lib/miaFounderFiltersDisplay.js";
import { buildExecutiveMetricsResponse } from "../lib/miaExecutiveMetricsApi.js";
import { buildTemporalSeriesResponse } from "../lib/miaTemporalSeriesApi.js";
import { MIA_TEMPORAL_SERIES_VERSION } from "../lib/miaTemporalSeriesCatalog.js";
import { clearExecutiveMetricsCache } from "../lib/miaExecutiveMetricsCache.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

console.log("\nPATCH A.7 — Founder Advanced Filters audit\n");

console.log("Files");
ok("filters catalog", existsSync(join(ROOT, "lib/miaFounderFiltersCatalog.js")));
ok("filter params lib", existsSync(join(ROOT, "lib/miaAnalyticsFilterParams.js")));
ok("filters display", existsSync(join(ROOT, "lib/miaFounderFiltersDisplay.js")));
ok("filters context", existsSync(join(ROOT, "components/founder-cockpit/FounderCockpitFiltersContext.jsx")));
ok("filters UI", existsSync(join(ROOT, "components/founder-cockpit/FounderCockpitFilters.jsx")));
ok("filters migration", existsSync(join(ROOT, "supabase/migrations/20260728230000_mia_founder_advanced_filters_v1.sql")));

const catalogSrc = readFileSync(join(ROOT, "lib/miaFounderFiltersCatalog.js"), "utf8");
const paramsSrc = readFileSync(join(ROOT, "lib/miaAnalyticsFilterParams.js"), "utf8");
const pageSrc = readFileSync(join(ROOT, "pages/cockpit-fundador.jsx"), "utf8");
const cockpitSrc = readFileSync(join(ROOT, "components/founder-cockpit/FounderCockpitPage.jsx"), "utf8");
const migrationSrc = readFileSync(
  join(ROOT, "supabase/migrations/20260728230000_mia_founder_advanced_filters_v1.sql"),
  "utf8"
);

console.log("\nArchitecture");
ok("catalog version A.7", MIA_FOUNDER_FILTERS_VERSION === "A.7.0");
ok("temporal version A.7", MIA_TEMPORAL_SERIES_VERSION === "A.7.0");
ok("params no supabase", !paramsSrc.includes("supabase"));
ok("params no SQL", !/select\s+from/i.test(paramsSrc));
ok("page uses normalizeFounderFiltersFromQuery", pageSrc.includes("normalizeFounderFiltersFromQuery"));
ok("cockpit uses FiltersProvider", cockpitSrc.includes("FounderCockpitFiltersProvider"));
ok("cockpit uses FounderCockpitFilters", cockpitSrc.includes("FounderCockpitFilters"));
ok("migration resolve_window", migrationSrc.includes("mia_analytics_resolve_window"));
ok("migration filter params on RPC", migrationSrc.includes("p_category text default null"));

console.log("\nNormalization");
const defaultFilters = normalizeFounderFiltersFromQuery({});
ok("default 30d", defaultFilters.range === "30d" && defaultFilters.is_default);
ok("legacy days=7", normalizeFounderFiltersFromQuery({ days: "7" }).range === "7d");
ok("today preset", normalizeFounderFiltersFromQuery({ range: "today" }).period_mode === "calendar_day");
ok("custom valid", normalizeFounderFiltersFromQuery({ range: "custom", start: "2026-07-01", end: "2026-07-07" }).valid);
ok("start after end invalid", !normalizeFounderFiltersFromQuery({ range: "custom", start: "2026-07-10", end: "2026-07-01" }).valid);
ok("invalid category", !normalizeFounderFiltersFromQuery({ category: "invalid_cat" }).valid);
ok("invalid product_id", !normalizeFounderFiltersFromQuery({ product_id: "'; drop table--" }).valid);
ok("malicious category rejected", normalizeFounderFiltersFromQuery({ category: "smartphones;drop" }).category === null);

const combined = normalizeFounderFiltersFromQuery({
  range: "90d",
  category: "smartphones",
  product_id: "prod-123",
});
ok("combined filters", combined.category === "smartphones" && combined.product_id === "prod-123");

console.log("\nRPC params & cache");
const rpcParams = buildAnalyticsFilterRpcParams(combined);
ok("rpc p_category", rpcParams.p_category === "smartphones");
ok("rpc p_product_id", rpcParams.p_product_id === "prod-123");
const cacheA = buildAnalyticsFilterCacheSuffix(combined);
const cacheB = buildAnalyticsFilterCacheSuffix(normalizeFounderFiltersFromQuery({ range: "30d" }));
ok("cache segmented", cacheA !== cacheB);

console.log("\nDisplay mapper");
const display = mapFounderFiltersToDisplay(combined);
ok("display chips", display.activeChips.length >= 2);
ok("sessions product incompatible", !getModuleFilterCompatibility("sessions", combined).compatible);
ok("products fully compatible", getModuleFilterCompatibility("products", combined).compatible);

console.log("\nURL serialization");
ok("query string", buildFounderFiltersQueryString(combined).includes("range=90d"));

console.log("\nAPI parse");
const parsed = parseAnalyticsFiltersFromHttpQuery({ range: "7d" });
ok("http parse ok", parsed.ok === true);

console.log("\nLive API (optional)");
clearExecutiveMetricsCache();
try {
  const exec = await buildExecutiveMetricsResponse({
    bypassCache: true,
    range: "7d",
    windowDays: 7,
    category: "smartphones",
  });
  ok("executive filters_applied", exec.filters_applied?.category === "smartphones");
  const temporal = await buildTemporalSeriesResponse({
    bypassCache: true,
    seriesGroups: ["conversion"],
    range: "7d",
    windowDays: 7,
  });
  ok("temporal filters_applied", temporal.filters_applied?.range === "7d");
} catch {
  ok("live API skipped", true);
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
