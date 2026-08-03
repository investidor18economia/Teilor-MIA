#!/usr/bin/env node
/**
 * PATCH 5.8.5 — Production + UI directed audit (empathy / humanization)
 */
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-585");
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

const CHAINS = [
  {
    id: "P585-EM01",
    category: "desabafo",
    turns: ["hoje foi um dia difícil", "foi complicado mesmo", "mas enfim"],
    reject: /^(puxado\s*[—-]?\s*entendo|entendo\.?|compreendo\.?)$/i,
    check: (replies) => replies.some((r) => /imagino|pesad|difícil|entendo|compreendo|às vezes/i.test(r)),
  },
  {
    id: "P585-EM02",
    category: "desabafo",
    turns: ["não tô legal", "semana pesada", "to mal"],
    reject: /^(puxado\s*[—-]?\s*entendo|entendo\.?)$/i,
    check: (replies) => replies.every(Boolean),
  },
  {
    id: "P585-GR01",
    category: "agradecimento",
    turns: ["obrigado", "valeu mesmo", "tmj"],
    reject: /^(disponha\.?|de nada\.?)$/i,
    check: (replies) => replies.some((r) => /por nada|imagino|feliz|junto|disponha|nada/i.test(r)),
  },
  {
    id: "P585-RC01",
    category: "reciprocidade",
    turns: ["oi", "tudo bem?", "e você?", "como foi seu dia?"],
    check: (replies) => replies.some((r) => /por aqui|tranquilo|você|contigo/i.test(r)),
  },
  {
    id: "P585-HU01",
    category: "humor",
    turns: ["kkk", "haha", "engraçado"],
    check: (replies) => replies.every(Boolean),
  },
  {
    id: "P585-JY01",
    category: "alegria",
    turns: ["consegui passar no teste!", "to feliz", "finalmente deu certo"],
    check: (replies) => replies.some((r) => /legal|massa|boa|parab|show|que bom/i.test(r)),
  },
  {
    id: "P585-FR01",
    category: "frustração",
    turns: ["to frustrado", "situação chata", "que irritante"],
    check: (replies) => replies.some((r) => /entendo|faz sentido|chato|compreendo/i.test(r)),
  },
  {
    id: "P585-AX01",
    category: "ansiedade",
    turns: ["to ansioso", "com medo", "preocupado com isso"],
    check: (replies) => replies.some((r) => /entendo|faz sentido|compreendo|incerteza/i.test(r)),
  },
  {
    id: "P585-CM01",
    category: "transição comercial→emocional",
    turns: ["quero celular", "deixa o produto", "hoje foi difícil"],
    check: (replies) => replies.every(Boolean),
  },
  {
    id: "P585-CM02",
    category: "transição emocional→comercial",
    turns: ["dia difícil", "obrigado", "preciso notebook"],
    check: (replies) => replies.every(Boolean),
  },
  {
    id: "P585-CP01",
    category: "elogio",
    turns: ["você é legal", "gostei de você", "mandou bem"],
    check: (replies) => replies.some((r) => /obrig|legal|gentil|feliz/i.test(r)),
  },
  {
    id: "P585-FW01",
    category: "despedida",
    turns: ["tchau", "até mais", "flw"],
    check: (replies) => replies.every(Boolean),
  },
];

const UI_CHAINS = ["P585-EM01", "P585-GR01", "P585-RC01", "P585-HU01"];

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
  log(`PATCH 5.8.5 audit start HEAD=${gitHead()}`);
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
      log(`${chain.id} check ${chainPass ? "PASS" : "FAIL"}`);
    }
    apiResults.push({ id: chain.id, category: chain.category, turns: turnResults, replies, pass: chainPass });
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
