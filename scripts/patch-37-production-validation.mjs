#!/usr/bin/env node
/**
 * PATCH 3.7 — Production validation (final Phase 3 audit matrix)
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

const checks = [];
const scenarios = [];
const latencies = [];
const startedAt = new Date().toISOString();

const ROBOTIC =
  /^(faz sentido|entendi|boa observa[cç][aã]o|agora mudou um detalhe importante|faz sentido pelo que voc[eê] trouxe|esse ponto pesa na decis[aã]o)\.?$/i;

function ok(id, pass, detail = "", severity = "P0", meta = {}) {
  checks.push({ id, pass, detail, severity, at: new Date().toISOString(), ...meta });
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

function firstLine(text = "") {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
}

async function runMultiTurn(def, runId = 1) {
  const conv = randomUUID();
  let sessionContext = {};
  let lastReply = "";
  const trace = [];
  const openings = [];

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
    const opening = firstLine(lastReply);
    if (def.trackOpenings && i > 0) openings.push(opening);
    trace.push({
      turn: i + 1,
      query,
      status: res.status,
      reply_preview: lastReply.slice(0, 200),
      opening,
      session_context: sessionContext,
    });
    if (res.status !== 200) break;
    if (i < def.turns.length - 1) await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
  }

  const pass = def.validate ? def.validate(lastReply, trace, openings) : isRichCommercial(lastReply);
  scenarios.push({
    scenario_id: def.id,
    run_id: runId,
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
  await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
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
    reply.length >= 10 &&
    !/galaxy|iphone|motorola|recomendo o|até r\$|orçamento de/i.test(reply);
  scenarios.push({
    scenario_id: id,
    run_id: runId,
    pass,
    turns: 1,
    turns_list: [query],
    trace: [{ query, reply_preview: reply.slice(0, 160) }],
  });
  ok(`${id}${runId > 1 ? `-run${runId}` : ""}`, pass, reply.slice(0, 120), "P1", {
    run_id: runId,
    category: "negative_control",
  });
  await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
}

let commit = "unknown";
try {
  commit = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  /* ignore */
}

console.log(`\nPATCH 3.7 — Production validation (${RUNS} run(s))\nBase: ${BASE}\n`);

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => ({}));
ok("health", health?.status === "ok" || health?.ok === true, JSON.stringify(health).slice(0, 120));

const SCENARIOS = [
  {
    id: "long-a:decision-evolution",
    category: "long_conversation",
    turns: [
      "Quero um celular.",
      "Até 2.500.",
      "É mais para jogos e redes sociais.",
      "Motorola também serve.",
      "Qual é a melhor opção?",
      "Por que ela é melhor?",
      "Pode subir até 3 mil, mas quero só Samsung e Motorola.",
      "E qual tem melhor bateria?",
      "Câmera não importa tanto.",
      "Na verdade meu limite continua sendo 2.500.",
      "Tira Motorola.",
      "Tem alguma segunda opção?",
      "Por que eu não deveria escolher a primeira?",
      "Beleza, entendi.",
      "Então qual você escolheria no meu lugar?",
    ],
    validate: (reply, trace) =>
      trace.length >= 15 &&
      isIntegratedReply(reply) &&
      trace.every((t) => t.status === 200),
  },
  {
    id: "long-b:casual-return",
    category: "long_conversation",
    turns: [
      "Quero um celular para faculdade.",
      "Até 2 mil.",
      "Quero boa bateria.",
      "Obrigado.",
      "Você é uma IA?",
      "Legal kkk.",
      "Voltando ao celular, Motorola também serve.",
      "Pode passar um pouco do orçamento.",
      "Qual ficou sendo a melhor opção?",
      "E a segunda?",
    ],
    validate: (reply, trace) => {
      const lastCommercial = trace[trace.length - 1];
      return (
        isIntegratedReply(reply) &&
        /motorola|bateria|recomend|segunda|opção/i.test(reply) &&
        !/qual recomendação anterior/i.test(lastCommercial?.reply_preview || "")
      );
    },
  },
  {
    id: "long-c:successive-corrections",
    category: "long_conversation",
    turns: [
      "Quero um Samsung até 3 mil.",
      "Na verdade pode ser Motorola também.",
      "Corrigindo, meu limite é 2.500.",
      "Pode passar um pouco se realmente compensar.",
      "Não quero Xiaomi.",
      "Agora priorizo bateria.",
      "Câmera pode ficar em segundo plano.",
      "Quero voltar ao limite de 2.500.",
      "Qualquer marca serve, menos Xiaomi.",
      "Qual é a recomendação agora?",
    ],
    validate: (reply) => isRichCommercial(reply) && /recomend|continuo|considerando/i.test(reply),
  },
  {
    id: "p36-002:consecutive-refinements",
    category: "p36_002",
    trackOpenings: true,
    turns: [
      "Quero um celular até 2.500 para jogos.",
      "Pode subir para 2.800.",
      "Motorola também serve.",
      "Agora prioriza bateria.",
      "Câmera não importa tanto.",
      "Pode subir mais um pouco.",
      "Tira Xiaomi.",
      "Quero só Samsung e Motorola.",
    ],
    validate: (reply, trace, openings) => {
      const unique = new Set(openings).size;
      const ratio = openings.length ? unique / openings.length : 0;
      return (
        isRichCommercial(reply) &&
        openings.length >= 5 &&
        unique >= 3 &&
        ratio >= 0.5
      );
    },
  },
  {
    id: "sequence-h:informal-natural",
    category: "initial_entry",
    turns: ["quero um cell ate 2500", "na real e pra facul", "moto tb serve"],
    validate: (reply, trace) =>
      !/qual recomendação anterior/i.test(trace[0]?.reply_preview || "") &&
      isRichCommercial(reply),
  },
  {
    id: "mixed-intent:brand-budget",
    category: "mixed_intent",
    turns: [
      "Quero um celular Samsung até 3 mil.",
      "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.",
    ],
    validate: (reply, trace) => {
      const ctx = trace[1]?.session_context || {};
      const c = ctx.lastCommercialConstraints || {};
      return (
        isRichCommercial(reply) &&
        /samsung/i.test(reply) &&
        /motorola/i.test(reply) &&
        (c.budgetMax > 3000 || /passar|flex|3450/i.test(reply))
      );
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
    validate: (reply) => isRichCommercial(reply) && /2500|2\.500/i.test(reply),
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
    validate: (reply) => isRichCommercial(reply) && /bateria/i.test(reply),
  },
  {
    id: "mixed:hard-cap-brand",
    category: "mixed_intent",
    turns: [
      "Quero um celular Samsung até 3 mil.",
      "Motorola também serve, porém não quero passar de 2.500.",
    ],
    validate: (reply, trace) => {
      const c = trace[1]?.session_context?.lastCommercialConstraints || {};
      return isRichCommercial(reply) && (c.budgetMax === 2500 || /2500|2\.500/i.test(reply));
    },
  },
  {
    id: "conflict:flex-vs-hard",
    category: "conflict",
    turns: [
      "Quero um celular Samsung até 3 mil.",
      "Pode passar de 3 mil, mas meu limite máximo é 2.800.",
    ],
    validate: (reply, trace) => {
      const c = trace[1]?.session_context?.lastCommercialConstraints || {};
      return c.budgetMax === 2800 || /2800|2\.800|limite/i.test(reply);
    },
  },
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
  for (const def of SCENARIOS) {
    await runMultiTurn(def, run);
  }
  for (const [id, query] of NEGATIVES) {
    await runNegative(id, query, run);
  }
}

const p36 = scenarios.find((s) => s.scenario_id === "p36-002:consecutive-refinements" && s.run_id === 1);
const p36Classification =
  p36?.unique_openings >= 3
    ? "COSMETIC_NON_BLOCKING"
    : p36?.pass
      ? "COSMETIC_NON_BLOCKING"
      : "REQUIRES_REVIEW";

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => c.pass === false).length;
const p0Failed = checks.filter((c) => c.pass === false && c.severity === "P0").length;

const evidence = {
  patch: "3.7",
  phase: "production_validation",
  status: p0Failed === 0 ? "APPROVED" : "REJECTED",
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  base_url: BASE,
  commit,
  deploy_build: health?.build || null,
  runs: RUNS,
  summary: { passed, failed, p0_failed: p0Failed, scenarios: scenarios.length },
  p36_002: {
    classification: p36Classification,
    unique_openings: p36?.unique_openings,
    openings: p36?.openings,
    pass: p36?.pass,
  },
  checks,
  scenarios,
  latencies_ms: latencies,
};

const outDir = join(ROOT, "docs/conversational");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "PATCH_3_7_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

const pendingPath = join(outDir, "PATCH_3_7_PENDING_ISSUES.json");
try {
  const pending = JSON.parse(readFileSync(pendingPath, "utf8"));
  if (p36Classification === "COSMETIC_NON_BLOCKING") {
    pending.non_blocking = [
      {
        id: "P36-002",
        problem: "Repetição ocasional de abertura humanizada em refinamentos consecutivos",
        impact: "Cosmético — variedade suficiente com sourceMessage seed",
        evidence: `production unique_openings=${p36?.unique_openings}/${(p36?.openings || []).length}`,
        classification: p36Classification,
        blocking: false,
      },
    ];
  }
  pending.updated_at = new Date().toISOString();
  writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
} catch {
  /* pending file updated by runner */
}

console.log(`\n${"=".repeat(60)}`);
console.log(`PATCH 3.7 PRODUCTION: ${passed} passed, ${failed} failed (P0 fail: ${p0Failed})`);
console.log(`P36-002: ${p36Classification}`);
process.exit(p0Failed > 0 ? 1 : 0);
