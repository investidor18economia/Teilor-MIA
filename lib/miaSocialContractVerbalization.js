/**
 * PATCH 5.7 — Contract-Driven Social Verbalization
 *
 * Builds governed social surface text from contract dimensions only:
 * expectedHumanBehavior, personalityPolicy, responseDepth, followUpPolicy.
 * Does NOT decide intent, target, or routing — only expresses governed decisions.
 */

import { RESPONSE_DEPTH } from "./miaHumanConversationExperience.js";
import { EXPECTED_HUMAN_BEHAVIORS } from "./miaSocialIntentTaxonomy.js";
import { SOCIAL_DISTANCE } from "./miaSocialResponsePerception.js";
import { pickHumanizedVariant, hashSeed } from "./miaVerbalizerHumanization.js";

export const SOCIAL_CONTRACT_VERBALIZATION_VERSION = "5.7.0";

const FAMILY = Object.freeze({
  SOCIAL: "social",
  AMBIGUOUS_REFERENCE: "ambiguous_reference",
  AMBIGUOUS_SOCIAL: "ambiguous_social",
  CLARIFICATION: "clarification",
  HUMOR: "humor",
  CONVERSATION: "conversation",
  EMOTIONAL: "emotional",
  GRATITUDE: "gratitude",
  COMPLIMENT: "compliment",
  PRAISE: "praise",
});

function seedFromContract(contract = {}, extra = "") {
  return [
    contract.userMessageForSpecificity || "",
    contract.expectedHumanBehavior || "",
    contract.primarySocialIntent || "",
    contract.governedSocialRoutingKey || "",
    contract.personalityPolicy?.warmth || "",
    contract.responseDepth || "",
    extra,
  ].join("|");
}

function resolveMirrorGreetingToken(message = "") {
  const m = String(message || "").trim();
  if (/boa noite/i.test(m)) return "Boa noite";
  if (/bom dia/i.test(m)) return "Bom dia";
  if (/boa tarde/i.test(m)) return "Boa tarde";
  if (/eae|e aí|e ai|salve|fala/i.test(m)) return "E aí";
  if (/opa/i.test(m)) return "Opa";
  return "Oi";
}

function warmthKey(policy = {}) {
  const w = policy.warmth || "warm_balanced";
  const d = policy.socialDistance || SOCIAL_DISTANCE.NEUTRAL_WARM;
  if (d === SOCIAL_DISTANCE.LIGHT_PLAYFUL || w === "warm_light") return "warm_light";
  if (d === SOCIAL_DISTANCE.SUPPORTIVE_RESERVED || w === "warm_reserved") return "warm_reserved";
  return "warm_balanced";
}

const GREETING_CONTINUITY = Object.freeze({
  warm_light: ["Tudo certo.", "Beleza.", "E aí."],
  warm_balanced: ["Tudo bem.", "Como vai.", "Prazer em falar."],
  warm_reserved: ["Como posso ajudar.", "Em que posso ajudar."],
});

const GREETING_CONTINUITY_WITH_QUESTION = Object.freeze({
  warm_light: ["Tudo certo?", "E aí, como vai?", "Beleza?"],
  warm_balanced: ["Como vai?", "Tudo bem?", "Em que posso ajudar?"],
  warm_reserved: ["Como posso ajudar?", "Em que posso ajudar?"],
});

function greetingAllowsQuestionClosing(contract = {}) {
  const closure = String(contract.closureStyle || "");
  const followUp = String(contract.followUpPolicy || "none");
  return closure === "question_required" || followUp === "clarifying_required";
}

function resolveGreetingContinuityPool(contract = {}) {
  if (greetingAllowsQuestionClosing(contract)) {
    return GREETING_CONTINUITY_WITH_QUESTION;
  }
  return GREETING_CONTINUITY;
}

const WARM_CLARIFICATION = Object.freeze({
  warm_light: [
    "Hmm, não peguei — você fala de quê?",
    "Conta um pouquinho mais — é sobre o quê?",
    "Não ficou claro pra mim — do que você tá falando?",
  ],
  warm_balanced: [
    "Entendi — me ajuda: você se refere a quê?",
    "Acho que perdi o fio — é sobre o quê?",
    "Não captei direito — pode explicar um pouco?",
  ],
  warm_reserved: [
    "Pode me explicar um pouco melhor a que se refere?",
    "Me ajuda a entender — você fala de quê?",
  ],
});

const WARM_CLARIFICATION_STATEMENT = Object.freeze({
  warm_light: [
    "Hmm, não peguei — conta um pouquinho mais.",
    "Não ficou claro pra mim.",
    "Me perdi no fio aqui.",
  ],
  warm_balanced: [
    "Acho que perdi o fio — me conta um pouco.",
    "Não captei direito — pode explicar.",
    "Entendi — me ajuda com um pouco mais de contexto.",
  ],
  warm_reserved: [
    "Pode me explicar um pouco melhor.",
    "Me ajuda a entender o contexto.",
  ],
});

function clarificationAllowsQuestionClosing(contract = {}) {
  const closure = String(contract.closureStyle || "");
  const followUp = String(contract.followUpPolicy || "none");
  return closure === "question_required" || followUp === "clarifying_required";
}

function resolveClarificationPool(contract = {}) {
  return clarificationAllowsQuestionClosing(contract)
    ? WARM_CLARIFICATION
    : WARM_CLARIFICATION_STATEMENT;
}

const WARM_REACTION = Object.freeze({
  warm_light: ["Hehe!", "Boa!", "Aí sim.", "Show!"],
  warm_balanced: ["Boa — peguei.", "Aí sim.", "Show!"],
  warm_reserved: ["Certo.", "Ok."],
});

const WARM_APPROVAL = Object.freeze({
  warm_light: ["Show!", "Boa!", "Massa!"],
  warm_balanced: ["Beleza.", "Certo.", "Combinado."],
  warm_reserved: ["Entendido.", "Certo."],
});

const WARM_STAY_SOCIAL = Object.freeze({
  warm_light: ["Claro — pode falar à vontade.", "Beleza — estou por aqui.", "Pode mandar."],
  warm_balanced: ["Sem problema — fico por aqui no papo.", "Claro, pode falar comigo."],
  warm_reserved: ["Claro — pode continuar.", "Sem problema."],
});

const WARM_EMOTIONAL = Object.freeze({
  warm_light: ["Puxado.", "Dia pesado mesmo.", "Compreendo."],
  warm_balanced: ["Dia pesado cansa mesmo.", "Entendo — pesa mesmo.", "Compreendo."],
  warm_reserved: ["Compreendo.", "Entendo."],
});

const WARM_GRATITUDE = Object.freeze({
  warm_light: ["Imagina!", "Por nada!", "Disponha."],
  warm_balanced: ["Por nada.", "Imagina.", "Disponha."],
  warm_reserved: ["Por nada.", "De nada."],
});

const WARM_COMPLIMENT = Object.freeze({
  warm_light: ["Que gentil — obrigada!", "Valeu pelo carinho!", "Obrigada!"],
  warm_balanced: ["Que gentil — obrigada.", "Obrigada pelo elogio.", "Valeu!"],
  warm_reserved: ["Obrigada.", "Agradeço."],
});

function pickWarm(pool, contract, extra = "") {
  const key = warmthKey(contract.personalityPolicy || {});
  const variants = pool[key] || pool.warm_balanced || [];
  return pickHumanizedVariant(variants, seedFromContract(contract, extra));
}

export function buildMirrorGreetingReply(contract = {}) {
  const message = contract.userMessageForSpecificity || "";
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;
  const mirror = resolveMirrorGreetingToken(message);
  const seed = seedFromContract(contract, "greeting");

  if (depth === RESPONSE_DEPTH.MINIMAL) {
    return `${mirror}!`;
  }

  const continuity = pickHumanizedVariant(
    resolveGreetingContinuityPool(contract)[warmthKey(contract.personalityPolicy || {})] ||
      resolveGreetingContinuityPool(contract).warm_balanced,
    seed
  );
  return `${mirror}! ${continuity}`;
}

export function buildWarmSocialClarificationReply(contract = {}) {
  return pickWarm(resolveClarificationPool(contract), contract, "clarification");
}

export function buildWarmReactionReply(contract = {}) {
  return pickWarm(WARM_REACTION, contract, "reaction");
}

export function buildWarmApprovalReply(contract = {}) {
  return pickWarm(WARM_APPROVAL, contract, "approval");
}

export function buildWarmStaySocialReply(contract = {}) {
  return pickWarm(WARM_STAY_SOCIAL, contract, "stay_social");
}

export function buildWarmEmotionalReply(contract = {}) {
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;
  if (depth === RESPONSE_DEPTH.MINIMAL) {
    return pickWarm({ warm_light: ["Puxado."], warm_balanced: ["Compreendo."], warm_reserved: ["Entendo."] }, contract, "emotional-min");
  }
  return pickWarm(WARM_EMOTIONAL, contract, "emotional");
}

export function buildWarmGratitudeReply(contract = {}) {
  return pickWarm(WARM_GRATITUDE, contract, "gratitude");
}

export function buildWarmComplimentReply(contract = {}) {
  return pickWarm(WARM_COMPLIMENT, contract, "compliment");
}

/**
 * Primary entry — maps governed contract dimensions to surface text.
 */
export function buildContractDrivenSocialFallback(contract = {}, family = "", options = {}) {
  const behavior = contract.expectedHumanBehavior || "";
  const failureReason = options.failureReason || "";

  if (behavior === EXPECTED_HUMAN_BEHAVIORS.MIRROR_GREETING || family === FAMILY.SOCIAL && (contract.primaryIntent === "greeting" || contract.socialFamilies?.greeting)) {
    return {
      text: buildMirrorGreetingReply(contract),
      builder: "buildMirrorGreetingReply",
      reasonCodes: ["contract_driven", "mirror_greeting", behavior, failureReason],
    };
  }

  if (behavior === EXPECTED_HUMAN_BEHAVIORS.RECEIVE_REACTION || family === FAMILY.HUMOR) {
    return {
      text: buildWarmReactionReply(contract),
      builder: "buildWarmReactionReply",
      reasonCodes: ["contract_driven", "warm_reaction", failureReason],
    };
  }

  if (behavior === EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_APPROVAL) {
    return {
      text: buildWarmApprovalReply(contract),
      builder: "buildWarmApprovalReply",
      reasonCodes: ["contract_driven", "warm_approval", failureReason],
    };
  }

  if (
    behavior === EXPECTED_HUMAN_BEHAVIORS.INVITE_CLARIFICATION ||
    behavior === EXPECTED_HUMAN_BEHAVIORS.REPAIR_CONTEXT ||
    family === FAMILY.AMBIGUOUS_REFERENCE ||
    family === FAMILY.CLARIFICATION
  ) {
    return {
      text: buildWarmSocialClarificationReply(contract),
      builder: "buildWarmSocialClarificationReply",
      reasonCodes: ["contract_driven", "warm_clarification", behavior, family, failureReason],
    };
  }

  if (family === FAMILY.AMBIGUOUS_SOCIAL) {
    return {
      text: buildWarmSocialClarificationReply(contract),
      builder: "buildWarmSocialClarificationReply",
      reasonCodes: ["contract_driven", "warm_clarification", behavior, family, failureReason],
    };
  }

  if (behavior === EXPECTED_HUMAN_BEHAVIORS.STAY_SOCIAL || behavior === EXPECTED_HUMAN_BEHAVIORS.SMALL_TALK_REPLY || family === FAMILY.CONVERSATION) {
    return {
      text: buildWarmStaySocialReply(contract),
      builder: "buildWarmStaySocialReply",
      reasonCodes: ["contract_driven", "stay_social", failureReason],
    };
  }

  if (behavior === EXPECTED_HUMAN_BEHAVIORS.VALIDATE_EMOTION || family === FAMILY.EMOTIONAL) {
    return {
      text: buildWarmEmotionalReply(contract),
      builder: "buildWarmEmotionalReply",
      reasonCodes: ["contract_driven", "warm_emotional", failureReason],
    };
  }

  if (behavior === EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_GRATITUDE || family === FAMILY.GRATITUDE) {
    return {
      text: buildWarmGratitudeReply(contract),
      builder: "buildWarmGratitudeReply",
      reasonCodes: ["contract_driven", "warm_gratitude", failureReason],
    };
  }

  if (
    behavior === EXPECTED_HUMAN_BEHAVIORS.RECEIVE_COMPLIMENT ||
    family === FAMILY.COMPLIMENT ||
    family === FAMILY.PRAISE
  ) {
    return {
      text: buildWarmComplimentReply(contract),
      builder: "buildWarmComplimentReply",
      reasonCodes: ["contract_driven", "warm_compliment", failureReason],
    };
  }

  return null;
}

export function socialContractVerbalizationToTrace(result = null) {
  if (!result) return null;
  return {
    version: SOCIAL_CONTRACT_VERBALIZATION_VERSION,
    builder: result.builder || null,
    reasonCodes: result.reasonCodes || [],
  };
}
