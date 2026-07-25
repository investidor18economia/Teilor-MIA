#!/usr/bin/env node
/**
 * PATCH 3.5b — Production validation (Verbalizer & Humanization)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH35B_PROD_BASE_URL || "https://economia-ai.vercel.app";
const CHAT_DELAY_MS = Number(process.env.PATCH35B_CHAT_DELAY_MS || 5500);
const TIMEOUT_MS = Number(process.env.PATCH35B_TIMEOUT_MS || 120000);

const checks = [];
const scenarios = [];
const latencies = [];
const startedAt = new Date().toISOString();

const ROBOTIC_OPENING =
  /^(faz sentido|entendi|boa observa[cç][aã]o|esse ponto muda a an[aá]lise|agora mudou um detalhe importante|faz sentido pelo que voc[eê] trouxe|esse ponto pesa na decis[aã]o|entendo o contexto|certo|ok|boa)\.?$/i;

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

function isHumanizedCommercialReply(reply = "") {
  const r = String(reply || "").trim();
  if (r.length < 40) return false;
  const opening = r.split("\n")[0].trim();
  if (ROBOTIC_OPENING.test(opening)) return false;
  return /reavali|considerando|continuo|mantenho|mudaria|orçamento|marca|uso|recomend|porque|pois|tradeoff|equil[ií]brio|principal motivo|flex[ií]vel|refin|teto|conversamos|j[aá] est[aá]vamos|segue na frente/i.test(
    r
  );
}

console.log(`\nPATCH 3.5b — Production validation\nBase: ${BASE}\n`);

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

  const pass = isHumanizedCommercialReply(lastReply);
  scenarios.push({
    scenario_id: def.id,
    pass,
    turns: def.turns.map((t) => t.query),
    reply_preview: lastReply.slice(0, 280),
    opening: lastReply.split("\n")[0]?.slice(0, 80) || "",
  });
  ok(def.id, pass, lastReply.slice(0, 140));
  await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
}

await runMultiTurn({
  id: "humanization:budget-increase",
  turns: [
    { query: "Quero um celular até R$ 2.000." },
    { query: "Na verdade pode ser até R$ 2.500." },
  ],
});

await runMultiTurn({
  id: "humanization:brand-samsung-also-motorola",
  turns: [
    { query: "Quero um celular Samsung até R$ 3.000." },
    { query: "Pode ser Motorola também." },
  ],
});

await runMultiTurn({
  id: "humanization:use-case-faculdade",
  turns: [
    { query: "Quero um celular para jogos até R$ 2.500." },
    { query: "Na verdade vou usar para faculdade." },
  ],
});

await runMultiTurn({
  id: "humanization:budget-flex",
  turns: [
    { query: "Quero um celular Samsung até R$ 3.000." },
    { query: "Pode passar um pouco dos 3 mil." },
  ],
});

await runMultiTurn({
  id: "humanization:informal-budget",
  turns: [
    { query: "Quero um celular até R$ 2.000." },
    { query: "até 2.500 na real" },
  ],
});

// Regressions
const p35a = await fetchChat({
  text: "Na verdade pode ser até R$ 2.500.",
  messages: [
    { role: "user", content: "Quero um celular até R$ 2.000." },
    { role: "user", content: "Na verdade pode ser até R$ 2.500." },
  ],
  session_context: {
    lastBestProduct: { product_name: "Galaxy A55", price: "2000" },
    budgetMax: 2000,
    lastCommercialConstraints: { budgetMax: 2000 },
  },
  conversation_id: randomUUID(),
});
ok(
  "regression:patch-3.5a-facts-still-rich",
  p35a.res.status === 200 && isHumanizedCommercialReply(p35a.json.reply),
  String(p35a.json.reply || "").slice(0, 100)
);
await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));

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

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => c.pass === false).length;
const p0Failed = checks.filter((c) => c.pass === false && c.severity === "P0").length;

const evidence = {
  patch: "3.5b",
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
writeFileSync(join(outDir, "PATCH_3_5B_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.5b PRODUCTION: ${passed} passed, ${failed} failed (P0 fail: ${p0Failed})`);
process.exit(p0Failed > 0 ? 1 : 0);
