#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { recognizeMiaIntent } from "../lib/miaIntentRecognitionLayer.js";
import { classifyMiaTurn } from "../lib/miaCognitiveRouter.js";

const BASE = process.env.PATCH4A2VF_LOCAL_BASE || "http://localhost:3001";

async function chat(text, session = {}, conv = randomUUID(), messages = []) {
  const nextMessages = [...messages, { role: "user", content: text }];
  const res = await fetch(`${BASE}/api/mia-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      messages: nextMessages,
      session_context: session,
      conversation_id: conv,
    }),
  });
  const json = await res.json();
  return { status: res.status, json, messages: nextMessages };
}

function logIntent(label, message, session) {
  const hasActiveAnchor = !!session?.lastBestProduct?.product_name;
  const turn = classifyMiaTurn({ query: message, hasActiveAnchor, sessionContext: session });
  const intent = recognizeMiaIntent({ userMessage: message, sessionContext: session, cognitiveTurn: turn, hasActiveAnchor });
  console.log(label, "mode", intent.interactionMode, "reasons", intent.reasons, "anchor", session?.lastBestProduct?.product_name);
}

const conv = randomUUID();
let session = {};
let messages = [];
let r = await chat("Quero um celular Samsung até 3 mil.", session, conv, messages);
session = r.json.session_context || {};
messages = r.messages;
console.log("T1 winner", session.lastBestProduct?.product_name);
logIntent("T2 intent", "bateria é minha prioridade", session);
r = await chat("bateria é minha prioridade", session, conv, messages);
console.log("S2 reply", r.json.reply?.slice(0, 300));

const conv2 = randomUUID();
session = {};
messages = [];
r = await chat("Quero um celular até 2.500.", session, conv2, messages);
session = r.json.session_context || {};
messages = r.messages;
console.log("\nT1b winner", session.lastBestProduct?.product_name);
logIntent("T2b intent", "o Galaxy A55 vale a pena?", session);
r = await chat("o Galaxy A55 vale a pena?", session, conv2, messages);
console.log("S4 reply", r.json.reply?.slice(0, 300));
console.log("S4 winner", r.json.session_context?.lastBestProduct?.product_name);

const conv3 = randomUUID();
r = await chat("o Galaxy A55 vale a pena?", {}, conv3, []);
console.log("\nS4 standalone reply", r.json.reply?.slice(0, 350));
console.log("S4 standalone winner", r.json.session_context?.lastBestProduct?.product_name);
