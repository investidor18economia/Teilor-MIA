#!/usr/bin/env node
/**
 * PATCH 6.4 — clean-session reproduction for manual UI bug investigation.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASE = process.env.PATCH64_PROD_BASE_URL || "https://economia-ai.vercel.app";

const CASES = [
  {
    id: "clean_tv",
    text: "Quero uma televisão de 55 polegadas.",
    emptySession: true,
  },
  {
    id: "clean_iphone",
    text: "Quero um iPhone até R$ 4.000.",
    emptySession: true,
  },
  {
    id: "contaminated_tv_after_iphone",
    text: "Quero uma televisão de 55 polegadas.",
    emptySession: false,
    preSession: {
      lastQuery: "Quero um iPhone até R$ 4.000.",
      lastCategory: "phone",
      lastBestProduct: {
        product_name: "Samsung Galaxy S23 FE",
        price: "R$ 3.416,15",
        source: "serpapi",
      },
      lastProducts: [
        { product_name: "Samsung Galaxy S23 FE", price: "R$ 3.416,15" },
      ],
      lastInteractionType: "search",
    },
  },
];

async function postChat({ text, sessionContext = {} }) {
  const sessionId = randomUUID();
  const visitorId = randomUUID();
  const conversationId = randomUUID();
  const res = await fetch(`${BASE}/api/mia-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      user_id: "guest",
      conversation_id: conversationId,
      analytics_context: {
        session_id: sessionId,
        visitor_id: visitorId,
        conversation_id: conversationId,
      },
      session_context: sessionContext,
      messages: [],
    }),
  });
  const json = await res.json();
  return {
    status: res.status,
    sessionId,
    conversationId,
    replyPreview: String(json.reply || "").slice(0, 200),
    winner: json.prices?.[0]?.product_name || null,
    winnerSource: json.prices?.[0]?.source || null,
    pricesCount: Array.isArray(json.prices) ? json.prices.length : 0,
    analytics: json.data_layer_usage_analytics || null,
    sessionAfter: json.session_context || null,
  };
}

console.log("\nPATCH 6.4 — clean session reproduction\n");
const results = [];

for (const testCase of CASES) {
  const out = await postChat({
    text: testCase.text,
    sessionContext: testCase.emptySession ? {} : testCase.preSession || {},
  });
  results.push({ ...testCase, ...out });
  console.log(JSON.stringify({ id: testCase.id, winner: out.winner, analytics: out.analytics, replyPreview: out.replyPreview }, null, 2));
  await new Promise((r) => setTimeout(r, 3000));
}

console.log("\nSUMMARY");
for (const r of results) {
  const isNotebook = /notebook|hp 256/i.test(String(r.winner || "") + r.replyPreview);
  const isTv = /tv|televis/i.test(String(r.winner || "") + r.replyPreview);
  const isSamsung = /samsung/i.test(String(r.winner || ""));
  const isIphone = /iphone/i.test(String(r.winner || ""));
  console.log(`${r.id}: winner=${r.winner} notebook=${isNotebook} tv=${isTv} samsung=${isSamsung} iphone=${isIphone}`);
}
