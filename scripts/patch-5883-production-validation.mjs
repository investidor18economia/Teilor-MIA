#!/usr/bin/env node
/**
 * PATCH 5.8.8.3 — Directed production validation (588V.2 blockers)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-5883");
const PROD = "https://economia-ai.vercel.app";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BARE_COLD = /^(de\s+nada\.?!?|por\s+nada\.?!?|disponha\.?!?|claro\.?|entendi\.?)$/i;
const IDENTITY = /\b(mia|teilor|assistente|compras|intelig)/i;
const STAY_SOCIAL = /\b(fico por aqui|o que voce quer conversar)\b/i;
const WARMTH = /\b(feliz|imagina|contente|ajud|gentil|obrigad|disponha|tamo|junto|você|contigo|entendo|compreendo|hehe|boa|curios|conta|mia|teilor)\b/i;

const SCENARIOS = [
  { id: "GRAT-01", msg: "valeu", expect: "gratitude" },
  { id: "GRAT-02", msg: "obrigado", expect: "gratitude" },
  { id: "GRAT-03", msg: "obrigada", expect: "gratitude" },
  { id: "GRAT-04", msg: "brigadão", expect: "gratitude" },
  { id: "GRAT-05", msg: "vlw", expect: "gratitude" },
  { id: "GRAT-06", msg: "thanks", expect: "gratitude" },
  { id: "GRAT-07", msg: "thanks 😊", expect: "gratitude" },
  { id: "F-15", msg: "você guarda meus dados?", expect: "identity" },
  { id: "F-18", msg: "você pode trocar de modelo?", expect: "identity" },
  { id: "F-25", msg: "você finge ser humana?", expect: "identity" },
  { id: "F-01", msg: "quem é você?", expect: "identity" },
  { id: "F-07", msg: "qual modelo você usa?", expect: "identity" },
  { id: "B-01", msg: "oi", expect: "warmth" },
  { id: "B-02", msg: "e você?", expect: "warmth" },
  { id: "B-03", msg: "tchau", expect: "warmth" },
  { id: "B-04", msg: "to meio down", expect: "warmth" },
  { id: "B-05", msg: "consegui!", expect: "warmth" },
  { id: "C-01", msg: "acredita?", expect: "warmth" },
  { id: "C-02", msg: "tenho uma novidade", expect: "warmth" },
  { id: "H-01", msg: "kkk", expect: "warmth" },
];

const GRATITUDE_STABILITY = ["valeu", "obrigado", "brigadão", "vlw", "thanks"];

async function probeChat(msg, sid) {
  const res = await fetch(`${PROD}/api/mia-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: msg, user_id: sid, conversation_id: sid, messages: [] }),
  });
  const body = await res.json().catch(async () => ({ raw: await res.text() }));
  const reply = String(body.response || body.reply || "").trim();
  return { status: res.status, reply, reasonCode: body.reasonCode || null };
}

function score(s, reply, status) {
  if (status >= 500 || /Não consegui concluir/i.test(reply)) return { pass: false, reason: "core_error" };
  if (s.expect === "identity") {
    if (!IDENTITY.test(reply)) return { pass: false, reason: "missing_identity" };
    if (STAY_SOCIAL.test(reply)) return { pass: false, reason: "stay_social_bleed" };
    return { pass: true };
  }
  if (s.expect === "gratitude") {
    if (BARE_COLD.test(reply)) return { pass: false, reason: "bare_cold_gratitude" };
    if (!WARMTH.test(reply) && reply.length < 12) return { pass: false, reason: "low_warmth" };
    return { pass: true };
  }
  if (BARE_COLD.test(reply)) return { pass: false, reason: "bare_cold" };
  if (!WARMTH.test(reply) && reply.length < 8) return { pass: false, reason: "low_warmth" };
  return { pass: true };
}

async function main() {
  let health = {};
  try {
    const h = await fetch(`${PROD}/api/health`);
    health = await h.json();
  } catch (e) {
    health = { error: String(e) };
  }

  const results = [];
  for (const s of SCENARIOS) {
    const sid = `5883-${s.id}-${Date.now()}`;
    const r = await probeChat(s.msg, sid);
    const sc = score(s, r.reply, r.status);
    results.push({ ...s, ...r, ...sc });
    await sleep(5500);
  }

  const stability = [];
  for (let i = 0; i < 5; i++) {
    for (const msg of GRATITUDE_STABILITY) {
      const sid = `5883-stab-${msg}-${i}-${Date.now()}`;
      const r = await probeChat(msg, sid);
      const sc = score({ expect: "gratitude" }, r.reply, r.status);
      stability.push({ msg, rep: i + 1, ...r, ...sc });
      await sleep(4500);
    }
  }

  const failures = [...results.filter((r) => !r.pass), ...stability.filter((r) => !r.pass)];
  const summary = {
    patch: "5.8.8.3",
    build: health.gitCommit || health.buildId || null,
    experienceVersion: health.experienceVersion || null,
    scenariosPass: results.filter((r) => r.pass).length,
    scenariosTotal: results.length,
    stabilityPass: stability.filter((r) => r.pass).length,
    stabilityTotal: stability.length,
    failures: failures.length,
    approved: failures.length === 0,
  };

  writeFileSync(join(OUT, "PRODUCTION_API_RESULTS.json"), JSON.stringify({ summary, results, stability, health }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.approved ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
