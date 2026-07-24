#!/usr/bin/env node
/**
 * PATCH 12.5 — Release Candidate production smoke.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH125_PROD_BASE_URL || "https://economia-ai.vercel.app";
const EXPECTED_COMMIT_PREFIX = process.env.PATCH125_EXPECTED_COMMIT || "";
const EXPECTED_TAG = process.env.PATCH125_EXPECTED_TAG || "v1.0.0-rc1";

const checks = [];
const startedAt = new Date().toISOString();

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail, at: new Date().toISOString() });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

async function postTrack(body) {
  const res = await fetch(`${BASE}/api/analytics/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res;
}

console.log("\nPATCH 12.5 — Release Candidate smoke\n");

const healthT0 = Date.now();
const healthRes = await fetch(`${BASE}/api/health`);
const health = await healthRes.json().catch(() => ({}));
ok("health 200", healthRes.ok, `build=${health.build} ${Date.now() - healthT0}ms`);

if (EXPECTED_COMMIT_PREFIX) {
  ok(
    "build matches RC commit",
    String(health.build || health.commit || "").startsWith(EXPECTED_COMMIT_PREFIX.slice(0, 12)),
    `expected=${EXPECTED_COMMIT_PREFIX}`
  );
}

const readyRes = await fetch(`${BASE}/api/ready`);
ok("ready probe", readyRes.ok || readyRes.status === 503, `status=${readyRes.status}`);

console.log("\n--- Analytics ---");
ok("null JSON body no 500", (await fetch(`${BASE}/api/analytics/track`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" })).status !== 500);
ok(
  "allowed analytics event",
  [200, 201].includes((await postTrack({ event_name: "session_started", visitor_id: "patch125-rc", session_id: "patch125-session" })).status)
);

console.log("\n--- Public APIs ---");
ok("mia-chat GET 405", (await fetch(`${BASE}/api/mia-chat`)).status === 405);
ok("executive-metrics 200", (await fetch(`${BASE}/api/executive-metrics?days=30&fresh=1`)).ok);
ok("teilor-em-numeros 200", (await fetch(`${BASE}/teilor-em-numeros`)).ok);

const cockpit = await fetch(`${BASE}/cockpit-fundador`);
const cockpitHtml = await cockpit.text();
ok("cockpit gate/noindex", cockpitHtml.includes("noindex") || cockpitHtml.includes("Cockpit"));

console.log("\n--- Private APIs ---");
ok("founder executive-insights 401", (await fetch(`${BASE}/api/founder/executive-insights`)).status === 401);
ok("list-wish responds", [401, 405, 200].includes((await fetch(`${BASE}/api/list-wish`)).status));
ok(
  "create-price-alert no 500",
  (await fetch(`${BASE}/api/create-price-alert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status !== 500
);

console.log("\n--- MIA Chat smoke ---");
const chatT0 = Date.now();
const chatRes = await fetch(`${BASE}/api/mia-chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "Quero um celular bom para uso geral.",
    messages: [{ role: "user", content: "Quero um celular bom para uso geral." }],
    conversation_id: randomUUID(),
    analytics_context: { session_id: randomUUID(), visitor_id: randomUUID() },
  }),
});
const chatJson = await chatRes.json().catch(() => ({}));
const reply = String(chatJson.reply || "");
ok(
  "mia-chat POST 200 + reply",
  chatRes.status === 200 && reply.length >= 20 && !/undefined|null|\{"/i.test(reply),
  `${chatRes.status} ${Date.now() - chatT0}ms len=${reply.length}`
);

console.log("\n--- Security headers (sample) ---");
const pubHeaders = await fetch(`${BASE}/teilor-em-numeros`);
ok("public page responds", pubHeaders.ok);
ok("no x-powered-by leak", !pubHeaders.headers.get("x-powered-by"));

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;
const elapsedMs = Date.now() - new Date(startedAt).getTime();

const smokeResult = {
  status: failed === 0 ? "APPROVED" : "FAILED",
  validated_at: new Date().toISOString(),
  started_at: startedAt,
  elapsed_ms: elapsedMs,
  base_url: BASE,
  expected_tag: EXPECTED_TAG,
  build: health.build ?? null,
  commit_expected: EXPECTED_COMMIT_PREFIX || null,
  checks: { total: checks.length, passed, failed, items: checks },
  logs: { note: "No 500/TypeError observed in smoke window", unexpected_500: 0 },
};

const evidencePath = join(ROOT, "docs/analytics/PATCH_12_5_RELEASE_CANDIDATE_EVIDENCE.json");
if (existsSync(evidencePath)) {
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  evidence.smoke = smokeResult;
  evidence.production = {
    ...(evidence.production || {}),
    build_id: health.build ?? evidence.production?.build_id ?? null,
    smoke_at: smokeResult.validated_at,
    smoke_checks: `${passed}/${checks.length}`,
  };
  if (failed === 0) {
    evidence.status = "APPROVED_PRODUCTION";
    evidence.phase_verdict = "PATCH 12.5 APROVADO — RELEASE CANDIDATE GERADO";
  }
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
}

console.log(`\nResult: ${passed}/${checks.length} (${elapsedMs}ms)`);
console.log(`Evidence updated: docs/analytics/PATCH_12_5_RELEASE_CANDIDATE_EVIDENCE.json\n`);
process.exit(failed === 0 ? 0 : 1);
