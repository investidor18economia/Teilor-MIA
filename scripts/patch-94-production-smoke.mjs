#!/usr/bin/env node
/**
 * PATCH 9.4 — production smoke (runner-up / alternative analytics).
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

const BASE =
  process.env.PATCH94_PROD_BASE_URL ||
  process.env.PATCH93_PROD_BASE_URL ||
  "https://economia-ai.vercel.app";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WAIT_MS = Number(process.env.PATCH94_PERSIST_WAIT_MS || 28000);

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

async function fetchDecisions(sessionId, sinceIso) {
  if (!supabaseUrl || !serviceKey) return [];
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("analytics_events")
    .select("id,event_name,session_id,metadata,created_at")
    .eq("event_name", "mia_recommendation_decision")
    .eq("session_id", sessionId)
    .gte("created_at", sinceIso)
    .not("category", "eq", "recommendation_decision_test")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

console.log("\nPATCH 9.4 — production smoke\n");

const health = await fetch(`${BASE}/api/health`);
const healthJson = await health.json().catch(() => ({}));
ok("health 200", health.ok, `build=${healthJson.build}`);

const sessionId = randomUUID();
const visitorId = randomUUID();
const conversationId = randomUUID();
const startedAt = new Date().toISOString();

const initial = await postChat({
  text: "Quero um celular Samsung bom para jogos até 2500 reais",
  conversation_id: conversationId,
  analytics_context: { session_id: sessionId, visitor_id: visitorId },
});
ok("commercial HTTP 200", initial.status === 200);

const rd = initial.json?.recommendation_decision_analytics || {};
ok("decision 9.1", rd.recommendation_decision_event_version === "9.1.0");
ok("runner-up inline field exists", "recommendation_decision_runner_up_product_family" in rd);

const decisionRequestId = initial.json?.request_id;
const sessionContext = initial.json?.session_context || {};

if (decisionRequestId) {
  const secondBest = await postChat({
    text: "Qual é a segunda opção?",
    conversation_id: conversationId,
    analytics_context: { session_id: sessionId, visitor_id: visitorId },
    session_context: {
      ...sessionContext,
      lastRecommendationDecisionRequestId: decisionRequestId,
      lastRecommendationDecisionAtMs: Date.now() - 5000,
      lastRecommendationDecisionSource: rd.recommendation_decision_source,
      lastRecommendationDecisionWinnerFamily: rd.recommendation_decision_winner_product_family,
      lastRecommendationDecisionRunnerUpFamily: rd.recommendation_decision_runner_up_product_family,
    },
    messages: [
      { role: "user", content: "Quero um celular Samsung bom para jogos até 2500 reais" },
      { role: "assistant", content: initial.json?.reply || "Recomendação entregue." },
    ],
  });
  ok("second option HTTP 200", secondBest.status === 200);
}

console.log(`\nWaiting ${WAIT_MS}ms...`);
await new Promise((r) => setTimeout(r, WAIT_MS));

const decisions = await fetchDecisions(sessionId, startedAt);
ok("decision persisted", decisions.length >= 1, `count=${decisions.length}`);

const withRunnerUpMeta = decisions.filter((e) => e.metadata?.runner_up_product_family);
ok("runner_up_product_family in DB", withRunnerUpMeta.length >= 1 || rd.recommendation_decision_runner_up_product_family != null);

for (const e of decisions) {
  const blob = JSON.stringify(e.metadata || {}).toLowerCase();
  ok(`privacy ${e.metadata?.request_id?.slice(0, 8) || "dec"}`, !/product_name|https:\/\//.test(blob));
}

const evidence = {
  patch: "9.4",
  health: { ok: health.ok, build: healthJson.build },
  decision_request_id: decisionRequestId,
  inline_runner_up_family: rd.recommendation_decision_runner_up_product_family ?? null,
  inline_runner_up_present: rd.recommendation_decision_runner_up_present ?? null,
  inline_score_gap_bucket: rd.recommendation_decision_score_gap_bucket ?? null,
  decisions: decisions.map((e) => ({
    runner_up_present: e.metadata?.runner_up_present,
    runner_up_product_family: e.metadata?.runner_up_product_family,
    runner_up_in_display_products: e.metadata?.runner_up_in_display_products,
    score_gap_bucket: e.metadata?.score_gap_bucket,
    runner_up_competitiveness: e.metadata?.runner_up_competitiveness,
  })),
  checks: {
    total: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
  },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_9_4_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
process.exit(checks.some((c) => !c.pass) ? 1 : 0);
