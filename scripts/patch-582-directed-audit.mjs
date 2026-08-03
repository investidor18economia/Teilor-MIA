#!/usr/bin/env node
/**
 * PATCH 5.8.2 — Production + UI directed audit
 */
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-582");
mkdirSync(OUT, { recursive: true });

const PROD_API = "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH = "https://economia-ai.vercel.app/api/health";
const UI = "https://economia-ai.vercel.app/app-mia";
const DELAY = 5500;
const LOG = join(OUT, "run.log");
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(LOG, line + "\n");
  console.log(line);
};

const CASES = [
  { id: "P582-GR01", msg: "oi", reject: /rapidinho/i },
  { id: "P582-GR02", msg: "bom dia", reject: /rapidinho/i },
  { id: "P582-ID01", msg: "qual seu nome?", expect: /MIA/i, reject: /pode falar comigo/i },
  { id: "P582-ID02", msg: "quem é você?", expect: /MIA|assistente/i },
  { id: "P582-ID03", msg: "como você funciona?", expect: /compras|compar/i },
  { id: "P582-EM01", msg: "não tô legal", reject: /Boa — legal|Show — legal/i, expect: /entendo|compreendo|pesa/i },
  { id: "P582-EM02", msg: "to meio down", reject: /Show — down|Boa — down/i },
  { id: "P582-RC01", msg: "e você?", expect: /você|contigo|por aqui/i, reject: /pode falar comigo/i },
  { id: "P582-RC02", msg: "como você tá?", expect: /você|contigo|por aqui/i },
  { id: "P582-CL01", msg: "péssimo", reject: /rapidinho/i },
  { id: "P582-CL02", msg: "horrível", reject: /rapidinho/i },
  { id: "P582-CO01", msg: "você é legal", expect: /./ },
  { id: "P582-HU01", msg: "kkk", expect: /./ },
  { id: "P582-CA01", msg: "tudo bem?", expect: /./ },
  { id: "P582-ST01", msg: "só queria conversar", reject: /Claro, pode falar comigo/i },
];

const UI_CASES = ["P582-GR01", "P582-ID01", "P582-EM01", "P582-RC01", "P582-CL01"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

async function callApi(msg, sessionId) {
  await sleep(DELAY);
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: msg, user_id: `p582-${sessionId}`, conversation_history: [] }),
  });
  const body = await res.json().catch(() => ({}));
  return { reply: String(body?.response || body?.reply || "").trim(), status: res.status };
}

async function main() {
  log(`PATCH 5.8.2 audit start HEAD=${gitHead()}`);
  let build = "unknown";
  try {
    const h = await fetch(HEALTH);
    const j = await h.json();
    build = j?.build || j?.version || build;
  } catch {}
  log(`Production build: ${build}`);

  const apiResults = [];
  for (const c of CASES) {
    const { reply, status } = await callApi(c.msg, c.id);
    let pass = !!reply && status === 200;
    if (c.expect && !c.expect.test(reply)) pass = false;
    if (c.reject && c.reject.test(reply)) pass = false;
    if (/várias mensagens em sequência/i.test(reply)) pass = false;
    apiResults.push({ ...c, reply: reply.slice(0, 400), status, pass });
    log(`${c.id} ${pass ? "PASS" : "FAIL"} ${reply.slice(0, 80)}`);
  }

  const require = createRequire(join(ROOT, "package.json"));
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const uiResults = [];

  for (const id of UI_CASES) {
    const c = CASES.find((x) => x.id === id);
    await page.goto(`${UI}?v=${Date.now()}-${id}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(2500);
    const p = page.waitForResponse(
      (r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.locator(".mia-input").fill(c.msg);
    await page.locator(".send-btn").click();
    await p;
    await sleep(8000);
    const raw = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
    const reply = String(raw).replace(/^MIΛ\s*/i, "").trim();
    const api = apiResults.find((r) => r.id === id);
    let pass = !!reply;
    if (c.expect && !c.expect.test(reply)) pass = false;
    if (c.reject && c.reject.test(reply)) pass = false;
    uiResults.push({
      id,
      msg: c.msg,
      reply: reply.slice(0, 400),
      apiReply: api?.reply?.slice(0, 400),
      pass,
    });
    log(`UI-${id} ${pass ? "PASS" : "FAIL"}`);
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
