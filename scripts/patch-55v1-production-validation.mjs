#!/usr/bin/env node
/** PATCH 5.5V.1 — Misroute + universal egress production validation */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-55v1");
mkdirSync(OUT, { recursive: true });

const API = "https://economia-ai.vercel.app/api/mia-chat";
const UI = "https://economia-ai.vercel.app/app-mia";
const HEALTH = "https://economia-ai.vercel.app/api/health";

const MISROUTES = [
  { id: "MR01", msg: "Fone de ouvido bom" },
  { id: "MR02", msg: "Teclado mecânico" },
  { id: "MR03", msg: "Orçamento 3000 reais" },
  { id: "MR04", msg: "Produto mais vendido" },
];

const CORE = [
  "Oi", "Show", "Linda", "Quero um celular até 2000", "Compare iPhone 13 com Galaxy A55",
  "Valeu", "Tchau", "Estou triste", "Oi, quero um celular até 2 mil",
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isCommercialReply(text = "", path = "") {
  const t = String(text || "").toLowerCase();
  const p = String(path || "").toLowerCase();
  if (/return_seguro|commercial|comparison|priority_followup|search_guidance/.test(p)) return true;
  return /celular|iphone|galaxy|notebook|fone|teclado|recomend|produto|monitor|preço|orçamento|samsung|redmi/.test(t);
}

function isSocialFallbackOnly(text = "") {
  return /^beleza — pode falar à vontade\.?$/i.test(String(text || "").trim());
}

async function probeApi(msg) {
  await sleep(4000);
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: msg,
      user_id: `v51-${Date.now()}`,
      conversation_id: `v51-${Date.now()}`,
      messages: [{ role: "user", content: msg }],
      session_context: {},
    }),
  });
  const b = await r.json();
  return {
    status: r.status,
    reply: String(b.reply || "").trim(),
    path: b.latency_analytics?.response_path || null,
    hasDebug: !!b.mia_debug,
  };
}

const health = await (await fetch(HEALTH)).json();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];

for (const c of [...MISROUTES, ...CORE.map((msg, i) => ({ id: `C${i + 1}`, msg }))]) {
  const api = await probeApi(c.msg);
  await page.goto(`${UI}?v=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mia-input");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await sleep(1200);
  const rp = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
  await page.locator(".mia-input").fill(c.msg);
  await page.locator(".send-btn").click();
  const resp = await rp;
  const data = await resp.json().catch(() => ({}));
  await sleep(1500);
  const uiReply = String(data.reply || "").trim();
  const ui = { status: resp.status(), reply: uiReply, path: data.latency_analytics?.response_path || null, hasDebug: !!data.mia_debug };
  const isMisrouteCase = MISROUTES.some((m) => m.id === c.id);
  const misrouteFixed = isMisrouteCase
    ? isCommercialReply(api.reply, api.path) && !isSocialFallbackOnly(api.reply)
    : null;
  results.push({
    ...c,
    api,
    ui,
    parity: api.reply === uiReply,
    misrouteFixed,
    approved: api.status === 200 && ui.status === 200 && !!api.reply && !!uiReply && (isMisrouteCase ? misrouteFixed : true),
  });
}

await browser.close();

const summary = {
  total: results.length,
  approved: results.filter((r) => r.approved).length,
  misroutesFixed: results.filter((r) => r.misrouteFixed === true).length,
  misroutesTotal: MISROUTES.length,
  parityOk: results.filter((r) => r.parity).length,
  debugLeaked: results.some((r) => r.ui.hasDebug),
};

const payload = { patch: "5.5V.1", health, summary, results, timestamp: new Date().toISOString() };
writeFileSync(join(OUT, "PRODUCTION_VALIDATION.json"), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
process.exit(summary.misroutesFixed === MISROUTES.length && summary.approved === summary.total ? 0 : 1);
