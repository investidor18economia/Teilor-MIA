/**
 * PATCH 5.8.2 — Central Personality Governance
 *
 * Defines HOW MIA should sound — not what to decide or route.
 * Does NOT decide intent, target, ranking or recovery.
 * Feeds both governed templates and LLM verbalization instructions.
 */

import { RESPONSE_DEPTH } from "./miaHumanConversationExperience.js";
import { SOCIAL_DISTANCE } from "./miaSocialResponsePerception.js";
import {
  EXPECTED_HUMAN_BEHAVIORS,
  EMOTIONAL_STATES,
} from "./miaSocialIntentTaxonomy.js";
import { hashSeed } from "./miaVerbalizerHumanization.js";
import { pickRhythmGovernedVariant } from "./miaConversationalRhythmGovernance.js";
import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";

export const PERSONALITY_GOVERNANCE_VERSION = "5.8.7";

export const MIA_IDENTITY = Object.freeze({
  name: "MIA",
  brand: "Teilor",
  role: "assistente inteligente de compras",
  essence:
    "acolhedora, leve, natural, curiosa, educada, calma, prestativa, confiante e inteligente",
});

export const PERSONALITY_TRAITS = Object.freeze({
  WARMTH: "warmth",
  FRIENDLINESS: "friendliness",
  CURIOSITY: "curiosity",
  RECIPROCITY: "reciprocity",
  OPENNESS: "conversation_openness",
  IDENTITY_CONSISTENCY: "identity_consistency",
  NATURALITY: "naturality",
  CALM_CONFIDENCE: "calm_confidence",
});

export const EMOTIONAL_VALENCE = Object.freeze({
  POSITIVE: "positive",
  NEUTRAL: "neutral",
  NEGATIVE: "negative",
  DISTRESS: "distress",
});

export const IDENTITY_QUERY_KIND = Object.freeze({
  NAME: "name",
  WHO: "who",
  HOW_WORKS: "how_works",
  CREATOR: "creator",
  REAL: "real",
  CAPABILITY: "capability",
  MEMORY: "memory",
  MODEL_TECH: "model_tech",
  AI_NATURE: "ai_nature",
  LEARNING: "learning",
  MIA_BRAND: "mia_brand",
  GENERAL: "general",
});

const DISTRESS_MARKERS =
  /\b(n[aã]o\s+t[oô]\s+legal|n[aã]o\s+estou\s+bem|to\s+meio\s+down|me\s+sinto\s+mal|t[oô]\s+(mal|down|triste)|semana\s+pesada|dia\s+(dif[ií]cil|puxado|ruim)|n[aã]o\s+t[oô]\s+legal|deprimid\w*|desanimad\w*)\b/i;

const NEGATIVE_MARKERS =
  /\b(p[eé]ssim\w*|horr[ií]vel|ruim|fraco|chato|decepcion\w*|triste|mal)\b/i;

const RECIPROCAL_MARKERS =
  /\b(e\s+voc[eê]|e\s+contigo|e\s+a[ií]|como\s+voc[eê]\s+(?:t[aá]|est[aá])|como\s+(?:foi|t[aá])\s+(?:seu|o)\s+dia|como\s+foi\s+o\s+seu\s+dia|dormiu\s+bem|como\s+vai\??|t[aá]\s+bem\??|est[aá]\s+tudo\s+bem)\b/i;

const IDENTITY_NAME = /\b(qual\s+(?:seu|o)\s+nome|como\s+(?:se\s+)?chama)\b/i;
const IDENTITY_WHO = /\b(quem\s+[eé]\s+voc[eê]|quem\s+[eé]\s+a\s+mia|me\s+conta\s+sobre\s+voc[eê])\b/i;
const IDENTITY_HOW = /\b(como\s+voc[eê]\s+funciona|como\s+funciona)\b/i;
const IDENTITY_CREATOR = /\b(quem\s+(?:te\s+)?criou|quem\s+fez\s+voc[eê])\b/i;
const IDENTITY_REAL = /\b(voc[eê]\s+[eé]\s+real|tem\s+sentimentos|tem\s+personalidade)\b/i;
const IDENTITY_CAPABILITY = /\b(o\s+que\s+voc[eê]\s+faz|suas\s+capacidades|do\s+que\s+voc[eê]\s+gosta)\b/i;
const IDENTITY_MEMORY =
  /\b(voc[eê]\s+lembra|tem\s+mem[oó]ria|lembra\s+das\s+coisas|guarda\s+isso|lembra\s+de\s+mim|voc[eê]\s+lembra\s+de\s+mim)\b/i;
const IDENTITY_MODEL =
  /\b(chat\s*gpt|open\s*ai|qual\s+modelo|gpt[\s-]?4|claude|usa\s+chatgpt|qual\s+ia\s+voc[eê]\s+usa)\b/i;
const IDENTITY_AI_NATURE = /\b(voc[eê]\s+[eé]\s+(?:uma\s+)?ia|voc[eê]\s+[eé]\s+chatgpt|voc[eê]\s+[eé]\s+um\s+rob[oô]|intelig[eê]ncia\s+artificial)\b/i;
const IDENTITY_LEARNING = /\b(voc[eê]\s+aprende|aprende\s+com|voc[eê]\s+aprende\s+comigo)\b/i;
const IDENTITY_MIA_BRAND = /\b(voc[eê]\s+[eé]\s+a\s+mia|sou\s+a\s+mia|mia\s+da\s+teilor)\b/i;

const COLD_CLARIFICATION =
  /\b(me\s+diz\s+rapidinho|me\s+ajuda:\s+voc[eê]\s+se\s+refere)\b/i;

const GENERIC_STAY_SOCIAL =
  /\b(claro,\s+pode\s+falar\s+comigo|sem\s+problema\s+—\s+fico\s+por\s+aqui\s+no\s+papo)\b/i;

const POSITIVE_ECHO_ON_DISTRESS =
  /\b(boa\s+—\s+legal|show\s+—\s+legal|boa\s+—\s+mal|show\s+—\s+down)\b/i;

const INCOMPATIBLE_POSITIVE =
  /\b(boa\s+—|show\s+—|massa\s+—|legal!|show!)\s*(legal|mal|down|triste|pessimo|p[eé]ssim\w*)/i;

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function seedFromContract(contract = {}, extra = "") {
  return [
    contract.userMessageForSpecificity || "",
    contract.centralPersonalityPolicy?.sessionKey || "",
    contract.expectedHumanBehavior || "",
    extra,
  ].join("|");
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

export function detectPerceivedEmotionalValence(message = "", recognition = {}) {
  const q = normalizeText(message);
  if (!q) return EMOTIONAL_VALENCE.NEUTRAL;
  if (DISTRESS_MARKERS.test(q)) return EMOTIONAL_VALENCE.DISTRESS;
  const emo = recognition.emotionalState || recognition.emotionalRelevance;
  if (
    emo === EMOTIONAL_STATES.FRUSTRATED ||
    emo === EMOTIONAL_STATES.ANXIOUS ||
    emo === EMOTIONAL_STATES.HURT ||
    emo === EMOTIONAL_STATES.ANGRY
  ) {
    return EMOTIONAL_VALENCE.DISTRESS;
  }
  if (NEGATIVE_MARKERS.test(q) && !/\b(n[aã]o|nem)\s+/i.test(q)) {
    return EMOTIONAL_VALENCE.NEGATIVE;
  }
  if (
    emo === EMOTIONAL_STATES.HAPPY ||
    emo === EMOTIONAL_STATES.GRATEFUL ||
    emo === EMOTIONAL_STATES.PLAYFUL
  ) {
    return EMOTIONAL_VALENCE.POSITIVE;
  }
  return EMOTIONAL_VALENCE.NEUTRAL;
}

export function detectReciprocalSocialPrompt(message = "") {
  return RECIPROCAL_MARKERS.test(normalizeText(message));
}

export function classifyIdentityQuery(message = "") {
  const q = normalizeText(message);
  if (IDENTITY_MIA_BRAND.test(q)) return IDENTITY_QUERY_KIND.MIA_BRAND;
  if (IDENTITY_NAME.test(q)) return IDENTITY_QUERY_KIND.NAME;
  if (IDENTITY_MEMORY.test(q)) return IDENTITY_QUERY_KIND.MEMORY;
  if (IDENTITY_MODEL.test(q)) return IDENTITY_QUERY_KIND.MODEL_TECH;
  if (IDENTITY_AI_NATURE.test(q)) return IDENTITY_QUERY_KIND.AI_NATURE;
  if (IDENTITY_LEARNING.test(q)) return IDENTITY_QUERY_KIND.LEARNING;
  if (IDENTITY_HOW.test(q)) return IDENTITY_QUERY_KIND.HOW_WORKS;
  if (IDENTITY_CREATOR.test(q)) return IDENTITY_QUERY_KIND.CREATOR;
  if (IDENTITY_REAL.test(q)) return IDENTITY_QUERY_KIND.REAL;
  if (IDENTITY_CAPABILITY.test(q)) return IDENTITY_QUERY_KIND.CAPABILITY;
  if (IDENTITY_WHO.test(q)) return IDENTITY_QUERY_KIND.WHO;
  return IDENTITY_QUERY_KIND.GENERAL;
}

function readSessionPersonalityState(sessionContext = {}) {
  const state = sessionContext.miaPersonalityState || sessionContext.personalityState || {};
  if (state.version && state.version !== PERSONALITY_GOVERNANCE_VERSION) {
    return {};
  }
  return state;
}

function buildSessionKey(sessionContext = {}, conversationMessages = []) {
  const userId = sessionContext.userId || sessionContext.user_id || "anon";
  const turn = Array.isArray(conversationMessages) ? conversationMessages.length : 0;
  return `${userId}|${Math.floor(turn / 4)}`;
}

export function resolveCentralPersonalityPolicy({
  recognition = {},
  contract = {},
  message = "",
  conversationMessages = [],
  sessionContext = {},
} = {}) {
  const sessionState = readSessionPersonalityState(sessionContext);
  const userMessage = message || contract.resolvedQuery || "";
  const emotionalValence = detectPerceivedEmotionalValence(userMessage, recognition);
  const reciprocal = detectReciprocalSocialPrompt(userMessage);
  const classifiedIdentity = classifyIdentityQuery(userMessage);
  const identityKind =
    classifiedIdentity !== IDENTITY_QUERY_KIND.GENERAL
      ? classifiedIdentity
      : contract.identityMode
        ? IDENTITY_QUERY_KIND.GENERAL
        : null;

  const socialDistance =
    sessionState.socialDistance ||
    contract.personalityPolicy?.socialDistance ||
    SOCIAL_DISTANCE.NEUTRAL_WARM;

  const warmth =
    sessionState.warmth ||
    contract.personalityPolicy?.warmth ||
    (socialDistance === SOCIAL_DISTANCE.SUPPORTIVE_RESERVED
      ? "warm_reserved"
      : socialDistance === SOCIAL_DISTANCE.LIGHT_PLAYFUL
        ? "warm_light"
        : "warm_balanced");

  const policy = {
    version: PERSONALITY_GOVERNANCE_VERSION,
    sessionKey: buildSessionKey(sessionContext, conversationMessages),
    identity: { ...MIA_IDENTITY },
    warmth,
    friendliness: sessionState.friendliness || "warm_natural",
    curiosity: sessionState.curiosity || "light_attentive",
    reciprocity: reciprocal ? "required" : sessionState.reciprocity || "when_prompted",
    conversationOpenness: sessionState.conversationOpenness || "inviting_calm",
    identityConsistency: "stable",
    greetingStyle: sessionState.greetingStyle || "mirror_warm_continuity",
    closureStyle: contract.closureStyle || sessionState.closureStyle || "soft_warm",
    socialEnergy: sessionState.socialEnergy || "calm_positive",
    responseEnergy: sessionState.responseEnergy || "measured_warm",
    humanTone: sessionState.humanTone || "natural_light",
    naturality: sessionState.naturality || "conversational",
    socialDistance,
    emotionalValence,
    reciprocalPrompt: reciprocal,
    identityQueryKind: identityKind,
    traits: Object.values(PERSONALITY_TRAITS),
    forbiddenPersona: [
      "infantil",
      "coach",
      "robotica",
      "fria",
      "forcada",
      "exagerada",
      "institucional_seca",
    ],
  };

  return policy;
}

export function resolveEmotionalGate({ centralPolicy = {}, recognition = {}, message = "" } = {}) {
  const valence =
    centralPolicy.emotionalValence || detectPerceivedEmotionalValence(message, recognition);
  return {
    valence,
    blockPositiveEcho: valence === EMOTIONAL_VALENCE.DISTRESS || valence === EMOTIONAL_VALENCE.NEGATIVE,
    requireEmotionalValidation:
      valence === EMOTIONAL_VALENCE.DISTRESS ||
      recognition.emotionalState === EMOTIONAL_STATES.FRUSTRATED ||
      recognition.emotionalState === EMOTIONAL_STATES.TIRED,
    forbidGenericStaySocial:
      valence === EMOTIONAL_VALENCE.DISTRESS || detectReciprocalSocialPrompt(message),
    reasonCodes:
      valence === EMOTIONAL_VALENCE.DISTRESS
        ? ["emotional_distress_detected"]
        : valence === EMOTIONAL_VALENCE.NEGATIVE
          ? ["negative_valence_detected"]
          : [],
  };
}

function mergePersonalityPolicy(existing = {}, central = {}) {
  return {
    ...existing,
    warmth: central.warmth || existing.warmth || "warm_balanced",
    socialDistance: central.socialDistance || existing.socialDistance,
    directness: existing.directness || "clear_natural",
    formality: existing.formality || "informal_light",
    humorAllowance: existing.humorAllowance || "none",
    emojiAllowance: existing.emojiAllowance || "none",
    emotionalIntensity:
      central.emotionalValence === EMOTIONAL_VALENCE.DISTRESS
        ? "supportive_light"
        : existing.emotionalIntensity || "none",
    identityVisibility:
      central.identityQueryKind ? "explicit_when_relevant" : existing.identityVisibility || "implicit",
    verbosity: existing.verbosity || RESPONSE_DEPTH.BRIEF,
    centralGovernance: true,
  };
}

export function enrichContractWithPersonalityGovernance(
  contract = {},
  {
    recognition = null,
    message = "",
    conversationMessages = [],
    sessionContext = {},
  } = {}
) {
  const rec = recognition || {};
  const centralPersonalityPolicy = resolveCentralPersonalityPolicy({
    recognition: rec,
    contract,
    message: message || contract.resolvedQuery || "",
    conversationMessages,
    sessionContext,
  });
  const emotionalGate = resolveEmotionalGate({
    centralPolicy: centralPersonalityPolicy,
    recognition: rec,
    message: message || contract.resolvedQuery || "",
  });

  let expectedHumanBehavior = contract.expectedHumanBehavior;
  if (centralPersonalityPolicy.identityQueryKind) {
    expectedHumanBehavior = EXPECTED_HUMAN_BEHAVIORS.ANSWER_META;
  } else if (centralPersonalityPolicy.reciprocalPrompt) {
    expectedHumanBehavior = EXPECTED_HUMAN_BEHAVIORS.RECIPROCATE_WARMTH;
  } else if (emotionalGate.requireEmotionalValidation) {
    expectedHumanBehavior = EXPECTED_HUMAN_BEHAVIORS.VALIDATE_EMOTION;
  }

  const personalityPolicy = mergePersonalityPolicy(
    contract.personalityPolicy || {},
    centralPersonalityPolicy
  );

  const bypassLlmVerbalization =
    !!contract.factValidation?.bypassLlmVerbalization ||
    (expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.ANSWER_META &&
      !!centralPersonalityPolicy.identityQueryKind) ||
    centralPersonalityPolicy.reciprocalPrompt;

  return {
    ...contract,
    personalityGovernanceVersion: PERSONALITY_GOVERNANCE_VERSION,
    centralPersonalityPolicy,
    emotionalGate,
    personalityPolicy,
    expectedHumanBehavior,
    identityQueryKind: centralPersonalityPolicy.identityQueryKind,
    identityMode: contract.identityMode || !!centralPersonalityPolicy.identityQueryKind,
    personalityGovernedVerbalization: true,
    personalityGovernanceBypass: bypassLlmVerbalization && !contract.factValidation?.bypassLlmVerbalization,
    sessionPersonalityPersist: {
      version: PERSONALITY_GOVERNANCE_VERSION,
      warmth: centralPersonalityPolicy.warmth,
      socialDistance: centralPersonalityPolicy.socialDistance,
      friendliness: centralPersonalityPolicy.friendliness,
      conversationOpenness: centralPersonalityPolicy.conversationOpenness,
      socialEnergy: centralPersonalityPolicy.socialEnergy,
      greetingStyle: centralPersonalityPolicy.greetingStyle,
    },
  };
}

export function personalityGovernanceToVerbalizationInstructions(contract = {}) {
  const cpp = contract.centralPersonalityPolicy || {};
  const gate = contract.emotionalGate || {};
  const lines = [
    "Personalidade central MIA (obrigatório — mesma voz em todo turno):",
    `- Identidade: ${cpp.identity?.name || "MIA"} — ${cpp.identity?.role || "assistente de compras"}`,
    `- Essência: ${cpp.identity?.essence || MIA_IDENTITY.essence}`,
    `- Calor: ${cpp.warmth || "warm_balanced"}; amizade: ${cpp.friendliness || "warm_natural"}`,
    `- Curiosidade: ${cpp.curiosity || "light_attentive"}; abertura: ${cpp.conversationOpenness || "inviting_calm"}`,
    `- Energia: ${cpp.socialEnergy || "calm_positive"}; tom humano: ${cpp.humanTone || "natural_light"}`,
    `- Naturalidade: ${cpp.naturality || "conversational"}; reciprocidade: ${cpp.reciprocity || "when_prompted"}`,
    "- Manter a MESMA personalidade independente de intent, target, LLM ou template.",
    "- Nunca infantil, coach, robótica, fria, forçada ou exagerada.",
    "- Não usar frases genéricas vazias como resposta principal.",
    "- Não inventar rotina, corpo ou emoções humanas reais.",
  ];

  if (gate.blockPositiveEcho) {
    lines.push(
      "- Estado emocional delicado: NÃO usar aprovação positiva, 'Boa — X', 'Show!' ou ecos celebratórios."
    );
    lines.push("- Reconheça com empatia calma e leve, sem positividade forçada.");
  }

  if (contract.identityQueryKind) {
    lines.push(
      "- Pergunta sobre identidade: responda como MIA de forma consistente, clara e acolhedora."
    );
  }

  if (cpp.reciprocalPrompt) {
    lines.push(
      "- Reciprocidade social: responda à pergunta sobre você de forma breve, natural e calorosa."
    );
  }

  if (contract.expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.INVITE_CLARIFICATION) {
    lines.push(
      "- Clarificação: humana e acolhedora — peça contexto com curiosidade, nunca seco ou burocrático."
    );
  }

  return lines.join("\n");
}

export function buildGovernedIdentityReply(contract = {}) {
  const kind = contract.identityQueryKind || IDENTITY_QUERY_KIND.GENERAL;
  const key = warmthKey(contract);
  const templates = {
    [IDENTITY_QUERY_KIND.NAME]: {
      warm_light: [`Sou a ${MIA_IDENTITY.name}!`, `Pode me chamar de ${MIA_IDENTITY.name}.`],
      warm_balanced: [
        `Sou a ${MIA_IDENTITY.name} — assistente inteligente de compras da ${MIA_IDENTITY.brand}.`,
        `Meu nome é ${MIA_IDENTITY.name}. Estou aqui para te ajudar a decidir melhor nas compras.`,
      ],
      warm_reserved: [
        `Sou a ${MIA_IDENTITY.name}, assistente de compras da ${MIA_IDENTITY.brand}.`,
      ],
    },
    [IDENTITY_QUERY_KIND.WHO]: {
      warm_balanced: [
        `Sou a ${MIA_IDENTITY.name} — ${MIA_IDENTITY.role} da ${MIA_IDENTITY.brand}. Gosto de conversar e ajudar a encontrar o que faz sentido pra você.`,
      ],
    },
    [IDENTITY_QUERY_KIND.HOW_WORKS]: {
      warm_balanced: [
        `Funciono como uma assistente de compras inteligente: entendo o que você precisa, comparo opções com critério e te explico em linguagem clara — sempre com calma e objetividade.`,
      ],
    },
    [IDENTITY_QUERY_KIND.CREATOR]: {
      warm_balanced: [
        `Fui criada pela equipe da ${MIA_IDENTITY.brand} para ser uma assistente de compras confiável e natural.`,
      ],
    },
    [IDENTITY_QUERY_KIND.REAL]: {
      warm_balanced: [
        `Sou a ${MIA_IDENTITY.name} — uma assistente inteligente, não uma pessoa. Mas levo a conversa a sério e fico feliz em ajudar de verdade.`,
      ],
    },
    [IDENTITY_QUERY_KIND.CAPABILITY]: {
      warm_balanced: [
        `Ajudo a comparar produtos, entender trade-offs e tomar decisões de compra com mais clareza — sempre conversando de forma natural.`,
      ],
    },
    [IDENTITY_QUERY_KIND.MEMORY]: {
      warm_balanced: [
        `Lembro do que conversamos nesta conversa — consigo retomar o papo enquanto estivermos aqui juntos.`,
        `Tenho memória do nosso papo atual. Se você retomar um assunto, eu acompanho.`,
      ],
      warm_light: [
        `Lembro sim do que falamos aqui — estou acompanhando o papo.`,
      ],
      warm_reserved: [
        `Consigo acompanhar o que conversamos nesta sessão.`,
      ],
    },
    [IDENTITY_QUERY_KIND.MODEL_TECH]: {
      warm_balanced: [
        `Sou a ${MIA_IDENTITY.name} — assistente da ${MIA_IDENTITY.brand}. Não sou ChatGPT; uso tecnologia própria para te ajudar nas compras.`,
        `Não uso ChatGPT nem outro modelo genérico — sou a ${MIA_IDENTITY.name}, feita pela ${MIA_IDENTITY.brand} para conversar e ajudar nas compras.`,
      ],
      warm_reserved: [
        `Sou a ${MIA_IDENTITY.name}, da ${MIA_IDENTITY.brand} — não sou ChatGPT.`,
      ],
    },
    [IDENTITY_QUERY_KIND.AI_NATURE]: {
      warm_balanced: [
        `Sou uma assistente inteligente — a ${MIA_IDENTITY.name} da ${MIA_IDENTITY.brand}. Não sou uma pessoa, mas converso de forma natural e transparente.`,
        `Sou IA sim — especificamente a ${MIA_IDENTITY.name}, criada para ajudar com compras de um jeito humano e claro.`,
      ],
    },
    [IDENTITY_QUERY_KIND.LEARNING]: {
      warm_balanced: [
        `Aprendo dentro desta conversa para te acompanhar melhor — mas não guardo memória permanente entre sessões diferentes.`,
        `Consigo me adaptar ao papo enquanto conversamos, mas não aprendo de forma permanente como uma pessoa.`,
      ],
      warm_reserved: [
        `Acompanho o papo em tempo real, mas não tenho memória permanente entre conversas.`,
      ],
    },
    [IDENTITY_QUERY_KIND.MIA_BRAND]: {
      warm_balanced: [
        `Sim — sou a ${MIA_IDENTITY.name}, assistente inteligente de compras da ${MIA_IDENTITY.brand}.`,
        `Isso mesmo! Sou a ${MIA_IDENTITY.name} da ${MIA_IDENTITY.brand}.`,
      ],
      warm_light: [`Sim, sou a ${MIA_IDENTITY.name}!`],
    },
    [IDENTITY_QUERY_KIND.GENERAL]: {
      warm_balanced: [
        `Sou a ${MIA_IDENTITY.name}, ${MIA_IDENTITY.role} da ${MIA_IDENTITY.brand}. Estou aqui para conversar e te ajudar nas compras.`,
      ],
    },
  };

  const pool = templates[kind] || templates[IDENTITY_QUERY_KIND.GENERAL];
  const variants = pool[key] || pool.warm_balanced || pool.warm_light || [];
  return pickRhythmGovernedVariant(variants, contract, seedFromContract(contract, `identity-${kind}`));
}

export function buildPersonalityGovernedGreetingReply(contract = {}, mirrorBuilder) {
  const mirrorFn = typeof mirrorBuilder === "function" ? mirrorBuilder : () => "";
  const base = mirrorFn(contract);
  if (!base) return base;

  const cpp = contract.centralPersonalityPolicy || {};
  if (cpp.greetingStyle !== "mirror_warm_continuity") return base;

  const openness = {
    warm_light: ["Que bom te ver por aqui.", "Bora conversar."],
    warm_balanced: ["Que bom te ver por aqui.", "Como posso te ajudar hoje?"],
    warm_reserved: ["Em que posso ajudar?", "Como posso te ajudar?"],
  };
  const key = warmthKey(contract);
  const hook = pickRhythmGovernedVariant(
    openness[key] || openness.warm_balanced,
    seedFromContract(contract, "greeting-openness")
  );

  if (base.endsWith("?") || base.split(/\s+/).length > 5) return base;
  return `${base.replace(/\.\s*$/, "")}. ${hook}`;
}

export function buildPersonalityGovernedStaySocialReply(contract = {}) {
  const key = warmthKey(contract);
  const gate = contract.emotionalGate || {};
  if (gate.forbidGenericStaySocial || gate.requireEmotionalValidation) {
    return buildPersonalityGovernedEmotionalReply(contract);
  }
  if (contract.centralPersonalityPolicy?.reciprocalPrompt) {
    return buildPersonalityGovernedReciprocalReply(contract);
  }

  const pools = {
    warm_light: [
      "Pode falar — estou acompanhando.",
      "Manda ver, tô aqui no papo.",
      "Claro — me conta mais.",
    ],
    warm_balanced: [
      "Pode falar — estou acompanhando com calma.",
      "Claro — me conta o que você quer explorar.",
      "Fico por aqui — o que você quer conversar?",
    ],
    warm_reserved: [
      "Pode continuar — estou ouvindo.",
      "Claro — pode explicar com calma.",
    ],
  };
  return pickRhythmGovernedVariant(
    pools[key] || pools.warm_balanced,
    seedFromContract(contract, "stay-social")
  );
}

export function buildPersonalityGovernedReciprocalReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_light: [
      "Por aqui, tudo certo — e com você?",
      "Tudo tranquilo por aqui! E aí, como você tá?",
      "Indo bem — e contigo?",
      "Tudo certo por aqui! E você, como vai?",
    ],
    warm_balanced: [
      "Por aqui, tudo certo — obrigada por perguntar. E você, como está?",
      "Tudo tranquilo por aqui! E contigo, como vai?",
      "Indo bem, obrigada! E você, tudo certo?",
      "Aqui está tudo bem — e com você, como foi o dia?",
      "Tranquilo por aqui! Me conta — como você está?",
    ],
    warm_reserved: [
      "Por aqui, tudo bem. E você?",
      "Tudo certo por aqui. Como você está?",
      "Indo bem. E contigo?",
      "Tudo certo. Como vai?",
    ],
  };
  return pickRhythmGovernedVariant(
    pools[key] || pools.warm_balanced,
    contract,
    seedFromContract(contract, "reciprocal")
  );
}

export function buildPersonalityGovernedEmotionalReply(contract = {}) {
  const key = warmthKey(contract);
  const pools = {
    warm_light: ["Puxado — entendo.", "Compreendo, pesou mesmo."],
    warm_balanced: [
      "Entendo — parece que não está fácil.",
      "Compreendo. Se quiser desabafar mais, pode falar.",
      "Isso pesa mesmo — entendo como você se sente.",
    ],
    warm_reserved: ["Compreendo.", "Entendo — isso não é simples."],
  };
  return pickRhythmGovernedVariant(
    pools[key] || pools.warm_balanced,
    seedFromContract(contract, "emotional-governed")
  );
}

export function buildPersonalityGovernedClarificationReply(contract = {}) {
  const key = warmthKey(contract);
  const allowQuestion =
    contract.closureStyle === "question_required" ||
    contract.followUpPolicy === "clarifying_required";

  const pools = allowQuestion
    ? {
        warm_light: [
          "Hmm, não peguei — você fala de quê?",
          "Conta um pouquinho mais — é sobre o quê?",
        ],
        warm_balanced: [
          "Acho que perdi o fio — me conta um pouco do contexto?",
          "Não captei direito — é sobre o quê, exatamente?",
          "Entendi — me ajuda com um pouco mais de contexto?",
        ],
        warm_reserved: [
          "Pode me explicar um pouco melhor a que se refere?",
          "Me ajuda a entender — você fala de quê?",
        ],
      }
    : {
        warm_light: ["Hmm, não peguei — conta um pouquinho mais.", "Não ficou claro pra mim."],
        warm_balanced: [
          "Acho que perdi o fio — me conta um pouco.",
          "Não captei direito — pode explicar com calma?",
          "Entendi — me ajuda com um pouco mais de contexto.",
        ],
        warm_reserved: ["Pode me explicar um pouco melhor.", "Me ajuda a entender o contexto."],
      };

  return pickRhythmGovernedVariant(
    pools[key] || pools.warm_balanced,
    seedFromContract(contract, "clarification-governed")
  );
}

export function shouldBlockContextualPositiveEcho(contract = {}, token = "") {
  const gate = contract.emotionalGate || {};
  if (!gate.blockPositiveEcho) return false;
  const t = normalizeText(token);
  if (!t) return false;
  const distressTokens = new Set([
    "legal",
    "mal",
    "down",
    "triste",
    "pessimo",
    "pessima",
    "ruim",
    "horrivel",
    "fraco",
  ]);
  return distressTokens.has(t);
}

export function detectPersonalityViolations(reply = "", contract = {}) {
  const text = String(reply || "").trim();
  const normalized = normalizeText(text);
  const violations = [];
  const gate = contract.emotionalGate || {};

  if (!text) return violations;

  if (gate.blockPositiveEcho && INCOMPATIBLE_POSITIVE.test(normalized)) {
    violations.push("positive_echo_on_distress");
  }
  if (gate.blockPositiveEcho && POSITIVE_ECHO_ON_DISTRESS.test(normalized)) {
    violations.push("positive_echo_on_distress");
  }

  if (
    contract.personalityGovernedVerbalization &&
    COLD_CLARIFICATION.test(normalized) &&
    contract.interactionMode !== MIA_INTERACTION_MODES.COMMERCE
  ) {
    violations.push("cold_clarification_personality");
  }

  if (
    contract.centralPersonalityPolicy?.reciprocalPrompt &&
    GENERIC_STAY_SOCIAL.test(normalized)
  ) {
    violations.push("generic_stay_social_on_reciprocal");
  }

  if (
    contract.identityQueryKind &&
    GENERIC_STAY_SOCIAL.test(normalized) &&
    contract.expectedHumanBehavior === EXPECTED_HUMAN_BEHAVIORS.ANSWER_META
  ) {
    violations.push("identity_replaced_by_generic_stay_social");
  }

  if (gate.requireEmotionalValidation && /\b(boa\s+—|show\s+—|massa)\b/i.test(normalized)) {
    violations.push("approval_on_emotional_distress");
  }

  return violations;
}

export function applyPersonalityGovernance(reply = "", contract = {}) {
  const violations = detectPersonalityViolations(reply, contract);
  if (!violations.length) {
    return { reply, replaced: false, violations: [] };
  }

  let governed = reply;
  if (contract.identityQueryKind && violations.includes("identity_replaced_by_generic_stay_social")) {
    governed = buildGovernedIdentityReply(contract);
  } else if (
    violations.includes("positive_echo_on_distress") ||
    violations.includes("approval_on_emotional_distress")
  ) {
    governed = buildPersonalityGovernedEmotionalReply(contract);
  } else if (violations.includes("generic_stay_social_on_reciprocal")) {
    governed = buildPersonalityGovernedReciprocalReply(contract);
  } else if (violations.includes("cold_clarification_personality")) {
    governed = buildPersonalityGovernedClarificationReply(contract);
  }

  return {
    reply: governed,
    replaced: governed !== reply,
    violations,
  };
}

export function personalityGovernanceToTrace(contract = {}) {
  if (!contract.personalityGovernanceVersion) return null;
  return {
    version: contract.personalityGovernanceVersion,
    warmth: contract.centralPersonalityPolicy?.warmth,
    emotionalValence: contract.centralPersonalityPolicy?.emotionalValence,
    identityQueryKind: contract.identityQueryKind || null,
    reciprocalPrompt: !!contract.centralPersonalityPolicy?.reciprocalPrompt,
    emotionalGate: contract.emotionalGate || null,
    expectedHumanBehavior: contract.expectedHumanBehavior || null,
  };
}
