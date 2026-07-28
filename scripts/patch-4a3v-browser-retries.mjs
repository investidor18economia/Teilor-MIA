#!/usr/bin/env node
/** Re-verify PATCH 4A.3V failed scenarios in proper session context */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL = process.env.PATCH4A3V_BROWSER_URL || "http://localhost:3002/app-mia";
const DELAY = 9000;
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function goto() {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector(".mia-input", { timeout: 45000 });
  await sleep(1500);
}

async function send(message) {
  await page.locator(".mia-input").fill(message);
  const resp = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
  await page.locator(".send-btn").click();
  const response = await resp;
  const data = await response.json().catch(() => ({}));
  await sleep(1500);
  const reply = String(data?.reply || "");
  return { reply, sessionContext: data?.session_context || {}, status: response.status };
}

async function run(id, steps, assertFn) {
  await goto();
  const trace = [];
  for (const q of steps.slice(0, -1)) {
    const r = await send(q);
    trace.push({ q, reply: r.reply.slice(0, 180) });
    await sleep(DELAY);
  }
  const lastQ = steps[steps.length - 1];
  const r = await send(lastQ);
  trace.push({ q: lastQ, reply: r.reply.slice(0, 220) });
  const pass = assertFn(r.reply, trace);
  results.push({ id, pass, last_reply: r.reply.slice(0, 320), trace });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${r.reply.slice(0, 100)}`);
}

await run("retry-priority-economizar", ["preciso trocar de celular", "quero economizar o máximo possível"],
  (r) => /em conta|econom|barat|orçament|preço|value|conta/i.test(r));

await run("retry-pref-change-iphone", ["Quero celular Samsung até 2500.", "mudei de ideia, agora quero iPhone"],
  (r) => /iphone|apple|mudei|reavali|considerando/i.test(r));

await run("retry-contest-review", ["Galaxy A55 vale a pena?", "mas vi um review diferente, achei o A35 melhor"],
  (r) => /a35|a55|review|entend|considerando|continuo|discord/i.test(r) && r.length > 60);

await run("retry-contest-samsung", ["iPhone 15 vs Galaxy S24 qual escolher?", "prefiro esse da Samsung na real"],
  (r) => /s24|samsung|galaxy|prefere|entend|considerando|continuo/i.test(r) && !/qual recomendação anterior/i.test(r));

await run("retry-continuity-flow", ["A55 ou S23 FE?", "e o outro?", "explica melhor por quê?", "continua"],
  (r, trace) => {
    const explain = trace.find((t) => t.q.includes("explica"));
    const explainOk = explain && /porque|por quê|ganh|abre mão|a55|s23|recomend|escolh/i.test(explain.reply);
    const continueOk = /a55|s23|fe|continu|mantenho|recomend|escolh|porque/i.test(r);
    return explainOk && continueOk && r.length > 40;
  });

await browser.close();
const passed = results.filter((r) => r.pass).length;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs/conversational/audits/phase-4a/evidence/PATCH_4A_3_LOCAL_BROWSER_RETRIES.json");
fs.writeFileSync(out, JSON.stringify({ finished_at: new Date().toISOString(), results, passed, total: results.length }, null, 2));
console.log(`\nRetries: ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
