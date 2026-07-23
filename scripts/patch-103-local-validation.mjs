#!/usr/bin/env node
/** Local validation for PATCH 10.3 lifecycle events */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { issueUserSessionToken } from "../lib/miaUserSessionToken.js";

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

const BASE = process.env.PATCH103_LOCAL_BASE_URL || "http://localhost:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testUserId = randomUUID();
const sessionToken = issueUserSessionToken(testUserId, process.env);
const suffix = Date.now();

const createBody = {
  user_id: testUserId,
  user_email: `patch103local+${suffix}@example.com`,
  product_name: `PATCH103 local ${suffix}`,
  product_url: "https://www.amazon.com.br/dp/B0LOCAL103",
  current_price: 799.99,
  target_price: 699.99,
};

const startedAt = new Date().toISOString();
const createRes = await fetch(`${BASE}/api/create-price-alert`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  },
  body: JSON.stringify(createBody),
});
const createJson = await createRes.json();
console.log("create status", createRes.status, createJson.success ? "ok" : createJson);
const alertId = createJson?.data?.[0]?.id;
if (!alertId) process.exit(1);

await new Promise((r) => setTimeout(r, 8000));

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const { data } = await supabase
  .from("analytics_events")
  .select("metadata,created_at")
  .eq("event_name", "mia_price_alert_lifecycle")
  .eq("user_id", testUserId)
  .gte("created_at", startedAt)
  .order("created_at", { ascending: true });

const stages = [...new Set((data || []).map((e) => e.metadata?.lifecycle_stage))];
console.log("alert_id", alertId);
console.log("events", (data || []).length);
console.log("stages", stages.join(", "));
process.exit(stages.includes("REQUESTED") && stages.includes("CREATED") && stages.includes("ACTIVE") ? 0 : 1);
