#!/usr/bin/env node
/**
 * PATCH 3.3 — Production validation (Product Resolution)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH33_PROD_BASE_URL || "https://economia-ai.vercel.app";
const CHAT_DELAY_MS = Number(process.env.PATCH33_CHAT_DELAY_MS || 5500);
const TIMEOUT_MS = Number(process.env.PATCH33_TIMEOUT_MS || 120000);

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
    latencies.push({ status: res.status, elapsed_ms: Date.now() - t0 });
    return { res, json, elapsed: Date.now() - t0, text };
  } finally {
    clearTimeout(timer);
  }
}

function productNameFromResponse(json = {}) {
  return (
    json?.prices?.[0]?.product_name ||
    json?.session_context?.lastBestProduct?.product_name ||
    ""
  );
}

async function runProductQuery(def) {
  const conv = randomUUID();
  const { res, json, elapsed } = await fetchChat({
    text: def.query,
    messages: [{ role: "user", content: def.query }],
    conversation_id: conv,
  });
  const card = productNameFromResponse(json);
  const reply = String(json.reply || "");
  let pass = res.status === 200 && !/Tive um problema/i.test(reply);
  if (def.expectProduct) {
    pass =
      pass &&
      (def.expectProduct.test(card) ||
        def.expectProduct.test(reply) ||
        def.expectProduct.test(json?.session_context?.lastProductMentioned || ""));
  }
  if (def.expectOffers !== false) {
    pass = pass && (json.prices?.length > 0 || reply.length >= 20);
  }
  if (def.expectNoInstitutional) {
    pass = pass && !INSTITUTIONAL_FALLBACK_RE.test(reply);
  }
  scenarios.push({
    scenario_id: def.id,
    query: def.query,
    pass,
    status: res.status,
    elapsed_ms: elapsed,
    card,
    reply_preview: reply.slice(0, 200),
  });
  ok(def.id, pass, `card=${card || "null"} elapsed=${elapsed}ms`);
  await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
  return { pass, json, card };
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
    if (json.session_context) sessionContext = json.session_context;
    const card = productNameFromResponse(json);
    const reply = String(json.reply || "");
    let pass = res.status === 200;
    if (step.expectProduct) {
      pass =
        pass &&
        (step.expectProduct.test(card) ||
          step.expectProduct.test(reply) ||
          step.expectProduct.test(sessionContext?.lastProductMentioned || ""));
    }
    if (step.expectComparisonLocked) {
      pass = pass && !!sessionContext.comparisonContextLocked;
    }
    if (step.expectWinner) {
      pass =
        pass &&
        step.expectWinner.test(sessionContext?.lastBestProduct?.product_name || card);
    }
    if (step.expectNoInstitutional) pass = pass && !INSTITUTIONAL_FALLBACK_RE.test(reply);
    stepsOut.push({ text: step.text, pass, card, elapsed_ms: elapsed });
    await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
  }

  const allPass = stepsOut.every((s) => s.pass);
  scenarios.push({ scenario_id: def.id, steps: stepsOut, pass: allPass });
  ok(`scenario:${def.id}`, allPass, `${stepsOut.length} steps`);
  return allPass;
}

console.log(`\nPATCH 3.3 — Production validation\nBase: ${BASE}\n`);

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
ok("health", health?.status === "ok" || health?.ok === true, JSON.stringify(health).slice(0, 120));

await runProductQuery({
  id: "baseline:galaxy-s24-ultra",
  query: "Galaxy S24 Ultra",
  expectProduct: /s24\s*ultra/i,
});
await runProductQuery({
  id: "baseline:alias-s24",
  query: "S24",
  expectProduct: /s24/i,
});
await runProductQuery({
  id: "baseline:iphone-15",
  query: "iPhone 15",
  expectProduct: /iphone\s*15/i,
});
await runProductQuery({
  id: "baseline:product-plus-constraint",
  query: "S24 com boa bateria",
  expectProduct: /s24/i,
});

await runMultiStep({
  id: "comparison:iphone-vs-galaxy",
  conversationId: randomUUID(),
  steps: [
    {
      text: "iPhone 15 vs Galaxy S24",
      expectProduct: /iphone|galaxy|s24/i,
    },
    {
      text: "qual é melhor?",
      expectNoInstitutional: true,
    },
  ],
});

await runMultiStep({
  id: "follow-up:after-comparison",
  conversationId: randomUUID(),
  steps: [
    { text: "compare iPhone 13 e Galaxy A54", expectNoInstitutional: true },
    {
      text: "e o outro?",
      expectNoInstitutional: true,
    },
  ],
});

// PATCH 3.2 regression
const conv32 = randomUUID();
const t32a = await fetchChat({
  text: "quero um celular ate 2 mil",
  messages: [{ role: "user", content: "quero um celular ate 2 mil" }],
  conversation_id: conv32,
});
let sc32 = t32a.json.session_context || {};
const w32 = sc32.lastBestProduct?.product_name;
ok(
  "regression:patch-3.2-establish",
  t32a.res.status === 200 && !!w32,
  `winner=${w32 || "null"}`
);
await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
const t32b = await fetchChat({
  text: "e mais barato?",
  messages: [
    { role: "user", content: "quero um celular ate 2 mil" },
    { role: "user", content: "e mais barato?" },
  ],
  session_context: sc32,
  conversation_id: conv32,
});
ok(
  "regression:patch-3.2-follow-up",
  t32b.res.status === 200 && !!t32b.json.session_context?.lastBestProduct?.product_name,
  `winner=${t32b.json.session_context?.lastBestProduct?.product_name || w32}`
);

// PATCH 3.1 regression
const p31 = await fetchChat({
  text: "quero um celular ate 2 mil",
  messages: [{ role: "user", content: "quero um celular ate 2 mil" }],
  conversation_id: randomUUID(),
});
ok(
  "regression:patch-3.1-commercial",
  p31.res.status === 200 &&
    (p31.json.prices?.length > 0 || String(p31.json.reply || "").length > 20) &&
    !INSTITUTIONAL_FALLBACK_RE.test(String(p31.json.reply || "")),
  `offers=${p31.json.prices?.length || 0}`
);

const passed = checks.filter((c) => c.pass === true).length;
const failed = checks.filter((c) => c.pass === false).length;
const p0Failed = checks.filter((c) => c.pass === false && c.severity === "P0").length;

const evidence = {
  patch: "3.3",
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
const outPath = join(outDir, "PATCH_3_3_PRODUCTION_EVIDENCE.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.3 PRODUCTION: ${passed} passed, ${failed} failed (P0 fail: ${p0Failed})`);
console.log(`Evidence: ${outPath}`);
process.exit(p0Failed > 0 ? 1 : 0);
