#!/usr/bin/env node
/**
 * PATCH 5.7V.3 — Quick multiturn spotcheck (local or prod)
 * MIA_PROD_API=http://localhost:3000/api/mia-chat node scripts/patch-57v3-spotcheck.mjs
 */
const API = process.env.MIA_PROD_API || "https://economia-ai.vercel.app/api/mia-chat";
const DELAY = Number(process.env.MIA_AUDIT_DELAY_MS || 2000);

const CONVS = [
  {
    id: "SC-01",
    turns: ["quero celular", "compara A55 e M34", "discordo", "e a câmera?"],
  },
  {
    id: "SC-02",
    turns: ["celular até 2k", "compara A55 e M34", "gostei do primeiro", "e o outro?"],
  },
  {
    id: "SC-03",
    turns: ["A55 ou M34?", "discordo", "e o outro?", "qual deles?"],
  },
];

const COLD = /me ajuda:\s*voc[eê] se refere/i;

async function call(message, history, sessionId) {
  await new Promise((r) => setTimeout(r, DELAY));
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      user_id: sessionId,
      conversation_id: sessionId,
      messages: history,
    }),
  });
  const data = await res.json();
  return { status: res.status, reply: data.reply || data.message || "", path: data.response_path || data.responsePath || "" };
}

async function runConv(conv) {
  const sessionId = `spot-${conv.id}-${Date.now()}`;
  const history = [];
  const results = [];
  for (const msg of conv.turns) {
    const r = await call(msg, history, sessionId);
    history.push({ role: "user", content: msg });
    if (r.reply) history.push({ role: "assistant", content: r.reply });
    const cold = COLD.test(r.reply);
    results.push({ msg, cold, reply: r.reply.slice(0, 120), path: r.path });
    if (cold) return { conv, fail: true, results };
  }
  return { conv, fail: false, results };
}

let fails = 0;
console.log(`Spotcheck API: ${API}\n`);
for (const conv of CONVS) {
  const out = await runConv(conv);
  const last = out.results[out.results.length - 1];
  if (out.fail) {
    fails++;
    console.log(`✗ ${conv.id} COLD at "${last.msg}": ${last.reply}`);
  } else {
    console.log(`✓ ${conv.id} last="${last.msg}" path=${last.path}`);
  }
}
console.log(`\n${fails} failures / ${CONVS.length} conversations`);
process.exit(fails ? 1 : 0);
