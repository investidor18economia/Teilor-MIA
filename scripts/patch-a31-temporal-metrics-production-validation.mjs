#!/usr/bin/env node
/**
 * PATCH A.3.1 — Temporal Metrics API production validation + evidence.
 */
import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanTemporalSeriesForbiddenKeys } from "../lib/miaTemporalSeriesApi.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH_A31_PROD_BASE_URL || "https://economia-ai.vercel.app";
const SQL_CHECKS = [
  "patch-a31-query1-rpc-permissions.sql",
  "patch-a31-query2-growth-rpc-smoke.sql",
  "patch-a31-query3-platform-rpc-smoke.sql",
  "patch-a31-query4-growth-point-shape.sql",
];

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function runSql(file) {
  const out = execSync(`npx supabase db query --linked -f "${join(ROOT, "docs/analytics/sql", file)}" -o json`, {
    cwd: ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(out);
  return parsed.rows || [];
}

async function fetchJson(path) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json().catch(() => ({}));
  return { res, json, duration_ms: Date.now() - started };
}

console.log("\nPATCH A.3.1 — Temporal Metrics production validation\n");

let healthJson = {};
{
  const res = await fetch(`${BASE}/api/health`);
  healthJson = await res.json().catch(() => ({}));
  ok("health 200", res.ok, `build=${healthJson.build}`);
}

try {
  ok("supabase linked", existsSync(join(ROOT, "supabase/.temp/linked-project.json")));
  const permRows = runSql(SQL_CHECKS[0]);
  ok("RPC growth exists", permRows.some((r) => r.function_name === "mia_temporal_series_growth"));
  ok("RPC platform exists", permRows.some((r) => r.function_name === "mia_temporal_series_platform_activity"));
  ok(
    "service_role execute growth",
    permRows.some((r) => r.function_name === "mia_temporal_series_growth" && r.service_role_execute === true)
  );
  ok(
    "service_role execute platform",
    permRows.some((r) => r.function_name === "mia_temporal_series_platform_activity" && r.service_role_execute === true)
  );

  const growthRows = runSql(SQL_CHECKS[1]);
  ok("growth RPC series array", growthRows[0]?.series_type === "array", `points=${growthRows[0]?.point_count}`);
  ok("growth RPC grain day", growthRows[0]?.grain === "day");

  const platformRows = runSql(SQL_CHECKS[2]);
  ok("platform RPC series array", platformRows[0]?.series_type === "array", `points=${platformRows[0]?.point_count}`);
  ok("platform RPC grain day", platformRows[0]?.grain === "day");

  const shapeRows = runSql(SQL_CHECKS[3]);
  if (Number(growthRows[0]?.point_count) > 0) {
    ok("growth point activity_day", shapeRows[0]?.has_activity_day === true);
    ok("growth point dau_visitors", shapeRows[0]?.has_dau_visitors === true);
    ok("growth point wau_visitors", shapeRows[0]?.has_wau_visitors === true);
    ok("growth point mau_visitors", shapeRows[0]?.has_mau_visitors === true);
  } else {
    ok("growth point shape skipped", true, "no points in 30d window");
  }
} catch (err) {
  ok("SQL/RPC validation", false, String(err.message).slice(0, 240));
}

{
  const { res, json, duration_ms } = await fetchJson("/api/temporal-metrics?days=30&fresh=1");
  ok("API default 200", res.status === 200, `status=${res.status}`);
  ok("API temporal_version", json.temporal_version === "A.3.0");
  ok("API granularity day", json.granularity === "day");
  ok("API growth group", json.growth != null || json.partial_errors?.some((e) => e.scope === "growth"));
  ok("API platform group", json.platform_activity != null || json.partial_errors?.some((e) => e.scope === "platform_activity"));
  ok("API response time", duration_ms < 15000, `${duration_ms}ms`);
  ok("API privacy scan", scanTemporalSeriesForbiddenKeys(json).length === 0);
  ok("API has performance", json.performance != null);
}

{
  const { res, json } = await fetchJson("/api/temporal-metrics?days=30&granularity=week&series=growth&fresh=1");
  ok("API week granularity 200", res.status === 200);
  ok("API week granularity value", json.granularity === "week");
  const point = json.growth?.series?.[0];
  ok(
    "API week projection",
    !point || (point.wau_visitors != null && point.dau_visitors == null),
    point ? "projected" : "empty series"
  );
}

{
  const { res, json } = await fetchJson("/api/temporal-metrics?days=30&granularity=month&series=growth&fresh=1");
  ok("API month granularity 200", res.status === 200);
  ok("API month granularity value", json.granularity === "month");
}

{
  const { res, json } = await fetchJson("/api/temporal-metrics?days=7&offset_days=7&series=platform_activity&fresh=1");
  ok("API offset_days 200", res.status === 200);
  ok("API offset_days value", json.period_offset_days === 7);
}

{
  const { res, json } = await fetchJson("/api/temporal-metrics?days=30&series=growth,platform_activity&fresh=1");
  ok("API multi-series 200", res.status === 200);
  ok("API multi-series groups", json.series_groups?.length === 2);
}

{
  const { res, json } = await fetchJson("/api/temporal-metrics?granularity=hour");
  ok("API invalid granularity 400", res.status === 400, json.error || "");
}

{
  const { res, json } = await fetchJson("/api/temporal-metrics?series=invalid_group");
  ok("API invalid series 400", res.status === 400, json.error || "");
}

{
  const first = await fetchJson("/api/temporal-metrics?days=30&series=growth");
  const second = await fetchJson("/api/temporal-metrics?days=30&series=growth");
  ok("API cache miss first", first.json.cache?.hit !== true);
  ok("API cache hit second", second.json.cache?.hit === true);
}

{
  const exec = await fetchJson("/api/executive-metrics?fresh=1");
  ok("executive-metrics regression 200", exec.res.status === 200);
  ok("executive-metrics version", exec.json.metrics_version === "11.1.0");
}

const evidence = {
  patch: "A.3.1",
  closes: "A.3",
  title: "Temporal Metrics API — Production Closure",
  status: checks.some((c) => !c.pass) ? "PENDING" : "APPROVED",
  validated_at: new Date().toISOString(),
  production: {
    base_url: BASE,
    build: healthJson.build ?? null,
    api_path: "/api/temporal-metrics",
    migration: "20260728160000_mia_temporal_series_api_v1.sql",
    migration_applied_via: "supabase db query --linked",
  },
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    items: checks,
  },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_3_1_TEMPORAL_METRICS_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

console.log(`\nSummary: ${evidence.checks.passed}/${evidence.checks.total} passed`);
console.log(`Evidence: docs/analytics/PATCH_A_3_1_TEMPORAL_METRICS_PRODUCTION_EVIDENCE.json\n`);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
