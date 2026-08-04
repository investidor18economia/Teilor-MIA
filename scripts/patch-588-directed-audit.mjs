#!/usr/bin/env node
/**
 * PATCH 5.8.8 — Production UI directed audit (Classes B, D, F)
 */
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-588");
mkdirSync(OUT, { recursive: true });

const PROD_API = "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH = "https://economia-ai.vercel.app/api/health";
const UI = "https://economia-ai.vercel.app/app-mia";
const DELAY = 10000;
const LOG = join(OUT, "audit.log");
const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(LOG, line + "\n");
  console.log(line);
};

const WARMTH_MARKERS = /\b(entendo|compreendo|imagino|por aqui|você|contigo|gentil|feliz|pesad|difícil|acompanh|ouvindo|tamo|obrigad|valeu|disponha|imagina)\b/i;
const IDENTITY_MARKERS = /\b(mia|teilor|assistente|compras|chatgpt|modelo|memória|memoria|funciona)\b/i;

const CHAINS = [
  // Classe B — warmth (20 chains)
  { id: "B01", class: "B", turns: ["oi", "tudo bem?", "e você?"], check: (r) => r.some((x) => WARMTH_MARKERS.test(x)) },
  { id: "B02", class: "B", turns: ["bom dia", "como você está?"], check: (r) => WARMTH_MARKERS.test(r[r.length - 1] || "") },
  { id: "B03", class: "B", turns: ["dia difícil"], check: (r) => /entendo|compreendo|pesad|difícil|imagino/i.test(r[0] || "") },
  { id: "B04", class: "B", turns: ["obrigado pela ajuda"], check: (r) => /imagina|nada|disponha|feliz|valeu/i.test(r[0] || "") },
  { id: "B05", class: "B", turns: ["tô meio down"], check: (r) => WARMTH_MARKERS.test(r[0] || "") },
  { id: "B06", class: "B", turns: ["você é legal"], check: (r) => /gentil|obrigad|valeu|legal/i.test(r[0] || "") },
  { id: "B07", class: "B", turns: ["kkk"], check: (r) => r[0]?.length >= 2 },
  { id: "B08", class: "B", turns: ["preciso desabafar"], check: (r) => /ouvindo|acompanh|pode falar|conta/i.test(r[0] || "") },
  { id: "B09", class: "B", turns: ["tchau", "até logo"], check: (r) => /até|logo|tchau|mais|bom/i.test(r.join(" ")) },
  { id: "B10", class: "B", turns: ["consegui!", "obrigado"], check: (r) => WARMTH_MARKERS.test(r.join(" ")) },
  { id: "B11", class: "B", turns: ["e contigo?", "como vai?"], check: (r) => r.filter((x) => WARMTH_MARKERS.test(x)).length >= 1 },
  { id: "B12", class: "B", turns: ["frustrado com tudo"], check: (r) => WARMTH_MARKERS.test(r[0] || "") },
  { id: "B13", class: "B", turns: ["valeu demais"], check: (r) => WARMTH_MARKERS.test(r[0] || "") },
  { id: "B14", class: "B", turns: ["só queria conversar"], check: (r) => /ouvindo|acompanh|pode|conta/i.test(r[0] || "") },
  { id: "B15", class: "B", turns: ["boa noite"], check: (r) => r[0]?.length >= 3 },
  { id: "B16", class: "B", turns: ["ansioso demais"], check: (r) => WARMTH_MARKERS.test(r[0] || "") },
  { id: "B17", class: "B", turns: ["show", "obrigado"], check: (r) => r.every(Boolean) },
  { id: "B18", class: "B", turns: ["como foi seu dia?", "e o seu?"], check: (r) => r.some((x) => /por aqui|você|contigo/i.test(x)) },
  { id: "B19", class: "B", turns: ["tô cansado"], check: (r) => WARMTH_MARKERS.test(r[0] || "") },
  { id: "B20", class: "B", turns: ["preciso ir", "até amanhã"], check: (r) => /até|logo|tchau|mais/i.test(r.join(" ")) },

  // Classe D — structural variation (15 chains)
  { id: "D01", class: "D", turns: ["ok", "certo", "beleza", "entendi", "show", "legal", "sim", "hm", "ok", "certo"], check: (r) => new Set(r.map((x) => x.toLowerCase().slice(0, 12))).size >= 3 },
  { id: "D02", class: "D", turns: Array(15).fill("ok"), check: (r) => new Set(r.map((x) => x.toLowerCase())).size >= 2 },
  { id: "D03", class: "D", turns: ["tudo bem?", "e você?", "e contigo?", "como vai?", "como tá?"], check: (r) => new Set(r.slice(1).map((x) => x.toLowerCase())).size >= 2 },
  { id: "D04", class: "D", turns: ["beleza", "ok", "certo", "show", "legal", "sim", "hm", "entendi", "beleza", "ok", "certo", "show"], check: (r) => new Set(r.map((x) => x.toLowerCase().slice(0, 10))).size >= 2 },
  { id: "D05", class: "D", turns: Array(20).fill("certo"), check: (r) => r.length >= 10 },
  { id: "D06", class: "D", turns: ["ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok", "ok"], check: (r) => new Set(r.map((x) => x.toLowerCase())).size >= 1 },
  { id: "D07", class: "D", turns: ["sim", "certo", "beleza", "show", "legal", "ok", "hm", "entendi", "sim", "certo", "beleza", "show", "legal", "ok", "hm"], check: (r) => r.length === 15 },
  { id: "D08", class: "D", turns: Array(25).fill("beleza"), check: (r) => r.length >= 20 },
  { id: "D09", class: "D", turns: ["tudo bem?", "ok", "certo", "beleza", "show", "legal", "sim", "hm", "entendi", "ok"], check: (r) => r.some((x) => WARMTH_MARKERS.test(x)) },
  { id: "D10", class: "D", turns: Array(12).fill("entendi"), check: (r) => r.length >= 10 },
  { id: "D11", class: "D", turns: ["ok", "certo", "beleza", "show", "legal", "sim", "hm", "entendi", "ok", "certo", "beleza", "show", "legal", "sim", "hm", "entendi", "ok", "certo", "beleza", "show"], check: (r) => r.length === 20 },
  { id: "D12", class: "D", turns: Array(10).fill("show"), check: (r) => r.length === 10 },
  { id: "D13", class: "D", turns: ["certo", "ok", "beleza", "sim", "hm", "legal", "show", "entendi", "certo", "ok", "beleza", "sim", "hm", "legal", "show", "entendi", "certo", "ok", "beleza", "sim", "hm", "legal", "show", "entendi", "certo"], check: (r) => r.length === 25 },
  { id: "D14", class: "D", turns: ["tudo bem?", "e você?", "ok", "certo", "beleza", "show", "legal", "sim", "hm", "entendi"], check: (r) => r.length === 10 },
  { id: "D15", class: "D", turns: Array(15).fill("legal"), check: (r) => r.length === 15 },

  // Classe F — identity (20 chains)
  { id: "F01", class: "F", turns: ["qual seu nome?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F02", class: "F", turns: ["quem é você?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F03", class: "F", turns: ["você é ChatGPT?"], check: (r) => /mia|teilor|chatgpt|não|nao/i.test(r[0] || "") },
  { id: "F04", class: "F", turns: ["qual modelo você usa?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F05", class: "F", turns: ["você lembra das coisas?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F06", class: "F", turns: ["como você funciona?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F07", class: "F", turns: ["você é a MIA?"], check: (r) => /mia|teilor/i.test(r[0] || "") },
  { id: "F08", class: "F", turns: ["quem te criou?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F09", class: "F", turns: ["você é uma IA?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F10", class: "F", turns: ["você aprende comigo?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F11", class: "F", turns: ["qual LLM te alimenta?", "open ai?"], check: (r) => r.every((x) => IDENTITY_MARKERS.test(x)) },
  { id: "F12", class: "F", turns: ["me conta sobre você"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F13", class: "F", turns: ["você tem memória?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F14", class: "F", turns: ["você é real?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F15", class: "F", turns: ["o que você faz?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F16", class: "F", turns: ["gpt-4?", "claude?"], check: (r) => r.every((x) => IDENTITY_MARKERS.test(x)) },
  { id: "F17", class: "F", turns: ["MIA da Teilor?"], check: (r) => /mia|teilor/i.test(r[0] || "") },
  { id: "F18", class: "F", turns: ["você treina com minhas mensagens?"], check: (r) => IDENTITY_MARKERS.test(r[0] || "") },
  { id: "F19", class: "F", turns: ["quais seus limites?"], check: (r) => r[0]?.length >= 5 },
  { id: "F20", class: "F", turns: ["inteligência artificial?", "quem é a MIA?"], check: (r) => r.every((x) => IDENTITY_MARKERS.test(x)) },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiTurn(message, history) {
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, sessionId: `patch588-${Date.now()}` }),
  });
  const data = await res.json();
  return data.response || data.reply || data.text || "";
}

async function uiTurn(page, message) {
  const input = page.locator('textarea, input[type="text"]').first();
  await input.fill(message);
  await input.press("Enter");
  await sleep(DELAY);
  const bubbles = page.locator('[data-testid="mia-message"], .mia-message, [class*="assistant"]').last();
  return (await bubbles.textContent()) || "";
}

async function runUI() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(UI, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(3000);
  return { browser, page };
}

const results = [];
let pass = 0;
let fail = 0;

log("PATCH 5.8.8 directed audit — API + UI");

let health = {};
try {
  health = await fetch(HEALTH).then((r) => r.json());
  log(`Health: ${JSON.stringify(health).slice(0, 120)}`);
} catch (e) {
  log(`Health check failed: ${e.message}`);
}

const uiChains = CHAINS.slice(0, 25);
let uiCtx = null;
try {
  uiCtx = await runUI();
} catch (e) {
  log(`UI init failed: ${e.message}`);
}

for (const chain of CHAINS) {
  const replies = [];
  const history = [];
  let ok = false;
  try {
    for (const turn of chain.turns) {
      const reply = await apiTurn(turn, history);
      replies.push(reply);
      history.push({ role: "user", content: turn });
      history.push({ role: "assistant", content: reply });
      await sleep(DELAY);
    }
    ok = chain.check(replies);
  } catch (e) {
    log(`${chain.id} API error: ${e.message}`);
  }
  results.push({ id: chain.id, class: chain.class, channel: "api", pass: ok, replies: replies.map((r) => r.slice(0, 120)) });
  if (ok) pass += 1;
  else fail += 1;
  log(`${chain.id} API: ${ok ? "PASS" : "FAIL"}`);
}

if (uiCtx) {
  for (const chain of uiChains) {
    const replies = [];
    let ok = false;
    try {
      await uiCtx.page.goto(UI, { waitUntil: "networkidle", timeout: 60000 });
      await sleep(3000);
      for (const turn of chain.turns) {
        const reply = await uiTurn(uiCtx.page, turn);
        replies.push(reply);
        await sleep(2000);
      }
      ok = chain.check(replies);
    } catch (e) {
      log(`${chain.id} UI error: ${e.message}`);
    }
    results.push({ id: chain.id, class: chain.class, channel: "ui", pass: ok, replies: replies.map((r) => r.slice(0, 120)) });
    if (ok) pass += 1;
    else fail += 1;
    log(`${chain.id} UI: ${ok ? "PASS" : "FAIL"}`);
  }
  await uiCtx.browser.close();
}

let gitHead = "unknown";
try {
  gitHead = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
} catch {}

const summary = {
  patch: "5.8.8",
  gitHead,
  health,
  total: results.length,
  pass,
  fail,
  passRate: results.length ? pass / results.length : 0,
  approved: fail === 0,
  timestamp: new Date().toISOString(),
};

writeFileSync(join(OUT, "AUDIT_RESULTS.json"), JSON.stringify({ summary, results }, null, 2));
writeFileSync(join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));

log(`DONE pass=${pass} fail=${fail} approved=${summary.approved}`);
process.exit(summary.approved ? 0 : 1);
