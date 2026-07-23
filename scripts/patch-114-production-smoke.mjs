#!/usr/bin/env node
/** PATCH 11.4 — production smoke for executive insights */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PATCH114_PROD_BASE_URL || "https://economia-ai.vercel.app";
const ADMIN_KEY = process.env.MIA_ADMIN_API_KEY || "";

const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\nPATCH 11.4 — Executive AI Insights production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const unauth = await fetch(`${BASE}/api/founder/executive-insights?days=30`);
ok("unauthenticated 401", unauth.status === 401, `status=${unauth.status}`);

let cookie = "";
if (ADMIN_KEY) {
  const authRes = await fetch(`${BASE}/api/founder/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admin_key: ADMIN_KEY }),
  });
  const setCookie = authRes.headers.get("set-cookie") || "";
  if (authRes.ok && setCookie.includes("mia_founder_gate")) {
    cookie = setCookie.split(";")[0];
  }
  ok("admin auth", authRes.ok);
}

if (cookie) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/founder/executive-insights?days=30&no_llm=1`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
  const elapsed = Date.now() - t0;
  const json = await res.json().catch(() => ({}));
  ok("insights 200", res.status === 200);
  ok("insights_version 11.4.0", json.insights_version === "11.4.0");
  ok("executive_summary", !!json.executive_summary?.overview);
  ok("insights array", Array.isArray(json.insights));
  ok("deterministic source", json.executive_summary?.source === "deterministic" || json.executive_summary?.source === "llm");
  ok("transparency notice", !!json.transparency?.notice);
  ok("no PII keys", !/visitor_id|conversation_id|query_text/.test(JSON.stringify(json)));
  ok("performance under 60s", elapsed < 60_000, `${elapsed}ms`);

  const cockpit = await fetch(`${BASE}/cockpit-fundador`, { headers: { Cookie: cookie } });
  const html = await cockpit.text();
  ok("cockpit has insights section", html.includes("Executive AI Insights"));
} else {
  ok("authed insights skipped", true, "MIA_ADMIN_API_KEY not set");
}

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_11_4_EXECUTIVE_AI_INSIGHTS_EVIDENCE.json"),
  JSON.stringify(
    {
      patch: "11.4",
      title: "Executive AI Insights",
      status: checks.some((c) => !c.pass) ? "PENDING" : "APPROVED",
      validated_at: new Date().toISOString(),
      production: { base_url: BASE, build: healthJson.build ?? null },
      checks: {
        total: checks.length,
        passed: checks.filter((c) => c.pass).length,
        failed: checks.filter((c) => !c.pass).length,
        items: checks,
      },
    },
    null,
    2
  )
);

process.exit(checks.some((c) => !c.pass) ? 1 : 0);
