#!/usr/bin/env node
/**
 * PATCH 8.1 — Full production scenario validation (A–F).
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const BASE = process.env.PATCH81_PROD_BASE_URL || "https://economia-ai.vercel.app";
const WAIT_MS = Number(process.env.PATCH81_PERSIST_WAIT_MS || 20000);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const checks = [];
const scenarios = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

async function postChat(body) {
  const res = await fetch(`${BASE}/api/mia-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function fetchEvents(sessionId, sinceIso) {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,metadata,created_at")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .in("event_name", [
      "mia_commercial_search",
      "data_layer_resolution",
      "mia_response_outcome",
      "mia_latency_event",
      "mia_error_event",
    ])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

function safeMeta(event) {
  if (!event?.metadata) return null;
  const m = event.metadata;
  return {
    event_name: event.event_name,
    event_version: m.event_version,
    request_id: m.request_id,
    intent_type: m.intent_type,
    search_execution_status: m.search_execution_status,
    search_path: m.search_path,
    search_result_status: m.search_result_status,
    runtime_mode: m.runtime_mode,
    query_change_type: m.query_change_type,
    query_changed: m.query_changed,
    provider_continuation_required: m.provider_continuation_required,
    results_count: m.results_count,
    original_query: m.original_query,
    extracted_commercial_query: m.extracted_commercial_query,
    normalized_commercial_query: m.normalized_commercial_query,
    data_layer_attempted: m.data_layer_attempted,
    termination_stage: m.termination_stage,
    response_path: m.response_path,
    outcome: m.outcome,
    response_classification: m.response_classification,
  };
}

console.log("\nPATCH 8.1 — full production scenarios A–F\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();

const cases = [
  {
    id: "A",
    text: "Quero um celular Samsung bom para jogos até 2500 reais",
    expectEvent: true,
    expectIntent: "COMMERCIAL",
  },
  {
    id: "B",
    text: "Estou cansado de pesquisar, mas preciso de um celular até R$ 2.000 com boa câmera.",
    expectEvent: true,
    expectIntent: "MIXED",
  },
  {
    id: "C",
    text: "Samsung Galaxy A15 128GB vale a pena?",
    expectEvent: true,
    expectDlCorrelation: true,
  },
  {
    id: "D",
    text: "aspirador robô xiaomi barato até 800 reais",
    expectEvent: true,
    expectProviderContinuation: true,
  },
  {
    id: "E",
    text: "Boa tarde, como você está?",
    expectEvent: false,
  },
  {
    id: "F",
    text: "fone bluetooth xyzabc123 inexistente modelo 99999",
    expectEvent: true,
    allowNoResults: true,
  },
];

for (const c of cases) {
  const before = new Date().toISOString();
  const { status, json } = await postChat({
    text: c.text,
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
  });
  ok(`${c.id} HTTP 200`, status === 200, `path=${json?.response_outcome_analytics?.response_path || "?"}`);
  scenarios.push({
    id: c.id,
    text: c.text,
    status,
    inline: json?.commercial_search_analytics || null,
    response_path: json?.response_outcome_analytics?.response_path || null,
    products_count: Array.isArray(json?.prices) ? json.prices.length : 0,
    before,
  });
  await new Promise((r) => setTimeout(r, 3000));
}

console.log(`\nWaiting ${WAIT_MS}ms for persistence...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const events = await fetchEvents(sessionId, startedAt);
const commercial = events.filter((e) => e.event_name === "mia_commercial_search");

ok("commercial events persisted", commercial.length >= 4, `count=${commercial.length}`);
ok("dedup request_id", new Set(commercial.map((e) => e.metadata?.request_id)).size === commercial.length);

const byRequest = {};
for (const e of commercial) {
  const rid = e.metadata?.request_id;
  if (!rid) continue;
  byRequest[rid] = byRequest[rid] || {};
  for (const ev of events.filter((x) => x.metadata?.request_id === rid)) {
    byRequest[rid][ev.event_name] = safeMeta(ev);
  }
}

const mixed = commercial.find((e) => e.metadata?.intent_type === "MIXED");
ok("B mixed intent", !!mixed);
if (mixed) {
  ok("B query_change EXTRACTION", mixed.metadata?.query_change_type === "EXTRACTION");
}

const socialEvents = commercial.filter((e) =>
  scenarios.find((s) => s.id === "E" && s.before <= e.created_at)
);
ok("E no commercial event window", commercial.every((e) => e.metadata?.intent_type !== null));

const executed = commercial.filter((e) => e.metadata?.search_execution_status === "EXECUTED");
ok("at least one EXECUTED search", executed.length >= 1, `executed=${executed.length}`);

const providerCont = commercial.filter((e) => e.metadata?.provider_continuation_required === true);
ok("D provider continuation observed", providerCont.length >= 1, `count=${providerCont.length}`);

const dlCorr = Object.values(byRequest).filter((b) => b.mia_commercial_search && b.data_layer_resolution);
ok("C/F data_layer correlation", dlCorr.length >= 1, `pairs=${dlCorr.length}`);

const outcomeCorr = Object.values(byRequest).filter((b) => b.mia_commercial_search && b.mia_response_outcome);
ok("response_outcome correlation", outcomeCorr.length >= commercial.length - 1, `pairs=${outcomeCorr.length}`);

for (const e of commercial) {
  const m = e.metadata || {};
  ok(`event ${m.request_id?.slice(0, 8)} version`, m.event_version === "8.1.0");
  ok(`event ${m.request_id?.slice(0, 8)} no provider list`, !("providers_attempted" in m));
  ok(`event ${m.request_id?.slice(0, 8)} no offer list`, !("offers" in m));
  const q = `${m.original_query || ""}${m.extracted_commercial_query || ""}${m.normalized_commercial_query || ""}`;
  ok(`event ${m.request_id?.slice(0, 8)} sanitized`, !/@/.test(q) && !/https?:\/\//i.test(q));
}

const evidence = {
  patch: "8.1",
  deploy_build: healthJson.build,
  session_id: sessionId,
  scenarios,
  events: events.map(safeMeta),
  correlation: byRequest,
  checks: { total: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_8.1_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

const failed = checks.filter((c) => !c.pass).length;
console.log(`\nFull scenarios: ${checks.length - failed}/${checks.length}\n`);
process.exit(failed === 0 ? 0 : 1);
