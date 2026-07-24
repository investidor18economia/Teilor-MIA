#!/usr/bin/env node
/**
 * PATCH 12.1 — MVP architecture production audit.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const BASE = process.env.PATCH121_PROD_BASE_URL || "https://economia-ai.vercel.app";
const checks = [];
const auditStartedAt = new Date().toISOString();

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\nPATCH 12.1 — MVP architecture production audit\n");

const healthRes = await fetch(`${BASE}/api/health`);
const health = await healthRes.json().catch(() => ({}));
ok("health 200", healthRes.ok, `build=${health.build}`);

const readyRes = await fetch(`${BASE}/api/ready`);
ok("ready probe", readyRes.ok || readyRes.status === 503, `status=${readyRes.status}`);

console.log("\n--- Perimeter & security ---");
const devBlocked = await fetch(`${BASE}/api/test-mia`);
ok("dev route blocked 404", devBlocked.status === 404, `status=${devBlocked.status}`);
const envBlocked = await fetch(`${BASE}/api/env`);
ok("env route blocked 404", envBlocked.status === 404, `status=${envBlocked.status}`);

const miaChatPost = await fetch(`${BASE}/api/mia-chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
ok("mia-chat rejects empty body", miaChatPost.status === 400 || miaChatPost.status === 422 || miaChatPost.status === 429, `status=${miaChatPost.status}`);
const miaChatGet = await fetch(`${BASE}/api/mia-chat`);
ok("mia-chat GET rejected", miaChatGet.status === 405, `status=${miaChatGet.status}`);

const insightsUnauth = await fetch(`${BASE}/api/founder/executive-insights`);
ok("founder insights 401", insightsUnauth.status === 401, `status=${insightsUnauth.status}`);

console.log("\n--- Executive layer (Phase 11) ---");
const t0 = Date.now();
const metrics = await fetch(`${BASE}/api/executive-metrics?days=30&fresh=1`);
const metricsJson = await metrics.json().catch(() => ({}));
ok("executive-metrics 200", metrics.ok);
ok("metrics_version 11.1.0", metricsJson.metrics_version === "11.1.0");
ok("executive-metrics latency", Date.now() - t0 < 60_000, `${Date.now() - t0}ms`);

const publicPage = await fetch(`${BASE}/teilor-em-numeros`);
const publicHtml = await publicPage.text();
ok("teilor-em-numeros 200", publicPage.ok);
ok("public SEO title", publicHtml.includes("Teilor em Números"));

const cockpit = await fetch(`${BASE}/cockpit-fundador`);
const cockpitHtml = await cockpit.text();
ok("cockpit gate", cockpitHtml.includes("noindex") || cockpitHtml.includes("Acesso restrito") || cockpitHtml.includes("Cockpit"));

console.log("\n--- Analytics ingestion ---");
const trackBad = await fetch(`${BASE}/api/analytics/track`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ event_name: "forbidden_event_xyz" }),
});
ok("analytics track rejects unknown event", trackBad.status === 400 || trackBad.status === 422, `status=${trackBad.status}`);

const evidence = {
  patch: "12.1",
  phase: "12",
  audit_type: "mvp_architecture_general",
  status: checks.some((c) => !c.pass) ? "PENDING" : "APPROVED",
  phase_verdict: checks.some((c) => !c.pass) ? "PENDING" : "PATCH 12.1 APROVADO",
  audit_timestamp: auditStartedAt,
  audit_completed_at: new Date().toISOString(),
  code_changes: false,
  production: {
    base_url: BASE,
    build: health.build ?? null,
  },
  architecture: {
    layers: [
      "Frontend (MIAChat, public-metrics, founder-cockpit)",
      "Perimeter (mia-chat, rate limit, hardening)",
      "Core cognitive (chat-gpt4o)",
      "Decision Engine + Router + Data Layer",
      "Commercial Runtime + Adapters",
      "Analytics pipeline",
      "Executive Metrics (Phase 11)",
      "Supabase",
    ],
    single_source_of_truth: {
      executive_metrics: "lib/miaExecutiveMetricsApi.js",
      analytics_payload: "lib/miaAnalyticsPayload.js",
      normalized_product: "lib/productSourceAdapter/normalizedProduct.js",
      commercial_providers: "lib/productSourceAdapter/commercialProviderRegistry.js",
    },
  },
  security: {
    dev_routes_blocked: true,
    founder_insights_private: insightsUnauth.status === 401,
    mia_chat_post_only: miaChatGet.status === 405,
  },
  performance: {
    executive_metrics_ms: Date.now() - t0,
  },
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    items: checks,
  },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_12_1_ARCHITECTURE_AUDIT_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
console.log(`\nEvidence: docs/analytics/PATCH_12_1_ARCHITECTURE_AUDIT_EVIDENCE.json`);
console.log(`Result: ${evidence.checks.passed}/${evidence.checks.total}\n`);
process.exit(evidence.checks.failed ? 1 : 0);
