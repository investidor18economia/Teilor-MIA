#!/usr/bin/env node
/**
 * PATCH 6.4 — correlate manual UI conversations with analytics_events.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

// User tests ~20:05-20:07 BRT (UTC-3). Widen window for clock skew.
const FROM = process.env.PATCH64_INVESTIGATE_FROM || "2026-07-22T22:50:00.000Z";
const TO = process.env.PATCH64_INVESTIGATE_TO || "2026-07-22T23:20:00.000Z";

const TARGET_QUERIES = [
  "Quero um iPhone até R$ 4.000.",
  "Quero uma televisão de 55 polegadas.",
  "quero um samsung bom de bateria",
];

async function fetchEvents(eventName) {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("*")
    .eq("event_name", eventName)
    .gte("created_at", FROM)
    .lte("created_at", TO)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

function normalizeQuery(q) {
  return String(q || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function matchTarget(queryText) {
  const n = normalizeQuery(queryText);
  if (n.includes("iphone") && n.includes("4.000")) return "C1_iphone";
  if (n.includes("televis") && n.includes("55")) return "C2_tv";
  if (n.includes("samsung") && n.includes("bateria")) return "C3_samsung";
  return null;
}

const resolutions = await fetchEvents("data_layer_resolution");
const questions = await fetchEvents("mia_question_sent");
const recommendations = await fetchEvents("mia_recommendation_shown");

const report = {
  window: { from: FROM, to: TO },
  totals: {
    data_layer_resolution: resolutions.length,
    mia_question_sent: questions.length,
    mia_recommendation_shown: recommendations.length,
  },
  scenarios: [],
  all_resolutions: resolutions.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    session_id: row.session_id,
    conversation_id: row.conversation_id,
    query_text: row.query_text,
    category: row.category,
    product_name: row.product_name,
    product_brand: row.product_brand,
    metadata: row.metadata,
  })),
  all_questions: questions.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    session_id: row.session_id,
    conversation_id: row.conversation_id,
    query_text: row.query_text,
    category: row.category,
  })),
  all_recommendations: recommendations.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    session_id: row.session_id,
    query_text: row.query_text,
    product_name: row.product_name,
    metadata: row.metadata,
  })),
};

for (const target of TARGET_QUERIES) {
  const key = matchTarget(target);
  const qEvents = questions.filter((q) => matchTarget(q.query_text) === key);
  const rEvents = resolutions.filter((r) => matchTarget(r.query_text) === key);
  const recEvents = recommendations.filter((r) => matchTarget(r.query_text) === key);

  report.scenarios.push({
    target,
    key,
    mia_question_sent: qEvents,
    data_layer_resolution: rEvents,
    mia_recommendation_shown: recEvents,
  });
}

const outPath = join(ROOT, "docs/analytics/PATCH_6.4_MANUAL_UI_INVESTIGATION.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
