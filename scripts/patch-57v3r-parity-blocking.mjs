#!/usr/bin/env node
/** UI×API parity on unique blocking failure themes — Playwright */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v3r");
mkdirSync(OUT, { recursive: true });
const API = "https://economia-ai.vercel.app/api/mia-chat";
const UI = "https://economia-ai.vercel.app/app-mia";
const blocking = JSON.parse(readFileSync(join(OUT, "BLOCKING_FAILURE_REVALIDATION.json"), "utf8"));
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const seen = new Set();
const samples = [];
for (const r of blocking.results) {
  const key = `${r.theme}|${r.failureMessage}`;
  if (seen.has(key)) continue;
  seen.add(key);
  samples.push(r);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (t) => String(t || "").replace(/^MIΛ\s*/i, "").replace(/^MIA\s*/i, "").trim();
function parityClass(a, u) {
  if (!a || !u) return "empty";
  if (norm(a) === norm(u)) return "exact";
  if (u.includes(a.slice(0, 30)) || a.includes(u.slice(0, 30))) return "semantic";
  return "divergent";
}

async function apiReplay(turns, sid) {
  const history = [];
  let last = {};
  for (const msg of turns) {
    await sleep(2800);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg, user_id: sid, conversation_id: sid, messages: history }),
    });
    const body = await res.json().catch(() => ({}));
    last = { reply: body.reply || "", path: body?.latency_analytics?.response_path || null };
    history.push({ role: "user", content: msg });
    if (last.reply) history.push({ role: "assistant", content: last.reply });
  }
  return last;
}

async function uiReplay(page, turns) {
  for (let i = 0; i < turns.length; i++) {
    const p = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
    await page.locator(".mia-input").fill(turns[i]);
    await page.locator(".send-btn").click();
    const resp = await p;
    const data = await resp.json().catch(() => ({}));
    await sleep(2000);
    if (i === turns.length - 1) {
      const uiReply = await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "");
      return { uiReply: String(uiReply).trim(), apiFromUi: String(data?.reply || "").trim() };
    }
  }
  return { uiReply: "", apiFromUi: "" };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pairs = [];

for (const sc of samples.slice(0, 12)) {
  await page.goto(`${UI}?v=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await sleep(800);
  const sid = `parity-${sc.id}`;
  const apiFinal = await apiReplay(sc.userTurns, sid);
  await page.goto(`${UI}?v=${Date.now()}-ui`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await sleep(800);
  const ui = await uiReplay(page, sc.userTurns);
  const parity = parityClass(apiFinal.reply, ui.uiReply);
  const cold = /me ajuda: você se refere/i.test(apiFinal.reply) || /me ajuda: você se refere/i.test(ui.uiReply);
  pairs.push({
    id: sc.id,
    theme: sc.theme,
    message: sc.failureMessage,
    parity,
    coldClarification: cold,
    apiReply: apiFinal.reply.slice(0, 300),
    uiReply: ui.uiReply.slice(0, 300),
    api_path: apiFinal.path,
    pass: ["exact", "semantic"].includes(parity) && !cold,
  });
  console.log(`${sc.id} ${parity} cold=${cold}`);
}
await browser.close();
writeFileSync(join(OUT, "API_UI_PARITY_BLOCKING.json"), JSON.stringify({ total: pairs.length, passed: pairs.filter(p => p.pass).length, pairs }, null, 2));
