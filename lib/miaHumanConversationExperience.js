/**
 * PATCH 11A.4 — Human Conversation Experience Layer
 *
 * Governed experience policies for social/emotional/mixed human turns.
 * MIA owns the intelligence; the LLM only verbalizes.
 */

import {
  MIA_HUMAN_OBJECTIVES,
  MIA_INTERACTION_MODES,
} from "./miaIntentRecognitionLayer.js";
import { COMMERCIAL_PERMISSION } from "./miaIntentAuthority.js";
import { applyToneComplianceGuard } from "./miaToneComplianceGuard.js";
import {
  enrichContractWithSocialPerception,
  validateSocialResponsePerception,
  stripPerceptionViolations,
  buildSpecificGovernedFallback,
  socialPerceptionToTrace,
} from "./miaSocialResponsePerception.js";
import { enrichContractWithMixedVerbalization } from "./miaMixedVerbalization.js";
import { resolveSemanticTarget, semanticTargetToTrace, SEMANTIC_TARGETS } from "./miaSemanticTargetResolution.js";
import {
  enrichContractWithSemanticAuthority,
  isAcceptableGovernedSocialReply,
  isCommercialRedirectText,
  isClarificationSemanticallyInvalidForContract,
  semanticAuthorityToTrace,
} from "./miaSemanticAuthority.js";
import {
  selectGovernedFallback,
  governedFallbackToTrace,
} from "./miaGovernedFallbackPolicy.js";
import {
  createResponseReplacementTrace,
  REPLACEMENT_STAGES,
  responseReplacementTraceToDebug,
} from "./miaResponseReplacementTrace.js";
import { SOCIAL_INTENT_FAMILIES } from "./miaSocialIntentTaxonomy.js";

export const HUMAN_EXPERIENCE_VERSION = "11A.5";

export const RESPONSE_DEPTH = Object.freeze({
  MINIMAL: "minimal",
  BRIEF: "brief",
  STANDARD: "standard",
  SUPPORTIVE: "supportive",
  COMMERCIAL_MIXED: "commercial_mixed",
});

export const FOLLOW_UP_POLICY = Object.freeze({
  NONE: "none",
  OPTIONAL: "optional",
  NATURAL: "natural",
  CLARIFYING_REQUIRED: "clarifying_required",
  COMMERCE_REQUIRED: "commerce_required",
});

export const COMMERCE_REENTRY_POLICY = Object.freeze({
  FORBIDDEN: "forbidden",
  NOT_NEEDED: "not_needed",
  CONTEXTUAL_ONLY: "contextual_only",
  MIXED_CONTINUE: "mixed_continue",
  EXPLICIT_IDENTITY_ONLY: "explicit_identity_only",
});

const COMMERCIAL_MENTION_PATTERN =
  /\b(comprar|compra|compro|comprei|produto|produtos|recomend\w*|indique|indica|buscar|busco|procurar|procuro|oferta|promo\w*|comparar|compare|compara|custo[- ]benef[ií]cio|alguma compra|compras em mente|pensando em comprar|me (?:fala|diz|conta).{0,30}(?:comprar|produto)|posso te ajudar com compras|ajudar com compras|especializada em compras|especialidade.{0,20}produto)\b/i;

const INSTITUTIONAL_IDENTITY_PATTERN =
  /\b(sou uma intelig[eê]ncia|assistente (?:virtual|inteligente) de compras|minha especialidade|minha fun[cç][aã]o.{0,40}compras|lista de capacidades|posso ajudar com compara[cç][oõ]es e recomenda[cç][oõ]es)\b/i;

const ANTI_CONSUMPTION_PATTERN =
  /\b(compr(?:ar|e|a).{0,50}(?:animar|aliviar|melhorar|recompens|tratar|curar|distrair|sentir)|(?:animar|aliviar|melhorar|recompens|sentir).{0,50}compr(?:ar|a|e)|pequeno impulso|shopping therapy|terapia de compras|consumo como|compra por impulso|se presentear|presente(?:ar)? para(?: se)? sentir|comprar algo para)\b/i;

const FORCED_QUESTION_CLOSING_PATTERN =
  /\?\s*$/;

const HUMAN_EXPERIENCE_CLAIM_PATTERN =
  /\b(eu tamb[eé]m|tamb[eé]m estou|tamb[eé]m me sinto|eu sei como [eé]|j[aá] passei por|minha rotina|meu dia tamb[eé]m|eu entendo porque voc[eê])\b/i;

function tokenCount(text = "") {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveResponseDepth(recognition = {}, contract = {}) {
  const mode = recognition.interactionMode || contract.interactionMode;
  const message = recognition.resolvedQuery || contract.resolvedQuery || "";
  const length = tokenCount(message);

  if (mode === MIA_INTERACTION_MODES.MIXED) {
    return RESPONSE_DEPTH.COMMERCIAL_MIXED;
  }

  if (mode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return length <= 6 ? RESPONSE_DEPTH.BRIEF : RESPONSE_DEPTH.SUPPORTIVE;
  }

  if (recognition.primaryIntent === "greeting" || recognition.socialFamilies?.greeting) {
    return RESPONSE_DEPTH.BRIEF;
  }

  if (
    recognition.primaryIntent === "acknowledgement" ||
    recognition.socialFamilies?.postPurchaseAck ||
    recognition.socialFamilies?.reaction
  ) {
    return length <= 3 ? RESPONSE_DEPTH.MINIMAL : RESPONSE_DEPTH.BRIEF;
  }

  if (recognition.socialFamilies?.farewell) {
    return RESPONSE_DEPTH.BRIEF;
  }

  if (length <= 3) return RESPONSE_DEPTH.MINIMAL;
  if (length <= 8) return RESPONSE_DEPTH.BRIEF;
  if (length <= 16) return RESPONSE_DEPTH.STANDARD;
  return RESPONSE_DEPTH.SUPPORTIVE;
}

function resolveFollowUpPolicy(recognition = {}, contract = {}) {
  if (recognition.requiresClarification) {
    return FOLLOW_UP_POLICY.CLARIFYING_REQUIRED;
  }

  if (recognition.interactionMode === MIA_INTERACTION_MODES.MIXED) {
    return FOLLOW_UP_POLICY.COMMERCE_REQUIRED;
  }

  if (
    recognition.primaryIntent === "acknowledgement" ||
    recognition.socialFamilies?.postPurchaseAck ||
    recognition.socialFamilies?.farewell ||
    recognition.socialFamilies?.reaction ||
    recognition.socialFamilies?.acknowledgement
  ) {
    return FOLLOW_UP_POLICY.NONE;
  }

  if (recognition.primaryIntent === "greeting") {
    return FOLLOW_UP_POLICY.OPTIONAL;
  }

  if (recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
    return FOLLOW_UP_POLICY.NATURAL;
  }

  if (recognition.interactionMode === MIA_INTERACTION_MODES.CLARIFICATION) {
    return FOLLOW_UP_POLICY.CLARIFYING_REQUIRED;
  }

  return FOLLOW_UP_POLICY.NATURAL;
}

function resolveCommerceReentryPolicy(recognition = {}, authority = null) {
  const mode = recognition.interactionMode;
  const permission = authority?.commercialPermission;

  if (mode === MIA_INTERACTION_MODES.MIXED) {
    return COMMERCE_REENTRY_POLICY.MIXED_CONTINUE;
  }

  if (mode === MIA_INTERACTION_MODES.IDENTITY || recognition.primaryIntent === "about_mia") {
    return COMMERCE_REENTRY_POLICY.EXPLICIT_IDENTITY_ONLY;
  }

  if (permission === COMMERCIAL_PERMISSION.DENY) {
    if (mode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT) {
      return COMMERCE_REENTRY_POLICY.FORBIDDEN;
    }
    if (
      recognition.humanObjective === MIA_HUMAN_OBJECTIVES.EXPRESS_FEELING ||
      recognition.humanObjective === MIA_HUMAN_OBJECTIVES.RECEIVE_ACKNOWLEDGMENT ||
      recognition.humanObjective === MIA_HUMAN_OBJECTIVES.CLOSE_INTERACTION
    ) {
      return COMMERCE_REENTRY_POLICY.FORBIDDEN;
    }
    if (recognition.socialFamilies?.postPurchaseAck) {
      return COMMERCE_REENTRY_POLICY.FORBIDDEN;
    }
    if (recognition.preserveCommerceContext) {
      return COMMERCE_REENTRY_POLICY.CONTEXTUAL_ONLY;
    }
    return COMMERCE_REENTRY_POLICY.NOT_NEEDED;
  }

  if (recognition.commercialIntent === true) {
    return COMMERCE_REENTRY_POLICY.MIXED_CONTINUE;
  }

  return COMMERCE_REENTRY_POLICY.NOT_NEEDED;
}

function resolveAntiConsumption(recognition = {}, commerceReentryPolicy = "", authority = null, message = "") {
  const emotionalMessage =
    /\b(cansad\w*|desanim\w*|frustr\w*|esgotad\w*|pesad\w*|puxad\w*|difícil|dificil|exaust\w*|estress\w*|desanima|tranquil\w*)\w*/i.test(
      normalizeText(message || recognition.resolvedQuery || "")
    );

  if (commerceReentryPolicy === COMMERCE_REENTRY_POLICY.MIXED_CONTINUE) {
    return false;
  }
  if (commerceReentryPolicy === COMMERCE_REENTRY_POLICY.EXPLICIT_IDENTITY_ONLY) {
    return false;
  }
  return (
    recognition.interactionMode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT ||
    recognition.humanObjective === MIA_HUMAN_OBJECTIVES.EXPRESS_FEELING ||
    (emotionalMessage && authority?.commercialPermission === COMMERCIAL_PERMISSION.DENY) ||
    (recognition.emotionalRelevance >= 0.35 &&
      authority?.commercialPermission === COMMERCIAL_PERMISSION.DENY) ||
    (recognition.interactionMode === MIA_INTERACTION_MODES.SOCIAL &&
      (recognition.emotionalRelevance >= 0.25 || recognition.socialRelevance >= 0.45) &&
      authority?.commercialPermission === COMMERCIAL_PERMISSION.DENY) ||
    commerceReentryPolicy === COMMERCE_REENTRY_POLICY.FORBIDDEN
  );
}

function resolveIdentityVisibility(recognition = {}, commerceReentryPolicy = "") {
  if (commerceReentryPolicy === COMMERCE_REENTRY_POLICY.EXPLICIT_IDENTITY_ONLY) {
    return "explicit_when_relevant";
  }
  if (recognition.interactionMode === MIA_INTERACTION_MODES.IDENTITY) {
    return "explicit_when_relevant";
  }
  return "implicit";
}

function resolveEmotionalIntensity(recognition = {}) {
  const emotional = recognition.emotionalRelevance ?? 0;
  if (emotional >= 0.65) return "moderate";
  if (emotional >= 0.35) return "light";
  return "none";
}

/**
 * Enrich an existing social behavior contract with experience policies.
 */
export function enrichBehaviorContractWithHumanExperience(
  contract = {},
  {
    recognition = null,
    authority = null,
    message = "",
    conversationMessages = [],
    sessionContext = null,
  } = {}
) {
  const rec = recognition || {};
  const responseDepth = resolveResponseDepth(rec, contract);
  const followUpPolicy = resolveFollowUpPolicy(rec, contract);
  const commerceReentryPolicy = resolveCommerceReentryPolicy(rec, authority);
  const antiConsumption = resolveAntiConsumption(rec, commerceReentryPolicy, authority, message);
  const identityVisibility = resolveIdentityVisibility(rec, commerceReentryPolicy);
  const emotionalIntensity = resolveEmotionalIntensity(rec);
  const messageLength = tokenCount(message || rec.resolvedQuery || "");

  const responseBehavior = {
    ...(contract.responseBehavior || {}),
    askFollowUp:
      followUpPolicy === FOLLOW_UP_POLICY.NONE
        ? false
        : followUpPolicy === FOLLOW_UP_POLICY.CLARIFYING_REQUIRED ||
            followUpPolicy === FOLLOW_UP_POLICY.COMMERCE_REQUIRED
          ? true
          : contract.responseBehavior?.askFollowUp ?? false,
    redirectToCommerce:
      commerceReentryPolicy === COMMERCE_REENTRY_POLICY.MIXED_CONTINUE ||
      commerceReentryPolicy === COMMERCE_REENTRY_POLICY.EXPLICIT_IDENTITY_ONLY,
    proportionalLength: true,
    humanFirst:
      rec.interactionMode === MIA_INTERACTION_MODES.MIXED ||
      contract.responseBehavior?.humanFirst ||
      false,
    forbidden: [
      ...new Set([
        ...(contract.responseBehavior?.forbidden || []),
        ...(antiConsumption ? ["emotional_consumption_suggestion", "shopping_therapy"] : []),
        ...(commerceReentryPolicy === COMMERCE_REENTRY_POLICY.FORBIDDEN ||
        commerceReentryPolicy === COMMERCE_REENTRY_POLICY.NOT_NEEDED
          ? ["forced_commerce_redirect", "end_with_shopping_offer", "institutional_pitch"]
          : []),
        ...(identityVisibility === "implicit"
          ? ["explicit_identity_recitation"]
          : []),
        ...(followUpPolicy === FOLLOW_UP_POLICY.NONE
          ? ["artificial_engagement_question"]
          : []),
      ]),
    ],
  };

  if (
    commerceReentryPolicy === COMMERCE_REENTRY_POLICY.FORBIDDEN ||
    commerceReentryPolicy === COMMERCE_REENTRY_POLICY.NOT_NEEDED
  ) {
    responseBehavior.redirectToCommerce = false;
  }

  const experienceContract = {
    ...contract,
    experienceVersion: HUMAN_EXPERIENCE_VERSION,
    resolvedQuery: message || rec.resolvedQuery || contract.resolvedQuery || null,
    responseDepth,
    followUpPolicy,
    commerceReentryPolicy,
    antiConsumption,
    identityVisibility,
    emotionalIntensity,
    messageLength,
    proportionalityProfile:
      responseDepth === RESPONSE_DEPTH.MINIMAL
        ? "short_in_short_out"
        : responseDepth === RESPONSE_DEPTH.SUPPORTIVE
          ? "supportive_proportional"
          : "natural_proportional",
    conversationContinuation:
      followUpPolicy === FOLLOW_UP_POLICY.NONE ? "complete" : "open_if_natural",
    responseBehavior,
  };

  const targetResolution = resolveSemanticTarget({
    message: message || rec.resolvedQuery || "",
    recognition: rec,
    conversationMessages,
    sessionContext: sessionContext || authority?.sessionContext || {},
  });

  let enriched = enrichContractWithSemanticAuthority(experienceContract, {
    recognition: rec,
    targetResolution,
    conversationMessages,
    sessionContext: sessionContext || authority?.sessionContext || {},
  });

  enriched = enrichContractWithSocialPerception(enriched, {
    recognition: rec,
    message: message || rec.resolvedQuery || "",
    conversationMessages,
  });

  if (rec.interactionMode === MIA_INTERACTION_MODES.MIXED) {
    enriched = enrichContractWithMixedVerbalization(enriched, {
      recognition: rec,
      message: message || rec.resolvedQuery || "",
    });
  }

  enriched.semanticTargetTrace = semanticTargetToTrace(targetResolution);

  return enriched;
}

export function experienceContractToVerbalizationInstructions(contract = {}) {
  const rb = contract.responseBehavior || {};
  const lines = [
    "Experiência conversacional governada (obrigatório):",
    `- Profundidade: ${contract.responseDepth || RESPONSE_DEPTH.BRIEF}`,
    `- Política de continuidade/pergunta: ${contract.followUpPolicy || FOLLOW_UP_POLICY.NATURAL}`,
    `- Reentrada comercial: ${contract.commerceReentryPolicy || COMMERCE_REENTRY_POLICY.NOT_NEEDED}`,
    `- Identidade: ${contract.identityVisibility === "implicit" ? "implícita — não recitar especialidade" : "explícita somente se relevante"}`,
    `- Anti-consumo emocional: ${contract.antiConsumption ? "ativo — nunca sugerir compra como alívio" : "n/a"}`,
    `- Proporcionalidade: ${contract.proportionalityProfile || "natural_proportional"}`,
    `- Continuidade: ${contract.conversationContinuation || "open_if_natural"}`,
  ];

  if (contract.followUpPolicy === FOLLOW_UP_POLICY.NONE) {
    lines.push("- Não encerre com pergunta; resposta completa e natural.");
  }

  if (contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.FORBIDDEN) {
    lines.push("- Proibido mencionar compras, produtos, comparações ou ofertas neste turno.");
  }

  if (contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.CONTEXTUAL_ONLY) {
    lines.push("- Preserve contexto comercial internamente; não mencione compras neste turno.");
  }

  if (contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.MIXED_CONTINUE) {
    lines.push("- Ordem: acolhimento humano breve → transição natural → atendimento comercial.");
  }

  if (rb.humanFirst) {
    lines.push("- Intenção mista: reconheça a dimensão humana em 1 frase curta antes do comercial.");
  }

  if (contract.antiConsumption) {
    lines.push("- Não associe consumo, impulso ou compra a alívio emocional.");
  }

  return lines.join("\n");
}

export function validateHumanConversationResponse(
  reply = "",
  contract = {},
  { strict = false } = {}
) {
  const text = String(reply || "").trim();
  const violations = [];
  const normalized = normalizeText(text);

  if (!text) {
    violations.push("empty_reply");
  }

  const commerceForbidden =
    contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.FORBIDDEN ||
    contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.NOT_NEEDED ||
    contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.CONTEXTUAL_ONLY;

  if (commerceForbidden && COMMERCIAL_MENTION_PATTERN.test(normalized)) {
    violations.push("commercial_mention_unauthorized");
  }

  if (contract.commercialFallbackBlocked && isCommercialRedirectText(text)) {
    violations.push("commercial_redirect_in_social_mode");
  }

  if (
    contract.resolvedSemanticTarget === SEMANTIC_TARGETS.PRODUCT &&
    /\b(obrigad\w*|valeu pelo elogio|fico feliz|que gentil)\b/i.test(normalized)
  ) {
    violations.push("mia_thanks_on_product_target");
  }

  if (
    contract.resolvedSemanticTarget === SEMANTIC_TARGETS.MIA &&
    /\b(produto|aparelho|visual dele|visual dela|tem um visual)\b/i.test(normalized) &&
    !/\b(obrigad\w*|que gentil)\b/i.test(normalized)
  ) {
    violations.push("product_entity_on_mia_target");
  }

  if (
    isClarificationSemanticallyInvalidForContract(
      text,
      contract,
      contract.semanticTargetResolution
    )
  ) {
    violations.push("clarification_on_governed_social_contract");
  }

  if (
    contract.resolvedSemanticTarget === SEMANTIC_TARGETS.MIA &&
    [SOCIAL_INTENT_FAMILIES.COMPLIMENT, SOCIAL_INTENT_FAMILIES.PRAISE, SOCIAL_INTENT_FAMILIES.REACTION].includes(
      contract.primarySocialIntent
    ) &&
    /\bme diz rapidinho a que voc[eê] se refere\b/i.test(normalized)
  ) {
    violations.push("clarification_on_mia_compliment");
  }

  if (/^pois e[.!]?$|^pois é[.!]?$/i.test(normalized.trim())) {
    violations.push("legacy_generic_ack");
  }

  if (
    contract.resolvedSemanticTarget === SEMANTIC_TARGETS.UNKNOWN &&
    /\b(obrigad\w*|valeu pelo elogio|fico feliz)\b/i.test(normalized) &&
    !/\b(de\s+nada|por\s+nada|imagina)\b/i.test(normalized)
  ) {
    violations.push("mia_thanks_on_unknown_target");
  }

  if (
    contract.commercialFallbackBlocked &&
    /\b(ajuda bastante a direcionar|ficou mais claro o que voc[eê] procura|consigo ser mais precisa)\b/i.test(
      normalized
    )
  ) {
    violations.push("legacy_commercial_ack_in_social_mode");
  }

  if (contract.antiConsumption && ANTI_CONSUMPTION_PATTERN.test(normalized)) {
    violations.push("anti_consumption_violation");
  }

  if (contract.followUpPolicy === FOLLOW_UP_POLICY.NONE) {
    if (FORCED_QUESTION_CLOSING_PATTERN.test(text)) {
      violations.push("forced_follow_up_question");
    }
    if (
      /\b(se precisar|se quiser|se tiver|é só falar|é só avisar|mais alguma coisa)\b/i.test(
        normalized
      )
    ) {
      violations.push("forced_continuation");
    }
  }

  if (
    contract.identityVisibility === "implicit" &&
    !contract.identityMode &&
    INSTITUTIONAL_IDENTITY_PATTERN.test(normalized)
  ) {
    violations.push("explicit_identity_recitation");
  }

  if (HUMAN_EXPERIENCE_CLAIM_PATTERN.test(normalized)) {
    violations.push("invented_human_experience");
  }

  const replyTokens = tokenCount(text);
  const depth = contract.responseDepth || RESPONSE_DEPTH.BRIEF;
  const maxByDepth = {
    [RESPONSE_DEPTH.MINIMAL]: 28,
    [RESPONSE_DEPTH.BRIEF]: 55,
    [RESPONSE_DEPTH.STANDARD]: 90,
    [RESPONSE_DEPTH.SUPPORTIVE]: 120,
    [RESPONSE_DEPTH.COMMERCIAL_MIXED]: 140,
  };
  if (replyTokens > (maxByDepth[depth] || 90)) {
    violations.push("disproportionate_length");
  }

  if (
    contract.interactionMode === MIA_INTERACTION_MODES.MIXED &&
    contract.responseBehavior?.humanFirst &&
    contract.humanObjective &&
    !contract.commercialObjective
  ) {
    violations.push("mixed_missing_commercial_dimension");
  }

  if (contract.perceptionVersion) {
    const perception = validateSocialResponsePerception(text, contract);
    if (!perception.valid) {
      violations.push(...perception.violations);
    }
  }

  const valid = violations.length === 0;
  return {
    valid,
    violations,
    strictValid: valid,
    perception: contract.perceptionVersion
      ? validateSocialResponsePerception(text, contract)
      : null,
  };
}

function stripUnauthorizedCommercialMentions(text = "", contract = {}) {
  let out = String(text || "");
  const commerceForbidden =
    contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.FORBIDDEN ||
    contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.NOT_NEEDED ||
    contract.commerceReentryPolicy === COMMERCE_REENTRY_POLICY.CONTEXTUAL_ONLY;

  if (!commerceForbidden) return out;

  out = out
    .replace(/\n?\s*(?:Se quiser|Quando quiser|Se precisar)[^.?\n]{0,80}(?:comprar|produto|compras|recomend\w*)[^.?\n]*[.?!]?/gi, "")
    .replace(/\n?\s*(?:Alguma compra|Tem algo|pensando em comprar)[^.?\n]{0,60}[.?!]?/gi, "")
    .replace(/\n?\s*(?:Posso te ajudar com compras|Posso ajudar com compras|ajuda com alguma compra|dicas de compras)[^.?\n]*[.?!]?/gi, "")
    .replace(/\n?\s*(?:Estou aqui para ajudar)[^.?\n]*[.?!]?/gi, "")
    .trim();

  if (contract.followUpPolicy === FOLLOW_UP_POLICY.NONE && out.endsWith("?")) {
    out = out.replace(/\s*[^.!?\n]+\?\s*$/, "").trim();
  }

  if (contract.followUpPolicy === FOLLOW_UP_POLICY.NONE) {
    out = out
      .replace(/\n?\s*(?:Se precisar|Se quiser|Se tiver)[^.?\n]{0,80}[.?!]?/gi, "")
      .replace(/\n?\s*(?:É só falar|É só avisar|Fico feliz em ajudar)[^.?\n]{0,80}[.?!]?/gi, "")
      .trim();
  }

  return out;
}

export function buildGovernedSocialFallbackReply(contract = {}, options = {}) {
  const selection = selectGovernedFallback(contract, {
    failureReason: options.failureReason || "direct_fallback_request",
    period: options.period || "",
  });
  return selection.text;
}

export function finalizeHumanConversationReply(
  reply = "",
  contract = {},
  toneProfile = null,
  { period = "" } = {}
) {
  const rawLlmResponse = String(reply || "").trim();
  let text = stripUnauthorizedCommercialMentions(rawLlmResponse, contract);
  text = stripPerceptionViolations(text, contract);
  let validation = validateHumanConversationResponse(text, contract);
  let usedFallback = false;
  let fallbackSelection = null;
  let replacementStage = REPLACEMENT_STAGES.NONE;
  let replacementReason = null;
  let preservedLlmResponse = false;

  const targetResolution = contract.semanticTargetResolution || null;

  if (
    !validation.valid &&
    isAcceptableGovernedSocialReply(rawLlmResponse, contract, targetResolution)
  ) {
    text = rawLlmResponse;
    validation = validateHumanConversationResponse(text, {
      ...contract,
      skipMustReferenceUserContent: true,
    });
    preservedLlmResponse = validation.valid;
  }

  if (!validation.valid) {
    fallbackSelection = selectGovernedFallback(contract, {
      failureReason: validation.violations?.join(",") || "validation_failed",
      period,
    });
    text = fallbackSelection.text;
    text = stripPerceptionViolations(text, contract);
    usedFallback = true;
    replacementStage = REPLACEMENT_STAGES.GOVERNED_FALLBACK;
    replacementReason = validation.violations?.join(",") || "validation_failed";
    validation = validateHumanConversationResponse(text, contract);
  }

  const toneInput = {
    response: text,
    toneProfile,
    socialResponse: true,
    interactionMode: contract.interactionMode,
    responseDepth: contract.responseDepth,
    commerceReentryPolicy: contract.commerceReentryPolicy,
    preserveSpecialistPresentation: false,
    shortReactionMode: contract.shortReactionMode,
    identityMode: contract.identityMode,
    farewellMode: contract.farewellMode,
    skipLaughterStripping: contract.shortReactionMode === true,
  };

  const preToneText = text;
  const toneResult = toneProfile?.toneProfile
    ? applyToneComplianceGuard(toneInput)
    : { response: text, violations: [], corrected: false };

  text = toneResult.response;
  validation = validateHumanConversationResponse(text, contract);

  if (!validation.valid) {
    fallbackSelection = selectGovernedFallback(contract, {
      failureReason: validation.violations?.join(",") || "post_tone_validation_failed",
      period,
    });
    text = fallbackSelection.text;
    text = stripPerceptionViolations(text, contract);
    usedFallback = true;
    replacementStage = REPLACEMENT_STAGES.TONE_GUARD;
    replacementReason = validation.violations?.join(",") || "post_tone_validation_failed";
    validation = validateHumanConversationResponse(text, contract);
  } else if (toneResult.corrected && preToneText !== text) {
    const linguistic = validateHumanConversationResponse(preToneText, contract);
    if (linguistic.valid) {
      text = preToneText;
      validation = linguistic;
    }
  }

  const replacementTrace = createResponseReplacementTrace({
    rawLlmResponse,
    finalResponse: text,
    responseWasReplaced: usedFallback || (rawLlmResponse !== text && !preservedLlmResponse),
    replacementStage: usedFallback ? replacementStage : REPLACEMENT_STAGES.NONE,
    replacementReason,
    selectedFallbackFamily: fallbackSelection?.family || null,
    selectedFallbackFunction: fallbackSelection?.functionName || null,
    governedIntent: contract.governedSocialRoutingKey || contract.primarySocialIntent || null,
    resolvedTarget: contract.resolvedSemanticTarget || null,
    interactionMode: contract.interactionMode || null,
    commercialRelevance: contract.commercialIntent ? 1 : 0,
    primarySocialIntent: contract.primarySocialIntent || null,
    expectedHumanBehavior: contract.expectedHumanBehavior || null,
    conversationObjective: contract.conversationObjective || null,
    validatorResults: validation,
    legacyPathUsed: false,
    legacyPathBlocked: contract.commercialFallbackBlocked ?? false,
    reasonCodes: fallbackSelection?.reasonCodes || [],
    governedSocialRoutingKey: contract.governedSocialRoutingKey || null,
    preservedLlmResponse,
  });

  return {
    response: text,
    validation,
    usedFallback,
    toneGuard: toneResult,
    perception: socialPerceptionToTrace(contract, validation?.perception || null),
    replacementTrace,
    semanticAuthority: semanticAuthorityToTrace(contract),
    governedFallback: governedFallbackToTrace(fallbackSelection),
    replacementTraceDebug: responseReplacementTraceToDebug(replacementTrace),
  };
}

export function humanExperienceToTrace(contract = null, validation = null) {
  if (!contract) return null;
  return {
    version: contract.experienceVersion || HUMAN_EXPERIENCE_VERSION,
    interactionMode: contract.interactionMode,
    humanObjective: contract.humanObjective,
    responseDepth: contract.responseDepth,
    followUpPolicy: contract.followUpPolicy,
    commerceReentryPolicy: contract.commerceReentryPolicy,
    antiConsumption: contract.antiConsumption,
    identityVisibility: contract.identityVisibility,
    emotionalIntensity: contract.emotionalIntensity,
    validation: validation || null,
    perception: socialPerceptionToTrace(contract, validation?.perception || null),
  };
}

export {
  COMMERCIAL_MENTION_PATTERN,
  ANTI_CONSUMPTION_PATTERN,
  INSTITUTIONAL_IDENTITY_PATTERN,
};
