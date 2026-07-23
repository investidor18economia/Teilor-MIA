#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const envFile = join(ROOT, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const BASE = "https://economia-ai.vercel.app";
const sessionId = randomUUID();
const visitorId = randomUUID();
const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const res = await fetch(`${BASE}/api/mia-chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "Quero um celular Samsung bom para jogos até 2500 reais",
    conversation_id: randomUUID(),
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
  }),
});
const json = await res.json();
console.log("status", res.status, "request_id", json.request_id);
console.log("offer_set inline", json.offer_set_analytics);
await new Promise((r) => setTimeout(r, 40000));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

for (const ev of [
  "mia_offer_set",
  "mia_price_intelligence",
  "mia_savings_estimation",
  "mia_anti_regret_foundation",
  "mia_recommendation_decision",
]) {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("event_name,metadata,created_at")
    .eq("session_id", sessionId)
    .eq("event_name", ev)
    .gte("created_at", startedAt);
  if (error) console.log(ev, "error", error.message);
  else console.log(ev, (data || []).length, data?.[0]?.metadata?.event_version || "", data?.[0]?.metadata?.foundation_valid);
}
