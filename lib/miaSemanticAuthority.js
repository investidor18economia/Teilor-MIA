/**
 * PATCH 4.1I.3 — Semantic Authority & Precedence
 *
 * Central precedence between governed contracts, taxonomy, targets and legacy heuristics.
 * MIA owns the intelligence; legacy paths may assist but never override governed decisions.
 */

import { COMMERCE_REENTRY_POLICY } from "./miaHumanConversationExperience.js";
import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";
import {
  SOCIAL_INTENT_FAMILIES,
  mapSocialIntentToLegacyPrimary,
} from "./miaSocialIntentTaxonomy.js";
import { SEMANTIC_TARGETS } from "./miaSemanticTargetResolution.js";

export const SEMANTIC_AUTHORITY_VERSION = "4.1I.3";

/** Governed routing keys — disambiguate legacy collisions (e.g. social_validation). */
export const GOVERNED_SOCIAL_ROUTING_KEYS = Object.freeze({
  MIA_COMPLIMENT: "mia_compliment",
  MIA_PRAISE: "mia_praise",
  MIA_GRATITUDE: "mia_gratitude",
  RESPONSE_APPROVAL: "response_approval",
  PRODUCT_AESTHETIC_OPINION: "product_aesthetic_opinion",
  PRODUCT_OPINION: "product_opinion",
  CONVERSATION_SOCIAL: "conversation_social",
  IRONY_REPAIR: "irony_repair",
  HUMOR_PLAY: "humor_play",
  COMMERCIAL: "commercial",
});

const PURE_SOCIAL_FAMILIES = new Set([
  SOCIAL_INTENT_FAMILIES.COMPLIMENT,
  SOCIAL_INTENT_FAMILIES.PRAISE,
  SOCIAL_INTENT_FAMILIES.GRATITUDE,
  SOCIAL_INTENT_FAMILIES.AFFECTION,
  SOCIAL_INTENT_FAMILIES.IRONY,
  SOCIAL_INTENT_FAMILIES.SARCASM,
  SOCIAL_INTENT_FAMILIES.HUMOR,
  SOCIAL_INTENT_FAMILIES.JOKE,
  SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST,
  SOCIAL_INTENT_FAMILIES.SMALL_TALK,
  SOCIAL_INTENT_FAMILIES.EMOTIONAL_SUPPORT,
  SOCIAL_INTENT_FAMILIES.CORRECTION,
  SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR,
  SOCIAL_INTENT_FAMILIES.CONVERSATION_RECOVERY,
  SOCIAL_INTENT_FAMILIES.REACTION,
  SOCIAL_INTENT_FAMILIES.ACKNOWLEDGEMENT,
]);

const COMMERCIAL_REDIRECT_PATTERN =
  /\b(celular|notebook|produto|marca|faixa|orçamento|comparar|analisar|recomend\w*|buscar|buscando|compr\w*)\b/i;

const LEGACY_COMMERCIAL_ACK_PATTERN =
  /\b(ajuda bastante a direcionar|ficou mais claro o que voc[eê] procura|consigo ser mais precisa|me conta o que voc[eê] est[aá] buscando)\b/i;

const LEGACY_ENTITY_OPINION_PATTERN =
  /\b(o visual dele|design dele|design bem marcante|foi o visual que mais)\b/i;

const NEUTRAL_CLARIFICATION_PATTERN =
  /\b(me diz rapidinho a que voc[eê] se refere|me explica um pouco melhor o que voc[eê] quer analisar|voc[eê] fala disso ou de outra coisa)\b/i;

const GOVERNED_CLARIFICATION_BLOCKING_KEYS = new Set([
  GOVERNED_SOCIAL_ROUTING_KEYS.MIA_COMPLIMENT,
  GOVERNED_SOCIAL_ROUTING_KEYS.MIA_PRAISE,
  GOVERNED_SOCIAL_ROUTING_KEYS.MIA_GRATITUDE,
  GOVERNED_SOCIAL_ROUTING_KEYS.RESPONSE_APPROVAL,
  GOVERNED_SOCIAL_ROUTING_KEYS.PRODUCT_AESTHETIC_OPINION,
  GOVERNED_SOCIAL_ROUTING_KEYS.PRODUCT_OPINION,
  GOVERNED_SOCIAL_ROUTING_KEYS.IRONY_REPAIR,
  GOVERNED_SOCIAL_ROUTING_KEYS.HUMOR_PLAY,
  GOVERNED_SOCIAL_ROUTING_KEYS.CONVERSATION_SOCIAL,
]);

const MIN_GOVERNED_TARGET_CONFIDENCE = 0.55;

function isNonCommercialMode(contract = {}) {
  const mode = contract.interactionMode;
  return (
    mode === MIA_INTERACTION_MODES.SOCIAL ||
    mode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT ||
    mode === MIA_INTERACTION_MODES.CLARIFICATION
  );
}

function isCommerceReentryBlocked(contract = {}) {
  const policy = contract.commerceReentryPolicy;
  return (
    policy === COMMERCE_REENTRY_POLICY.FORBIDDEN ||
    policy === COMMERCE_REENTRY_POLICY.NOT_NEEDED ||
    policy === COMMERCE_REENTRY_POLICY.CONTEXTUAL_ONLY
  );
}

/**
 * Resolve governed routing key preserving taxonomy specificity over legacy collapse.
 */
export function resolveGovernedSocialRoutingKey(contract = {}, targetResolution = {}) {
  const primary = contract.primarySocialIntent || "";
  const target = targetResolution?.target || contract.resolvedSemanticTarget || SEMANTIC_TARGETS.UNKNOWN;

  if (target === SEMANTIC_TARGETS.PRODUCT && contract.commercialIntent) {
    return GOVERNED_SOCIAL_ROUTING_KEYS.COMMERCIAL;
  }

  if (target === SEMANTIC_TARGETS.PRODUCT) {
    return GOVERNED_SOCIAL_ROUTING_KEYS.PRODUCT_AESTHETIC_OPINION;
  }

  if (target === SEMANTIC_TARGETS.PREVIOUS_ANSWER || primary === SOCIAL_INTENT_FAMILIES.APPROVAL) {
    return GOVERNED_SOCIAL_ROUTING_KEYS.RESPONSE_APPROVAL;
  }

  if (primary === SOCIAL_INTENT_FAMILIES.COMPLIMENT && target === SEMANTIC_TARGETS.MIA) {
    return GOVERNED_SOCIAL_ROUTING_KEYS.MIA_COMPLIMENT;
  }

  if (primary === SOCIAL_INTENT_FAMILIES.PRAISE && target === SEMANTIC_TARGETS.MIA) {
    return GOVERNED_SOCIAL_ROUTING_KEYS.MIA_PRAISE;
  }

  if (primary === SOCIAL_INTENT_FAMILIES.GRATITUDE) {
    return GOVERNED_SOCIAL_ROUTING_KEYS.MIA_GRATITUDE;
  }

  if (
    [SOCIAL_INTENT_FAMILIES.IRONY, SOCIAL_INTENT_FAMILIES.SARCASM, SOCIAL_INTENT_FAMILIES.CORRECTION, SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR].includes(
      primary
    )
  ) {
    return GOVERNED_SOCIAL_ROUTING_KEYS.IRONY_REPAIR;
  }

  if ([SOCIAL_INTENT_FAMILIES.HUMOR, SOCIAL_INTENT_FAMILIES.JOKE].includes(primary)) {
    return GOVERNED_SOCIAL_ROUTING_KEYS.HUMOR_PLAY;
  }

  if (
    [SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST, SOCIAL_INTENT_FAMILIES.SMALL_TALK].includes(primary) ||
    target === SEMANTIC_TARGETS.CONVERSATION
  ) {
    return GOVERNED_SOCIAL_ROUTING_KEYS.CONVERSATION_SOCIAL;
  }

  if (contract.commercialIntent && contract.interactionMode === MIA_INTERACTION_MODES.COMMERCE) {
    return GOVERNED_SOCIAL_ROUTING_KEYS.COMMERCIAL;
  }

  return mapSocialIntentToLegacyPrimary(primary) || GOVERNED_SOCIAL_ROUTING_KEYS.CONVERSATION_SOCIAL;
}

/**
 * Legacy adapter — unidirectional; never reduces specificity before verbalization/fallback.
 */
export function adaptLegacyPrimaryIntent(contract = {}, targetResolution = {}) {
  const governedKey = resolveGovernedSocialRoutingKey(contract, targetResolution);
  const legacyMap = {
    [GOVERNED_SOCIAL_ROUTING_KEYS.MIA_COMPLIMENT]: "social_validation",
    [GOVERNED_SOCIAL_ROUTING_KEYS.MIA_PRAISE]: "social_validation",
    [GOVERNED_SOCIAL_ROUTING_KEYS.MIA_GRATITUDE]: "acknowledgement",
    [GOVERNED_SOCIAL_ROUTING_KEYS.RESPONSE_APPROVAL]: "social_validation",
    [GOVERNED_SOCIAL_ROUTING_KEYS.PRODUCT_AESTHETIC_OPINION]: "social_validation",
    [GOVERNED_SOCIAL_ROUTING_KEYS.PRODUCT_OPINION]: "social_validation",
    [GOVERNED_SOCIAL_ROUTING_KEYS.CONVERSATION_SOCIAL]: "social_conversation",
    [GOVERNED_SOCIAL_ROUTING_KEYS.IRONY_REPAIR]: "social_conversation",
    [GOVERNED_SOCIAL_ROUTING_KEYS.HUMOR_PLAY]: "social_conversation",
    [GOVERNED_SOCIAL_ROUTING_KEYS.COMMERCIAL]: contract.primaryIntent || "commerce",
  };

  return {
    governedSocialRoutingKey: governedKey,
    legacyPrimaryIntent: legacyMap[governedKey] || mapSocialIntentToLegacyPrimary(contract.primarySocialIntent),
  };
}

export function isCommercialFallbackBlocked(contract = {}) {
  const message = String(
    contract.userMessageForSpecificity || contract.resolvedQuery || ""
  ).toLowerCase();

  if (
    contract.primarySocialIntent === SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST &&
    !/\b(compr\w*|celular|notebook|produto|recomend\w*|preco|preço|orçamento)\b/.test(message)
  ) {
    return true;
  }

  if (contract.commercialIntent && contract.interactionMode === MIA_INTERACTION_MODES.COMMERCE) {
    return false;
  }
  if (contract.interactionMode === MIA_INTERACTION_MODES.MIXED) {
    return false;
  }
  if (isNonCommercialMode(contract) && !contract.commercialIntent) {
    return true;
  }
  if (isNonCommercialMode(contract) && isCommerceReentryBlocked(contract)) {
    return true;
  }
  if (PURE_SOCIAL_FAMILIES.has(contract.primarySocialIntent)) {
    return true;
  }
  if (contract.responseBehavior?.redirectToCommerce === false) {
    return true;
  }
  return false;
}

export function isEntityOpinionFallbackAllowed(contract = {}, targetResolution = {}) {
  const target = targetResolution?.target || contract.resolvedSemanticTarget;
  if (target === SEMANTIC_TARGETS.MIA) return false;
  if (target === SEMANTIC_TARGETS.CONVERSATION) return false;
  if (target === SEMANTIC_TARGETS.PREVIOUS_ANSWER) return false;
  if (target === SEMANTIC_TARGETS.UNKNOWN) return false;
  if (isCommercialFallbackBlocked(contract) && target !== SEMANTIC_TARGETS.PRODUCT) {
    return false;
  }
  return target === SEMANTIC_TARGETS.PRODUCT || target === SEMANTIC_TARGETS.BRAND;
}

export function shouldSkipMustReferenceUserContent(contract = {}, targetResolution = {}) {
  const primary = contract.primarySocialIntent || "";
  const target = targetResolution?.target || contract.resolvedSemanticTarget;

  if (
    [SOCIAL_INTENT_FAMILIES.COMPLIMENT, SOCIAL_INTENT_FAMILIES.PRAISE, SOCIAL_INTENT_FAMILIES.GRATITUDE, SOCIAL_INTENT_FAMILIES.ACKNOWLEDGEMENT, SOCIAL_INTENT_FAMILIES.REACTION].includes(
      primary
    )
  ) {
    return true;
  }

  if (
    [SOCIAL_INTENT_FAMILIES.IRONY, SOCIAL_INTENT_FAMILIES.SARCASM, SOCIAL_INTENT_FAMILIES.HUMOR, SOCIAL_INTENT_FAMILIES.JOKE, SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST, SOCIAL_INTENT_FAMILIES.SMALL_TALK].includes(
      primary
    )
  ) {
    return true;
  }

  if (target === SEMANTIC_TARGETS.MIA || target === SEMANTIC_TARGETS.CONVERSATION) {
    return true;
  }

  if (contract.responseDepth === "minimal" || contract.shortReactionMode) {
    return true;
  }

  return false;
}

export function isLegacyCommercialAckText(text = "") {
  return LEGACY_COMMERCIAL_ACK_PATTERN.test(String(text || "").toLowerCase());
}

export function isLegacyEntityOpinionText(text = "") {
  return LEGACY_ENTITY_OPINION_PATTERN.test(String(text || "").toLowerCase());
}

export function isCommercialRedirectText(text = "") {
  const normalized = String(text || "").toLowerCase();
  return (
    LEGACY_COMMERCIAL_ACK_PATTERN.test(normalized) ||
    /\bme conta o que voc[eê] est[aá] buscando\b/i.test(normalized) ||
    /\bcelular,\s*notebook\s+ou\s+outro\s+produto\b/i.test(normalized) ||
    /\bem qual faixa ou produto\b/i.test(normalized)
  );
}

export function isNeutralClarificationText(text = "") {
  return NEUTRAL_CLARIFICATION_PATTERN.test(String(text || "").toLowerCase());
}

/**
 * True when a governed social contract already resolved target + act — neutral clarification is invalid.
 */
export function isGovernedSocialContractBlocksClarification(contract = {}, targetResolution = {}) {
  if (!contract || contract.interactionMode === MIA_INTERACTION_MODES.COMMERCE) {
    return false;
  }

  const target = targetResolution?.target || contract.resolvedSemanticTarget || SEMANTIC_TARGETS.UNKNOWN;
  const confidence =
    targetResolution?.confidence ?? contract.semanticTargetConfidence ?? null;
  const routingKey =
    contract.governedSocialRoutingKey ||
    resolveGovernedSocialRoutingKey(contract, targetResolution);

  if (target === SEMANTIC_TARGETS.UNKNOWN) {
    return false;
  }

  if (confidence != null && confidence < MIN_GOVERNED_TARGET_CONFIDENCE) {
    return false;
  }

  if (GOVERNED_CLARIFICATION_BLOCKING_KEYS.has(routingKey)) {
    return true;
  }

  if (
    target === SEMANTIC_TARGETS.MIA &&
    [SOCIAL_INTENT_FAMILIES.COMPLIMENT, SOCIAL_INTENT_FAMILIES.PRAISE, SOCIAL_INTENT_FAMILIES.REACTION].includes(
      contract.primarySocialIntent
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Validator helper — clarification replies are semantically incompatible with resolved governed contracts.
 */
export function isClarificationSemanticallyInvalidForContract(text = "", contract = {}, targetResolution = {}) {
  if (!isNeutralClarificationText(text)) {
    return false;
  }
  return isGovernedSocialContractBlocksClarification(contract, targetResolution);
}

/**
 * Returns true when an LLM social reply should be preserved despite strict perception checks.
 */
export function isAcceptableGovernedSocialReply(text = "", contract = {}, targetResolution = {}) {
  const reply = String(text || "").trim();
  if (!reply) return false;

  if (isCommercialFallbackBlocked(contract)) {
    if (isCommercialRedirectText(reply)) return false;
    if (isLegacyEntityOpinionText(reply) && targetResolution?.target === SEMANTIC_TARGETS.MIA) {
      return false;
    }
  }

  const primary = contract.primarySocialIntent || "";
  const tokens = reply.split(/\s+/).filter(Boolean).length;

  if (
    [SOCIAL_INTENT_FAMILIES.COMPLIMENT, SOCIAL_INTENT_FAMILIES.PRAISE, SOCIAL_INTENT_FAMILIES.GRATITUDE].includes(
      primary
    ) &&
    /\b(obrigad\w*|valeu|imagina|fico feliz|que bom|por nada)\b/i.test(reply)
  ) {
    return true;
  }

  if (
    [SOCIAL_INTENT_FAMILIES.IRONY, SOCIAL_INTENT_FAMILIES.SARCASM, SOCIAL_INTENT_FAMILIES.HUMOR, SOCIAL_INTENT_FAMILIES.CORRECTION].includes(
      primary
    ) &&
    tokens <= 30 &&
    !COMMERCIAL_REDIRECT_PATTERN.test(reply)
  ) {
    return true;
  }

  if (
    primary === SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST &&
    tokens <= 45 &&
    !isCommercialRedirectText(reply)
  ) {
    return true;
  }

  return false;
}

export function enrichContractWithSemanticAuthority(
  contract = {},
  { recognition = null, targetResolution = null, conversationMessages = [], sessionContext = {} } = {}
) {
  const resolution =
    targetResolution ||
    contract.semanticTargetResolution ||
    null;

  const legacyAdapter = adaptLegacyPrimaryIntent(
    { ...contract, ...(recognition || {}) },
    resolution
  );

  return {
    ...contract,
    semanticAuthorityVersion: SEMANTIC_AUTHORITY_VERSION,
    resolvedSemanticTarget: resolution?.target || contract.resolvedSemanticTarget || SEMANTIC_TARGETS.UNKNOWN,
    semanticTargetConfidence: resolution?.confidence ?? contract.semanticTargetConfidence ?? null,
    semanticTargetReasonCodes: resolution?.reasonCodes || contract.semanticTargetReasonCodes || [],
    productReference: resolution?.productReference || contract.productReference || null,
    governedSocialRoutingKey: legacyAdapter.governedSocialRoutingKey,
    legacyPrimaryIntentAdapter: legacyAdapter.legacyPrimaryIntent,
    commercialFallbackBlocked: isCommercialFallbackBlocked(contract),
    entityOpinionFallbackAllowed: isEntityOpinionFallbackAllowed(contract, resolution),
    skipMustReferenceUserContent: shouldSkipMustReferenceUserContent(contract, resolution),
    semanticTargetResolution: resolution,
    conversationMessagesForTarget: conversationMessages,
    sessionContextForTarget: sessionContext,
  };
}

export function semanticAuthorityToTrace(contract = null) {
  if (!contract?.semanticAuthorityVersion) return null;
  return {
    version: contract.semanticAuthorityVersion,
    resolvedSemanticTarget: contract.resolvedSemanticTarget,
    semanticTargetConfidence: contract.semanticTargetConfidence,
    semanticTargetReasonCodes: contract.semanticTargetReasonCodes,
    governedSocialRoutingKey: contract.governedSocialRoutingKey,
    commercialFallbackBlocked: contract.commercialFallbackBlocked,
    entityOpinionFallbackAllowed: contract.entityOpinionFallbackAllowed,
    legacyPrimaryIntentAdapter: contract.legacyPrimaryIntentAdapter,
  };
}
