#!/usr/bin/env node
/**
 * PATCH 5.8.3 — Production + UI directed audit (multiturn continuity)
 */
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-583");
mkdirSync(OUT, { recursive: true });

const PROD_API = "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH = "https://economia-ai.vercel.app/api/health";
const UI = "https://economia-ai.vercel.app/app-mia";
const DELAY = 12000;
const LOG = join(OUT, "run.log");
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(LOG, line + "\n");
  console.log(line);
};

const SINGLE_CASES = [
  { id: "P583-GR01", msg: "oi", expect: /oi|olá|bom|boa|opa|salve|tudo bem/i },
  { id: "P583-RS01", msg: "lembra do assunto?", reject: /Claro, pode falar comigo/i, history: hist("hoje estou cansado", "Entendo.") },
  { id: "P583-RS02", msg: "como eu estava dizendo", reject: /fico por aqui no papo/i, history: hist("hoje estou cansado", "Entendo.", "foi complicado", "Compreendo.") },
];

function hist(...pairs) {
  const out = [];
  for (let i = 0; i < pairs.length; i += 2) {
    out.push({ role: "user", content: pairs[i] });
    if (pairs[i + 1]) out.push({ role: "assistant", content: pairs[i + 1] });
  }
  return out;
}

const CHAINS = [
  {
    id: "P583-MC01",
    turns: ["oi", "tudo bem?", "e você?"],
    checks: [
      null,
      { reject: /^Oi!\s*Tudo bem/i },
      { reject: /^Oi!/i },
    ],
  },
  {
    id: "P583-MC02",
    turns: ["hoje estou cansado", "foi complicado", "voltando ao assunto"],
    checks: [
      null,
      null,
      { reject: /Claro, pode falar comigo|fico por aqui no papo/i, expect: /lembro|voltando|assunto|coment/i },
    ],
  },
  {
    id: "P583-MC03",
    turns: ["quem é você", "como você funciona", "então você lembra?"],
    checks: [
      { expect: /MIA/i },
      null,
      { reject: /Claro, pode falar comigo/i, expect: /lembro|sim|mente|voltando|assunto|funciona/i },
    ],
  },
  {
    id: "P583-MC04",
    turns: ["oi", "preciso de celular", "deixa o produto", "como você tá?"],
    checks: [null, null, null, { reject: /^Oi!/i }],
  },
  {
    id: "P583-MC05",
    turns: ["bom dia", "tudo certo?", "como foi seu dia?"],
    checks: [null, { reject: /^Bom dia/i }, null],
  },
];

const UI_CHAINS = ["P583-MC01", "P583-MC02", "P583-MC03"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

async function callApi(msg, sessionId, history = []) {
  await sleep(DELAY);
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: msg,
      user_id: sessionId,
      conversation_id: sessionId,
      messages: history,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return {
    reply: String(body?.response || body?.reply || "").trim(),
    status: res.status,
    rateLimited: /várias mensagens em sequência/i.test(String(body?.response || body?.reply || "")),
  };
}

function evaluateReply(reply, check) {
  if (!check) return !!reply;
  let pass = !!reply;
  if (check.expect && !check.expect.test(reply)) pass = false;
  if (check.reject && check.reject.test(reply)) pass = false;
  if (/várias mensagens em sequência/i.test(reply)) pass = false;
  return pass;
}

async function main() {
  log(`PATCH 5.8.3 audit start HEAD=${gitHead()}`);
  let build = "unknown";
  try {
    const h = await fetch(HEALTH);
    const j = await h.json();
    build = j?.build || j?.version || build;
  } catch {}
  log(`Production build: ${build}`);

  const apiResults = [];

  for (const c of SINGLE_CASES) {
    const { reply, status, rateLimited } = await callApi(c.msg, c.id, c.history || []);
    let pass = !!reply && status === 200 && !rateLimited;
    if (c.expect && !c.expect.test(reply)) pass = false;
    if (c.reject && c.reject.test(reply)) pass = false;
    apiResults.push({ ...c, reply: reply.slice(0, 400), status, pass });
    log(`${c.id} ${pass ? "PASS" : "FAIL"} ${reply.slice(0, 80)}`);
  }

  for (const chain of CHAINS) {
    const sessionId = chain.id;
    const history = [];
    const turnResults = [];
    let chainPass = true;
    for (let i = 0; i < chain.turns.length; i++) {
      const msg = chain.turns[i];
      const check = chain.checks?.[i];
      const { reply, status, rateLimited } = await callApi(msg, sessionId, history);
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: reply });
      const pass = status === 200 && !rateLimited && evaluateReply(reply, check);
      if (!pass) chainPass = false;
      turnResults.push({ turn: i + 1, msg, reply: reply.slice(0, 400), pass });
      log(`${chain.id} T${i + 1} ${pass ? "PASS" : "FAIL"} ${reply.slice(0, 60)}`);
    }
    apiResults.push({ id: chain.id, type: "chain", turns: turnResults, pass: chainPass });
  }

  const require = createRequire(join(ROOT, "package.json"));
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const uiResults = [];

  for (const chainId of UI_CHAINS) {
    const chain = CHAINS.find((x) => x.id === chainId);
    await page.goto(`${UI}?v=${Date.now()}-${chainId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(3000);
    let chainPass = true;
    const turnResults = [];
    for (let i = 0; i < chain.turns.length; i++) {
      const msg = chain.turns[i];
      const check = chain.checks?.[i];
      await sleep(DELAY);
      const p = page.waitForResponse(
        (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
        { timeout: 120000 }
      );
      await page.locator(".mia-input").fill(msg);
      await page.locator(".send-btn").click();
      await p;
      await sleep(6000);
      const raw = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
      const reply = String(raw).replace(/^MIΛ\s*/i, "").trim();
      const pass = evaluateReply(reply, check);
      if (!pass) chainPass = false;
      turnResults.push({ turn: i + 1, msg, reply: reply.slice(0, 400), pass });
      log(`UI-${chainId} T${i + 1} ${pass ? "PASS" : "FAIL"}`);
    }
    uiResults.push({ id: chainId, turns: turnResults, pass: chainPass });
  }
  await browser.close();

  const apiPassed = apiResults.filter((r) => r.pass).length;
  const apiTotal = apiResults.length;
  const uiPassed = uiResults.filter((r) => r.pass).length;
  const uiTotal = uiResults.length;

  const summary = { build, head: gitHead(), apiPassed, apiTotal, uiPassed, uiTotal };
  writeFileSync(join(OUT, "API_RESULTS.json"), JSON.stringify({ apiResults, summary }, null, 2));
  writeFileSync(join(OUT, "UI_RESULTS.json"), JSON.stringify({ uiResults }, null, 2));
  writeFileSync(join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));
  log(`Done API ${apiPassed}/${apiTotal} UI ${uiPassed}/${uiTotal}`);
  process.exit(apiPassed === apiTotal && uiPassed === uiTotal ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
