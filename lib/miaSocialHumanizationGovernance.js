/**
 * PATCH 5.8.5 — Social Humanization Governance
 *
 * Empathy, expressiveness and human presence for social conversation.
 * Does NOT decide intent, ranking, recovery, personality, rhythm or continuity.
 * Informs pipeline HOW to respond emotionally at this moment.
 */

import { EXPECTED_HUMAN_BEHAVIORS, EMOTIONAL_STATES } from "./miaSocialIntentTaxonomy.js";
import { EMOTIONAL_VALENCE, detectPerceivedEmotionalValence } from "./miaPersonalityGovernance.js";
import { pickRhythmGovernedVariant } from "./miaConversationalRhythmGovernance.js";

export const SOCIAL_HUMANIZATION_VERSION = "5.8.5";

export const EMOTIONAL_CATEGORY = Object.freeze({
  NONE: "none",
  DISTRESS: "distress",
  SADNESS: "sadness",
  FRUSTRATION: "frustration",
  DISCOURAGEMENT: "discouragement",
  ANXIETY: "anxiety",
  JOY: "joy",
  ACHIEVEMENT: "achievement",
  GRATITUDE: "gratitude",
  COMPLIMENT: "compliment",
  PRIDE: "pride",
  DOUBT: "doubt",
  RECIPROCAL: "reciprocal",
  LIGHT_HUMOR: "light_humor",
  FAREWELL: "farewell",
  NEUTRAL_SOCIAL: "neutral_social",
});

export const SOCIAL_HUMANIZATION_BEHAVIOR = Object.freeze({
  EMPATHETIC_ACKNOWLEDGE: "empathetic_acknowledge",
  COMFORT_WITHOUT_THERAPY: "comfort_without_therapy",
  WARM_PRESENCE: "warm_presence",
  GRATITUDE_WITH_PRESENCE: "gratitude_with_presence",
  RECIPROCAL_ENGAGEMENT: "reciprocal_engagement",
  CELEBRATE_LIGHTLY: "celebrate_lightly",
  LIGHT_HUMOR_REACT: "light_humor_react",
  LISTENER_MODE: "listener_mode",
  ENCOURAGE_LIGHTLY: "encourage_lightly",
});

export const EMPATHY_LEVEL = Object.freeze({
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
});

export const EXPRESSIVENESS_LEVEL = Object.freeze({
  RESTRAINED: "restrained",
  NATURAL: "natural",
  WARM: "warm",
});

export const HUMAN_PRESENCE_MODE = Object.freeze({
  LISTENER: "listener",
  COMPANION: "companion",
  RESPONDER: "responder",
});

const CATEGORY_PATTERNS = [
  { category: EMOTIONAL_CATEGORY.LIGHT_HUMOR, pattern: /^(k+|ha+|he+|rs+|lol)+$/i },
  { category: EMOTIONAL_CATEGORY.GRATITUDE, pattern: /\b(obrigad\w*|valeu|agrade\w*|tmj|brigad\w*|thanks)\b/i },
  { category: EMOTIONAL_CATEGORY.ACHIEVEMENT, pattern: /\b(consegui|finalmente|deu certo|passou|venci|conquist\w*|arras\w*)\b/i },
  { category: EMOTIONAL_CATEGORY.JOY, pattern: /\b(feliz|alegre|animad\w*|empolgad\w*|top demais|massa demais|incrivel)\b/i },
  { category: EMOTIONAL_CATEGORY.PRIDE, pattern: /\b(orgulh\w*|me sinto bem|consegui fazer|fiz sozinh)\b/i },
  { category: EMOTIONAL_CATEGORY.COMPLIMENT, pattern: /\b(voc[eê]\s+[eé]\s+legal|gostei de voc|mandou bem|parab[eé]ns|que legal voc)\b/i },
  { category: EMOTIONAL_CATEGORY.ANXIETY, pattern: /\b(ansios\w*|preocupad\w*|nervos\w*|medo de|com medo|com receio)\b/i },
  { category: EMOTIONAL_CATEGORY.FRUSTRATION, pattern: /\b(frustrad\w*|irritad\w*|estressad\w*|chatead\w*|puto|raiv\w*)\b/i },
  { category: EMOTIONAL_CATEGORY.DISCOURAGEMENT, pattern: /\b(desanim\w*|desmotiv\w*|sem vontade|n[aã]o aguento mais|cansei)\b/i },
  { category: EMOTIONAL_CATEGORY.SADNESS, pattern: /\b(trist\w*|down|chatead\w*|melancol\w*|saudade)\b/i },
  {
    category: EMOTIONAL_CATEGORY.DISTRESS,
    pattern:
      /\b(cansad\w*|exaust\w*|n[aã]o t[oô]\s+legal|n[aã]o estou bem|t[oô]\s+mal\b|dia\s+(dif[ií]cil|puxado|ruim|complicad\w*)|foi\s+(dif[ií]cil|complicad\w*|puxad\w*)|semana\s+pesad\w*|me\s+sinto\s+mal|puxad\w*)\b/i,
  },
  { category: EMOTIONAL_CATEGORY.DOUBT, pattern: /\b(ser[aá] que|sera que|n[aã]o sei se|insegur\w*|duvid\w*)\b/i },
  {
    category: EMOTIONAL_CATEGORY.RECIPROCAL,
    pattern: /\b(e\s+voc[eê]|e\s+contigo|e\s+a[ií]|como\s+voc[eê]\s+t[aá]|como\s+t[aá]\s+contigo|como\s+vai|como\s+(foi|t[aá])\s+(seu|o)\s+dia|dormiu\s+bem)\b/i,
  },
  { category: EMOTIONAL_CATEGORY.FAREWELL, pattern: /\b(tchau|at[eé]\s+(logo|mais)|flw|falou|fui|vou\s+dormir)\b/i },
];

const COLD_EMOTIONAL_PATTERN =
  /^(puxado\s*[—-]?\s*entendo|entendo\.?|compreendo\.?|certo\.?|ok\.?)$/i;

const COLD_GRATITUDE_PATTERN = /^(disponha\.?|de nada\.?|por nada\.?)$/i;

const FUNCTIONAL_STAY_SOCIAL =
  /\b(fico por aqui\s*[—-]?\s*o que voc|claro,\s+pode falar comigo|sem problema\s*[—-]?\s*fico por aqui no papo)\b/i;

const THERAPEUTIC_PATTERN =
  /\b(voc[eê]\s+deveria|tente|respir(?:ar|e)|medite|procure ajuda|terapia|autocuidado|força|n[aã]o desista|tudo vai passar)\b/i;

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

function warmthKey(contract = {}) {
  const w =
    contract.centralPersonalityPolicy?.warmth ||
    contract.personalityPolicy?.warmth ||
    "warm_balanced";
  if (w === "warm_light") return "warm_light";
  if (w === "warm_reserved") return "warm_reserved";
  return "warm_balanced";
}

export function classifyEmotionalCategory(message = "", recognition = {}) {
  const q = normalizeText(message);
  if (!q) return EMOTIONAL_CATEGORY.NONE;

  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(q)) return category;
  }

  if (recognition.interactionMode === "emotional_support") return EMOTIONAL_CATEGORY.DISTRESS;
  if (recognition.emotionalState === EMOTIONAL_STATES.FRUSTRATED) return EMOTIONAL_CATEGORY.FRUSTRATION;
  if (recognition.emotionalState === EMOTIONAL_STATES.TIRED) return EMOTIONAL_CATEGORY.DISTRESS;
  if (recognition.emotionalState === EMOTIONAL_STATES.HAPPY) return EMOTIONAL_CATEGORY.JOY;
  if (recognition.primaryIntent === "acknowledgement") return EMOTIONAL_CATEGORY.GRATITUDE;
  if (recognition.socialFamilies?.farewell) return EMOTIONAL_CATEGORY.FAREWELL;
  if (recognition.socialFamilies?.reaction) return EMOTIONAL_CATEGORY.LIGHT_HUMOR;

  if (tokenCount(q) >= 3 && recognition.emotionalRelevance >= 0.35) {
    return EMOTIONAL_CATEGORY.NEUTRAL_SOCIAL;
  }

  return EMOTIONAL_CATEGORY.NONE;
}

function resolveEmpathyLevel(category = EMOTIONAL_CATEGORY.NONE, valence = EMOTIONAL_VALENCE.NEUTRAL) {
  if (
    category === EMOTIONAL_CATEGORY.DISTRESS ||
    category === EMOTIONAL_CATEGORY.SADNESS ||
    category === EMOTIONAL_CATEGORY.DISCOURAGEMENT
  ) {
    return EMPATHY_LEVEL.HIGH;
  }
  if (
    category === EMOTIONAL_CATEGORY.FRUSTRATION ||
    category === EMOTIONAL_CATEGORY.ANXIETY ||
    valence === EMOTIONAL_VALENCE.NEGATIVE
  ) {
    return EMPATHY_LEVEL.MODERATE;
  }
  if (
    category === EMOTIONAL_CATEGORY.GRATITUDE ||
    category === EMOTIONAL_CATEGORY.JOY ||
    category === EMOTIONAL_CATEGORY.ACHIEVEMENT ||
    category === EMOTIONAL_CATEGORY.RECIPROCAL
  ) {
    return EMPATHY_LEVEL.MODERATE;
  }
  return EMPATHY_LEVEL.LOW;
}

function resolveExpressiveness(category = EMOTIONAL_CATEGORY.NONE, empathyLevel = EMPATHY_LEVEL.LOW) {
  if (empathyLevel === EMPATHY_LEVEL.HIGH) return EXPRESSIVENESS_LEVEL.WARM;
  if (
    category === EMOTIONAL_CATEGORY.JOY ||
    category === EMOTIONAL_CATEGORY.ACHIEVEMENT ||
    category === EMOTIONAL_CATEGORY.RECIPROCAL ||
    category === EMOTIONAL_CATEGORY.GRATITUDE
  ) {
    return EXPRESSIVENESS_LEVEL.NATURAL;
  }
  if (category === EMOTIONAL_CATEGORY.LIGHT_HUMOR) return EXPRESSIVENESS_LEVEL.NATURAL;
  if (empathyLevel === EMPATHY_LEVEL.MODERATE) return EXPRESSIVENESS_LEVEL.NATURAL;
  return EXPRESSIVENESS_LEVEL.RESTRAINED;
}

function resolveHumanizationBehavior(category, contract = {}, recognition = {}) {
  const behavior = contract.expectedHumanBehavior || "";

  switch (category) {
    case EMOTIONAL_CATEGORY.DISTRESS:
    case EMOTIONAL_CATEGORY.SADNESS:
      return SOCIAL_HUMANIZATION_BEHAVIOR.COMFORT_WITHOUT_THERAPY;
    case EMOTIONAL_CATEGORY.FRUSTRATION:
    case EMOTIONAL_CATEGORY.ANXIETY:
    case EMOTIONAL_CATEGORY.DISCOURAGEMENT:
      return SOCIAL_HUMANIZATION_BEHAVIOR.EMPATHETIC_ACKNOWLEDGE;
    case EMOTIONAL_CATEGORY.GRATITUDE:
      return SOCIAL_HUMANIZATION_BEHAVIOR.GRATITUDE_WITH_PRESENCE;
    case EMOTIONAL_CATEGORY.JOY:
    case EMOTIONAL_CATEGORY.ACHIEVEMENT:
    case EMOTIONAL_CATEGORY.PRIDE:
      return SOCIAL_HUMANIZATION_BEHAVIOR.CELEBRATE_LIGHTLY;
    case EMOTIONAL_CATEGORY.COMPLIMENT:
      return SOCIAL_HUMANIZATION_BEHAVIOR.WARM_PRESENCE;
    case EMOTIONAL_CATEGORY.RECIPROCAL:
      return SOCIAL_HUMANIZATION_BEHAVIOR.RECIPROCAL_ENGAGEMENT;
    case EMOTIONAL_CATEGORY.LIGHT_HUMOR:
      return SOCIAL_HUMANIZATION_BEHAVIOR.LIGHT_HUMOR_REACT;
    case EMOTIONAL_CATEGORY.DOUBT:
      return SOCIAL_HUMANIZATION_BEHAVIOR.ENCOURAGE_LIGHTLY;
    case EMOTIONAL_CATEGORY.FAREWELL:
      return SOCIAL_HUMANIZATION_BEHAVIOR.WARM_PRESENCE;
    case EMOTIONAL_CATEGORY.NEUTRAL_SOCIAL:
      if (
        behavior === EXPECTED_HUMAN_BEHAVIORS.STAY_SOCIAL ||
        behavior === EXPECTED_HUMAN_BEHAVIORS.SMALL_TALK_REPLY
      ) {
        return SOCIAL_HUMANIZATION_BEHAVIOR.LISTENER_MODE;
      }
      return null;
    default:
      if (
        behavior === EXPECTED_HUMAN_BEHAVIORS.VALIDATE_EMOTION ||
        recognition.interactionMode === "emotional_support"
      ) {
        return SOCIAL_HUMANIZATION_BEHAVIOR.EMPATHETIC_ACKNOWLEDGE;
      }
      if (behavior === EXPECTED_HUMAN_BEHAVIORS.RECIPROCATE_WARMTH) {
        return SOCIAL_HUMANIZATION_BEHAVIOR.RECIPROCAL_ENGAGEMENT;
      }
      if (behavior === EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_GRATITUDE) {
        return SOCIAL_HUMANIZATION_BEHAVIOR.GRATITUDE_WITH_PRESENCE;
      }
      return null;
  }
}

function resolvePresenceMode(category, behavior) {
  if (
    behavior === SOCIAL_HUMANIZATION_BEHAVIOR.LISTENER_MODE ||
    behavior === SOCIAL_HUMANIZATION_BEHAVIOR.COMFORT_WITHOUT_THERAPY
  ) {
    return HUMAN_PRESENCE_MODE.LISTENER;
  }
  if (
    behavior === SOCIAL_HUMANIZATION_BEHAVIOR.RECIPROCAL_ENGAGEMENT ||
    behavior === SOCIAL_HUMANIZATION_BEHAVIOR.CELEBRATE_LIGHTLY
  ) {
    return HUMAN_PRESENCE_MODE.COMPANION;
  }
  return HUMAN_PRESENCE_MODE.RESPONDER;
}

export function computeHumanizationMetrics(humanization = {}) {
  const empathyMap = { low: 0.35, moderate: 0.65, high: 0.9 };
  const expressMap = { restrained: 0.4, natural: 0.7, warm: 0.9 };
  return {
    empathyScore: empathyMap[humanization.empathyLevel] ?? 0.35,
    expressivenessScore: expressMap[humanization.expressivenessLevel] ?? 0.4,
    emotionalCategory: humanization.emotionalCategory || EMOTIONAL_CATEGORY.NONE,
    presenceMode: humanization.humanPresenceMode || HUMAN_PRESENCE_MODE.RESPONDER,
    curiosityLevel: humanization.curiosityLevel || "low",
    engagementLevel: humanization.engagementLevel || "balanced",
  };
}

export function resolveSocialHumanization({
  message = "",
  recognition = {},
  contract = {},
  conversationMessages = [],
} = {}) {
  const category = classifyEmotionalCategory(message, recognition);
  const valence = detectPerceivedEmotionalValence(message, recognition);
  const empathyLevel = resolveEmpathyLevel(category, valence);
  const expressivenessLevel = resolveExpressiveness(category, empathyLevel);
  const socialHumanizationBehavior = resolveHumanizationBehavior(category, contract, recognition);
  const humanPresenceMode = resolvePresenceMode(category, socialHumanizationBehavior);

  return {
    version: SOCIAL_HUMANIZATION_VERSION,
    emotionalCategory: category,
    empathyLevel,
    expressivenessLevel,
    socialHumanizationBehavior,
    humanPresenceMode,
    emotionalAlignment: category === EMOTIONAL_CATEGORY.NONE ? "neutral" : category,
    emotionalTemperature:
      empathyLevel === EMPATHY_LEVEL.HIGH
        ? "warm_supportive"
        : empathyLevel === EMPATHY_LEVEL.MODERATE
          ? "warm_balanced"
          : "neutral",
    socialReciprocity: category === EMOTIONAL_CATEGORY.RECIPROCAL ? "required" : "optional",
    curiosityLevel:
      category === EMOTIONAL_CATEGORY.RECIPROCAL || category === EMOTIONAL_CATEGORY.NEUTRAL_SOCIAL
        ? "light"
        : "none",
    engagementLevel:
      empathyLevel === EMPATHY_LEVEL.HIGH ? "supportive" : expressivenessLevel === EXPRESSIVENESS_LEVEL.WARM ? "warm" : "balanced",
    comfortStyle:
      category === EMOTIONAL_CATEGORY.DISTRESS || category === EMOTIONAL_CATEGORY.SADNESS
        ? "validating_hopeful"
        : category === EMOTIONAL_CATEGORY.FRUSTRATION
          ? "validating"
          : "brief",
    encouragementStyle:
      category === EMOTIONAL_CATEGORY.ACHIEVEMENT || category === EMOTIONAL_CATEGORY.JOY
        ? "celebrate"
        : category === EMOTIONAL_CATEGORY.DOUBT
          ? "gentle"
          : "none",
    humorAllowance: category === EMOTIONAL_CATEGORY.LIGHT_HUMOR ? "light" : "none",
    listenerMode: humanPresenceMode === HUMAN_PRESENCE_MODE.LISTENER,
    conversationSupport: empathyLevel !== EMPATHY_LEVEL.LOW,
    turnCount: (Array.isArray(conversationMessages) ? conversationMessages : []).filter(
      (m) => m?.role === "user"
    ).length,
  };
}

export function buildEmpatheticAcknowledgeReply(contract = {}) {
  const category = contract.socialHumanization?.emotionalCategory || EMOTIONAL_CATEGORY.DISTRESS;
  const key = warmthKey(contract);
  const byCategory = {
    [EMOTIONAL_CATEGORY.FRUSTRATION]: {
      warm_balanced: [
        "Faz sentido estar frustrado com isso.",
        "Entendo — situação chata mesmo.",
        "Compreendo — isso irrita mesmo.",
      ],
    },
    [EMOTIONAL_CATEGORY.ANXIETY]: {
      warm_balanced: [
        "Sei que incerteza pesa — entendo.",
        "Faz sentido se sentir assim.",
        "Compreendo — ansiedade cansa.",
      ],
    },
    [EMOTIONAL_CATEGORY.DISCOURAGEMENT]: {
      warm_balanced: [
        "Desanimar acontece — entendo.",
        "Compreendo — bate um cansaço mesmo.",
        "Entendo — nem sempre é fácil.",
      ],
    },
  };
  const defaultPool = {
    warm_balanced: [
      "Entendo — parece que não está fácil.",
      "Compreendo — isso pesa mesmo.",
      "Imagino que tenha sido um dia pesado.",
    ],
    warm_light: ["Puxado — entendo.", "Compreendo, pesou."],
    warm_reserved: ["Compreendo.", "Entendo — isso não é simples."],
  };
  const pool = byCategory[category]?.[key] || byCategory[category]?.warm_balanced || defaultPool[key] || defaultPool.warm_balanced;
  return pickRhythmGovernedVariant(pool, contract, `empathy-${category}`);
}

export function buildComfortWithoutTherapyReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_light: [
      "Poxa... espero que melhore.",
      "Imagino que tenha sido pesado.",
      "Compreendo — dia difícil mesmo.",
    ],
    warm_balanced: [
      "Imagino que tenha sido um dia pesado.",
      "Entendo. Às vezes realmente existem dias assim.",
      "Poxa... espero que as coisas melhorem.",
      "Compreendo — isso cansa mesmo.",
    ],
    warm_reserved: [
      "Entendo — dias assim pesam.",
      "Compreendo — não é simples.",
      "Imagino que tenha sido difícil.",
    ],
  };
  return pickRhythmGovernedVariant(pools[key] || pools.warm_balanced, contract, "comfort");
}

export function buildGratitudeWithPresenceReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_light: ["Imagina!", "Por nada — tamo junto!", "Disponha!"],
    warm_balanced: [
      "Imagina — fico feliz em ter ajudado.",
      "Por nada — qualquer coisa.",
      "Disponha — tamo junto.",
    ],
    warm_reserved: ["Por nada.", "De nada — fico contente em ajudar.", "Disponha."],
  };
  return pickRhythmGovernedVariant(pools[key] || pools.warm_balanced, contract, "gratitude-presence");
}

export function buildReciprocalEngagementReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_light: ["Por aqui, tudo certo — e com você?", "Tudo tranquilo! E aí, como você tá?"],
    warm_balanced: [
      "Por aqui, tudo certo — obrigada por perguntar. E você, como está?",
      "Tudo tranquilo por aqui! E contigo, como vai?",
      "Estou bem, obrigada! E você, como está?",
    ],
    warm_reserved: ["Por aqui, tudo bem. E você?", "Tudo certo por aqui. Como você está?"],
  };
  return pickRhythmGovernedVariant(pools[key] || pools.warm_balanced, contract, "reciprocal-engage");
}

export function buildCelebrateLightlyReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_light: ["Que bom!", "Boa — isso é legal demais!", "Show!"],
    warm_balanced: [
      "Que bom — isso merece comemorar!",
      "Boa — fico feliz por você!",
      "Legal demais — que conquista!",
    ],
    warm_reserved: ["Que bom.", "Boa — isso é positivo.", "Legal."],
  };
  return pickRhythmGovernedVariant(pools[key] || pools.warm_balanced, contract, "celebrate");
}

export function buildLightHumorReactReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_light: ["Hehe!", "Boa!", "Aí sim."],
    warm_balanced: ["Hehe — boa!", "Haha, boa!", "Aí sim."],
    warm_reserved: ["Boa.", "Certo.", "Hehe."],
  };
  return pickRhythmGovernedVariant(pools[key] || pools.warm_balanced, contract, "humor-light");
}

export function buildWarmPresenceReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_light: ["Que gentil — obrigada!", "Valeu pelo carinho!"],
    warm_balanced: ["Que gentil — obrigada.", "Obrigada pelo elogio.", "Valeu — isso aquece."],
    warm_reserved: ["Obrigada.", "Agradeço.", "Gentil da sua parte."],
  };
  return pickRhythmGovernedVariant(pools[key] || pools.warm_balanced, contract, "warm-presence");
}

export function buildListenerModeReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_light: ["Pode falar — tô acompanhando.", "Manda ver — estou ouvindo."],
    warm_balanced: [
      "Pode falar — estou acompanhando com calma.",
      "Me conta — estou ouvindo.",
      "Claro — pode desabafar se quiser.",
    ],
    warm_reserved: ["Pode continuar — estou ouvindo.", "Claro — pode explicar com calma."],
  };
  return pickRhythmGovernedVariant(pools[key] || pools.warm_balanced, contract, "listener");
}

export function buildEncourageLightlyReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_balanced: [
      "Faz sentido ter dúvida — é normal.",
      "Entendo — incerteza faz parte.",
      "Compreendo — dá para pensar com calma.",
    ],
    warm_light: ["Normal ter dúvida.", "Entendo — isso acontece."],
    warm_reserved: ["Compreendo — dúvida é natural.", "Entendo."],
  };
  return pickRhythmGovernedVariant(pools[key] || pools.warm_balanced, contract, "encourage");
}

export function buildHumanizationGovernedReply(contract = {}) {
  switch (contract.socialHumanizationBehavior) {
    case SOCIAL_HUMANIZATION_BEHAVIOR.EMPATHETIC_ACKNOWLEDGE:
      return buildEmpatheticAcknowledgeReply(contract);
    case SOCIAL_HUMANIZATION_BEHAVIOR.COMFORT_WITHOUT_THERAPY:
      return buildComfortWithoutTherapyReply(contract);
    case SOCIAL_HUMANIZATION_BEHAVIOR.GRATITUDE_WITH_PRESENCE:
      return buildGratitudeWithPresenceReply(contract);
    case SOCIAL_HUMANIZATION_BEHAVIOR.RECIPROCAL_ENGAGEMENT:
      return buildReciprocalEngagementReply(contract);
    case SOCIAL_HUMANIZATION_BEHAVIOR.CELEBRATE_LIGHTLY:
      return buildCelebrateLightlyReply(contract);
    case SOCIAL_HUMANIZATION_BEHAVIOR.LIGHT_HUMOR_REACT:
      return buildLightHumorReactReply(contract);
    case SOCIAL_HUMANIZATION_BEHAVIOR.WARM_PRESENCE:
      return buildWarmPresenceReply(contract);
    case SOCIAL_HUMANIZATION_BEHAVIOR.LISTENER_MODE:
      return buildListenerModeReply(contract);
    case SOCIAL_HUMANIZATION_BEHAVIOR.ENCOURAGE_LIGHTLY:
      return buildEncourageLightlyReply(contract);
    default:
      return "";
  }
}

export function enrichContractWithSocialHumanization(
  contract = {},
  { message = "", recognition = null, conversationMessages = [] } = {}
) {
  const rec = recognition || {};
  const humanization = resolveSocialHumanization({
    message: message || contract.resolvedQuery || "",
    recognition: rec,
    contract,
    conversationMessages,
  });

  const metrics = computeHumanizationMetrics(humanization);
  const deferVerbalizationToContinuity = !!contract.socialContinuityBehavior;
  const deferVerbalizationToPersonalityReciprocal =
    contract.expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.RECIPROCATE_WARMTH;
  const deferVerbalization =
    deferVerbalizationToContinuity || deferVerbalizationToPersonalityReciprocal;
  const bypass =
    !!humanization.socialHumanizationBehavior &&
    humanization.empathyLevel !== EMPATHY_LEVEL.LOW &&
    !contract.factValidation?.bypassLlmVerbalization &&
    !deferVerbalization;

  return {
    ...contract,
    socialHumanizationVersion: SOCIAL_HUMANIZATION_VERSION,
    socialHumanization: humanization,
    socialHumanizationBehavior: humanization.socialHumanizationBehavior,
    socialHumanizationDeferVerbalization: deferVerbalization,
    humanizationMetrics: metrics,
    socialHumanizationBypass:
      bypass && !contract.socialContinuityBypass && !contract.personalityGovernanceBypass,
    sessionHumanizationPersist: {
      version: SOCIAL_HUMANIZATION_VERSION,
      lastEmotionalCategory: humanization.emotionalCategory,
      empathyLevel: humanization.empathyLevel,
    },
  };
}

export function socialHumanizationToVerbalizationInstructions(contract = {}) {
  const h = contract.socialHumanization || {};
  if (!contract.socialHumanizationVersion) return "";

  const lines = [
    "Humanização social governada (obrigatório — empatia e expressividade natural):",
    `- Categoria emocional: ${h.emotionalCategory || "none"}`,
    `- Nível de empatia: ${h.empathyLevel || "low"}`,
    `- Expressividade: ${h.expressivenessLevel || "restrained"}`,
    `- Presença: ${h.humanPresenceMode || "responder"}`,
    "- Soar presente e humana — sem frieza funcional.",
    "- Não ser terapêutica, motivacional ou exagerada.",
  ];

  if (h.comfortStyle === "validating_hopeful") {
    lines.push("- Acolha com validação leve e esperança discreta — sem conselho clínico.");
  }
  if (h.encouragementStyle === "celebrate") {
    lines.push("- Celebre levemente a conquista ou alegria do usuário.");
  }
  if (h.humorAllowance === "light") {
    lines.push("- Reação leve permitida (hehe/boa) — sem exagero.");
  }
  if (h.listenerMode) {
    lines.push("- Modo escuta: demonstrar presença, não redirecionar funcionalmente.");
  }
  if (h.socialReciprocity === "required") {
    lines.push("- Reciprocidade natural — devolver interesse com calor genuíno.");
  }

  return lines.join("\n");
}

export function detectHumanizationViolations(text = "", contract = {}) {
  const violations = [];
  const raw = String(text || "").trim();
  if (!raw || !contract.socialHumanizationVersion) return violations;

  const h = contract.socialHumanization || {};
  const behavior = contract.socialHumanizationBehavior;

  if (THERAPEUTIC_PATTERN.test(raw)) violations.push("therapeutic_tone");

  if (
    (behavior === SOCIAL_HUMANIZATION_BEHAVIOR.COMFORT_WITHOUT_THERAPY ||
      behavior === SOCIAL_HUMANIZATION_BEHAVIOR.EMPATHETIC_ACKNOWLEDGE ||
      h.empathyLevel === EMPATHY_LEVEL.HIGH) &&
    COLD_EMOTIONAL_PATTERN.test(raw)
  ) {
    violations.push("cold_emotional_response");
  }

  if (behavior === SOCIAL_HUMANIZATION_BEHAVIOR.GRATITUDE_WITH_PRESENCE && COLD_GRATITUDE_PATTERN.test(raw)) {
    violations.push("cold_gratitude_response");
  }

  if (
    (behavior === SOCIAL_HUMANIZATION_BEHAVIOR.LISTENER_MODE ||
      h.humanPresenceMode === HUMAN_PRESENCE_MODE.LISTENER) &&
    FUNCTIONAL_STAY_SOCIAL.test(raw)
  ) {
    violations.push("functional_stay_social");
  }

  return violations;
}

export function applySocialHumanizationGovernance(text = "", contract = {}) {
  const raw = String(text || "").trim();
  if (!raw || !contract.socialHumanizationBehavior) {
    return { reply: raw, replaced: false, violations: [] };
  }

  const violations = detectHumanizationViolations(raw, contract);
  if (!violations.length) {
    return { reply: raw, replaced: false, violations: [] };
  }

  const corrected = buildHumanizationGovernedReply(contract);
  if (corrected && normalizeText(corrected) !== normalizeText(raw)) {
    return { reply: corrected, replaced: true, violations };
  }

  return { reply: raw, replaced: false, violations };
}

export function socialHumanizationToTrace(contract = {}) {
  const h = contract.socialHumanization || {};
  return {
    version: SOCIAL_HUMANIZATION_VERSION,
    emotionalCategory: h.emotionalCategory,
    empathyLevel: h.empathyLevel,
    expressivenessLevel: h.expressivenessLevel,
    behavior: contract.socialHumanizationBehavior,
    metrics: contract.humanizationMetrics,
  };
}
