#!/usr/bin/env node
/**
 * PATCH 5.2 — Production closure validation
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-52");
mkdirSync(OUT, { recursive: true });

const PROD_API = "https://economia-ai.vercel.app/api/mia-chat";
const PROD_UI = "https://economia-ai.vercel.app/app-mia";
const HEALTH = "https://economia-ai.vercel.app/api/health";

const SCENARIOS = [
  { id: "PR01", msg: "Oi", family: "greeting" },
  { id: "PR02", history: [{ role: "user", content: "Oi, MIA" }, { role: "assistant", content: "Oi!" }], msg: "Linda", family: "b2" },
  { id: "PR03", history: [{ role: "user", content: "Quero um Galaxy A55" }], msg: "Bonito demais", family: "b1" },
  { id: "PR04", msg: "Linda", family: "ambiguous" },
  { id: "PR05", msg: "Quem é você?", family: "about_mia" },
  { id: "PR06", msg: "Quero um celular até 2000", family: "commercial" },
  { id: "PR07", msg: "Compare iPhone 13 com Galaxy A55", family: "comparison" },
  { id: "PR08", msg: "Você é ótima, mas quero um celular", family: "mixed" },
  { id: "PR09", msg: "Show", family: "short" },
  { id: "PR10", msg: "Você é muito inteligente", family: "mia_compliment" },
];

async function probe(scenario) {
  const messages = [...(scenario.history || []), { role: "user", content: scenario.msg }];
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: scenario.msg,
      user_id: `prod52-${scenario.id}-${Date.now()}`,
      conversation_id: `prod52-${scenario.id}-${Date.now()}`,
      messages,
      session_context: {},
    }),
  });
  const body = await res.json().catch(() => ({}));
  const pt = body?.mia_debug?.pipelineTrace || {};
  return {
    id: scenario.id,
    family: scenario.family,
    status: res.status,
    response_path: body?.latency_analytics?.response_path || null,
    reply_preview: String(body?.reply ?? "").slice(0, 100),
    reply_empty: !String(body?.reply ?? "").trim(),
    has_mia_debug: !!body?.mia_debug,
    universal_trace: pt?.universal_conversation_response_contract || null,
    public_leaks_debug: !!body?.mia_debug,
    approved: res.status === 200 && !body?.mia_debug,
  };
}

const health = await (await fetch(HEALTH)).json();
const uiRes = await fetch(PROD_UI);
const uiOk = uiRes.ok;

const results = [];
for (const s of SCENARIOS) {
  results.push(await probe(s));
  await new Promise((r) => setTimeout(r, 2500));
}

const payload = {
  patch: "5.2-closure-production",
  timestamp: new Date().toISOString(),
  health,
  ui: { url: PROD_UI, status: uiRes.status, ok: uiOk },
  scenarios: results,
  summary: {
    total: results.length,
    http_200: results.filter((r) => r.status === 200).length,
    approved: results.filter((r) => r.approved).length,
    no_debug_leak: results.every((r) => !r.public_leaks_debug),
  },
};

writeFileSync(join(OUT, "PATCH_52_PRODUCTION_API_VALIDATION.json"), JSON.stringify(payload, null, 2));
writeFileSync(
  join(OUT, "PATCH_52_PRODUCTION_UI_VALIDATION.json"),
  JSON.stringify(
    {
      patch: "5.2-closure-production-ui",
      timestamp: new Date().toISOString(),
      build: health.build,
      url: PROD_UI,
      status: uiRes.status,
      content_length: (await uiRes.text()).length,
      approved: uiOk && String(health.build || "").startsWith("66973c0"),
    },
    null,
    2
  )
);

console.log(JSON.stringify(payload.summary, null, 2));
process.exit(results.every((r) => r.approved) ? 0 : 1);
