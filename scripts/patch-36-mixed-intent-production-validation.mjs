#!/usr/bin/env node
/**
 * PATCH 3.6.1 — Extended production mixed-intent validation
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

const cases = [
  {
    id: "mixed-1-budget-relax-brand-restrict",
    turns: [
      "Quero um celular Samsung até 3 mil para jogos.",
      "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.",
    ],
    validate: (reply, trace) => {
      const ctx = trace[1]?.session_context?.lastCommercialConstraints || {};
      const brands = ctx.preferredBrands || [];
      return (
        brands.includes("samsung") &&
        brands.includes("motorola") &&
        typeof ctx.budgetMax === "number" &&
        ctx.budgetMax > 3000 &&
        /samsung/i.test(reply) &&
        /motorola/i.test(reply) &&
        /orçamento|passar|flex|teto/i.test(reply)
      );
    },
  },
  {
    id: "mixed-1-inverted-order",
    turns: [
      "Quero um celular Samsung até 3 mil para jogos.",
      "Quero continuar só entre Samsung e Motorola, mas pode passar um pouco dos 3 mil.",
    ],
    validate: (reply, trace) => {
      const ctx = trace[1]?.session_context?.lastCommercialConstraints || {};
      return (
        ctx.preferredBrands?.includes("motorola") &&
        ctx.budgetMax > 3000 &&
        /samsung/i.test(reply) &&
        /motorola/i.test(reply)
      );
    },
  },
  {
    id: "mixed-2-budget-increase-single-brand",
    turns: ["Quero um celular até 3 mil.", "Pode subir até 3.300, mas só quero Samsung."],
    validate: (reply, trace) => {
      const ctx = trace[1]?.session_context?.lastCommercialConstraints || {};
      return ctx.budgetMax === 3300 && ctx.preferredBrands?.join() === "samsung";
    },
  },
  {
    id: "mixed-3-brand-add-hard-cap",
    turns: ["Quero um celular Samsung até 3 mil.", "Motorola também serve, porém não quero passar de 2.500."],
    validate: (reply, trace) => {
      const ctx = trace[1]?.session_context?.lastCommercialConstraints || {};
      return ctx.budgetMax === 2500 && ctx.preferredBrands?.includes("motorola");
    },
  },
  {
    id: "mixed-4-relax-brand-removal",
    turns: ["Quero um celular Samsung até 3 mil.", "Pode ser mais caro se compensar, mas tira Xiaomi."],
    validate: (reply, trace) => {
      const ctx = trace[1]?.session_context?.lastCommercialConstraints || {};
      return ctx.excludedBrands?.includes("xiaomi") && ctx.budgetMax > 3000;
    },
  },
  {
    id: "mixed-followup-both-constraints",
    turns: [
      "Quero um celular Samsung até 3 mil para jogos.",
      "Pode passar um pouco dos 3 mil, mas quero continuar só entre Samsung e Motorola.",
      "E entre as opções que sobraram, qual tem melhor bateria?",
    ],
    validate: (reply, trace) => {
      const ctx = trace[2]?.session_context?.lastCommercialConstraints || {};
      return (
        ctx.preferredBrands?.includes("motorola") &&
        ctx.budgetMax > 3000 &&
        reply.length > 40
      );
    },
  },
  {
    id: "negative-comparison-not-restriction",
    turns: ["Quero um celular Samsung até 3 mil.", "Samsung ou Motorola, qual é melhor?"],
    validate: (_reply, trace) => {
      const ctx = trace[1]?.session_context?.lastCommercialConstraints || {};
      return !(ctx.preferredBrands?.length === 2 && ctx.preferredBrands.includes("motorola"));
    },
  },
];

async function fetchChat(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/mia-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
let health = {};

console.log(`\nPATCH 3.6.1 — Extended mixed-intent production validation\nBase: ${BASE}\n`);

try {
  health = await fetch(`${BASE}/api/health`).then((r) => r.json());
} catch {
  health = {};
}

for (const def of cases) {
  const conv = randomUUID();
  let sessionContext = {};
  const trace = [];
  let lastReply = "";

  for (let i = 0; i < def.turns.length; i++) {
    const query = def.turns[i];
    const messages = def.turns.slice(0, i + 1).map((t) => ({ role: "user", content: t }));
    const { res, json } = await fetchChat({
      text: query,
      messages,
      session_context: sessionContext,
      conversation_id: conv,
    });
    sessionContext = json.session_context || sessionContext;
    lastReply = String(json.reply || "");
    trace.push({
      query,
      status: res.status,
      reply_preview: lastReply.slice(0, 200),
      session_context: sessionContext,
      constraints: sessionContext.lastCommercialConstraints || {},
    });
    if (i < def.turns.length - 1) await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
  }

  const pass = def.validate(lastReply, trace);
  results.push({
    id: def.id,
    pass,
    turns: def.turns,
    trace,
    reply_preview: lastReply.slice(0, 280),
  });
  console.log(`${pass ? "PASS" : "FAIL"} [${def.id}] ${lastReply.slice(0, 120)}`);
  await new Promise((r) => setTimeout(r, CHAT_DELAY_MS));
}

const passed = results.filter((r) => r.pass).length;
const evidence = {
  patch: "3.6.1",
  phase: "mixed_intent_production_validation",
  status: passed === results.length ? "APPROVED" : "REJECTED",
  finished_at: new Date().toISOString(),
  base_url: BASE,
  deploy_build: health?.build || null,
  commit: "25841ec",
  summary: { passed, failed: results.length - passed, total: results.length },
  results,
};

const outDir = join(ROOT, "docs/conversational");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "PATCH_3_6_MIXED_INTENT_PRODUCTION_EVIDENCE.json"), JSON.stringify(evidence, null, 2));

console.log(`\nMixed intent production: ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
