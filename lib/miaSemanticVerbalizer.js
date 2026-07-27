/**
 * PATCH 4A.5 — Semantic Verbalizer
 *
 * Transforms NarrativePlan into VerbalizationPlan for natural language generation.
 * Does not create intelligence, alter facts, or mutate NarrativePlan.
 */

import {
  NARRATIVE_CLOSING_TYPE,
  NARRATIVE_SECTION_TYPE,
  hasNarrativePlan,
  narrativePlanToVerbalizationOrder,
  validateNarrativePlan,
} from "./miaNarrativePlanner.js";

export const SEMANTIC_VERBALIZER_VERSION = "4A.5.0";

export const VERBALIZATION_TONE = Object.freeze({
  NEUTRAL: "neutral",
  WARM: "warm",
  CONFIDENT: "confident",
  CALM: "calm",
});

export const VERBALIZATION_PROFILE = Object.freeze({
  DIRECT: "direct",
  EXPLORATORY: "exploratory",
  REASSURING: "reassuring",
  CONVERSATIONAL: "conversational",
});

export const VERBALIZATION_PACE = Object.freeze({
  CONCISE: "concise",
  BALANCED: "balanced",
  EXPLANATORY: "explanatory",
});

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hashSeed(seed = "") {
  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickVariant(variants = [], seed = "") {
  const list = variants.filter(Boolean);
  if (!list.length) return "";
  return list[hashSeed(seed) % list.length];
}

/**
 * @param {Record<string, unknown>} context
 */
export function resolveVerbalizationProfile(context = {}) {
  const query = cleanText(context.query || context.rawUserMessage || "");
  const queryLength = query.length;
  const isFollowUp = !!context.isFollowUp;
  const isExploratory =
    !!context.isExploratory ||
    context.responsePath === "discovery" ||
    /^(quero|preciso|me (?:indica|ajuda|fala)|busco|procuro)/i.test(query);
  const isDirect =
    queryLength > 0 &&
    queryLength <= 48 &&
    (/vale a pena|compensa|recomenda|qual (?:prefere|escolher|melhor)| ou /i.test(query) ||
      !!context.specificProductLockActive);
  const hasWorrySignal =
    /insegur|dúvida|duvida|medo|receio|preocup/i.test(query);
  const priorityModel = context.contextualPriorityModel || null;
  const dominantCriterion = priorityModel?.dominantCriterion || "";
  const hasNegatedWorry =
    /sem (?:me )?preocup|n[aã]o (?:tenho )?(?:medo|d[uú]vida|receio)/i.test(query);
  const isReassuring =
    !!context.safetyAntiregret ||
    !!context.querySignals?.regretFear ||
    !!context.querySignals?.longTerm ||
    (hasWorrySignal && !hasNegatedWorry);

  if (isReassuring) {
    return {
      profile: VERBALIZATION_PROFILE.REASSURING,
      pace: VERBALIZATION_PACE.EXPLANATORY,
      tone: VERBALIZATION_TONE.CALM,
      reason: "reassurance_signals",
    };
  }
  if (isDirect && !isFollowUp) {
    return {
      profile: VERBALIZATION_PROFILE.DIRECT,
      pace: VERBALIZATION_PACE.CONCISE,
      tone: VERBALIZATION_TONE.CONFIDENT,
      reason: "direct_query",
    };
  }
  if (
    dominantCriterion === "processor" &&
    (context.querySignals?.gaming || /gamer|jogo|fps/i.test(query))
  ) {
    return {
      profile: VERBALIZATION_PROFILE.DIRECT,
      pace: VERBALIZATION_PACE.CONCISE,
      tone: VERBALIZATION_TONE.CONFIDENT,
      reason: "priority_engine_performance_focus",
    };
  }
  if (dominantCriterion === "camera" && /foto|câmera|camera|registrar/i.test(query)) {
    return {
      profile: VERBALIZATION_PROFILE.EXPLORATORY,
      pace: VERBALIZATION_PACE.EXPLANATORY,
      tone: VERBALIZATION_TONE.WARM,
      reason: "priority_engine_camera_focus",
    };
  }
  if (isExploratory || queryLength > 90) {
    return {
      profile: VERBALIZATION_PROFILE.EXPLORATORY,
      pace: VERBALIZATION_PACE.EXPLANATORY,
      tone: VERBALIZATION_TONE.WARM,
      reason: isExploratory ? "exploratory_query" : "long_query",
    };
  }
  return {
    profile: VERBALIZATION_PROFILE.CONVERSATIONAL,
    pace: VERBALIZATION_PACE.BALANCED,
    tone: VERBALIZATION_TONE.NEUTRAL,
    reason: "default_conversational",
  };
}

function connectorForProfile(profile, slot, seed = "") {
  if (profile.profile === VERBALIZATION_PROFILE.DIRECT) {
    return slot === "opening" ? "" : "";
  }
  if (profile.profile === VERBALIZATION_PROFILE.REASSURING) {
    return pickVariant(
      [
        "Pensando no uso real,",
        "Na prática,",
        "Considerando o dia a dia,",
      ],
      `${seed}|${slot}|reassuring`
    );
  }
  if (profile.profile === VERBALIZATION_PROFILE.EXPLORATORY) {
    return pickVariant(
      [
        "Olhando o conjunto da decisão,",
        "No recorte que você trouxe,",
        "Considerando o que você busca,",
      ],
      `${seed}|${slot}|exploratory`
    );
  }
  return pickVariant(
    ["Na prática,", "Pelo que mapeei,", "Nesse recorte,"],
    `${seed}|${slot}|conversational`
  );
}

function slotFromSection(section, profile, seed) {
  const text = cleanText(section?.legacyText || "");
  if (!text) return null;
  const connector =
    section.sectionType === NARRATIVE_SECTION_TYPE.PRIMARY_NARRATIVE
      ? connectorForProfile(profile, "opening", seed)
      : section.sectionType === NARRATIVE_SECTION_TYPE.SUPPORTING_ARGUMENT
        ? connectorForProfile(profile, "supporting", seed)
        : "";
  return {
    slot:
      section.sectionType === NARRATIVE_SECTION_TYPE.PRIMARY_NARRATIVE
        ? "main_message"
        : section.sectionType === NARRATIVE_SECTION_TYPE.SUPPORTING_ARGUMENT
          ? "supporting_message"
          : section.sectionType === NARRATIVE_SECTION_TYPE.TRADEOFF
            ? "tradeoff"
            : "caveat",
    text,
    unitId: section.unitId || null,
    effectKey: section.effectKey || null,
    hierarchyRank: section.hierarchyRank,
    connector: connector || null,
    sourceSectionType: section.sectionType,
  };
}

/**
 * @param {ReturnType<import("./miaNarrativePlanner.js").buildNarrativePlan>|null} narrativePlan
 * @param {Record<string, unknown>} [context]
 */
export function buildVerbalizationPlan(narrativePlan = null, context = {}) {
  const profile = resolveVerbalizationProfile(context);
  const seed = cleanText(
    [context.query, context.winnerName, context.productName, profile.profile].filter(Boolean).join("|")
  );

  if (!hasNarrativePlan(narrativePlan)) {
    return {
      schemaVersion: SEMANTIC_VERBALIZER_VERSION,
      narrativePlanRef: null,
      opening: { intent: "neutral", connector: null, seed },
      mainMessage: null,
      supportingMessages: [],
      tradeoffs: [],
      caveats: [],
      closingIntent: {
        type: narrativePlan?.recommendedClosing?.type || NARRATIVE_CLOSING_TYPE.NEUTRAL,
        reason: narrativePlan?.recommendedClosing?.reason || "empty_plan",
      },
      tone: { profile: profile.tone, pace: profile.pace },
      variationProfile: {
        id: profile.profile,
        directness: profile.pace,
        explanationDepth: profile.pace,
        reason: profile.reason,
      },
      sections: [],
      llmContract: {
        llmCanOnlyVerbalize: true,
        mustPreserveFacts: true,
        forbiddenInvention: true,
        sectionOrder: ["opening"],
      },
      trace: { builtFromNarrativePlan: false, sectionCount: 0 },
      meta: { categoryAgnostic: true },
    };
  }

  const mainMessage = narrativePlan.primaryNarrative
    ? slotFromSection(narrativePlan.primaryNarrative, profile, seed)
    : null;

  const supportingMessages = (narrativePlan.supportingArguments || [])
    .map((section) => slotFromSection(section, profile, seed))
    .filter(Boolean);

  const tradeoffs = (narrativePlan.tradeoffs || [])
    .map((section) => slotFromSection(section, profile, seed))
    .filter(Boolean);

  const caveats = (narrativePlan.caveats || [])
    .map((section) => slotFromSection(section, profile, seed))
    .filter(Boolean);

  const orderedSlots = [
    mainMessage,
    ...supportingMessages,
    ...tradeoffs,
    ...caveats,
  ].filter(Boolean);

  const sectionOrder = narrativePlanToVerbalizationOrder(narrativePlan) || ["opening"];

  return {
    schemaVersion: SEMANTIC_VERBALIZER_VERSION,
    narrativePlanRef: {
      schemaVersion: narrativePlan.schemaVersion,
      sectionCount: narrativePlan.sections?.length || 0,
      closingType: narrativePlan.recommendedClosing?.type || null,
      primaryEffectKey: narrativePlan.primaryNarrative?.effectKey || null,
      primaryUnitId: narrativePlan.primaryNarrative?.unitId || null,
    },
    opening: {
      intent: profile.profile,
      connector: mainMessage?.connector || connectorForProfile(profile, "opening", seed) || null,
      seed,
    },
    mainMessage,
    supportingMessages,
    tradeoffs,
    caveats,
    closingIntent: {
      type: narrativePlan.recommendedClosing?.type || NARRATIVE_CLOSING_TYPE.NEUTRAL,
      reason: narrativePlan.recommendedClosing?.reason || "from_narrative_plan",
    },
    tone: { profile: profile.tone, pace: profile.pace },
    variationProfile: {
      id: profile.profile,
      directness: profile.pace,
      explanationDepth: profile.pace,
      reason: profile.reason,
    },
    sections: orderedSlots,
    llmContract: {
      llmCanOnlyVerbalize: true,
      mustPreserveFacts: true,
      forbiddenInvention: true,
      sectionOrder,
      closingType: narrativePlan.recommendedClosing?.type || null,
    },
    trace: {
      builtFromNarrativePlan: true,
      sectionCount: orderedSlots.length,
      variationProfile: profile.profile,
      tone: profile.tone,
    },
    meta: { categoryAgnostic: true },
  };
}

/**
 * @param {ReturnType<typeof buildVerbalizationPlan>|null} verbalizationPlan
 * @param {ReturnType<import("./miaNarrativePlanner.js").buildNarrativePlan>|null} narrativePlan
 */
export function validateVerbalizationPlan(verbalizationPlan, narrativePlan = null) {
  const errors = [];
  if (!verbalizationPlan || typeof verbalizationPlan !== "object") {
    return { valid: false, errors: ["verbalization_plan_missing"] };
  }
  if (verbalizationPlan.schemaVersion !== SEMANTIC_VERBALIZER_VERSION) {
    errors.push("schema_version_mismatch");
  }
  if (!verbalizationPlan.llmContract?.mustPreserveFacts) {
    errors.push("must_preserve_facts_missing");
  }
  if (narrativePlan && hasNarrativePlan(narrativePlan)) {
    const planValidation = validateNarrativePlan(narrativePlan);
    if (!planValidation.valid) {
      errors.push("narrative_plan_invalid");
    }
    const primaryText = cleanText(narrativePlan.primaryNarrative?.legacyText || "");
    const verbalPrimary = cleanText(verbalizationPlan.mainMessage?.text || "");
    if (primaryText && verbalPrimary && primaryText !== verbalPrimary) {
      errors.push("main_message_fact_drift");
    }
    const narrativeTradeoffs = (narrativePlan.tradeoffs || []).map((entry) =>
      cleanText(entry.legacyText || "")
    );
    const verbalTradeoffs = (verbalizationPlan.tradeoffs || []).map((entry) => cleanText(entry.text || ""));
    if (
      narrativeTradeoffs.length &&
      (narrativeTradeoffs.length !== verbalTradeoffs.length ||
        narrativeTradeoffs.some((text, index) => text !== verbalTradeoffs[index]))
    ) {
      errors.push("tradeoff_fact_drift");
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Ordered legacy-compatible strings derived from VerbalizationPlan (not self-built).
 * @param {ReturnType<typeof buildVerbalizationPlan>|null} plan
 */
export function verbalizationPlanToOrderedLegacyStrings(plan = null) {
  if (!plan?.sections?.length) {
    return { gains: [], sacrifices: [], caveats: [] };
  }
  const gains = [
    plan.mainMessage?.text,
    ...(plan.supportingMessages || []).map((entry) => entry.text),
  ].filter(Boolean);
  return {
    gains,
    sacrifices: (plan.tradeoffs || []).map((entry) => entry.text).filter(Boolean),
    caveats: (plan.caveats || []).map((entry) => entry.text).filter(Boolean),
  };
}

export function verbalizationPlanToLlmContract(plan = null) {
  if (!plan?.llmContract) return null;
  return {
    ...plan.llmContract,
    tone: plan.tone || null,
    variationProfile: plan.variationProfile || null,
    closingIntent: plan.closingIntent || null,
    slots: (plan.sections || []).map((entry) => ({
      slot: entry.slot,
      text: entry.text,
      connector: entry.connector || null,
      unitId: entry.unitId,
      effectKey: entry.effectKey,
    })),
  };
}

export function hasVerbalizationPlan(value) {
  return !!value?.schemaVersion && value.schemaVersion === SEMANTIC_VERBALIZER_VERSION;
}

export function verbalizationPlanToTrace(plan = null) {
  if (!plan) return null;
  return {
    version: plan.schemaVersion || SEMANTIC_VERBALIZER_VERSION,
    sectionCount: plan.sections?.length || 0,
    variationProfile: plan.variationProfile?.id || null,
    tone: plan.tone?.profile || null,
    closingType: plan.closingIntent?.type || null,
    builtFromNarrativePlan: !!plan.trace?.builtFromNarrativePlan,
  };
}

/**
 * @param {ReturnType<import("./miaNarrativePlanner.js").buildNarrativePlan>|null} narrativePlan
 * @param {Record<string, unknown>} [context]
 */
export function buildSemanticVerbalizationPayload(narrativePlan = null, context = {}) {
  const verbalizationPlan = buildVerbalizationPlan(narrativePlan, context);
  const validation = validateVerbalizationPlan(verbalizationPlan, narrativePlan);
  return {
    version: SEMANTIC_VERBALIZER_VERSION,
    verbalizationPlan,
    validation,
    llmContract: verbalizationPlanToLlmContract(verbalizationPlan),
    legacy: verbalizationPlanToOrderedLegacyStrings(verbalizationPlan),
  };
}

export function buildVerbalizationPlanFromNarrativePlan(narrativePlan = null, context = {}) {
  return buildVerbalizationPlan(narrativePlan, context);
}
