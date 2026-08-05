/**
 * PATCH 5.8.8.3 — Conversational Intent Governance
 *
 * Official personality principles and intent-level behavior contracts.
 * Teaches intentions — never fixed phrases. LLM verbalizes; MIA governs.
 * Does NOT alter Decision Engine, Intent Recognition, Ranking or Recovery.
 */

import { EXPECTED_HUMAN_BEHAVIORS } from "./miaSocialIntentTaxonomy.js";
import {
  SOCIAL_HUMANIZATION_BEHAVIOR,
  EMOTIONAL_CATEGORY,
  buildGratitudeWithPresenceReply,
  buildCuriosityEngagementReply,
  buildCelebrateLightlyReply,
} from "./miaSocialHumanizationGovernance.js";
import { buildGovernedIdentityReply } from "./miaPersonalityGovernance.js";

export const CONVERSATIONAL_INTENT_VERSION = "5.8.8.3";

export const CONVERSATIONAL_INTENT = Object.freeze({
  GRATITUDE: "gratitude",
  GREETING: "greeting",
  FAREWELL: "farewell",
  RECIPROCITY: "reciprocity",
  SMALL_TALK: "small_talk",
  DISTRESS: "distress",
  CURIOSITY_HOOK: "curiosity_hook",
  CELEBRATION: "celebration",
  IDENTITY_META: "identity_meta",
});

export const OFFICIAL_PERSONALITY_TRAITS = Object.freeze([
  "humana",
  "carismatica",
  "leve",
  "proxima",
  "transparente",
  "simpatica",
  "especialista",
  "confiante",
  "acolhedora",
]);

export const OFFICIAL_PERSONALITY_FORBIDDEN = Object.freeze([
  "robotica",
  "institucional",
  "corporativa",
  "excessivamente_tecnica",
  "marketing",
  "fria",
]);

export const PARTICIPATION_PRINCIPLE =
  "Sempre que o contexto permitir, participar emocionalmente da conversa de forma leve e natural — demonstrar interesse, curiosidade, alegria, surpresa ou satisfação compatíveis com o contexto.";

const GRATITUDE_PATTERN =
  /\b(obrigad\w*|valeu|vlw|brigad\w*|thanks|thank you|tmj|grato|grata|agrade\w*)\b/i;

const CURIOSITY_HOOK_PATTERN =
  /\b(acredita|olha\s+isso|tenho\s+(?:uma\s+)?novidade|adivinha|aconteceu\s+(?:um\s+)?neg[oó]cio|preciso\s+te\s+contar|n[aã]o\s+vai\s+acreditar)\b/i;

const CELEBRATION_PATTERN =
  /\b(consegui|passei|terminei|lancei|bati\s+(?:minha\s+)?meta|deu\s+certo|finalmente|venci|conquist\w*|arras\w*)\b/i;

const BARE_COLD_GRATITUDE = /^(disponha\.?!?|de\s+nada\.?!?|por\s+nada\.?!?)\s*$/i;

const BARE_COLD_MICRO =
  /^(entendi|entendo|compreendo|claro|beleza|certo|ok|show|sem\s+problema|pode\s+falar)\.?\s*$/i;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBareColdGratitudeResponse(text = "") {
  return BARE_COLD_GRATITUDE.test(String(text || "").trim());
}

export function isBareColdMicroAck(text = "") {
  return BARE_COLD_MICRO.test(String(text || "").trim());
}

export function requiresDeterministicWarmth(contract = {}) {
  if (contract.conversationalIntentPolicy?.requireDeterministicWarmth) return true;
  if (contract.conversationalIntent === CONVERSATIONAL_INTENT.GRATITUDE) return true;
  if (contract.expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_GRATITUDE) return true;
  if (contract.socialHumanizationBehavior === SOCIAL_HUMANIZATION_BEHAVIOR.GRATITUDE_WITH_PRESENCE) {
    return true;
  }
  return false;
}

export function resolveConversationalIntent(message = "", recognition = {}, contract = {}) {
  const q = normalizeText(message || contract.resolvedQuery || "");
  if (!q) return null;

  if (
    recognition.primaryIntent === "acknowledgement" ||
    contract.expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_GRATITUDE ||
    GRATITUDE_PATTERN.test(q)
  ) {
    return CONVERSATIONAL_INTENT.GRATITUDE;
  }

  if (contract.identityQueryKind || contract.expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.ANSWER_META) {
    return CONVERSATIONAL_INTENT.IDENTITY_META;
  }

  if (recognition.primaryIntent === "greeting" || recognition.socialFamilies?.greeting) {
    return CONVERSATIONAL_INTENT.GREETING;
  }

  if (contract.farewellMode || contract.socialDepartureMode || recognition.socialFamilies?.farewell) {
    return CONVERSATIONAL_INTENT.FAREWELL;
  }

  if (contract.centralPersonalityPolicy?.reciprocalPrompt) {
    return CONVERSATIONAL_INTENT.RECIPROCITY;
  }

  if (CURIOSITY_HOOK_PATTERN.test(q)) {
    return CONVERSATIONAL_INTENT.CURIOSITY_HOOK;
  }

  if (CELEBRATION_PATTERN.test(q)) {
    return CONVERSATIONAL_INTENT.CELEBRATION;
  }

  if (recognition.interactionMode === "emotional_support") {
    return CONVERSATIONAL_INTENT.DISTRESS;
  }

  if (recognition.socialFamilies?.reaction) {
    return CONVERSATIONAL_INTENT.SMALL_TALK;
  }

  return null;
}

function resolveIntentPolicy(intent, contract = {}) {
  const base = {
    intent,
    requireDeterministicWarmth: false,
    requireIdentityAnchor: false,
    requireEmotionalParticipation: false,
    forbidBareAcknowledgement: false,
    preferredHumanizationBehavior: null,
    preferredWarmthMoment: null,
  };

  switch (intent) {
    case CONVERSATIONAL_INTENT.GRATITUDE:
      return {
        ...base,
        requireDeterministicWarmth: true,
        forbidBareAcknowledgement: true,
        requireEmotionalParticipation: true,
        preferredHumanizationBehavior: SOCIAL_HUMANIZATION_BEHAVIOR.GRATITUDE_WITH_PRESENCE,
        preferredWarmthMoment: "gratitude_presence",
      };
    case CONVERSATIONAL_INTENT.IDENTITY_META:
      return {
        ...base,
        requireIdentityAnchor: true,
        requireEmotionalParticipation: true,
      };
    case CONVERSATIONAL_INTENT.GREETING:
      return {
        ...base,
        requireEmotionalParticipation: true,
        preferredWarmthMoment: "greeting_warm",
      };
    case CONVERSATIONAL_INTENT.FAREWELL:
      return {
        ...base,
        requireEmotionalParticipation: true,
        preferredWarmthMoment: "farewell_warm",
      };
    case CONVERSATIONAL_INTENT.RECIPROCITY:
      return {
        ...base,
        requireDeterministicWarmth: true,
        requireEmotionalParticipation: true,
        preferredHumanizationBehavior: SOCIAL_HUMANIZATION_BEHAVIOR.RECIPROCAL_ENGAGEMENT,
        preferredWarmthMoment: "reciprocal_warm",
      };
    case CONVERSATIONAL_INTENT.CURIOSITY_HOOK:
      return {
        ...base,
        requireEmotionalParticipation: true,
        preferredHumanizationBehavior: SOCIAL_HUMANIZATION_BEHAVIOR.CURIOSITY_ENGAGEMENT,
      };
    case CONVERSATIONAL_INTENT.CELEBRATION:
      return {
        ...base,
        requireEmotionalParticipation: true,
        preferredHumanizationBehavior: SOCIAL_HUMANIZATION_BEHAVIOR.CELEBRATE_LIGHTLY,
      };
    case CONVERSATIONAL_INTENT.DISTRESS:
      return {
        ...base,
        requireDeterministicWarmth: true,
        requireEmotionalParticipation: true,
        preferredHumanizationBehavior: SOCIAL_HUMANIZATION_BEHAVIOR.COMFORT_WITHOUT_THERAPY,
        preferredWarmthMoment: "empathetic_presence",
      };
    case CONVERSATIONAL_INTENT.SMALL_TALK:
      return {
        ...base,
        requireEmotionalParticipation: true,
        preferredHumanizationBehavior: SOCIAL_HUMANIZATION_BEHAVIOR.LIGHT_HUMOR_REACT,
      };
    default:
      return base;
  }
}

export function enrichContractWithConversationalIntent(
  contract = {},
  { message = "", recognition = null } = {}
) {
  const rec = recognition || {};
  const intent = resolveConversationalIntent(message, rec, contract);
  if (!intent) {
    return {
      ...contract,
      conversationalIntentVersion: CONVERSATIONAL_INTENT_VERSION,
    };
  }

  const policy = resolveIntentPolicy(intent, contract);
  let enriched = {
    ...contract,
    conversationalIntentVersion: CONVERSATIONAL_INTENT_VERSION,
    conversationalIntent: intent,
    conversationalIntentPolicy: policy,
    officialPersonalityTraits: OFFICIAL_PERSONALITY_TRAITS,
    participationPrinciple: PARTICIPATION_PRINCIPLE,
  };

  if (
    policy.preferredHumanizationBehavior &&
    !enriched.socialHumanizationBehavior
  ) {
    enriched = {
      ...enriched,
      socialHumanizationBehavior: policy.preferredHumanizationBehavior,
    };
  }

  if (intent === CONVERSATIONAL_INTENT.GRATITUDE) {
    enriched = {
      ...enriched,
      expectedHumanBehavior: EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_GRATITUDE,
      socialHumanizationBehavior: SOCIAL_HUMANIZATION_BEHAVIOR.GRATITUDE_WITH_PRESENCE,
      socialHumanization: {
        ...(enriched.socialHumanization || {}),
        emotionalCategory: EMOTIONAL_CATEGORY.GRATITUDE,
        empathyLevel: "moderate",
        expressivenessLevel: "natural",
      },
    };
  }

  if (policy.preferredWarmthMoment && enriched.humanWarmthPresence) {
    enriched = {
      ...enriched,
      humanWarmthPresence: {
        ...enriched.humanWarmthPresence,
        responseMoment: policy.preferredWarmthMoment,
        responseWarmthStrategy: {
          allowShort: false,
          requirePresence: true,
          requireReciprocity: intent === CONVERSATIONAL_INTENT.RECIPROCITY,
          requireWarmth: true,
        },
      },
    };
  }

  return enriched;
}

export function detectConversationalIntentViolations(text = "", contract = {}) {
  const violations = [];
  const raw = String(text || "").trim();
  if (!raw || !contract.conversationalIntentVersion) return violations;

  const policy = contract.conversationalIntentPolicy || {};

  if (policy.forbidBareAcknowledgement && isBareColdGratitudeResponse(raw)) {
    violations.push("bare_cold_gratitude");
  }

  if (
    policy.requireDeterministicWarmth &&
    (isBareColdGratitudeResponse(raw) || isBareColdMicroAck(raw))
  ) {
    violations.push("deterministic_warmth_required");
  }

  return violations;
}

export function applyConversationalIntentGovernance(text = "", contract = {}) {
  const raw = String(text || "").trim();
  if (!raw || !contract.conversationalIntentVersion) {
    return { reply: raw, replaced: false, violations: [] };
  }

  const violations = detectConversationalIntentViolations(raw, contract);
  if (!violations.length) {
    return { reply: raw, replaced: false, violations: [] };
  }

  let corrected = "";
  switch (contract.conversationalIntent) {
    case CONVERSATIONAL_INTENT.GRATITUDE:
      corrected = buildGratitudeWithPresenceReply(contract);
      break;
    case CONVERSATIONAL_INTENT.IDENTITY_META:
      corrected = buildGovernedIdentityReply(contract);
      break;
    case CONVERSATIONAL_INTENT.CURIOSITY_HOOK:
      corrected = buildCuriosityEngagementReply(contract);
      break;
    case CONVERSATIONAL_INTENT.CELEBRATION:
      corrected = buildCelebrateLightlyReply(contract);
      break;
    default:
      break;
  }

  if (corrected && normalizeText(corrected) !== normalizeText(raw)) {
    return { reply: corrected, replaced: true, violations };
  }

  return { reply: raw, replaced: false, violations };
}

export function conversationalIntentToVerbalizationInstructions(contract = {}) {
  if (!contract.conversationalIntentVersion) return "";

  const intent = contract.conversationalIntent;
  const lines = [
    "Intenção conversacional governada (PATCH 5.8.8.3):",
    `- Princípio: ${PARTICIPATION_PRINCIPLE}`,
    `- Personalidade: ${OFFICIAL_PERSONALITY_TRAITS.join(", ")}`,
    `- Evitar: ${OFFICIAL_PERSONALITY_FORBIDDEN.join(", ")}`,
  ];

  if (intent === CONVERSATIONAL_INTENT.GRATITUDE) {
    lines.push(
      "- Intenção GRATIDÃO: transmitir satisfação em ajudar; respostas curtas podem ser curtas, mas sempre calorosas; nunca responder apenas 'De nada' ou equivalente frio."
    );
  }
  if (intent === CONVERSATIONAL_INTENT.IDENTITY_META) {
    lines.push(
      "- Intenção IDENTIDADE: propósito, confiança, transparência — natural, não marketing nem documentação."
    );
  }
  if (intent === CONVERSATIONAL_INTENT.CURIOSITY_HOOK) {
    lines.push("- Intenção CURIOSIDADE: demonstrar interesse genuíno; incentivar continuar sem interrogatório.");
  }
  if (intent === CONVERSATIONAL_INTENT.CELEBRATION) {
    lines.push("- Intenção COMEMORAÇÃO: celebrar, reconhecer esforço, continuar naturalmente.");
  }
  if (intent === CONVERSATIONAL_INTENT.DISTRESS) {
    lines.push("- Intenção DESABAFO: acolher com presença — nunca terapêutica, nunca minimizar.");
  }

  return lines.join("\n");
}
