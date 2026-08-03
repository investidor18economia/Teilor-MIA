#!/usr/bin/env node
/** Retest MT-0098 turn 22 only */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD_API = "https://economia-ai.vercel.app/api/mia-chat";
const catalog = JSON.parse(readFileSync(join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-58/SCENARIO_CATALOG.json"), "utf8"));
const conv = catalog.multiturn.find((c) => c.id === "MT-0098");
const cold = (r) => /me ajuda: você se refere|me diz rapidinho a que você se refere/i.test(r);

async function call(message, history, sid) {
  await new Promise((r) => setTimeout(r, 6000));
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, user_id: sid, conversation_id: sid, messages: history }),
  });
  const body = await res.json().catch(() => ({}));
  return { reply: String(body?.reply || "").trim(), status: res.status };
}

const history = [];
const sid = `581-retest-MT-0098-${Date.now()}`;
for (let i = 0; i < conv.userTurns.length; i += 1) {
  const msg = conv.userTurns[i];
  const out = await call(msg, history, `${sid}-${i}`);
  history.push({ role: "user", content: msg });
  if (out.reply) history.push({ role: "assistant", content: out.reply });
  if (i === conv.userTurns.length - 1) {
    const pass = !!out.reply && !cold(out.reply);
    console.log(`MT-0098 t${i + 1} "${msg}": ${pass ? "PASS" : "FAIL"}`);
    console.log(out.reply.slice(0, 200));
    writeFileSync(
      join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-581/MT-0098_T22_RETEST.json"),
      JSON.stringify({ turn: i + 1, message: msg, pass, reply: out.reply, coldClarification: cold(out.reply) }, null, 2)
    );
  }
}
