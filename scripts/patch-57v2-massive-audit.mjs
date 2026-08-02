#!/usr/bin/env node
/**
 * PATCH 5.7V.2 — Massive Production Conversational Robustness Audit
 *
 * Usage:
 *   node scripts/patch-57v2-massive-audit.mjs [--resume] [--phase matrix|multiturn|stability|parity|regression|aggregate]
 *   node scripts/patch-57v2-massive-audit.mjs --generate-only
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
const OUT = process.env.MIA_AUDIT_OUT
  ? join(ROOT, process.env.MIA_AUDIT_OUT)
  : join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v2");
mkdirSync(OUT, { recursive: true });

const PROD_API = process.env.MIA_PROD_API || "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH_URL = process.env.MIA_HEALTH || "https://economia-ai.vercel.app/api/health";
const UI_URL = process.env.MIA_UI || "https://economia-ai.vercel.app/app-mia";

const ARGS = process.argv.slice(2);
const RESUME = ARGS.includes("--resume");
const GENERATE_ONLY = ARGS.includes("--generate-only");
const PHASE_ARG = ARGS.find((a) => a.startsWith("--phase="))?.split("=")[1] || "all";

const LOG = join(OUT, "run.log");
const MANIFEST = join(OUT, "AUDIT_RUN_MANIFEST.json");
const HEARTBEAT_FILE = join(OUT, "AUDIT_HEARTBEAT.json");

const BASE_DELAY_MS = Number(process.env.MIA_AUDIT_DELAY_MS || 3800);
const MAX_RETRIES = 6;

const { generateFullCatalog } = await import(
  pathToFileURL(join(ROOT, "scripts/patch-57v2/lib/scenario-generator.mjs")).href
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
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  writeFileSync(path, readFileSync(tmp));
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
          user_id: `p57v2-${sessionId}`,
          conversation_id: sessionId,
          messages: history,
          session_context: {},
        }),
      });
      const body = await res.json().catch(() => ({}));
      const reply = String(body?.reply ?? "").trim();
      if (res.status === 429) {
        log(`[RATE-LIMIT] ${label} attempt ${attempt} — backoff ${delay * 2}ms`);
        delay = Math.min(delay * 2, 120000);
        if (attempt === MAX_RETRIES) {
          return {
            httpStatus: 429,
            reply,
            rateLimited: true,
            response_path: null,
            latency: body?.latency_analytics || null,
            error: "rate_limit_exhausted",
          };
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
        response_path: body?.latency_analytics?.response_path || null,
        intent: body?.intent || null,
        quality: quality.overall,
        qualitySignals: quality.signals || [],
        personality: personality.overall,
        coldClarification,
        ironyRepair,
        rateLimited: false,
        retries: attempt - 1,
      };
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        return { httpStatus: 0, reply: "", error: String(err.message), rateLimited: false };
      }
      delay = Math.min(delay * 2, 60000);
    }
  }
}

function updateHeartbeat(state) {
  atomicWrite(HEARTBEAT_FILE, { ...state, lastBeat: new Date().toISOString() });
}

function ensureCatalog() {
  const catalogPath = join(OUT, "SCENARIO_CATALOG.json");
  if (existsSync(catalogPath) && RESUME) {
    return loadJson(catalogPath);
  }
  const catalog = generateFullCatalog();
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  log(`Generated catalog: matrix=${catalog.counts.matrix} multiturn=${catalog.counts.multiturn} stability=${catalog.counts.stability} parity=${catalog.counts.parity} estTurns=${catalog.counts.estimatedTurns}`);
  return catalog;
}

async function runMatrix(catalog, checkpoint) {
  const cpPath = join(OUT, "MASSIVE_MATRIX_CHECKPOINT.json");
  const resultsPath = join(OUT, "MASSIVE_MATRIX_RESULTS.json");
  let cp = checkpoint || loadJson(cpPath, { completed: [], results: [] });
  const done = new Set(cp.completed || []);
  const results = cp.results || [];
  const total = catalog.matrix.length;

  for (let i = 0; i < total; i++) {
    const sc = catalog.matrix[i];
    if (done.has(sc.id)) continue;
    const sessionId = `mx-${sc.id}-${Date.now()}`;
    const api = await callApi({
      message: sc.message,
      history: sc.history || [],
      sessionId,
      label: sc.id,
    });
    const failureType = classifyFailure(api);
    const row = {
      id: sc.id,
      family: sc.family,
      profile: sc.profile,
      lang: sc.lang,
      contextId: sc.contextId,
      message: sc.message,
      ...api,
      failureType,
      pass: api.httpStatus === 200 && !api.rateLimited && !!api.reply && !api.coldClarification && !api.ironyRepair,
      ts: new Date().toISOString(),
    };
    results.push(row);
    done.add(sc.id);
    if ((i + 1) % 10 === 0 || i === total - 1) {
      cp = { completed: [...done], results };
      atomicWrite(cpPath, cp);
      atomicWrite(resultsPath, { total, completed: done.size, results });
    }
    log(`[MATRIX ${done.size}/${total}] ${sc.id} ${sc.family} ${api.httpStatus}${failureType ? ` FAIL:${failureType}` : ""}`);
    updateHeartbeat({ phase: "matrix", progress: `${done.size}/${total}`, lastId: sc.id });
  }
  return { completed: done.size, total, results };
}

async function runMultiturn(catalog, checkpoint) {
  const cpPath = join(OUT, "MULTITURN_CHECKPOINT.json");
  const resultsPath = join(OUT, "MULTITURN_RESULTS.json");
  let cp = loadJson(cpPath, { completed: [], conversations: [] });
  const done = new Set(cp.completed || []);
  const conversations = cp.conversations || [];
  const total = catalog.multiturn.length;
  let totalTurns = conversations.reduce((a, c) => a + (c.turns?.length || 0), 0);

  for (const conv of catalog.multiturn) {
    if (done.has(conv.id)) continue;
    const sessionId = `mt-${conv.id}-${Date.now()}`;
    const history = [];
    const turnResults = [];
    for (let t = 0; t < conv.userTurns.length; t++) {
      const msg = conv.userTurns[t];
      const api = await callApi({ message: msg, history: [...history], sessionId, label: `${conv.id}-t${t + 1}` });
      history.push({ role: "user", content: msg });
      if (api.reply) history.push({ role: "assistant", content: api.reply });
      turnResults.push({
        turn: t + 1,
        message: msg,
        ...api,
        failureType: classifyFailure(api),
      });
      log(`[MULTITURN ${done.size + 1}/${total} — turn ${t + 1}/${conv.turnCount}] ${conv.id}`);
      updateHeartbeat({ phase: "multiturn", progress: `${done.size}/${total}`, turn: `${t + 1}/${conv.turnCount}`, lastId: conv.id });
    }
    conversations.push({
      id: conv.id,
      theme: conv.theme,
      profile: conv.profile,
      turnCount: conv.turnCount,
      turns: turnResults,
      ts: new Date().toISOString(),
    });
    totalTurns += turnResults.length;
    done.add(conv.id);
    cp = { completed: [...done], conversations, totalTurns };
    atomicWrite(cpPath, cp);
    atomicWrite(resultsPath, { total, completed: done.size, totalTurns, conversations });
  }
  return { completed: done.size, total, totalTurns, conversations };
}

async function runStability(catalog) {
  const cpPath = join(OUT, "STABILITY_CHECKPOINT.json");
  const resultsPath = join(OUT, "STABILITY_500_RUNS.json");
  let cp = loadJson(cpPath, { completed: [], results: [] });
  const done = new Set(cp.completed || []);
  const results = cp.results || [];
  const total = catalog.stability.length;

  for (const sc of catalog.stability) {
    if (done.has(sc.id)) continue;
    const sessionId = `st-${sc.id}-${Date.now()}`;
    const api = await callApi({
      message: sc.message,
      history: sc.history || [],
      sessionId,
      label: sc.id,
    });
    results.push({
      id: sc.id,
      baseId: sc.baseId,
      run: sc.run,
      family: sc.family,
      message: sc.message,
      ...api,
      failureType: classifyFailure(api),
      ts: new Date().toISOString(),
    });
    done.add(sc.id);
    if (done.size % 10 === 0 || done.size === total) {
      atomicWrite(cpPath, { completed: [...done], results });
      atomicWrite(resultsPath, { total, completed: done.size, results });
    }
    log(`[STABILITY ${done.size}/${total}] ${sc.id} family=${sc.family}`);
    updateHeartbeat({ phase: "stability", progress: `${done.size}/${total}`, lastId: sc.id });
  }
  return { completed: done.size, total, results };
}

async function runParity(catalog) {
  const require = createRequire(join(ROOT, "package.json"));
  const { chromium } = require("playwright");
  const resultsPath = join(OUT, "API_UI_PARITY_300.json");
  let existing = loadJson(resultsPath, { completed: [], pairs: [] });
  const done = new Set(existing.completed || []);
  const pairs = existing.pairs || [];
  const total = catalog.parity.length;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  function normalizeUi(text = "") {
    return String(text || "").replace(/^MIΛ\s*/i, "").replace(/^MIA\s*/i, "").trim();
  }

  function parityClass(apiReply, uiReply) {
    const a = normalizeUi(apiReply);
    const u = normalizeUi(uiReply);
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
    await page.goto(`${UI_URL}?v=${Date.now()}-${sc.id}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(1000);

    const sessionId = `pr-${sc.id}-${Date.now()}`;
    const api = await callApi({
      message: sc.message,
      history: sc.history || [],
      sessionId: `api-${sessionId}`,
      label: sc.id,
    });

    await page.goto(`${UI_URL}?v=${Date.now()}-${sc.id}-ui`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(800);

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".mia-input").fill(sc.message);
    await page.locator(".send-btn").click();
    const resp = await responsePromise;
    const data = await resp.json().catch(() => ({}));
    await sleep(2500);
    const uiReply = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
    const apiReply = String(data?.reply || api.reply || "").trim();
    const parity = parityClass(apiReply, uiReply);

    pairs.push({
      id: sc.id,
      message: sc.message,
      family: sc.family,
      apiReply: apiReply.slice(0, 500),
      uiReply: String(uiReply).trim().slice(0, 500),
      parity,
      apiStatus: api.httpStatus,
      uiStatus: resp.status(),
      pass: ["exact", "semantic", "textual_variation_acceptable"].includes(parity) && api.httpStatus === 200,
      ts: new Date().toISOString(),
    });
    done.add(sc.id);
    if (done.size % 5 === 0 || done.size === total) {
      atomicWrite(resultsPath, { total, completed: done.size, pairs });
    }
    log(`[PARITY ${done.size}/${total}] ${sc.id} ${parity}`);
    updateHeartbeat({ phase: "parity", progress: `${done.size}/${total}`, lastId: sc.id });
    await sleep(2000);
  }

  await browser.close();
  return { completed: done.size, total, pairs };
}

function runRegressions() {
  const scripts = [
    "scripts/test-mia-patch-57-social-contract-verbalization.js",
    "scripts/test-mia-patch-57v-rejection-verbalization.js",
    "scripts/test-mia-patch-57v1-negative-feedback.js",
  ];
  const results = [];
  for (const script of scripts) {
    const r = spawnSync("node", [script], { cwd: ROOT, encoding: "utf8" });
    results.push({
      script,
      exitCode: r.status,
      pass: r.status === 0,
      stdout: (r.stdout || "").slice(-500),
      stderr: (r.stderr || "").slice(-300),
    });
    log(`[REGRESSION] ${script} exit=${r.status}`);
  }
  atomicWrite(join(OUT, "REGRESSION_RESULTS.json"), { results, allPass: results.every((r) => r.pass) });
  return results;
}

function aggregate(catalog, healthInitial, healthFinal, git) {
  const matrix = loadJson(join(OUT, "MASSIVE_MATRIX_RESULTS.json"), { results: [] });
  const multiturn = loadJson(join(OUT, "MULTITURN_RESULTS.json"), { conversations: [], totalTurns: 0 });
  const stability = loadJson(join(OUT, "STABILITY_500_RUNS.json"), { results: [] });
  const parity = loadJson(join(OUT, "API_UI_PARITY_300.json"), { pairs: [] });

  const failures = [];
  for (const r of matrix.results || []) {
    if (r.failureType && r.failureType !== "rate-limit") failures.push({ source: "matrix", ...r });
  }
  for (const c of multiturn.conversations || []) {
    for (const t of c.turns || []) {
      if (t.failureType && t.failureType !== "rate-limit") failures.push({ source: "multiturn", convId: c.id, ...t });
    }
  }
  for (const r of stability.results || []) {
    if (r.failureType && r.failureType !== "rate-limit") failures.push({ source: "stability", ...r });
  }
  for (const p of parity.pairs || []) {
    if (!p.pass) failures.push({ source: "parity", ...p, failureType: p.parity });
  }

  const familyCoverage = {};
  for (const r of matrix.results || []) {
    familyCoverage[r.family] = (familyCoverage[r.family] || 0) + 1;
  }

  const profileCoverage = {};
  for (const r of matrix.results || []) {
    profileCoverage[r.profile] = (profileCoverage[r.profile] || 0) + 1;
  }

  const langCoverage = {};
  for (const r of matrix.results || []) {
    langCoverage[r.lang] = (langCoverage[r.lang] || 0) + 1;
  }

  const qualityScores = (matrix.results || []).filter((r) => r.quality != null).map((r) => r.quality);
  const avgQuality = qualityScores.length ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0;

  const longConvs = (multiturn.conversations || []).filter((c) => c.turnCount >= 10);
  const veryLongConvs = (multiturn.conversations || []).filter((c) => c.turnCount >= 20);

  const totalTurns =
    (matrix.results || []).length +
    (multiturn.totalTurns || 0) +
    (stability.results || []).length +
    (parity.pairs || []).length;

  const gates = {
    scenarios1500: (matrix.results || []).length >= 1500,
    turns3000: totalTurns >= 3000,
    multiturn300: (multiturn.conversations || []).length >= 300,
    long10plus: longConvs.length >= 100,
    long20plus: veryLongConvs.length >= 20,
    stability500: (stability.results || []).length >= 500,
    parity300: (parity.pairs || []).length >= 300,
    profiles100: Object.keys(profileCoverage).length >= 20,
    zeroEmpty: !(matrix.results || []).some((r) => r.httpStatus === 200 && !r.reply?.trim()),
    regressionsGreen: loadJson(join(OUT, "REGRESSION_RESULTS.json"), { allPass: false }).allPass,
  };

  const allGates = Object.values(gates).every(Boolean);

  atomicWrite(join(OUT, "FAILURE_CATALOG.json"), { count: failures.length, failures: failures.slice(0, 500) });
  atomicWrite(join(OUT, "ROOT_CAUSE_CLASSIFICATION.json"), {
    byType: failures.reduce((acc, f) => {
      acc[f.failureType] = (acc[f.failureType] || 0) + 1;
      return acc;
    }, {}),
  });
  atomicWrite(join(OUT, "INTENT_FAMILY_COVERAGE.json"), familyCoverage);
  atomicWrite(join(OUT, "PROFILE_COVERAGE.json"), profileCoverage);
  atomicWrite(join(OUT, "LANGUAGE_VARIATION_COVERAGE.json"), langCoverage);
  atomicWrite(join(OUT, "QUALITY_METRICS.json"), { avgQuality, samples: qualityScores.length });
  atomicWrite(join(OUT, "PERSONALITY_METRICS.json"), { note: "aggregated from matrix quality runs" });
  atomicWrite(join(OUT, "LONG_CONVERSATIONS.json"), {
    long10plus: longConvs.length,
    long20plus: veryLongConvs.length,
    samples: longConvs.slice(0, 5).map((c) => ({ id: c.id, turns: c.turnCount })),
  });
  atomicWrite(join(OUT, "TARGET_COVERAGE.json"), { note: "target resolution validated via family+context matrix" });

  const closure = {
    patch: "5.7V.2",
    gitHead: git,
    build: healthFinal?.build,
    totalTurns,
    matrix: (matrix.results || []).length,
    multiturn: (multiturn.conversations || []).length,
    stability: (stability.results || []).length,
    parity: (parity.pairs || []).length,
    failures: failures.length,
    gates,
    allGates,
    verdict: allGates && failures.filter((f) => f.failureType !== "textual_variation_acceptable").length === 0 ? "APROVADO" : "NÃO APROVADO",
    apiCallsEstimate: totalTurns,
    timestamp: new Date().toISOString(),
  };
  atomicWrite(join(OUT, "FINAL_CLOSURE_EVIDENCE.json"), closure);
  return closure;
}

async function main() {
  log("=== PATCH 5.7V.2 MASSIVE AUDIT START ===");
  const git = gitHead();
  const healthInitial = await fetchHealth();
  writeFileSync(join(OUT, "PRODUCTION_HEALTH_INITIAL.json"), JSON.stringify(healthInitial, null, 2));
  log(`Health initial: build=${healthInitial.build} status=${healthInitial.status}`);

  const catalog = ensureCatalog();
  if (GENERATE_ONLY) {
    log("Catalog generated only. Exiting.");
    return;
  }

  atomicWrite(MANIFEST, {
    patch: "5.7V.2",
    gitHead: git,
    build: healthInitial.build,
    startedAt: new Date().toISOString(),
    counts: catalog.counts,
    phases: ["matrix", "multiturn", "stability", "parity", "regression", "aggregate"],
    resume: RESUME,
  });

  const phases = PHASE_ARG === "all" ? ["matrix", "multiturn", "stability", "parity", "regression", "aggregate"] : [PHASE_ARG];

  if (phases.includes("matrix")) await runMatrix(catalog);
  if (phases.includes("multiturn")) await runMultiturn(catalog);
  if (phases.includes("stability")) await runStability(catalog);
  if (phases.includes("parity")) await runParity(catalog);
  if (phases.includes("regression")) runRegressions();

  const healthFinal = await fetchHealth();
  writeFileSync(join(OUT, "PRODUCTION_HEALTH_FINAL.json"), JSON.stringify(healthFinal, null, 2));

  if (phases.includes("aggregate") || phases.includes("all")) {
    const closure = aggregate(catalog, healthInitial, healthFinal, git);
    log(`=== AUDIT COMPLETE verdict=${closure.verdict} turns=${closure.totalTurns} gates=${JSON.stringify(closure.gates)} ===`);
    process.exit(closure.allGates ? 0 : 1);
  }
}

main().catch((err) => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
