/**
 * PATCH 5.8.8 — Human Warmth & Presence Governance (Classe B)
 *
 * Governs human warmth, presence, proximity and conversational energy.
 * Does NOT decide intent, routing, ranking or recovery.
 * Enriches the contract — never replaces decisions.
 * Does NOT write fixed responses except via post-LLM presence correction.
 */

import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";
import { RESPONSE_DEPTH } from "./miaHumanConversationExperience.js";
import { EMOTIONAL_CATEGORY } from "./miaSocialHumanizationGovernance.js";
import { EXPECTED_HUMAN_BEHAVIORS } from "./miaSocialIntentTaxonomy.js";
import {
  classifyExpressionStructure,
  pickRhythmGovernedVariant,
} from "./miaConversationalRhythmGovernance.js";

const BARE_COLD_GRATITUDE_LOCAL = /^(disponha\.?!?|de\s+nada\.?!?|por\s+nada\.?!?)\s*$/i;
const BARE_COLD_MICRO_LOCAL =
  /^(entendi|entendo|compreendo|claro|beleza|certo|ok|show|sem\s+problema|pode\s+falar)\.?\s*$/i;

function requiresDeterministicWarmthLocal(contract = {}) {
  if (contract.conversationalIntentPolicy?.requireDeterministicWarmth) return true;
  if (contract.conversationalIntent === "gratitude") return true;
  if (contract.expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_GRATITUDE) return true;
  if (contract.socialHumanizationBehavior === "gratitude_with_presence") return true;
  return false;
}

export const HUMAN_WARMTH_PRESENCE_VERSION = "5.8.8.3";

export const HUMAN_WARMTH_LEVEL = Object.freeze({
  MINIMAL: "minimal",
  WARM: "warm",
  HIGH: "high",
  PRESENCE: "presence",
});

export const CONVERSATION_ENERGY = Object.freeze({
  LOW: "low",
  BALANCED: "balanced",
  HIGH: "high",
  RAPID: "rapid",
});

export const EMOTIONAL_PRESENCE = Object.freeze({
  DISTANT: "distant",
  NEUTRAL: "neutral",
  ATTUNED: "attuned",
  COMPANION: "companion",
});

export const HUMAN_DISTANCE = Object.freeze({
  CLOSE: "close",
  NEUTRAL: "neutral",
  PROFESSIONAL: "professional",
});

export const CONVERSATION_AFFINITY = Object.freeze({
  NEW: "new",
  WARMING: "warming",
  ESTABLISHED: "established",
});

export const PRESENCE_RESPONSE_MODE = Object.freeze({
  MICRO_CONFIRM: "micro_confirm",
  WARM_ACK: "warm_ack",
  PRESENCE_ACK: "presence_ack",
  RECIPROCAL_WARM: "reciprocal_warm",
  EMPATHETIC_PRESENCE: "empathetic_presence",
  LISTENER_PRESENCE: "listener_presence",
  GRATITUDE_PRESENCE: "gratitude_presence",
  FAREWELL_WARM: "farewell_warm",
  GREETING_WARM: "greeting_warm",
  CLARIFY_GENTLE: "clarify_gentle",
  STANDARD_WARM: "standard_warm",
});

const WARMTH_MARKER_PATTERN =
  /\b(opa|oi|ol[aá]|valeu|imagina|fico feliz|que bom|entendo|poxa|show|legal|obrigad|gentil|carinho|acompanh|ouvindo|pesad|compreendo|tamo|contigo|você|tranquil)\b/i;

const PRESENCE_MARKER_PATTERN =
  /\b(estou|fico|acompanh|ouvindo|por aqui|contigo|você|gentil|carinho|pesad|difícil|difícil|entendo —|compreendo —|imagino)\b/i;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCount(text = "") {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function countUserTurns(conversationMessages = []) {
  return (Array.isArray(conversationMessages) ? conversationMessages : []).filter(
    (m) => m?.role === "user"
  ).length;
}

function resolveConversationEnergy(contract = {}, recognition = {}) {
  const velocity = contract.conversationalRhythm?.interactionVelocity;
  if (velocity === "rapid") return CONVERSATION_ENERGY.RAPID;
  const emo = contract.socialHumanization?.emotionalCategory;
  if (
    emo === EMOTIONAL_CATEGORY.JOY ||
    emo === EMOTIONAL_CATEGORY.ACHIEVEMENT ||
    emo === EMOTIONAL_CATEGORY.LIGHT_HUMOR
  ) {
    return CONVERSATION_ENERGY.HIGH;
  }
  if (recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return CONVERSATION_ENERGY.LOW;
  }
  return CONVERSATION_ENERGY.BALANCED;
}

function resolveConversationAffinity(conversationMessages = []) {
  const turns = countUserTurns(conversationMessages);
  if (turns <= 1) return CONVERSATION_AFFINITY.NEW;
  if (turns <= 4) return CONVERSATION_AFFINITY.WARMING;
  return CONVERSATION_AFFINITY.ESTABLISHED;
}

function resolveHumanDistance(contract = {}, affinity = CONVERSATION_AFFINITY.NEW) {
  const perception = contract.socialPerception?.socialDistance;
  if (perception === "close") return HUMAN_DISTANCE.CLOSE;
  if (contract.interactionMode === MIA_INTERACTION_MODES.COMMERCE) {
    return HUMAN_DISTANCE.PROFESSIONAL;
  }
  if (affinity === CONVERSATION_AFFINITY.ESTABLISHED) return HUMAN_DISTANCE.CLOSE;
  return HUMAN_DISTANCE.NEUTRAL;
}

function resolveEmotionalPresence(contract = {}) {
  const empathy = contract.socialHumanization?.empathyLevel;
  const category = contract.socialHumanization?.emotionalCategory;
  const presence = contract.socialHumanization?.humanPresenceMode;

  if (empathy === "high" || category === EMOTIONAL_CATEGORY.DISTRESS) {
    return EMOTIONAL_PRESENCE.COMPANION;
  }
  if (empathy === "moderate" || presence === "listener") {
    return EMOTIONAL_PRESENCE.ATTUNED;
  }
  if (category === EMOTIONAL_CATEGORY.NONE && contract.followUpPolicy === "none") {
    return EMOTIONAL_PRESENCE.NEUTRAL;
  }
  return EMOTIONAL_PRESENCE.ATTUNED;
}

function resolveResponseMoment(contract = {}, recognition = {}) {
  const mode = recognition.interactionMode || contract.interactionMode;
  if (contract.farewellMode || contract.socialDepartureMode) return PRESENCE_RESPONSE_MODE.FAREWELL_WARM;
  if (recognition.primaryIntent === "greeting" || recognition.socialFamilies?.greeting) {
    return PRESENCE_RESPONSE_MODE.GREETING_WARM;
  }
  if (recognition.primaryIntent === "acknowledgement" || recognition.socialFamilies?.postPurchaseAck) {
    return PRESENCE_RESPONSE_MODE.GRATITUDE_PRESENCE;
  }
  if (contract.centralPersonalityPolicy?.reciprocalPrompt) {
    return PRESENCE_RESPONSE_MODE.RECIPROCAL_WARM;
  }
  if (contract.requiresClarification || recognition.requiresClarification) {
    return PRESENCE_RESPONSE_MODE.CLARIFY_GENTLE;
  }
  if (
    contract.expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.STAY_SOCIAL ||
    contract.socialHumanizationBehavior === "listener_mode"
  ) {
    return PRESENCE_RESPONSE_MODE.LISTENER_PRESENCE;
  }
  if (mode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return PRESENCE_RESPONSE_MODE.EMPATHETIC_PRESENCE;
  }
  if (contract.responseDepth === RESPONSE_DEPTH.MINIMAL) {
    return PRESENCE_RESPONSE_MODE.MICRO_CONFIRM;
  }
  return PRESENCE_RESPONSE_MODE.STANDARD_WARM;
}

function resolveHumanWarmthLevel(contract = {}, moment = PRESENCE_RESPONSE_MODE.STANDARD_WARM) {
  const empathy = contract.socialHumanization?.empathyLevel;
  const category = contract.socialHumanization?.emotionalCategory;

  if (
    moment === PRESENCE_RESPONSE_MODE.EMPATHETIC_PRESENCE ||
    moment === PRESENCE_RESPONSE_MODE.LISTENER_PRESENCE ||
    empathy === "high"
  ) {
    return HUMAN_WARMTH_LEVEL.PRESENCE;
  }
  if (
    moment === PRESENCE_RESPONSE_MODE.RECIPROCAL_WARM ||
    moment === PRESENCE_RESPONSE_MODE.GRATITUDE_PRESENCE ||
    moment === PRESENCE_RESPONSE_MODE.GREETING_WARM ||
    category === EMOTIONAL_CATEGORY.RECIPROCAL ||
    category === EMOTIONAL_CATEGORY.GRATITUDE
  ) {
    return HUMAN_WARMTH_LEVEL.HIGH;
  }
  if (moment === PRESENCE_RESPONSE_MODE.MICRO_CONFIRM) {
    return HUMAN_WARMTH_LEVEL.MINIMAL;
  }
  if (empathy === "moderate") return HUMAN_WARMTH_LEVEL.HIGH;
  return HUMAN_WARMTH_LEVEL.WARM;
}

function resolvePreferredStyles(moment, warmthLevel, distance) {
  const close = distance === HUMAN_DISTANCE.CLOSE;
  const styles = {
    preferredGreetingStyle: close ? "open_inviting" : "mirror_warm",
    preferredFarewellStyle: close ? "companion_close" : "warm_close",
    preferredAcknowledgementStyle:
      warmthLevel === HUMAN_WARMTH_LEVEL.MINIMAL ? "micro_warm" : "presence_ack",
    preferredClarificationStyle: close ? "gentle_inquiry" : "warm_context",
    preferredReciprocityStyle: close ? "companion_interest" : "genuine_return",
  };

  switch (moment) {
    case PRESENCE_RESPONSE_MODE.GREETING_WARM:
      styles.preferredGreetingStyle = "open_inviting";
      break;
    case PRESENCE_RESPONSE_MODE.FAREWELL_WARM:
      styles.preferredFarewellStyle = "companion_close";
      break;
    case PRESENCE_RESPONSE_MODE.RECIPROCAL_WARM:
      styles.preferredReciprocityStyle = "genuine_return";
      break;
    case PRESENCE_RESPONSE_MODE.GRATITUDE_PRESENCE:
      styles.preferredAcknowledgementStyle = "presence_ack";
      break;
    case PRESENCE_RESPONSE_MODE.CLARIFY_GENTLE:
      styles.preferredClarificationStyle = "gentle_inquiry";
      break;
    default:
      break;
  }

  return styles;
}

function resolveResponseWarmthStrategy(warmthLevel, moment) {
  if (warmthLevel === HUMAN_WARMTH_LEVEL.MINIMAL) {
    return { allowShort: true, requirePresence: false, requireReciprocity: false, requireWarmth: false };
  }
  if (warmthLevel === HUMAN_WARMTH_LEVEL.PRESENCE || warmthLevel === HUMAN_WARMTH_LEVEL.HIGH) {
    return {
      allowShort: false,
      requirePresence: true,
      requireReciprocity: moment === PRESENCE_RESPONSE_MODE.RECIPROCAL_WARM,
      requireWarmth: true,
    };
  }
  return { allowShort: true, requirePresence: true, requireWarmth: true, requireReciprocity: false };
}

export function resolveHumanWarmthPresence({
  contract = {},
  recognition = {},
  conversationMessages = [],
} = {}) {
  const energy = resolveConversationEnergy(contract, recognition);
  const affinity = resolveConversationAffinity(conversationMessages);
  const humanDistance = resolveHumanDistance(contract, affinity);
  const emotionalPresence = resolveEmotionalPresence(contract);
  const responseMoment = resolveResponseMoment(contract, recognition);
  const humanWarmthLevel = resolveHumanWarmthLevel(contract, responseMoment);
  const styles = resolvePreferredStyles(responseMoment, humanWarmthLevel, humanDistance);
  const strategy = resolveResponseWarmthStrategy(humanWarmthLevel, responseMoment);

  return {
    version: HUMAN_WARMTH_PRESENCE_VERSION,
    humanWarmthLevel,
    conversationEnergy: energy,
    emotionalPresence,
    humanDistance,
    conversationAffinity: affinity,
    responseMoment,
    responseWarmthStrategy: strategy,
    ...styles,
  };
}

export function measureResponseWarmthPresence(text = "", contract = {}) {
  const raw = String(text || "").trim();
  const tokens = tokenCount(raw);
  const structure = classifyExpressionStructure(raw);
  const warmthMarkers = WARMTH_MARKER_PATTERN.test(raw);
  const presenceMarkers = PRESENCE_MARKER_PATTERN.test(raw);
  const strategy = contract.humanWarmthPresence?.responseWarmthStrategy || {};

  let score = 0.35;
  if (warmthMarkers) score += 0.25;
  if (presenceMarkers) score += 0.2;
  if (tokens >= 5) score += 0.1;
  if (structure === "empathy" || structure === "resumption") score += 0.15;
  if (structure === "confirmation" && tokens <= 3 && !warmthMarkers) score -= 0.25;
  if (structure === "micro_ack" && !warmthMarkers) score -= 0.2;

  const functionallyCold =
    strategy.requireWarmth &&
    score < 0.55 &&
    (structure === "confirmation" || structure === "micro_ack" || tokens <= 4);

  const coldAck =
    strategy.requireWarmth &&
    /^(entendi|entendo|compreendo|claro|beleza|certo|ok|show|sem problema|pode falar)\.?\s*$/i.test(
      String(text || "").trim()
    );

  const coldGratitude =
    (strategy.requireWarmth || requiresDeterministicWarmthLocal(contract)) &&
    (contract.humanWarmthPresence?.responseMoment === PRESENCE_RESPONSE_MODE.GRATITUDE_PRESENCE ||
      contract.conversationalIntent === "gratitude" ||
      contract.expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_GRATITUDE) &&
    (BARE_COLD_GRATITUDE_LOCAL.test(raw) ||
      (/^(de nada!?|por nada\.?|disponha!?)\s*$/i.test(raw) && !warmthMarkers));

  const coldMicroAck =
    requiresDeterministicWarmthLocal(contract) &&
    contract.humanWarmthPresence?.responseMoment !== PRESENCE_RESPONSE_MODE.MICRO_CONFIRM &&
    BARE_COLD_MICRO_LOCAL.test(raw);

  const missingPresence = strategy.requirePresence && !presenceMarkers && tokens <= 6;

  return {
    warmthScore: Math.max(0, Math.min(1, score)),
    functionallyCold: functionallyCold || coldAck || coldGratitude || coldMicroAck,
    missingPresence,
    structure,
    tokens,
  };
}

function buildWarmthCorrectedReply(contract = {}, extraSeed = "warmth-presence") {
  const moment = contract.humanWarmthPresence?.responseMoment || PRESENCE_RESPONSE_MODE.STANDARD_WARM;
  const warmth = contract.humanWarmthPresence?.humanWarmthLevel || HUMAN_WARMTH_LEVEL.WARM;
  const key =
    contract.centralPersonalityPolicy?.warmth ||
    contract.personalityPolicy?.warmth ||
    "warm_balanced";

  const pools = {
    [PRESENCE_RESPONSE_MODE.EMPATHETIC_PRESENCE]: {
      warm_balanced: [
        "Entendo — parece que não está fácil.",
        "Compreendo — isso pesa mesmo.",
        "Imagino que tenha sido um dia pesado.",
      ],
      warm_light: ["Puxado — entendo.", "Compreendo, pesou."],
      warm_reserved: ["Compreendo.", "Entendo — isso não é simples."],
    },
    [PRESENCE_RESPONSE_MODE.LISTENER_PRESENCE]: {
      warm_balanced: [
        "Pode falar — estou acompanhando com calma.",
        "Me conta — estou ouvindo.",
        "Claro — pode desabafar se quiser.",
      ],
      warm_light: ["Pode falar — tô acompanhando.", "Manda ver — estou ouvindo."],
      warm_reserved: ["Pode continuar — estou ouvindo.", "Claro — pode explicar com calma."],
    },
    [PRESENCE_RESPONSE_MODE.RECIPROCAL_WARM]: {
      warm_balanced: [
        "Por aqui, tudo certo — obrigada por perguntar. E você, como está?",
        "Tudo tranquilo por aqui! E contigo, como vai?",
        "Indo bem, obrigada! E você, tudo certo?",
      ],
      warm_light: ["Por aqui, tudo certo — e com você?", "Tudo tranquilo! E aí?"],
      warm_reserved: ["Por aqui, tudo bem. E você?", "Tudo certo por aqui. Como você está?"],
    },
    [PRESENCE_RESPONSE_MODE.GRATITUDE_PRESENCE]: {
      warm_balanced: [
        "Imagina — fico feliz em ter ajudado.",
        "Por nada — qualquer coisa.",
        "Disponha — tamo junto.",
      ],
      warm_light: ["Imagina!", "Por nada — tamo junto!"],
      warm_reserved: [
        "De nada — fico contente em ajudar.",
        "Por nada — fico feliz em ter ajudado.",
      ],
    },
    [PRESENCE_RESPONSE_MODE.GREETING_WARM]: {
      warm_balanced: [
        "Oi! Que bom te ver por aqui.",
        "Olá — como posso te ajudar hoje?",
        "Opa! Em que posso te ajudar?",
      ],
      warm_light: ["Oi! Bora conversar.", "Opa — manda ver."],
      warm_reserved: ["Olá — em que posso ajudar?", "Oi. Como posso te ajudar?"],
    },
    [PRESENCE_RESPONSE_MODE.FAREWELL_WARM]: {
      warm_balanced: [
        "Até mais — foi bom conversar!",
        "Até logo! Fico por aqui quando precisar.",
        "Tchau — cuide-se!",
      ],
      warm_light: ["Até! Foi bom.", "Tchau — até a próxima!"],
      warm_reserved: ["Até logo.", "Até mais — cuide-se."],
    },
    [PRESENCE_RESPONSE_MODE.CLARIFY_GENTLE]: {
      warm_balanced: [
        "Acho que perdi o fio — me conta um pouco do contexto?",
        "Não captei direito — é sobre o quê, exatamente?",
        "Entendi — me ajuda com um pouco mais de contexto?",
      ],
      warm_light: ["Hmm, não peguei — conta um pouquinho mais.", "Não ficou claro pra mim."],
      warm_reserved: ["Pode me explicar um pouco melhor?", "Me ajuda a entender o contexto."],
    },
    [PRESENCE_RESPONSE_MODE.MICRO_CONFIRM]: {
      warm_balanced: ["Certo.", "Beleza.", "Combinado."],
      warm_light: ["Ok.", "Show."],
      warm_reserved: ["Certo.", "Entendido."],
    },
    [PRESENCE_RESPONSE_MODE.STANDARD_WARM]: {
      warm_balanced: [
        "Entendo — me conta um pouco mais.",
        "Compreendo — pode continuar.",
        "Claro — estou acompanhando.",
      ],
      warm_light: ["Entendo.", "Claro — manda ver."],
      warm_reserved: ["Compreendo.", "Certo — pode continuar."],
    },
  };

  const pool =
    pools[moment]?.[key] ||
    pools[moment]?.warm_balanced ||
    pools[PRESENCE_RESPONSE_MODE.STANDARD_WARM][key] ||
    pools[PRESENCE_RESPONSE_MODE.STANDARD_WARM].warm_balanced;

  if (warmth === HUMAN_WARMTH_LEVEL.MINIMAL && moment === PRESENCE_RESPONSE_MODE.MICRO_CONFIRM) {
    return pickRhythmGovernedVariant(pool, contract, extraSeed);
  }

  return pickRhythmGovernedVariant(pool, contract, extraSeed);
}

export function detectWarmthPresenceViolations(text = "", contract = {}) {
  if (!contract.humanWarmthPresenceVersion || !text) return [];

  const metrics = measureResponseWarmthPresence(text, contract);
  const violations = [];
  if (metrics.functionallyCold) violations.push("functionally_cold_response");
  if (metrics.missingPresence) violations.push("missing_human_presence");
  if (
    contract.humanWarmthPresence?.responseWarmthStrategy?.requireReciprocity &&
    !/\b(você|contigo|por aqui|tudo certo|tranquilo)\b/i.test(text)
  ) {
    violations.push("weak_reciprocal_presence");
  }
  return violations;
}

export function applyHumanWarmthPresenceGovernance(text = "", contract = {}) {
  const raw = String(text || "").trim();
  if (!raw || !contract.humanWarmthPresenceVersion) {
    return { reply: raw, replaced: false, violations: [] };
  }

  const violations = detectWarmthPresenceViolations(raw, contract);
  if (!violations.length) {
    return { reply: raw, replaced: false, violations: [] };
  }

  const corrected = buildWarmthCorrectedReply(contract, violations.join("|"));
  if (corrected && normalizeText(corrected) !== normalizeText(raw)) {
    return { reply: corrected, replaced: true, violations };
  }

  return { reply: raw, replaced: false, violations };
}

export function enrichContractWithHumanWarmthPresence(
  contract = {},
  { recognition = null, conversationMessages = [] } = {}
) {
  const rec = recognition || {};
  const presence = resolveHumanWarmthPresence({
    contract,
    recognition: rec,
    conversationMessages,
  });

  return {
    ...contract,
    humanWarmthPresenceVersion: HUMAN_WARMTH_PRESENCE_VERSION,
    humanWarmthPresence: presence,
    humanWarmthLevel: presence.humanWarmthLevel,
    conversationEnergy: presence.conversationEnergy,
    emotionalPresence: presence.emotionalPresence,
    humanDistance: presence.humanDistance,
    conversationAffinity: presence.conversationAffinity,
    preferredGreetingStyle: presence.preferredGreetingStyle,
    preferredFarewellStyle: presence.preferredFarewellStyle,
    preferredAcknowledgementStyle: presence.preferredAcknowledgementStyle,
    preferredClarificationStyle: presence.preferredClarificationStyle,
    preferredReciprocityStyle: presence.preferredReciprocityStyle,
  };
}

export function humanWarmthPresenceToVerbalizationInstructions(contract = {}) {
  const p = contract.humanWarmthPresence;
  if (!contract.humanWarmthPresenceVersion || !p) return "";

  const lines = [
    "Presença humana e calor governados (obrigatório — transmitir pessoa, não chatbot):",
    `- Nível de calor: ${p.humanWarmthLevel}`,
    `- Energia da conversa: ${p.conversationEnergy}`,
    `- Presença emocional: ${p.emotionalPresence}`,
    `- Proximidade: ${p.humanDistance}`,
    `- Afinidade: ${p.conversationAffinity}`,
    `- Momento de resposta: ${p.responseMoment}`,
    "- Soar presente, acolhedora e natural — evitar respostas frias e funcionais.",
    "- Não usar apenas confirmações secas (Entendi/Claro/Pode falar) sem calor humano.",
  ];

  if (p.responseWarmthStrategy?.requirePresence) {
    lines.push("- Demonstrar presença: mostrar que está acompanhando a conversa.");
  }
  if (p.responseWarmthStrategy?.requireReciprocity) {
    lines.push("- Reciprocidade genuína — devolver interesse com calor natural.");
  }
  if (p.responseWarmthStrategy?.allowShort && !p.responseWarmthStrategy?.requireWarmth) {
    lines.push("- Resposta curta permitida, mas ainda com tom humano.");
  }
  if (p.preferredReciprocityStyle) {
    lines.push(`- Estilo de reciprocidade: ${p.preferredReciprocityStyle}`);
  }

  return lines.join("\n");
}

export function humanWarmthPresenceToTrace(contract = {}) {
  const p = contract.humanWarmthPresence;
  if (!p) return null;
  return {
    version: HUMAN_WARMTH_PRESENCE_VERSION,
    humanWarmthLevel: p.humanWarmthLevel,
    conversationEnergy: p.conversationEnergy,
    emotionalPresence: p.emotionalPresence,
    responseMoment: p.responseMoment,
  };
}
