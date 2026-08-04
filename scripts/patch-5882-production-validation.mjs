#!/usr/bin/env node
/**
 * PATCH 5.8.8.2 — Production validation (Classes B + F only)
 * 20 API + 20 UI directed scenarios
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-5882");
const PROD = "https://economia-ai.vercel.app";
const UI = `${PROD}/app-mia`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IDENTITY = /\b(mia|teilor|assistente|compras|intelig)/i;
const STAY_SOCIAL = /\b(fico por aqui|o que voce quer conversar|estou acompanhando)\b/i;
const WARMTH = /\b(entendo|compreendo|imagino|por aqui|você|contigo|gentil|feliz|obrigad|disponha|imagina|cuide|mia|teilor|pesad|ouvindo|acompanh|pode falar|oi|olá|opa|até|tchau)\b/i;

const API_SCENARIOS = [
  { id: "F-01", cls: "F", msg: "me conta quem você é", expect: "identity" },
  { id: "F-02", cls: "F", msg: "você é humana?", expect: "identity" },
  { id: "F-03", cls: "F", msg: "qual IA te alimenta?", expect: "identity" },
  { id: "F-04", cls: "F", msg: "como você funciona?", expect: "identity" },
  { id: "F-05", cls: "F", msg: "quem te criou?", expect: "identity" },
  { id: "F-06", cls: "F", msg: "você lembra de mim?", expect: "identity" },
  { id: "F-07", cls: "F", msg: "sua especialidade?", expect: "identity" },
  { id: "F-08", cls: "F", msg: "você é só um robô?", expect: "identity" },
  { id: "F-09", cls: "F", msg: "open ai?", expect: "identity" },
  { id: "F-10", cls: "F", msg: "MIA da Teilor?", expect: "identity" },
  { id: "B-01", cls: "B", msg: "obrigado demais", expect: "warmth" },
  { id: "B-02", cls: "B", msg: "valeu", expect: "warmth" },
  { id: "B-03", cls: "B", msg: "oi", expect: "warmth" },
  { id: "B-04", cls: "B", msg: "bom dia", expect: "warmth" },
  { id: "B-05", cls: "B", msg: "to meio down", expect: "warmth" },
  { id: "B-06", cls: "B", msg: "e você?", expect: "warmth" },
  { id: "B-07", cls: "B", msg: "frustrado", expect: "warmth" },
  { id: "B-08", cls: "B", msg: "tchau", expect: "warmth" },
  { id: "B-09", cls: "B", msg: "você é legal", expect: "warmth" },
  { id: "B-10", cls: "B", msg: "dia dificil", expect: "warmth" },
];

const UI_SCENARIOS = [
  ...API_SCENARIOS.map((s) => ({ ...s, id: s.id.replace("-", "-UI-") })),
];

async function probeChat(msg, sid) {
  const t0 = Date.now();
  const res = await fetch(`${PROD}/api/mia-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: msg, user_id: sid, conversation_id: sid, messages: [] }),
  });
  const body = await res.json().catch(async () => ({ raw: await res.text() }));
  const reply = String(body.response || body.reply || "").trim();
  return { msg, status: res.status, ms: Date.now() - t0, reply: reply.slice(0, 300), reasonCode: body.reasonCode || null };
}

function scoreScenario(s, reply) {
  const internal = /Não consegui concluir essa resposta agora/i.test(reply);
  if (internal) return { pass: false, reason: "internal_error_ui" };
  if (s.expect === "identity") {
    if (!IDENTITY.test(reply)) return { pass: false, reason: "missing_identity" };
    if (STAY_SOCIAL.test(reply)) return { pass: false, reason: "stay_social_bleed" };
    return { pass: true };
  }
  if (!WARMTH.test(reply) && reply.length < 12) return { pass: false, reason: "cold_response" };
  if (/^(de nada\.?|por nada\.?|claro\.?|entendi\.?)$/i.test(reply)) return { pass: false, reason: "bare_cold_ack" };
  return { pass: true };
}

async function runApi() {
  const results = [];
  for (const s of API_SCENARIOS) {
    const r = await probeChat(s.msg, `p5882-api-${s.id}`);
    const scored = scoreScenario(s, r.reply);
    results.push({ ...s, ...r, ...scored });
    await sleep(2500);
  }
  writeFileSync(join(OUT, "DIRECTED_API_RESULTS.json"), JSON.stringify({ scenarios: results, pass: results.every((r) => r.status === 200 && r.pass) }, null, 2));
  return results;
}

async function runUi() {
  const require = createRequire(join(ROOT, "package.json"));
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    const apiOnly = API_SCENARIOS.map((s, i) => ({
      ...s,
      id: `UI-FALLBACK-${i + 1}`,
      note: "playwright unavailable — API proxy for UI scenarios",
    }));
    const results = [];
    for (const s of apiOnly) {
      const r = await probeChat(s.msg, `p5882-ui-fb-${s.id}`);
      const scored = scoreScenario(s, r.reply);
      results.push({ ...s, ...r, ...scored });
      await sleep(2500);
    }
    writeFileSync(
      join(OUT, "DIRECTED_UI_RESULTS.json"),
      JSON.stringify({ mode: "api_fallback", scenarios: results, pass: results.every((r) => r.status === 200 && r.pass) }, null, 2)
    );
    return results;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];
  for (let i = 0; i < UI_SCENARIOS.length; i += 1) {
    const s = UI_SCENARIOS[i];
    await page.goto(`${UI}?v=5882-${i}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector(".mia-input", { timeout: 45000 });
    await sleep(3000);
    const wait = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
    await page.locator(".mia-input").fill(s.msg);
    await page.locator(".send-btn").click();
    const resp = await wait;
    await sleep(4000);
    const reply = String(await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => ""))
      .replace(/^MIΛ\s*/i, "")
      .trim();
    const scored = scoreScenario(s, reply);
    results.push({ ...s, httpStatus: resp.status(), reply: reply.slice(0, 300), ...scored });
    await sleep(5000);
  }
  await browser.close();
  writeFileSync(
    join(OUT, "DIRECTED_UI_RESULTS.json"),
    JSON.stringify({ mode: "playwright", scenarios: results, pass: results.every((r) => r.httpStatus === 200 && r.pass) }, null, 2)
  );
  return results;
}

async function main() {
  const healthRes = await fetch(`${PROD}/api/health`);
  writeFileSync(
    join(OUT, "PRODUCTION_HEALTH.json"),
    JSON.stringify({ status: healthRes.status, body: await healthRes.json(), timestamp: new Date().toISOString() }, null, 2)
  );

  const api = await runApi();
  const ui = await runUi();
  const pass = api.every((r) => r.pass && r.status === 200) && ui.every((r) => r.pass && (r.httpStatus === 200 || r.status === 200));
  console.log(JSON.stringify({ pass, apiPass: api.filter((r) => r.pass).length, uiPass: ui.filter((r) => r.pass).length }, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
