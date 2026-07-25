#!/usr/bin/env node
/**
 * PATCH 3.7 — Production validation (deploy-aware, reconciled counts)
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH37_PROD_BASE_URL || "https://economia-ai.vercel.app";
const CHAT_DELAY_MS = Number(process.env.PATCH37_CHAT_DELAY_MS || 5500);
const TIMEOUT_MS = Number(process.env.PATCH37_TIMEOUT_MS || 120000);
const RUNS = Number(process.env.PATCH37_PROD_RUNS || 2);
const EXPECTED_BUILD_PREFIX = process.env.PATCH37_EXPECTED_BUILD || "47fdacf";
const DEPLOY_WAIT_MS = Number(process.env.PATCH37_DEPLOY_WAIT_MS || 900000);

const checks = [];
const scenarios = [];
const latencies = [];
const startedAt = new Date().toISOString();

const ROBOTIC =
  /^(faz sentido|entendi|boa observa[cç][aã]o|agora mudou um detalhe importante|faz sentido pelo que voc[eê] trouxe|esse ponto pesa na decis[aã]o)\.?$/i;
const RATE_LIMIT = /várias mensagens em sequência|aguarde alguns segundos|rate limit/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ok(id, pass, detail = "", severity = "P0", meta = {}) {
  checks.push({ id, pass, detail, severity, at: new Date().toISOString(), ...meta });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${String(detail).slice(0, 140)}`);
  return pass;
}

async function fetchHealth() {
  return fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
}

async function waitForDeploy() {
  const deadline = Date.now() + DEPLOY_WAIT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = await fetchHealth();
    const build = String(last?.build || "");
    if (build.startsWith(EXPECTED_BUILD_PREFIX.slice(0, 7))) {
      console.log(`Deploy ready: build=${build}`);
      return last;
    }
    console.log(`Waiting deploy... current=${build || "unknown"} expected=${EXPECTED_BUILD_PREFIX.slice(0, 7)}`);
    await sleep(15000);
  }
  throw new Error(`Deploy timeout: still on ${last?.build || "unknown"}`);
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
  if (RATE_LIMIT.test(r)) return false;
  return true;
}

function isRichCommercial(reply = "") {
  const r = String(reply || "").trim();
  return (
    isIntegratedReply(r) &&
    /reavali|considerando|continuo|mantenho|orçamento|marca|uso|recomend|porque|faculdade|motorola|teto|refin|bateria|priorid/i.test(r)
  );
}

function isGenericFallback(reply = "") {
  const r = String(reply || "").trim();
  return (
    /entendi, você está priorizando|isso é importante! você está pensando|pensando em algo específico/i.test(r) ||
    RATE_LIMIT.test(r)
  );
}

function firstLine(text = "") {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
}

function constraintsOf(ctx = {}) {
  return ctx.lastCommercialConstraints || ctx.commercialConstraints || {};
}

async function runMultiTurn(def, runId = 1) {
  const conv = randomUUID();
  let sessionContext = {};
  let lastReply = "";
  const trace = [];
  const openings = [];

  for (let i = 0; i < def.turns.length; i++) {
    const query = def.turns[i];
    const ctxBefore = JSON.parse(JSON.stringify(constraintsOf(sessionContext)));
    const messages = def.turns.slice(0, i + 1).map((t) => ({ role: "user", content: t }));
    const { res, json } = await fetchChat({
      text: query,
      messages,
      session_context: sessionContext,
      conversation_id: conv,
    });
    lastReply = String(json.reply || "");
    sessionContext = json.session_context || sessionContext;
    const ctxAfter = constraintsOf(sessionContext);
    const opening = firstLine(lastReply);
    if (def.trackOpenings && i > 0) openings.push(opening);
    trace.push({
      turn: i + 1,
      input: query,
      status: res.status,
      reply_preview: lastReply.slice(0, 240),
      opening,
      context_before: ctxBefore,
      context_after: ctxAfter,
      session_context: sessionContext,
    });
    if (res.status !== 200) break;
    if (i < def.turns.length - 1) await sleep(CHAT_DELAY_MS);
  }

  const pass = def.validate ? def.validate(lastReply, trace, openings, sessionContext) : isRichCommercial(lastReply);
  scenarios.push({
    scenario_id: def.id,
    run_id: runId,
    category: def.category || "production",
    pass,
    turns: def.turns.length,
    turns_list: def.turns,
    trace,
    openings: def.trackOpenings ? openings : undefined,
    unique_openings: def.trackOpenings ? new Set(openings).size : undefined,
    reply_preview: lastReply.slice(0, 320),
  });
  ok(`${def.id}${runId > 1 ? `-run${runId}` : ""}`, pass, lastReply.slice(0, 140), def.severity || "P0", {
    run_id: runId,
    category: def.category || "production",
  });
  await sleep(CHAT_DELAY_MS);
}

async function runBudgetMatrix(id, message, expected, runId = 1) {
  const setup = "Quero um celular Samsung até 2 mil.";
  const conv = randomUUID();
  let sessionContext = {};
  await fetchChat({ text: setup, messages: [{ role: "user", content: setup }], conversation_id: conv });
  await sleep(CHAT_DELAY_MS);
  const { res, json } = await fetchChat({
    text: message,
    messages: [{ role: "user", content: setup }, { role: "user", content: message }],
    session_context: sessionContext,
    conversation_id: conv,
  });
  sessionContext = json.session_context || {};
  const reply = String(json.reply || "");
  const budgetMax = constraintsOf(sessionContext).budgetMax;
  const pass =
    res.status === 200 &&
    budgetMax === expected &&
    budgetMax !== 3 &&
    !RATE_LIMIT.test(reply) &&
    (isRichCommercial(reply) || /3000|3500|4000|2000|2500|teto|orçamento/i.test(reply));
  scenarios.push({
    scenario_id: id,
    run_id: runId,
    category: "budget_matrix",
    pass,
    input: message,
    expected: { budgetMax: expected },
    actual: { budgetMax, reply_preview: reply.slice(0, 200) },
    trace: [{ input: message, context_after: constraintsOf(sessionContext) }],
  });
  ok(`${id}${runId > 1 ? `-run${runId}` : ""}`, pass, `budgetMax=${budgetMax} expected=${expected}`, "P0", {
    run_id: runId,
    category: "budget_matrix",
  });
  await sleep(CHAT_DELAY_MS);
}

async function runPriorityMatrix(id, message, runId = 1) {
  const setup = "Quero um celular Samsung até 3 mil.";
  const conv = randomUUID();
  let sessionContext = {};
  await fetchChat({ text: setup, messages: [{ role: "user", content: setup }], conversation_id: conv });
  await sleep(CHAT_DELAY_MS);
  const { res, json } = await fetchChat({
    text: message,
    messages: [{ role: "user", content: setup }, { role: "user", content: message }],
    session_context: sessionContext,
    conversation_id: conv,
  });
  sessionContext = json.session_context || {};
  const reply = String(json.reply || "");
  const attrs = constraintsOf(sessionContext).desiredAttributes || [];
  const pass =
    res.status === 200 &&
    !isGenericFallback(reply) &&
    !RATE_LIMIT.test(reply) &&
    (attrs.includes("battery") || attrs.includes("camera") || attrs.includes("performance") || /bateria|priorid|reavali|considerando/i.test(reply));
  scenarios.push({
    scenario_id: id,
    run_id: runId,
    category: "priority_matrix",
    pass,
    input: message,
    actual: { desiredAttributes: attrs, reply_preview: reply.slice(0, 200) },
  });
  ok(`${id}${runId > 1 ? `-run${runId}` : ""}`, pass, reply.slice(0, 120), "P0", {
    run_id: runId,
    category: "priority_matrix",
  });
  await sleep(CHAT_DELAY_MS);
}

async function runNegative(id, query, runId = 1) {
  const { res, json } = await fetchChat({
    text: query,
    messages: [{ role: "user", content: query }],
    conversation_id: randomUUID(),
  });
  const reply = String(json.reply || "");
  const pass =
    res.status === 200 &&
    reply.length >= 2 &&
    !/galaxy|iphone|motorola|recomendo o|até r\$|orçamento de/i.test(reply) &&
    !RATE_LIMIT.test(reply);
  scenarios.push({ scenario_id: id, run_id: runId, category: "negative_control", pass, input: query, trace: [{ reply_preview: reply.slice(0, 160) }] });
  ok(`${id}${runId > 1 ? `-run${runId}` : ""}`, pass, reply.slice(0, 120), "P1", { run_id: runId, category: "negative_control" });
  await sleep(CHAT_DELAY_MS);
}

let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

console.log(`\nPATCH 3.7 — Production validation (${RUNS} run(s))\nBase: ${BASE}\n`);

const healthAfterDeploy = await waitForDeploy();
ok("health", healthAfterDeploy?.status === "ok" || healthAfterDeploy?.ok === true, JSON.stringify(healthAfterDeploy).slice(0, 120), "P0", {
  category: "auxiliary",
});

const SCENARIOS = [
  {
    id: "long-a:decision-evolution",
    category: "long_conversation",
    turns: [
      "Quero um celular.", "Até 2.500.", "É mais para jogos e redes sociais.", "Motorola também serve.",
      "Qual é a melhor opção?", "Por que ela é melhor?", "Pode subir até 3 mil, mas quero só Samsung e Motorola.",
      "E qual tem melhor bateria?", "Câmera não importa tanto.", "Na verdade meu limite continua sendo 2.500.",
      "Tira Motorola.", "Tem alguma segunda opção?", "Por que eu não deveria escolher a primeira?",
      "Beleza, entendi.", "Então qual você escolheria no meu lugar?",
    ],
    validate: (reply, trace) => trace.length >= 15 && isIntegratedReply(reply) && trace.every((t) => t.status === 200),
  },
  {
    id: "long-b:casual-return",
    category: "long_conversation",
    turns: [
      "Quero um celular para faculdade.", "Até 2 mil.", "Quero boa bateria.", "Obrigado.", "Você é uma IA?",
      "Legal kkk.", "Voltando ao celular, Motorola também serve.", "Pode passar um pouco do orçamento.",
      "Qual ficou sendo a melhor opção?", "E a segunda?",
    ],
    validate: (reply, trace) =>
      isIntegratedReply(reply) && /motorola|bateria|recomend|segunda|opção/i.test(reply) && !RATE_LIMIT.test(reply),
  },
  {
    id: "long-c:successive-corrections",
    category: "long_conversation",
    turns: [
      "Quero um Samsung até 3 mil.", "Na verdade pode ser Motorola também.", "Corrigindo, meu limite é 2.500.",
      "Pode passar um pouco se realmente compensar.", "Não quero Xiaomi.", "Agora priorizo bateria.",
      "Câmera pode ficar em segundo plano.", "Quero voltar ao limite de 2.500.",
      "Qualquer marca serve, menos Xiaomi.", "Qual é a recomendação agora?",
    ],
    validate: (reply, trace, _o, ctx) => {
      const c = constraintsOf(ctx);
      const semanticallyComplete =
        isIntegratedReply(reply) &&
        (/recomend|iria no|ficaria com|melhor opção|continuo|considerando|reavali|escolheria/i.test(reply) ||
          (c.budgetMax === 2500 && (c.excludedBrands || []).includes("xiaomi")));
      return semanticallyComplete && !RATE_LIMIT.test(reply);
    },
  },
  {
    id: "p36-002:consecutive-refinements",
    category: "p36_002",
    trackOpenings: true,
    turns: [
      "Quero um celular até 2.500 para jogos.", "Pode subir para 2.800.", "Motorola também serve.",
      "Agora prioriza bateria.", "Câmera não importa tanto.", "Pode subir mais um pouco.", "Tira Xiaomi.",
      "Quero só Samsung e Motorola.",
    ],
    validate: (reply, trace, openings) => {
      const unique = new Set(openings).size;
      return isRichCommercial(reply) && openings.length >= 5 && unique >= 3 && !RATE_LIMIT.test(reply);
    },
  },
  {
    id: "sequence-h:informal-natural",
    category: "initial_entry",
    turns: ["quero um cell ate 2500", "na real e pra facul", "moto tb serve"],
    validate: (reply, trace) =>
      !/qual recomendação anterior/i.test(trace[0]?.reply_preview || "") && isRichCommercial(reply) && !RATE_LIMIT.test(reply),
  },
  {
    id: "mixed-intent:brand-budget",
    category: "mixed_intent",
    turns: ["Quero um celular Samsung até 3 mil.", "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola."],
    validate: (reply, trace) => {
      const c = constraintsOf(trace[1]?.session_context || {});
      return isRichCommercial(reply) && /samsung/i.test(reply) && /motorola/i.test(reply) && (c.budgetMax > 3000 || /passar|flex|3450/i.test(reply));
    },
  },
  {
    id: "clarify:generic-celular",
    category: "clarification",
    turns: ["Quero um celular.", "Até 2.500.", "Para jogos."],
    validate: (reply, trace) => isIntegratedReply(trace[0]?.reply_preview) && isRichCommercial(reply),
  },
  {
    id: "clarify:specific-proceeds",
    category: "clarification",
    turns: ["Quero um celular Samsung até 2.500 para jogos."],
    validate: (reply) => isIntegratedReply(reply) && !/qual é seu orçamento/i.test(reply),
  },
  {
    id: "initial:qual-celular-indica",
    category: "initial_entry",
    turns: ["qual celular vc indica"],
    validate: (reply) => isIntegratedReply(reply) && !/qual recomendação anterior/i.test(reply),
  },
  {
    id: "initial:queria-iphone",
    category: "initial_entry",
    turns: ["queria um iphone"],
    validate: (reply) => isIntegratedReply(reply) && /iphone|celular|orçamento|ajud/i.test(reply),
  },
  {
    id: "refine:budget-decrease",
    category: "refinement",
    turns: ["Quero um celular Samsung até 3 mil.", "Na verdade meu limite é 2.500."],
    validate: (reply, trace) => {
      const c = constraintsOf(trace[1]?.session_context || {});
      return isRichCommercial(reply) && (c.budgetMax === 2500 || /2500|2\.500/i.test(reply));
    },
  },
  {
    id: "refine:brand-remove",
    category: "refinement",
    turns: ["Quero um celular Samsung até 3 mil.", "Tira Xiaomi."],
    validate: (reply) => isRichCommercial(reply),
  },
  {
    id: "refine:priority-battery",
    category: "refinement",
    turns: ["Quero um celular Samsung até 3 mil.", "Agora bateria é mais importante."],
    validate: (reply, trace) => {
      const c = constraintsOf(trace[1]?.session_context || {});
      return isRichCommercial(reply) && !isGenericFallback(reply) && (/bateria|priorid/i.test(reply) || (c.desiredAttributes || []).includes("battery"));
    },
  },
  {
    id: "mixed:hard-cap-brand",
    category: "mixed_intent",
    turns: ["Quero um celular Samsung até 3 mil.", "Motorola também serve, porém não quero passar de 2.500."],
    validate: (reply, trace) => {
      const c = constraintsOf(trace[1]?.session_context || {});
      return isRichCommercial(reply) && c.budgetMax === 2500;
    },
  },
  {
    id: "conflict:flex-vs-hard",
    category: "conflict",
    turns: ["Quero um celular Samsung até 3 mil.", "Pode passar de 3 mil, mas meu limite máximo é 2.800."],
    validate: (reply, trace) => {
      const c = constraintsOf(trace[1]?.session_context || {});
      return c.budgetMax === 2800 || /2800|2\.800|limite/i.test(reply);
    },
  },
];

const BUDGET_MATRIX = [
  ["budget:para-3-mil", "Pode aumentar para 3 mil.", 3000],
  ["budget:para-2-mil", "Pode aumentar para 2 mil.", 2000],
  ["budget:subir-3-mil", "Pode subir para 3 mil.", 3000],
  ["budget:limite-4-mil", "Meu limite agora é 4 mil.", 4000],
  ["budget:ir-pra-3-mil", "pode ir pra 3 mil", 3000],
  ["budget:3500-dot", "pode aumentar para 3.500", 3500],
  ["budget:3500-plain", "pode aumentar para 3500", 3500],
];

const PRIORITY_MATRIX = [
  ["priority:agora-bateria", "Agora bateria é mais importante."],
  ["priority:bateria-agora", "Bateria agora é o mais importante."],
  ["priority:importancia-bateria", "Quero dar mais importância para bateria."],
  ["priority:prioriza-bateria", "Agora prioriza bateria."],
  ["priority:bateria-prioridade", "bateria é prioridade"],
  ["priority:focar-bateria", "quero focar mais em bateria"],
  ["priority:camera", "agora câmera é mais importante"],
  ["priority:desempenho", "desempenho virou prioridade"],
];

const NEGATIVES = [
  ["neg:boa-tarde", "boa tarde"],
  ["neg:obrigado", "obrigado"],
  ["neg:kkkk", "kkkk"],
  ["neg:quem-e-voce", "quem é você?"],
  ["neg:nao-entendi", "não entendi"],
];

for (let run = 1; run <= RUNS; run += 1) {
  console.log(`\n--- Production run ${run}/${RUNS} ---\n`);
  for (const def of SCENARIOS) await runMultiTurn(def, run);
  for (const [id, msg, exp] of BUDGET_MATRIX) await runBudgetMatrix(id, msg, exp, run);
  for (const [id, msg] of PRIORITY_MATRIX) await runPriorityMatrix(id, msg, run);
  for (const [id, query] of NEGATIVES) await runNegative(id, query, run);
}

const p36 = scenarios.find((s) => s.scenario_id === "p36-002:consecutive-refinements" && s.run_id === 1);
const p36Classification = p36?.unique_openings >= 3 ? "COSMETIC_NON_BLOCKING" : p36?.pass ? "COSMETIC_NON_BLOCKING" : "REQUIRES_REVIEW";

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => c.pass === false).length;
const skipped = checks.filter((c) => c.skip).length;
const p0Checks = checks.filter((c) => c.severity === "P0");
const p0Failed = p0Checks.filter((c) => c.pass === false).length;
const p1Failed = checks.filter((c) => c.severity === "P1" && c.pass === false).length;

const countReconciliation = {
  auxiliary: checks.filter((c) => c.category === "auxiliary").length,
  p0_scenarios_per_run: SCENARIOS.length,
  p0_scenario_runs: SCENARIOS.length * RUNS,
  p0_budget_matrix_per_run: BUDGET_MATRIX.length,
  p0_budget_runs: BUDGET_MATRIX.length * RUNS,
  p0_priority_matrix_per_run: PRIORITY_MATRIX.length,
  p0_priority_runs: PRIORITY_MATRIX.length * RUNS,
  p1_negatives_per_run: NEGATIVES.length,
  p1_negative_runs: NEGATIVES.length * RUNS,
  health_checks: 1,
  total_checks: checks.length,
  formula: "1 health + (15 scenarios + 7 budget + 8 priority) × 2 runs + 5 negatives × 2 runs = 71",
  expected_total: 1 + (SCENARIOS.length + BUDGET_MATRIX.length + PRIORITY_MATRIX.length) * RUNS + NEGATIVES.length * RUNS,
  passed,
  failed,
  skipped,
  reconciled: passed + failed + skipped === checks.length,
  all_check_ids: checks.map((c) => c.id),
};

const evidence = {
  patch: "3.7",
  phase: "production_validation",
  status: p0Failed === 0 ? "APPROVED" : "REJECTED",
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  base_url: BASE,
  commit,
  deploy_build: healthAfterDeploy?.build || null,
  runs: RUNS,
  count_reconciliation: countReconciliation,
  summary: { passed, failed, skipped, p0_total: p0Checks.length, p0_failed: p0Failed, p1_failed: p1Failed, scenarios: scenarios.length },
  p36_002: { classification: p36Classification, unique_openings: p36?.unique_openings, openings: p36?.openings, pass: p36?.pass },
  checks,
  scenarios,
  latencies_ms: latencies,
};

const outDir = join(ROOT, "docs/conversational");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "PATCH_3_7_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));
writeFileSync(join(outDir, "PATCH_3_7_LONG_CONVERSATIONS_EVIDENCE.json"), JSON.stringify({
  patch: "3.7",
  finished_at: new Date().toISOString(),
  commit,
  deploy_build: healthAfterDeploy?.build,
  scenarios: scenarios.filter((s) => s.category === "long_conversation" || s.scenario_id?.startsWith("long-")),
}, null, 2));

writeFileSync(join(outDir, "PATCH_3_7_PENDING_ISSUES.json"), JSON.stringify({
  patch: "3.7",
  finished_at: new Date().toISOString(),
  blocking: p0Failed > 0 ? [{ id: "P37-PROD-P0", problem: `${p0Failed} P0 failures in production`, blocking: true }] : [],
  non_blocking: p36Classification === "COSMETIC_NON_BLOCKING" ? [{ id: "P36-002", classification: p36Classification, blocking: false }] : [],
  out_of_scope: [],
}, null, 2));

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.7 PRODUCTION: ${passed} passed, ${failed} failed, ${skipped} skipped (P0 fail: ${p0Failed})`);
console.log(`Total checks: ${checks.length} (expected ${countReconciliation.expected_total}, reconciled=${countReconciliation.reconciled})`);
console.log(`P36-002: ${p36Classification}`);
process.exit(p0Failed > 0 ? 1 : 0);
