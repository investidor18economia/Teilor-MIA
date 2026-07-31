#!/usr/bin/env node
/**
 * PATCH 5.2 — Closure validation (local API + contract integrity)
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateUniversalContractShape,
  UNIVERSAL_CONVERSATION_RESPONSE_CONTRACT_VERSION,
} from "../lib/miaUniversalConversationResponseContract.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-52");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.MIA_PROBE_BASE || "http://localhost:3000/api/mia-chat";
const PUBLIC_CHECK = process.env.MIA_PUBLIC_CHECK === "1";

const SCENARIOS = [
  { id: "LC01", msg: "Oi", expectPath: null, family: "greeting" },
  { id: "LC02", msg: "Você é muito inteligente", expectPath: null, family: "mia_compliment" },
  {
    id: "LC03",
    history: [{ role: "user", content: "Quero um Galaxy A55" }, { role: "assistant", content: "Encontrei opções." }],
    msg: "Bonito demais",
    family: "b1_product",
  },
  { id: "LC04", msg: "Linda", family: "ambiguous_social" },
  { id: "LC05", msg: "Quem é você?", family: "about_mia" },
  { id: "LC06", msg: "Quero um celular até 2000", family: "commercial" },
  { id: "LC07", msg: "Compare iPhone 13 com Galaxy A55", family: "comparison" },
  {
    id: "LC08",
    msg: "Você é ótima, mas quero um celular",
    family: "mixed",
  },
  { id: "LC09", msg: "Show", family: "short_reaction" },
  {
    id: "LC10",
    history: [{ role: "user", content: "Oi, MIA" }, { role: "assistant", content: "Oi!" }],
    msg: "Linda",
    family: "b2_turn2",
  },
];

async function probe(scenario) {
  const messages = [...(scenario.history || []), { role: "user", content: scenario.msg }];
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: scenario.msg,
      user_id: `patch-52-closure-${scenario.id}-${Date.now()}`,
      conversation_id: `patch52-closure-${scenario.id}-${Date.now()}`,
      messages,
      session_context: scenario.session_context || {},
    }),
  });
  const body = await res.json().catch(() => ({}));
  const debug = body?.mia_debug || {};
  const pipelineTrace = debug?.pipelineTrace || debug?.pipeline_trace || {};
  const universalTrace =
    pipelineTrace?.universal_conversation_response_contract ||
    debug?.universal_conversation_response_contract ||
    null;
  const universalFull = debug?.universal_contract || null;
  const envelope = universalFull || null;
  const shape = envelope ? validateUniversalContractShape(envelope) : null;

  const publicKeys = Object.keys(body || {});
  const leaksDebug = PUBLIC_CHECK && publicKeys.includes("mia_debug");

  return {
    id: scenario.id,
    msg: scenario.msg,
    family: scenario.family,
    status: res.status,
    request_id: body?.request_id || null,
    response_path:
      body?.latency_analytics?.response_path ||
      body?.response_outcome_analytics?.response_path ||
      null,
    reply_preview: String(body?.reply ?? "").slice(0, 120),
    reply_empty: !String(body?.reply ?? "").trim(),
    has_mia_debug: !!body?.mia_debug,
    universal_trace: universalTrace,
    universal_contract_version: envelope?.version || universalTrace?.version || null,
    contract_shape_valid: shape?.valid ?? null,
    contract_violations: shape?.violations || [],
    public_payload_keys: publicKeys.filter((k) => !["reply", "prices", "session_context"].includes(k)),
    leaks_debug_in_public: leaksDebug,
    approved:
      res.status === 200 &&
      !leaksDebug &&
      (envelope ? envelope.version === UNIVERSAL_CONVERSATION_RESPONSE_CONTRACT_VERSION : true),
  };
}

const healthRes = await fetch(`${BASE.replace("/api/mia-chat", "")}/api/health`).catch(() => null);
const health = healthRes ? await healthRes.json().catch(() => ({})) : { error: "unavailable" };

const results = [];
for (const s of SCENARIOS) {
  try {
    results.push(await probe(s));
  } catch (err) {
    results.push({ id: s.id, error: err.message, approved: false });
  }
  await new Promise((r) => setTimeout(r, 1500));
}

const payload = {
  patch: "5.2-closure",
  timestamp: new Date().toISOString(),
  base: BASE,
  mia_debug_expected: process.env.MIA_DEBUG === "true",
  health,
  scenarios: results,
  summary: {
    total: results.length,
    approved: results.filter((r) => r.approved).length,
    http_200: results.filter((r) => r.status === 200).length,
    with_universal_trace: results.filter((r) => r.universal_trace).length,
    contract_shape_valid: results.filter((r) => r.contract_shape_valid === true).length,
  },
};

writeFileSync(join(OUT, "PATCH_52_LOCAL_API_VALIDATION.json"), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload.summary, null, 2));
process.exit(results.every((r) => r.approved || r.status === 200) ? 0 : 1);
