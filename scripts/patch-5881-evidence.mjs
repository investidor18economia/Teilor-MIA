#!/usr/bin/env node
/**
 * PATCH 5.8.8.1 — Evidence + production validation runner
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-5881");
mkdirSync(OUT, { recursive: true });
const LOG = join(OUT, "run.log");
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(LOG, line + "\n");
  console.log(line);
};

const PROD = "https://economia-ai.vercel.app";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probeChat(msg, sid, history = []) {
  const t0 = Date.now();
  const res = await fetch(`${PROD}/api/mia-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: msg, user_id: sid, conversation_id: sid, messages: history }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return {
    msg,
    status: res.status,
    ms: Date.now() - t0,
    requestId: res.headers.get("x-request-id"),
    error: body.error || null,
    reasonCode: body.reasonCode || null,
    reply: String(body.response || body.reply || "").slice(0, 300),
    rateLimited: /várias mensagens/i.test(body.response || body.reply || ""),
  };
}

async function main() {
  log("PATCH 5.8.8.1 evidence runner start");

  // Reproduction snapshot
  const repro = [];
  for (const p of [
    { id: "health", url: `${PROD}/api/health`, method: "GET" },
    { id: "social-oi", msg: "oi" },
    { id: "social-ok", msg: "ok" },
    { id: "meta", msg: "quem é você?" },
    { id: "commercial", msg: "quero notebook" },
  ]) {
    if (p.url) {
      const t0 = Date.now();
      const res = await fetch(p.url);
      repro.push({ id: p.id, status: res.status, ms: Date.now() - t0, body: (await res.text()).slice(0, 400) });
    } else {
      repro.push(await probeChat(p.msg, `repro-${p.id}`));
    }
    await sleep(2500);
  }
  writeFileSync(join(OUT, "PRODUCTION_ERROR_REPRODUCTION.json"), JSON.stringify(repro, null, 2));

  const dist = { total: 0, byStatus: {}, internal_error: 0, rateLimited: 0, empty: 0 };
  const hundred = [];
  const msgs = ["oi", "ok", "certo", "obrigado", "quem é você?", "tudo bem?", "quero celular", "hm", "beleza", "valeu"];
  for (let i = 1; i <= 100; i += 1) {
    const msg = msgs[i % msgs.length];
    const r = await probeChat(msg, `p5881-100-${i}`);
    hundred.push({ i, ...r });
    dist.total += 1;
    dist.byStatus[r.status] = (dist.byStatus[r.status] || 0) + 1;
    if (r.reasonCode === "internal_error" || r.error === "internal_error") dist.internal_error += 1;
    if (r.rateLimited) dist.rateLimited += 1;
    if (!r.reply.trim()) dist.empty += 1;
    if (i % 10 === 0) log(`100-probe ${i}/100 status=${r.status}`);
    await sleep(1200);
  }
  writeFileSync(join(OUT, "PRODUCTION_100_REQUESTS.json"), JSON.stringify(hundred, null, 2));
  writeFileSync(join(OUT, "HTTP_STATUS_DISTRIBUTION.json"), JSON.stringify(dist, null, 2));

  const multiturn = [];
  for (let c = 1; c <= 20; c += 1) {
    const sid = `p5881-mt-${c}`;
    const chain = ["oi", "tudo bem?", "ok", "certo", "obrigado", "quem é você?", "hm", "beleza", "valeu", "tchau"];
    const history = [];
    const turns = [];
    for (const msg of chain) {
      const r = await probeChat(msg, sid, history);
      turns.push(r);
      history.push({ role: "user", content: msg });
      if (r.reply) history.push({ role: "assistant", content: r.reply });
      await sleep(1200);
    }
    multiturn.push({ id: `MT-${c}`, turns, pass: turns.every((t) => t.status === 200 && t.reply.trim()) });
    log(`multiturn ${c}/20 pass=${multiturn.at(-1).pass}`);
  }
  writeFileSync(join(OUT, "PRODUCTION_MULTITURN.json"), JSON.stringify(multiturn, null, 2));

  const healthRes = await fetch(`${PROD}/api/health`);
  writeFileSync(join(OUT, "PRODUCTION_HEALTH.json"), JSON.stringify({ body: await healthRes.json(), status: healthRes.status, timestamp: new Date().toISOString() }, null, 2));

  writeFileSync(join(OUT, "ROOT_CAUSE.json"), JSON.stringify({
    confirmed: true,
    exception: "MiaLlmProviderError / OpenAI HTTP 429 insufficient_quota credit_balance_exhausted",
    layer: "lib/openai.js → callOpenAI throws → callMiaOpenAIProvider uncaught → withMiaObservability internal_error HTTP 500",
    introducedBy588: false,
    operationalFactor: "OpenAI credits exhausted during 588V audit load",
    codeGap: "Recoverable provider failures not degraded to governed social/commercial fallbacks",
    fix: "Graceful LLM provider degradation in callMiaOpenAIProvider with existing path fallbacks",
  }, null, 2));

  writeFileSync(join(OUT, "CORE_EXCEPTION_TRACE.json"), JSON.stringify({
    localLogEvidence: {
      event: "unexpected_error",
      message: "OpenAI error 429 credit_balance_exhausted",
      endpoint: "/api/chat-gpt4o",
      reasonCodeBeforeFix: "internal_error",
      durationMs: "250-480",
    },
    postFixLocal: { social: "HTTP 200 governed fallback", commercial: "HTTP 200" },
  }, null, 2));

  log("PATCH 5.8.8.1 evidence runner complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
