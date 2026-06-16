/**
 * PATCH 8.0B.2 — Conversational Tone Adaptation Variants (Regra 18)
 *
 * Usage: node scripts/test-mia-conversational-tone-adaptation-variants.js
 */

import { normalizeCompoundInput } from "../lib/miaCompoundInputNormalizer.js";
import {
  TONE_PROFILES,
  deriveConversationalToneProfile,
  buildToneAdaptationPromptSection,
  validateResponseStyleAgainstTone,
} from "../lib/miaConversationalTone.js";
import { buildMiaPromptByRole } from "../lib/miaPrompt.js";

function v(persona, input, expectedTone, opts = {}) {
  return { persona, input, expectedTone, ...opts };
}

const VARIANTS = [
  // formal (8)
  v("formal", "Gostaria de saber se esse modelo vale a pena.", TONE_PROFILES.FORMAL_POLITE),
  v("formal", "Por favor, poderia me orientar sobre essa compra?", TONE_PROFILES.FORMAL_POLITE),
  v("formal", "Tenho uma dúvida sobre essa recomendação.", TONE_PROFILES.FORMAL_POLITE),
  v("formal", "Bom dia, gostaria de entender se compensa.", TONE_PROFILES.FORMAL_POLITE),
  v("formal", "Solicito uma orientação sobre esse produto.", TONE_PROFILES.FORMAL_POLITE),
  v("formal", "Prezado, poderia explicar melhor?", TONE_PROFILES.FORMAL_POLITE),
  v("formal", "Cordialmente, preciso decidir com segurança.", TONE_PROFILES.FORMAL_POLITE),
  v("formal", "Por favor, gostaria de saber se vale a pena.", TONE_PROFILES.FORMAL_POLITE),

  // informal_leve (8)
  v("informal_leve", "blz", TONE_PROFILES.INFORMAL_LIGHT),
  v("informal_leve", "vlw mia", TONE_PROFILES.INFORMAL_LIGHT),
  v("informal_leve", "fala ai", TONE_PROFILES.INFORMAL_LIGHT),
  v("informal_leve", "qual a boa", TONE_PROFILES.INFORMAL_LIGHT),
  v("informal_leve", "vc acha q vale msm?", TONE_PROFILES.INFORMAL_LIGHT),
  v("informal_leve", "demorou", TONE_PROFILES.INFORMAL_LIGHT),
  v("informal_leve", "q fita", TONE_PROFILES.INFORMAL_LIGHT),
  v("informal_leve", "sla se compensa", TONE_PROFILES.INFORMAL_LIGHT),

  // informal_alto (8)
  v("informal_alto", "koe mano, esse ai presta?", TONE_PROFILES.INFORMAL_HIGH),
  v("informal_alto", "slk esse preço ta pesado", TONE_PROFILES.INFORMAL_HIGH),
  v("informal_alto", "q fita esse notbook?", TONE_PROFILES.INFORMAL_HIGH),
  v("informal_alto", "seloko caro demais", TONE_PROFILES.INFORMAL_HIGH),
  v("informal_alto", "ce loko esse preço", TONE_PROFILES.INFORMAL_HIGH),
  v("informal_alto", "vish caro demais", TONE_PROFILES.INFORMAL_HIGH),
  v("informal_alto", "oxe caro", TONE_PROFILES.INFORMAL_HIGH),
  v("informal_alto", "doidera esse preço", TONE_PROFILES.INFORMAL_HIGH),

  // tecnico (8)
  v("tecnico", "tecnicamente, qual o melhor?", TONE_PROFILES.TECHNICAL),
  v("tecnico", "em desempenho bruto, vale?", TONE_PROFILES.TECHNICAL),
  v("tecnico", "benchmark desse notebook", TONE_PROFILES.TECHNICAL),
  v("tecnico", "latencia do monitor importa?", TONE_PROFILES.TECHNICAL),
  v("tecnico", "chipset faz diferença?", TONE_PROFILES.TECHNICAL),
  v("tecnico", "fps no jogo", TONE_PROFILES.TECHNICAL),
  v("tecnico", "nvme ou ssd comum?", TONE_PROFILES.TECHNICAL),
  v("tecnico", "ips 144hz vale?", TONE_PROFILES.TECHNICAL),

  // leigo (8)
  v("leigo", "sou leigo nisso", TONE_PROFILES.LAYPERSON),
  v("leigo", "nao entendo disso", TONE_PROFILES.LAYPERSON),
  v("leigo", "nao manjo de tecnologia", TONE_PROFILES.LAYPERSON),
  v("leigo", "nao sei nada de notebook", TONE_PROFILES.LAYPERSON),
  v("leigo", "me explica simples", TONE_PROFILES.LAYPERSON),
  v("leigo", "explica facil", TONE_PROFILES.LAYPERSON),
  v("leigo", "zero conhecimento aqui", TONE_PROFILES.LAYPERSON),
  v("leigo", "sou leigo, vale?", TONE_PROFILES.LAYPERSON),

  // ansioso (8)
  v("ansioso", "tenho medo de errar", TONE_PROFILES.ANXIOUS_ANTI_REGRET),
  v("ansioso", "nao quero me arrepender", TONE_PROFILES.ANXIOUS_ANTI_REGRET),
  v("ansioso", "nao quero dor de cabeca", TONE_PROFILES.ANXIOUS_ANTI_REGRET),
  v("ansioso", "to com receio", TONE_PROFILES.ANXIOUS_ANTI_REGRET),
  v("ansioso", "nao quero errar nessa compra", TONE_PROFILES.ANXIOUS_ANTI_REGRET),
  v("ansioso", "poço comprar sem medo?", TONE_PROFILES.ANXIOUS_ANTI_REGRET),
  v("ansioso", "quero evitar arrependimento", TONE_PROFILES.ANXIOUS_ANTI_REGRET),
  v("ansioso", "escolha tranquila", TONE_PROFILES.ANXIOUS_ANTI_REGRET),

  // apressado (8)
  v("apressado", "me responde curto", TONE_PROFILES.RUSHED),
  v("apressado", "sem enrolar", TONE_PROFILES.RUSHED),
  v("apressado", "direto ao ponto", TONE_PROFILES.RUSHED),
  v("apressado", "rapido, vale?", TONE_PROFILES.RUSHED),
  v("apressado", "preciso decidir rapido", TONE_PROFILES.RUSHED),
  v("apressado", "resposta curta", TONE_PROFILES.RUSHED),
  v("apressado", "direto, compensa?", TONE_PROFILES.RUSHED),
  v("apressado", "urgente, preciso saber", TONE_PROFILES.RUSHED),

  // irritado (8)
  v("irritado", "que saco", TONE_PROFILES.IRRITATED),
  v("irritado", "to puto com esse preço", TONE_PROFILES.IRRITATED),
  v("irritado", "nada presta", TONE_PROFILES.IRRITATED),
  v("irritado", "crl, caro demais, vale?", TONE_PROFILES.IRRITATED),
  v("irritado", "pqp esse preço", TONE_PROFILES.IRRITATED),
  v("irritado", "carai, ta caro", TONE_PROFILES.IRRITATED),
  v("irritado", "estou irritado", TONE_PROFILES.IRRITATED),
  v("irritado", "que merda de preço", TONE_PROFILES.IRRITATED),

  // indeciso (8)
  v("indeciso", "sla se eu compro, tenho medo d errar", TONE_PROFILES.ANXIOUS_ANTI_REGRET),
  v("indeciso", "vc acha q vou me arrepender?", TONE_PROFILES.ANXIOUS_ANTI_REGRET),
  v("indeciso", "to com receio desse produto", TONE_PROFILES.ANXIOUS_ANTI_REGRET),
  v("indeciso", "nao sei se esse notbook presta", TONE_PROFILES.NEUTRAL_DEFAULT),
  v("indeciso", "tbm to na duvida", TONE_PROFILES.INFORMAL_LIGHT),
  v("indeciso", "agr to pensando", TONE_PROFILES.INFORMAL_LIGHT),
  v("indeciso", "p mim parece caro", TONE_PROFILES.INFORMAL_LIGHT),
  v("indeciso", "qual notebook compensa?", TONE_PROFILES.NEUTRAL_DEFAULT),

  // educado (8)
  v("educado", "Por favor, poderia me ajudar?", TONE_PROFILES.FORMAL_POLITE),
  v("educado", "Gostaria de entender se vale a pena.", TONE_PROFILES.FORMAL_POLITE),
  v("educado", "Tenho uma duvida sobre o produto.", TONE_PROFILES.FORMAL_POLITE),
  v("educado", "Poderia explicar melhor?", TONE_PROFILES.FORMAL_POLITE),
  v("educado", "Bom dia, poderia me orientar?", TONE_PROFILES.FORMAL_POLITE),
  v("educado", "me explica simples por favor", TONE_PROFILES.LAYPERSON),
  v("educado", "por favor, me explica simples", TONE_PROFILES.LAYPERSON),
  v("educado", "Gostaria de saber se compensa.", TONE_PROFILES.FORMAL_POLITE),
];

const BAD_SAMPLES = {
  vulgar: "Crl mano, tá caro pra krl kkk compra logo",
  slang: "Coe parça slk esse cel é brabo demais",
  emoji: "😂😂😂 Vale sim!!! 🔥🔥",
};

function deriveTone(input) {
  const compound = normalizeCompoundInput({ originalMessage: input });
  return deriveConversationalToneProfile({
    originalMessage: input,
    normalizedMessage: compound.normalizedMessage,
    appliedNormalizations: compound.appliedNormalizations,
  });
}

console.log("PATCH 8.0B.2 — Conversational Tone Adaptation Variants (Regra 18)\n");
console.log(`Variantes: ${VARIANTS.length}\n`);

let pass = 0;
let fail = 0;
const byPersona = {};

for (const spec of VARIANTS) {
  const tone = deriveTone(spec.input);
  const failures = [];

  if (tone.toneProfile !== spec.expectedTone) {
    failures.push(`tone=${tone.toneProfile} expected=${spec.expectedTone}`);
  }

  const promptSection = buildToneAdaptationPromptSection(tone);
  if (!promptSection.includes("Adaptação de tom") && !promptSection.includes("Adaptacao de tom")) {
    if (promptSection.length > 0) failures.push("prompt_section_missing");
  }

  if (tone.toneInstructions.some((line) => /\b(mano|parça|parca|slk)\b/i.test(line) && !/nunca|não copie|nao copie|não use|nao use|proibido|não imite|nao imite/i.test(line))) {
    failures.push("instruction_leak");
  }

  for (const bad of Object.values(BAD_SAMPLES)) {
    const validation = validateResponseStyleAgainstTone(bad, tone);
    if (validation.ok) failures.push("bad_sample_not_flagged");
  }

  if (spec.checkPrompt) {
    const prompt = buildMiaPromptByRole("general_reply", { toneProfile: tone });
    if (!prompt.includes("Adaptação de tom") && !prompt.includes("Adaptacao de tom")) {
      failures.push("role_prompt_missing_tone");
    }
  }

  byPersona[spec.persona] = byPersona[spec.persona] || { pass: 0, fail: 0 };
  if (failures.length) {
    fail += 1;
    byPersona[spec.persona].fail += 1;
    console.log(`✗ [${spec.persona}] "${spec.input}" → ${failures.join("; ")} | ${tone.toneProfile}`);
  } else {
    pass += 1;
    byPersona[spec.persona].pass += 1;
  }
}

const total = pass + fail;
const rate = ((pass / total) * 100).toFixed(1);
console.log(`\nResultado: ${pass}/${total} (${rate}%)`);
console.log("\n── Por persona ──\n");
for (const [persona, stats] of Object.entries(byPersona)) {
  console.log(`  [${persona}]: ${stats.pass}/${stats.pass + stats.fail}`);
}

const verdict =
  pass / total >= 0.95
    ? "A) CONVERSATIONAL TONE VARIANTS ROBUST"
    : "B) CONVERSATIONAL TONE VARIANTS POSSUI GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(pass / total >= 0.95 ? 0 : 1);
