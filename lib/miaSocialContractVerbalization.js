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
import { pickRhythmGovernedVariant } from "./miaConversationalRhythmGovernance.js";
import { SEMANTIC_TARGETS } from "./miaSemanticTargetResolution.js";
import {
  buildPendingFactValidationReply,
  buildConfirmedFactValidationReply,
} from "./miaFactValidationGovernance.js";
import {
  buildGovernedIdentityReply,
  buildPersonalityGovernedGreetingReply,
  buildPersonalityGovernedStaySocialReply,
  buildPersonalityGovernedClarificationReply,
  buildPersonalityGovernedReciprocalReply,
  buildPersonalityGovernedEmotionalReply,
  shouldBlockContextualPositiveEcho,
} from "./miaPersonalityGovernance.js";
import {
  SOCIAL_CONTINUITY_BEHAVIOR,
  buildContinuityGovernedReply,
} from "./miaSocialConversationContinuity.js";
import { buildHumanizationGovernedReply } from "./miaSocialHumanizationGovernance.js";

export const SOCIAL_CONTRACT_VERBALIZATION_VERSION = "5.8.5";

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
  DISAPPROVAL: "disapproval",
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
  return pickRhythmGovernedVariant(variants, contract, extra);
}

function primaryEchoToken(contract = {}) {
  const skipTokens = new Set([
    "ficou",
    "pessimo",
    "pessima",
    "ruim",
    "fraco",
    "seco",
    "longo",
    "confuso",
    "discordo",
    "recomendacao",
    "resposta",
    "produto",
    "celular",
    "gostei",
    "curti",
    "legal",
    "mal",
    "down",
    "triste",
  ]);
  const anchors = Array.isArray(contract.contentAnchors) ? contract.contentAnchors : [];
  const anchor = anchors.find((a) => String(a || "").length >= 4);
  if (anchor) return String(anchor);
  const msg = String(contract.userMessageForSpecificity || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const tokens = msg.split(/\s+/).filter((t) => t.length >= 4 && !skipTokens.has(t));
  return tokens[tokens.length - 1] || tokens[0] || "";
}

function disapprovalTargetKind(contract = {}) {
  const target = contract.resolvedSemanticTarget || contract.semanticTargetResolution?.target || "";
  const signals = contract.socialIntentSignals || [];
  if (signals.includes("recommendation_target") || signals.includes("recommendation_rejection")) {
    return "recommendation";
  }
  if (target === SEMANTIC_TARGETS.PRODUCT || signals.includes("product_target")) {
    return "product";
  }
  if (target === SEMANTIC_TARGETS.MIA || signals.includes("response_target")) {
    return "response";
  }
  if (target === SEMANTIC_TARGETS.PREVIOUS_ANSWER) {
    return "response";
  }
  if (signals.includes("response_criticism")) {
    return "response";
  }
  if (contract.commercialIntent || contract.interactionMode === "commerce") {
    return "recommendation";
  }
  return "unknown";
}

const WARM_DISAPPROVAL = Object.freeze({
  unknown: {
    warm_light: [
      (c) => `Entendi — pelo ${primaryEchoToken(c) || "feedback"}, foi da resposta ou da sugestão?`,
      (c) => `Pelo ${primaryEchoToken(c) || "tom"}, você não curtiu a resposta ou a opção?`,
    ],
    warm_balanced: [
      (c) => `Entendi — pelo ${primaryEchoToken(c) || "não gostei"}, você fala da minha resposta ou da opção?`,
      (c) => `Compreendo — pelo ${primaryEchoToken(c) || "feedback"}, o incômodo foi na resposta ou na sugestão?`,
    ],
    warm_reserved: [
      (c) => `Entendi — pelo ${primaryEchoToken(c) || "retorno"}, foi da resposta ou da recomendação?`,
    ],
  },
  product: {
    warm_light: [
      (c) => `Tudo bem — pelo ${primaryEchoToken(c) || "não gostei"}, o que pesou mais nele?`,
    ],
    warm_balanced: [
      (c) => `Entendi — pelo ${primaryEchoToken(c) || "não gostei"}, o que mais te incomodou nele?`,
      (c) => `Compreendo — pelo ${primaryEchoToken(c) || "feedback"}, foi preço, câmera, bateria ou outra coisa?`,
    ],
    warm_reserved: [
      (c) => `Entendido — pelo ${primaryEchoToken(c) || "retorno"}, o que pesou mais no produto?`,
    ],
  },
  response: {
    warm_light: [
      (c) => `Justo — pelo ${primaryEchoToken(c) || "feedback"}, ficou fria, longa ou confusa?`,
    ],
    warm_balanced: [
      (c) => `Justo — pelo ${primaryEchoToken(c) || "não gostei"}, o que te incomodou na resposta?`,
      (c) => `Entendi — pelo ${primaryEchoToken(c) || "retorno"}, ficou fria, longa ou pouco direta?`,
    ],
    warm_reserved: [
      (c) => `Compreendo — pelo ${primaryEchoToken(c) || "feedback"}, o que faltou na resposta?`,
    ],
  },
  recommendation: {
    warm_light: [
      (c) => `Tudo bem — pelo ${primaryEchoToken(c) || "não gostei"}, o que não encaixou na sugestão?`,
    ],
    warm_balanced: [
      (c) => `Entendi — pelo ${primaryEchoToken(c) || "não gostei"}, o que não encaixou na recomendação?`,
      (c) => `Compreendo — pelo ${primaryEchoToken(c) || "feedback"}, prefere outro perfil ou outra faixa?`,
    ],
    warm_reserved: [
      (c) => `Entendido — pelo ${primaryEchoToken(c) || "retorno"}, o que não funcionou na sugestão?`,
    ],
  },
});

function pickDisapprovalTemplate(contract = {}, extra = "") {
  const kind = disapprovalTargetKind(contract);
  const key = warmthKey(contract.personalityPolicy || {});
  const pool = WARM_DISAPPROVAL[kind]?.[key] || WARM_DISAPPROVAL.unknown.warm_balanced;
  const fn = pickHumanizedVariant(pool, seedFromContract(contract, extra));
  return typeof fn === "function" ? fn(contract) : String(fn || "");
}

export function buildWarmDisapprovalReply(contract = {}) {
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;
  if (depth === RESPONSE_DEPTH.MINIMAL) {
    return pickDisapprovalTemplate(contract, "disapproval-min").split("?")[0].trim() + ".";
  }
  return pickDisapprovalTemplate(contract, "disapproval");
}

const WARM_CORRECTION = Object.freeze({
  warm_light: [
    (c) => `Entendi — qual parte ficou errada para eu revisar?`,
    (c) => `Beleza — me diz o ponto que falhou para eu corrigir.`,
  ],
  warm_balanced: [
    (c) => `Entendi — qual parte ficou errada para eu revisar direito?`,
    (c) => `Compreendo — me aponta o ponto exato que não bateu.`,
    (c) => `Certo — qual dado ou trecho precisa de correção?`,
  ],
  warm_reserved: [
    (c) => `Entendido — qual parte devo revisar?`,
    (c) => `Pode indicar o ponto exato que ficou incorreto?`,
  ],
});

const WARM_DISAGREEMENT = Object.freeze({
  warm_light: [
    (c) => `Justo — me conta o que não encaixou no argumento.`,
    (c) => `Entendi — onde você discorda da conclusão?`,
  ],
  warm_balanced: [
    (c) => `Justo — me explica o ponto em que você discorda.`,
    (c) => `Entendi — qual parte do raciocínio não te convenceu?`,
  ],
  warm_reserved: [
    (c) => `Compreendo — qual ponto da conclusão você contesta?`,
  ],
});

function pickCorrectionTemplate(contract = {}, extra = "") {
  const key = warmthKey(contract.personalityPolicy || {});
  const pool = WARM_CORRECTION[key] || WARM_CORRECTION.warm_balanced;
  const fn = pickHumanizedVariant(pool, seedFromContract(contract, extra));
  return typeof fn === "function" ? fn(contract) : String(fn || "");
}

function pickDisagreementTemplate(contract = {}, extra = "") {
  const key = warmthKey(contract.personalityPolicy || {});
  const pool = WARM_DISAGREEMENT[key] || WARM_DISAGREEMENT.warm_balanced;
  const fn = pickHumanizedVariant(pool, seedFromContract(contract, extra));
  return typeof fn === "function" ? fn(contract) : String(fn || "");
}

export function buildWarmCorrectionReply(contract = {}) {
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;
  if (depth === RESPONSE_DEPTH.MINIMAL) {
    return pickCorrectionTemplate(contract, "correction-min").split("?")[0].trim() + ".";
  }
  return pickCorrectionTemplate(contract, "correction");
}

export function buildWarmDisagreementReply(contract = {}) {
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;
  if (depth === RESPONSE_DEPTH.MINIMAL) {
    return pickDisagreementTemplate(contract, "disagreement-min").split("?")[0].trim() + ".";
  }
  return pickDisagreementTemplate(contract, "disagreement");
}

export function buildWarmContextualApprovalReply(contract = {}) {
  const token = primaryEchoToken(contract);
  if (token && shouldBlockContextualPositiveEcho(contract, token)) {
    return buildPersonalityGovernedEmotionalReply(contract);
  }
  if (token) {
    const warm = warmthKey(contract.personalityPolicy || {});
    const variants =
      warm === "warm_light"
        ? [`Boa — ${token}!`, `Show — ${token}!`]
        : warm === "warm_reserved"
          ? [`Certo — ${token}.`, `Entendido — ${token}.`]
          : [`Boa — ${token}.`, `Show — ${token}.`];
    return pickHumanizedVariant(variants, seedFromContract(contract, "contextual-approval"));
  }
  return pickWarm(WARM_APPROVAL, contract, "approval");
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
  const base = `${mirror}! ${continuity}`;
  if (contract.personalityGovernanceVersion) {
    return buildPersonalityGovernedGreetingReply(contract, () => base);
  }
  return base;
}

export function buildWarmSocialClarificationReply(contract = {}) {
  if (contract.personalityGovernanceVersion) {
    return buildPersonalityGovernedClarificationReply(contract);
  }
  return pickWarm(resolveClarificationPool(contract), contract, "clarification");
}

export function buildWarmReactionReply(contract = {}) {
  if (contract.socialHumanizationBehavior) {
    const humanized = buildHumanizationGovernedReply(contract);
    if (humanized) return humanized;
  }
  return pickWarm(WARM_REACTION, contract, "reaction");
}

export function buildWarmApprovalReply(contract = {}) {
  if (contract.mustReferenceUserContent || (contract.contentAnchors || []).length) {
    return buildWarmContextualApprovalReply(contract);
  }
  return pickWarm(WARM_APPROVAL, contract, "approval");
}

export function buildWarmStaySocialReply(contract = {}) {
  if (contract.socialHumanizationBehavior) {
    const humanized = buildHumanizationGovernedReply(contract);
    if (humanized) return humanized;
  }
  if (contract.personalityGovernanceVersion) {
    return buildPersonalityGovernedStaySocialReply(contract);
  }
  return pickWarm(WARM_STAY_SOCIAL, contract, "stay_social");
}

export function buildWarmEmotionalReply(contract = {}) {
  if (contract.socialHumanizationBehavior) {
    const humanized = buildHumanizationGovernedReply(contract);
    if (humanized) return humanized;
  }
  if (contract.personalityGovernanceVersion) {
    return buildPersonalityGovernedEmotionalReply(contract);
  }
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;
  if (depth === RESPONSE_DEPTH.MINIMAL) {
    return pickWarm({ warm_light: ["Puxado."], warm_balanced: ["Compreendo."], warm_reserved: ["Entendo."] }, contract, "emotional-min");
  }
  return pickWarm(WARM_EMOTIONAL, contract, "emotional");
}

export function buildWarmGratitudeReply(contract = {}) {
  if (contract.socialHumanizationBehavior) {
    const humanized = buildHumanizationGovernedReply(contract);
    if (humanized) return humanized;
  }
  return pickWarm(WARM_GRATITUDE, contract, "gratitude");
}

export function buildWarmComplimentReply(contract = {}) {
  if (contract.socialHumanizationBehavior) {
    const humanized = buildHumanizationGovernedReply(contract);
    if (humanized) return humanized;
  }
  return pickWarm(WARM_COMPLIMENT, contract, "compliment");
}

/**
 * Primary entry — maps governed contract dimensions to surface text.
 */
export function buildContractDrivenSocialFallback(contract = {}, family = "", options = {}) {
  const behavior = contract.expectedHumanBehavior || "";
  const failureReason = options.failureReason || "";

  if (contract.socialContinuityBehavior) {
    const continuityText = buildContinuityGovernedReply(contract);
    if (continuityText) {
      return {
        text: continuityText,
        builder: "buildContinuityGovernedReply",
        reasonCodes: [
          "contract_driven",
          "social_continuity",
          contract.socialContinuityBehavior,
          failureReason,
        ],
      };
    }
  }

  if (behavior === EXPECTED_HUMAN_BEHAVIORS.RECIPROCATE_WARMTH) {
    return {
      text: buildPersonalityGovernedReciprocalReply(contract),
      builder: "buildPersonalityGovernedReciprocalReply",
      reasonCodes: ["contract_driven", "personality_reciprocal", behavior, failureReason],
    };
  }

  if (contract.socialHumanizationBehavior && !contract.socialHumanizationDeferVerbalization) {
    const humanizationText = buildHumanizationGovernedReply(contract);
    if (humanizationText) {
      return {
        text: humanizationText,
        builder: "buildHumanizationGovernedReply",
        reasonCodes: [
          "contract_driven",
          "social_humanization",
          contract.socialHumanizationBehavior,
          failureReason,
        ],
      };
    }
  }

  if (
    contract.suppressMirrorGreeting &&
    (behavior === EXPECTED_HUMAN_BEHAVIORS.MIRROR_GREETING ||
      contract.primaryIntent === "greeting" ||
      contract.socialFamilies?.greeting)
  ) {
    return {
      text: buildContinuityGovernedReply({
        ...contract,
        socialContinuityBehavior: SOCIAL_CONTINUITY_BEHAVIOR.CONTINUE_GREETING_THREAD,
      }),
      builder: "buildContinueGreetingThreadReply",
      reasonCodes: ["contract_driven", "suppress_mirror_greeting", failureReason],
    };
  }

  if (behavior === EXPECTED_HUMAN_BEHAVIORS.ANSWER_META || behavior === EXPECTED_HUMAN_BEHAVIORS.BUILD_TRUST) {
    return {
      text: buildGovernedIdentityReply(contract),
      builder: "buildGovernedIdentityReply",
      reasonCodes: ["contract_driven", "personality_identity", behavior, failureReason],
    };
  }

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

  if (contract.primarySocialIntent === "soft_disagreement") {
    return {
      text: buildWarmDisagreementReply(contract),
      builder: "buildWarmDisagreementReply",
      reasonCodes: ["contract_driven", "warm_disagreement", behavior, family, failureReason],
    };
  }

  if (
    behavior === EXPECTED_HUMAN_BEHAVIORS.ACKNOWLEDGE_DISAPPROVAL ||
    family === FAMILY.DISAPPROVAL ||
    contract.primarySocialIntent === "disapproval"
  ) {
    return {
      text: buildWarmDisapprovalReply(contract),
      builder: "buildWarmDisapprovalReply",
      reasonCodes: ["contract_driven", "warm_disapproval", behavior, family, failureReason],
    };
  }

  if (behavior === EXPECTED_HUMAN_BEHAVIORS.REPAIR_CONTEXT || contract.primarySocialIntent === "correction") {
    if (contract.factValidation?.state === "pending_validation") {
      return {
        text: buildPendingFactValidationReply(contract),
        builder: "buildPendingFactValidationReply",
        reasonCodes: ["contract_driven", "pending_fact_validation", ...(contract.factValidation?.reasonCodes || [])],
      };
    }
    if (contract.factValidation?.state === "confirmed_claim") {
      return {
        text: buildConfirmedFactValidationReply(contract),
        builder: "buildConfirmedFactValidationReply",
        reasonCodes: ["contract_driven", "confirmed_fact_validation", ...(contract.factValidation?.reasonCodes || [])],
      };
    }
    return {
      text: buildWarmCorrectionReply(contract),
      builder: "buildWarmCorrectionReply",
      reasonCodes: ["contract_driven", "warm_correction", behavior, family, failureReason],
    };
  }

  if (
    behavior === EXPECTED_HUMAN_BEHAVIORS.INVITE_CLARIFICATION ||
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
