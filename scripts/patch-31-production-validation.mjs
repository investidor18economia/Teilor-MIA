#!/usr/bin/env node
/**
 * PATCH 3.1 — Production validation (Commercial Entry)
 * Target: https://economia-ai.vercel.app
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH31_PROD_BASE_URL || "https://economia-ai.vercel.app";
const CHAT_DELAY_MS = Number(process.env.PATCH31_CHAT_DELAY_MS || 5500);
const TIMEOUT_MS = Number(process.env.PATCH31_TIMEOUT_MS || 120000);

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

function summarize(json = {}) {
  const reply = String(json.reply || json.message || "");
  const prices = Array.isArray(json.prices) ? json.prices : [];
  const path =
    json?.response_outcome_analytics?.response_path ||
    json?.runtime?.responsePath ||
    json?.responsePath ||
    null;
  return {
    reply_preview: reply.slice(0, 280),
    reply_len: reply.length,
    offers_count: prices.length,
    response_path: path,
    institutional_fallback: INSTITUTIONAL_FALLBACK_RE.test(reply) && prices.length === 0,
    has_prices: prices.length > 0,
  };
}

async function runScenario(def) {
  const messages = [];
  let sessionContext = def.sessionContext ? { ...def.sessionContext } : {};

  for (const step of def.steps) {
    messages.push({ role: "user", content: step.text });
    const { res, json, elapsed } = await fetchChat({
      text: step.text,
      messages: [...messages],
      session_context: sessionContext,
      conversation_id: def.conversationId || randomUUID(),
    });
    const summary = summarize(json);
    const stepResult = {
      text: step.text,
      status: res.status,
      elapsed_ms: elapsed,
      ...summary,
      expect: step.expect,
    };

    let pass = res.status === 200;
    if (step.expect === "commercial") {
      pass = pass && !summary.institutional_fallback && summary.reply_len >= 15;
      if (step.requirePrices) pass = pass && summary.has_prices;
    } else if (step.expect === "social") {
      pass = pass && !summary.has_prices && summary.reply_len >= 2;
    } else if (step.expect === "deny_non_commercial") {
      pass = pass && !summary.has_prices;
    }

    stepResult.pass = pass;
    scenarios.push({ scenario_id: def.id, ...stepResult });

    if (json.session_context) sessionContext = json.session_context;
    await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
  }
}

async function chatChatRaw(body) {
  return fetchChat({
    conversation_id: body.conversation_id || randomUUID(),
    session_id: randomUUID(),
    visitor_id: randomUUID(),
    ...body,
  });
}

console.log(`\nPATCH 3.1 — Production validation\nBase: ${BASE}\n`);

// Health
const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
ok("health", health?.status === "ok" || health?.ok === true, JSON.stringify(health).slice(0, 120));

const conversationId = randomUUID();

const smokeDefs = [
  {
    id: "commercial-direct",
    conversationId,
    steps: [{ text: "quero um celular ate 2 mil", expect: "commercial", requirePrices: true }],
  },
  {
    id: "commercial-specific",
    conversationId: randomUUID(),
    steps: [{ text: "quanto custa o Galaxy S24?", expect: "commercial" }],
  },
  {
    id: "commercial-mixed",
    conversationId: randomUUID(),
    steps: [{ text: "to nervoso, preciso de um notebook", expect: "commercial" }],
  },
  {
    id: "social",
    conversationId: randomUUID(),
    steps: [{ text: "oi", expect: "social" }],
  },
  {
    id: "post-purchase",
    conversationId: randomUUID(),
    sessionContext: { lastBestProduct: { product_name: "Galaxy S24" } },
    steps: [{ text: "comprei o celular, obrigado", expect: "deny_non_commercial" }],
  },
  {
    id: "topic-switch",
    conversationId: randomUUID(),
    steps: [{ text: "agora quero falar de outra coisa", expect: "deny_non_commercial" }],
  },
  {
    id: "commercial-follow-up",
    conversationId: randomUUID(),
    sessionContext: { lastBestProduct: { product_name: "Galaxy S24 Ultra", price: "R$ 4.999" } },
    steps: [{ text: "e mais barato?", expect: "commercial" }],
  },
];

for (const def of smokeDefs) {
  await runScenario(def);
}

for (const s of scenarios) {
  ok(`smoke:${s.scenario_id}`, s.pass, `${s.text} | offers=${s.offers_count} institutional=${s.institutional_fallback}`);
}

const passed = checks.filter((c) => c.pass === true).length;
const failed = checks.filter((c) => c.pass === false).length;
const p0Failed = checks.filter((c) => c.pass === false && c.severity === "P0").length;

const evidence = {
  patch: "3.1",
  phase: "production_validation",
  status: p0Failed === 0 ? "APPROVED" : "REJECTED",
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  base_url: BASE,
  summary: { passed, failed, p0_failed: p0Failed, scenarios: scenarios.length },
  checks,
  scenarios,
  latencies_ms: latencies,
  baseline_reference: "docs/conversational/CONVERSATIONAL_BASELINE.md",
};

const outDir = join(ROOT, "docs/conversational");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "PATCH_3_1_PRODUCTION_EVIDENCE.json");
writeFileSync(outPath, JSON.stringify(evidence, null, 2));

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.1 PRODUCTION: ${passed} passed, ${failed} failed (P0 fail: ${p0Failed})`);
console.log(`Evidence: ${outPath}`);
process.exit(p0Failed > 0 ? 1 : 0);
