/**
 * PATCH 11B.3 — Natural Conversation + RF-01 (Production API)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROD_API = "https://economia-ai.vercel.app/api/chat-gpt4o";

function loadEnvKey() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return process.env.API_SHARED_KEY || null;
  const raw = fs.readFileSync(envPath, "utf8");
  const match = raw.match(/^API_SHARED_KEY=(.+)$/m);
  return (match?.[1] || process.env.API_SHARED_KEY || "").trim() || null;
}

const API_KEY = loadEnvKey();
if (!API_KEY) {
  console.error("API_SHARED_KEY missing");
  process.exit(1);
}

async function apiCall(text, { conversationId, sessionContext = {}, userId = "11b3-prod" } = {}) {
  const started = Date.now();
  const resp = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      user_id: userId,
      conversation_id: conversationId,
      messages: [],
      session_context: sessionContext,
    }),
  });
  const rawText = await resp.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { reply: "", parseError: true };
  }
  const en = data?.mia_debug?.runtime_enforcement || {};
  const ext = en.externalCallAccounting || {};
  const ir = data?.mia_debug?.intent_recognition || {};
  const followUp = ir?.contextualFollowUp || {};
  const reply = (data?.reply || "").trim();
  return {
    status: resp.status,
    ms: Date.now() - started,
    data,
    m: {
      http200: resp.status === 200,
      reply,
      replyLen: reply.length,
      replyGenericSocial: /^(pois [eé]|entendi|legal|faz sentido|ok)\.?$/i.test(reply),
      pricesCount: Array.isArray(data?.prices) ? data.prices.length : 0,
      interactionMode: ir.interactionMode || null,
      commercialPermission: data?.mia_debug?.intent_authority?.commercialPermission || null,
      followUpType: followUp.followUpType || null,
      providerRequired: followUp.providerRequired,
      paidExternal: ext.paidExternalCallExecutedCount || 0,
      providerExecuted: en.providerExecutedCount || 0,
    },
  };
}

const results = [];
function record(name, pass, detail = {}) {
  results.push({ name, pass, ...detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}`, JSON.stringify(detail));
}

console.log("\nPATCH 11B.3 — Production Validation\n");

const socialCases = [
  { name: "galaxy opinion", text: "acho esse Galaxy bonito", expectCommercial: false },
  { name: "tired research", text: "estou cansado de pesquisar celular", expectCommercial: false },
  { name: "old phone", text: "meu celular está velho", expectCommercial: false },
  { name: "brand dislike", text: "não gosto de Samsung", expectCommercial: false },
];

for (const c of socialCases) {
  const r = await apiCall(c.text, { conversationId: `11b3-social-${c.name}` });
  record(c.name, r.m.http200 && !c.expectCommercial ? r.m.commercialPermission !== "allow" && r.m.pricesCount === 0 && !r.m.replyGenericSocial : r.m.http200, r.m);
}

const mixedCases = [
  "estou cansado, mas quero um celular até 2500",
  "meu último celular travava, quero um mais rápido e sem Samsung",
];
for (const text of mixedCases) {
  const r = await apiCall(text, { conversationId: `11b3-mixed-${text.slice(0, 12)}` });
  record(`mixed: ${text.slice(0, 40)}`, r.m.http200 && (r.m.commercialPermission === "mixed" || r.m.commercialPermission === "allow") && !r.m.replyGenericSocial, r.m);
}

const noCtxRefinements = ["tem um mais barato?", "sem iPhone", "quero mais bateria"];
for (const text of noCtxRefinements) {
  const r = await apiCall(text, { conversationId: `11b3-nctx-${text.slice(0, 8)}` });
  record(`no ctx: ${text}`, r.m.http200 && r.m.pricesCount === 0 && r.m.paidExternal === 0, r.m);
}

const convId = `11b3-refine-${Date.now()}`;
let session = {};
const refinementFlow = [
  "qual celular você recomenda até 3000?",
  "quero mais bateria",
  "sem iPhone",
  "tem um mais barato?",
];
for (const text of refinementFlow) {
  const r = await apiCall(text, { conversationId: convId, sessionContext: session });
  session = r.data?.session_context || session;
  record(`flow: ${text}`, r.m.http200 && r.m.replyLen > 20 && !r.m.replyGenericSocial, r.m);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\nResultado: ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
