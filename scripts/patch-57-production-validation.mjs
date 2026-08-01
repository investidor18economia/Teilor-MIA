#!/usr/bin/env node
/** PATCH 5.7 — Production validation (API) for humanization */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57");
mkdirSync(OUT, { recursive: true });

const PROD_API = "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH = "https://economia-ai.vercel.app/api/health";

const { measureVerbalizationQuality } = await import(
  pathToFileURL(join(ROOT, "lib/miaConversationalObservability.js")).href
);
const { MIA_INTERACTION_MODES } = await import(
  pathToFileURL(join(ROOT, "lib/miaIntentRecognitionLayer.js")).href
);

async function probe(label, messages) {
  const text = messages[messages.length - 1].content;
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      user_id: `p57-${Date.now()}`,
      conversation_id: `p57-conv-${label}`,
      messages,
      session_context: {},
    }),
  });
  const body = await res.json().catch(() => ({}));
  const reply = String(body?.reply ?? "").trim();
  const quality = measureVerbalizationQuality(reply, {
    behaviorContract: { interactionMode: MIA_INTERACTION_MODES.SOCIAL, responseDepth: "brief" },
  });
  return {
    label,
    status: res.status,
    reply,
    response_path: body?.latency_analytics?.response_path || null,
    quality: quality.overall,
    signals: quality.signals,
    coldClarification: /me diz rapidinho a que você se refere/i.test(reply),
  };
}

const scenarios = [];

scenarios.push(
  await probe("seca_multiturn", [
    { role: "user", content: "oi" },
    { role: "assistant", content: "Opa!" },
    { role: "user", content: "seca" },
  ])
);

for (const msg of ["oi", "Opa", "show", "não gostei", "valeu", "kkk", "bom dia"]) {
  scenarios.push(await probe(`single_${msg}`, [{ role: "user", content: msg }]));
}

scenarios.push(
  await probe("commercial_control", [{ role: "user", content: "Quero um celular até 2000" }])
);

const health = await (await fetch(HEALTH)).json();
const gitCommit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();

const summary = {
  patch: "5.7",
  timestamp: new Date().toISOString(),
  gitCommit,
  health,
  scenarios,
  metrics: {
    avgQuality: scenarios.reduce((a, s) => a + (s.quality || 0), 0) / scenarios.length,
    coldClarificationCount: scenarios.filter((s) => s.coldClarification).length,
    lowWarmthCount: scenarios.filter((s) => s.signals?.includes("low_warmth")).length,
  },
};

writeFileSync(join(OUT, "PRODUCTION_API_VALIDATION.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.metrics, null, 2));
console.log("seca reply:", scenarios[0].reply);
