#!/usr/bin/env node
/**
 * PATCH 5.1 — Dynamic egress probes via /api/mia-chat (localhost)
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  recognizeMiaIntent,
} from "../lib/miaIntentRecognitionLayer.js";
import {
  buildSocialConversationBehaviorContract,
} from "../lib/miaSocialConversationBehavior.js";
import { resolveSemanticTarget } from "../lib/miaSemanticTargetResolution.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.MIA_PROBE_BASE || "http://localhost:3000";
const OUT_DIR = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-51");
mkdirSync(OUT_DIR, { recursive: true });

const PROBES = [
  { id: "P01", msg: "Oi", family: "greeting" },
  { id: "P02", msg: "Oi, MIA", family: "greeting" },
  { id: "P03", msg: "Tchau, valeu", family: "farewell" },
  { id: "P04", msg: "Linda", family: "ambiguous_social" },
  { id: "P05", msg: "Você é muito inteligente", family: "mia_compliment" },
  { id: "P06", msg: "Quem é você?", family: "about_mia" },
  { id: "P07", msg: "Quero um celular até 2000", family: "commercial" },
  { id: "P08", msg: "Compare iPhone 13 com Galaxy A55", family: "comparison" },
  { id: "P09", msg: "Me ajuda", family: "clarification/vague" },
  { id: "P10", msg: "Show", family: "short_reaction" },
  { id: "P11", msg: "Era ironia", family: "irony_repair" },
  { id: "P12", msg: "Quero um", family: "incomplete_commercial" },
  { id: "P13", msg: "O que você acha do Galaxy A55?", family: "product_opinion" },
  { id: "P14", history: [{ role: "user", content: "Oi, MIA" }, { role: "assistant", content: "Oi!" }], msg: "Linda", family: "b2_turn2" },
  { id: "P15", msg: "Você é ótima, mas quero um celular", family: "mixed" },
];

async function probeOne(scenario) {
  const messages = [
    ...(scenario.history || []),
    { role: "user", content: scenario.msg },
  ];
  const rec = recognizeMiaIntent({
    userMessage: scenario.msg,
    resolvedQuery: scenario.msg,
    sessionContext: {},
    signals: {},
    hasActiveAnchor: false,
  });
  const contract = buildSocialConversationBehaviorContract(rec, {
    message: scenario.msg,
    conversationMessages: scenario.history || [],
    sessionContext: {},
  });
  const target = resolveSemanticTarget({
    message: scenario.msg,
    recognition: rec,
    conversationMessages: scenario.history || [],
    sessionContext: {},
  });

  let http = null;
  try {
    const resp = await fetch(`${BASE}/api/mia-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: scenario.msg,
        user_id: "patch-51-probe",
        conversation_id: `patch51-${scenario.id}-${Date.now()}`,
        messages,
        session_context: {},
      }),
    });
    const data = await resp.json();
    http = {
      status: resp.status,
      reply: String(data?.reply ?? ""),
      reply_empty: !String(data?.reply ?? "").trim(),
      request_id: data?.request_id || null,
      response_path:
        data?.latency_analytics?.response_path ||
        data?.response_outcome_analytics?.response_path ||
        data?.responsePath ||
        null,
      outcome: data?.response_outcome_analytics?.outcome || null,
      validity: data?.response_outcome_analytics?.response_validity || null,
    };
  } catch (e) {
    http = { error: e.message };
  }

  return {
    id: scenario.id,
    msg: scenario.msg,
    family: scenario.family,
    static_contract: {
      primaryIntent: rec.primaryIntent,
      interactionMode: rec.interactionMode,
      primarySocialIntent: rec.primarySocialIntent,
      governedSocialRoutingKey: contract.governedSocialRoutingKey,
      resolvedSemanticTarget: contract.resolvedSemanticTarget ?? target.target,
      targetConfidence: target.confidence,
    },
    http,
  };
}

const results = [];
for (const p of PROBES) {
  results.push(await probeOne(p));
  await new Promise((r) => setTimeout(r, 400));
}

let health = null;
try {
  health = await (await fetch(`${BASE}/api/health`)).json();
} catch {
  health = { error: "health_unavailable" };
}

const out = {
  patch: "5.1",
  base: BASE,
  timestamp: new Date().toISOString(),
  health,
  probes: results,
};
writeFileSync(join(OUT_DIR, "DYNAMIC_EGRESS_PROBES.json"), JSON.stringify(out, null, 2));
console.log("Wrote dynamic probes", results.length, "health", health?.build || health?.error);
