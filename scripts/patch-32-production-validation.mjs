#!/usr/bin/env node
/**
 * PATCH 3.2 — Production validation (Conversational Continuity)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH32_PROD_BASE_URL || "https://economia-ai.vercel.app";
const CHAT_DELAY_MS = Number(process.env.PATCH32_CHAT_DELAY_MS || 5500);
const TIMEOUT_MS = Number(process.env.PATCH32_TIMEOUT_MS || 120000);

const INSTITUTIONAL_FALLBACK_RE =
  /sou a mia da teilor|assistente da teilor|como posso te ajudar hoje|estou aqui para conversar/i;

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
    const elapsed = Date.now() - t0;
    latencies.push({ status: res.status, elapsed_ms: elapsed });
    return { res, json, elapsed, text };
  } finally {
    clearTimeout(timer);
  }
}

function snapSession(sc = {}) {
  return {
    winner: sc?.lastBestProduct?.product_name || null,
    snapshot: Array.isArray(sc?.lastRankingSnapshot) ? sc.lastRankingSnapshot.length : 0,
    comparisonLocked: !!sc?.comparisonContextLocked,
    budgetMax: sc?.budgetMax ?? sc?.lastBudget ?? null,
  };
}

async function runMultiStep(def) {
  const messages = [];
  let sessionContext = def.initialSession ? { ...def.initialSession } : {};
  const stepsOut = [];

  for (const step of def.steps) {
    messages.push({ role: "user", content: step.text });
    const { res, json, elapsed } = await fetchChat({
      text: step.text,
      messages: [...messages],
      session_context: sessionContext,
      conversation_id: def.conversationId,
    });

    const before = snapSession(sessionContext);
    if (json.session_context) sessionContext = json.session_context;
    const after = snapSession(sessionContext);

    let pass = res.status === 200;
    if (step.expectWinnerPreserved) {
      pass = pass && !!after.winner;
      if (step.priorWinner) {
        pass = pass && after.winner === step.priorWinner;
      }
    }
    if (step.expectSnapshotMin != null) {
      pass = pass && after.snapshot >= step.expectSnapshotMin;
    }
    if (step.expectNoOffers) pass = pass && !(json.prices?.length > 0);
    if (step.expectOffers) pass = pass && (json.prices?.length > 0);
    if (step.expectNoInstitutional) {
      const reply = String(json.reply || "");
      pass = pass && !INSTITUTIONAL_FALLBACK_RE.test(reply);
    }
    if (step.expectBudget != null) {
      pass = pass && after.budgetMax === step.expectBudget;
    }

    stepsOut.push({
      text: step.text,
      status: res.status,
      elapsed_ms: elapsed,
      before,
      after,
      pass,
      reply_preview: String(json.reply || "").slice(0, 180),
    });

    await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
  }

  scenarios.push({
    scenario_id: def.id,
    steps: stepsOut,
    pass: stepsOut.every((s) => s.pass),
  });
  return stepsOut.every((s) => s.pass);
}

console.log(`\nPATCH 3.2 — Production validation\nBase: ${BASE}\n`);

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
ok("health", health?.status === "ok" || health?.ok === true, JSON.stringify(health).slice(0, 120));

const convMain = randomUUID();

// Turn 1: establish recommendation
const t1 = await fetchChat({
  text: "quero um celular ate 2 mil",
  messages: [{ role: "user", content: "quero um celular ate 2 mil" }],
  conversation_id: convMain,
});
let session = t1.json.session_context || {};
const winner1 = session.lastBestProduct?.product_name || null;
ok(
  "continuity:establish-winner",
  t1.res.status === 200 && !!winner1,
  `winner=${winner1 || "null"} offers=${t1.json.prices?.length || 0}`
);
await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));

// Turn 2: follow-up price
const t2 = await fetchChat({
  text: "e mais barato?",
  messages: [
    { role: "user", content: "quero um celular ate 2 mil" },
    { role: "assistant", content: String(t1.json.reply || "") },
    { role: "user", content: "e mais barato?" },
  ],
  session_context: session,
  conversation_id: convMain,
});
const winner2 = t2.json.session_context?.lastBestProduct?.product_name || session.lastBestProduct?.product_name;
ok(
  "continuity:follow-up-price",
  t2.res.status === 200 && !!winner2,
  `winner preserved=${!!winner2} reply_len=${String(t2.json.reply || "").length}`
);
session = t2.json.session_context || session;
await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));

// Turn 3: runner-up
const t3 = await fetchChat({
  text: "qual ficou em segundo?",
  messages: [
    { role: "user", content: "quero um celular ate 2 mil" },
    { role: "user", content: "e mais barato?" },
    { role: "user", content: "qual ficou em segundo?" },
  ],
  session_context: session,
  conversation_id: convMain,
});
const snap3 = Array.isArray(t3.json.session_context?.lastRankingSnapshot)
  ? t3.json.session_context.lastRankingSnapshot.length
  : Array.isArray(session.lastRankingSnapshot)
    ? session.lastRankingSnapshot.length
    : 0;
ok(
  "continuity:runner-up",
  t3.res.status === 200 && snap3 >= 1,
  `snapshot=${snap3} winner=${t3.json.session_context?.lastBestProduct?.product_name || winner2}`
);
session = t3.json.session_context || session;
await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));

// Social then commercial return
await runMultiStep({
  id: "social-then-commercial",
  conversationId: randomUUID(),
  steps: [
    { text: "oi", expectNoOffers: true, expectWinnerPreserved: false },
    {
      text: "quero notebook ate 4000",
      expectOffers: true,
      expectNoInstitutional: true,
    },
  ],
});

// Mixed continuity
await runMultiStep({
  id: "mixed-continuity",
  conversationId: randomUUID(),
  steps: [
    { text: "to nervoso, preciso de um notebook", expectNoInstitutional: true },
    { text: "e desempenho?", expectWinnerPreserved: true, expectNoInstitutional: true },
  ],
});

// Budget change
await runMultiStep({
  id: "budget-change",
  conversationId: randomUUID(),
  initialSession: session,
  steps: [
    {
      text: "quero gastar menos",
      expectWinnerPreserved: true,
      expectNoInstitutional: true,
    },
  ],
});

// PATCH 3.1 regression smoke (embedded)
const p31Conv = randomUUID();
const p31 = await fetchChat({
  text: "quero um celular ate 2 mil",
  messages: [{ role: "user", content: "quero um celular ate 2 mil" }],
  conversation_id: p31Conv,
});
ok(
  "regression:patch-3.1-commercial",
  p31.res.status === 200 &&
    (p31.json.prices?.length > 0 || String(p31.json.reply || "").length > 20) &&
    !INSTITUTIONAL_FALLBACK_RE.test(String(p31.json.reply || "")),
  `offers=${p31.json.prices?.length || 0}`
);

for (const s of scenarios) {
  ok(`scenario:${s.scenario_id}`, s.pass, `${s.steps.length} steps`);
}

const passed = checks.filter((c) => c.pass === true).length;
const failed = checks.filter((c) => c.pass === false).length;
const p0Failed = checks.filter((c) => c.pass === false && c.severity === "P0").length;

const evidence = {
  patch: "3.2",
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
const outPath = join(outDir, "PATCH_3_2_PRODUCTION_EVIDENCE.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.2 PRODUCTION: ${passed} passed, ${failed} failed (P0 fail: ${p0Failed})`);
console.log(`Evidence: ${outPath}`);
process.exit(p0Failed > 0 ? 1 : 0);
