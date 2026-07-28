#!/usr/bin/env node
/**
 * PATCH A.3 — Temporal Series API audit (static + collector smoke).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIA_TEMPORAL_SERIES_VERSION,
  MIA_TEMPORAL_SERIES_GROUPS,
  MIA_TEMPORAL_SERIES_DEFAULT_GROUPS,
  MIA_TEMPORAL_SERIES_RPC,
  MIA_TEMPORAL_SERIES_GRANULARITIES,
  normalizeTemporalGranularity,
  normalizeTemporalWindowDays,
  normalizeTemporalOffsetDays,
  parseTemporalSeriesGroups,
  projectTemporalSeriesByGranularity,
} from "../lib/miaTemporalSeriesCatalog.js";
import {
  buildTemporalSeriesResponse,
  scanTemporalSeriesForbiddenKeys,
} from "../lib/miaTemporalSeriesApi.js";
import { clearExecutiveMetricsCache } from "../lib/miaExecutiveMetricsCache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

console.log("\nPATCH A.3 — Temporal Series API audit\n");

console.log("Files");
ok("migration A.3", existsSync(join(ROOT, "supabase/migrations/20260728160000_mia_temporal_series_api_v1.sql")));
ok("migration A.5 products", existsSync(join(ROOT, "supabase/migrations/20260728210000_mia_temporal_series_products_categories_v1.sql")));
ok("migration A.6 conversion", existsSync(join(ROOT, "supabase/migrations/20260728220000_mia_temporal_series_conversion_v1.sql")));
ok("migration A.7 filters", existsSync(join(ROOT, "supabase/migrations/20260728230000_mia_founder_advanced_filters_v1.sql")));
ok("catalog", existsSync(join(ROOT, "lib/miaTemporalSeriesCatalog.js")));
ok("api lib", existsSync(join(ROOT, "lib/miaTemporalSeriesApi.js")));
ok("route", existsSync(join(ROOT, "pages/api/temporal-metrics.js")));
ok("doc", existsSync(join(ROOT, "docs/analytics/TEMPORAL_METRICS_API.md")));

console.log("\nCatalog");
ok("temporal_version A.7.0", MIA_TEMPORAL_SERIES_VERSION === "A.7.0");
ok("5 series groups", MIA_TEMPORAL_SERIES_GROUPS.length === 5);
ok("5 RPC mappings", Object.keys(MIA_TEMPORAL_SERIES_RPC).length === 5);
ok("default groups backward compat", MIA_TEMPORAL_SERIES_DEFAULT_GROUPS.length === 2);
ok("3 granularities", MIA_TEMPORAL_SERIES_GRANULARITIES.length === 3);
ok("normalize day", normalizeTemporalGranularity("day") === "day");
ok("reject invalid granularity", normalizeTemporalGranularity("hour") === null);
ok("window clamp 365", normalizeTemporalWindowDays(999) === 365);
ok("offset clamp", normalizeTemporalOffsetDays(-5) === 0);
ok("parse all groups default", parseTemporalSeriesGroups(null).length === 2);
ok("parse products only", parseTemporalSeriesGroups("products").join(",") === "products");
ok("parse conversion only", parseTemporalSeriesGroups("conversion").join(",") === "conversion");

console.log("\nGranularity projection");
const sampleGrowthPoint = {
  activity_day: "2026-07-01",
  dau_visitors: 10,
  wau_visitors: 40,
  mau_visitors: 100,
  crescimento_wau_visitors_pct: 0.1,
  crescimento_mau_visitors_pct: 0.05,
};
const weekProjected = projectTemporalSeriesByGranularity([sampleGrowthPoint], "week", "growth")[0];
ok("week projection fields", weekProjected.wau_visitors === 40 && !("dau_visitors" in weekProjected));
const monthProjected = projectTemporalSeriesByGranularity([sampleGrowthPoint], "month", "growth")[0];
ok("month projection fields", monthProjected.mau_visitors === 100 && !("dau_visitors" in monthProjected));
ok("platform ignores week projection", projectTemporalSeriesByGranularity([{ activity_day: "x", questions: 1 }], "week", "platform_activity")[0].questions === 1);

console.log("\nRoute");
const route = readFileSync(join(ROOT, "pages/api/temporal-metrics.js"), "utf8");
ok("GET only", route.includes('validatePublicHttpMethod(req, ["GET"])'));
ok("buildTemporalSeriesResponse", route.includes("buildTemporalSeriesResponse"));
ok("withMiaObservability", route.includes("withMiaObservability"));
ok("no supabase in route", !route.includes("supabase"));
ok("no SQL in route", !/select\s+from/i.test(route));

console.log("\nService layer");
const apiLib = readFileSync(join(ROOT, "lib/miaTemporalSeriesApi.js"), "utf8");
ok("uses executive cache", apiLib.includes("getExecutiveMetricsCache"));
ok("no SQL in service", !/select\s+from/i.test(apiLib));

console.log("\nMigration RPCs");
const migrationA3 = readFileSync(
  join(ROOT, "supabase/migrations/20260728160000_mia_temporal_series_api_v1.sql"),
  "utf8"
);
const migrationA5 = readFileSync(
  join(ROOT, "supabase/migrations/20260728210000_mia_temporal_series_products_categories_v1.sql"),
  "utf8"
);
const migrationA6 = readFileSync(
  join(ROOT, "supabase/migrations/20260728220000_mia_temporal_series_conversion_v1.sql"),
  "utf8"
);
for (const [group, rpc] of Object.entries(MIA_TEMPORAL_SERIES_RPC)) {
  const src =
    group === "products" || group === "categories"
      ? migrationA5
      : group === "conversion"
        ? migrationA6
        : migrationA3;
  ok(`rpc ${rpc}`, src.includes(`function public.${rpc}`));
}
ok("production scope filter", migrationA3.includes("mia_analytics_production_scope"));
ok("service_role grant growth", migrationA3.includes("grant execute on function public.mia_temporal_series_growth"));
ok("dau_visitors field", migrationA3.includes("dau_visitors"));
ok("product_label field", migrationA5.includes("product_label"));
ok("funnel_stages field", migrationA6.includes("funnel_stages"));

console.log("\nCollector (offline / no supabase)");
clearExecutiveMetricsCache();
const offline = await buildTemporalSeriesResponse({ bypassCache: true });
ok("response ok", offline.ok === true);
ok("temporal_version", offline.temporal_version === "A.7.0");
ok("granularity day", offline.granularity === "day");
ok("growth key present", "growth" in offline);
ok("platform_activity key present", "platform_activity" in offline);
ok("products key present", "products" in offline);
ok("categories key present", "categories" in offline);
ok("conversion key present", "conversion" in offline);
ok("privacy scan clean", scanTemporalSeriesForbiddenKeys(offline).length === 0);
ok("partial errors array", Array.isArray(offline.partial_errors));

clearExecutiveMetricsCache();
const invalidGranularity = await buildTemporalSeriesResponse({
  bypassCache: true,
  granularity: "hour",
});
ok("invalid granularity rejected", invalidGranularity.ok === false && invalidGranularity.error === "invalid_granularity");

clearExecutiveMetricsCache();
const growthOnly = await buildTemporalSeriesResponse({
  bypassCache: true,
  seriesGroups: ["growth"],
  granularity: "week",
});
ok("growth only request", growthOnly.ok === true && growthOnly.series_groups?.join(",") === "growth");

clearExecutiveMetricsCache();
const cached = await buildTemporalSeriesResponse({ bypassCache: false });
const cachedHit = await buildTemporalSeriesResponse({ bypassCache: false });
ok("cache hit", cachedHit.cache?.hit === true);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
