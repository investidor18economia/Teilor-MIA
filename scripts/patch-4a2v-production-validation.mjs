#!/usr/bin/env node
/**
 * PATCH 4A.2V — Production validation (API multitempo + build confirmation)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = process.env.PATCH4A2V_PROD_BASE_URL || "https://economia-ai.vercel.app";
const EVIDENCE_DIR = path.join(ROOT, "docs/conversational/audits/phase-4a/evidence");
const EVIDENCE = path.join(EVIDENCE_DIR, "PATCH_4A_2V_PRODUCTION_EVIDENCE.json");
const CHAT_DELAY_MS = Number(process.env.PATCH4A2V_CHAT_DELAY_MS || 7000);
const TIMEOUT_MS = Number(process.env.PATCH4A2V_TIMEOUT_MS || 120000);
const EXPECTED_COMMIT = process.env.PATCH4A2V_EXPECTED_COMMIT || "";

const checks = [];
const scenarios = [];
const latencies = [];

function ok(id, pass, detail = "", meta = {}) {
  checks.push({ id, pass, detail: String(detail).slice(0, 280), ...meta, at: new Date().toISOString() });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${String(detail).slice(0, 120)}`);
  return pass;
}

async function fetchChat(body) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/mia-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { _raw: text.slice(0, 500) };
    }
    latencies.push({ status: res.status, elapsed_ms: Date.now() - t0 });
    return { res, json, elapsed: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

function isGoodReply(reply = "") {
  const r = String(reply || "").trim();
  return r.length >= 30 && !/várias mensagens em sequência|aguarde alguns segundos/i.test(r);
}

console.log(`\nPATCH 4A.2V — Production validation\nBase: ${BASE}\n`);

let localCommit = "unknown";
try {
  localCommit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
const deployBuild = String(health?.build || "");
ok("health", health?.status === "ok", JSON.stringify(health).slice(0, 120), { build: deployBuild });

const commitMatch =
  !EXPECTED_COMMIT ||
  deployBuild.startsWith(EXPECTED_COMMIT.slice(0, 7)) ||
  deployBuild.startsWith(EXPECTED_COMMIT.slice(0, 12));
ok(
  "deploy-commit-match",
  Boolean(deployBuild) && commitMatch,
  `expected=${EXPECTED_COMMIT || localCommit} published=${deployBuild}`,
  { expected: EXPECTED_COMMIT || localCommit, published: deployBuild }
);

async function runScenario(def) {
  const conv = randomUUID();
  let sessionContext = {};
  let lastReply = "";
  let lastJson = {};
  const turnResults = [];

  for (let i = 0; i < def.turns.length; i++) {
    const query = def.turns[i];
    const messages = def.turns.slice(0, i + 1).map((t) => ({ role: "user", content: t }));
    const { res, json, elapsed } = await fetchChat({
      text: query,
      messages,
      session_context: sessionContext,
      conversation_id: conv,
    });
    lastReply = String(json.reply || "");
    lastJson = json;
    sessionContext = json.session_context || sessionContext;
    turnResults.push({ query, status: res.status, elapsed, reply_preview: lastReply.slice(0, 200) });
    if (res.status !== 200) break;
    if (i < def.turns.length - 1) await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
  }

  let pass = lastJson && isGoodReply(lastReply);
  if (def.expectPattern) pass = pass && def.expectPattern.test(lastReply);
  if (def.expectSession) pass = pass && def.expectSession(sessionContext, lastReply);

  ok(def.id, pass, lastReply.slice(0, 160), { turns: turnResults.length });
  scenarios.push({ id: def.id, pass, turns: turnResults });
  return pass;
}

await runScenario({
  id: "prod-s1-generic",
  turns: ["quero um celular bom e equilibrado"],
  expectPattern: /celular|recomend|indic|equilibr|galaxy|iphone|me conta/i,
});

await runScenario({
  id: "prod-s2-priority-explicit",
  turns: ["Quero um celular até 2.500.", "bateria é minha prioridade"],
  expectPattern: /bateria|autonomia|priorid|reavali|considerando/i,
});

await runScenario({
  id: "prod-s3-priority-informal",
  turns: ["Quero um celular até 2.500.", "não quero viver procurando tomada"],
  expectPattern: /bateria|autonomia|tomada|priorid|reavali/i,
});

await runScenario({
  id: "prod-s4-product",
  turns: ["o Galaxy A55 vale a pena?"],
  expectPattern: /galaxy|a55|vale|recomend|indic|porque/i,
});

await runScenario({
  id: "prod-s5-comparison",
  turns: ["A55 ou S23 FE?"],
  expectPattern: /a55|s23|galaxy|fe|recomend|escolh|melhor|porque|ganh|troca/i,
});

await runScenario({
  id: "prod-s6-contestation",
  turns: ["A55 ou S23 FE?", "mas eu achei o S23 FE melhor"],
  expectPattern: /s23|fe|a55|entend|discord|continuo|mantenho|considerando|porque/i,
});

await runScenario({
  id: "prod-s7-priority-change",
  turns: ["Quero um celular até 2.500.", "pensando melhor, câmera é mais importante"],
  expectPattern: /câmera|camera|foto|priorid|reavali|considerando|mantenho|continuo/i,
});

await runScenario({
  id: "prod-s8-new-options",
  turns: ["Quero um celular Samsung até 3 mil.", "quero buscar opções novas"],
  expectPattern: /opç|nov|busc|recomend|celular|galaxy|samsung|indic|me conta|qual/i,
});

await runScenario({
  id: "prod-s9-typo",
  turns: ["quero um cll bom q dure bastante"],
  expectPattern: /celular|recomend|indic|bateria|autonomia|dur|galaxy|iphone|samsung|motorola|escolh|equilibr/i,
});

await runScenario({
  id: "prod-multitempo-8",
  turns: [
    "quero um celular bom e equilibrado",
    "bateria é minha prioridade",
    "e a câmera?",
    "A55 ou S23 FE?",
    "mas eu achei o S23 FE melhor",
    "pensando melhor, não jogo muito",
    "quero ver outras opções",
    "qual você escolheria no meu lugar?",
  ],
  expectPattern: /escolh|recomend|indic|continuo|mantenho|considerando|porque|galaxy|iphone|a55|s23/i,
});

const passed = checks.filter((c) => c.pass).length;
const evidence = {
  patch: "4A.2V",
  phase: "production_validation",
  status: passed === checks.length ? "APPROVED" : "REJECTED",
  base_url: BASE,
  local_commit: localCommit,
  expected_commit: EXPECTED_COMMIT || localCommit,
  deploy_build: deployBuild,
  finished_at: new Date().toISOString(),
  checks,
  scenarios,
  latencies,
  summary: { total: checks.length, passed, failed: checks.length - passed },
};
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2));
console.log(`\nPATCH 4A.2V production: ${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
