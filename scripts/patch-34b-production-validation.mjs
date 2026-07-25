#!/usr/bin/env node
/**
 * PATCH 3.4b — Production validation (Constraint Refinement + Generic Query Closing)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH34B_PROD_BASE_URL || "https://economia-ai.vercel.app";
const CHAT_DELAY_MS = Number(process.env.PATCH34B_CHAT_DELAY_MS || 5500);
const TIMEOUT_MS = Number(process.env.PATCH34B_TIMEOUT_MS || 120000);

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

function isClarificationOnly(reply = "") {
  const r = String(reply || "").toLowerCase();
  const asks =
    /me conta|me fala|me diz|qual faixa|uso principal|que você precisa|que voce precisa|celular, notebook|produto que você|produto que voce/.test(
      r
    );
  const recommends =
    /minha escolha|eu iria|recomendo|opções|opcao|consigo recomendar|sugiro|indico/.test(r);
  return asks && !recommends;
}

console.log(`\nPATCH 3.4b — Production validation\nBase: ${BASE}\n`);

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
ok("health", health?.status === "ok" || health?.ok === true, JSON.stringify(health).slice(0, 120));

async function runMultiTurn(def) {
  const conv = randomUUID();
  let sessionContext = {};
  let lastReply = "";
  let lastJson = {};

  for (let i = 0; i < def.turns.length; i++) {
    const turn = def.turns[i];
    const messages = def.turns.slice(0, i + 1).map((t) => ({ role: "user", content: t.query }));
    const { res, json, elapsed } = await fetchChat({
      text: turn.query,
      messages,
      session_context: sessionContext,
      conversation_id: conv,
    });
    lastReply = String(json.reply || "");
    lastJson = json;
    sessionContext = json.session_context || sessionContext;
    if (res.status !== 200) break;
    if (i < def.turns.length - 1) await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
    if (turn.elapsed) turn.elapsed = elapsed;
  }

  let pass = lastJson && !isClarificationOnly(lastReply);
  if (def.expectBudgetInSession) {
    pass = pass && Number(sessionContext?.budgetMax || sessionContext?.lastCommercialConstraints?.budgetMax) >= def.expectBudgetInSession;
  }
  if (def.expectReplyPattern) pass = pass && def.expectReplyPattern.test(lastReply);
  if (def.expectBrandMerge) {
    const brands =
      sessionContext?.lastCommercialConstraints?.preferredBrands ||
      sessionContext?.preferredBrands ||
      [];
    pass =
      pass &&
      brands.includes("samsung") &&
      brands.includes("motorola");
  }
  if (def.expectOffersOnLastTurn) pass = pass && (lastJson.prices?.length || 0) > 0;
  if (def.expectNoFullBlock) pass = pass && lastReply.length >= 20;

  scenarios.push({
    scenario_id: def.id,
    pass,
    turns: def.turns.map((t) => t.query),
    reply_preview: lastReply.slice(0, 260),
    offers: lastJson.prices?.length || 0,
    session_budget: sessionContext?.budgetMax || sessionContext?.lastCommercialConstraints?.budgetMax || null,
  });
  ok(def.id, pass, lastReply.slice(0, 140));
  await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
}

await runMultiTurn({
  id: "refinement:budget-override-2500",
  turns: [
    { query: "Quero um celular até R$ 2.000." },
    { query: "Na verdade pode ser até R$ 2.500." },
  ],
  expectBudgetInSession: 2500,
  expectNoFullBlock: true,
});

await runMultiTurn({
  id: "refinement:brand-also-motorola",
  turns: [
    { query: "Quero um celular Samsung até R$ 3.000." },
    { query: "Pode ser Motorola também." },
  ],
  expectBrandMerge: true,
  expectNoFullBlock: true,
});

await runMultiTurn({
  id: "refinement:use-case-faculdade",
  turns: [
    { query: "Quero um celular para jogos até R$ 2.500." },
    { query: "Na verdade vou usar para faculdade." },
  ],
  expectNoFullBlock: true,
});

// Generic query closing — partial proceed with budget hint
const notebookConv = randomUUID();
const nb1 = await fetchChat({
  text: "Quero um notebook.",
  messages: [{ role: "user", content: "Quero um notebook." }],
  conversation_id: notebookConv,
});
const nbReply = String(nb1.json.reply || "");
const nbPass =
  nb1.res.status === 200 &&
  !isClarificationOnly(nbReply) &&
  (/orçamento|faixa de preço|precis/i.test(nbReply) || nb1.json.prices?.length > 0);
ok("generic-closing:notebook-partial", nbPass, nbReply.slice(0, 140));
scenarios.push({
  scenario_id: "generic-closing:notebook-partial",
  pass: nbPass,
  reply_preview: nbReply.slice(0, 260),
  offers: nb1.json.prices?.length || 0,
});
await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));

// PATCH 3.4a regression — still clarifies vague celular without budget
const p34a = await fetchChat({
  text: "Quero um celular.",
  messages: [{ role: "user", content: "Quero um celular." }],
  conversation_id: randomUUID(),
});
ok(
  "regression:patch-3.4a-clarify-celular",
  p34a.res.status === 200 &&
    (/me conta|faixa de preço|uso principal/i.test(String(p34a.json.reply || "")) ||
      p34a.json.prices?.length > 0),
  String(p34a.json.reply || "").slice(0, 100)
);
await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));

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
await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));

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
  patch: "3.4b",
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
writeFileSync(join(outDir, "PATCH_3_4B_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.4b PRODUCTION: ${passed} passed, ${failed} failed (P0 fail: ${p0Failed})`);
process.exit(p0Failed > 0 ? 1 : 0);
