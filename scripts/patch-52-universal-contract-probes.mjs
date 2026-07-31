#!/usr/bin/env node
/**
 * PATCH 5.2 — Local egress probes (localhost + optional production)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-52");
mkdirSync(OUT_DIR, { recursive: true });

const LOCAL = process.env.MIA_PROBE_BASE || "http://localhost:3000/api/mia-chat";
const PROD = "https://economia-ai.vercel.app/api/mia-chat";

const PROBES = [
  { id: "P52-01", msg: "Oi" },
  { id: "P52-04", msg: "Linda" },
  { id: "P52-07", msg: "Quero um celular até 2000" },
  { id: "P52-10", msg: "Show" },
];

async function probe(base, scenario) {
  const messages = [{ role: "user", content: scenario.msg }];
  const res = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: scenario.msg,
      user_id: `patch52-${scenario.id}-${Date.now()}`,
      conversation_id: `patch52-${scenario.id}-${Date.now()}`,
      messages,
      session_context: {},
    }),
  });
  const body = await res.json().catch(() => ({}));
  const debug = body?.mia_debug || {};
  const universal =
    debug?.universal_conversation_response_contract ||
    debug?.pipeline_trace?.universal_conversation_response_contract ||
    null;
  return {
    id: scenario.id,
    msg: scenario.msg,
    status: res.status,
    response_path:
      body?.latency_analytics?.response_path ||
      body?.response_outcome_analytics?.response_path ||
      body?.responsePath ||
      null,
    reply_preview: String(body?.reply || "").slice(0, 80),
    reply_empty: !String(body?.reply || "").trim(),
    universal_contract_trace: universal,
  };
}

async function runSuite(label, base) {
  const results = [];
  for (const p of PROBES) {
    try {
      results.push({ ...(await probe(base, p)), base: label });
    } catch (err) {
      results.push({ id: p.id, msg: p.msg, base: label, error: err.message });
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return results;
}

const local = await runSuite("localhost", LOCAL);
const prod = await runSuite("production", PROD);

const payload = {
  patch: "5.2",
  timestamp: new Date().toISOString(),
  local,
  production: prod,
};

writeFileSync(join(OUT_DIR, "PATCH_52_EGRESS_PROBES.json"), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
