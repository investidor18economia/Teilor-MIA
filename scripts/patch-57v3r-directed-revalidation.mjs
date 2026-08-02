#!/usr/bin/env node
/**
 * PATCH 5.7V.3R — Directed revalidation of 74 blocking failures from 5.7V.2
 * Usage: node scripts/patch-57v3r-directed-revalidation.mjs [--resume]
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const V2 = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v2");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v3r");
mkdirSync(OUT, { recursive: true });

const PROD_API = process.env.MIA_PROD_API || "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH_URL = process.env.MIA_HEALTH || "https://economia-ai.vercel.app/api/health";
const UI_URL = process.env.MIA_UI || "https://economia-ai.vercel.app/app-mia";
const RESUME = process.argv.includes("--resume");
const DELAY = Number(process.env.MIA_AUDIT_DELAY_MS || 3500);
const LOG = join(OUT, "run.log");
const CHECKPOINT = join(OUT, "REVALIDATION_CHECKPOINT.json");
const RESULTS = join(OUT, "BLOCKING_FAILURE_REVALIDATION.json");
const VARIATIONS = join(OUT, "ATTRIBUTE_REFERENCE_VARIATIONS.json");
const PARITY = join(OUT, "API_UI_PARITY_BLOCKING.json");
const REGRESSION = join(OUT, "REGRESSION_RESULTS.json");

const { measureVerbalizationQuality, measurePersonalityConsistency } = await import(
  pathToFileURL(join(ROOT, "lib/miaConversationalObservability.js")).href
);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  appendFileSync(LOG, line + "\n");
  console.log(line);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadJson(p, fb = null) {
  if (!existsSync(p)) return fb;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fb;
  }
}

function atomicWrite(path, data) {
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2));
  writeFileSync(path, readFileSync(`${path}.tmp`));
}

function coldClarification(reply = "") {
  return /me diz rapidinho a que você se refere|me ajuda: você se refere/i.test(reply);
}

function classifyFailure(row) {
  if (row.rateLimited) return "rate-limit";
  if (!row.reply?.trim()) return "empty_response";
  if (row.coldClarification) return "degradation_relevant";
  if (row.ironyRepair) return "misrouting";
  return null;
}

async function callApi({ message, history, sessionId, label }) {
  let delay = DELAY;
  for (let attempt = 1; attempt <= 6; attempt++) {
    await sleep(delay);
    try {
      const res = await fetch(PROD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message,
          user_id: `p57v3r-${sessionId}`,
          conversation_id: sessionId,
          messages: history,
          session_context: {},
        }),
      });
      const body = await res.json().catch(() => ({}));
      const reply = String(body?.reply ?? "").trim();
      if (res.status === 429) {
        delay = Math.min(delay * 2, 120000);
        log(`[RATE-LIMIT] ${label} attempt ${attempt}`);
        continue;
      }
      const quality = measureVerbalizationQuality(reply, { behaviorContract: { responseDepth: "brief" } });
      const personality = measurePersonalityConsistency(reply, {});
      return {
        httpStatus: res.status,
        reply,
        response_path: body?.latency_analytics?.response_path || body?.response_path || null,
        interaction_mode: body?.interaction_mode || body?.latency_analytics?.interaction_mode || null,
        intent: body?.intent || null,
        quality: quality.overall,
        personality: personality.overall,
        coldClarification: coldClarification(reply),
        ironyRepair: /pego a ironia/i.test(reply),
        rateLimited: false,
      };
    } catch (err) {
      if (attempt === 6) return { httpStatus: 0, reply: "", error: String(err.message) };
      delay = Math.min(delay * 2, 60000);
    }
  }
  return { httpStatus: 429, reply: "", rateLimited: true };
}

async function replayConversation(userTurns, sessionId, label) {
  const history = [];
  const turnResults = [];
  for (let t = 0; t < userTurns.length; t++) {
    const msg = userTurns[t];
    const api = await callApi({ message: msg, history: [...history], sessionId, label: `${label}-t${t + 1}` });
    turnResults.push({ turn: t + 1, message: msg, ...api, failureType: classifyFailure(api) });
    history.push({ role: "user", content: msg });
    if (api.reply) history.push({ role: "assistant", content: api.reply });
  }
  return { turnResults, final: turnResults[turnResults.length - 1] };
}

function buildFailureScenarios() {
  const catalog = loadJson(join(V2, "SCENARIO_CATALOG.json"));
  const failures = loadJson(join(V2, "FAILURE_CATALOG.json"), { failures: [] });
  const mtById = Object.fromEntries((catalog?.multiturn || []).map((c) => [c.id, c]));
  return failures.failures.map((f, idx) => {
    const conv = mtById[f.convId];
    const userTurns = conv?.userTurns?.slice(0, f.turn) || [];
    return {
      id: `RF-${String(idx + 1).padStart(3, "0")}`,
      originalFailure: f,
      convId: f.convId,
      theme: conv?.theme || "unknown",
      profile: conv?.profile,
      lang: conv?.lang,
      failureTurn: f.turn,
      failureMessage: f.message,
      userTurns,
      priorV2Reply: f.reply,
      priorV2Path: f.response_path,
    };
  });
}

const CONTEXT_TEMPLATES = [
  {
    id: "CTX-commercial_reject_alt",
    theme: "commercial_reject_alt",
    prefix: ["quero celular", "compara A55 e M34", "discordo"],
  },
  {
    id: "CTX-long_references",
    theme: "long_references",
    prefix: ["oi", "celular até 2k", "gostei do primeiro"],
  },
  {
    id: "CTX-disagreement_deep",
    theme: "disagreement_deep",
    prefix: ["A55 ou M34?", "discordo", "não faz sentido"],
  },
  {
    id: "CTX-social_to_commercial",
    theme: "social_to_commercial",
    prefix: ["oi", "to precisando de um celular", "até 2000", "me recomenda"],
  },
  {
    id: "CTX-emotion_commerce",
    theme: "emotion_commerce",
    prefix: ["tô ansioso", "quero celular confiável", "compara opções"],
  },
];

const FOLLOWUP_VARIATIONS = [
  "e o outro?",
  "e a câmera?",
  "e esse?",
  "e ele?",
  "e aquele?",
  "qual deles?",
  "o segundo",
  "o primeiro",
  "esse vale mais?",
  "o outro compensa?",
  "esse é melhor?",
  "qual você escolheria?",
  "qual vale mais?",
  "qual dura mais?",
  "e a bateria?",
  "e desempenho?",
  "e fotos?",
  "e tela?",
  "e construção?",
  "e carregamento?",
  "e jogos?",
  "e vídeos?",
  "e autonomia?",
  "e resistência?",
  "e acabamento?",
  "e o processador?",
  "e memória?",
  "e armazenamento?",
  "e preço?",
  "E O OUTRO???",
  "e a camera mano",
  "e a câmera? 😊",
  "e o outro?!!!",
  "e a câmera? mano",
  "q camera?",
  "e bateria",
  "qual deles vc escolhe?",
  "esse ai vale?",
  "o 2o",
  "o 1o",
  "hm",
  "ok",
  "certo",
];

function langWrap(msg, style) {
  switch (style) {
    case "informal":
      return `${msg} mano`;
    case "abbrev":
      return msg.replace(/quero/gi, "qro").replace(/você/gi, "vc").replace(/câmera/gi, "camera");
    case "caps":
      return msg.toUpperCase();
    case "emoji":
      return `${msg} 😊`;
    case "typo":
      return msg.replace(/ção/g, "cao").replace(/câmera/g, "camera");
    case "fragment":
      return msg.split(" ")[0] || msg;
    case "irritated":
      return `${msg} — explica direito`;
    case "polite":
      return `por favor, ${msg}`;
    default:
      return msg;
  }
}

function buildVariationScenarios() {
  const out = [];
  let idx = 0;
  for (const ctx of CONTEXT_TEMPLATES) {
    for (const base of FOLLOWUP_VARIATIONS) {
      for (const style of ["neutral", "informal", "abbrev", "emoji", "caps", "typo"]) {
        idx += 1;
        const followUp = langWrap(base, style);
        out.push({
          id: `VAR-${String(idx).padStart(4, "0")}`,
          contextId: ctx.id,
          theme: ctx.theme,
          userTurns: [...ctx.prefix, followUp],
          followUp,
          style,
        });
      }
    }
  }
  return out;
}

function parityClass(apiReply, uiReply) {
  const norm = (t) => String(t || "").replace(/^MIΛ\s*/i, "").replace(/^MIA\s*/i, "").trim();
  const a = norm(apiReply);
  const u = norm(uiReply);
  if (!a || !u) return "ui_empty_or_api_empty";
  if (a === u) return "exact";
  if (u.includes(a.slice(0, 35)) || a.includes(u.slice(0, 35))) return "semantic";
  const aw = a.split(/\s+/).slice(0, 8).join(" ");
  const uw = u.split(/\s+/).slice(0, 8).join(" ");
  if (aw && uw && (u.includes(aw) || a.includes(uw))) return "textual_variation_acceptable";
  return "divergent";
}

async function runUiMultiturn(page, userTurns) {
  for (let i = 0; i < userTurns.length; i++) {
    const msg = userTurns[i];
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".mia-input").fill(msg);
    await page.locator(".send-btn").click();
    const resp = await responsePromise;
    const data = await resp.json().catch(() => ({}));
    await sleep(2200);
    if (i === userTurns.length - 1) {
      const uiReply = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
      return { uiReply: String(uiReply).trim(), apiReply: String(data?.reply || "").trim(), httpStatus: resp.status() };
    }
  }
  return { uiReply: "", apiReply: "" };
}

async function runBlockingFailures(scenarios, cp) {
  const done = new Set(cp.completedBlocking || []);
  const results = cp.blockingResults || [];

  for (const sc of scenarios) {
    if (done.has(sc.id)) continue;
    const sessionId = `rf-${sc.convId}-${Date.now()}`;
    const replay = await replayConversation(sc.userTurns, sessionId, sc.id);
    const final = replay.final;
    const pass = !final.failureType && final.httpStatus === 200 && !!final.reply;
    results.push({
      ...sc,
      pass,
      fixed: pass,
      stillBlocking: !pass,
      replay,
      ts: new Date().toISOString(),
    });
    done.add(sc.id);
    atomicWrite(CHECKPOINT, { ...cp, completedBlocking: [...done], blockingResults: results });
    atomicWrite(RESULTS, { total: scenarios.length, completed: done.size, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results });
    log(`[BLOCKING ${done.size}/${scenarios.length}] ${sc.id} ${sc.convId} turn=${sc.failureTurn} ${pass ? "PASS" : "FAIL"} cold=${final.coldClarification}`);
  }
  return results;
}

async function runVariations(variationScenarios, cp) {
  const done = new Set(cp.completedVariations || []);
  const results = cp.variationResults || [];

  for (const sc of variationScenarios) {
    if (done.has(sc.id)) continue;
    const sessionId = `var-${sc.id}-${Date.now()}`;
    const replay = await replayConversation(sc.userTurns, sessionId, sc.id);
    const final = replay.final;
    const pass = !final.failureType && !final.coldClarification && !!final.reply;
    results.push({
      id: sc.id,
      contextId: sc.contextId,
      theme: sc.theme,
      followUp: sc.followUp,
      style: sc.style,
      pass,
      coldClarification: final.coldClarification,
      reply: final.reply?.slice(0, 200),
      response_path: final.response_path,
      ts: new Date().toISOString(),
    });
    done.add(sc.id);
    if (done.size % 20 === 0) {
      atomicWrite(CHECKPOINT, { ...cp, completedVariations: [...done], variationResults: results });
      atomicWrite(VARIATIONS, { total: variationScenarios.length, completed: done.size, passed: results.filter((r) => r.pass).length, results });
      log(`[VARIATIONS ${done.size}/${variationScenarios.length}] passed=${results.filter((r) => r.pass).length}`);
    }
  }
  atomicWrite(VARIATIONS, { total: variationScenarios.length, completed: done.size, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results });
  return results;
}

async function runParityOnBlocking(blockingResults, cp) {
  const require = createRequire(join(ROOT, "package.json"));
  const { chromium } = require("playwright");
  const sample = blockingResults.filter((r) => !cp.completedParity?.includes(r.id));
  const uniqueThemes = [];
  const seen = new Set();
  for (const r of blockingResults) {
    const key = `${r.theme}|${r.failureMessage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueThemes.push(r);
  }
  const targets = uniqueThemes.slice(0, Math.min(uniqueThemes.length, 20));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pairs = cp.parityPairs || [];
  const done = new Set(cp.completedParity || []);

  for (const sc of targets) {
    if (done.has(sc.id)) continue;
    await page.goto(`${UI_URL}?v=${Date.now()}-${sc.id}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(1000);

    const sessionId = `parity-${sc.id}-${Date.now()}`;
    const apiReplay = await replayConversation(sc.userTurns, sessionId, sc.id);
    const apiFinal = apiReplay.final;

    await page.goto(`${UI_URL}?v=${Date.now()}-${sc.id}-ui`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(800);
    const ui = await runUiMultiturn(page, sc.userTurns);
    const parity = parityClass(apiFinal.reply, ui.uiReply);

    pairs.push({
      id: sc.id,
      convId: sc.convId,
      theme: sc.theme,
      failureMessage: sc.failureMessage,
      apiReply: apiFinal.reply?.slice(0, 400),
      uiReply: ui.uiReply?.slice(0, 400),
      api_path: apiFinal.response_path,
      parity,
      pass: ["exact", "semantic", "textual_variation_acceptable"].includes(parity) && !apiFinal.coldClarification,
      coldClarification: apiFinal.coldClarification || coldClarification(ui.uiReply),
      ts: new Date().toISOString(),
    });
    done.add(sc.id);
    atomicWrite(PARITY, { total: targets.length, completed: done.size, pairs });
    log(`[PARITY ${done.size}/${targets.length}] ${sc.id} ${parity}`);
  }
  await browser.close();
  return pairs;
}

function runRegressions() {
  const scripts = [
    "scripts/test-mia-commercial-follow-up-continuity.js",
    "scripts/test-mia-patch-57v3-indirect-reference.js",
    "scripts/test-mia-patch-57-social-contract-verbalization.js",
    "scripts/test-mia-patch-57v-rejection-verbalization.js",
    "scripts/test-mia-patch-57v1-negative-feedback.js",
  ];
  const results = [];
  for (const script of scripts) {
    const r = spawnSync("node", [script], { cwd: ROOT, encoding: "utf8" });
    results.push({ script, exitCode: r.status, pass: r.status === 0 });
    log(`[REGRESSION] ${script} exit=${r.status}`);
  }
  atomicWrite(REGRESSION, { results, allGreen: results.every((r) => r.pass) });
  return results;
}

async function main() {
  log("=== PATCH 5.7V.3R DIRECTED REVALIDATION START ===");
  const health = await fetch(HEALTH_URL).then((r) => r.json());
  log(`Health: build=${health.build} status=${health.status}`);

  const blockingScenarios = buildFailureScenarios();
  const variationScenarios = buildVariationScenarios();
  log(`Blocking scenarios: ${blockingScenarios.length}, Variations: ${variationScenarios.length}`);

  let cp = loadJson(CHECKPOINT, {
    completedBlocking: [],
    blockingResults: [],
    completedVariations: [],
    variationResults: [],
    completedParity: [],
    parityPairs: [],
  });

  if (!RESUME || cp.blockingResults.length === 0) {
    cp.blockingResults = await runBlockingFailures(blockingScenarios, cp);
    cp.completedBlocking = cp.blockingResults.map((r) => r.id);
  }

  if (!RESUME || (cp.variationResults?.length || 0) < variationScenarios.length) {
    cp.variationResults = await runVariations(variationScenarios, cp);
    cp.completedVariations = cp.variationResults.map((r) => r.id);
  }

  const regressions = runRegressions();

  if (!RESUME || (cp.parityPairs?.length || 0) < 10) {
    cp.parityPairs = await runParityOnBlocking(cp.blockingResults, cp);
  }

  const blockingPassed = cp.blockingResults.filter((r) => r.pass).length;
  const blockingFailed = cp.blockingResults.filter((r) => !r.pass).length;
  const varPassed = cp.variationResults.filter((r) => r.pass).length;
  const varFailed = cp.variationResults.filter((r) => !r.pass).length;
  const parityOk = (cp.parityPairs || []).every((p) => p.pass);
  const regOk = regressions.every((r) => r.pass);

  const verdict =
    blockingFailed === 0 && varFailed === 0 && regOk && parityOk ? "APROVADO" : "NÃO APROVADO";

  const closure = {
    patch: "5.7V.3R",
    build: health.build,
    timestamp: new Date().toISOString(),
    blocking: { total: blockingScenarios.length, passed: blockingPassed, failed: blockingFailed },
    variations: { total: variationScenarios.length, passed: varPassed, failed: varFailed },
    parity: { total: cp.parityPairs?.length || 0, allPass: parityOk },
    regressions: { allGreen: regOk },
    verdict,
    patch58Ready: verdict === "APROVADO",
    patch57Closable: verdict === "APROVADO",
  };
  atomicWrite(join(OUT, "FINAL_CLOSURE_EVIDENCE.json"), closure);
  log(`=== DONE verdict=${verdict} blocking=${blockingPassed}/${blockingScenarios.length} variations=${varPassed}/${variationScenarios.length} ===`);
}

main().catch((err) => {
  log(`FATAL: ${err.stack}`);
  process.exit(1);
});
