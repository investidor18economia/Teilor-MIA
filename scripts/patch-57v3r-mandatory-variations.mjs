#!/usr/bin/env node
/** Mandatory phrase variations — one per context, production API */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v3r");
const API = "https://economia-ai.vercel.app/api/mia-chat";
const DELAY = 3200;

const CONTEXTS = [
  ["quero celular", "compara A55 e M34", "discordo"],
  ["oi", "celular até 2k", "gostei do primeiro"],
  ["A55 ou M34?", "discordo", "não faz sentido"],
  ["oi", "to precisando de um celular", "até 2000", "me recomenda"],
  ["tô ansioso", "quero celular confiável", "compara opções"],
];

const PHRASES = [
  "e o outro?", "e a câmera?", "e esse?", "e ele?", "e aquele?", "qual deles?",
  "o segundo", "o primeiro", "esse vale mais?", "o outro compensa?", "esse é melhor?",
  "qual você escolheria?", "qual vale mais?", "qual dura mais?", "e a bateria?",
  "e desempenho?", "e fotos?", "e tela?", "e construção?", "e carregamento?",
  "e jogos?", "e vídeos?", "e autonomia?", "e resistência?", "e acabamento?",
  "e o processador?", "e memória?", "e armazenamento?", "e preço?",
];

const cold = (r) => /me ajuda: você se refere/i.test(r);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function replay(turns, sid) {
  const history = [];
  let last = {};
  for (const msg of turns) {
    await sleep(DELAY);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg, user_id: sid, conversation_id: sid, messages: history }),
    });
    const body = await res.json().catch(() => ({}));
    last = { reply: body.reply || "", status: res.status };
    history.push({ role: "user", content: msg });
    if (last.reply) history.push({ role: "assistant", content: last.reply });
  }
  return last;
}

const results = [];
let idx = 0;
for (let c = 0; c < CONTEXTS.length; c++) {
  for (const phrase of PHRASES) {
    idx++;
    const turns = [...CONTEXTS[c], phrase];
    const last = await replay(turns, `mv-${c}-${idx}`);
    const pass = !!last.reply && !cold(last.reply);
    results.push({ id: `MV-${idx}`, context: c, phrase, pass, cold: cold(last.reply), reply: last.reply.slice(0, 120) });
    if (idx % 10 === 0) console.log(`[${idx}/${CONTEXTS.length * PHRASES.length}] pass=${results.filter(r=>r.pass).length}`);
  }
}
const out = { total: results.length, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results };
writeFileSync(join(OUT, "MANDATORY_VARIATIONS.json"), JSON.stringify(out, null, 2));
console.log(`Done: ${out.passed}/${out.total} passed`);
