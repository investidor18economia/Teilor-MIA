#!/usr/bin/env node
/** PATCH 10.5 — production smoke */
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
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const BASE = process.env.PATCH105_PROD_BASE_URL || "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH105_PERSIST_WAIT_MS || 35000);
const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\nPATCH 10.5 — production smoke\n");
const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const commercial = await fetch(`${BASE}/api/mia-chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "Quero um celular Samsung bom para jogos até 2500 reais",
    conversation_id: randomUUID(),
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
  }),
});
const json = await commercial.json();
ok("commercial HTTP 200", commercial.status === 200);
const requestId = json?.request_id;
ok("request_id present", !!requestId);

console.log(`\nWaiting ${WAIT_MS}ms...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const { data } = await supabase
  .from("analytics_events")
  .select("metadata")
  .eq("event_name", "mia_user_value_outcome")
  .eq("session_id", sessionId)
  .gte("created_at", startedAt)
  .not("category", "eq", "user_value_test");

const row = (data || []).find((e) => e.metadata?.request_id === requestId) || data?.[0];
ok("outcome persisted", (data || []).length >= 1, `count=${data?.length || 0}`);
ok("event_version 10.5.0", row?.metadata?.event_version === "10.5.0");
ok("decision_request_id", row?.metadata?.decision_request_id === requestId);
ok("user_value_score range", row?.metadata?.user_value_score >= 0 && row?.metadata?.user_value_score <= 100);
ok("value_status present", !!row?.metadata?.value_status);
ok("value_type present", !!row?.metadata?.value_type);
ok("verified_value_amount null", row?.metadata?.verified_value_amount == null);
ok("purchase_confirmed false", row?.metadata?.purchase_confirmed === false);
ok("value_verified false", row?.metadata?.value_verified === false);
ok("POTENTIAL/OBSERVED only", ["POTENTIAL", "OBSERVED", "UNKNOWN"].includes(row?.metadata?.value_status));

const blob = JSON.stringify(row?.metadata || {});
ok("privacy scan", !/product_name|https:\/\/|user_email|@/.test(blob));

writeFileSync(
  join(ROOT, "docs/analytics/PATCH_10_5_SAVINGS_OUTCOMES_EVIDENCE.json"),
  JSON.stringify({
    patch: "10.5",
    health: { ok: health.ok, build: healthJson.build },
    request_id: requestId,
    session_id: sessionId,
    outcome_count: data?.length || 0,
    sample: row?.metadata ?? null,
    checks: { total: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length },
  }, null, 2)
);
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
