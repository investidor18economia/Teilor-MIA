#!/usr/bin/env node
/** Re-run failed 5.4V scenarios with anti-rate-limit spacing */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-54v");
const PROD_API = "https://economia-ai.vercel.app/api/mia-chat";
const PROD_UI = "https://economia-ai.vercel.app/app-mia";

const FAILED_IDS = [
  "GR10", "GR11", "AM01", "AM02", "AM04", "AM05", "AM06", "AP05", "PRD01", "REJ01", "COM01", "MIX01",
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function uid(p) { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

function normalizeReply(text = "") {
  return String(text || "")
    .replace(/^MIΛ\s*/i, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function semanticFingerprint(text = "") {
  const n = normalizeReply(text);
  if (!n) return "empty";
  if (/^(opa!?|oi!?|e aí!?|salve!?|bom dia!?|boa tarde!?|boa noite!?)/i.test(n)) return "greeting";
  if (/\?/.test(n) && /(mim|produto|refere|curios)/i.test(n)) return "ambiguous_social";
  if (/obrigad|valeu|imagina|por nada/i.test(n)) return "gratitude";
  if (/^(show!?|boa!?|legal!?|entendi)/i.test(n)) return "approval_ack";
  if (/celular|notebook|galaxy|iphone|recomend|orçamento|compar|samsung|equilibr/i.test(n)) return "commercial";
  return "other_social";
}

async function probeApi(msg, history = []) {
  await sleep(5000);
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: msg,
      user_id: uid("api"),
      conversation_id: uid("conv"),
      messages: [...history, { role: "user", content: msg }],
      session_context: {},
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, reply: String(body?.reply ?? "").trim(), path: body?.latency_analytics?.response_path };
}

async function probeUi(page, msg) {
  await page.goto(`${PROD_UI}?v=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (_) {} });
  await sleep(2000);
  const respP = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
  await page.locator(".mia-input").fill(msg);
  await page.locator(".send-btn").click();
  const resp = await respP;
  const data = await resp.json().catch(() => ({}));
  await page.waitForFunction(() => !document.querySelector(".send-btn.send-btn--loading"), { timeout: 120000 }).catch(() => {});
  await sleep(2000);
  return { status: resp.status, reply: String(data?.reply ?? "").trim(), path: data?.latency_analytics?.response_path };
}

const prior = readFileSync(join(OUT, "API_UI_PARITY.json"), "utf8");
const all = JSON.parse(prior).results;
const toRun = all.filter((r) => FAILED_IDS.includes(r.id));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const reruns = [];

for (const item of toRun) {
  const api = await probeApi(item.msg);
  const ui = await probeUi(page, item.msg);
  const fpMatch = semanticFingerprint(api.reply) === semanticFingerprint(ui.reply);
  const exactMatch = normalizeReply(api.reply) === normalizeReply(ui.reply);
  reruns.push({
    id: item.id,
    msg: item.msg,
    api: { reply: api.reply.slice(0, 120), path: api.path, fp: semanticFingerprint(api.reply) },
    ui: { reply: ui.reply.slice(0, 120), path: ui.path, fp: semanticFingerprint(ui.reply) },
    exactMatch,
    fpMatch,
    approved: api.status === 200 && ui.status === 200 && api.reply && ui.reply && (exactMatch || fpMatch),
  });
  console.log(item.id, fpMatch ? "OK" : "FAIL", api.reply.slice(0, 40), "|", ui.reply.slice(0, 40));
}

await browser.close();
writeFileSync(join(OUT, "API_UI_PARITY_RERUN.json"), JSON.stringify({ reruns, approved: reruns.filter((r) => r.approved).length, total: reruns.length }, null, 2));
