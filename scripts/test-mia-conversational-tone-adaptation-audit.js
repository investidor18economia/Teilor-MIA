/**
 * PATCH 8.0B.2 — Conversational Tone Adaptation Audit
 *
 * Usage: node scripts/test-mia-conversational-tone-adaptation-audit.js
 */

import {
  classifyMiaTurn,
  MIA_TURN_TYPES,
} from "../lib/miaCognitiveRouter.js";
import { buildRoutingDecision } from "../lib/miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "../lib/miaRoutingSafety.js";
import { normalizeCompoundInput } from "../lib/miaCompoundInputNormalizer.js";
import {
  TONE_PROFILES,
  deriveConversationalToneProfile,
  buildToneAdaptationPromptSection,
  validateResponseStyleAgainstTone,
} from "../lib/miaConversationalTone.js";
import { buildMiaPromptByRole } from "../lib/miaPrompt.js";

const SESSION = {
  lastBestProduct: { product_name: "Produto Atual", price: "R$ 999" },
  lastRecommendation: { winner: "Produto Atual" },
};

function simulateRouting(message, hasActiveAnchor) {
  const cognitiveTurn = classifyMiaTurn({
    query: message,
    originalQuery: message,
    sessionContext: hasActiveAnchor ? SESSION : {},
    hasActiveAnchor,
    detectedIntent: "search",
    contextAction: "search",
  });

  const routingDecision = buildRoutingDecision({
    userMessage: message,
    resolvedQuery: message,
    contextResolution: { mode: "general_answer", shouldSkipProductSearch: false, clearContext: !hasActiveAnchor },
    sessionContext: hasActiveAnchor ? SESSION : {},
    incomingSessionContext: hasActiveAnchor ? SESSION : {},
    intent: "search",
    contextAction: "search",
    cognitiveRoutingSignal: {
      turnType: cognitiveTurn.turnType,
      confidence: cognitiveTurn.confidence,
      hasActiveAnchor,
      isSoftDisagreement: !!cognitiveTurn.signals?.isSoftDisagreement,
      isAcknowledgement: !!cognitiveTurn.signals?.isAcknowledgement,
      isAntiRegret: !!cognitiveTurn.signals?.isAntiRegret,
      isConfidenceChallenge: !!cognitiveTurn.signals?.isConfidenceChallenge,
      isComprehension: !!cognitiveTurn.signals?.isComprehension,
    },
    signals: {
      hasClearNewCommercialSearch: resolveClearNewCommercialSearchForRouting({
        query: message,
        resolvedQuery: message,
        hasAnchor: hasActiveAnchor,
        looksLikeShortPriorityFollowUp: false,
        looksLikeAmbiguousFollowUp: false,
        isExplicitComparison: false,
        explicitProductOnlyQuery: false,
        wantsNew: false,
        detectProductCategory: () => "",
        wantsNewProduct: () => false,
      }),
      isContextDecisionOnOriginal: false,
      isProductReferenceOnOriginal: false,
      looksLikeAmbiguousFollowUp: false,
      looksLikeShortPriorityFollowUp: false,
      isExplicitComparison: false,
      hasComparisonProducts: false,
      wantsNew: false,
    },
  });

  return { cognitiveTurn, routingDecision };
}

function deriveForMessage(message, opts = {}) {
  const compound = normalizeCompoundInput({ originalMessage: message });
  const routing = opts.skipRouting
    ? { cognitiveTurn: {}, routingDecision: {} }
    : simulateRouting(message, opts.anchored === true);

  return {
    compound,
    routing,
    tone: deriveConversationalToneProfile({
      originalMessage: message,
      normalizedMessage: compound.normalizedMessage,
      appliedNormalizations: compound.appliedNormalizations,
      turnType: opts.turnType || routing.cognitiveTurn.turnType || "",
      conversationAct: opts.conversationAct || routing.routingDecision.conversationAct || "",
      responsePathHint: opts.responsePathHint || routing.routingDecision.responsePathHint || "",
    }),
  };
}

function c(id, input, expectedTone, opts = {}) {
  return { id, input, expectedTone, ...opts };
}

const GOOD_SAMPLES = {
  [TONE_PROFILES.INFORMAL_LIGHT]:
    "Vale considerar sim, mas eu olharia com cuidado o preço e os pontos fracos antes de cravar.",
  [TONE_PROFILES.INFORMAL_HIGH]:
    "Presta, mas não é compra cega. Eu olharia principalmente preço, bateria e se ainda faz sentido perto dos concorrentes.",
  [TONE_PROFILES.FORMAL_POLITE]:
    "Vale analisar com calma. O ponto principal é comparar o preço atual com o que ele entrega em desempenho, bateria e durabilidade.",
  [TONE_PROFILES.LAYPERSON]:
    "Simples: ele vale se estiver em bom preço. O cuidado é não pagar caro por algo que já tem concorrente melhor.",
  [TONE_PROFILES.ANXIOUS_ANTI_REGRET]:
    "Entendo a preocupação. Eu só seguiria se o preço e o uso fizerem sentido para você, sem pressa.",
  [TONE_PROFILES.RUSHED]:
    "Resumo: vale se o preço estiver alinhado ao que você precisa. Se estiver caro, eu esperaria.",
  [TONE_PROFILES.IRRITATED]:
    "Está puxado mesmo. Nesse preço, eu só consideraria se ele tiver um diferencial claro para o seu uso.",
  [TONE_PROFILES.TECHNICAL]:
    "Pelo desempenho bruto e latência, ele compete bem, mas o custo-benefício depende do preço atual.",
  [TONE_PROFILES.NEUTRAL_DEFAULT]:
    "Vale analisar o preço e os tradeoffs antes de decidir.",
};

const BAD_SAMPLES = {
  vulgar: "Crl mano, tá caro pra krl kkk compra logo",
  slang: "Coe parça slk esse cel é brabo demais",
  emoji: "😂😂😂 Vale sim!!! 🔥🔥",
};

const CASES = [
  // NEUTRAL (12)
  ...["qual notebook compensa?", "esse monitor vale?", "preciso de um fone bom", "quero uma tv barata"].map((m, i) =>
    c(`N${i + 1}`, m, TONE_PROFILES.NEUTRAL_DEFAULT)),

  // INFORMAL_LIGHT (15)
  c("IL1", "blz", TONE_PROFILES.INFORMAL_LIGHT),
  c("IL2", "vlw mia", TONE_PROFILES.INFORMAL_LIGHT),
  c("IL3", "fala ai", TONE_PROFILES.INFORMAL_LIGHT),
  c("IL4", "qual a boa", TONE_PROFILES.INFORMAL_LIGHT),
  c("IL5", "vc acha q vale?", TONE_PROFILES.INFORMAL_LIGHT),
  c("IL6", "vc acha q esse vale msm?", TONE_PROFILES.INFORMAL_LIGHT, { anchored: true }),
  c("IL7", "tmj", TONE_PROFILES.INFORMAL_LIGHT),
  c("IL8", "fechow", TONE_PROFILES.INFORMAL_LIGHT),
  c("IL9", "blz entao", TONE_PROFILES.INFORMAL_LIGHT),
  c("IL10", "p mim parece caro", TONE_PROFILES.INFORMAL_LIGHT, { anchored: true }),
  c("IL11", "tbm to na duvida", TONE_PROFILES.INFORMAL_LIGHT, { anchored: true }),
  c("IL12", "agr to pensando", TONE_PROFILES.INFORMAL_LIGHT, { anchored: true }),
  c("IL13", "sla se compensa", TONE_PROFILES.INFORMAL_LIGHT, { anchored: true }),
  c("IL14", "q fita", TONE_PROFILES.INFORMAL_LIGHT),
  c("IL15", "demorou", TONE_PROFILES.INFORMAL_LIGHT, { anchored: true }),

  // INFORMAL_HIGH (12)
  c("IH1", "koe mano, esse ai presta?", TONE_PROFILES.INFORMAL_HIGH),
  c("IH2", "slk esse preço ta pesado", TONE_PROFILES.INFORMAL_HIGH, { anchored: true }),
  c("IH3", "q fita esse notbook?", TONE_PROFILES.INFORMAL_HIGH),
  c("IH4", "seloko caro demais", TONE_PROFILES.INFORMAL_HIGH, { anchored: true }),
  c("IH5", "ce loko esse preço", TONE_PROFILES.INFORMAL_HIGH, { anchored: true }),
  c("IH6", "kkkk slk mano esse ipone ta caro", TONE_PROFILES.INFORMAL_HIGH, { anchored: true }),
  c("IH7", "vish caro demais", TONE_PROFILES.INFORMAL_HIGH, { anchored: true }),
  c("IH8", "eita pesado", TONE_PROFILES.INFORMAL_HIGH, { anchored: true }),
  c("IH9", "oxe caro", TONE_PROFILES.INFORMAL_HIGH),
  c("IH10", "rapaz caro", TONE_PROFILES.INFORMAL_HIGH),
  c("IH11", "uai compensa?", TONE_PROFILES.INFORMAL_HIGH),
  c("IH12", "doidera esse preço", TONE_PROFILES.INFORMAL_HIGH, { anchored: true }),

  // FORMAL (12)
  c("F1", "Gostaria de saber se esse modelo vale a pena.", TONE_PROFILES.FORMAL_POLITE),
  c("F2", "Por favor, poderia me ajudar?", TONE_PROFILES.FORMAL_POLITE),
  c("F3", "Tenho uma dúvida sobre essa recomendação.", TONE_PROFILES.FORMAL_POLITE, { anchored: true }),
  c("F4", "Poderia explicar melhor?", TONE_PROFILES.FORMAL_POLITE, { anchored: true }),
  c("F5", "Gostaria de entender se vale a pena.", TONE_PROFILES.FORMAL_POLITE, { anchored: true }),
  c("F6", "Por favor, gostaria de entender.", TONE_PROFILES.FORMAL_POLITE),
  c("F7", "Bom dia, poderia me orientar?", TONE_PROFILES.FORMAL_POLITE),
  c("F8", "Solicito uma orientação sobre essa compra.", TONE_PROFILES.FORMAL_POLITE),
  c("F9", "Prezado, gostaria de saber mais.", TONE_PROFILES.FORMAL_POLITE),
  c("F10", "Cordialmente, preciso decidir.", TONE_PROFILES.FORMAL_POLITE),
  c("F11", "Por favor, gostaria de saber se compensa.", TONE_PROFILES.FORMAL_POLITE, { anchored: true }),
  c("F12", "Tenho uma duvida sobre o produto.", TONE_PROFILES.FORMAL_POLITE, { anchored: true }),

  // TECHNICAL (12)
  c("T1", "tecnicamente, qual o melhor?", TONE_PROFILES.TECHNICAL),
  c("T2", "em desempenho bruto, vale?", TONE_PROFILES.TECHNICAL, { anchored: true }),
  c("T3", "benchmark desse notebook", TONE_PROFILES.TECHNICAL),
  c("T4", "latencia do monitor importa?", TONE_PROFILES.TECHNICAL, { anchored: true }),
  c("T5", "chipset faz diferença?", TONE_PROFILES.TECHNICAL),
  c("T6", "fps no jogo", TONE_PROFILES.TECHNICAL),
  c("T7", "nvme ou ssd comum?", TONE_PROFILES.TECHNICAL),
  c("T8", "tdp da placa importa?", TONE_PROFILES.TECHNICAL),
  c("T9", "clock do processador", TONE_PROFILES.TECHNICAL),
  c("T10", "ips 144hz vale?", TONE_PROFILES.TECHNICAL),
  c("T11", "desempenho bruto compensa?", TONE_PROFILES.TECHNICAL, { anchored: true }),
  c("T12", "tecnicamente compensa?", TONE_PROFILES.TECHNICAL, { anchored: true }),

  // LAYPERSON (12)
  c("L1", "sou leigo nisso", TONE_PROFILES.LAYPERSON),
  c("L2", "nao entendo disso", TONE_PROFILES.LAYPERSON),
  c("L3", "nao manjo de tecnologia", TONE_PROFILES.LAYPERSON),
  c("L4", "nao sei nada de notebook", TONE_PROFILES.LAYPERSON),
  c("L5", "me explica simples", TONE_PROFILES.LAYPERSON, { anchored: true }),
  c("L6", "explica facil", TONE_PROFILES.LAYPERSON, { anchored: true }),
  c("L7", "sou leigo, vale?", TONE_PROFILES.LAYPERSON, { anchored: true }),
  c("L8", "nao entendo nada disso", TONE_PROFILES.LAYPERSON),
  c("L9", "zero conhecimento aqui", TONE_PROFILES.LAYPERSON),
  c("L10", "nao entendo de celular", TONE_PROFILES.LAYPERSON),
  c("L11", "me explica simples por favor", TONE_PROFILES.LAYPERSON, { anchored: true }),
  c("L12", "sou leigo nesse assunto", TONE_PROFILES.LAYPERSON, { anchored: true }),

  // ANXIOUS (15)
  c("A1", "tenho medo de errar", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A2", "nao quero me arrepender", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A3", "nao quero dor de cabeca", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A4", "to com receio", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A5", "tenho receio desse produto", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A6", "nao quero errar nessa compra", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A7", "poço comprar sem medo?", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A8", "vc acha q vou me arrepender?", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A9", "quero evitar arrependimento", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A10", "escolha tranquila", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A11", "sla se eu compro, tenho medo d errar", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A12", "n quero me ferrar", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A13", "to com medo de errar", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A14", "nao quero me arrepender dps", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),
  c("A15", "tenho medo d errar nesse notbook", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { anchored: true }),

  // RUSHED (12)
  c("R1", "me responde curto", TONE_PROFILES.RUSHED),
  c("R2", "sem enrolar", TONE_PROFILES.RUSHED),
  c("R3", "direto ao ponto", TONE_PROFILES.RUSHED),
  c("R4", "rapido, vale?", TONE_PROFILES.RUSHED, { anchored: true }),
  c("R5", "preciso decidir rapido", TONE_PROFILES.RUSHED, { anchored: true }),
  c("R6", "resposta curta", TONE_PROFILES.RUSHED),
  c("R7", "direto, compensa?", TONE_PROFILES.RUSHED, { anchored: true }),
  c("R8", "urgente, preciso saber", TONE_PROFILES.RUSHED),
  c("R9", "sem enrolar, vale?", TONE_PROFILES.RUSHED, { anchored: true }),
  c("R10", "me responde curto se vale", TONE_PROFILES.RUSHED, { anchored: true }),
  c("R11", "direto", TONE_PROFILES.RUSHED),
  c("R12", "rapido", TONE_PROFILES.RUSHED),

  // IRRITATED (12)
  c("I1", "que saco", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I2", "to puto com esse preço", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I3", "nada presta", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I4", "crl, caro demais, vale?", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I5", "pqp esse preço", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I6", "carai, ta caro", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I7", "krl vale mesmo?", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I8", "estou irritado", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I9", "nao aguento mais", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I10", "que merda de preço", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I11", "crl nao quero me arrepender", TONE_PROFILES.IRRITATED, { anchored: true }),
  c("I12", "pqp nao curti", TONE_PROFILES.IRRITATED, { anchored: true }),

  // STYLE / PROMPT / LEAK (16)
  c("S1", "vc acha q vale?", TONE_PROFILES.INFORMAL_LIGHT, { checkPrompt: true, role: "confidence_challenge_reply" }),
  c("S2", "Gostaria de saber se vale.", TONE_PROFILES.FORMAL_POLITE, { checkPrompt: true, role: "confidence_challenge_reply" }),
  c("S3", "sou leigo, me explica", TONE_PROFILES.LAYPERSON, { checkPrompt: true, role: "comprehension_reply" }),
  c("S4", "tenho medo de errar", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { checkPrompt: true, role: "anti_regret_reply" }),
  c("S5", "sem enrolar", TONE_PROFILES.RUSHED, { checkPrompt: true, role: "general_reply" }),
  c("S6", "crl ta caro", TONE_PROFILES.IRRITATED, { checkPrompt: true, role: "confidence_challenge_reply" }),
  c("S7", "tecnicamente vale?", TONE_PROFILES.TECHNICAL, { checkPrompt: true, role: "confidence_challenge_reply" }),
  c("S8", "koe mano presta?", TONE_PROFILES.INFORMAL_HIGH, { checkPrompt: true, role: "general_reply" }),
  c("S9", "neutral check", TONE_PROFILES.NEUTRAL_DEFAULT, { checkBadSample: "vulgar" }),
  c("S10", "neutral check 2", TONE_PROFILES.NEUTRAL_DEFAULT, { checkBadSample: "slang" }),
  c("S11", "neutral check 3", TONE_PROFILES.NEUTRAL_DEFAULT, { checkBadSample: "emoji" }),
  c("S12", "Gostaria de saber se vale a pena.", TONE_PROFILES.FORMAL_POLITE, { checkGoodSample: true }),
  c("S13", "vc acha q vale msm?", TONE_PROFILES.INFORMAL_LIGHT, { checkGoodSample: true }),
  c("S14", "tenho medo de errar", TONE_PROFILES.ANXIOUS_ANTI_REGRET, { checkGoodSample: true, anchored: true }),
  c("S15", "crl, caro demais, vale?", TONE_PROFILES.IRRITATED, { checkGoodSample: true, anchored: true }),
  c("S16", "sem enrolar, vale?", TONE_PROFILES.RUSHED, { checkGoodSample: true, anchored: true }),
];

function evaluateCase(spec) {
  const failures = [];
  const layers = [];
  const ctx = deriveForMessage(spec.input, spec);
  const { tone, routing } = ctx;

  if (tone.toneProfile !== spec.expectedTone) {
    failures.push(`tone=${tone.toneProfile} expected=${spec.expectedTone}`);
    layers.push("A) tone detection miss");
  }

  if (tone.toneInstructions.some((line) => /\b(mano|parça|parca|slk)\b/i.test(line) && !/nunca|não copie|nao copie|não use|nao use|proibido|não imite|nao imite/i.test(line))) {
    failures.push("instruction_leak");
    layers.push("B) over-casualization");
  }

  const promptSection = buildToneAdaptationPromptSection(tone);
  if (promptSection && /copie palavr/i.test(promptSection) === false && /\b(slk|crl)\b/i.test(promptSection.replace(/Nunca use:.*/gi, ""))) {
    failures.push("prompt_vulgarity");
    layers.push("C) vulgarity copied");
  }

  if (tone.shouldUseEmoji && tone.toneProfile === TONE_PROFILES.TECHNICAL) {
    failures.push("emoji_misconfig");
    layers.push("D) emoji misuse");
  }

  if (spec.checkPrompt) {
    const prompt = buildMiaPromptByRole(spec.role || "general_reply", { toneProfile: tone });
    if (!prompt.includes("Adaptação de tom") && !prompt.includes("Adaptacao de tom")) {
      failures.push("prompt_missing_tone_section");
      layers.push("E) response too robotic");
    }
    if (prompt.includes("Nunca copie palavrão") || prompt.includes("Nunca copie palavra")) {
      // ok
    } else if (!prompt.includes("Nunca copie")) {
      failures.push("prompt_missing_forbidden_rule");
    }
  }

  if (spec.checkGoodSample && GOOD_SAMPLES[spec.expectedTone]) {
    const validation = validateResponseStyleAgainstTone(GOOD_SAMPLES[spec.expectedTone], tone);
    if (!validation.ok) {
      failures.push(`good_sample_leak=${validation.leaks.join(",")}`);
      layers.push("J) perception leak");
    }
  }

  if (spec.checkBadSample && BAD_SAMPLES[spec.checkBadSample]) {
    const validation = validateResponseStyleAgainstTone(BAD_SAMPLES[spec.checkBadSample], tone);
    if (validation.ok) {
      failures.push("bad_sample_not_flagged");
      layers.push("J) perception leak");
    }
  }

  if (!spec.skipRouting) {
    const baseline = simulateRouting(spec.input, spec.anchored === true);
    if (baseline.cognitiveTurn.turnType !== routing.cognitiveTurn.turnType) {
      failures.push("intent_drift");
      layers.push("H) intent drift");
    }
    if (baseline.routingDecision.conversationAct !== routing.routingDecision.conversationAct) {
      failures.push("routing_drift");
      layers.push("I) routing drift");
    }
  }

  if (tone.brevityLevel === "high" && !tone.toneInstructions.some((l) => /curt|objetiv|1-2 frases/i.test(l))) {
    failures.push("brevity_instruction_missing");
    layers.push("G) response too long");
  }

  return { ok: failures.length === 0, failures, layers, tone, routing };
}

console.log("PATCH 8.0B.2 — Conversational Tone Adaptation Audit\n");
console.log(`Cenários: ${CASES.length}\n`);

let pass = 0;
let fail = 0;
const failureRecords = [];

for (const spec of CASES) {
  const result = evaluateCase(spec);
  if (result.ok) {
    pass += 1;
    console.log(`✓ [${spec.id}] "${spec.input}" → ${result.tone.toneProfile}`);
  } else {
    fail += 1;
    console.log(`✗ [${spec.id}] "${spec.input}" → ${result.failures.join("; ")} | ${result.tone.toneProfile}`);
    failureRecords.push({ id: spec.id, failures: result.failures, layers: result.layers });
  }
}

const total = pass + fail;
const rate = ((pass / total) * 100).toFixed(1);
console.log(`\nResultado: ${pass}/${total} (${rate}%)`);

if (failureRecords.length) {
  console.log("\n── Falhas por classificação ──\n");
  const byLayer = {};
  for (const r of failureRecords) {
    for (const l of r.layers) byLayer[l] = (byLayer[l] || 0) + 1;
  }
  for (const [layer, count] of Object.entries(byLayer)) {
    console.log(`  ${layer}: ${count}`);
  }
}

const verdict =
  pass / total >= 0.95
    ? "A) CONVERSATIONAL TONE ADAPTATION ROBUST"
    : "B) CONVERSATIONAL TONE ADAPTATION POSSUI GAP";
console.log(`\n── Veredito ──\n${verdict}\n`);
process.exit(pass / total >= 0.95 ? 0 : 1);
