/**
 * PATCH 4A.6 — Verbalization Style Governor
 *
 * Governs literalness, repetition and crystallized frames over VerbalizationPlan.
 * Does not alter facts, ranking, winner, or NarrativePlan content.
 */

import {
  SEMANTIC_VERBALIZER_VERSION,
  hasVerbalizationPlan,
} from "./miaSemanticVerbalizer.js";

export const VERBALIZATION_STYLE_GOVERNOR_VERSION = "4A.6.0";

const MAX_RECENT_PATTERNS = 6;

const LITERAL_FRAGMENT_CHECKS = [
  {
    id: "porque_nominal",
    pattern: /\bporque\s+(?:[a-záàâãéêíóôõúç]+\s+){0,4}(?:boa|bom|fluida|forte|alta|lento|melhor|premium|fraca|ruim)\b/i,
  },
  {
    id: "ponto_positivo_label",
    pattern: /^(?:o )?ponto positivo (?:é|seria)\s/i,
  },
  {
    id: "ponto_negativo_label",
    pattern: /^(?:o )?ponto negativo (?:é|seria)\s/i,
  },
  {
    id: "nominal_adj_fragment",
    pattern:
      /^(?:câmera|tela|bateria|desempenho|carregamento|construção|autonomia|fluidez)\s+(?:boa|bom|fluida|forte|alta|lento|melhor|premium|fraca|ruim)\.?$/i,
  },
  {
    id: "short_tradeoff",
    pattern: /^(?:por outro lado,? )?(?:carregamento|bateria|tela|câmera|desempenho)\s+(?:lento|fraca|ruim|pior|menor)\.?$/i,
  },
  {
    id: "label_prefix",
    pattern: /^(?:ponto forte|ponto fraco|destaque|ressalva)\s+(?:de|da|do|é)\s/i,
  },
];

const CRYSTALLIZED_FRAME_CHECKS = [
  { id: "na_pratica", pattern: /^na prática,?/i },
  { id: "principal_beneficio", pattern: /^o principal benefício é/i },
  { id: "ponto_atencao", pattern: /^o ponto de atenção é/i },
  { id: "por_outro_lado", pattern: /^por outro lado,?/i },
  { id: "vale_destacar", pattern: /^vale destacar/i },
  { id: "em_resumo", pattern: /^em resumo/i },
  { id: "isso_significa", pattern: /^isso significa que/i },
  { id: "se_prioridade", pattern: /^se sua prioridade é/i },
  { id: "faz_sentido_voce", pattern: /^faz sentido para você/i },
  { id: "principal_ponto", pattern: /^o principal ponto é/i },
];

const EFFECT_KEY_REWRITE_HINTS = Object.freeze({
  battery_autonomy:
    "Reescreva como autonomia ou menos dependência do carregador no dia a dia, sem copiar o fragmento.",
  display_smoothness:
    "Reescreva como fluidez da tela ou navegação mais fluida, sem copiar o fragmento.",
  camera_quality:
    "Reescreva como qualidade da câmera ou resultados de foto, sem copiar o fragmento.",
  performance_headroom:
    "Reescreva como folga de desempenho para tarefas pesadas, sem copiar o fragmento.",
  charging_speed:
    "Reescreva como tempo de recarga ou carregamento mais demorado, sem copiar o fragmento.",
  build_quality:
    "Reescreva como sensação de construção ou acabamento, sem copiar o fragmento.",
  value_balance:
    "Reescreva como relação equilibrada entre preço e entrega, sem copiar o fragmento.",
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value = "") {
  return cleanText(value).toLowerCase();
}

function uniqueList(values = [], limit = MAX_RECENT_PATTERNS) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    const key = normalizeKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function matchChecks(text = "", checks = []) {
  const normalized = cleanText(text);
  if (!normalized) return [];
  return checks.filter((entry) => entry.pattern.test(normalized)).map((entry) => entry.id);
}

function hasFiniteVerb(text = "") {
  return /\b(?:é|e|são|tem|oferece|entrega|deixa|pode|fica|ganha|perde|ajuda|mantém|faz|traz|combina|aguenta|dura|carrega)\b/i.test(
    text
  );
}

function isLikelyFragment(text = "") {
  const normalized = cleanText(text);
  if (!normalized) return false;
  if (
    normalized.length > 36 &&
    /\b(?:menos|mais|melhor|pior|longo|dia a dia|uso|navegação|recarga|dependência)\b/i.test(normalized)
  ) {
    return false;
  }
  if (normalized.length <= 42 && !hasFiniteVerb(normalized)) return true;
  return matchChecks(normalized, LITERAL_FRAGMENT_CHECKS).length > 0;
}

/**
 * @param {string} text
 */
export function detectLiteralFragment(text = "") {
  const normalized = cleanText(text);
  if (!normalized) {
    return { detected: false, reasons: [], risk: "none" };
  }
  const reasons = matchChecks(normalized, LITERAL_FRAGMENT_CHECKS);
  const fragmentLike = isLikelyFragment(normalized);
  const detected = reasons.length > 0 || fragmentLike;
  const risk =
    reasons.includes("porque_nominal") || reasons.includes("nominal_adj_fragment")
      ? "high"
      : detected
        ? "medium"
        : "none";
  return { detected, reasons, risk, text: normalized };
}

/**
 * @param {string} text
 */
export function detectCrystallizedFrame(text = "") {
  const normalized = cleanText(text);
  if (!normalized) return { detected: false, frames: [] };
  const frames = matchChecks(normalized, CRYSTALLIZED_FRAME_CHECKS);
  return { detected: frames.length > 0, frames, text: normalized };
}

/**
 * @param {Record<string, unknown>} sessionContext
 */
export function extractRecentPatternContext(sessionContext = {}) {
  const memory = sessionContext.lastVerbalizationPatterns || {};
  return {
    lastOpeningStyles: uniqueList(memory.lastOpeningStyles || memory.openings || []),
    lastClosingStyles: uniqueList(memory.lastClosingStyles || memory.closings || []),
    recentConnectors: uniqueList(memory.recentConnectors || memory.connectors || []),
    recentSentenceFrames: uniqueList(memory.recentSentenceFrames || memory.frames || []),
    recentCrystallizedFrames: uniqueList(
      memory.recentCrystallizedFrames || memory.crystallizedFrames || []
    ),
  };
}

function rewriteHintForSlot(slot = null) {
  const effectKey = slot?.effectKey || "";
  if (effectKey && EFFECT_KEY_REWRITE_HINTS[effectKey]) {
    return EFFECT_KEY_REWRITE_HINTS[effectKey];
  }
  if (slot?.slot === "tradeoff") {
    return "Reescreva a concessão como frase completa, reconhecendo o tradeoff sem copiar o fragmento.";
  }
  if (slot?.slot === "caveat") {
    return "Reescreva a ressalva como frase completa, sem copiar o fragmento.";
  }
  return "Reescreva o significado em frase completa e natural, sem copiar o fragmento interno.";
}

function semanticSlotFromEntry(entry, slotName) {
  if (!entry?.text) return null;
  const literal = detectLiteralFragment(entry.text);
  const crystallized = detectCrystallizedFrame(entry.connector || entry.text);
  return {
    slot: slotName,
    semanticMeaning: entry.text,
    sourceFragment: entry.text,
    rewriteRequired: literal.detected || crystallized.detected,
    literalFragmentRisk: literal.risk,
    literalFragmentReasons: literal.reasons,
    crystallizedFrames: crystallized.frames,
    effectKey: entry.effectKey || null,
    unitId: entry.unitId || null,
    connector: entry.connector || null,
    rewriteHint: rewriteHintForSlot({ ...entry, slot: slotName }),
    hierarchyRank: entry.hierarchyRank ?? null,
  };
}

function collectSlotsFromPlan(verbalizationPlan = null) {
  if (!hasVerbalizationPlan(verbalizationPlan)) return [];
  const slots = [];
  if (verbalizationPlan.mainMessage) {
    slots.push(semanticSlotFromEntry(verbalizationPlan.mainMessage, "main_message"));
  }
  for (const entry of verbalizationPlan.supportingMessages || []) {
    slots.push(semanticSlotFromEntry(entry, "supporting_message"));
  }
  for (const entry of verbalizationPlan.tradeoffs || []) {
    slots.push(semanticSlotFromEntry(entry, "tradeoff"));
  }
  for (const entry of verbalizationPlan.caveats || []) {
    slots.push(semanticSlotFromEntry(entry, "caveat"));
  }
  return slots.filter(Boolean);
}

/**
 * @param {ReturnType<import("./miaSemanticVerbalizer.js").buildVerbalizationPlan>|null} verbalizationPlan
 * @param {ReturnType<typeof extractRecentPatternContext>} recentPatterns
 */
export function buildVariationConstraints(verbalizationPlan = null, recentPatterns = {}) {
  const avoidOpenings = uniqueList([
    ...(recentPatterns.lastOpeningStyles || []),
    verbalizationPlan?.opening?.connector,
  ]);
  const avoidConnectors = uniqueList([
    ...(recentPatterns.recentConnectors || []),
    ...(verbalizationPlan?.sections || [])
      .map((entry) => entry.connector)
      .filter(Boolean),
  ]);
  const avoidClosingFrames = uniqueList(recentPatterns.lastClosingStyles || []);
  const avoidSentenceFrames = uniqueList([
    ...(recentPatterns.recentSentenceFrames || []),
    ...(recentPatterns.recentCrystallizedFrames || []),
  ]);

  return {
    avoidOpenings,
    avoidConnectors,
    avoidClosingFrames,
    avoidSentenceFrames,
    varySentenceStructure: true,
    allowOmissionWhenContextClear: true,
    allowMergeWhenSafe: true,
  };
}

/**
 * @param {ReturnType<import("./miaSemanticVerbalizer.js").buildVerbalizationPlan>|null} verbalizationPlan
 * @param {Record<string, unknown>} [context]
 */
export function buildVerbalizationStylePolicy(verbalizationPlan = null, context = {}) {
  const recentPatterns = extractRecentPatternContext(context.sessionContext || context);
  const semanticSlots = collectSlotsFromPlan(verbalizationPlan);
  const literalSlots = semanticSlots.filter((entry) => entry.rewriteRequired).length;

  return {
    schemaVersion: VERBALIZATION_STYLE_GOVERNOR_VERSION,
    preserveSemanticMeaning: true,
    forbidMechanicalCopy: true,
    rewriteFragments: true,
    varySentenceStructure: true,
    forbidNewClaims: true,
    preserveRecommendationStrength: true,
    preserveTradeoffs: true,
    preserveConfidenceLevel: true,
    semanticSlots,
    variationConstraints: buildVariationConstraints(verbalizationPlan, recentPatterns),
    recentPatternContext: recentPatterns,
    stats: {
      slotCount: semanticSlots.length,
      literalSlotCount: literalSlots,
      rewriteRequiredCount: literalSlots,
    },
    trace: {
      builtFromVerbalizationPlan: hasVerbalizationPlan(verbalizationPlan),
      verbalizerVersion: verbalizationPlan?.schemaVersion || null,
    },
  };
}

/**
 * @param {ReturnType<typeof buildVerbalizationStylePolicy>} policy
 * @param {ReturnType<import("./miaSemanticVerbalizer.js").buildVerbalizationPlan>|null} verbalizationPlan
 */
export function validateSemanticPreservation(policy, verbalizationPlan = null) {
  const errors = [];
  if (!policy?.preserveSemanticMeaning) errors.push("preserve_semantic_meaning_missing");
  if (!policy?.forbidMechanicalCopy) errors.push("forbid_mechanical_copy_missing");
  if (!policy?.preserveTradeoffs) errors.push("preserve_tradeoffs_missing");
  if (verbalizationPlan && hasVerbalizationPlan(verbalizationPlan)) {
    const planTradeoffCount = (verbalizationPlan.tradeoffs || []).length;
    const policyTradeoffCount = (policy.semanticSlots || []).filter(
      (entry) => entry.slot === "tradeoff"
    ).length;
    if (planTradeoffCount && policyTradeoffCount !== planTradeoffCount) {
      errors.push("tradeoff_slot_count_mismatch");
    }
    for (const slot of policy.semanticSlots || []) {
      if (!slot.semanticMeaning) errors.push("semantic_meaning_missing");
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * @param {ReturnType<typeof buildVerbalizationStylePolicy>} policy
 */
export function validateVerbalizationStyleContract(contract) {
  const errors = [];
  if (!contract) return { valid: false, errors: ["style_contract_missing"] };
  if (!contract.rules?.preserveSemanticMeaning) errors.push("contract_rules_missing");
  if (!Array.isArray(contract.slots)) errors.push("contract_slots_missing");
  if (!contract.variationConstraints) errors.push("variation_constraints_missing");
  return { valid: errors.length === 0, errors };
}

/**
 * @param {ReturnType<typeof buildVerbalizationStylePolicy>} policy
 */
export function styleGovernanceToLlmContract(policy = null) {
  if (!policy) return null;
  return {
    schemaVersion: VERBALIZATION_STYLE_GOVERNOR_VERSION,
    llmCanOnlyVerbalize: true,
    mustPreserveFacts: true,
    forbiddenInvention: true,
    rules: {
      preserveSemanticMeaning: true,
      doNotCopyInternalFragments: true,
      rewriteFragmentsIntoCompleteSentences: true,
      varySentenceStructureWhenSafe: true,
      doNotAddNewClaims: true,
      doNotChangeRecommendationStrength: true,
      doNotSuppressTradeoffs: true,
      doNotConvertUncertaintyIntoCertainty: true,
      doNotRepeatRecentSentenceFrames: true,
    },
    variationConstraints: policy.variationConstraints || null,
    recentPatternContext: policy.recentPatternContext || null,
    slots: (policy.semanticSlots || []).map((entry) => ({
      slot: entry.slot,
      semanticMeaning: entry.semanticMeaning,
      sourceFragment: entry.sourceFragment,
      rewriteRequired: entry.rewriteRequired,
      literalFragmentRisk: entry.literalFragmentRisk,
      rewriteHint: entry.rewriteHint,
      effectKey: entry.effectKey,
      unitId: entry.unitId,
      connector: entry.connector,
    })),
    closingIntent: policy.closingIntent || null,
    tone: policy.tone || null,
  };
}

function genericSurfaceRewrite(text = "", effectKey = "") {
  const normalized = cleanText(text);
  if (!normalized) return normalized;

  if (/^bat(?:eria)?\s+/i.test(normalized)) {
    const adj = normalized.replace(/^bat(?:eria)?\s+/i, "");
    return `a bateria tende a ser ${adj}, com impacto na autonomia do dia a dia`;
  }

  const literal = detectLiteralFragment(normalized);
  if (!literal.detected) return normalized;

  if (EFFECT_KEY_REWRITE_HINTS[effectKey]) {
    if (/lento|fraca|ruim|pior|menor/i.test(normalized)) {
      const noun = normalized.replace(/^(?:por outro lado,? )?/i, "").split(/\s+/)[0] || "esse ponto";
      return `a principal concessão está no ${noun}, o que pode pesar no uso diário`;
    }
    const nounMatch = normalized.match(
      /(?:câmera|tela|bateria|desempenho|carregamento|construção|autonomia|fluidez)/i
    );
    const noun = nounMatch?.[0] || "destaque";
    return `um dos pontos fortes é ${noun === "destaque" ? "o destaque" : `a ${noun}`}, com impacto perceptível no uso diário`;
  }

  if (/^porque\s+/i.test(normalized)) {
    const tail = normalized.replace(/^porque\s+/i, "");
    return `faz sentido principalmente por ${tail}, considerando o uso que você descreveu`;
  }

  if (/^(?:câmera|tela|bateria|desempenho|carregamento)\s+/i.test(normalized)) {
    const [head, ...rest] = normalized.split(/\s+/);
    const adj = rest.join(" ");
    if (/lento|fraca|ruim|pior|menor/i.test(adj)) {
      return `a principal concessão está no ${head}, que pode parecer ${adj} em comparação com alternativas`;
    }
    return `um dos pontos fortes é o ${head}, que tende a entregar uma experiência ${adj}`;
  }

  if (/^ponto positivo/i.test(normalized)) {
    return normalized.replace(/^ponto positivo (?:é|seria)\s*/i, "um dos destaques é ");
  }
  if (/^ponto negativo/i.test(normalized)) {
    return normalized.replace(/^ponto negativo (?:é|seria)\s*/i, "a principal concessão está em ");
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Deterministic surface rewrite for non-LLM paths. Preserves meaning, improves grammar.
 * @param {string} text
 * @param {{ effectKey?: string }} [options]
 */
export function surfaceRewriteFragment(text = "", options = {}) {
  return genericSurfaceRewrite(text, options.effectKey || "");
}

/**
 * @param {ReturnType<import("./miaSemanticVerbalizer.js").buildVerbalizationPlan>|null} verbalizationPlan
 * @param {Record<string, unknown>} [context]
 */
export function buildVerbalizationStyleGovernancePayload(verbalizationPlan = null, context = {}) {
  const stylePolicy = buildVerbalizationStylePolicy(verbalizationPlan, context);
  const llmStyleContract = styleGovernanceToLlmContract({
    ...stylePolicy,
    closingIntent: verbalizationPlan?.closingIntent || null,
    tone: verbalizationPlan?.tone || null,
  });
  const validation = validateSemanticPreservation(stylePolicy, verbalizationPlan);
  const contractValidation = validateVerbalizationStyleContract(llmStyleContract);
  return {
    version: VERBALIZATION_STYLE_GOVERNOR_VERSION,
    stylePolicy,
    llmStyleContract,
    validation,
    contractValidation,
  };
}

function frameFromText(text = "") {
  const normalized = cleanText(text);
  if (!normalized) return null;
  const firstSentence = normalized.split(/[.!?]/)[0]?.trim();
  if (!firstSentence || firstSentence.length < 8) return null;
  return firstSentence.slice(0, 72);
}

/**
 * Form-only memory update. Does not alter decision content.
 * @param {Record<string, unknown>} sessionContext
 * @param {ReturnType<typeof buildVerbalizationStylePolicy>} policy
 * @param {string} reply
 */
export function updateRecentVerbalizationPatterns(sessionContext = {}, policy = null, reply = "") {
  const previous = extractRecentPatternContext(sessionContext);
  const opening = policy?.semanticSlots?.[0]?.connector || frameFromText(reply);
  const closing = frameFromText(String(reply || "").split(/\n/).pop() || "");
  const connectors = (policy?.semanticSlots || [])
    .map((entry) => entry.connector)
    .filter(Boolean);
  const frames = (policy?.semanticSlots || [])
    .map((entry) => frameFromText(entry.semanticMeaning))
    .filter(Boolean);
  const crystallized = (policy?.semanticSlots || [])
    .flatMap((entry) => entry.crystallizedFrames || [])
    .filter(Boolean);

  return {
    lastOpeningStyles: uniqueList([opening, ...previous.lastOpeningStyles]),
    lastClosingStyles: uniqueList([closing, ...previous.lastClosingStyles]),
    recentConnectors: uniqueList([...connectors, ...previous.recentConnectors]),
    recentSentenceFrames: uniqueList([...frames, ...previous.recentSentenceFrames]),
    recentCrystallizedFrames: uniqueList([
      ...crystallized,
      ...previous.recentCrystallizedFrames,
    ]),
    updatedAt: new Date().toISOString(),
  };
}

export function hasVerbalizationStyleGovernance(value) {
  return (
    !!value?.stylePolicy?.schemaVersion &&
    value.stylePolicy.schemaVersion === VERBALIZATION_STYLE_GOVERNOR_VERSION
  );
}

export function verbalizationStyleGovernanceToTrace(payload = null) {
  if (!payload?.stylePolicy) return null;
  return {
    version: payload.version || VERBALIZATION_STYLE_GOVERNOR_VERSION,
    slotCount: payload.stylePolicy.stats?.slotCount || 0,
    rewriteRequiredCount: payload.stylePolicy.stats?.rewriteRequiredCount || 0,
    literalSlotCount: payload.stylePolicy.stats?.literalSlotCount || 0,
    contractValid: !!payload.contractValidation?.valid,
  };
}
