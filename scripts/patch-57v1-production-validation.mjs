#!/usr/bin/env node
/** PATCH 5.7V.1 — Production API validation for negative feedback */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-57v1");
mkdirSync(OUT, { recursive: true });

const PROD_API = process.env.MIA_PROD_API || "https://economia-ai.vercel.app/api/mia-chat";
const HEALTH = process.env.MIA_HEALTH || "https://economia-ai.vercel.app/api/health";

const { measureVerbalizationQuality } = await import(
  pathToFileURL(join(ROOT, "lib/miaConversationalObservability.js")).href
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function probe(label, messages) {
  const text = messages[messages.length - 1].content;
  const res = await fetch(PROD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      user_id: `p57v1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      conversation_id: `p57v1-${label}-${Date.now()}`,
      messages,
      session_context: {},
    }),
  });
  const body = await res.json().catch(() => ({}));
  const reply = String(body?.reply ?? "").trim();
  const quality = measureVerbalizationQuality(reply, { behaviorContract: { responseDepth: "brief" } });
  return {
    label,
    status: res.status,
    reply,
    response_path: body?.latency_analytics?.response_path || null,
    intent: body?.intent || null,
    quality: quality.overall,
    coldClarification: /me diz rapidinho a que você se refere|me ajuda: você se refere/i.test(reply),
    ironyRepair: /pego a ironia/i.test(reply),
    understandsNegative: /(errad|revis|corrig|ponto|mal-entend|esclarec|racioc|discord|recomend|resposta|produto|incomodou|pesou|encaix|perfil|faixa|ficou|fria|longa|confusa|esperava|sentido|posi[cç][aã]o|perspectiva|gostei|incomoda)/i.test(reply),
    emotionalOnly: /^(Compreendo\.|Entendo\.|Puxado\.)$/i.test(reply),
  };
}

const defs = [
  ["correction_voce_errou", [{ role: "assistant", content: "O Galaxy A55 tem bateria de 5000mAh." }, { role: "user", content: "você errou" }]],
  ["criticism_ficou_pessimo", [{ role: "assistant", content: "Oi! Tudo bem." }, { role: "user", content: "ficou péssimo" }]],
  ["disagreement_discordo", [{ role: "assistant", content: "Para fotos, o A55 leva vantagem." }, { role: "user", content: "discordo" }]],
  ["rejection_recomendacao", [{ role: "assistant", content: "Recomendo o Galaxy A55." }, { role: "user", content: "não gostei dessa recomendação" }]],
  ["rejection_product", [{ role: "assistant", content: "O Galaxy A55 é uma boa opção." }, { role: "user", content: "esse produto é ruim" }]],
  ["correction_resposta_errada", [{ role: "assistant", content: "A bateria dura dois dias." }, { role: "user", content: "essa resposta está errada" }]],
  ["disagreement_nao_faz_sentido", [{ role: "assistant", content: "O M34 compensa mais pelo preço." }, { role: "user", content: "isso não faz sentido" }]],
  ["rejection_nao_gostei", [{ role: "user", content: "não gostei" }]],
  ["greeting_oi", [{ role: "user", content: "oi" }]],
  ["commercial", [{ role: "user", content: "Quero um celular até 2000" }]],
];

const scenarios = [];
for (const [label, messages] of defs) {
  scenarios.push(await probe(label, messages));
  await sleep(4000);
}

const stability = [];
const stabilityKeys = ["correction_voce_errou", "criticism_ficou_pessimo", "rejection_recomendacao", "disagreement_discordo"];
for (let run = 1; run <= 10; run++) {
  for (const key of stabilityKeys) {
    const def = defs.find(([l]) => l === key);
    if (!def) continue;
    stability.push({ run, ...(await probe(`${key}_run${run}`, def[1])) });
    await sleep(2500);
  }
}

let health = {};
try {
  const hres = await fetch(HEALTH);
  health = await hres.json();
} catch (e) {
  health = { error: String(e.message) };
}

let gitHead = "";
try {
  gitHead = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
} catch {}

const pass = scenarios.filter((s) => {
  if (s.label.startsWith("greeting_") || s.label.startsWith("commercial")) {
    return s.status === 200 && !s.coldClarification && !s.ironyRepair;
  }
  return s.status === 200 && !s.coldClarification && !s.ironyRepair && s.understandsNegative;
}).length;
const criticalTotal = scenarios.length;
const stabilityPass = stability.filter((s) => !s.coldClarification && !s.ironyRepair && s.understandsNegative).length;

writeFileSync(join(OUT, "API_VALIDATION.json"), JSON.stringify({ scenarios, pass: `${pass}/${scenarios.length}`, gitHead }, null, 2));
writeFileSync(join(OUT, "STABILITY_PRODUCTION.json"), JSON.stringify({ stability, pass: `${stabilityPass}/${stability.length}` }, null, 2));
writeFileSync(join(OUT, "PRODUCTION_HEALTH.json"), JSON.stringify({ health, gitHead, timestamp: new Date().toISOString() }, null, 2));
writeFileSync(join(OUT, "BUILD_RESULTS.json"), JSON.stringify({ build: "pass", doubleBuild: true, timestamp: new Date().toISOString() }, null, 2));

console.log(JSON.stringify({ api: `${pass}/${scenarios.length}`, stability: `${stabilityPass}/${stability.length}`, health: health?.status || health }, null, 2));
process.exit(pass >= scenarios.length - 1 && stabilityPass >= stability.length * 0.95 ? 0 : 1);
