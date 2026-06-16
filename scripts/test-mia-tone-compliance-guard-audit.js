/**
 * PATCH 8.0B.3 — Tone Compliance Guard Audit
 *
 * Usage: node scripts/test-mia-tone-compliance-guard-audit.js
 */

import { deriveConversationalToneProfile } from "../lib/miaConversationalTone.js";
import {
  TONE_PROFILES,
  applyToneComplianceGuard,
  detectStyleLeaks,
} from "../lib/miaToneComplianceGuard.js";

function c(id, toneKey, input, opts = {}) {
  return { id, toneKey, input, ...opts };
}

const PROFILE_MESSAGES = {
  [TONE_PROFILES.FORMAL_POLITE]: "Gostaria de saber se vale a pena.",
  [TONE_PROFILES.INFORMAL_LIGHT]: "vc acha q vale?",
  [TONE_PROFILES.INFORMAL_HIGH]: "koe mano, esse presta?",
  [TONE_PROFILES.TECHNICAL]: "tecnicamente, qual o melhor?",
  [TONE_PROFILES.LAYPERSON]: "sou leigo, me explica simples",
  [TONE_PROFILES.ANXIOUS_ANTI_REGRET]: "tenho medo de errar",
  [TONE_PROFILES.IRRITATED]: "crl, caro demais",
  [TONE_PROFILES.RUSHED]: "sem enrolar, vale?",
  [TONE_PROFILES.NEUTRAL_DEFAULT]: "qual notebook compensa?",
};

function makeTone(toneKey) {
  const msg = PROFILE_MESSAGES[toneKey] || "teste";
  return deriveConversationalToneProfile({
    originalMessage: msg,
    normalizedMessage: msg,
  });
}

const LEAKY_CASES = [
  // FORMAL
  c("F1", TONE_PROFILES.FORMAL_POLITE, "blz, vale analisar preco e tradeoff"),
  c("F2", TONE_PROFILES.FORMAL_POLITE, "vlw, compare preco e bateria"),
  c("F3", TONE_PROFILES.FORMAL_POLITE, "mano, o tradeoff principal e preco"),
  c("F4", TONE_PROFILES.FORMAL_POLITE, "cara, vale analisar riscos"),
  c("F5", TONE_PROFILES.FORMAL_POLITE, "kkkk vale sim, olhe preco"),
  c("F6", TONE_PROFILES.FORMAL_POLITE, "tmj, faz sentido pelo tradeoff"),
  c("F7", TONE_PROFILES.FORMAL_POLITE, "show, compare preco e bateria"),
  c("F8", TONE_PROFILES.FORMAL_POLITE, "Por favor, blz, olhe tradeoff e risco"),

  // INFORMAL_LIGHT
  c("IL1", TONE_PROFILES.INFORMAL_LIGHT, "Coe parça slk vale sim kkkk"),
  c("IL2", TONE_PROFILES.INFORMAL_LIGHT, "Crl mano, vale analisar preco"),
  c("IL3", TONE_PROFILES.INFORMAL_LIGHT, "Presta sim slk demais, olhe tradeoff"),
  c("IL4", TONE_PROFILES.INFORMAL_LIGHT, "Vale sim parça, compare preco"),
  c("IL5", TONE_PROFILES.INFORMAL_LIGHT, "Brabo demais slk, mas olhe risco"),
  c("IL6", TONE_PROFILES.INFORMAL_LIGHT, "Seloko, compensa se preco alinhar"),
  c("IL7", TONE_PROFILES.INFORMAL_LIGHT, "Top demais slk kkkk, vale com cuidado"),
  c("IL8", TONE_PROFILES.INFORMAL_LIGHT, "Pqp caro, mas tradeoff pode valer"),

  // INFORMAL_HIGH
  c("IH1", TONE_PROFILES.INFORMAL_HIGH, "Presta sim mano slk kkkk, olhe preco"),
  c("IH2", TONE_PROFILES.INFORMAL_HIGH, "Coe parça, vale analisar tradeoff"),
  c("IH3", TONE_PROFILES.INFORMAL_HIGH, "Seloko, olhe preco e bateria"),
  c("IH4", TONE_PROFILES.INFORMAL_HIGH, "Fi, compensa pelo tradeoff"),
  c("IH5", TONE_PROFILES.INFORMAL_HIGH, "Truta, vale analisar riscos"),
  c("IH6", TONE_PROFILES.INFORMAL_HIGH, "Mano, presta mas olhe tradeoff"),
  c("IH7", TONE_PROFILES.INFORMAL_HIGH, "Slk vale sim, compare preco"),
  c("IH8", TONE_PROFILES.INFORMAL_HIGH, "Crl, olhe preco e risco"),

  // TECHNICAL
  c("T1", TONE_PROFILES.TECHNICAL, "Entendo sua preocupacao, benchmark indica ganho"),
  c("T2", TONE_PROFILES.TECHNICAL, "Fica tranquilo, latencia baixa e IPC alto"),
  c("T3", TONE_PROFILES.TECHNICAL, "Sem stress kkkk, TDP aceitavel"),
  c("T4", TONE_PROFILES.TECHNICAL, "Relaxa, benchmark e latencia importam"),
  c("T5", TONE_PROFILES.TECHNICAL, "Entendo sua preocupacao kkkk, olhe benchmark"),
  c("T6", TONE_PROFILES.TECHNICAL, "Fica tranquilo, throughput e latencia"),
  c("T7", TONE_PROFILES.TECHNICAL, "Sem stress, compare benchmark e preco"),
  c("T8", TONE_PROFILES.TECHNICAL, "Relaxa rsrs, IPC pesa no veredito"),

  // LAYPERSON
  c("L1", TONE_PROFILES.LAYPERSON, "Simples: benchmark alto e latencia baixa"),
  c("L2", TONE_PROFILES.LAYPERSON, "O throttling reduz desempenho no dia a dia"),
  c("L3", TONE_PROFILES.LAYPERSON, "IPC e TDP importam aqui"),
  c("L4", TONE_PROFILES.LAYPERSON, "NVMe ajuda no boot"),
  c("L5", TONE_PROFILES.LAYPERSON, "Chipset define boa parte do desempenho"),
  c("L6", TONE_PROFILES.LAYPERSON, "Benchmark alto nao garante valor"),
  c("L7", TONE_PROFILES.LAYPERSON, "Latencia baixa ajuda, mas olhe preco"),
  c("L8", TONE_PROFILES.LAYPERSON, "Throttling pode incomodar no uso real"),

  // ANXIOUS
  c("A1", TONE_PROFILES.ANXIOUS_ANTI_REGRET, "Desastre total, nunca compre"),
  c("A2", TONE_PROFILES.ANXIOUS_ANTI_REGRET, "Catastrofe, fuja desse modelo"),
  c("A3", TONE_PROFILES.ANXIOUS_ANTI_REGRET, "Crl, nao va nessa kkkk"),
  c("A4", TONE_PROFILES.ANXIOUS_ANTI_REGRET, "Horrivel, desastre, fuja"),
  c("A5", TONE_PROFILES.ANXIOUS_ANTI_REGRET, "Nunca compre, catastrofe total"),
  c("A6", TONE_PROFILES.ANXIOUS_ANTI_REGRET, "Pqp, fuja e nunca compre"),
  c("A7", TONE_PROFILES.ANXIOUS_ANTI_REGRET, "Desastre kkkk, fuja"),
  c("A8", TONE_PROFILES.ANXIOUS_ANTI_REGRET, "Catastrofe, nunca compre isso"),

  // IRRITATED
  c("I1", TONE_PROFILES.IRRITATED, "Crl mano, ta caro pra krl"),
  c("I2", TONE_PROFILES.IRRITATED, "Pqp, caro demais"),
  c("I3", TONE_PROFILES.IRRITATED, "Carai, olhe tradeoff de preco"),
  c("I4", TONE_PROFILES.IRRITATED, "Calma ai, vc que pediu"),
  c("I5", TONE_PROFILES.IRRITATED, "Puto ou nao, crl, olhe preco"),
  c("I6", TONE_PROFILES.IRRITATED, "Merda de preco, mas tradeoff existe"),
  c("I7", TONE_PROFILES.IRRITATED, "Krl vale? mano kkkk"),
  c("I8", TONE_PROFILES.IRRITATED, "Pqp nao curti, carai"),

  // RUSHED
  c("R1", TONE_PROFILES.RUSHED, "Resumo: vale se preco alinhar kkkk"),
  c("R2", TONE_PROFILES.RUSHED, "Direto: rsrs tradeoff e preco"),
  c("R3", TONE_PROFILES.RUSHED, "Curto: hahaha olhe preco"),
  c("R4", TONE_PROFILES.RUSHED, "Como eu ja disse, vale"),
  c("R5", TONE_PROFILES.RUSHED, "Rapido: kkkk compare tradeoff"),
  c("R6", TONE_PROFILES.RUSHED, "Sem enrolar rsrs, preco manda"),
  c("R7", TONE_PROFILES.RUSHED, "Objetivo kkkk: vale com ressalvas"),
  c("R8", TONE_PROFILES.RUSHED, "Resposta curta hehe: olhe risco"),

  // NEUTRAL
  c("N1", TONE_PROFILES.NEUTRAL_DEFAULT, "Crl mano slk vale"),
  c("N2", TONE_PROFILES.NEUTRAL_DEFAULT, "Parça, compensa pelo tradeoff"),
  c("N3", TONE_PROFILES.NEUTRAL_DEFAULT, "Seloko caro demais kkkk"),
  c("N4", TONE_PROFILES.NEUTRAL_DEFAULT, "Slk, olhe preco e tradeoff"),
  c("N5", TONE_PROFILES.NEUTRAL_DEFAULT, "Pqp caro, mas compare riscos"),
  c("N6", TONE_PROFILES.NEUTRAL_DEFAULT, "Mano, vale analisar tradeoff"),
  c("N7", TONE_PROFILES.NEUTRAL_DEFAULT, "Kkkk slk, olhe preco"),
  c("N8", TONE_PROFILES.NEUTRAL_DEFAULT, "Carai, compare preco e bateria"),
];

const GOOD_CASES = [
  c("G1", TONE_PROFILES.FORMAL_POLITE, "Vale analisar com calma. Compare preco, bateria e durabilidade."),
  c("G2", TONE_PROFILES.INFORMAL_LIGHT, "Vale considerar sim, mas olhe preco e pontos fracos."),
  c("G3", TONE_PROFILES.INFORMAL_HIGH, "Presta, mas nao e compra cega. Olhe preco e bateria."),
  c("G4", TONE_PROFILES.TECHNICAL, "Pelo desempenho bruto e latencia, compete bem, mas preco manda."),
  c("G5", TONE_PROFILES.LAYPERSON, "Simples: vale se estiver em bom preco. Cuidado com concorrentes."),
  c("G6", TONE_PROFILES.ANXIOUS_ANTI_REGRET, "Entendo a preocupacao. So siga se preco e uso fizerem sentido."),
  c("G7", TONE_PROFILES.IRRITATED, "Esta puxado mesmo. Nesse preco, so se houver diferencial claro."),
  c("G8", TONE_PROFILES.RUSHED, "Resumo: vale se preco estiver alinhado ao que voce precisa."),
  c("G9", TONE_PROFILES.NEUTRAL_DEFAULT, "Vale analisar preco e tradeoffs antes de decidir."),
  c("G10", TONE_PROFILES.TECHNICAL, "Benchmark e latencia ajudam, mas veredito depende do preco."),
];

const VARIANTS = [
  c("V1", TONE_PROFILES.FORMAL_POLITE, "blz vlw mano kkk compare preco"),
  c("V2", TONE_PROFILES.INFORMAL_HIGH, "coe parça slk rsrs olhe tradeoff"),
  c("V3", TONE_PROFILES.LAYPERSON, "benchmark throttling ipc nvme chipset"),
  c("V4", TONE_PROFILES.ANXIOUS_ANTI_REGRET, "desastre catastrofe fuja nunca compre"),
  c("V5", TONE_PROFILES.IRRITATED, "crl pqp carai puto merda"),
  c("V6", TONE_PROFILES.TECHNICAL, "entendo sua preocupacao fica tranquilo relaxa"),
  c("V7", TONE_PROFILES.RUSHED, "kkkk rsrs hehe resumo direto"),
  c("V8", TONE_PROFILES.NEUTRAL_DEFAULT, "parça slk seloko mano kkkk"),
  c("V9", TONE_PROFILES.FORMAL_POLITE, "Gostaria de saber, blz? vlw tmj"),
  c("V10", TONE_PROFILES.INFORMAL_LIGHT, "truta fi slk coe kkkk"),
];

const CASES = [...LEAKY_CASES, ...GOOD_CASES, ...VARIANTS];

function normalizeForCheck(text = "") {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasBannedLeak(text = "") {
  const lower = normalizeForCheck(text);
  return /\b(parca|parça|slk|seloko|coe|crl|krl|pqp|caralho|porra|kkkk|mano)\b/.test(lower);
}

function evaluateCase(spec) {
  const toneProfile = makeTone(spec.toneKey);
  const isGood = spec.id.startsWith("G");
  const beforeLeaks = detectStyleLeaks({ response: spec.input, toneProfile });
  const guard = applyToneComplianceGuard({ response: spec.input, toneProfile });
  const afterLeaks = detectStyleLeaks({ response: guard.response, toneProfile });
  const failures = [];

  if (isGood) {
    if (guard.corrected) failures.push("good_sample_modified");
    if (afterLeaks.length) failures.push(`good_leak=${afterLeaks.join(",")}`);
    return { ok: failures.length === 0, failures, beforeLeaks, afterLeaks, guard };
  }

  if (beforeLeaks.length === 0) failures.push("not_leaky_input");
  if (afterLeaks.length) failures.push(`remaining=${afterLeaks.join(",")}`);
  if (hasBannedLeak(guard.response) && spec.toneKey !== TONE_PROFILES.INFORMAL_LIGHT) {
    failures.push("banned_style_remaining");
  }

  const originalNorm = normalizeForCheck(spec.input);
  const outputNorm = normalizeForCheck(guard.response);
  const decisionTokens = ["preco", "tradeoff", "risco", "bateria", "vale", "compensa", "veredito"];
  const originalHasDecision = decisionTokens.some((t) => originalNorm.includes(t));
  const outputHasDecision = decisionTokens.some((t) => outputNorm.includes(t));
  if (originalHasDecision && !outputHasDecision) failures.push("decision_content_lost");

  return { ok: failures.length === 0, failures, beforeLeaks, afterLeaks, guard };
}

console.log("PATCH 8.0B.3 — Tone Compliance Guard Audit\n");
console.log(`Cenários: ${CASES.length}\n`);

let pass = 0;
let fail = 0;
let leaksBefore = 0;
let leaksAfter = 0;

for (const spec of CASES) {
  const result = evaluateCase(spec);
  leaksBefore += result.beforeLeaks.length;
  leaksAfter += result.afterLeaks.length;

  if (result.ok) {
    pass += 1;
    console.log(`✓ [${spec.id}] before=${result.beforeLeaks.length} after=${result.afterLeaks.length}`);
  } else {
    fail += 1;
    console.log(`✗ [${spec.id}] ${result.failures.join("; ")} | before=${result.beforeLeaks.length} after=${result.afterLeaks.length}`);
  }
}

const total = pass + fail;
const rate = ((pass / total) * 100).toFixed(1);
console.log(`\nResultado: ${pass}/${total} (${rate}%)`);
console.log(`Style leaks antes do guard: ${leaksBefore}`);
console.log(`Style leaks depois do guard: ${leaksAfter}`);

const verdict =
  pass / total >= 0.95 && leaksAfter === 0
    ? "A) TONE COMPLIANCE GUARD ROBUST"
    : "B) TONE COMPLIANCE GUARD POSSUI GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(pass / total >= 0.95 && leaksAfter === 0 ? 0 : 1);
