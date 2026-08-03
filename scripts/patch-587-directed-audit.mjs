#!/usr/bin/env node
/**
 * PATCH 5.8.7 — Production + UI directed audit (final experience refinement)
 */
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-587");
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
    id: "P587-A01",
    category: "continuidade-retomada",
    turns: ["hoje foi pesado", "ok", "como eu estava dizendo"],
    check: (replies) => replies.some((r) => /lembro|retom|papo|assunto|continu|pesad/i.test(r)),
    reject: /pode falar comigo|não captei/i,
  },
  {
    id: "P587-A02",
    category: "continuidade-sem-ancora",
    turns: ["oi", "beleza", "volta pro papo de antes"],
    check: (replies) => replies.some((r) => /retom|papo|continu|lembra|assunto/i.test(r)),
  },
  {
    id: "P587-B01",
    category: "reciprocidade",
    turns: ["oi", "tudo bem?", "e você?", "como foi seu dia?"],
    check: (replies) => replies.filter((r) => /por aqui|tranquilo|você|contigo|indo|certo/i.test(r)).length >= 2,
    reject: /não captei|perdi o fio|sobre o quê/i,
  },
  {
    id: "P587-B02",
    category: "reciprocidade",
    turns: ["bom dia", "como você está?", "está tudo bem?"],
    check: (replies) => replies.some((r) => /por aqui|você|contigo|tranquilo|certo/i.test(r)),
    reject: /não captei|contexto/i,
  },
  {
    id: "P587-F01",
    category: "identidade-meta",
    turns: ["você é ChatGPT?", "qual modelo você usa?", "você lembra das coisas?"],
    check: (replies) =>
      replies.some((r) => /mia|chatgpt|modelo|memória|memoria|papo|conversa/i.test(r)),
    reject: /pode falar comigo|não captei/i,
  },
  {
    id: "P587-F02",
    category: "identidade-meta",
    turns: ["qual seu nome?", "você é a MIA?", "como você funciona?"],
    check: (replies) => replies.every((r) => /mia|assistente|compras|funciona|teilor/i.test(r)),
  },
  {
    id: "P587-H01",
    category: "despedida-sem-comercial",
    turns: ["quero celular", "obrigado", "preciso ir"],
    check: (replies) => {
      const last = replies[replies.length - 1] || "";
      return /até|logo|tchau|noite|descanse|foi bom|próxim|proxim/i.test(last);
    },
    rejectOnTurn: (turnIndex, reply) =>
      turnIndex === 2 && /recomend|produto|celular|compr|iphone|galaxy|minha escolha/i.test(reply),
  },
  {
    id: "P587-H02",
    category: "despedida-sem-comercial",
    turns: ["falamos depois", "até amanhã"],
    check: (replies) => replies.every(Boolean),
    reject: /recomend|produto|notebook/i,
  },
  {
    id: "P587-D01",
    category: "variacao-reciprocidade",
    turns: ["tudo bem?", "e você?", "e contigo?", "como vai?"],
    check: (replies) => new Set(replies.slice(1).map((r) => r.toLowerCase())).size >= 2,
  },
  {
    id: "P587-M01",
    category: "transicao-emocional",
    turns: ["dia difícil", "obrigado", "preciso ir"],
    check: (replies) => replies.every(Boolean),
  },
  {
    id: "P587-M02",
    category: "transicao-comercial-social",
    turns: ["quero notebook", "deixa o produto", "como você tá?"],
    check: (replies) => replies.some((r) => /você|contigo|por aqui|tranquilo/i.test(r)),
  },
];

const UI_CHAINS = ["P587-B01", "P587-F01", "P587-H01", "P587-A01"];

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
  log(`PATCH 5.8.7 audit start HEAD=${gitHead()}`);
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
      if (chain.rejectOnTurn && chain.rejectOnTurn(i, reply)) pass = false;
      else if (chain.reject && chain.reject.test(reply)) pass = false;
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
    const chain = CHAINS.find((c) => c.id === chainId);
    if (!chain) continue;
    try {
      await page.goto(UI, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForSelector("textarea, input[type=text], [contenteditable=true]", { timeout: 45000 });
      const replies = [];
      for (const msg of chain.turns) {
        const input = page.locator("textarea, input[type=text]").first();
        await input.fill(msg);
        await page.keyboard.press("Enter");
        await sleep(DELAY);
        const bubbles = page.locator('[class*="assistant"], [data-role="assistant"], .mia-message');
        const count = await bubbles.count();
        const text =
          count > 0
            ? await bubbles.nth(count - 1).innerText().catch(() => "")
            : await page.locator("body").innerText().catch(() => "");
        replies.push(String(text || "").trim());
      }
      const pass = chain.check ? chain.check(replies) : replies.every(Boolean);
      uiResults.push({ id: chainId, pass, replies: replies.map((r) => r.slice(0, 200)) });
      log(`UI ${chainId} ${pass ? "PASS" : "FAIL"}`);
    } catch (err) {
      uiResults.push({ id: chainId, pass: false, error: String(err.message) });
      log(`UI ${chainId} ERROR ${err.message}`);
    }
  }

  await browser.close();

  const summary = {
    patch: "5.8.7",
    head: gitHead(),
    productionBuild: build,
    apiPass: apiResults.filter((r) => r.pass).length,
    apiTotal: apiResults.length,
    uiPass: uiResults.filter((r) => r.pass).length,
    uiTotal: uiResults.length,
    allPass:
      apiResults.every((r) => r.pass) && uiResults.every((r) => r.pass),
    timestamp: new Date().toISOString(),
  };

  writeFileSync(join(OUT, "API_RESULTS.json"), JSON.stringify(apiResults, null, 2));
  writeFileSync(join(OUT, "UI_RESULTS.json"), JSON.stringify(uiResults, null, 2));
  writeFileSync(join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));
  log(`SUMMARY api=${summary.apiPass}/${summary.apiTotal} ui=${summary.uiPass}/${summary.uiTotal} allPass=${summary.allPass}`);
  process.exit(summary.allPass ? 0 : 1);
}

main().catch((err) => {
  log(`FATAL ${err.stack || err.message}`);
  process.exit(1);
});
