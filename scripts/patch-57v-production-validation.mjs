#!/usr/bin/env node
/** PATCH 5.7V — Production API validation + stability */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v");
mkdirSync(OUT, { recursive: true });

const PROD_API = process.env.MIA_PROD_API || "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH = process.env.MIA_HEALTH || "https://economia-ai.vercel.app/api/health";

const { measureVerbalizationQuality } = await import(
  pathToFileURL(join(ROOT, "lib/miaConversationalObservability.js")).href
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function probe(label, messages) {
  const text = messages[messages.length - 1].content;
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      user_id: `p57v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      conversation_id: `p57v-${label}-${Date.now()}`,
      messages,
      session_context: {},
    }),
  });
  const body = await res.json().catch(() => ({}));
  const reply = String(body?.reply ?? "").trim();
  const quality = measureVerbalizationQuality(reply, { behaviorContract: { responseDepth: "brief" } });
  return {
    label,
    status: res.status,
    reply,
    response_path: body?.latency_analytics?.response_path || null,
    intent: body?.intent || null,
    quality: quality.overall,
    signals: quality.signals,
    coldClarification: /me diz rapidinho a que você se refere/i.test(reply),
    staySocialOnRejection: /fico por aqui no papo/i.test(reply) && /não gostei/i.test(text),
    understandsRejection: /(resposta|sugest|opção|recomenda|produto|incomodou|pesou)/i.test(reply),
  };
}

const scenarios = [];
const defs = [
  ["greeting_oi", [{ role: "user", content: "oi" }]],
  ["approval_show", [{ role: "user", content: "show" }]],
  ["rejection_nao_gostei", [{ role: "user", content: "não gostei" }]],
  ["rejection_product", [{ role: "user", content: "não gostei desse celular" }]],
  ["rejection_response", [{ role: "user", content: "não gostei do jeito que você respondeu" }]],
  ["seca_mt", [{ role: "user", content: "oi" }, { role: "assistant", content: "Oi! Tudo bem." }, { role: "user", content: "seca" }]],
  ["commercial", [{ role: "user", content: "Quero um celular até 2000" }]],
  ["mixed_valeu_after", [{ role: "user", content: "Quero um celular" }, { role: "assistant", content: "Posso ajudar." }, { role: "user", content: "valeu" }]],
  ["frustration", [{ role: "user", content: "viajou" }]],
  ["gratitude", [{ role: "user", content: "obrigado" }]],
];

for (const [label, messages] of defs) {
  scenarios.push(await probe(label, messages));
  await sleep(1200);
}

const stabilityKeys = ["greeting_oi", "rejection_nao_gostei", "approval_show", "commercial"];
const stability = [];
for (let run = 1; run <= 10; run++) {
  for (const key of stabilityKeys) {
    const def = defs.find(([l]) => l === key);
    if (!def) continue;
    stability.push({ run, ...(await probe(`${key}_run${run}`, def[1])) });
    await sleep(800);
  }
}

const health = await (await fetch(HEALTH)).json().catch(() => ({}));
const gitCommit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();

const summary = {
  patch: "5.7V",
  timestamp: new Date().toISOString(),
  gitCommit,
  health,
  scenarios,
  stability,
  metrics: {
    avgQuality: scenarios.reduce((a, s) => a + (s.quality || 0), 0) / scenarios.length,
    coldClarificationCount: scenarios.filter((s) => s.coldClarification).length,
    rejectionUnderstood: scenarios.filter((s) => s.label.startsWith("rejection") && s.understandsRejection).length,
    rejectionTotal: scenarios.filter((s) => s.label.startsWith("rejection")).length,
    staySocialOnRejection: scenarios.filter((s) => s.staySocialOnRejection).length,
  },
};

writeFileSync(join(OUT, "PRODUCTION_API_VALIDATION.json"), JSON.stringify(summary, null, 2));
writeFileSync(join(OUT, "STABILITY_RESULTS.json"), JSON.stringify({ stability }, null, 2));
writeFileSync(join(OUT, "PRODUCTION_HEALTH.json"), JSON.stringify(health, null, 2));
console.log(JSON.stringify(summary.metrics, null, 2));
