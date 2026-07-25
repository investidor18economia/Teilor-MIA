#!/usr/bin/env node
/**
 * PATCH 3.6 — Production validation (integrated Phase 3 regression)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH36_PROD_BASE_URL || "https://economia-ai.vercel.app";
const CHAT_DELAY_MS = Number(process.env.PATCH36_CHAT_DELAY_MS || 5500);
const TIMEOUT_MS = Number(process.env.PATCH36_TIMEOUT_MS || 120000);

const checks = [];
const scenarios = [];
const latencies = [];
const startedAt = new Date().toISOString();

const ROBOTIC =
  /^(faz sentido|entendi|boa observa[cç][aã]o|agora mudou um detalhe importante|faz sentido pelo que voc[eê] trouxe|esse ponto pesa na decis[aã]o)\.?$/i;

function ok(id, pass, detail = "", severity = "P0") {
  checks.push({ id, pass, detail, severity, at: new Date().toISOString() });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${String(detail).slice(0, 140)}`);
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

function isIntegratedReply(reply = "") {
  const r = String(reply || "").trim();
  if (r.length < 35) return false;
  if (ROBOTIC.test(r.split("\n")[0])) return false;
  return true;
}

function isRichCommercial(reply = "") {
  const r = String(reply || "").trim();
  return (
    isIntegratedReply(r) &&
    /reavali|considerando|continuo|mantenho|orçamento|marca|uso|recomend|porque|faculdade|motorola|teto|refin/i.test(r)
  );
}

async function runMultiTurn(def) {
  const conv = randomUUID();
  let sessionContext = {};
  let lastReply = "";
  const trace = [];

  for (let i = 0; i < def.turns.length; i++) {
    const query = def.turns[i];
    const messages = def.turns.slice(0, i + 1).map((t) => ({ role: "user", content: t }));
    const { res, json } = await fetchChat({
      text: query,
      messages,
      session_context: sessionContext,
      conversation_id: conv,
    });
    lastReply = String(json.reply || "");
    sessionContext = json.session_context || sessionContext;
    trace.push({ query, status: res.status, reply_preview: lastReply.slice(0, 160) });
    if (res.status !== 200) break;
    if (i < def.turns.length - 1) await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
  }

  const pass = def.validate ? def.validate(lastReply, trace) : isRichCommercial(lastReply);
  scenarios.push({
    scenario_id: def.id,
    pass,
    turns: def.turns,
    trace,
    reply_preview: lastReply.slice(0, 280),
  });
  ok(def.id, pass, lastReply.slice(0, 140));
  await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
}

console.log(`\nPATCH 3.6 — Production validation\nBase: ${BASE}\n`);

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
ok("health", health?.status === "ok" || health?.ok === true, JSON.stringify(health).slice(0, 120));

await runMultiTurn({
  id: "sequence-a:generic-clarify",
  turns: ["Quero um celular.", "Até 2.500.", "Para faculdade e redes sociais."],
  validate: (reply, trace) =>
    isIntegratedReply(trace[0]?.reply_preview) &&
    isRichCommercial(reply),
});

await runMultiTurn({
  id: "sequence-b:successive-refinements",
  turns: [
    "Quero um celular até 3 mil para jogos.",
    "Motorola também serve.",
    "Pode passar um pouco dos 3 mil.",
    "Na verdade vou usar mais para faculdade.",
    "Câmera não é tão importante.",
  ],
});

await runMultiTurn({
  id: "sequence-c:budget-correction",
  turns: ["Quero um celular até 2 mil.", "Corrigindo, quis dizer 2.500."],
  validate: (reply) => isRichCommercial(reply) && /2500|2\.500|2,500/i.test(reply),
});

await runMultiTurn({
  id: "sequence-d:brand-negation",
  turns: ["Quero um celular Samsung até 3 mil.", "Pode considerar Motorola.", "Pensando melhor, não quero Motorola."],
});

await runMultiTurn({
  id: "sequence-e:hard-vs-flex-budget",
  turns: ["Quero um celular Samsung até 3 mil.", "Pode passar um pouco dos 3 mil."],
});

await runMultiTurn({
  id: "sequence-f:mixed-intent",
  turns: [
    "Quero um celular Samsung até 3 mil.",
    "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.",
  ],
});

await runMultiTurn({
  id: "colloquial:motorola-tbm-serve",
  turns: ["Quero um celular Samsung até 3 mil.", "motorola tbm serve"],
});

await runMultiTurn({
  id: "colloquial:pode-aumentar-pra-2500",
  turns: ["Quero um celular até 2.000.", "pode aumentar pra 2500"],
  validate: (reply) => isRichCommercial(reply) && /2500|2\.500/i.test(reply),
});

await runMultiTurn({
  id: "sequence-g:specific-product-followup",
  turns: [
    "Quero um celular até 3 mil.",
    "Vale a pena comprar o iPhone 15?",
    "E comparado ao Galaxy S24?",
  ],
  validate: (reply, trace) =>
    isIntegratedReply(reply) &&
    (/iphone|galaxy|s24|compar/i.test(reply) ||
      (trace.length >= 2 && /iphone/i.test(trace[1]?.reply_preview || ""))),
});

await runMultiTurn({
  id: "sequence-h:informal-natural",
  turns: [
    "quero um cell ate 2500",
    "na real e pra facul",
    "moto tb serve",
  ],
});

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => c.pass === false).length;
const p0Failed = checks.filter((c) => c.pass === false && c.severity === "P0").length;

const evidence = {
  patch: "3.6",
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
writeFileSync(join(outDir, "PATCH_3_6_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.6 PRODUCTION: ${passed} passed, ${failed} failed (P0 fail: ${p0Failed})`);
process.exit(p0Failed > 0 ? 1 : 0);
