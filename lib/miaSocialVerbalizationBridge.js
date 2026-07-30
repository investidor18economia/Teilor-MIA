/**
 * PATCH 4.1I.2 — Social Verbalization Bridge
 *
 * Translates social intent taxonomy signals (already decided by MIA) into
 * structured verbalization instructions for the Prompt Builder / LLM.
 *
 * MIA owns the intelligence. This layer only translates — never decides.
 */

import {
  SOCIAL_INTENT_TAXONOMY_VERSION,
  SOCIAL_INTENT_FAMILIES,
  EXPECTED_HUMAN_BEHAVIORS,
  CONVERSATION_OBJECTIVES,
  CONVERSATION_DIRECTIONS,
  EMOTIONAL_STATES,
} from "./miaSocialIntentTaxonomy.js";

export const SOCIAL_VERBALIZATION_BRIDGE_VERSION = "4.1I.2";

/** Verbalization hints — translation of expectedHumanBehavior (not new decisions). */
const EXPECTED_BEHAVIOR_VERBALIZATION = Object.freeze({
  [EXPECTED_HUMAN_BEHAVIORS.MIRROR_GREETING]:
    "Espelhe o cumprimento de forma natural e breve.",
  [EXPECTED_HUMAN_BEHAVIORS.RECIPROCATE_WARMTH]:
    "Reciprocar calor humano sem exagerar intimidade.",
  [EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_GRATITUDE]:
    "Reconheça o agradecimento de forma direta.",
  [EXPECTED_HUMAN_BEHAVIORS.RECEIVE_COMPLIMENT]:
    "Receba o elogio dirigido à MIA; não desvie para produto ou compra.",
  [EXPECTED_HUMAN_BEHAVIORS.DEFLECT_FLIRT]:
    "Desvie flirt leve com naturalidade, sem rejeição dura.",
  [EXPECTED_HUMAN_BEHAVIORS.PLAY_HUMOR]:
    "Acompanhe ironia ou brincadeira com leveza; reconheça o tom.",
  [EXPECTED_HUMAN_BEHAVIORS.VALIDATE_EMOTION]:
    "Valide a emoção expressa sem diagnosticar ou aconselhar.",
  [EXPECTED_HUMAN_BEHAVIORS.DE_ESCALATE]:
    "Desescale tensão; mantenha calma e objetividade.",
  [EXPECTED_HUMAN_BEHAVIORS.REPAIR_CONTEXT]:
    "Repare entendimento; reconheça que algo não ficou claro.",
  [EXPECTED_HUMAN_BEHAVIORS.ANSWER_META]:
    "Responda meta/pergunta sobre a MIA de forma clara e breve.",
  [EXPECTED_HUMAN_BEHAVIORS.BUILD_TRUST]:
    "Construa confiança com transparência; sem pitch institucional.",
  [EXPECTED_HUMAN_BEHAVIORS.SMALL_TALK_REPLY]:
    "Responda conversa leve de forma proporcional.",
  [EXPECTED_HUMAN_BEHAVIORS.RECEIVE_REACTION]:
    "Receba reação curta de forma natural.",
  [EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_APPROVAL]:
    "Reconheça aprovação ou concordância.",
  [EXPECTED_HUMAN_BEHAVIORS.INVITE_CLARIFICATION]:
    "Convide esclarecimento somente se necessário.",
  [EXPECTED_HUMAN_BEHAVIORS.STAY_SOCIAL]:
    "Mantenha tom social; não force redirecionamento comercial.",
});

/** Family labels for prompt — descriptive translation only. */
const FAMILY_VERBALIZATION_LABEL = Object.freeze({
  [SOCIAL_INTENT_FAMILIES.GREETING]: "cumprimento",
  [SOCIAL_INTENT_FAMILIES.FAREWELL]: "despedida",
  [SOCIAL_INTENT_FAMILIES.GRATITUDE]: "gratidão",
  [SOCIAL_INTENT_FAMILIES.COMPLIMENT]: "elogio à MIA",
  [SOCIAL_INTENT_FAMILIES.PRAISE]: "elogio / reconhecimento",
  [SOCIAL_INTENT_FAMILIES.AFFECTION]: "afeto",
  [SOCIAL_INTENT_FAMILIES.IRONY]: "ironia",
  [SOCIAL_INTENT_FAMILIES.SARCASM]: "sarcasmo",
  [SOCIAL_INTENT_FAMILIES.HUMOR]: "humor",
  [SOCIAL_INTENT_FAMILIES.JOKE]: "piada",
  [SOCIAL_INTENT_FAMILIES.FRUSTRATION]: "frustração",
  [SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST]: "pedido de conversa",
  [SOCIAL_INTENT_FAMILIES.SMALL_TALK]: "conversa leve",
  [SOCIAL_INTENT_FAMILIES.CORRECTION]: "correção de entendimento",
  [SOCIAL_INTENT_FAMILIES.EMOTIONAL_SUPPORT]: "apoio emocional",
  [SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION]: "pergunta identitária",
  [SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION]: "pergunta de capacidade",
  [SOCIAL_INTENT_FAMILIES.TRUST_QUESTION]: "pergunta de confiança",
});

function formatList(values = []) {
  const items = (Array.isArray(values) ? values : []).filter(Boolean);
  return items.length ? items.join(", ") : "n/a";
}

function formatConfidence(value) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return String(Number(value).toFixed(2));
}

/**
 * Extract taxonomy fields from behavior contract (single source of truth).
 */
export function extractSocialTaxonomyFromContract(contract = {}) {
  return {
    taxonomyVersion: contract.socialTaxonomyVersion || SOCIAL_INTENT_TAXONOMY_VERSION,
    primarySocialIntent: contract.primarySocialIntent || null,
    secondarySocialIntent: contract.secondarySocialIntent || null,
    emotionalState: contract.emotionalState || null,
    expectedHumanBehavior: contract.expectedHumanBehavior || null,
    conversationObjective: contract.conversationObjective || null,
    conversationDirection: contract.conversationDirection || null,
    socialIntentSignals: contract.socialIntentSignals || [],
    socialIntentReasonCodes: contract.socialIntentReasonCodes || [],
    socialIntentConfidence: contract.socialIntentConfidence ?? null,
  };
}

/**
 * Translate contract taxonomy fields into LLM verbalization instructions.
 * Does not decide — only reflects fields already on the contract.
 */
export function socialVerbalizationBridgeToInstructions(contract = {}) {
  const taxonomy = extractSocialTaxonomyFromContract(contract);

  if (!taxonomy.primarySocialIntent) {
    return "";
  }

  const familyLabel =
    FAMILY_VERBALIZATION_LABEL[taxonomy.primarySocialIntent] ||
    taxonomy.primarySocialIntent;
  const secondaryLabel = taxonomy.secondarySocialIntent
    ? FAMILY_VERBALIZATION_LABEL[taxonomy.secondarySocialIntent] ||
      taxonomy.secondarySocialIntent
    : null;
  const behaviorHint = taxonomy.expectedHumanBehavior
    ? EXPECTED_BEHAVIOR_VERBALIZATION[taxonomy.expectedHumanBehavior] || null
    : null;

  const lines = [
    `Taxonomia social governada (${SOCIAL_VERBALIZATION_BRIDGE_VERSION} — obrigatório, apenas verbalizar):`,
    `- Família social primária: ${taxonomy.primarySocialIntent} (${familyLabel})`,
    `- Família social secundária: ${secondaryLabel || "n/a"}`,
    `- Estado emocional: ${taxonomy.emotionalState || EMOTIONAL_STATES.NEUTRAL}`,
    `- Comportamento humano esperado: ${taxonomy.expectedHumanBehavior || "n/a"}`,
    `- Objetivo conversacional: ${taxonomy.conversationObjective || "n/a"}`,
    `- Direção conversacional: ${taxonomy.conversationDirection || CONVERSATION_DIRECTIONS.CONTINUE}`,
    `- Confiança da classificação: ${formatConfidence(taxonomy.socialIntentConfidence)}`,
    `- Sinais: ${formatList(taxonomy.socialIntentSignals)}`,
    `- Códigos de razão: ${formatList(taxonomy.socialIntentReasonCodes)}`,
    "- A MIA já decidiu a família social; verbalize conforme esses sinais.",
    "- Não reclassifique, não invente intenção, não mova decisão para o LLM.",
  ];

  if (behaviorHint) {
    lines.push(`- Orientação de verbalização: ${behaviorHint}`);
  }

  return lines.join("\n");
}

/**
 * Enrich contract with bridge metadata (trace/debug).
 */
export function enrichContractWithSocialVerbalizationBridge(contract = {}) {
  if (!contract?.primarySocialIntent) {
    return contract;
  }

  return {
    ...contract,
    socialVerbalizationBridgeVersion: SOCIAL_VERBALIZATION_BRIDGE_VERSION,
    socialTaxonomyVersion: contract.socialTaxonomyVersion || SOCIAL_INTENT_TAXONOMY_VERSION,
  };
}

export function socialVerbalizationBridgeToTrace(contract = null) {
  if (!contract?.primarySocialIntent) return null;

  const taxonomy = extractSocialTaxonomyFromContract(contract);
  return {
    version: SOCIAL_VERBALIZATION_BRIDGE_VERSION,
    taxonomyVersion: taxonomy.taxonomyVersion,
    primarySocialIntent: taxonomy.primarySocialIntent,
    secondarySocialIntent: taxonomy.secondarySocialIntent,
    emotionalState: taxonomy.emotionalState,
    expectedHumanBehavior: taxonomy.expectedHumanBehavior,
    conversationObjective: taxonomy.conversationObjective,
    conversationDirection: taxonomy.conversationDirection,
    socialIntentSignals: taxonomy.socialIntentSignals,
    socialIntentReasonCodes: taxonomy.socialIntentReasonCodes,
    socialIntentConfidence: taxonomy.socialIntentConfidence,
    instructionsPresent: !!socialVerbalizationBridgeToInstructions(contract),
  };
}

/**
 * Validate that taxonomy fields reached the final prompt text.
 */
export function validateSocialTaxonomyInPrompt(promptText = "", contract = {}) {
  const text = String(promptText || "");
  const taxonomy = extractSocialTaxonomyFromContract(contract);
  const missing = [];

  if (!taxonomy.primarySocialIntent) {
    return { valid: false, missing: ["primarySocialIntent"], taxonomy };
  }

  const requiredInPrompt = [
    ["primarySocialIntent", taxonomy.primarySocialIntent],
    ["expectedHumanBehavior", taxonomy.expectedHumanBehavior],
    ["conversationObjective", taxonomy.conversationObjective],
    ["conversationDirection", taxonomy.conversationDirection],
    ["emotionalState", taxonomy.emotionalState],
  ];

  for (const [field, value] of requiredInPrompt) {
    if (value && !text.includes(String(value))) {
      missing.push(field);
    }
  }

  if (
    Array.isArray(taxonomy.socialIntentSignals) &&
    taxonomy.socialIntentSignals.length > 0 &&
    !text.includes("Sinais:")
  ) {
    missing.push("socialIntentSignals");
  }

  if (!text.includes(SOCIAL_VERBALIZATION_BRIDGE_VERSION)) {
    missing.push("bridgeVersion");
  }

  return {
    valid: missing.length === 0,
    missing,
    taxonomy,
  };
}
