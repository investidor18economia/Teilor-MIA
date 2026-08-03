#!/usr/bin/env node
/**
 * PATCH 5.8.4 — Production + UI directed audit (rhythm / anti-repetition)
 */
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-584");
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
    id: "P584-RC01",
    turns: ["oi", "tudo bem?", "ok", "certo", "beleza", "show"],
    check: (replies) => {
      const openers = replies.map((r) => String(r).split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
      const unique = new Set(openers);
      return unique.size >= 3;
    },
  },
  {
    id: "P584-RC02",
    turns: ["valeu", "obrigado", "tmj", "show"],
    check: (replies) => replies.every(Boolean),
  },
  {
    id: "P584-RC03",
    turns: ["hoje estou cansado", "foi complicado", "mas enfim", "ok"],
    check: (replies) => {
      const dupes = replies.filter((r, i) => replies.indexOf(r) !== i);
      return dupes.length === 0;
    },
  },
  {
    id: "P584-RC04",
    turns: ["só queria conversar", "entendi", "ok", "certo"],
    reject: /^(Entendi\.|Claro, pode falar comigo\.|Sem problema — fico por aqui no papo\.)$/i,
  },
];

const UI_CHAINS = ["P584-RC01", "P584-RC02"];

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
  const reply = String(body?.response || body?.reply || "").trim();
  return {
    reply,
    status: res.status,
    rateLimited: /várias mensagens em sequência/i.test(reply),
  };
}

async function main() {
  log(`PATCH 5.8.4 audit start HEAD=${gitHead()}`);
  let build = "unknown";
  try {
    const h = await fetch(HEALTH);
    const j = await h.json();
    build = j?.build || j?.version || build;
  } catch {}
  log(`Production build: ${build}`);

  const apiResults = [];
  for (const chain of CHAINS) {
    const sessionId = chain.id;
    const history = [];
    const turnResults = [];
    const replies = [];
    let chainPass = true;
    for (let i = 0; i < chain.turns.length; i++) {
      const msg = chain.turns[i];
      const { reply, status, rateLimited } = await callApi(msg, sessionId, history);
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: reply });
      replies.push(reply);
      let pass = status === 200 && !!reply && !rateLimited;
      if (chain.reject && chain.reject.test(reply)) pass = false;
      if (!pass) chainPass = false;
      turnResults.push({ turn: i + 1, msg, reply: reply.slice(0, 400), pass });
      log(`${chain.id} T${i + 1} ${pass ? "PASS" : "FAIL"} ${reply.slice(0, 60)}`);
    }
    if (chain.check && chainPass) {
      chainPass = chain.check(replies);
      log(`${chain.id} diversity ${chainPass ? "PASS" : "FAIL"}`);
    }
    apiResults.push({ id: chain.id, turns: turnResults, replies, pass: chainPass });
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
    const turnResults = [];
    const replies = [];
    let chainPass = true;
    for (let i = 0; i < chain.turns.length; i++) {
      const msg = chain.turns[i];
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
      replies.push(reply);
      let pass = !!reply;
      if (chain.reject && chain.reject.test(reply)) pass = false;
      if (!pass) chainPass = false;
      turnResults.push({ turn: i + 1, msg, reply: reply.slice(0, 400), pass });
      log(`UI-${chainId} T${i + 1} ${pass ? "PASS" : "FAIL"}`);
    }
    if (chain.check && chainPass) chainPass = chain.check(replies);
    uiResults.push({ id: chainId, turns: turnResults, replies, pass: chainPass });
  }
  await browser.close();

  const summary = {
    build,
    head: gitHead(),
    apiPassed: apiResults.filter((r) => r.pass).length,
    apiTotal: apiResults.length,
    uiPassed: uiResults.filter((r) => r.pass).length,
    uiTotal: uiResults.length,
  };
  writeFileSync(join(OUT, "API_RESULTS.json"), JSON.stringify({ apiResults, summary }, null, 2));
  writeFileSync(join(OUT, "UI_RESULTS.json"), JSON.stringify({ uiResults }, null, 2));
  writeFileSync(join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));
  log(`Done API ${summary.apiPassed}/${summary.apiTotal} UI ${summary.uiPassed}/${summary.uiTotal}`);
  process.exit(summary.apiPassed === summary.apiTotal && summary.uiPassed === summary.uiTotal ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
