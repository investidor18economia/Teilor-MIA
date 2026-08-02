/**
 * PATCH 4.1I — Social Intent Taxonomy & Recognition
 *
 * Family-based social intent classification. MIA owns the intelligence;
 * outputs rich signals for downstream architecture without moving cognition to LLM.
 *
 * @version 4.1I
 */

import {
  detectFactualContrastFragment,
  isCorrectionRequestMessage,
} from "./miaCorrectionContinuityGovernance.js";

export const SOCIAL_INTENT_TAXONOMY_VERSION = "4.1I.5.8.1";

/** Granular social intent families (primary classification vocabulary). */
export const SOCIAL_INTENT_FAMILIES = Object.freeze({
  GREETING: "greeting",
  FAREWELL: "farewell",
  GRATITUDE: "gratitude",
  COMPLIMENT: "compliment",
  PRAISE: "praise",
  AFFECTION: "affection",
  APPROVAL: "approval",
  DISAPPROVAL: "disapproval",
  FLIRT: "flirt",
  HUMOR: "humor",
  JOKE: "joke",
  IRONY: "irony",
  SARCASM: "sarcasm",
  FRUSTRATION: "frustration",
  CONFUSION: "confusion",
  CORRECTION: "correction",
  SOFT_DISAGREEMENT: "soft_disagreement",
  HARD_DISAGREEMENT: "hard_disagreement",
  INSULT: "insult",
  META_QUESTION: "meta_question",
  IDENTITY_QUESTION: "identity_question",
  CAPABILITY_QUESTION: "capability_question",
  TRUST_QUESTION: "trust_question",
  CONVERSATION_REQUEST: "conversation_request",
  SMALL_TALK: "small_talk",
  EMOTIONAL_SUPPORT: "emotional_support",
  CURIOSITY: "curiosity",
  REACTION: "reaction",
  ACKNOWLEDGEMENT: "acknowledgement",
  USER_UNCERTAINTY: "user_uncertainty",
  USER_CONFIDENCE: "user_confidence",
  CONTEXT_REPAIR: "context_repair",
  CONVERSATION_RECOVERY: "conversation_recovery",
  SOCIAL_VALIDATION: "social_validation",
  COMPREHENSION: "comprehension",
  COMPREHENSION_SUCCESS: "comprehension_success",
  POST_PURCHASE_ACK: "post_purchase_ack",
  PASSIVE_BROWSING: "passive_browsing",
});

export const EMOTIONAL_STATES = Object.freeze({
  NEUTRAL: "neutral",
  POSITIVE: "positive",
  HAPPY: "happy",
  GRATEFUL: "grateful",
  AFFECTIONATE: "affectionate",
  PLAYFUL: "playful",
  CURIOUS: "curious",
  UNCERTAIN: "uncertain",
  CONFUSED: "confused",
  FRUSTRATED: "frustrated",
  ANGRY: "angry",
  HURT: "hurt",
  CONFIDENT: "confident",
  TIRED: "tired",
  ANXIOUS: "anxious",
});

export const CONVERSATION_OBJECTIVES = Object.freeze({
  INITIATE_CONTACT: "initiate_contact",
  CLOSE_INTERACTION: "close_interaction",
  RECEIVE_ACKNOWLEDGMENT: "receive_acknowledgment",
  EXPRESS_FEELING: "express_feeling",
  CREATE_CONNECTION: "create_connection",
  CONTINUE_CONVERSATION: "continue_conversation",
  LEARN_ABOUT_MIA: "learn_about_mia",
  REPAIR_UNDERSTANDING: "repair_understanding",
  RECOVER_CONVERSATION: "recover_conversation",
  SEEK_VALIDATION: "seek_validation",
  PLAY_ALONG: "play_along",
  VENT: "vent",
  CLARIFY_MESSAGE: "clarify_message",
});

export const CONVERSATION_DIRECTIONS = Object.freeze({
  OPEN: "open",
  CLOSE: "close",
  CONTINUE: "continue",
  REPAIR: "repair",
  REDIRECT_COMMERCIAL: "redirect_commercial",
  HOLD: "hold",
});

export const EXPECTED_HUMAN_BEHAVIORS = Object.freeze({
  MIRROR_GREETING: "mirror_greeting",
  RECIPROCATE_WARMTH: "reciprocate_warmth",
  ACKNOWLEDGE_GRATITUDE: "acknowledge_gratitude",
  RECEIVE_COMPLIMENT: "receive_compliment",
  DEFLECT_FLIRT: "deflect_flirt",
  PLAY_HUMOR: "play_humor",
  VALIDATE_EMOTION: "validate_emotion",
  DE_ESCALATE: "de_escalate",
  REPAIR_CONTEXT: "repair_context",
  ANSWER_META: "answer_meta",
  BUILD_TRUST: "build_trust",
  SMALL_TALK_REPLY: "small_talk_reply",
  RECEIVE_REACTION: "receive_reaction",
  ACKNOWLEDGE_APPROVAL: "acknowledge_approval",
  INVITE_CLARIFICATION: "invite_clarification",
  STAY_SOCIAL: "stay_social",
  ACKNOWLEDGE_DISAPPROVAL: "acknowledge_disapproval",
});

const MIA_DIRECT_ADDRESS =
  /\b(mia|voce|você|vc|contigo|contigo|pra voce|pra você|de voce|de você|te)\b/;

const PRODUCT_DEMONSTRATIVE =
  /\b(esse|essa|este|esta|ele|ela|isso|aquilo|o produto|a opção|opcao|modelo|celular|iphone|samsung)\b/;

const PROFANITY_OR_INSULT =
  /\b(pqp|porra|caralho|merda|burr[ao]|idiot\w*|inutil|inútil|lix[ao]|fajut\w*|vendedor\w*|rob[oô]|lixo|otari\w*|imbecil)\b/;

/** Process frustration — excludes quality criticism captured by RESPONSE_CRITICISM_MARKERS. */
const FRUSTRATION_MARKERS =
  /\b(n[aã]o\s+(?:ta|tá|est[aá])\s+ajud\w*|nao\s+ajud\w*|n[aã]o\s+entend\w*|nao\s+entend\w*|doidez|doideza|t[aá]\s+doid\w*|que\s+assistente|inutil|inútil|nada\s+a\s+ver|para\s+de\s+enrol\w*|você\s+não\s+entendeu\s+nada|voce\s+nao\s+entendeu\s+nada)\b/;

/** Criticism of response form/quality (not pure emotional venting). */
const RESPONSE_CRITICISM_MARKERS =
  /\b(ficou\s+(?:p[eé]ssim\w*|ruim|fraco|seco|longo|confuso|estranho|chato)|(?:resposta|explica[cç][aã]o)\s+(?:ficou\s+)?(?:ruim|p[eé]ssim\w*|seca|longa|confusa)|achei\s+fraco|muito\s+seco|muito\s+longo|ficou\s+confuso)\b/;

const DISAPPROVAL_MARKERS =
  /\b(n[aã]o\s+gost\w*|n[aã]o\s+curt\w*|achei\s+ruim|n[aã]o\s+me\s+convenc\w*|nao\s+me\s+convenc\w*|prefiro\s+outr\w*|muda\s+isso|esse\s+n[aã]o\s+serve|nao\s+quero\s+esse|n[aã]o\s+quero\s+esse)\b/;

const DISAGREEMENT_MARKERS =
  /\b(discord\w*|n[aã]o\s+concord\w*|isso\s+n[aã]o\s+faz\s+sentido|nao\s+faz\s+sentido)\b/;

const RECOMMENDATION_REJECTION_MARKERS =
  /\b(n[aã]o\s+gost\w*.*(?:recomend\w*|sugest\w*)|(?:recomend\w*|sugest\w*).*(?:ruim|p[eé]ssim\w*|frac\w*)|nao\s+quero\s+essa\s+(?:op[cç][aã]o|sugest\w*)|essa\s+recomenda[cç][aã]o\s+(?:foi\s+)?(?:ruim|p[eé]ssim\w*))\b/;

const PRODUCT_REJECTION_MARKERS =
  /\b(?:(?:esse|essa|este|esta)\s+(?:produto|celular|modelo|aparelho)\s+[eé]\s+ruim|(?:esse|essa|este|esta).{0,24}[eé]\s+ruim|produto\s+ruim|celular\s+ruim)\b/;

const DISAPPROVAL_RESPONSE_MARKERS =
  /\b(n[aã]o\s+gost\w*|n[aã]o\s+curt\w*)\s+(?:do\s+jeito|da\s+forma|da\s+maneira|como\s+(?:voce|você|vc)\s+(?:respondeu|falou|explicou))\b/;

const DISAPPROVAL_PRODUCT_MARKERS =
  /\b(n[aã]o\s+gost\w*|n[aã]o\s+curt\w*|achei\s+ruim)\s+(?:desse|deste|dessa|desta|do|da|dele|dela|desse\s+celular|desse\s+produto)\b/;

const APPROVAL_MARKERS =
  /\b(gostei|curti|adorei|amei|top|massa|show|legal|bacana|perfeito|excelente)\b/;

const CORRECTION_MARKERS =
  /\b(n[aã]o\s+entend\w*|voce\s+nao\s+entend|você\s+não\s+entend|entendeu\s+errad\w*|entendeu\s+nada|deixou\s+passar|viajou|confundiu|nao\s+foi\s+isso|não\s+foi\s+isso|(?:voce|você|vc)\s+err\w*|(?:est[aá]|ta)\s+errad\w*|(?:isso|essa|esse)\s+(?:resposta\s+)?(?:est[aá]|ta)\s+errad\w*|(?:dado|informa[cç][aã]o)\s+errad\w*|nao\s+est[aá]\s+certo|não\s+está\s+certo|citou\s+est[aá]\s+errad\w*)\b/;

/** Correction-request verb morphology — PATCH 5.8.1 */
const CORRECTION_REQUEST_MARKERS =
  /\b(corr(?:ig|ij)\w*|arrum\w*|consert\w*|rev(?:[êe]|is)\w*|ajust\w*|retific\w*)\b/;

const SARCASM_IRONY_MARKERS =
  /\b(claro\s+que|com\s+certeza|ah\s+sim|obvio|óbvio|era\s+iron|foi\s+iron|brincadeira|s[oó]\s+ligar|so\s+ligar|explod\w*|kkk|haha|rs\b|😂|🤣)\b/;

const META_IDENTITY_MARKERS =
  /\b(quem\s+te\s+cri\w*|quem\s+te\s+fez|quem\s+[eé]\s+voce|quem\s+[eé]\s+você|de\s+onde\s+vem|o\s+que\s+[eé]\s+a\s+mia)\b/;

const META_CAPABILITY_MARKERS =
  /\b(como\s+voce\s+funcion\w*|como\s+você\s+funcion\w*|como\s+funciona|o\s+que\s+voce\s+faz|o\s+que\s+você\s+faz|como\s+voce\s+audita|como\s+você\s+audita)\b/;

const META_TRUST_MARKERS =
  /\b(por\s+que\s+(?:eu\s+)?deveria\s+confiar|posso\s+confiar|voce\s+ganha\s+comiss\w*|você\s+ganha\s+comiss\w*|e\s+confi[aá]vel|me\s+empurra\s+produto)\b/;

const META_GENERAL_MARKERS =
  /\b(por\s+que\s+voce\s+nao\s+sabe|por\s+que\s+você\s+não\s+sabe|limita[cç][aã]o|limites|objetiv\w*\s+da\s+mia)\b/;

const FLIRT_MARKERS =
  /\b(linda|lindo|bonit\w*|gostos\w*|crush|namor|sair\s+juntos|ficar\s+comigo|😏|❤️|💕)\b/;

const PRAISE_TO_MIA_MARKERS =
  /\b(voce\s+[eé]\s+(?:muito\s+)?(?:inteligent|incrivel|incrível|espert\w*|incrivel|demais|otim[ao]|brab[ao])|gostei\s+de\s+(?:voce|você|vc)|adorei\s+(?:voce|você|vc)|voce\s+me\s+ajud\w*|você\s+me\s+ajud\w*|mandou\s+bem|arrasou|parab[eé]ns|vc\s+eh\s+demais|você\s+é\s+demais)\b/;

const GRATITUDE_MARKERS =
  /\b(obrigad\w*|valeu|vlw|brigad\w*|tmj|agrade[cç]o|grato|grata|thanks|thx)\b/;

const GREETING_MARKERS =
  /^(oi+|ol[aá]+|e\s*a[ií]|eae|opa|fala|salve|hey|hello|hi|bom\s+dia|boa\s+tarde|boa\s+noite)\b/;

const FAREWELL_MARKERS =
  /\b(tchau|ate\s+logo|até\s+logo|ate\s+mais|até\s+mais|falou|flw|fui|vou\s+nessa|to\s+indo|tô\s+indo)\b/;

const SMALL_TALK_MARKERS =
  /\b(como\s+(?:ta|tá|vai|esta|está)\s+(?:seu|o)\s+dia|como\s+voc[eê]\s+est[aá]|tudo\s+bem|blz\??|beleza\??|e\s+a[ií]\??)\b/;

const CONVERSATION_REQUEST_MARKERS =
  /\b(s[oó]\s+queria\s+convers|so\s+queria\s+convers|queria\s+convers|quero\s+conversar|conversar\s+sobre|vamos\s+conversar|bater\s+papo|trocar\s+ideia|falar\s+um\s+pouco|conversar\s+um\s+pouco|podemos\s+conversar)\b/;

const CONVERSATION_APPRECIATION_MARKERS =
  /\b(gostei (?:dessa|da) conversa|curti (?:o|a) conversa|boa conversa|legal conversar|estou gostando da conversa)\b/;

const EMOTIONAL_STATE_MARKERS = Object.freeze({
  [EMOTIONAL_STATES.HAPPY]: /\b(feliz|alegre|empolgad\w*|animad\w*|top|massa|show)\b/,
  [EMOTIONAL_STATES.FRUSTRATED]: /\b(frustrad\w*|irritad\w*|puto|estressad\w*|cansad\w*)\b/,
  [EMOTIONAL_STATES.UNCERTAIN]: /\b(indecis\w*|nao\s+sei|não\s+sei|d[uú]vida|perdid\w*)\b/,
  [EMOTIONAL_STATES.CONFIDENT]: /\b(sei\s+exat|tenho\s+certeza|decidid\w*|confiante)\b/,
  [EMOTIONAL_STATES.ANXIOUS]: /\b(ansios\w*|preocupad\w*|medo|receio|arrepender)\b/,
  [EMOTIONAL_STATES.TIRED]: /\b(cansad\w*|exaust\w*|sem\s+cabeca|sem\s+cabeça)\b/,
});

/** Family priority weights — higher wins ties at equal confidence. */
const FAMILY_PRIORITY = Object.freeze({
  [SOCIAL_INTENT_FAMILIES.INSULT]: 95,
  [SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT]: 90,
  [SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR]: 88,
  [SOCIAL_INTENT_FAMILIES.CONVERSATION_RECOVERY]: 87,
  [SOCIAL_INTENT_FAMILIES.CORRECTION]: 86,
  [SOCIAL_INTENT_FAMILIES.TRUST_QUESTION]: 85,
  [SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION]: 84,
  [SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION]: 83,
  [SOCIAL_INTENT_FAMILIES.META_QUESTION]: 82,
  [SOCIAL_INTENT_FAMILIES.FRUSTRATION]: 80,
  [SOCIAL_INTENT_FAMILIES.SARCASM]: 78,
  [SOCIAL_INTENT_FAMILIES.IRONY]: 77,
  [SOCIAL_INTENT_FAMILIES.JOKE]: 76,
  [SOCIAL_INTENT_FAMILIES.FLIRT]: 74,
  [SOCIAL_INTENT_FAMILIES.PRAISE]: 73,
  [SOCIAL_INTENT_FAMILIES.COMPLIMENT]: 72,
  [SOCIAL_INTENT_FAMILIES.AFFECTION]: 71,
  [SOCIAL_INTENT_FAMILIES.GRATITUDE]: 70,
  [SOCIAL_INTENT_FAMILIES.GREETING]: 68,
  [SOCIAL_INTENT_FAMILIES.FAREWELL]: 67,
  [SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT]: 65,
  [SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST]: 64,
  [SOCIAL_INTENT_FAMILIES.SMALL_TALK]: 62,
  [SOCIAL_INTENT_FAMILIES.EMOTIONAL_SUPPORT]: 60,
  [SOCIAL_INTENT_FAMILIES.USER_UNCERTAINTY]: 72,
  [SOCIAL_INTENT_FAMILIES.USER_CONFIDENCE]: 57,
  [SOCIAL_INTENT_FAMILIES.HUMOR]: 55,
  [SOCIAL_INTENT_FAMILIES.APPROVAL]: 54,
  [SOCIAL_INTENT_FAMILIES.ACKNOWLEDGEMENT]: 52,
  [SOCIAL_INTENT_FAMILIES.REACTION]: 50,
  [SOCIAL_INTENT_FAMILIES.CURIOSITY]: 48,
  [SOCIAL_INTENT_FAMILIES.COMPREHENSION_SUCCESS]: 46,
  [SOCIAL_INTENT_FAMILIES.COMPREHENSION]: 45,
  [SOCIAL_INTENT_FAMILIES.SOCIAL_VALIDATION]: 44,
  [SOCIAL_INTENT_FAMILIES.POST_PURCHASE_ACK]: 43,
  [SOCIAL_INTENT_FAMILIES.PASSIVE_BROWSING]: 40,
  [SOCIAL_INTENT_FAMILIES.DISAPPROVAL]: 84,
});

export function normalizeSocialMessage(message = "") {
  return String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, " ")
    .replace(/[?!.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCount(message = "") {
  const q = normalizeSocialMessage(message);
  if (!q) return 0;
  return q.split(" ").filter(Boolean).length;
}

function scorePattern(pattern, message, baseConfidence = 0.75) {
  const q = normalizeSocialMessage(message);
  if (!q || !pattern.test(q)) return 0;
  return baseConfidence;
}

/**
 * Detect if aesthetic compliment is directed at MIA (not a product).
 */
export function isComplimentDirectedAtMia(message = "") {
  const q = normalizeSocialMessage(message);
  if (!q) return false;

  if (PRAISE_TO_MIA_MARKERS.test(q)) return true;
  if (/\b(voce|você|vc)\s+me\s+ajud\w*\b/.test(q)) return true;
  if (FLIRT_MARKERS.test(q) && MIA_DIRECT_ADDRESS.test(q)) return true;

  const aestheticOnly =
    /^(lind[ao]|bonit[ao]|maravilhos[ao])$/i.test(q.trim());
  if (aestheticOnly) return true;

  if (
    /\b(lind[ao]|bonit[ao]|inteligent\w*)\b/.test(q) &&
    MIA_DIRECT_ADDRESS.test(q) &&
    !PRODUCT_DEMONSTRATIVE.test(q)
  ) {
    return true;
  }

  return false;
}

/**
 * Returns true when message should NOT be treated as product aesthetic commentary.
 */
/**
 * Returns true when message should NOT be treated as product aesthetic commentary.
 */
export function shouldSuppressProductAestheticFrame(message = "") {
  return isComplimentDirectedAtMia(message);
}

export function isPlayfulDominantOverCommercial(message = "", classification = null) {
  const c = classification || classifySocialIntent(message);
  if (!c.isPlayfulIntent) return false;
  if (
    ![
      SOCIAL_INTENT_FAMILIES.SARCASM,
      SOCIAL_INTENT_FAMILIES.IRONY,
      SOCIAL_INTENT_FAMILIES.JOKE,
      SOCIAL_INTENT_FAMILIES.HUMOR,
    ].includes(c.primarySocialIntent)
  ) {
    return false;
  }

  const q = normalizeSocialMessage(message);
  const hasSubstantiveCommercialAsk =
    /\b(recomend\w*|indica\w*|bateria|camera|autonomia|preco|preço|melhor|compar\w*|vale\s+a\s+pena|quanto\s+custa)\b/.test(
      q
    );

  if (hasSubstantiveCommercialAsk) {
    return (
      c.primarySocialIntent === SOCIAL_INTENT_FAMILIES.SARCASM ||
      c.primarySocialIntent === SOCIAL_INTENT_FAMILIES.IRONY
    );
  }

  return true;
}

function detectEmotionalState(message = "") {
  const q = normalizeSocialMessage(message);
  for (const [state, pattern] of Object.entries(EMOTIONAL_STATE_MARKERS)) {
    if (pattern.test(q)) return state;
  }
  if (PROFANITY_OR_INSULT.test(q) || FRUSTRATION_MARKERS.test(q)) {
    return EMOTIONAL_STATES.FRUSTRATED;
  }
  if (GRATITUDE_MARKERS.test(q)) return EMOTIONAL_STATES.GRATEFUL;
  if (SARCASM_IRONY_MARKERS.test(q)) return EMOTIONAL_STATES.PLAYFUL;
  return EMOTIONAL_STATES.NEUTRAL;
}

function buildFamilyMatch(family, confidence, reasonCodes = [], signals = []) {
  const priority = FAMILY_PRIORITY[family] || 40;
  return {
    family,
    confidence: Math.min(1, Math.max(0, confidence)),
    score: confidence * (priority / 100),
    reasonCodes,
    signals,
  };
}

/**
 * Run all family detectors and return ranked matches.
 */
export function detectSocialIntentFamilies(message = "", context = {}) {
  const q = normalizeSocialMessage(message);
  const tokens = tokenCount(message);
  const cognitive = context.cognitiveSignals || {};
  const existing = context.existingFamilies || {};
  const matches = [];

  if (!q) return matches;

  // Greeting
  if (cognitive.isGreeting || existing.greeting || GREETING_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.GREETING, 0.88, ["greeting_signal"], ["greeting"])
    );
  }

  // Farewell
  if (existing.farewell || FAREWELL_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.FAREWELL, 0.85, ["farewell_signal"], ["farewell"])
    );
  }

  // Gratitude
  if (existing.acknowledgement && GRATITUDE_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.GRATITUDE, 0.86, ["gratitude_ack"], ["gratitude"])
    );
  } else if (GRATITUDE_MARKERS.test(q) && !FRUSTRATION_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.GRATITUDE, 0.82, ["gratitude_signal"], ["gratitude"])
    );
  }

  // Insult / hard disagreement
  if (PROFANITY_OR_INSULT.test(q)) {
    const isInsult = /\b(burr\w*|idiot\w*|inutil\w*|inútil|lix\w*|fajut\w*|rob[oô]\w*|otari\w*|imbecil\w*|assistente\s+inutil)\b/.test(q);
    matches.push(
      buildFamilyMatch(
        isInsult ? SOCIAL_INTENT_FAMILIES.INSULT : SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT,
        0.9,
        ["profanity_or_hostility"],
        ["hostility"]
      )
    );
  }

  // Factual correction contrast fragment (PATCH 5.8.1 — before generic correction markers)
  const factualContrast = detectFactualContrastFragment(message);
  if (factualContrast.detected) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.CORRECTION,
        0.93,
        ["factual_contrast", "correction_signal", factualContrast.reasonCode],
        ["correction", "factual_contrast"]
      )
    );
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR,
        0.9,
        ["context_repair_from_factual_contrast"],
        ["repair"]
      )
    );
  }

  // Correction request continuation (PATCH 5.8.1)
  if (isCorrectionRequestMessage(message) && tokens <= 6) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.CORRECTION,
        0.9,
        ["correction_request", "correction_signal"],
        ["correction"]
      )
    );
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR,
        0.87,
        ["context_repair_from_correction_request"],
        ["repair"]
      )
    );
  }

  // Factual correction / error (before frustration and generic disapproval)
  if (CORRECTION_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.CORRECTION, 0.91, ["correction_signal", "factual_error"], ["correction"])
    );
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR,
        0.88,
        ["context_repair_from_correction"],
        ["repair"]
      )
    );
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.CONVERSATION_RECOVERY,
        0.86,
        ["conversation_recovery"],
        ["recovery"]
      )
    );
  }

  // Response quality criticism (before frustration — "ficou péssimo" is criticism, not vent)
  if (RESPONSE_CRITICISM_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.DISAPPROVAL,
        0.92,
        ["response_criticism"],
        ["disapproval", "response_target", "response_criticism"]
      )
    );
  }

  // Disagreement / contestation
  if (DISAGREEMENT_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT,
        0.88,
        ["disagreement_signal"],
        ["soft_disagreement", "contestation"]
      )
    );
  }

  // Recommendation rejection
  if (RECOMMENDATION_REJECTION_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.DISAPPROVAL,
        0.93,
        ["recommendation_rejection"],
        ["disapproval", "recommendation_target"]
      )
    );
  }

  // Product rejection
  if (PRODUCT_REJECTION_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.DISAPPROVAL,
        0.91,
        ["product_rejection"],
        ["disapproval", "product_target"]
      )
    );
  }

  // Disapproval / rejection (before frustration — "não foi isso" stays correction)
  if (DISAPPROVAL_RESPONSE_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.DISAPPROVAL,
        0.93,
        ["disapproval_of_response"],
        ["disapproval", "response_target"]
      )
    );
  } else if (DISAPPROVAL_PRODUCT_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.DISAPPROVAL,
        0.91,
        ["disapproval_of_product"],
        ["disapproval", "product_target"]
      )
    );
  } else if (DISAPPROVAL_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.DISAPPROVAL,
        0.89,
        ["disapproval_signal"],
        ["disapproval"]
      )
    );
  }

  // Frustration (process/emotional vent — after technical negative families)
  if (FRUSTRATION_MARKERS.test(q) && !CORRECTION_MARKERS.test(q) && !RESPONSE_CRITICISM_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.FRUSTRATION, 0.84, ["frustration_signal"], ["frustration"])
    );
  }

  // Standalone approval / positive reaction
  if (
    /^(gostei|curti|adorei|amei|top|massa|show|legal|bacana|perfeito|excelente)[.!]?$/i.test(q) ||
    (/\b(nossa|caramba|que)\s+(legal|massa|show|bacana)\b/.test(q) && tokens <= 6)
  ) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.APPROVAL, 0.84, ["expressive_approval"], ["approval"])
    );
  } else if (APPROVAL_MARKERS.test(q) && !DISAPPROVAL_MARKERS.test(q) && tokens <= 4) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.APPROVAL, 0.78, ["brief_approval"], ["approval"])
    );
  }

  // Meta / identity / capability / trust (capability & trust before generic identity)
  if (META_CAPABILITY_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION,
        0.94,
        ["capability_question"],
        ["meta", "capability"]
      )
    );
  }
  if (META_TRUST_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.TRUST_QUESTION, 0.93, ["trust_question"], ["meta", "trust"])
    );
  }
  if (
    (cognitive.isAboutMia || existing.aboutMia || META_IDENTITY_MARKERS.test(q)) &&
    !META_CAPABILITY_MARKERS.test(q) &&
    !META_TRUST_MARKERS.test(q)
  ) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION,
        0.88,
        ["identity_question"],
        ["meta", "identity"]
      )
    );
  }
  if (META_GENERAL_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.META_QUESTION, 0.8, ["meta_question"], ["meta"])
    );
  }

  // Sarcasm / irony / joke / humor
  const hasSarcasmCue = SARCASM_IRONY_MARKERS.test(q);
  const hasAbsurdCommercial =
    /\b(explod\w*|so\s+ligar|s[oó]\s+ligar|5\s+mil|5000)\b/.test(q) && hasSarcasmCue;
  if (hasAbsurdCommercial || /\b(claro\s+que\s+quero|ah\s+sim\s+quero\s+gastar)\b/.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.SARCASM, 0.86, ["sarcasm_absurd_request"], ["sarcasm"])
    );
  } else if (/\bera\s+iron|foi\s+iron|brincadeira\b/.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.IRONY, 0.85, ["explicit_irony"], ["irony"])
    );
  } else if (/\bconta\s+uma\s+piada\b/.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.JOKE, 0.84, ["joke_request"], ["joke"])
    );
  } else if (/\b(batman|kkk|haha|rs\b)\b/.test(q) && tokens <= 12) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.HUMOR, 0.72, ["humor_playful"], ["humor"])
    );
  }

  // Flirt / praise / compliment to MIA (praise ranks above generic compliment)
  if (isComplimentDirectedAtMia(message)) {
    if (/\b(crush|namor|sair\s+juntos|😏)\b/.test(q)) {
      matches.push(
        buildFamilyMatch(SOCIAL_INTENT_FAMILIES.FLIRT, 0.86, ["flirt_to_mia"], ["flirt", "mia_target"])
      );
    } else if (PRAISE_TO_MIA_MARKERS.test(q)) {
      matches.push(
        buildFamilyMatch(SOCIAL_INTENT_FAMILIES.PRAISE, 0.88, ["praise_to_mia"], ["praise", "mia_target"])
      );
    } else {
      matches.push(
        buildFamilyMatch(
          SOCIAL_INTENT_FAMILIES.COMPLIMENT,
          0.83,
          ["compliment_to_mia"],
          ["compliment", "mia_target"]
        )
      );
    }
  }

  // Social validation / approval
  if (existing.socialValidation || cognitive.isSocialValidation) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.SOCIAL_VALIDATION,
        0.8,
        ["social_validation_legacy"],
        ["validation"]
      )
    );
  }
  if (/\b(boa|perfeito|perfeita|arrasou|show|massa|demais|mandou\s+bem)\b/.test(q) && tokens <= 4) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.APPROVAL, 0.82, ["short_approval"], ["approval"])
    );
  }

  // Small talk / conversation request
  if (SMALL_TALK_MARKERS.test(q) && !CORRECTION_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.SMALL_TALK, 0.8, ["small_talk_signal"], ["small_talk"])
    );
  }
  if (existing.desireToChat || CONVERSATION_REQUEST_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST,
        0.82,
        ["conversation_request"],
        ["conversation_request"]
      )
    );
  }
  if (CONVERSATION_APPRECIATION_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST,
        0.84,
        ["conversation_appreciation"],
        ["conversation_request"]
      )
    );
  }

  // Emotional / uncertainty / confidence
  if (/\b(t[oô]\s+indecis\w*)\b/.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.USER_UNCERTAINTY,
        0.86,
        ["explicit_user_uncertainty"],
        ["uncertainty"]
      )
    );
  }
  if (/\b(t[oô]\s+(?:feliz|frustrad\w*|perdid\w*|ansios\w*|cansad\w*))\b/.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.EMOTIONAL_SUPPORT,
        0.84,
        ["explicit_emotional_state"],
        ["emotional"]
      )
    );
  }
  if (/\b(n[aã]o\s+sei|nao\s+tenho\s+certeza|n[aã]o\s+tenho\s+certeza)\b/.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.USER_UNCERTAINTY,
        0.92,
        ["explicit_nao_sei"],
        ["uncertainty"]
      )
    );
  }
  if (/\b(indecis\w*|d[uú]vida)\b/.test(q) && tokens <= 8) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.USER_UNCERTAINTY,
        0.76,
        ["user_uncertainty"],
        ["uncertainty"]
      )
    );
  }
  if (/\b(tenho\s+certeza|decidid\w*|confiante)\b/.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.USER_CONFIDENCE,
        0.74,
        ["user_confidence"],
        ["confidence"]
      )
    );
  }

  // Comprehension families (legacy cognitive)
  if (existing.comprehension || cognitive.isComprehension) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.COMPREHENSION,
        0.75,
        ["comprehension_legacy"],
        ["comprehension"]
      )
    );
  }
  if (existing.comprehensionSuccess || cognitive.isComprehensionSuccess) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.COMPREHENSION_SUCCESS,
        0.75,
        ["comprehension_success_legacy"],
        ["comprehension_success"]
      )
    );
  }

  // Soft disagreement (legacy cognitive + lexical disagreement)
  if (existing.softDisagreement || cognitive.isSoftDisagreement || DISAGREEMENT_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT,
        0.78,
        ["soft_disagreement_legacy"],
        ["soft_disagreement"]
      )
    );
  }

  // Reaction / acknowledgement / passive
  if (existing.reaction || /^(kkk+|rs+|haha+|show|massa|legal|top|demais|verdade|sim|claro)$/i.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.REACTION, 0.7, ["reaction_signal"], ["reaction"])
    );
  }
  if (existing.postPurchaseAck) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.POST_PURCHASE_ACK,
        0.82,
        ["post_purchase_ack"],
        ["post_purchase"]
      )
    );
  }
  if (existing.passiveBrowsing) {
    matches.push(
      buildFamilyMatch(
        SOCIAL_INTENT_FAMILIES.PASSIVE_BROWSING,
        0.75,
        ["passive_browsing"],
        ["passive"]
      )
    );
  }

  // Confusion
  if (/\b(n[aã]o\s+entendi|confus\w*|perdid\w*)\b/.test(q) && !CORRECTION_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.CONFUSION, 0.72, ["confusion_signal"], ["confusion"])
    );
  }

  // Curiosity (non-meta)
  if (/\b(curios\w*|me\s+conta\s+mais|como\s+assim)\b/.test(q) && !META_CAPABILITY_MARKERS.test(q)) {
    matches.push(
      buildFamilyMatch(SOCIAL_INTENT_FAMILIES.CURIOSITY, 0.68, ["curiosity_signal"], ["curiosity"])
    );
  }

  return matches.sort((a, b) => b.score - a.score);
}

function deriveConversationObjective(primaryFamily, emotionalState) {
  const map = {
    [SOCIAL_INTENT_FAMILIES.GREETING]: CONVERSATION_OBJECTIVES.INITIATE_CONTACT,
    [SOCIAL_INTENT_FAMILIES.FAREWELL]: CONVERSATION_OBJECTIVES.CLOSE_INTERACTION,
    [SOCIAL_INTENT_FAMILIES.GRATITUDE]: CONVERSATION_OBJECTIVES.RECEIVE_ACKNOWLEDGMENT,
    [SOCIAL_INTENT_FAMILIES.PRAISE]: CONVERSATION_OBJECTIVES.RECEIVE_ACKNOWLEDGMENT,
    [SOCIAL_INTENT_FAMILIES.COMPLIMENT]: CONVERSATION_OBJECTIVES.CREATE_CONNECTION,
    [SOCIAL_INTENT_FAMILIES.AFFECTION]: CONVERSATION_OBJECTIVES.CREATE_CONNECTION,
    [SOCIAL_INTENT_FAMILIES.FLIRT]: CONVERSATION_OBJECTIVES.CREATE_CONNECTION,
    [SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION]: CONVERSATION_OBJECTIVES.LEARN_ABOUT_MIA,
    [SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION]: CONVERSATION_OBJECTIVES.LEARN_ABOUT_MIA,
    [SOCIAL_INTENT_FAMILIES.TRUST_QUESTION]: CONVERSATION_OBJECTIVES.LEARN_ABOUT_MIA,
    [SOCIAL_INTENT_FAMILIES.META_QUESTION]: CONVERSATION_OBJECTIVES.LEARN_ABOUT_MIA,
    [SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST]: CONVERSATION_OBJECTIVES.CONTINUE_CONVERSATION,
    [SOCIAL_INTENT_FAMILIES.SMALL_TALK]: CONVERSATION_OBJECTIVES.CONTINUE_CONVERSATION,
    [SOCIAL_INTENT_FAMILIES.CORRECTION]: CONVERSATION_OBJECTIVES.REPAIR_UNDERSTANDING,
    [SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR]: CONVERSATION_OBJECTIVES.REPAIR_UNDERSTANDING,
    [SOCIAL_INTENT_FAMILIES.CONVERSATION_RECOVERY]: CONVERSATION_OBJECTIVES.RECOVER_CONVERSATION,
    [SOCIAL_INTENT_FAMILIES.FRUSTRATION]: CONVERSATION_OBJECTIVES.VENT,
    [SOCIAL_INTENT_FAMILIES.INSULT]: CONVERSATION_OBJECTIVES.VENT,
    [SOCIAL_INTENT_FAMILIES.SOCIAL_VALIDATION]: CONVERSATION_OBJECTIVES.SEEK_VALIDATION,
    [SOCIAL_INTENT_FAMILIES.HUMOR]: CONVERSATION_OBJECTIVES.PLAY_ALONG,
    [SOCIAL_INTENT_FAMILIES.JOKE]: CONVERSATION_OBJECTIVES.PLAY_ALONG,
    [SOCIAL_INTENT_FAMILIES.SARCASM]: CONVERSATION_OBJECTIVES.PLAY_ALONG,
    [SOCIAL_INTENT_FAMILIES.IRONY]: CONVERSATION_OBJECTIVES.PLAY_ALONG,
    [SOCIAL_INTENT_FAMILIES.USER_UNCERTAINTY]: CONVERSATION_OBJECTIVES.CLARIFY_MESSAGE,
    [SOCIAL_INTENT_FAMILIES.DISAPPROVAL]: CONVERSATION_OBJECTIVES.REPAIR_UNDERSTANDING,
    [SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT]: CONVERSATION_OBJECTIVES.REPAIR_UNDERSTANDING,
  };
  if (map[primaryFamily]) return map[primaryFamily];
  if (
    emotionalState === EMOTIONAL_STATES.FRUSTRATED ||
    emotionalState === EMOTIONAL_STATES.ANXIOUS
  ) {
    return CONVERSATION_OBJECTIVES.EXPRESS_FEELING;
  }
  return CONVERSATION_OBJECTIVES.CREATE_CONNECTION;
}

function deriveConversationDirection(primaryFamily) {
  if (primaryFamily === SOCIAL_INTENT_FAMILIES.FAREWELL) return CONVERSATION_DIRECTIONS.CLOSE;
  if (
    primaryFamily === SOCIAL_INTENT_FAMILIES.CORRECTION ||
    primaryFamily === SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR ||
    primaryFamily === SOCIAL_INTENT_FAMILIES.CONVERSATION_RECOVERY
  ) {
    return CONVERSATION_DIRECTIONS.REPAIR;
  }
  if (primaryFamily === SOCIAL_INTENT_FAMILIES.GREETING) return CONVERSATION_DIRECTIONS.OPEN;
  return CONVERSATION_DIRECTIONS.CONTINUE;
}

function deriveExpectedHumanBehavior(primaryFamily) {
  const map = {
    [SOCIAL_INTENT_FAMILIES.GREETING]: EXPECTED_HUMAN_BEHAVIORS.MIRROR_GREETING,
    [SOCIAL_INTENT_FAMILIES.GRATITUDE]: EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_GRATITUDE,
    [SOCIAL_INTENT_FAMILIES.PRAISE]: EXPECTED_HUMAN_BEHAVIORS.RECEIVE_COMPLIMENT,
    [SOCIAL_INTENT_FAMILIES.COMPLIMENT]: EXPECTED_HUMAN_BEHAVIORS.RECEIVE_COMPLIMENT,
    [SOCIAL_INTENT_FAMILIES.AFFECTION]: EXPECTED_HUMAN_BEHAVIORS.RECIPROCATE_WARMTH,
    [SOCIAL_INTENT_FAMILIES.FLIRT]: EXPECTED_HUMAN_BEHAVIORS.DEFLECT_FLIRT,
    [SOCIAL_INTENT_FAMILIES.FRUSTRATION]: EXPECTED_HUMAN_BEHAVIORS.VALIDATE_EMOTION,
    [SOCIAL_INTENT_FAMILIES.INSULT]: EXPECTED_HUMAN_BEHAVIORS.DE_ESCALATE,
    [SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT]: EXPECTED_HUMAN_BEHAVIORS.DE_ESCALATE,
    [SOCIAL_INTENT_FAMILIES.CORRECTION]: EXPECTED_HUMAN_BEHAVIORS.REPAIR_CONTEXT,
    [SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR]: EXPECTED_HUMAN_BEHAVIORS.REPAIR_CONTEXT,
    [SOCIAL_INTENT_FAMILIES.CONVERSATION_RECOVERY]: EXPECTED_HUMAN_BEHAVIORS.REPAIR_CONTEXT,
    [SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION]: EXPECTED_HUMAN_BEHAVIORS.ANSWER_META,
    [SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION]: EXPECTED_HUMAN_BEHAVIORS.ANSWER_META,
    [SOCIAL_INTENT_FAMILIES.TRUST_QUESTION]: EXPECTED_HUMAN_BEHAVIORS.BUILD_TRUST,
    [SOCIAL_INTENT_FAMILIES.META_QUESTION]: EXPECTED_HUMAN_BEHAVIORS.ANSWER_META,
    [SOCIAL_INTENT_FAMILIES.SMALL_TALK]: EXPECTED_HUMAN_BEHAVIORS.SMALL_TALK_REPLY,
    [SOCIAL_INTENT_FAMILIES.HUMOR]: EXPECTED_HUMAN_BEHAVIORS.PLAY_HUMOR,
    [SOCIAL_INTENT_FAMILIES.JOKE]: EXPECTED_HUMAN_BEHAVIORS.PLAY_HUMOR,
    [SOCIAL_INTENT_FAMILIES.SARCASM]: EXPECTED_HUMAN_BEHAVIORS.PLAY_HUMOR,
    [SOCIAL_INTENT_FAMILIES.IRONY]: EXPECTED_HUMAN_BEHAVIORS.PLAY_HUMOR,
    [SOCIAL_INTENT_FAMILIES.REACTION]: EXPECTED_HUMAN_BEHAVIORS.RECEIVE_REACTION,
    [SOCIAL_INTENT_FAMILIES.APPROVAL]: EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_APPROVAL,
    [SOCIAL_INTENT_FAMILIES.USER_UNCERTAINTY]: EXPECTED_HUMAN_BEHAVIORS.INVITE_CLARIFICATION,
    [SOCIAL_INTENT_FAMILIES.DISAPPROVAL]: EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_DISAPPROVAL,
    [SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT]: EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_DISAPPROVAL,
    [SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT]: EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_DISAPPROVAL,
    [SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST]: EXPECTED_HUMAN_BEHAVIORS.STAY_SOCIAL,
  };
  return map[primaryFamily] || EXPECTED_HUMAN_BEHAVIORS.STAY_SOCIAL;
}

/** Map granular social intent to legacy primaryIntent for routing compatibility. */
export function mapSocialIntentToLegacyPrimary(primarySocialIntent = "") {
  const legacyMap = {
    [SOCIAL_INTENT_FAMILIES.GREETING]: "greeting",
    [SOCIAL_INTENT_FAMILIES.FAREWELL]: "social_conversation",
    [SOCIAL_INTENT_FAMILIES.GRATITUDE]: "acknowledgement",
    [SOCIAL_INTENT_FAMILIES.ACKNOWLEDGEMENT]: "acknowledgement",
    [SOCIAL_INTENT_FAMILIES.POST_PURCHASE_ACK]: "acknowledgement",
    [SOCIAL_INTENT_FAMILIES.PRAISE]: "social_validation",
    [SOCIAL_INTENT_FAMILIES.COMPLIMENT]: "social_validation",
    [SOCIAL_INTENT_FAMILIES.AFFECTION]: "social_validation",
    [SOCIAL_INTENT_FAMILIES.APPROVAL]: "social_validation",
    [SOCIAL_INTENT_FAMILIES.SOCIAL_VALIDATION]: "social_validation",
    [SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION]: "about_mia",
    [SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION]: "about_mia",
    [SOCIAL_INTENT_FAMILIES.TRUST_QUESTION]: "about_mia",
    [SOCIAL_INTENT_FAMILIES.META_QUESTION]: "about_mia",
    [SOCIAL_INTENT_FAMILIES.COMPREHENSION]: "comprehension",
    [SOCIAL_INTENT_FAMILIES.COMPREHENSION_SUCCESS]: "comprehension",
    [SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT]: "soft_disagreement",
    [SOCIAL_INTENT_FAMILIES.EMOTIONAL_SUPPORT]: "emotional_support",
  };
  return legacyMap[primarySocialIntent] || primarySocialIntent || "social_conversation";
}

/** Merge taxonomy flags into legacy socialFamilies object for backward compatibility. */
export function mergeSocialFamilyFlags(existingFamilies = {}, classification = {}) {
  const primary = classification.primarySocialIntent;
  const flags = { ...existingFamilies };

  if (primary === SOCIAL_INTENT_FAMILIES.GREETING) flags.greeting = true;
  if (
    primary === SOCIAL_INTENT_FAMILIES.GRATITUDE ||
    primary === SOCIAL_INTENT_FAMILIES.ACKNOWLEDGEMENT ||
    primary === SOCIAL_INTENT_FAMILIES.POST_PURCHASE_ACK
  ) {
    flags.acknowledgement = true;
  }
  if (
    primary === SOCIAL_INTENT_FAMILIES.PRAISE ||
    primary === SOCIAL_INTENT_FAMILIES.COMPLIMENT ||
    primary === SOCIAL_INTENT_FAMILIES.APPROVAL ||
    primary === SOCIAL_INTENT_FAMILIES.SOCIAL_VALIDATION
  ) {
    flags.socialValidation = true;
    flags.compliment = true;
  }
  if (
    primary === SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION ||
    primary === SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION ||
    primary === SOCIAL_INTENT_FAMILIES.TRUST_QUESTION ||
    primary === SOCIAL_INTENT_FAMILIES.META_QUESTION
  ) {
    flags.aboutMia = true;
  }
  if (primary === SOCIAL_INTENT_FAMILIES.FAREWELL) flags.farewell = true;
  if (primary === SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT) flags.softDisagreement = true;
  if (
    primary === SOCIAL_INTENT_FAMILIES.DISAPPROVAL ||
    primary === SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT
  ) {
    flags.softDisagreement = true;
  }
  if (primary === SOCIAL_INTENT_FAMILIES.COMPREHENSION) flags.comprehension = true;
  if (primary === SOCIAL_INTENT_FAMILIES.COMPREHENSION_SUCCESS) flags.comprehensionSuccess = true;
  if (primary === SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST) flags.desireToChat = true;
  if (primary === SOCIAL_INTENT_FAMILIES.PASSIVE_BROWSING) flags.passiveBrowsing = true;
  if (primary === SOCIAL_INTENT_FAMILIES.POST_PURCHASE_ACK) flags.postPurchaseAck = true;
  if (
    primary === SOCIAL_INTENT_FAMILIES.REACTION ||
    primary === SOCIAL_INTENT_FAMILIES.HUMOR ||
    primary === SOCIAL_INTENT_FAMILIES.JOKE
  ) {
    flags.reaction = true;
  }

  flags.socialIntentPrimary = primary || null;
  flags.socialIntentSecondary = classification.secondarySocialIntent || null;

  return flags;
}

/**
 * Full social intent classification for a user message.
 *
 * @param {string} message
 * @param {object} [context]
 * @returns {object}
 */
export function classifySocialIntent(message = "", context = {}) {
  const matches = detectSocialIntentFamilies(message, context);
  const primary = matches[0] || null;
  const secondary =
    matches.length > 1 && matches[1].confidence >= 0.65 ? matches[1] : null;

  const primarySocialIntent = primary?.family || null;
  const secondarySocialIntent = secondary?.family || null;
  const emotionalState = detectEmotionalState(message);
  const conversationObjective = primarySocialIntent
    ? deriveConversationObjective(primarySocialIntent, emotionalState)
    : null;
  const conversationDirection = primarySocialIntent
    ? deriveConversationDirection(primarySocialIntent)
    : CONVERSATION_DIRECTIONS.CONTINUE;
  const expectedHumanBehavior = primarySocialIntent
    ? deriveExpectedHumanBehavior(primarySocialIntent)
    : EXPECTED_HUMAN_BEHAVIORS.STAY_SOCIAL;

  const reasonCodes = [
    ...(primary?.reasonCodes || []),
    ...(secondary?.reasonCodes || []),
  ];
  const signals = [...new Set([...(primary?.signals || []), ...(secondary?.signals || [])])];

  const confidence = primary?.confidence ?? 0;
  const legacyPrimaryIntent = primarySocialIntent
    ? mapSocialIntentToLegacyPrimary(primarySocialIntent)
    : null;

  return {
    taxonomyVersion: SOCIAL_INTENT_TAXONOMY_VERSION,
    primarySocialIntent,
    secondarySocialIntent,
    emotionalState,
    conversationObjective,
    conversationDirection,
    expectedHumanBehavior,
    confidence,
    reasonCodes,
    signals,
    legacyPrimaryIntent,
    matches,
    complimentToMia: isComplimentDirectedAtMia(message),
    suppressProductAestheticFrame: shouldSuppressProductAestheticFrame(message),
    isSocialDominant: !!primary && primary.confidence >= 0.65,
    isRepairIntent: [
      SOCIAL_INTENT_FAMILIES.CORRECTION,
      SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR,
      SOCIAL_INTENT_FAMILIES.CONVERSATION_RECOVERY,
    ].includes(primarySocialIntent),
    isMetaIntent: [
      SOCIAL_INTENT_FAMILIES.META_QUESTION,
      SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION,
      SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION,
      SOCIAL_INTENT_FAMILIES.TRUST_QUESTION,
    ].includes(primarySocialIntent),
    isPlayfulIntent: [
      SOCIAL_INTENT_FAMILIES.HUMOR,
      SOCIAL_INTENT_FAMILIES.JOKE,
      SOCIAL_INTENT_FAMILIES.IRONY,
      SOCIAL_INTENT_FAMILIES.SARCASM,
    ].includes(primarySocialIntent),
    isHostileIntent: [
      SOCIAL_INTENT_FAMILIES.INSULT,
      SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT,
      SOCIAL_INTENT_FAMILIES.FRUSTRATION,
    ].includes(primarySocialIntent),
    isDisapprovalIntent: [
      SOCIAL_INTENT_FAMILIES.DISAPPROVAL,
      SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT,
    ].includes(primarySocialIntent),
    isCorrectionIntent: primarySocialIntent === SOCIAL_INTENT_FAMILIES.CORRECTION,
    isCriticismIntent:
      primarySocialIntent === SOCIAL_INTENT_FAMILIES.DISAPPROVAL &&
      signals.some((s) => ["response_criticism", "response_target"].includes(s)),
    isDisagreementIntent: primarySocialIntent === SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT,
    isNegativeFeedbackIntent: [
      SOCIAL_INTENT_FAMILIES.CORRECTION,
      SOCIAL_INTENT_FAMILIES.DISAPPROVAL,
      SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT,
      SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT,
    ].includes(primarySocialIntent),
  };
}

export function socialIntentToTrace(classification = {}) {
  if (!classification?.primarySocialIntent) return null;
  return {
    taxonomyVersion: classification.taxonomyVersion,
    primarySocialIntent: classification.primarySocialIntent,
    secondarySocialIntent: classification.secondarySocialIntent,
    emotionalState: classification.emotionalState,
    conversationObjective: classification.conversationObjective,
    conversationDirection: classification.conversationDirection,
    expectedHumanBehavior: classification.expectedHumanBehavior,
    confidence: classification.confidence,
    reasonCodes: classification.reasonCodes,
    signals: classification.signals,
  };
}
