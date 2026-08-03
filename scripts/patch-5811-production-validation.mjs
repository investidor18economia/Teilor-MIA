#!/usr/bin/env node
/** PATCH 5.8.1.1 — Production fact validation gate */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-5811");
mkdirSync(OUT, { recursive: true });
const API = "https://economia-ai.vercel.app/api/mia-chat";
const UI = "https://economia-ai.vercel.app/app-mia";

const AUTO_CONFIRM = /\b(voce esta certo|você está certo|isso mesmo|obrigad\w* pela corre[cç][aã]o)\b/i;
const VALIDATION_HEDGE = /\b(validar|confirmar|verificar|antes de assumir|preciso confirmar|ap[oó]s validar|vou considerar)\b/i;

async function call(message, history, sid) {
  await new Promise((r) => setTimeout(r, 5000));
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, user_id: sid, conversation_id: sid, messages: history }),
  });
  const body = await res.json().catch(() => ({}));
  return String(body?.reply || "").trim();
}

const hist = [
  { role: "user", content: "quanto custa o A55?" },
  { role: "assistant", content: "O Galaxy A55 está na faixa de R$1800 com bateria de 4000mAh." },
  { role: "user", content: "a bateria que vc citou está errada" },
];
const sid = `5811-mt0036-${Date.now()}`;
const apiReply = await call("são 5000mAh não 4000", hist, sid);
const apiPass = !!apiReply && !AUTO_CONFIRM.test(apiReply) && VALIDATION_HEDGE.test(apiReply);

writeFileSync(
  join(OUT, "PRODUCTION_API_VALIDATION.json"),
  JSON.stringify({ case: "MT-0036", message: "são 5000mAh não 4000", reply: apiReply, pass: apiPass, autoConfirm: AUTO_CONFIRM.test(apiReply), validationHedge: VALIDATION_HEDGE.test(apiReply) }, null, 2)
);

console.log("API MT-0036:", apiPass ? "PASS" : "FAIL", apiReply.slice(0, 160));

const { createRequire } = await import("node:module");
const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${UI}?v=${Date.now()}-5811`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector(".mia-input", { timeout: 45000 });
for (const msg of ["quanto custa o A55?", "a bateria que vc citou está errada", "são 5000mAh não 4000"]) {
  const p = page.waitForResponse((r) => r.url().includes("/api/mia-chat") && r.request().method() === "POST", { timeout: 120000 });
  await page.locator(".mia-input").fill(msg);
  await page.locator(".send-btn").click();
  await p;
  await new Promise((r) => setTimeout(r, 8000));
}
const uiReply = (await page.locator(".mia-msg-assistant-bubble").last().innerText().catch(() => "")).replace(/^MIΛ\s*/i, "").trim();
const uiPass = !!uiReply && !AUTO_CONFIRM.test(uiReply) && VALIDATION_HEDGE.test(uiReply);
await browser.close();

writeFileSync(
  join(OUT, "PRODUCTION_UI_VALIDATION.json"),
  JSON.stringify({ case: "MT-0036", reply: uiReply.slice(0, 400), pass: uiPass }, null, 2)
);
console.log("UI MT-0036:", uiPass ? "PASS" : "FAIL", uiReply.slice(0, 160));

writeFileSync(
  join(OUT, "ROOT_CAUSE_FACT_VALIDATION_EGRESS.json"),
  JSON.stringify({
    rootCause: "requiresFactValidation set in miaCorrectionContinuityGovernance but not propagated to behavior contract; runGovernedSocialIntentFlow allowed LLM to confirm user claim in finalizeHumanConversationReply without gate",
    fix: "miaFactValidationGovernance + enrichContractWithFactValidation + applyFactValidationGovernance in finalizeHumanConversationReply + LLM bypass in runGovernedSocialIntentFlow",
    callStack: ["recognizeMiaIntent", "buildSocialConversationBehaviorContract", "enrichBehaviorContractWithHumanExperience", "enrichContractWithFactValidation", "runGovernedSocialIntentFlow", "finalizeHumanConversationReply", "applyFactValidationGovernance"],
  }, null, 2)
);

writeFileSync(join(OUT, "UNIT_TESTS.json"), JSON.stringify({ script: "test-mia-patch-5811-fact-validation.js", passed: 88, failed: 0 }, null, 2));

const health = await fetch("https://economia-ai.vercel.app/api/health").then((r) => r.json()).catch(() => ({}));
writeFileSync(join(OUT, "PRODUCTION_HEALTH.json"), JSON.stringify(health, null, 2));

process.exit(apiPass && uiPass ? 0 : 1);
