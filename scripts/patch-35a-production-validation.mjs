#!/usr/bin/env node
/**
 * PATCH 3.5a — Production validation (Decision Facts & Commercial Explanation)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH35A_PROD_BASE_URL || "https://economia-ai.vercel.app";
const CHAT_DELAY_MS = Number(process.env.PATCH35A_CHAT_DELAY_MS || 5500);
const TIMEOUT_MS = Number(process.env.PATCH35A_TIMEOUT_MS || 120000);

const checks = [];
const scenarios = [];
const latencies = [];
const startedAt = new Date().toISOString();

const SHALLOW = /^(faz sentido pelo que voc[eê] trouxe|esse ponto pesa na decis[aã]o|entendo o contexto|entendi|certo|ok|boa)\.?$/i;

function ok(id, pass, detail = "", severity = "P0") {
  checks.push({ id, pass, detail, severity, at: new Date().toISOString() });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${detail}`);
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

function isRichCommercialReply(reply = "") {
  const r = String(reply || "").trim();
  if (r.length < 40) return false;
  if (SHALLOW.test(r.split("\n")[0])) return false;
  return /reavali|mantenho|mudaria|orçamento|marca|uso|recomend|lider|passa a|continua|tradeoff|porque|pois/i.test(
    r
  );
}

console.log(`\nPATCH 3.5a — Production validation\nBase: ${BASE}\n`);

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
ok("health", health?.status === "ok" || health?.ok === true, JSON.stringify(health).slice(0, 120));

async function runMultiTurn(def) {
  const conv = randomUUID();
  let sessionContext = {};
  let lastReply = "";

  for (let i = 0; i < def.turns.length; i++) {
    const turn = def.turns[i];
    const messages = def.turns.slice(0, i + 1).map((t) => ({ role: "user", content: t.query }));
    const { res, json } = await fetchChat({
      text: turn.query,
      messages,
      session_context: sessionContext,
      conversation_id: conv,
    });
    lastReply = String(json.reply || "");
    sessionContext = json.session_context || sessionContext;
    if (res.status !== 200) break;
    if (i < def.turns.length - 1) await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
  }

  const pass = isRichCommercialReply(lastReply);
  scenarios.push({
    scenario_id: def.id,
    pass,
    turns: def.turns.map((t) => t.query),
    reply_preview: lastReply.slice(0, 280),
  });
  ok(def.id, pass, lastReply.slice(0, 140));
  await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
}

await runMultiTurn({
  id: "explanation:budget-increase",
  turns: [
    { query: "Quero um celular até R$ 2.000." },
    { query: "Na verdade pode ser até R$ 2.500." },
  ],
});

await runMultiTurn({
  id: "explanation:brand-samsung-also-motorola",
  turns: [
    { query: "Quero um celular Samsung até R$ 3.000." },
    { query: "Pode ser Motorola também." },
  ],
});

await runMultiTurn({
  id: "explanation:use-case-faculdade",
  turns: [
    { query: "Quero um celular para jogos até R$ 2.500." },
    { query: "Na verdade vou usar para faculdade." },
  ],
});

await runMultiTurn({
  id: "explanation:budget-flex",
  turns: [
    { query: "Quero um celular Samsung até R$ 3.000." },
    { query: "Pode passar um pouco dos 3 mil." },
  ],
});

// Regressions
const p34b = await fetchChat({
  text: "Quero um notebook.",
  messages: [{ role: "user", content: "Quero um notebook." }],
  conversation_id: randomUUID(),
});
ok(
  "regression:patch-3.4b-notebook-partial",
  p34b.res.status === 200 && String(p34b.json.reply || "").length >= 40,
  String(p34b.json.reply || "").slice(0, 100)
);
await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));

const p33 = await fetchChat({
  text: "iPhone 15",
  messages: [{ role: "user", content: "iPhone 15" }],
  conversation_id: randomUUID(),
});
ok(
  "regression:patch-3.3-iphone15",
  p33.res.status === 200 && (p33.json.prices?.length > 0 || /iphone\s*15/i.test(String(p33.json.reply || ""))),
  `offers=${p33.json.prices?.length || 0}`
);

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => c.pass === false).length;
const p0Failed = checks.filter((c) => c.pass === false && c.severity === "P0").length;

const evidence = {
  patch: "3.5a",
  phase: "production_validation",
  status: p0Failed === 0 ? "APPROVED" : "REJECTED",
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  base_url: BASE,
  deploy_build: health?.build || null,
  summary: { passed, failed, p0_failed: p0Failed, scenarios: scenarios.length },
  checks,
  scenarios,
  latencies_ms: latencies,
};

const outDir = join(ROOT, "docs/conversational");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "PATCH_3_5A_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.5a PRODUCTION: ${passed} passed, ${failed} failed (P0 fail: ${p0Failed})`);
process.exit(p0Failed > 0 ? 1 : 0);
