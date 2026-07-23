#!/usr/bin/env node
/**
 * PATCH 11.1 — Executive Metrics API audit (static + collector smoke).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIA_EXECUTIVE_METRICS_VERSION,
  MIA_EXECUTIVE_METRICS_CATEGORIES,
  MIA_EXECUTIVE_METRICS_RPC,
  MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS,
} from "../lib/miaExecutiveMetricsCatalog.js";
import {
  buildExecutiveMetricsResponse,
  scanExecutiveMetricsForbiddenKeys,
} from "../lib/miaExecutiveMetricsApi.js";
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

console.log("\nPATCH 11.1 — Executive Metrics API audit\n");

console.log("Files");
ok("migration", existsSync(join(ROOT, "supabase/migrations/20260723210000_mia_executive_metrics_api_v1.sql")));
ok("catalog", existsSync(join(ROOT, "lib/miaExecutiveMetricsCatalog.js")));
ok("cache", existsSync(join(ROOT, "lib/miaExecutiveMetricsCache.js")));
ok("api lib", existsSync(join(ROOT, "lib/miaExecutiveMetricsApi.js")));
ok("route", existsSync(join(ROOT, "pages/api/executive-metrics.js")));
ok("doc", existsSync(join(ROOT, "docs/analytics/EXECUTIVE_METRICS_API.md")));

console.log("\nCatalog");
ok("metrics_version 11.1.0", MIA_EXECUTIVE_METRICS_VERSION === "11.1.0");
ok("10 categories", MIA_EXECUTIVE_METRICS_CATEGORIES.length === 10);
ok("9 RPC mappings", Object.keys(MIA_EXECUTIVE_METRICS_RPC).length === 9);
ok("forbidden visitor_id", MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS.includes("visitor_id"));
ok("forbidden request_id", MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS.includes("request_id"));

console.log("\nRoute");
const route = readFileSync(join(ROOT, "pages/api/executive-metrics.js"), "utf8");
ok("GET only", route.includes('validatePublicHttpMethod(req, ["GET"])'));
ok("buildExecutiveMetricsResponse", route.includes("buildExecutiveMetricsResponse"));
ok("withMiaObservability", route.includes("withMiaObservability"));

console.log("\nMigration RPCs");
const migration = readFileSync(join(ROOT, "supabase/migrations/20260723210000_mia_executive_metrics_api_v1.sql"), "utf8");
for (const rpc of Object.values(MIA_EXECUTIVE_METRICS_RPC)) {
  ok(`rpc ${rpc}`, migration.includes(`function public.${rpc}`));
}
ok("service_role grant", migration.includes("grant execute on function public.mia_executive_metrics_platform"));

console.log("\nSQL validation files");
for (let i = 1; i <= 5; i++) {
  const file = join(ROOT, "docs/analytics/sql", `patch-111-query${i}-*.sql`);
  const dir = join(ROOT, "docs/analytics/sql");
  const match = readFileSync(join(ROOT, "docs/analytics/sql/patch-111-query1-sessions-questions-consistency.sql"), "utf8").includes("mia_question_sent");
  if (i === 1) ok("patch-111-query1 exists", match);
}
ok("patch-111-query1 file", existsSync(join(ROOT, "docs/analytics/sql/patch-111-query1-sessions-questions-consistency.sql")));

console.log("\nCollector (offline / no supabase)");
clearExecutiveMetricsCache();
const offline = await buildExecutiveMetricsResponse({ bypassCache: true });
ok("response metrics_version", offline.metrics_version === "11.1.0");
ok("system.build_version key", offline.system && "build_version" in offline.system);
ok("privacy scan clean", scanExecutiveMetricsForbiddenKeys(offline).length === 0);
ok("partial errors array", Array.isArray(offline.partial_errors));

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
