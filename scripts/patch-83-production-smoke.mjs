#!/usr/bin/env node
/**
 * PATCH 8.3 — production smoke (offer set analytics).
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

const BASE = process.env.PATCH83_PROD_BASE_URL || process.env.PATCH82_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH83_PERSIST_WAIT_MS || 22000);

const checks = [];

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

async function fetchOfferSetEvents(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,category,session_id,query_text,metadata,created_at")
    .eq("event_name", "mia_offer_set")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .not("category", "eq", "offer_set_test")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

console.log("\nPATCH 8.3 — production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();

const scenarios = [
  { id: "A", text: "Quero um celular Samsung bom para jogos até 2500 reais", expectOffer: true },
  { id: "B", text: "cadeira gamer ergonômica preta até 1200 reais", expectOffer: true },
  { id: "G", text: "Boa tarde, como você está?", expectOffer: false },
];

for (const s of scenarios) {
  const { status, json } = await postChat({
    text: s.text,
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
  });
  ok(`${s.id} HTTP 200`, status === 200);
  if (s.expectOffer) {
    ok(`${s.id} inline offer_set 8.3`, json?.offer_set_analytics?.offer_set_event_version === "8.3.0");
  } else {
    ok(`${s.id} no offer_set inline`, !json?.offer_set_analytics?.offer_set_event_version);
  }
  await new Promise((r) => setTimeout(r, 3000));
}

console.log(`\nWaiting ${WAIT_MS}ms...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const events = await fetchOfferSetEvents(sessionId, startedAt);
ok("offer_set persisted", events.length >= 1, `count=${events.length}`);
ok("version 8.3.0", events.every((e) => e.metadata?.event_version === "8.3.0"));
ok("no query_text", events.every((e) => !e.query_text));
ok("dedup request_id", new Set(events.map((e) => e.metadata?.request_id)).size === events.length);

for (const e of events) {
  const blob = JSON.stringify(e.metadata || {}).toLowerCase();
  ok(`no secret ${e.metadata?.request_id?.slice(0, 8)}`, !/bearer |sk-[a-z0-9]|api_key/.test(blob));
}

const evidence = {
  patch: "8.3",
  health: { ok: health.ok, build: healthJson.build },
  events: events.map((e) => ({
    request_id: e.metadata?.request_id,
    offer_pipeline_status: e.metadata?.offer_pipeline_status,
    search_path: e.metadata?.search_path,
    delivered_offers_count: e.metadata?.delivered_offers_count,
    winner_present: e.metadata?.winner_present,
    winner_provider_id: e.metadata?.winner_provider_id,
  })),
  checks: { total: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_8_3_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
