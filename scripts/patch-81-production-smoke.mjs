#!/usr/bin/env node
/**
 * PATCH 8.1 — production smoke (commercial search analytics).
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
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH81_PERSIST_WAIT_MS || 18000);

const checks = [];
const evidence = { patch: "8.1", scenarios: [] };

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

async function fetchCommercialSearchEvents(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,metadata,created_at")
    .eq("event_name", "mia_commercial_search")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .not("category", "eq", "commercial_search_test")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

function sanitizeEvent(event) {
  if (!event) return null;
  const m = event.metadata || {};
  return {
    id: event.id,
    created_at: event.created_at,
    metadata: {
      event_version: m.event_version,
      request_id: m.request_id,
      intent_type: m.intent_type,
      search_execution_status: m.search_execution_status,
      search_path: m.search_path,
      search_result_status: m.search_result_status,
      runtime_mode: m.runtime_mode,
      query_change_type: m.query_change_type,
      provider_continuation_required: m.provider_continuation_required,
      results_count: m.results_count,
    },
  };
}

console.log("\nPATCH 8.1 — production smoke\n");
console.log(`Base URL: ${BASE}`);

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("production health", health.ok, `status=${health.status} build=${healthJson?.build || "unknown"}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();

const scenarios = [
  { id: "A", text: "Qual celular Samsung é bom para jogos?", expectEvent: true },
  {
    id: "B",
    text: "Estou cansado de pesquisar, mas preciso de um celular até R$ 2.000 com boa câmera.",
    expectEvent: true,
  },
  { id: "E", text: "Boa tarde, como você está?", expectEvent: false },
];

for (const scenario of scenarios) {
  const before = new Date().toISOString();
  const { status, json } = await postChat({
    text: scenario.text,
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
  });
  ok(`scenario ${scenario.id} HTTP`, status === 200, `status=${status}`);
  ok(
    `scenario ${scenario.id} inline summary`,
    scenario.expectEvent
      ? json?.commercial_search_analytics?.commercial_search_event_version === "8.1.0"
      : !json?.commercial_search_analytics?.commercial_search_event_version,
    JSON.stringify(json?.commercial_search_analytics || {})
  );
  evidence.scenarios.push({
    id: scenario.id,
    text: scenario.text,
    status,
    inline: json?.commercial_search_analytics || null,
    response_path: json?.response_outcome_analytics?.response_path || null,
    before,
  });
}

console.log(`\nWaiting ${WAIT_MS}ms for fire-and-forget persistence...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const events = await fetchCommercialSearchEvents(sessionId, startedAt);
ok("commercial search events persisted", events.length >= 2, `count=${events.length}`);
ok("no duplicate request_id", new Set(events.map((e) => e.metadata?.request_id)).size === events.length);

const mixed = events.find((e) => e.metadata?.intent_type === "MIXED");
ok("mixed intent event", !!mixed, mixed?.metadata?.request_id || "missing");

evidence.events = events.map(sanitizeEvent);
evidence.health = { ok: health.ok, build: healthJson?.build || null };
evidence.summary = {
  total_checks: checks.length,
  passed: checks.filter((c) => c.pass).length,
  failed: checks.filter((c) => !c.pass).length,
};

const outPath = join(ROOT, "docs/analytics/PATCH_8.1_PRODUCTION_EVIDENCE.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));
console.log(`\nEvidence written: ${outPath}`);

const failed = checks.filter((c) => !c.pass).length;
process.exit(failed === 0 ? 0 : 1);
