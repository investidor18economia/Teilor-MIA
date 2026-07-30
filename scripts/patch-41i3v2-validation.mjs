#!/usr/bin/env node
/**
 * PATCH 4.1I.3.V.2 — Production & local validation runner
 */
import { createRequire } from "module";
import { writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const PROD_URL = "https://economia-ai.vercel.app/app-mia";
const LOCAL_URL = process.env.MIA_LOCAL_URL || "http://localhost:3000/app-mia";
const EVIDENCE = join(ROOT, "docs/conversational/audits/phase-4/evidence/patch-41i3v2");
mkdirSync(EVIDENCE, { recursive: true });

const LOG = join(EVIDENCE, "run.log");
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(LOG, line);
  console.log(msg);
}

const MIA_THANKS = /\b(obrigad\w*|que gentil|valeu pelo elogio|fico feliz)\b/i;
const CLARIFICATION = /\b(me diz rapidinho a que voc[eê] se refere|voc[eê] fala disso ou de outra coisa)\b/i;
const PRODUCT_FRAME = /\b(produto|visual bem marcante|design do galaxy|design dele)\b/i;
const LEGACY = /\bPois é\.|direcionar a escolha\b/i;

async function fetchHealth() {
  const res = await fetch("https://economia-ai.vercel.app/api/health");
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createSession(browser, baseUrl) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  const turns = [];
  async function send(msg) {
    await sleep(2500);
    const p = page.waitForResponse(
      (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".mia-input").fill(msg);
    await page.locator(".send-btn").click();
    const resp = await p;
    const data = await resp.json().catch(() => ({}));
    const reply = String(data?.reply || "").trim();
    turns.push({ msg, reply, meta: data?.meta || data?.debug || null });
    await sleep(600);
    return { reply, data };
  }
  return { ctx, send, turns };
}

function classifyB2(reply) {
  const reasons = [];
  if (CLARIFICATION.test(reply)) reasons.push("neutral_clarification");
  if (PRODUCT_FRAME.test(reply) && !MIA_THANKS.test(reply)) reasons.push("product_frame");
  if (LEGACY.test(reply)) reasons.push("legacy_hit");
  if (!MIA_THANKS.test(reply)) reasons.push("missing_mia_thanks");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons };
}

function classifyB1(reply) {
  const reasons = [];
  if (MIA_THANKS.test(reply)) reasons.push("mia_thanks_on_product");
  if (CLARIFICATION.test(reply)) reasons.push("unnecessary_clarification");
  if (!/visual|design|galaxy|marcante|estética/i.test(reply)) reasons.push("missing_product_opinion");
  return { classification: reasons.length ? "REPROVADO" : "APROVADO", reasons };
}

async function runB2(browser, baseUrl, count, prefix) {
  const runs = [];
  for (let i = 1; i <= count; i++) {
    const s = await createSession(browser, baseUrl);
    const t1 = await s.send("Oi, MIA");
    const t2 = await s.send("Linda");
    await s.ctx.close();
    const check = classifyB2(t2.reply);
    runs.push({
      id: `${prefix}_r${i}`,
      turns: s.turns,
      reply: t2.reply,
      ...check,
      timestamp: new Date().toISOString(),
    });
    log(`${prefix} ${i}/${count}: ${check.classification} — ${t2.reply.slice(0, 80)}`);
  }
  return runs;
}

async function runMulti(browser, baseUrl, id, messages, checkFn) {
  const s = await createSession(browser, baseUrl);
  let last = "";
  for (const m of messages) last = (await s.send(m)).reply;
  await s.ctx.close();
  const check = checkFn(last);
  return { id, messages, reply: last, ...check, timestamp: new Date().toISOString() };
}

async function main() {
  writeFileSync(LOG, "");
  log("PATCH 4.1I.3.V.2 validation start");

  let healthBefore;
  try {
    healthBefore = await fetchHealth();
    writeFileSync(join(EVIDENCE, "HEALTH_BEFORE.json"), JSON.stringify(healthBefore, null, 2));
    log(`Health before: build=${healthBefore.build}`);
  } catch (e) {
    log(`Health fetch failed: ${e.message}`);
  }

  const browser = await chromium.launch({ headless: true });

  log("Running B2 reproduction BEFORE fix on production (10 runs)...");
  const b2Before = await runB2(browser, PROD_URL, 10, "B2_BEFORE");
  writeFileSync(join(EVIDENCE, "B2_REPRODUCTION_BEFORE.json"), JSON.stringify({ build: healthBefore?.build, runs: b2Before, pass: b2Before.filter((r) => r.classification === "APROVADO").length, total: b2Before.length }, null, 2));

  log("Running B1 regression (5 runs)...");
  const b1Runs = [];
  for (let i = 1; i <= 5; i++) {
    const r = await runMulti(
      browser,
      PROD_URL,
      `B1_r${i}`,
      ["O que você acha do design do Galaxy A55?", "Linda"],
      classifyB1
    );
    b1Runs.push(r);
    log(`B1 ${i}/5: ${r.classification}`);
  }
  writeFileSync(join(EVIDENCE, "PRODUCT_CONTEXT_REGRESSION.json"), JSON.stringify({ runs: b1Runs }, null, 2));

  log("Running critical 5 x3...");
  const criticalMsgs = ["Linda", "Você é muito inteligente", "Era ironia", "Só queria conversar", "Você me ajudou muito"];
  const criticalRuns = [];
  for (const msg of criticalMsgs) {
    for (let i = 1; i <= 3; i++) {
      const s = await createSession(browser, PROD_URL);
      const reply = (await s.send(msg)).reply;
      await s.ctx.close();
      const ok = !LEGACY.test(reply) && !CLARIFICATION.test(msg === "Linda" ? "" : reply);
      criticalRuns.push({ msg, run: i, reply, classification: ok ? "APROVADO" : "REPROVADO" });
    }
  }
  writeFileSync(join(EVIDENCE, "CRITICAL_5_REGRESSION.json"), JSON.stringify({ runs: criticalRuns }, null, 2));

  await browser.close();

  log("Running unit tests...");
  try {
    const unitOut = execSync("node scripts/test-mia-patch-41i3v2-mia-compliment-invariant.js", { cwd: ROOT, encoding: "utf8" });
    writeFileSync(join(EVIDENCE, "UNIT_TESTS.json"), JSON.stringify({ passed: true, output: unitOut.slice(-500) }, null, 2));
  } catch (e) {
    writeFileSync(join(EVIDENCE, "UNIT_TESTS.json"), JSON.stringify({ passed: false, error: e.message }, null, 2));
  }

  try {
    const auditOut = execSync("node scripts/test-mia-patch-41i3-semantic-fallback-audit.js", { cwd: ROOT, encoding: "utf8" });
    writeFileSync(join(EVIDENCE, "INTEGRATION_TESTS.json"), JSON.stringify({ passed: true, output: auditOut.slice(-500) }, null, 2));
  } catch (e) {
    writeFileSync(join(EVIDENCE, "INTEGRATION_TESTS.json"), JSON.stringify({ passed: false, error: e.message }, null, 2));
  }

  const b2Pass = b2Before.filter((r) => r.classification === "APROVADO").length;
  writeFileSync(
    join(EVIDENCE, "ROOT_CAUSE.json"),
    JSON.stringify(
      {
        rootCause:
          "Clarification gate and intent authority could fire neutral clarification when requiresClarification remained true after taxonomy overrode mode to social, without consulting the governed social contract (mia_compliment). Post-LLM validators existed but needs_clarification early return bypassed finalizeHumanConversationReply entirely.",
        divergenceStage: "applyClarificationGateToContextResolution / applyIntentAuthorityToPipeline",
        fix:
          "Central invariant isGovernedSocialContractBlocksClarification in miaSemanticAuthority.js; wired into clarification gates, intent authority, and post-LLM validator.",
        reasonCodes: [
          "governed_social_contract_blocks_clarification",
          "clarification_on_governed_social_contract",
          "clarification_on_mia_compliment",
        ],
      },
      null,
      2
    )
  );

  writeFileSync(
    join(EVIDENCE, "FINAL_SUMMARY.json"),
    JSON.stringify(
      {
        b2Before: `${b2Pass}/${b2Before.length}`,
        b1: `${b1Runs.filter((r) => r.classification === "APROVADO").length}/${b1Runs.length}`,
        critical: `${criticalRuns.filter((r) => r.classification === "APROVADO").length}/${criticalRuns.length}`,
        buildBefore: healthBefore?.build,
        note: "Post-fix production validation requires deploy of this commit",
      },
      null,
      2
    )
  );

  log(`Done. B2 before: ${b2Pass}/${b2Before.length}`);
}

main().catch((e) => {
  log(`Fatal: ${e.message}`);
  process.exit(1);
});
