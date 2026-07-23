#!/usr/bin/env node
/** PATCH 11.1 — production smoke for /api/executive-metrics */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH111_PROD_BASE_URL || "https://economia-ai.vercel.app";

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

function scanForbidden(obj) {
  const blob = JSON.stringify(obj || {}).toLowerCase();
  return /product_name|https:\/\/|query_text|visitor_id|request_id|decision_request_id|conversation_id|alert_id|@gmail/.test(blob);
}

console.log("\nPATCH 11.1 — executive metrics production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const t0 = Date.now();
const res = await fetch(`${BASE}/api/executive-metrics?fresh=1`);
const elapsed = Date.now() - t0;
const json = await res.json().catch(() => ({}));

ok("executive-metrics HTTP 200", res.status === 200, `status=${res.status}`);
ok("metrics_version 11.1.0", json.metrics_version === "11.1.0");
ok("platform group", json.platform != null || json.partial_errors?.some((e) => e.scope === "platform"));
ok("system.build_version", !!json.system?.build_version);
ok("no forbidden keys", !scanForbidden(json));
ok("performance under 30s", elapsed < 30_000, `${elapsed}ms`);

const requiredGroups = [
  "platform",
  "conversation",
  "recommendation",
  "commerce",
  "alerts",
  "price_intelligence",
  "savings",
  "anti_regret",
  "user_value",
];
for (const g of requiredGroups) {
  ok(`group ${g} present or partial`, json[g] != null || json.partial_errors?.find((e) => e.scope === g));
}

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_11_1_EXECUTIVE_METRICS_API_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "11.1",
      health: { ok: health.ok, build: healthJson.build },
      api: { elapsed_ms: elapsed, metrics_version: json.metrics_version, partial_errors: json.partial_errors ?? [] },
      sample: {
        platform: json.platform,
        system: json.system,
      },
      checks: { total: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length },
    },
    null,
    2
  )
);

process.exit(checks.some((c) => !c.pass) ? 1 : 0);
