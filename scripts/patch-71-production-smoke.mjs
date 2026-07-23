#!/usr/bin/env node
/**
 * PATCH 7.1 — production smoke (real /api/mia-chat + Supabase mia_response_outcome).
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

const BASE = process.env.PATCH71_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCENARIOS = [
  { id: "R1", text: "Olá, tudo bem?", expectOutcome: ["SUCCESS"] },
  { id: "R2", text: "Quero um celular até R$ 2.000 com boa câmera.", expectOutcome: ["SUCCESS", "FALLBACK", "PARTIAL_SUCCESS"] },
  { id: "R3", text: "Qual o melhor Samsung para jogos até R$ 3.000?", expectOutcome: ["SUCCESS", "FALLBACK", "PARTIAL_SUCCESS"] },
  { id: "R4", text: "xyzprodutoquenaoexistemiateilor99999", expectOutcome: ["SUCCESS", "NO_RESULT", "FALLBACK", "PARTIAL_SUCCESS"] },
];

const checks = [];
const evidence = [];

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
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function fetchOutcomeEvents(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,visitor_id,conversation_id,query_text,metadata,created_at")
    .eq("event_name", "mia_response_outcome")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function countRecentProdEvents(sinceIso) {
  if (!supabaseUrl || !serviceKey) return 0;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { count, error } = await supabase
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("event_name", "mia_response_outcome")
    .gte("created_at", sinceIso)
    .not("category", "eq", "reliability_response_test");
  if (error) throw new Error(error.message);
  return count || 0;
}

function sanitizeEvent(event) {
  if (!event) return null;
  return {
    id: event.id,
    event_name: event.event_name,
    category: event.category,
    session_id: event.session_id,
    visitor_id: event.visitor_id,
    conversation_id: event.conversation_id,
    query_text: event.query_text ? String(event.query_text).slice(0, 80) : null,
    created_at: event.created_at,
    metadata: {
      event_version: event.metadata?.event_version ?? null,
      outcome: event.metadata?.outcome ?? null,
      response_validity: event.metadata?.response_validity ?? null,
      response_path: event.metadata?.response_path ?? null,
      http_status: event.metadata?.http_status ?? null,
      request_id: event.metadata?.request_id ?? null,
      endpoint: event.metadata?.endpoint ?? null,
      reply_present: event.metadata?.reply_present ?? null,
      products_in_response: event.metadata?.products_in_response ?? null,
      data_layer_correlation_present: event.metadata?.data_layer_correlation_present ?? null,
    },
  };
}

console.log("\nPATCH 7.1 — production smoke\n");
console.log(`Base URL: ${BASE}`);

const health = await fetch(`${BASE}/api/health`);
ok("production health", health.ok, `status=${health.status}`);

const ui = await fetch(`${BASE}/app-mia`);
ok("MIA UI reachable", ui.ok, `status=${ui.status}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();
let sessionContext = {};
let deployReady = false;

for (const scenario of SCENARIOS) {
  const t0 = new Date().toISOString();
  const { status, json } = await postChat({
    text: scenario.text,
    user_id: "guest",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId, conversation_id: conversationId },
    session_context: sessionContext,
    messages: [],
  });
  sessionContext = json.session_context || sessionContext;
  const summary = json.response_outcome_analytics || null;

  if (summary?.event_version === "7.1.0") {
    deployReady = true;
  }

  await new Promise((r) => setTimeout(r, 5000));
  const events = await fetchOutcomeEvents(sessionId, t0);
  const matchedEvent =
    events.find((event) => event.metadata?.outcome === summary?.outcome) || events.at(-1) || null;

  evidence.push({
    id: scenario.id,
    text: scenario.text,
    at: t0,
    httpStatus: status,
    responseOutcome: summary?.outcome || null,
    responseValidity: summary?.response_validity || null,
    responsePath: summary?.response_path || null,
    hasReply: !!json.reply,
    hasPrices: Array.isArray(json.prices) && json.prices.length > 0,
    persistedEvent: sanitizeEvent(matchedEvent),
  });

  ok(`${scenario.id} chat OK`, status === 200, `status=${status}`);
  ok(`${scenario.id} summary present`, !!summary?.outcome, summary?.outcome || "missing");
  ok(
    `${scenario.id} outcome expected`,
    !summary?.outcome || scenario.expectOutcome.includes(summary.outcome),
    summary?.outcome || "missing"
  );
  ok(`${scenario.id} event persisted`, !!matchedEvent, `events=${events.length}`);
  ok(`${scenario.id} single matching event`, events.filter((e) => e.metadata?.outcome === summary?.outcome).length <= 1, `matches=${events.filter((e) => e.metadata?.outcome === summary?.outcome).length}`);
  if (matchedEvent) {
    ok(`${scenario.id} event_version`, matchedEvent.metadata?.event_version === "7.1.0");
    ok(`${scenario.id} correlation`, matchedEvent.metadata?.outcome === summary?.outcome);
    ok(`${scenario.id} endpoint`, matchedEvent.metadata?.endpoint === "/api/chat-gpt4o");
    ok(`${scenario.id} request_id`, !!matchedEvent.metadata?.request_id);
    ok(`${scenario.id} no secrets`, !JSON.stringify(matchedEvent.metadata || {}).match(/api_key|password|secret/i));
  }

  await new Promise((r) => setTimeout(r, 1500));
}

ok("deploy exposes response_outcome_analytics", deployReady, deployReady ? "7.1.0" : "not yet deployed");

const totalSessionEvents = (await fetchOutcomeEvents(sessionId, startedAt)).length;
ok("session produced events", totalSessionEvents >= SCENARIOS.length, `total=${totalSessionEvents}`);

const prodTotal = await countRecentProdEvents(startedAt);
ok("prod analytics_events incremented", prodTotal >= totalSessionEvents, `prod=${prodTotal}`);

const outcomeSet = new Set(
  evidence.map((e) => e.responseOutcome).filter(Boolean)
);
ok("at least SUCCESS observed", outcomeSet.has("SUCCESS"), [...outcomeSet].join(","));

const reportPath = join(ROOT, "docs/analytics/PATCH_7.1_PRODUCTION_EVIDENCE.json");
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      commit: "e831307",
      base_url: BASE,
      session_id: sessionId,
      conversation_id: conversationId,
      visitor_id: visitorId,
      started_at: startedAt,
      scenarios: evidence,
      outcomes_observed: [...outcomeSet],
      total_session_events: totalSessionEvents,
      prod_events_since_start: prodTotal,
      deploy_ready: deployReady,
    },
    null,
    2
  )
);
console.log(`\nEvidence written: ${reportPath}`);

const passed = checks.filter((c) => c.pass).length;
console.log(`\nProduction smoke: ${passed}/${checks.length}\n`);
process.exit(passed === checks.length ? 0 : 1);
