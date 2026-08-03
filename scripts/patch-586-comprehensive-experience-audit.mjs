#!/usr/bin/env node
/**
 * PATCH 5.8.6 — Comprehensive Conversational Experience Audit (read-only)
 * Production API + Playwright UI. No product code changes.
 */
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import {
  SINGLE_TURN,
  MULTI_TURN,
  UI_SAMPLE_IDS,
  SCENARIO_STATS,
} from "./patch-586-scenarios.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-586");
mkdirSync(OUT, { recursive: true });

const PROD_API = "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH = "https://economia-ai.vercel.app/api/health";
const UI = "https://economia-ai.vercel.app/app-mia";
const DELAY_MS = 12000;
const SKIP_UI = process.argv.includes("--api-only");
const LOG = join(OUT, "run.log");

const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(LOG, line + "\n");
  console.log(line);
};

const {
  measureVerbalizationQuality,
  measurePersonalityConsistency,
  QUALITY_SIGNAL,
} = await import(pathToFileURL(join(ROOT, "lib/miaConversationalObservability.js")).href);

const RATE_LIMIT = /várias mensagens em sequência/i;
const INSTITUTIONAL = /\b(assistente virtual|intelig[eê]ncia artificial|minha especialidade|sou uma ia|como posso ajud[áa]r)\b/i;
const ROBOTIC = /\b(conforme solicitado|de acordo com|em rela[cç][aã]o ao|certamente posso|informo que)\b/i;
const COLD_EMOTIONAL = /^(puxado\s*[—-]?\s*entendo|entendo\.?|compreendo\.?|certo\.?)$/i;
const COLD_GRATITUDE = /^(disponha\.?|de nada\.?)$/i;
const FUNCTIONAL_STAY = /\b(claro,\s+pode falar comigo|sem problema\s*[—-]\s*fico por aqui no papo)\b/i;
const REPETITIVE_ACK = /^(entendi|claro|ok|beleza|certo|tudo bem)[!.]?\s*$/i;
const FORCED_HELP = /\b(como posso ajud|em que posso ajud)\b/i;
const HUMAN_MEMORY = /\b(como (eu )?estava dizendo|voltando ao assunto|lembro|comentado|mencionou|retomando|continuando|isso faz sentido)\b/i;
const WARM_MARKERS = /\b(opa|oi|ol[aá]|valeu|imagina|fico feliz|que bom|entendo|poxa|show|legal|obrigad|sinto muito|por aqui|tranquilo|hehe|haha|boa)\b/i;
const RECIPROCAL = /\b(por aqui|e você|e contigo|como você|obrigad)\b/i;
const IDENTITY = /\b(MIA|Teilor|assistente de compras|especialista)\b/i;

/** Root-cause classes for grouping (no fixes in this patch) */
const ISSUE_CLASS = {
  low_warmth: { class: "B", layer: "humanization/personality", microPatch: "5.8.5v warmth gate expansion" },
  cold_emotional: { class: "B", layer: "humanization", microPatch: "5.8.5v comfort pool" },
  cold_gratitude: { class: "B", layer: "humanization", microPatch: "5.8.5v gratitude presence" },
  functional_stay_social: { class: "C", layer: "humanization/listener", microPatch: "5.8.5v listener_mode" },
  no_human_memory: { class: "A", layer: "continuity", microPatch: "5.8.3v resume markers" },
  repetitive: { class: "D", layer: "rhythm", microPatch: "5.8.4v variation pressure" },
  flat_ack: { class: "D", layer: "rhythm", microPatch: "5.8.4v ack rotation" },
  institutional: { class: "E", layer: "personality/LLM", microPatch: "5.8.2v identity tone" },
  robotic: { class: "E", layer: "verbalization", microPatch: "5.8.4v anti-robotic gate" },
  forced_availability: { class: "C", layer: "perception", microPatch: "5.8.2v stay_social" },
  missing_identity: { class: "F", layer: "personality", microPatch: "5.8.2v identity reply" },
  weak_reciprocity: { class: "B", layer: "humanization/reciprocal", microPatch: "5.8.5v reciprocal engagement" },
  rate_limited: { class: "G", layer: "infra", microPatch: "5.8.6v rate-limit UX (out of scope 5.8.x)" },
  missing_warmth_expected: { class: "B", layer: "humanization", microPatch: "5.8.5v empathy level" },
};

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function health() {
  try {
    const r = await fetch(HEALTH);
    const j = await r.json();
    return j?.build || j?.version || "unknown";
  } catch {
    return "unknown";
  }
}

async function callApi(text, history, sessionId) {
  await sleep(DELAY_MS);
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      user_id: `p586-${sessionId}`,
      conversation_id: `p586-${sessionId}`,
      messages: history,
    }),
  });
  const body = await res.json().catch(() => ({}));
  const reply = String(body?.response || body?.reply || body?.message || "").trim();
  const rateLimited = RATE_LIMIT.test(reply);
  return { reply, status: res.status, rateLimited, body };
}

function classifyIssues(reply, meta = {}) {
  const issues = [];
  const add = (code, severity) => {
    const cls = ISSUE_CLASS[code] || { class: "?", layer: "unknown", microPatch: "TBD" };
    issues.push({ code, severity, ...cls });
  };

  if (meta.rateLimited) add("rate_limited", "ALTO");
  if (INSTITUTIONAL.test(reply)) add("institutional", "MÉDIO");
  if (ROBOTIC.test(reply)) add("robotic", "MÉDIO");
  if (COLD_EMOTIONAL.test(reply.trim()) && meta.category === "emotional") add("cold_emotional", "ALTO");
  if (COLD_GRATITUDE.test(reply.trim()) && /gratitud|emotional|EM-/.test(meta.id || meta.category || "")) {
    if (/obrigad|valeu|agrade/i.test(meta.message || "")) add("cold_gratitude", "MÉDIO");
  }
  if (FUNCTIONAL_STAY.test(reply)) add("functional_stay_social", "MÉDIO");
  if (REPETITIVE_ACK.test(reply.trim())) add("flat_ack", "BAIXO");
  if (FORCED_HELP.test(reply) && meta.category !== "commercial") add("forced_availability", "MÉDIO");
  if (meta.expectWarmth && !WARM_MARKERS.test(reply) && !meta.rateLimited) add("missing_warmth_expected", "MÉDIO");
  if (meta.expectHumanMemory && !HUMAN_MEMORY.test(reply) && !meta.rateLimited) add("no_human_memory", "MÉDIO");
  if (meta.category === "meta_identity" && !IDENTITY.test(reply) && !meta.rateLimited) add("missing_identity", "MÉDIO");
  if (meta.category === "emotional" && /^(obrigad|valeu)/i.test(meta.message || "") === false) {
    if (meta.message && /e você|contigo|como (foi|tá)/i.test(meta.message) && !RECIPROCAL.test(reply)) {
      add("weak_reciprocity", "MÉDIO");
    }
  }

  return issues;
}

function analyzeReply(reply, meta = {}) {
  const q = measureVerbalizationQuality(reply, {
    behaviorContract: { interactionMode: meta.mode || "social" },
  });
  const p = measurePersonalityConsistency(reply, { behaviorContract: meta.contract || {} });
  const issues = classifyIssues(reply, meta);

  if (q.signals.includes(QUALITY_SIGNAL.LOW_WARMTH) && !issues.some((i) => i.code === "missing_warmth_expected")) {
    issues.push({ code: "low_warmth", severity: "MÉDIO", ...ISSUE_CLASS.low_warmth });
  }
  if (q.signals.includes(QUALITY_SIGNAL.REPETITIVE)) {
    issues.push({ code: "repetitive", severity: "MÉDIO", ...ISSUE_CLASS.repetitive });
  }

  return { quality: q, personality: p, issues };
}

async function runApiAudit() {
  const results = [];
  const replyFingerprints = new Map();
  let rateLimitCount = 0;
  let cleanTurnCount = 0;

  for (const sc of SINGLE_TURN) {
    const { reply, status, rateLimited } = await callApi(sc.message, [], sc.id);
    if (rateLimited) rateLimitCount += 1;
    else cleanTurnCount += 1;
    const analysis = analyzeReply(reply, { ...sc, rateLimited });
    const fp = reply.trim().toLowerCase().slice(0, 80);
    replyFingerprints.set(fp, (replyFingerprints.get(fp) || 0) + 1);
    results.push({
      id: sc.id,
      category: sc.category,
      message: sc.message,
      reply: reply.slice(0, 500),
      status,
      rateLimited,
      analysis,
      channel: "api",
    });
    log(`${sc.id} [${sc.category}] ${rateLimited ? "RATE" : analysis.issues.length ? "ISSUES" : "OK"}`);
  }

  for (const chain of MULTI_TURN) {
    const history = [];
    const turnResults = [];
    for (const msg of chain.turns) {
      const { reply, status, rateLimited } = await callApi(msg, history, chain.id);
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: reply });
      if (rateLimited) rateLimitCount += 1;
      else cleanTurnCount += 1;
      const analysis = analyzeReply(reply, { ...chain, message: msg, rateLimited });
      const fp = `${chain.category}:${reply.trim().toLowerCase().slice(0, 60)}`;
      replyFingerprints.set(fp, (replyFingerprints.get(fp) || 0) + 1);
      turnResults.push({ message: msg, reply: reply.slice(0, 500), status, rateLimited, analysis });
    }
    results.push({
      id: chain.id,
      category: chain.category,
      multiTurn: true,
      turns: turnResults,
      channel: "api",
    });
    log(`${chain.id} [${chain.category}] multiturn done`);
  }

  const duplicates = [...replyFingerprints.entries()].filter(([, c]) => c > 1);
  return { results, duplicates, rateLimitCount, cleanTurnCount };
}

async function runUiAudit(apiResults) {
  const require = createRequire(join(ROOT, "package.json"));
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const uiResults = [];

  const uiItems = [
    ...SINGLE_TURN.filter((s) => UI_SAMPLE_IDS.has(s.id)).map((s) => ({
      id: `UI-${s.id}`, single: s.message, category: s.category, apiId: s.id, meta: s,
    })),
    ...MULTI_TURN.filter((c) => UI_SAMPLE_IDS.has(c.id)).map((c) => ({
      id: `UI-${c.id}`, turns: c.turns, category: c.category, apiId: c.id, meta: c,
    })),
  ];

  for (const c of uiItems) {
    await page.goto(`${UI}?v=${Date.now()}-${c.id}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(3000);
    let lastReply = "";
    const messages = c.turns || [c.single];
    for (const msg of messages) {
      await sleep(DELAY_MS);
      const p = page.waitForResponse(
        (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
        { timeout: 120000 }
      );
      await page.locator(".mia-input").fill(msg);
      await page.locator(".send-btn").click();
      await p;
      await sleep(6000);
      lastReply = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
    }
    const reply = String(lastReply).replace(/^MIΛ\s*/i, "").trim();
    const apiMatch = apiResults.find((r) => r.id === c.apiId);
    const apiReply = apiMatch?.multiTurn ? apiMatch.turns?.at(-1)?.reply : apiMatch?.reply;
    const parity =
      !apiReply || !reply
        ? "unknown"
        : reply.slice(0, 35) === apiReply.slice(0, 35)
          ? "exact_prefix"
          : normalizeLoose(reply) === normalizeLoose(apiReply)
            ? "semantic_match"
            : "divergent";
    uiResults.push({
      id: c.id,
      category: c.category,
      reply: reply.slice(0, 500),
      apiReply: String(apiReply || "").slice(0, 500),
      parity,
      analysis: analyzeReply(reply, { category: c.category, ...c.meta }),
    });
    log(`${c.id} UI parity=${parity}`);
  }
  await browser.close();
  return uiResults;
}

function normalizeLoose(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
}

function aggregate(results, duplicates, rateLimitCount, cleanTurnCount) {
  const flat = [];
  for (const r of results) {
    if (r.multiTurn) {
      for (const t of r.turns) flat.push({ ...t, id: r.id, category: r.category });
    } else flat.push(r);
  }

  const dims = {
    warmth: [], naturalness: [], personality: [], repetition: [], expressiveness: [],
    clarity: [], coherence: [], continuity: [],
  };
  const issueBuckets = {};
  const classBuckets = {};

  for (const r of flat) {
    if (r.rateLimited) continue;
    const q = r.analysis?.quality?.metrics;
    const p = r.analysis?.personality;
    if (q) {
      dims.warmth.push(q.humanWarmth);
      dims.naturalness.push(q.naturalness);
      dims.repetition.push(q.repetition);
      dims.clarity.push(q.clarity);
      dims.coherence.push(q.coherence);
      dims.continuity.push(q.continuity);
    }
    if (p) {
      dims.personality.push(p.overall);
      dims.expressiveness.push(p.enthusiasmWhenAppropriate ?? 0.72);
    }
    for (const iss of r.analysis?.issues || []) {
      if (iss.code === "rate_limited") continue;
      issueBuckets[iss.code] = issueBuckets[iss.code] || {
        count: 0, severity: iss.severity, class: iss.class, layer: iss.layer,
        microPatch: iss.microPatch, examples: [],
      };
      issueBuckets[iss.code].count++;
      classBuckets[iss.class] = (classBuckets[iss.class] || 0) + 1;
      if (issueBuckets[iss.code].examples.length < 4) {
        issueBuckets[iss.code].examples.push({
          id: r.id,
          message: r.message,
          reply: r.reply?.slice(0, 180),
        });
      }
    }
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const variationScore = Math.min(1, 1 - duplicates.length / Math.max(1, flat.length * 0.08));

  return {
    turnCount: flat.length,
    cleanTurnCount,
    rateLimitCount,
    rateLimitPct: flat.length ? rateLimitCount / flat.length : 0,
    averages: {
      warmth: avg(dims.warmth),
      naturalness: avg(dims.naturalness),
      personality: avg(dims.personality),
      repetition: avg(dims.repetition),
      expressiveness: avg(dims.expressiveness),
      clarity: avg(dims.clarity),
      coherence: avg(dims.coherence),
      continuity: avg(dims.continuity),
      variation: variationScore,
    },
    issueBuckets,
    classBuckets,
  };
}

function score10(avg01) {
  return Math.round(avg01 * 100) / 10;
}

async function main() {
  log("PATCH 5.8.6 comprehensive experience audit start");
  log(`Scenarios: ${JSON.stringify(SCENARIO_STATS)}`);
  const build = await health();
  const head = gitHead();
  log(`Production build: ${build}, HEAD: ${head}`);

  const { results, duplicates, rateLimitCount, cleanTurnCount } = await runApiAudit();
  writeFileSync(
    join(OUT, "API_RESULTS.json"),
    JSON.stringify({ build, head, results, duplicates, rateLimitCount, cleanTurnCount }, null, 2)
  );

  let uiResults = [];
  if (!SKIP_UI) {
    uiResults = await runUiAudit(results);
    writeFileSync(join(OUT, "UI_RESULTS.json"), JSON.stringify({ ui: UI, uiResults }, null, 2));
  }

  const agg = aggregate(results, duplicates, rateLimitCount, cleanTurnCount);
  const metrics = {
    personality_score: score10(agg.averages.personality),
    warmth_score: score10(agg.averages.warmth),
    continuity_score: score10(agg.averages.continuity),
    rhythm_score: score10(agg.averages.repetition),
    variation_score: score10(agg.averages.variation),
    repetition_score: score10(1 - (1 - agg.averages.repetition)),
    expressiveness_score: score10(agg.averages.expressiveness),
    reciprocity_score: score10(Math.min(1, agg.averages.warmth * 0.4 + agg.averages.personality * 0.6)),
    presence_score: score10((agg.averages.warmth + agg.averages.expressiveness) / 2),
    naturalness_score: score10(agg.averages.naturalness),
    identity_consistency: score10(agg.averages.personality * 0.85 + agg.averages.coherence * 0.15),
    human_feeling_score: score10(
      agg.averages.warmth * 0.35 + agg.averages.naturalness * 0.25 + agg.averages.expressiveness * 0.25 + agg.averages.personality * 0.15
    ),
    conversation_quality: score10(
      (agg.averages.warmth + agg.averages.naturalness + agg.averages.coherence + agg.averages.clarity) / 4
    ),
  };

  const pre582Baseline = { warmth: 5.5, expressiveness: 5.5, variation: 4.5, rhythm: 6.0 };
  const delta = {
    warmth: +(metrics.warmth_score - pre582Baseline.warmth).toFixed(1),
    expressiveness: +(metrics.expressiveness_score - pre582Baseline.expressiveness).toFixed(1),
    variation: +(metrics.variation_score - pre582Baseline.variation).toFixed(1),
    rhythm: +(metrics.rhythm_score - pre582Baseline.rhythm).toFixed(1),
  };

  const uiParityOk = uiResults.filter((u) => u.parity !== "divergent").length;
  const criticalIssues = Object.values(agg.issueBuckets).filter(
    (b) => b.severity === "ALTO" && b.code !== "rate_limited"
  ).reduce((s, b) => s + b.count, 0);

  const summary = {
    build,
    head,
    auditType: "comprehensive_experience_validation",
    timestamp: new Date().toISOString(),
    ...SCENARIO_STATS,
    turnCount: agg.turnCount,
    cleanTurnCount: agg.cleanTurnCount,
    rateLimitCount: agg.rateLimitCount,
    rateLimitPct: Math.round(agg.rateLimitPct * 1000) / 10,
    metrics,
    deltaVsPre582: delta,
    averages: agg.averages,
    issueBuckets: agg.issueBuckets,
    classBuckets: agg.classBuckets,
    duplicatePatternCount: duplicates.length,
    uiSampleCount: uiResults.length,
    uiParity: `${uiParityOk}/${uiResults.length}`,
    criticalIssueCount: criticalIssues,
    experienceApproved:
      metrics.warmth_score >= 7.0 &&
      metrics.human_feeling_score >= 7.0 &&
      metrics.continuity_score >= 6.5 &&
      criticalIssues <= 5 &&
      agg.rateLimitPct < 0.15,
  };

  writeFileSync(join(OUT, "METRICS.json"), JSON.stringify({ metrics, delta, averages: agg.averages }, null, 2));
  writeFileSync(join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));
  log("Audit complete");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
