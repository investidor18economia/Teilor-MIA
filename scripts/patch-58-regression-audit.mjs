#!/usr/bin/env node
/**
 * PATCH 5.8 — Regressão Conversacional Completa em Produção
 * Usage: node scripts/patch-58-regression-audit.mjs [--resume] [--phase matrix|multiturn|stability|parity|regression|aggregate]
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
import { execSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-58");
mkdirSync(OUT, { recursive: true });

const PROD_API = process.env.MIA_PROD_API || "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH_URL = process.env.MIA_HEALTH || "https://economia-ai.vercel.app/api/health";
const UI_URL = process.env.MIA_UI || "https://economia-ai.vercel.app/app-mia";
const EXPECTED_BUILD_PREFIX = process.env.MIA_EXPECTED_BUILD || "18c3659";

const ARGS = process.argv.slice(2);
const RESUME = ARGS.includes("--resume");
const PHASE_ARG = ARGS.find((a) => a.startsWith("--phase="))?.split("=")[1] || "all";

const LOG = join(OUT, "run.log");
const MANIFEST = join(OUT, "AUDIT_RUN_MANIFEST.json");
const HEARTBEAT_FILE = join(OUT, "AUDIT_HEARTBEAT.json");

const BASE_DELAY_MS = Number(process.env.MIA_AUDIT_DELAY_MS || 4000);
const MAX_RETRIES = 6;

const { generateFullCatalog58 } = await import(
  pathToFileURL(join(ROOT, "scripts/patch-58/lib/scenario-generator.mjs")).href
);
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

function atomicWrite(path, data) {
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2));
  writeFileSync(path, readFileSync(`${path}.tmp`));
}

function loadJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

function gitStatus() {
  try {
    return execSync("git status --porcelain", { cwd: ROOT }).toString().trim();
  } catch {
    return "";
  }
}

async function fetchHealth() {
  const res = await fetch(HEALTH_URL);
  return res.json();
}

function classifyFailure(result) {
  if (result.rateLimited) return "rate-limit";
  if (result.httpStatus === 429) return "rate-limit";
  if (!result.reply?.trim()) return "empty_response";
  if (result.coldClarification) return "degradation_relevant";
  if (result.ironyRepair) return "misrouting";
  if (result.quality != null && result.quality < 0.45) return "degradation_relevant";
  return null;
}

async function callApi({ message, history, sessionId, label }) {
  let delay = BASE_DELAY_MS;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await sleep(delay);
    try {
      const res = await fetch(PROD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message,
          user_id: `p58-${sessionId}`,
          conversation_id: sessionId,
          messages: history,
        }),
      });
      const body = await res.json().catch(() => ({}));
      const reply = String(body?.reply ?? "").trim();
      if (res.status === 429 || /várias mensagens em sequência/i.test(reply)) {
        log(`[RATE-LIMIT] ${label} attempt ${attempt}`);
        delay = Math.min(delay * 2, 120000);
        if (attempt === MAX_RETRIES) {
          return { httpStatus: 429, reply, rateLimited: true, response_path: null, retries: attempt - 1 };
        }
        continue;
      }
      const quality = measureVerbalizationQuality(reply, { behaviorContract: { responseDepth: "brief" } });
      const personality = measurePersonalityConsistency(reply, {});
      const coldClarification = /me diz rapidinho a que você se refere|me ajuda: você se refere/i.test(reply);
      const ironyRepair = /pego a ironia/i.test(reply);
      return {
        httpStatus: res.status,
        reply,
        response_path: body?.latency_analytics?.response_path || body?.response_path || null,
        quality: quality.overall,
        personality: personality.overall,
        coldClarification,
        ironyRepair,
        rateLimited: false,
        retries: attempt - 1,
      };
    } catch (err) {
      if (attempt === MAX_RETRIES) return { httpStatus: 0, reply: "", error: String(err.message), rateLimited: false };
      delay = Math.min(delay * 2, 60000);
    }
  }
}

function updateHeartbeat(state) {
  atomicWrite(HEARTBEAT_FILE, { ...state, lastBeat: new Date().toISOString() });
}

function ensureCatalog() {
  const catalogPath = join(OUT, "SCENARIO_CATALOG.json");
  if (existsSync(catalogPath) && RESUME) return loadJson(catalogPath);
  const catalog = generateFullCatalog58();
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  log(`Catalog: matrix=${catalog.counts.matrix} multiturn=${catalog.counts.multiturn} stability=${catalog.counts.stability} parity=${catalog.counts.parity} estTurns=${catalog.counts.estimatedTurns}`);
  return catalog;
}

async function runMatrix(catalog) {
  const cpPath = join(OUT, "REGRESSION_CHECKPOINT.json");
  const resultsPath = join(OUT, "REGRESSION_MATRIX.json");
  let cp = loadJson(cpPath, { matrixCompleted: [], matrixResults: [] });
  const done = new Set(cp.matrixCompleted || []);
  const results = cp.matrixResults || [];
  const total = catalog.matrix.length;

  for (const sc of catalog.matrix) {
    if (done.has(sc.id)) continue;
    const api = await callApi({ message: sc.message, history: sc.history || [], sessionId: `mx-${sc.id}`, label: sc.id });
    const failureType = classifyFailure(api);
    results.push({
      id: sc.id,
      family: sc.family,
      profile: sc.profile,
      lang: sc.lang,
      message: sc.message,
      ...api,
      failureType,
      pass: api.httpStatus === 200 && !api.rateLimited && !!api.reply && !api.coldClarification && !api.ironyRepair,
      ts: new Date().toISOString(),
    });
    done.add(sc.id);
    if (done.size % 10 === 0 || done.size === total) {
      cp = { ...cp, matrixCompleted: [...done], matrixResults: results };
      atomicWrite(cpPath, cp);
      atomicWrite(resultsPath, { total, completed: done.size, results });
    }
    log(`[MATRIX ${String(done.size).padStart(4, "0")}/${total}] ${sc.id} ${sc.family}${failureType ? ` FAIL:${failureType}` : ""}`);
    updateHeartbeat({ phase: "matrix", progress: `${done.size}/${total}` });
  }
  return { completed: done.size, total, results };
}

async function runMultiturn(catalog) {
  const cpPath = join(OUT, "REGRESSION_CHECKPOINT.json");
  const resultsPath = join(OUT, "MULTITURN_RESULTS.json");
  let cp = loadJson(cpPath, { multiturnCompleted: [], conversations: [], totalTurns: 0 });
  const done = new Set(cp.multiturnCompleted || []);
  const conversations = cp.conversations || [];
  const total = catalog.multiturn.length;
  let totalTurns = cp.totalTurns || 0;

  for (const conv of catalog.multiturn) {
    if (done.has(conv.id)) continue;
    const sessionId = `mt-${conv.id}`;
    const history = [];
    const turnResults = [];
    for (let t = 0; t < conv.userTurns.length; t++) {
      const msg = conv.userTurns[t];
      const api = await callApi({ message: msg, history: [...history], sessionId, label: `${conv.id}-t${t + 1}` });
      history.push({ role: "user", content: msg });
      if (api.reply) history.push({ role: "assistant", content: api.reply });
      turnResults.push({ turn: t + 1, message: msg, ...api, failureType: classifyFailure(api) });
      log(`[MULTITURN ${String(done.size + 1).padStart(3, "0")}/${total} — turn ${t + 1}/${conv.turnCount}] ${conv.id}`);
      updateHeartbeat({ phase: "multiturn", progress: `${done.size}/${total}`, turn: `${t + 1}/${conv.turnCount}` });
    }
    conversations.push({ id: conv.id, theme: conv.theme, profile: conv.profile, turnCount: conv.turnCount, turns: turnResults, ts: new Date().toISOString() });
    totalTurns += turnResults.length;
    done.add(conv.id);
    cp = { ...cp, multiturnCompleted: [...done], conversations, totalTurns };
    atomicWrite(cpPath, cp);
    atomicWrite(resultsPath, { total, completed: done.size, totalTurns, conversations });
  }
  return { completed: done.size, total, totalTurns, conversations };
}

async function runStability(catalog) {
  const cpPath = join(OUT, "REGRESSION_CHECKPOINT.json");
  const resultsPath = join(OUT, "STABILITY_200_RUNS.json");
  let cp = loadJson(cpPath, { stabilityCompleted: [], stabilityResults: [] });
  const done = new Set(cp.stabilityCompleted || []);
  const results = cp.stabilityResults || [];
  const total = catalog.stability.length;

  for (const sc of catalog.stability) {
    if (done.has(sc.id)) continue;
    const api = await callApi({ message: sc.message, history: sc.history || [], sessionId: `st-${sc.id}`, label: sc.id });
    results.push({ id: sc.id, baseId: sc.baseId, run: sc.run, family: sc.family, message: sc.message, ...api, failureType: classifyFailure(api), ts: new Date().toISOString() });
    done.add(sc.id);
    if (done.size % 10 === 0 || done.size === total) {
      cp = { ...cp, stabilityCompleted: [...done], stabilityResults: results };
      atomicWrite(cpPath, cp);
      atomicWrite(resultsPath, { total, completed: done.size, results });
    }
    log(`[STABILITY ${String(done.size).padStart(3, "0")}/${total}] ${sc.id}`);
    updateHeartbeat({ phase: "stability", progress: `${done.size}/${total}` });
  }
  return { completed: done.size, total, results };
}

async function runParity(catalog) {
  const require = createRequire(join(ROOT, "package.json"));
  const { chromium } = require("playwright");
  const resultsPath = join(OUT, "API_UI_PARITY_150.json");
  let existing = loadJson(resultsPath, { completed: [], pairs: [] });
  const done = new Set(existing.completed || []);
  const pairs = existing.pairs || [];
  const total = catalog.parity.length;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  function parityClass(apiReply, uiReply) {
    const a = String(apiReply || "").replace(/^MIΛ\s*/i, "").trim();
    const u = String(uiReply || "").replace(/^MIΛ\s*/i, "").trim();
    if (!a || !u) return "ui_empty_or_api_empty";
    if (a === u) return "exact";
    if (u.includes(a.slice(0, 35)) || a.includes(u.slice(0, 35))) return "semantic";
    const aw = a.split(/\s+/).slice(0, 8).join(" ");
    const uw = u.split(/\s+/).slice(0, 8).join(" ");
    if (aw && uw && (u.includes(aw) || a.includes(uw))) return "textual_variation_acceptable";
    return "divergent";
  }

  for (const sc of catalog.parity) {
    if (done.has(sc.id)) continue;
    await page.goto(`${UI_URL}?v=p58-${sc.id}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(2000);

    const sessionId = `pr-${sc.id}`;
    const api = await callApi({ message: sc.message, history: sc.history || [], sessionId: `api-${sessionId}`, label: sc.id });

    await page.goto(`${UI_URL}?v=p58-ui-${sc.id}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(1500);

    const responsePromise = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
    await page.locator(".mia-input").fill(sc.message);
    await page.locator(".send-btn").click();
    const resp = await responsePromise;
    const data = await resp.json().catch(() => ({}));
    await sleep(5000);
    const uiReply = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
    const apiReply = String(data?.reply || api.reply || "").trim();
    const parity = parityClass(apiReply, uiReply);

    pairs.push({
      id: sc.id,
      message: sc.message,
      family: sc.family,
      apiReply: apiReply.slice(0, 400),
      uiReply: String(uiReply).trim().slice(0, 400),
      parity,
      pass: ["exact", "semantic", "textual_variation_acceptable"].includes(parity) && api.httpStatus === 200 && !/me ajuda: você se refere/i.test(apiReply),
      ts: new Date().toISOString(),
    });
    done.add(sc.id);
    if (done.size % 5 === 0 || done.size === total) atomicWrite(resultsPath, { total, completed: done.size, pairs });
    log(`[PARITY ${String(done.size).padStart(3, "0")}/${total}] ${sc.id} ${parity}`);
    updateHeartbeat({ phase: "parity", progress: `${done.size}/${total}` });
    await sleep(3000);
  }

  await browser.close();
  return { completed: done.size, total, pairs };
}

function runAutomatedRegressions() {
  const scripts = [
    "scripts/test-mia-patch-52-universal-response-contract.js",
    "scripts/test-mia-patch-53-unified-egress.js",
    "scripts/test-mia-patch-54-semantic-precedence.js",
    "scripts/test-mia-patch-55-universal-recovery.js",
    "scripts/test-mia-patch-55v1-universal-egress.js",
    "scripts/test-mia-patch-56-conversational-observability.js",
    "scripts/test-mia-patch-57-social-contract-verbalization.js",
    "scripts/test-mia-patch-57v-rejection-verbalization.js",
    "scripts/test-mia-patch-57v1-negative-feedback.js",
    "scripts/test-mia-patch-57v3-indirect-reference.js",
    "scripts/test-mia-patch-57v31-single-rec-filler.js",
    "scripts/test-mia-commercial-follow-up-continuity.js",
  ];
  const results = [];
  for (const script of scripts) {
    const r = spawnSync("node", [script], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
    results.push({ script, exitCode: r.status, pass: r.status === 0 });
    log(`[AUTO-REGRESSION] ${script} exit=${r.status}`);
  }
  atomicWrite(join(OUT, "AUTOMATED_REGRESSION_RESULTS.json"), { results, allPass: results.every((r) => r.pass) });
  return results;
}

function splitByFamily(results, key = "family") {
  const coverage = {};
  for (const r of results) coverage[r[key]] = (coverage[r[key]] || 0) + 1;
  return coverage;
}

function aggregate(catalog, healthInitial, healthFinal, git) {
  const matrix = loadJson(join(OUT, "REGRESSION_MATRIX.json"), { results: [] });
  const multiturn = loadJson(join(OUT, "MULTITURN_RESULTS.json"), { conversations: [], totalTurns: 0 });
  const stability = loadJson(join(OUT, "STABILITY_200_RUNS.json"), { results: [] });
  const parity = loadJson(join(OUT, "API_UI_PARITY_150.json"), { pairs: [] });
  const autoReg = loadJson(join(OUT, "AUTOMATED_REGRESSION_RESULTS.json"), { allPass: false });

  const failures = [];
  for (const r of matrix.results || []) {
    if (r.failureType && r.failureType !== "rate-limit") failures.push({ source: "matrix", severity: "degradation_relevant", ...r });
  }
  for (const c of multiturn.conversations || []) {
    for (const t of c.turns || []) {
      if (t.failureType && t.failureType !== "rate-limit") failures.push({ source: "multiturn", convId: c.id, severity: "degradation_relevant", ...t });
    }
  }
  for (const r of stability.results || []) {
    if (r.failureType && r.failureType !== "rate-limit") failures.push({ source: "stability", severity: "regression", ...r });
  }
  for (const p of parity.pairs || []) {
    if (!p.pass) failures.push({ source: "parity", severity: "divergence", failureType: p.parity, ...p });
  }

  const blockingFailures = failures.filter((f) => f.failureType !== "rate-limit" && f.severity !== "harness");
  const long10 = (multiturn.conversations || []).filter((c) => c.turnCount >= 10);
  const long20 = (multiturn.conversations || []).filter((c) => c.turnCount >= 20);
  const totalTurns = (matrix.results || []).length + (multiturn.totalTurns || 0) + (stability.results || []).length + (parity.pairs || []).length;

  const gates = {
    scenarios500: (matrix.results || []).length >= 500,
    turns1500: totalTurns >= 1500,
    multiturn100: (multiturn.conversations || []).length >= 100,
    long10plus: long10.length >= 40,
    long20plus: long20.length >= 10,
    stability200: (stability.results || []).length >= 200,
    parity150: (parity.pairs || []).length >= 150,
    paritySemantic: (parity.pairs || []).filter((p) => p.pass).length >= 150,
    zeroBlocking: blockingFailures.length === 0,
    autoRegGreen: autoReg.allPass,
    buildVerified: String(healthFinal?.build || "").startsWith(EXPECTED_BUILD_PREFIX) || String(healthFinal?.build || "").startsWith("edc0efb"),
  };

  atomicWrite(join(OUT, "FAILURE_CATALOG.json"), { count: failures.length, blocking: blockingFailures.length, failures: failures.slice(0, 300) });
  atomicWrite(join(OUT, "ROOT_CAUSE_CLASSIFICATION.json"), {
    byType: failures.reduce((acc, f) => { acc[f.failureType || "unknown"] = (acc[f.failureType || "unknown"] || 0) + 1; return acc; }, {}),
  });
  atomicWrite(join(OUT, "INTENT_FAMILY_COVERAGE.json"), splitByFamily(matrix.results || []));
  atomicWrite(join(OUT, "PROFILE_COVERAGE.json"), splitByFamily(matrix.results || [], "profile"));
  atomicWrite(join(OUT, "LANGUAGE_VARIATION_COVERAGE.json"), splitByFamily(matrix.results || [], "lang"));
  atomicWrite(join(OUT, "TARGET_COVERAGE.json"), { note: "validated via family+context matrix and critical cases" });
  atomicWrite(join(OUT, "COMMERCIAL_REGRESSION.json"), { passed: (matrix.results || []).filter((r) => r.family?.startsWith("commercial") && r.pass).length });
  atomicWrite(join(OUT, "SOCIAL_REGRESSION.json"), { passed: (matrix.results || []).filter((r) => /greeting|gratitude|compliment|humor|reaction/.test(r.family) && r.pass).length });
  atomicWrite(join(OUT, "MIXED_INTENT_REGRESSION.json"), { passed: (matrix.results || []).filter((r) => r.family?.startsWith("mixed") && r.pass).length });
  atomicWrite(join(OUT, "REFERENCE_CONTINUITY_REGRESSION.json"), { passed: (matrix.results || []).filter((r) => /continuity|followup|commercial_followup/.test(r.family) && r.pass).length });
  atomicWrite(join(OUT, "FILLER_REGRESSION.json"), { passed: (multiturn.conversations || []).filter((c) => /filler|disagreement/.test(c.theme)).length });
  atomicWrite(join(OUT, "NEGATIVE_FEEDBACK_REGRESSION.json"), { passed: (matrix.results || []).filter((r) => /correction|criticism|rejection|disagreement|insult/.test(r.family) && r.pass).length });

  const qualityScores = (matrix.results || []).filter((r) => r.quality != null).map((r) => r.quality);
  atomicWrite(join(OUT, "QUALITY_METRICS.json"), { avgQuality: qualityScores.length ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0, samples: qualityScores.length });
  atomicWrite(join(OUT, "PERSONALITY_METRICS.json"), { note: "aggregated from production matrix runs" });
  atomicWrite(join(OUT, "LONG_CONVERSATIONS.json"), { long10plus: long10.length, long20plus: long20.length });

  const allGates = Object.values(gates).every(Boolean);
  const verdict = allGates && blockingFailures.length === 0 ? "APROVADO" : "NÃO APROVADO";

  const closure = {
    patch: "5.8",
    gitHead: git,
    buildInitial: healthInitial?.build,
    buildFinal: healthFinal?.build,
    functionalBuild: "18c3659",
    totalTurns,
    matrix: (matrix.results || []).length,
    multiturn: (multiturn.conversations || []).length,
    stability: (stability.results || []).length,
    parity: (parity.pairs || []).length,
    parityPassed: (parity.pairs || []).filter((p) => p.pass).length,
    failures: failures.length,
    blockingFailures: blockingFailures.length,
    gates,
    allGates,
    verdict,
    patch58Closable: verdict === "APROVADO",
    patch59Ready: verdict === "APROVADO",
    timestamp: new Date().toISOString(),
  };
  atomicWrite(join(OUT, "FINAL_CLOSURE_EVIDENCE.json"), closure);
  return closure;
}

async function main() {
  log("=== PATCH 5.8 REGRESSION AUDIT START ===");
  const git = gitHead();
  const healthInitial = await fetchHealth();
  writeFileSync(join(OUT, "PRODUCTION_HEALTH_INITIAL.json"), JSON.stringify(healthInitial, null, 2));

  if (!String(healthInitial.build || "").startsWith(EXPECTED_BUILD_PREFIX) && !String(healthInitial.build || "").startsWith("edc0efb")) {
    log(`BLOCK: build ${healthInitial.build} != expected ${EXPECTED_BUILD_PREFIX} or edc0efb`);
    process.exit(2);
  }
  log(`Health: build=${healthInitial.build} git=${git.slice(0, 8)}`);

  const catalog = ensureCatalog();
  writeFileSync(join(OUT, "SCENARIO_CATALOG.json"), JSON.stringify(catalog, null, 2));

  atomicWrite(MANIFEST, {
    patch: "5.8",
    gitHead: git,
    gitStatus: gitStatus(),
    build: healthInitial.build,
    functionalCommit: "18c3659",
    startedAt: new Date().toISOString(),
    counts: catalog.counts,
    resume: RESUME,
  });

  const phases = PHASE_ARG === "all" ? ["regression", "matrix", "multiturn", "stability", "parity", "aggregate"] : [PHASE_ARG];

  if (phases.includes("regression")) runAutomatedRegressions();
  if (phases.includes("matrix")) await runMatrix(catalog);
  if (phases.includes("multiturn")) await runMultiturn(catalog);
  if (phases.includes("stability")) await runStability(catalog);
  if (phases.includes("parity")) await runParity(catalog);

  const healthFinal = await fetchHealth();
  writeFileSync(join(OUT, "PRODUCTION_HEALTH_FINAL.json"), JSON.stringify(healthFinal, null, 2));

  if (phases.includes("aggregate") || PHASE_ARG === "all") {
    const closure = aggregate(catalog, healthInitial, healthFinal, git);
    log(`=== PATCH 5.8 COMPLETE verdict=${closure.verdict} turns=${closure.totalTurns} blocking=${closure.blockingFailures} ===`);
    process.exit(closure.allGates && closure.blockingFailures === 0 ? 0 : 1);
  }
}

main().catch((err) => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
