#!/usr/bin/env node
/**
 * PATCH 3.4a — Production validation (Clarification Gates)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH34A_PROD_BASE_URL || "https://economia-ai.vercel.app";
const CHAT_DELAY_MS = Number(process.env.PATCH34A_CHAT_DELAY_MS || 5500);
const TIMEOUT_MS = Number(process.env.PATCH34A_TIMEOUT_MS || 120000);

const checks = [];
const scenarios = [];
const latencies = [];
const startedAt = new Date().toISOString();

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

function isClarificationReply(reply = "") {
  const r = String(reply || "").toLowerCase();
  return (
    /me conta|me fala|me diz|me explica|qual faixa|uso principal|que você precisa|que voce precisa|celular, notebook|produto que você|produto que voce/.test(
      r
    ) && !(r.includes("minha escolha") || r.includes("eu iria"))
  );
}

console.log(`\nPATCH 3.4a — Production validation\nBase: ${BASE}\n`);

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
ok("health", health?.status === "ok" || health?.ok === true, JSON.stringify(health).slice(0, 120));

async function runCase(def) {
  const conv = randomUUID();
  const { res, json, elapsed } = await fetchChat({
    text: def.query,
    messages: [{ role: "user", content: def.query }],
    conversation_id: conv,
  });
  const reply = String(json.reply || "");
  let pass = res.status === 200;
  if (def.expectClarification) {
    pass = pass && isClarificationReply(reply);
  }
  if (def.expectNoClarification) {
    pass =
      pass &&
      !isClarificationReply(reply) &&
      (def.allowOffers ? json.prices?.length > 0 || reply.length >= 40 : true);
  }
  if (def.expectNoOffers) pass = pass && !(json.prices?.length > 0);
  if (def.expectOffers) pass = pass && json.prices?.length > 0;
  scenarios.push({
    scenario_id: def.id,
    query: def.query,
    pass,
    reply_preview: reply.slice(0, 220),
    offers: json.prices?.length || 0,
    elapsed_ms: elapsed,
  });
  ok(def.id, pass, `offers=${json.prices?.length || 0} elapsed=${elapsed}ms`);
  await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
}

await runCase({
  id: "sufficient:celular-ate-2000",
  query: "Quero um celular até R$ 2.000.",
  expectNoClarification: true,
  allowOffers: true,
});
await runCase({
  id: "insufficient:celular-sem-budget",
  query: "Quero um celular.",
  expectClarification: true,
  expectNoOffers: true,
});
await runCase({
  id: "comparison:entre-s24-iphone15",
  query: "Entre S24 e iPhone 15.",
  expectNoClarification: true,
});
await runCase({
  id: "partial:notebook-edicao",
  query: "Quero um notebook para edição.",
  expectClarification: true,
});
await runCase({
  id: "vague:algo-bom",
  query: "quero algo bom",
  expectClarification: true,
  expectNoOffers: true,
});

// Follow-up with session — should not re-ask budget
const convFollow = randomUUID();
const t1 = await fetchChat({
  text: "Quero um celular até R$ 2.000.",
  messages: [{ role: "user", content: "Quero um celular até R$ 2.000." }],
  conversation_id: convFollow,
});
let sc = t1.json.session_context || {};
await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
const t2 = await fetchChat({
  text: "e mais barato?",
  messages: [
    { role: "user", content: "Quero um celular até R$ 2.000." },
    { role: "user", content: "e mais barato?" },
  ],
  session_context: sc,
  conversation_id: convFollow,
});
const followPass =
  t2.res.status === 200 &&
  !isClarificationReply(String(t2.json.reply || "")) &&
  String(t2.json.reply || "").length >= 15;
ok("follow-up:no-budget-reask", followPass, String(t2.json.reply || "").slice(0, 120));
scenarios.push({
  scenario_id: "follow-up:no-budget-reask",
  pass: followPass,
  reply_preview: String(t2.json.reply || "").slice(0, 220),
});

// PATCH 3.3 regression
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

// PATCH 3.2 regression
const p32 = await fetchChat({
  text: "quero um celular ate 2 mil",
  messages: [{ role: "user", content: "quero um celular ate 2 mil" }],
  conversation_id: randomUUID(),
});
ok(
  "regression:patch-3.2-continuity-seed",
  p32.res.status === 200 && !!p32.json.session_context?.lastBestProduct?.product_name,
  p32.json.session_context?.lastBestProduct?.product_name || "null"
);

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => c.pass === false).length;
const p0Failed = checks.filter((c) => c.pass === false && c.severity === "P0").length;

const evidence = {
  patch: "3.4a",
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
  baseline_reference: "docs/conversational/CONVERSATIONAL_BASELINE.md",
};

const outDir = join(ROOT, "docs/conversational");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "PATCH_3_4A_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.4a PRODUCTION: ${passed} passed, ${failed} failed (P0 fail: ${p0Failed})`);
process.exit(p0Failed > 0 ? 1 : 0);
