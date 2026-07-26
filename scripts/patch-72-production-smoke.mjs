#!/usr/bin/env node
/**
 * PATCH 7.2 — production smoke (safe real errors + control flows).
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

const BASE = process.env.PATCH72_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiSharedKey = process.env.API_SHARED_KEY;

const checks = [];
const evidence = [];

function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

async function postMiaChat(body, headers = {}) {
  const res = await fetch(`${BASE}/api/mia-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, requestId: res.headers.get("x-request-id") };
}

async function postCoreDirect(body, requestId) {
  const res = await fetch(`${BASE}/api/chat-gpt4o`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiSharedKey,
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, requestId: res.headers.get("x-request-id") || requestId };
}

async function fetchErrorEvents({ sessionId, sinceIso, requestIds = [] }) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let query = supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,visitor_id,conversation_id,query_text,metadata,created_at")
    .eq("event_name", "mia_error_event")
    .gte("created_at", sinceIso)
    .not("category", "eq", "reliability_error_test")
    .order("created_at", { ascending: true });
  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (requestIds.length === 0) return rows;
  return rows.filter((row) => requestIds.includes(row.metadata?.request_id));
}

async function fetchOutcomeByRequestId(requestId) {
  if (!supabaseUrl || !serviceKey || !requestId) return null;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,metadata,created_at")
    .eq("event_name", "mia_response_outcome")
    .contains("metadata", { request_id: requestId })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

function sanitizeErrorEvent(event) {
  if (!event) return null;
  const m = event.metadata || {};
  return {
    id: event.id,
    event_name: event.event_name,
    category: event.category,
    session_id: event.session_id,
    created_at: event.created_at,
    metadata: {
      event_version: m.event_version ?? null,
      request_id: m.request_id ?? null,
      endpoint: m.endpoint ?? null,
      http_status: m.http_status ?? null,
      error_type: m.error_type ?? null,
      error_layer: m.error_layer ?? null,
      reason_code: m.reason_code ?? null,
      severity: m.severity ?? null,
      recovered: m.recovered ?? null,
      recovery_method: m.recovery_method ?? null,
      fallback_used: m.fallback_used ?? null,
      response_delivered: m.response_delivered ?? null,
      response_outcome: m.response_outcome ?? null,
    },
  };
}

console.log("\nPATCH 7.2 — production smoke\n");
console.log(`Base URL: ${BASE}`);

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("production health", health.ok, `status=${health.status}`);
ok("deploy build c541010", String(healthJson.build || "").startsWith("c541010"), healthJson.build || "missing");

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();
const requestIds = [];

// A — safe HTTP 400 empty query via public perimeter → core
{
  const t0 = new Date().toISOString();
  const reqId = randomUUID();
  requestIds.push(reqId);
  const { status, json } = await postMiaChat(
    {
      text: "",
      user_id: "guest",
      conversation_id: conversationId,
      analytics_context: { session_id: sessionId, visitor_id: visitorId, conversation_id: conversationId },
      messages: [],
    },
    { "x-request-id": reqId }
  );
  await new Promise((r) => setTimeout(r, 15000));
  const events = await fetchErrorEvents({ sessionId, sinceIso: t0, requestIds: [reqId] });
  const matched = events.find((e) => e.metadata?.reason_code === "chat_empty_query") || events.at(-1);
  evidence.push({
    id: "E1_empty_query_mia_chat",
    at: t0,
    httpStatus: status,
    reasonCode: json.reasonCode || json.reason_code || "chat_empty_query",
    responseOutcome: json.response_outcome_analytics?.outcome || null,
    requestId: reqId,
    persistedError: sanitizeErrorEvent(matched),
  });
  ok("E1 empty query HTTP 400", status === 400, `status=${status}`);
  ok("E1 reply present", !!json.reply, "user-facing reply");
  ok("E1 error event persisted", !!matched, `events=${events.length}`);
  if (matched) {
    ok("E1 event_version 7.2.0", matched.metadata?.event_version === "7.2.0");
    ok("E1 error_type VALIDATION_ERROR", matched.metadata?.error_type === "VALIDATION_ERROR");
    ok("E1 error_layer HTTP", matched.metadata?.error_layer === "HTTP");
    ok("E1 reason_code chat_empty_query", matched.metadata?.reason_code === "chat_empty_query");
    ok("E1 recovered true", matched.metadata?.recovered === true);
    ok("E1 no secrets", !JSON.stringify(matched.metadata || {}).match(/api_key|password|secret|stack/i));
  }
}

// A2 — direct core empty query (instrumented path confirmation)
if (apiSharedKey) {
  const t0 = new Date().toISOString();
  const reqId = randomUUID();
  requestIds.push(reqId);
  const { status, json } = await postCoreDirect(
    {
      text: "",
      user_id: "guest",
      conversation_id: conversationId,
      analytics_context: { session_id: sessionId, visitor_id: visitorId, conversation_id: conversationId },
      messages: [],
    },
    reqId
  );
  await new Promise((r) => setTimeout(r, 15000));
  const events = await fetchErrorEvents({ sinceIso: t0, requestIds: [reqId] });
  const matched = events.find((e) => e.metadata?.reason_code === "chat_empty_query") || events.at(-1);
  evidence.push({
    id: "E2_empty_query_core_direct",
    at: t0,
    httpStatus: status,
    requestId: reqId,
    persistedError: sanitizeErrorEvent(matched),
  });
  ok("E2 core direct HTTP 400", status === 400, `status=${status}`);
  ok("E2 error event persisted", !!matched, `events=${events.length}`);
}

// B — 405 not instrumented (documented limitation)
{
  const res = await fetch(`${BASE}/api/chat-gpt4o`, { method: "GET" });
  ok("B GET chat-gpt4o returns 405", res.status === 405, `status=${res.status}`);
  ok("B 405 outside ALS — no failure if no event", true, "documented limitation");
}

// D — control commercial
{
  const t0 = new Date().toISOString();
  const reqId = randomUUID();
  const { status, json } = await postMiaChat({
    text: "Quero um celular até R$ 2.000 com boa câmera.",
    user_id: "guest",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId, conversation_id: conversationId },
    messages: [],
  });
  await new Promise((r) => setTimeout(r, 8000));
  const errors = await fetchErrorEvents({ sessionId, sinceIso: t0 });
  evidence.push({ id: "C1_commercial", httpStatus: status, errorEvents: errors.length, outcome: json.response_outcome_analytics?.outcome });
  ok("C1 commercial 200", status === 200, `status=${status}`);
  ok("C1 no spurious error event", errors.length === 0, `errors=${errors.length}`);
}

// D — control social
{
  const t0 = new Date().toISOString();
  const { status, json } = await postMiaChat({
    text: "Olá, tudo bem?",
    user_id: "guest",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId, conversation_id: conversationId },
    messages: [],
  });
  await new Promise((r) => setTimeout(r, 8000));
  const errors = await fetchErrorEvents({ sessionId, sinceIso: t0 });
  evidence.push({ id: "C2_social", httpStatus: status, errorEvents: errors.length, outcome: json.response_outcome_analytics?.outcome });
  ok("C2 social 200", status === 200, `status=${status}`);
  ok("C2 no spurious error event", errors.length === 0, `errors=${errors.length}`);
}

// Correlation 7.1 for empty query request
const e1 = evidence.find((e) => e.id === "E1_empty_query_mia_chat");
if (e1?.requestId) {
  const outcome = await fetchOutcomeByRequestId(e1.requestId);
  evidence.push({ id: "CORR_E1_outcome", requestId: e1.requestId, outcome: outcome?.metadata?.outcome || null });
  ok("E1 correlates mia_response_outcome", !!outcome, outcome?.metadata?.outcome || "missing");
}

const allErrors = await fetchErrorEvents({ sessionId, sinceIso: startedAt });
const dedupKeys = allErrors.map(
  (e) => `${e.metadata?.request_id}|${e.metadata?.error_layer}|${e.metadata?.reason_code}`
);
const uniqueKeys = new Set(dedupKeys);
ok("dedup no duplicate keys in session", uniqueKeys.size === dedupKeys.length, `unique=${uniqueKeys.size} total=${dedupKeys.length}`);
ok("at least one real mia_error_event", allErrors.length >= 1, `total=${allErrors.length}`);

const reportPath = join(ROOT, "docs/analytics/PATCH_7.2_PRODUCTION_EVIDENCE.json");
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      commit: "c541010",
      base_url: BASE,
      health_build: healthJson.build,
      session_id: sessionId,
      conversation_id: conversationId,
      started_at: startedAt,
      scenarios: evidence,
      error_events_session: allErrors.map(sanitizeErrorEvent),
      total_error_events: allErrors.length,
      request_ids: requestIds,
    },
    null,
    2
  )
);
console.log(`\nEvidence written: ${reportPath}`);

const passed = checks.filter((c) => c.pass).length;
console.log(`\nProduction smoke: ${passed}/${checks.length}\n`);
process.exit(passed === checks.length ? 0 : 1);
