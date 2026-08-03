/**
 * PATCH 5.8.3 — Social Conversation Continuity Governance
 *
 * Short-term human discourse memory for the active conversation.
 * Does NOT decide intent, target, ranking or commercial continuity.
 * Does NOT verbalize — informs pipeline what social context remains active.
 */

import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";
import { EXPECTED_HUMAN_BEHAVIORS, EMOTIONAL_STATES } from "./miaSocialIntentTaxonomy.js";
import { pickHumanizedVariant, hashSeed } from "./miaVerbalizerHumanization.js";
import { detectPerceivedEmotionalValence, EMOTIONAL_VALENCE } from "./miaPersonalityGovernance.js";

export const SOCIAL_CONVERSATION_CONTINUITY_VERSION = "5.8.3";

export const CONVERSATION_PHASE = Object.freeze({
  OPENING: "opening",
  GREETING_EXCHANGED: "greeting_exchanged",
  SOCIAL_ACTIVE: "social_active",
  EMOTIONAL_THREAD: "emotional_thread",
  COMMERCIAL_ACTIVE: "commercial_active",
  META_THREAD: "meta_thread",
  CLOSING: "closing",
});

export const SOCIAL_CONTINUITY_BEHAVIOR = Object.freeze({
  CONTINUE_GREETING_THREAD: "continue_greeting_thread",
  RESUME_SOCIAL_DISCOURSE: "resume_social_discourse",
  ACKNOWLEDGE_ACTIVE_TOPIC: "acknowledge_active_topic",
  RETURN_TO_SOCIAL_THREAD: "return_to_social_thread",
  CONFIRM_MEMORY: "confirm_short_term_memory",
});

export const CONTINUITY_STRENGTH = Object.freeze({
  NONE: "none",
  LIGHT: "light",
  MODERATE: "moderate",
  STRONG: "strong",
});

const INITIAL_GREETING =
  /^(oi+|ol[aá]+|opa|salve|hey|hello|hi|bom\s+dia|boa\s+tarde|boa\s+noite|e\s*a[ií]|eae)\b/i;

const GREETING_FOLLOWUP =
  /\b(tudo\s+bem|tudo\s+certo|como\s+vai|como\s+ta|como\s+t[aá]|beleza|blz|e\s+a[ií]|tranquilo|suave)\b/i;

const RESUMPTION_SIGNAL =
  /\b(como\s+(?:eu|a\s+gente)\s+(?:estava|estavamos|estávamos)\s+(?:dizendo|falando|comentando)|voltando\s+(?:ao|naquele|pro|para\s+o)\s+(?:assunto|papo|tema|que\s+eu)|lembra\s+(?:do|da|que)|(?:retomando|continuando)\s+(?:o|a)|naquele\s+assunto|sobre\s+o\s+que\s+(?:eu|a\s+gente)\s+(?:falei|disse|comentei)|como\s+eu\s+disse|como\s+falamos|ent[aã]o\s+voc[eê]\s+lembra)\b/i;

const MEMORY_CHECK =
  /\b(voc[eê]\s+lembra|lembra\s+(?:disso|do\s+que|que\s+eu)|ent[aã]o\s+lembra|guardou\s+isso|anotou\s+isso)\b/i;

const TOPIC_SWITCH_TO_SOCIAL =
  /\b(deixa\s+(?:o|a)\s+(?:produto|compra|celular|notebook)|esquece\s+(?:o|a)\s+(?:produto|compra)|(?:s[oó]|so)\s+queria\s+convers|volt(?:a|ar)\s+(?:pro|para\s+o)\s+papo|mudando\s+de\s+assunto)\b/i;

const TOPIC_SWITCH_TO_COMMERCIAL =
  /\b(preciso\s+de|quero\s+(?:um|uma|comprar)|me\s+recomend|at[eé]\s+\d|celular|notebook|monitor|fone)\b/i;

const COMMERCIAL_DISCOURSE =
  /\b(recomend\w*|compar\w*|iphone|galaxy|notebook|produto|or[cç]amento|pre[cç]o|compr\w*)\b/i;

const EMOTIONAL_SUBJECT =
  /\b(cansad\w*|exaust\w*|dia\s+(?:dif[ií]cil|puxado|ruim|complicad\w*)|semana\s+pesad\w*|me\s+sinto|t[oô]\s+(?:mal|down|triste)|desabaf\w*|estressad\w*)\b/i;

const SHORT_ACK = /^(ok|certo|beleza|hm+|sim|claro|entendi|show|valeu|obrigad\w*|blz|ta|t[aá])$/i;

const FAREWELL = /\b(tchau|at[eé]\s+(?:logo|mais)|flw|falou|fui)\b/i;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCount(text = "") {
  return normalizeText(text).split(/\s+/).filter(Boolean).length;
}

function isUserTurn(msg = {}) {
  return msg?.role === "user" || msg?.role === "human";
}

function isAssistantTurn(msg = {}) {
  return msg?.role === "assistant" || msg?.role === "model" || msg?.role === "mia";
}

function messageText(msg = {}) {
  return String(msg?.content || msg?.text || msg?.message || "").trim();
}

function isInitialGreetingMessage(text = "") {
  const q = normalizeText(text);
  return INITIAL_GREETING.test(q) && tokenCount(q) <= 4;
}

function isGreetingFollowUpMessage(text = "") {
  const q = normalizeText(text);
  if (isInitialGreetingMessage(text)) return false;
  return GREETING_FOLLOWUP.test(q) && tokenCount(q) <= 8;
}

function isResumptionMessage(text = "") {
  return RESUMPTION_SIGNAL.test(normalizeText(text)) || MEMORY_CHECK.test(normalizeText(text));
}

function extractTopicLabel(text = "") {
  const raw = String(text || "").trim();
  const n = normalizeText(raw);
  if (!n || tokenCount(n) < 3) return null;
  if (SHORT_ACK.test(n)) return null;
  if (isInitialGreetingMessage(text) || isGreetingFollowUpMessage(text)) return null;
  if (isResumptionMessage(text)) return null;
  if (COMMERCIAL_DISCOURSE.test(n) && !EMOTIONAL_SUBJECT.test(n)) return null;

  let label = raw.replace(/\s+/g, " ").trim();
  if (label.length > 72) label = `${label.slice(0, 69).trim()}...`;
  return label;
}

function scanConversationDiscourse(conversationMessages = []) {
  const messages = Array.isArray(conversationMessages) ? conversationMessages : [];
  let greetingExchanged = false;
  let lastCommercialTurn = -1;
  let lastSocialTurn = -1;
  let lastEmotionalTurn = -1;
  let lastMetaTurn = -1;
  let activeSocialTopic = null;
  let lastUserEmotion = null;
  let phase = CONVERSATION_PHASE.OPENING;
  let turnIndex = 0;

  for (const msg of messages) {
    if (!isUserTurn(msg)) continue;
    const text = messageText(msg);
    const n = normalizeText(text);
    if (!n) continue;

    if (isInitialGreetingMessage(text)) {
      greetingExchanged = true;
      phase = CONVERSATION_PHASE.GREETING_EXCHANGED;
      lastSocialTurn = turnIndex;
    } else if (isGreetingFollowUpMessage(text)) {
      lastSocialTurn = turnIndex;
      if (greetingExchanged) phase = CONVERSATION_PHASE.SOCIAL_ACTIVE;
    } else if (FAREWELL.test(n)) {
      phase = CONVERSATION_PHASE.CLOSING;
    } else if (TOPIC_SWITCH_TO_COMMERCIAL.test(n) || COMMERCIAL_DISCOURSE.test(n)) {
      phase = CONVERSATION_PHASE.COMMERCIAL_ACTIVE;
      lastCommercialTurn = turnIndex;
    } else if (EMOTIONAL_SUBJECT.test(n)) {
      phase = CONVERSATION_PHASE.EMOTIONAL_THREAD;
      lastEmotionalTurn = turnIndex;
      lastUserEmotion = detectPerceivedEmotionalValence(text, {});
      const topic = extractTopicLabel(text);
      if (topic) activeSocialTopic = topic;
      lastSocialTurn = turnIndex;
    } else if (/\b(quem|como\s+voc|qual\s+seu|mia)\b/i.test(n)) {
      phase = CONVERSATION_PHASE.META_THREAD;
      lastMetaTurn = turnIndex;
    } else if (TOPIC_SWITCH_TO_SOCIAL.test(n)) {
      phase = CONVERSATION_PHASE.SOCIAL_ACTIVE;
      lastSocialTurn = turnIndex;
    } else if (!SHORT_ACK.test(n) && tokenCount(n) >= 3) {
      const topic = extractTopicLabel(text);
      if (topic) {
        activeSocialTopic = topic;
        lastSocialTurn = turnIndex;
        if (phase === CONVERSATION_PHASE.GREETING_EXCHANGED || phase === CONVERSATION_PHASE.OPENING) {
          phase = CONVERSATION_PHASE.SOCIAL_ACTIVE;
        }
      }
    }

    turnIndex += 1;
  }

  return {
    greetingExchanged,
    phase,
    activeSocialTopic,
    lastUserEmotion,
    lastSocialTurn,
    lastCommercialTurn,
    lastEmotionalTurn,
    lastMetaTurn,
    turnCount: turnIndex,
  };
}

function readSessionContinuityState(sessionContext = {}) {
  const state = sessionContext.miaSocialContinuityState || {};
  if (state.version && state.version !== SOCIAL_CONVERSATION_CONTINUITY_VERSION) return {};
  return state;
}

export function resolveSocialConversationContinuity({
  message = "",
  conversationMessages = [],
  sessionContext = {},
  recognition = {},
  contract = {},
} = {}) {
  const userMessage = message || contract.resolvedQuery || "";
  const normalized = normalizeText(userMessage);
  const historyScan = scanConversationDiscourse(conversationMessages);
  const sessionState = readSessionContinuityState(sessionContext);

  const greetingExchanged =
    historyScan.greetingExchanged || sessionState.greetingExchanged || false;
  const activeSocialTopic =
    historyScan.activeSocialTopic || sessionState.activeSocialTopic || null;
  const lastUserEmotion =
    historyScan.lastUserEmotion || sessionState.lastUserEmotion || null;

  let conversationPhase = historyScan.phase || sessionState.conversationPhase || CONVERSATION_PHASE.OPENING;
  let socialContinuityBehavior = null;
  let continuityStrength = CONTINUITY_STRENGTH.NONE;
  let suppressMirrorGreeting = false;
  let resumptionRequested = false;
  let reciprocityState = sessionState.reciprocityState || "idle";

  const isResumption = isResumptionMessage(userMessage);
  const isGreetingFollowUp = isGreetingFollowUpMessage(userMessage);
  const isInitialGreeting = isInitialGreetingMessage(userMessage);
  const returningFromCommercial =
    conversationPhase === CONVERSATION_PHASE.COMMERCIAL_ACTIVE &&
    (TOPIC_SWITCH_TO_SOCIAL.test(normalized) || (!COMMERCIAL_DISCOURSE.test(normalized) && GREETING_FOLLOWUP.test(normalized)));

  if (isResumption && activeSocialTopic) {
    socialContinuityBehavior = SOCIAL_CONTINUITY_BEHAVIOR.RESUME_SOCIAL_DISCOURSE;
    continuityStrength = CONTINUITY_STRENGTH.STRONG;
    resumptionRequested = true;
    conversationPhase = CONVERSATION_PHASE.SOCIAL_ACTIVE;
  } else if (MEMORY_CHECK.test(normalized) && (activeSocialTopic || historyScan.lastMetaTurn >= 0)) {
    socialContinuityBehavior = SOCIAL_CONTINUITY_BEHAVIOR.CONFIRM_MEMORY;
    continuityStrength = CONTINUITY_STRENGTH.MODERATE;
    resumptionRequested = true;
  } else if (returningFromCommercial) {
    socialContinuityBehavior = SOCIAL_CONTINUITY_BEHAVIOR.RETURN_TO_SOCIAL_THREAD;
    continuityStrength = CONTINUITY_STRENGTH.MODERATE;
    conversationPhase = CONVERSATION_PHASE.SOCIAL_ACTIVE;
  } else if (greetingExchanged && isGreetingFollowUp && !isInitialGreeting) {
    socialContinuityBehavior = SOCIAL_CONTINUITY_BEHAVIOR.CONTINUE_GREETING_THREAD;
    continuityStrength = CONTINUITY_STRENGTH.MODERATE;
    suppressMirrorGreeting = true;
    conversationPhase = CONVERSATION_PHASE.SOCIAL_ACTIVE;
  } else if (
    greetingExchanged &&
    isInitialGreeting &&
    historyScan.turnCount > 0
  ) {
    socialContinuityBehavior = SOCIAL_CONTINUITY_BEHAVIOR.CONTINUE_GREETING_THREAD;
    continuityStrength = CONTINUITY_STRENGTH.LIGHT;
    suppressMirrorGreeting = true;
  } else if (
    activeSocialTopic &&
    (EMOTIONAL_SUBJECT.test(normalized) || isResumption) &&
    !COMMERCIAL_DISCOURSE.test(normalized)
  ) {
    socialContinuityBehavior = SOCIAL_CONTINUITY_BEHAVIOR.ACKNOWLEDGE_ACTIVE_TOPIC;
    continuityStrength = CONTINUITY_STRENGTH.MODERATE;
    conversationPhase = CONVERSATION_PHASE.EMOTIONAL_THREAD;
  } else if (
    activeSocialTopic &&
    historyScan.turnCount >= 2 &&
    SHORT_ACK.test(normalized)
  ) {
    continuityStrength = CONTINUITY_STRENGTH.LIGHT;
  }

  if (/\b(e\s+voc|e\s+contigo|como\s+voc[eê]\s+t[aá])\b/i.test(normalized)) {
    reciprocityState = "prompted";
  }

  const discourse = {
    version: SOCIAL_CONVERSATION_CONTINUITY_VERSION,
    conversationPhase,
    conversationAnchor: activeSocialTopic || (greetingExchanged ? "social_thread" : null),
    activeSocialTopic,
    lastUserEmotion,
    greetingExchanged,
    socialContinuityBehavior,
    continuityStrength,
    suppressMirrorGreeting,
    resumptionRequested,
    reciprocityState,
    relationshipState: greetingExchanged ? "engaged" : "opening",
    conversationEnergy: conversationPhase === CONVERSATION_PHASE.EMOTIONAL_THREAD ? "supportive" : "calm",
    followUpProbability:
      continuityStrength === CONTINUITY_STRENGTH.STRONG
        ? "high"
        : continuityStrength === CONTINUITY_STRENGTH.MODERATE
          ? "medium"
          : "low",
    shortTermDiscourse: {
      turnCount: historyScan.turnCount,
      lastSocialTurn: historyScan.lastSocialTurn,
      lastCommercialTurn: historyScan.lastCommercialTurn,
    },
  };

  return discourse;
}

function warmthKey(contract = {}) {
  const w = contract.personalityPolicy?.warmth || contract.centralPersonalityPolicy?.warmth || "warm_balanced";
  if (w === "warm_light") return "warm_light";
  if (w === "warm_reserved") return "warm_reserved";
  return "warm_balanced";
}

function seedFromContract(contract = {}, extra = "") {
  return [
    contract.userMessageForSpecificity || "",
    contract.socialConversationContinuity?.activeSocialTopic || "",
    contract.socialContinuityBehavior || "",
    extra,
  ].join("|");
}

export function buildContinueGreetingThreadReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_light: [
      "Tudo certo por aqui também!",
      "Por aqui, tudo bem!",
      "Tudo tranquilo — e contigo?",
    ],
    warm_balanced: [
      "Tudo certo por aqui também.",
      "Por aqui, tudo bem — e com você?",
      "Tudo tranquilo por aqui!",
    ],
    warm_reserved: ["Por aqui, tudo bem.", "Tudo certo por aqui."],
  };
  return pickHumanizedVariant(pools[key] || pools.warm_balanced, seedFromContract(contract, "continue-greeting"));
}

export function buildResumeSocialDiscourseReply(contract = {}) {
  const topic = contract.socialConversationContinuity?.activeSocialTopic || "isso";
  const key = warmthKey(contract);
  const pools = {
    warm_light: [
      () => `Lembro sim — você comentou sobre ${topic}.`,
      () => `Voltando nisso: ${topic}.`,
    ],
    warm_balanced: [
      () => `Lembro sim — você estava falando sobre ${topic}.`,
      () => `Voltando ao assunto: ${topic}.`,
      () => `Isso faz sentido — você tinha comentado ${topic}.`,
    ],
    warm_reserved: [
      () => `Sim — você mencionou ${topic}.`,
      () => `Voltando ao ponto: ${topic}.`,
    ],
  };
  const variants = (pools[key] || pools.warm_balanced).map((fn) => fn());
  return pickHumanizedVariant(variants, seedFromContract(contract, "resume-discourse"));
}

export function buildAcknowledgeActiveTopicReply(contract = {}) {
  const topic = contract.socialConversationContinuity?.activeSocialTopic;
  if (!topic) return buildContinueGreetingThreadReply(contract);
  const key = warmthKey(contract);
  const pools = {
    warm_balanced: [
      () => `Entendo — ainda pensando nisso: ${topic}.`,
      () => `Compreendo — ${topic} pesa mesmo.`,
    ],
    warm_light: [() => `Puxado — ${topic}.`, () => `Entendo — ${topic}.`],
    warm_reserved: [() => `Compreendo — ${topic}.`],
  };
  const variants = (pools[key] || pools.warm_balanced).map((fn) => fn());
  return pickHumanizedVariant(variants, seedFromContract(contract, "ack-topic"));
}

export function buildReturnToSocialThreadReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_balanced: [
      "Claro — voltando ao papo.",
      "Sem problema — podemos continuar conversando.",
      "Beleza — fico no papo com você.",
    ],
    warm_light: ["Beleza — bora continuar o papo.", "Claro — voltamos ao papo."],
    warm_reserved: ["Certo — podemos continuar.", "Sem problema — pode falar."],
  };
  return pickHumanizedVariant(pools[key] || pools.warm_balanced, seedFromContract(contract, "return-social"));
}

export function buildConfirmShortTermMemoryReply(contract = {}) {
  const topic = contract.socialConversationContinuity?.activeSocialTopic;
  const key = warmthKey(contract);
  if (topic) {
    const pools = {
      warm_balanced: [
        () => `Lembro sim — você comentou ${topic}.`,
        () => `Sim — ainda tenho em mente ${topic}.`,
      ],
      warm_light: [() => `Lembro — ${topic}.`],
      warm_reserved: [() => `Sim — ${topic}.`],
    };
    const variants = (pools[key] || pools.warm_balanced).map((fn) => fn());
    return pickHumanizedVariant(variants, seedFromContract(contract, "confirm-memory"));
  }
  const pools = {
    warm_balanced: [
      "Lembro sim — estamos no mesmo papo.",
      "Sim — ainda estou acompanhando o que conversamos.",
    ],
    warm_light: ["Lembro sim!", "Sim — tô acompanhando."],
    warm_reserved: ["Sim — lembro.", "Lembro."],
  };
  return pickHumanizedVariant(pools[key] || pools.warm_balanced, seedFromContract(contract, "confirm-memory-generic"));
}

export function buildContinuityGovernedReply(contract = {}) {
  const behavior = contract.socialContinuityBehavior;
  switch (behavior) {
    case SOCIAL_CONTINUITY_BEHAVIOR.CONTINUE_GREETING_THREAD:
      return buildContinueGreetingThreadReply(contract);
    case SOCIAL_CONTINUITY_BEHAVIOR.RESUME_SOCIAL_DISCOURSE:
      return buildResumeSocialDiscourseReply(contract);
    case SOCIAL_CONTINUITY_BEHAVIOR.ACKNOWLEDGE_ACTIVE_TOPIC:
      return buildAcknowledgeActiveTopicReply(contract);
    case SOCIAL_CONTINUITY_BEHAVIOR.RETURN_TO_SOCIAL_THREAD:
      return buildReturnToSocialThreadReply(contract);
    case SOCIAL_CONTINUITY_BEHAVIOR.CONFIRM_MEMORY:
      return buildConfirmShortTermMemoryReply(contract);
    default:
      return "";
  }
}

export function enrichContractWithSocialConversationContinuity(
  contract = {},
  {
    message = "",
    conversationMessages = [],
    sessionContext = {},
    recognition = null,
  } = {}
) {
  const rec = recognition || {};
  const discourse = resolveSocialConversationContinuity({
    message: message || contract.resolvedQuery || "",
    conversationMessages,
    sessionContext,
    recognition: rec,
    contract,
  });

  let expectedHumanBehavior = contract.expectedHumanBehavior;
  const protectedBehaviors = new Set([
    EXPECTED_HUMAN_BEHAVIORS.ANSWER_META,
    EXPECTED_HUMAN_BEHAVIORS.REPAIR_CONTEXT,
    EXPECTED_HUMAN_BEHAVIORS.VALIDATE_EMOTION,
  ]);

  if (
    discourse.socialContinuityBehavior &&
    (!protectedBehaviors.has(expectedHumanBehavior) ||
      discourse.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.RESUME_SOCIAL_DISCOURSE ||
      discourse.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.CONFIRM_MEMORY)
  ) {
    if (discourse.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.CONTINUE_GREETING_THREAD) {
      expectedHumanBehavior = EXPECTED_HUMAN_BEHAVIORS.SMALL_TALK_REPLY;
    } else if (
      discourse.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.RESUME_SOCIAL_DISCOURSE ||
      discourse.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.CONFIRM_MEMORY
    ) {
      expectedHumanBehavior = EXPECTED_HUMAN_BEHAVIORS.SMALL_TALK_REPLY;
    } else if (discourse.socialContinuityBehavior === SOCIAL_CONTINUITY_BEHAVIOR.ACKNOWLEDGE_ACTIVE_TOPIC) {
      expectedHumanBehavior = EXPECTED_HUMAN_BEHAVIORS.VALIDATE_EMOTION;
    }
  }

  if (discourse.suppressMirrorGreeting && expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.MIRROR_GREETING) {
    expectedHumanBehavior = EXPECTED_HUMAN_BEHAVIORS.SMALL_TALK_REPLY;
  }

  const continuityBypass =
    !!discourse.socialContinuityBehavior &&
    discourse.continuityStrength !== CONTINUITY_STRENGTH.NONE;

  return {
    ...contract,
    socialConversationContinuityVersion: SOCIAL_CONVERSATION_CONTINUITY_VERSION,
    socialConversationContinuity: discourse,
    socialContinuityBehavior: discourse.socialContinuityBehavior,
    suppressMirrorGreeting: discourse.suppressMirrorGreeting,
    expectedHumanBehavior,
    conversationContinuation: discourse.resumptionRequested ? "resume_discourse" : contract.conversationContinuation,
    socialContinuityBypass: continuityBypass && !contract.factValidation?.bypassLlmVerbalization,
    sessionContinuityPersist: {
      version: SOCIAL_CONVERSATION_CONTINUITY_VERSION,
      greetingExchanged: discourse.greetingExchanged,
      conversationPhase: discourse.conversationPhase,
      activeSocialTopic: discourse.activeSocialTopic,
      lastUserEmotion: discourse.lastUserEmotion,
      reciprocityState: discourse.reciprocityState,
    },
  };
}

export function socialConversationContinuityToVerbalizationInstructions(contract = {}) {
  const sc = contract.socialConversationContinuity || {};
  if (!contract.socialConversationContinuityVersion) return "";

  const lines = [
    "Continuidade conversacional humana (obrigatório — memória curta da conversa atual):",
    `- Fase: ${sc.conversationPhase || "opening"}`,
    `- Âncora ativa: ${sc.conversationAnchor || "nenhuma"}`,
    `- Assunto social ativo: ${sc.activeSocialTopic || "nenhum"}`,
    `- Cumprimento já trocado: ${sc.greetingExchanged ? "sim — NÃO reiniciar com novo cumprimento espelhado" : "não"}`,
    `- Força de continuidade: ${sc.continuityStrength || "none"}`,
    "- Não tratar este turno como conversa nova se há contexto social ativo.",
    "- Referencie naturalmente o que acabou de ser dito quando fizer sentido.",
    "- Não repetir 'Oi! Tudo bem.' se o cumprimento já ocorreu.",
  ];

  if (sc.resumptionRequested) {
    lines.push("- Retomada solicitada: reconheça o assunto anterior antes de continuar.");
  }
  if (sc.lastUserEmotion && sc.lastUserEmotion !== EMOTIONAL_VALENCE.NEUTRAL) {
    lines.push(`- Emoção recente do usuário: ${sc.lastUserEmotion}`);
  }
  if (sc.socialContinuityBehavior) {
    lines.push(`- Comportamento de continuidade: ${sc.socialContinuityBehavior}`);
  }

  return lines.join("\n");
}

export function socialConversationContinuityToTrace(contract = {}) {
  if (!contract.socialConversationContinuityVersion) return null;
  const sc = contract.socialConversationContinuity || {};
  return {
    version: contract.socialConversationContinuityVersion,
    phase: sc.conversationPhase,
    behavior: sc.socialContinuityBehavior,
    activeTopic: sc.activeSocialTopic,
    greetingExchanged: sc.greetingExchanged,
    suppressMirrorGreeting: sc.suppressMirrorGreeting,
    continuityStrength: sc.continuityStrength,
  };
}
