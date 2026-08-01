/**
 * PATCH 5.4 — Semantic Precedence Policy
 *
 * Central, deterministic precedence between social families, commercial intent,
 * semantic targets, mixed intent and ambiguous social.
 * MIA owns the intelligence; adapters and fallbacks consume this decision.
 */

import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";
import { SOCIAL_INTENT_FAMILIES, EXPECTED_HUMAN_BEHAVIORS } from "./miaSocialIntentTaxonomy.js";
import {
  SEMANTIC_TARGETS,
  hasSufficientSocialTargetContext,
} from "./miaSemanticTargetResolution.js";

/** Mirror of ROUTING_KEYS — kept local to avoid circular imports. */
const ROUTING_KEYS = Object.freeze({
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
  AMBIGUOUS_SOCIAL: "ambiguous_social",
  GREETING: "greeting_social",
  FAREWELL: "farewell_social",
  ACKNOWLEDGEMENT: "acknowledgement_social",
});

export const SEMANTIC_PRECEDENCE_VERSION = "5.4.0";

export const MIN_GOVERNED_TARGET_CONFIDENCE = 0.55;

/** Reason codes emitted by precedence decisions — each maps to a real branch. */
export const PRECEDENCE_REASON_CODES = Object.freeze({
  SPECIFIC_SOCIAL_FAMILY_PRECEDES_AMBIGUOUS: "specific_social_family_precedes_ambiguous",
  GREETING_DOES_NOT_REQUIRE_EXPLICIT_TARGET: "greeting_does_not_require_explicit_target",
  FAREWELL_DOES_NOT_REQUIRE_EXPLICIT_TARGET: "farewell_does_not_require_explicit_target",
  GRATITUDE_DOES_NOT_REQUIRE_EXPLICIT_TARGET: "gratitude_does_not_require_explicit_target",
  ACKNOWLEDGEMENT_DOES_NOT_REQUIRE_EXPLICIT_TARGET: "acknowledgement_does_not_require_explicit_target",
  EXPLICIT_COMMERCE_PRECEDES_SOCIAL_DEFAULT: "explicit_commerce_precedes_social_default",
  MIXED_INTENT_PRESERVES_BOTH_COMPONENTS: "mixed_intent_preserves_both_components",
  RESOLVED_TARGET_PRECEDES_UNKNOWN_TARGET: "resolved_target_precedes_unknown_target",
  APPROVAL_WITHOUT_TARGET_IS_RESPONSE_APPROVAL: "approval_without_target_is_response_approval",
  REACTION_ACKNOWLEDGEMENT_PRECEDES_AMBIGUOUS: "reaction_acknowledgement_precedes_ambiguous",
  IRONY_REPAIR_PRECEDES_COMMERCE: "irony_repair_precedes_commerce",
  CONVERSATION_REQUEST_PRECEDES_COMMERCE: "conversation_request_precedes_commerce",
  TARGET_UNKNOWN_DOES_NOT_INVALIDATE_GREETING: "target_unknown_does_not_invalidate_greeting",
  AMBIGUOUS_SOCIAL_ALLOWED_ONLY_WITHOUT_SPECIFIC_FAMILY: "ambiguous_social_allowed_only_without_specific_family",
  CLARIFICATION_REQUIRES_REAL_INFORMATION_GAP: "clarification_requires_real_information_gap",
  CURRENT_TURN_PRECEDES_STALE_CONTEXT: "current_turn_precedes_stale_context",
  LEGACY_ADAPTER_CANNOT_OVERRIDE_GOVERNED_FAMILY: "legacy_adapter_cannot_override_governed_family",
  CONFIDENCE_ALONE_DOES_NOT_INVALIDATE_INTENT: "confidence_alone_does_not_invalidate_intent",
});

const AMBIGUOUS_TARGET_REASON_CODES = new Set([
  "insufficient_context_for_target",
  "unresolved_target",
  "short_aesthetic_ambiguous",
  "pronoun_aesthetic_without_context",
  "taxonomy_mia_overridden",
]);

/** Social families valid without an explicit semantic target on the current turn. */
export const SOCIAL_FAMILIES_NOT_REQUIRING_TARGET = new Set([
  SOCIAL_INTENT_FAMILIES.GREETING,
  SOCIAL_INTENT_FAMILIES.FAREWELL,
  SOCIAL_INTENT_FAMILIES.GRATITUDE,
  SOCIAL_INTENT_FAMILIES.ACKNOWLEDGEMENT,
  SOCIAL_INTENT_FAMILIES.POST_PURCHASE_ACK,
  SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST,
  SOCIAL_INTENT_FAMILIES.SMALL_TALK,
  SOCIAL_INTENT_FAMILIES.IRONY,
  SOCIAL_INTENT_FAMILIES.SARCASM,
  SOCIAL_INTENT_FAMILIES.HUMOR,
  SOCIAL_INTENT_FAMILIES.JOKE,
  SOCIAL_INTENT_FAMILIES.CORRECTION,
  SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR,
  SOCIAL_INTENT_FAMILIES.CONVERSATION_RECOVERY,
  SOCIAL_INTENT_FAMILIES.EMOTIONAL_SUPPORT,
  SOCIAL_INTENT_FAMILIES.IDENTITY_QUESTION,
  SOCIAL_INTENT_FAMILIES.CAPABILITY_QUESTION,
  SOCIAL_INTENT_FAMILIES.TRUST_QUESTION,
  SOCIAL_INTENT_FAMILIES.META_QUESTION,
  SOCIAL_INTENT_FAMILIES.SOFT_DISAGREEMENT,
  SOCIAL_INTENT_FAMILIES.HARD_DISAGREEMENT,
  SOCIAL_INTENT_FAMILIES.COMPREHENSION,
  SOCIAL_INTENT_FAMILIES.COMPREHENSION_SUCCESS,
  SOCIAL_INTENT_FAMILIES.CONFUSION,
  SOCIAL_INTENT_FAMILIES.FRUSTRATION,
  SOCIAL_INTENT_FAMILIES.CURIOSITY,
  SOCIAL_INTENT_FAMILIES.PASSIVE_BROWSING,
]);

/** Families that need a resolved target to act with specificity. */
export const SOCIAL_FAMILIES_REQUIRING_TARGET = new Set([
  SOCIAL_INTENT_FAMILIES.COMPLIMENT,
  SOCIAL_INTENT_FAMILIES.PRAISE,
  SOCIAL_INTENT_FAMILIES.AFFECTION,
  SOCIAL_INTENT_FAMILIES.APPROVAL,
  SOCIAL_INTENT_FAMILIES.DISAPPROVAL,
  SOCIAL_INTENT_FAMILIES.FLIRT,
  SOCIAL_INTENT_FAMILIES.REACTION,
  SOCIAL_INTENT_FAMILIES.SOCIAL_VALIDATION,
]);

const SOCIAL_EVALUATIVE_INTENT_FAMILIES = new Set([
  SOCIAL_INTENT_FAMILIES.COMPLIMENT,
  SOCIAL_INTENT_FAMILIES.PRAISE,
  SOCIAL_INTENT_FAMILIES.REACTION,
  SOCIAL_INTENT_FAMILIES.APPROVAL,
  SOCIAL_INTENT_FAMILIES.ACKNOWLEDGEMENT,
  SOCIAL_INTENT_FAMILIES.SOCIAL_VALIDATION,
]);

const FAMILY_TARGET_NOT_REQUIRED_REASON = Object.freeze({
  [SOCIAL_INTENT_FAMILIES.GREETING]: PRECEDENCE_REASON_CODES.GREETING_DOES_NOT_REQUIRE_EXPLICIT_TARGET,
  [SOCIAL_INTENT_FAMILIES.FAREWELL]: PRECEDENCE_REASON_CODES.FAREWELL_DOES_NOT_REQUIRE_EXPLICIT_TARGET,
  [SOCIAL_INTENT_FAMILIES.GRATITUDE]: PRECEDENCE_REASON_CODES.GRATITUDE_DOES_NOT_REQUIRE_EXPLICIT_TARGET,
  [SOCIAL_INTENT_FAMILIES.ACKNOWLEDGEMENT]:
    PRECEDENCE_REASON_CODES.ACKNOWLEDGEMENT_DOES_NOT_REQUIRE_EXPLICIT_TARGET,
});

const FAMILY_ROUTING_KEY = Object.freeze({
  [SOCIAL_INTENT_FAMILIES.GREETING]: ROUTING_KEYS.GREETING,
  [SOCIAL_INTENT_FAMILIES.FAREWELL]: ROUTING_KEYS.FAREWELL,
  [SOCIAL_INTENT_FAMILIES.GRATITUDE]: ROUTING_KEYS.MIA_GRATITUDE,
  [SOCIAL_INTENT_FAMILIES.ACKNOWLEDGEMENT]: ROUTING_KEYS.ACKNOWLEDGEMENT,
  [SOCIAL_INTENT_FAMILIES.POST_PURCHASE_ACK]: ROUTING_KEYS.ACKNOWLEDGEMENT,
  [SOCIAL_INTENT_FAMILIES.APPROVAL]: ROUTING_KEYS.RESPONSE_APPROVAL,
  [SOCIAL_INTENT_FAMILIES.IRONY]: ROUTING_KEYS.IRONY_REPAIR,
  [SOCIAL_INTENT_FAMILIES.SARCASM]: ROUTING_KEYS.IRONY_REPAIR,
  [SOCIAL_INTENT_FAMILIES.CORRECTION]: ROUTING_KEYS.IRONY_REPAIR,
  [SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR]: ROUTING_KEYS.IRONY_REPAIR,
  [SOCIAL_INTENT_FAMILIES.HUMOR]: ROUTING_KEYS.HUMOR_PLAY,
  [SOCIAL_INTENT_FAMILIES.JOKE]: ROUTING_KEYS.HUMOR_PLAY,
  [SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST]: ROUTING_KEYS.CONVERSATION_SOCIAL,
  [SOCIAL_INTENT_FAMILIES.SMALL_TALK]: ROUTING_KEYS.CONVERSATION_SOCIAL,
});

function isNonCommercialMode(contract = {}) {
  const mode = contract.interactionMode;
  return (
    mode === MIA_INTERACTION_MODES.SOCIAL ||
    mode === MIA_INTERACTION_MODES.EMOTIONAL_SUPPORT ||
    mode === MIA_INTERACTION_MODES.CLARIFICATION ||
    mode === MIA_INTERACTION_MODES.MIXED
  );
}

export function isSocialEvaluativeIntent(contract = {}) {
  const primary = contract.primarySocialIntent || "";
  if (SOCIAL_EVALUATIVE_INTENT_FAMILIES.has(primary)) return true;
  const signals = contract.socialIntentSignals || [];
  if (
    signals.some((s) =>
      ["compliment", "praise", "reaction", "approval", "validation"].includes(s)
    )
  ) {
    return true;
  }
  const families = contract.socialFamilies || {};
  if (families.compliment || families.socialValidation || families.reaction) {
    return true;
  }
  if (
    contract.primaryIntent === "social_validation" &&
    !familyDoesNotRequireExplicitTarget(primary)
  ) {
    return true;
  }
  return false;
}

export function familyDoesNotRequireExplicitTarget(primaryFamily = "") {
  return SOCIAL_FAMILIES_NOT_REQUIRING_TARGET.has(primaryFamily);
}

export function familyRequiresExplicitTarget(primaryFamily = "") {
  return SOCIAL_FAMILIES_REQUIRING_TARGET.has(primaryFamily);
}

export function hasSpecificSocialFamilyWithoutTarget(contract = {}) {
  const primary = contract.primarySocialIntent || "";
  return familyDoesNotRequireExplicitTarget(primary);
}

function resolveTargetContext(contract = {}, targetResolution = {}) {
  const target =
    targetResolution?.target || contract.resolvedSemanticTarget || SEMANTIC_TARGETS.UNKNOWN;
  const confidence =
    targetResolution?.confidence ?? contract.semanticTargetConfidence ?? null;
  const reasonCodes =
    targetResolution?.reasonCodes || contract.semanticTargetReasonCodes || [];
  const productCtx =
    targetResolution?.productContext ||
    contract.semanticTargetResolution?.productContext ||
    {};
  const conversationMessages =
    contract.conversationMessagesForTarget || contract.conversationMessages || [];
  return { target, confidence, reasonCodes, productCtx, conversationMessages };
}

function hasResolvedHighConfidenceTarget(target, confidence) {
  return (
    [SEMANTIC_TARGETS.MIA, SEMANTIC_TARGETS.PRODUCT, SEMANTIC_TARGETS.PREVIOUS_ANSWER].includes(
      target
    ) &&
    confidence != null &&
    confidence >= MIN_GOVERNED_TARGET_CONFIDENCE
  );
}

function buildPrecedenceDecision(partial = {}) {
  return {
    version: SEMANTIC_PRECEDENCE_VERSION,
    winningFamily: partial.winningFamily ?? null,
    winningTarget: partial.winningTarget ?? SEMANTIC_TARGETS.UNKNOWN,
    winningRoutingKey: partial.winningRoutingKey ?? null,
    secondaryIntent: partial.secondaryIntent ?? null,
    mixedIntent: partial.mixedIntent ?? false,
    precedenceRank: partial.precedenceRank ?? null,
    confidence: partial.confidence ?? null,
    evidenceUsed: partial.evidenceUsed || [],
    blockedCandidates: partial.blockedCandidates || [],
    reasonCodes: partial.reasonCodes || [],
    clarificationRequired: partial.clarificationRequired ?? false,
    ambiguousAllowed: partial.ambiguousAllowed ?? false,
    commercialPermission: partial.commercialPermission ?? null,
  };
}

/**
 * True only when ambiguous_social is genuinely warranted — never for families
 * that do not require an explicit target, nor when a high-confidence target exists.
 */
export function shouldUseWarmImplicitSocialReference(contract = {}, targetResolution = {}) {
  if (!isNonCommercialMode(contract)) return false;

  const { target, conversationMessages } = resolveTargetContext(contract, targetResolution);
  if (target !== SEMANTIC_TARGETS.UNKNOWN) return false;

  const hasPriorTurns =
    Array.isArray(conversationMessages) && conversationMessages.filter((m) => m?.role).length >= 2;
  const behavior = contract.expectedHumanBehavior || "";
  const primary = contract.primarySocialIntent || "";
  const depth = contract.responseDepth || "brief";
  const isBriefDepth = depth === "minimal" || depth === "brief";

  const repairBehaviors = new Set([
    EXPECTED_HUMAN_BEHAVIORS.INVITE_CLARIFICATION,
    EXPECTED_HUMAN_BEHAVIORS.REPAIR_CONTEXT,
  ]);

  const implicitFamilies = new Set([
    SOCIAL_INTENT_FAMILIES.USER_UNCERTAINTY,
    SOCIAL_INTENT_FAMILIES.CORRECTION,
    SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR,
    SOCIAL_INTENT_FAMILIES.CONVERSATION_RECOVERY,
    SOCIAL_INTENT_FAMILIES.REACTION,
    SOCIAL_INTENT_FAMILIES.DISAPPROVAL,
  ]);

  return (
    hasPriorTurns &&
    isBriefDepth &&
    (repairBehaviors.has(behavior) ||
      implicitFamilies.has(primary) ||
      contract.followUpPolicy === "clarifying_required" ||
      contract.requiresClarification === true)
  );
}

export function shouldAllowAmbiguousSocial(contract = {}, targetResolution = {}) {
  if (contract.interactionMode === MIA_INTERACTION_MODES.COMMERCE) {
    return false;
  }
  if (contract.commercialIntent && contract.interactionMode !== MIA_INTERACTION_MODES.SOCIAL) {
    return false;
  }
  if (!isNonCommercialMode(contract)) {
    return false;
  }

  if (shouldUseWarmImplicitSocialReference(contract, targetResolution)) {
    return true;
  }

  const primary = contract.primarySocialIntent || "";
  const { target, confidence, reasonCodes, productCtx, conversationMessages } =
    resolveTargetContext(contract, targetResolution);

  if (hasSpecificSocialFamilyWithoutTarget(contract)) {
    return false;
  }

  if (primary === SOCIAL_INTENT_FAMILIES.APPROVAL) {
    return false;
  }

  if (hasResolvedHighConfidenceTarget(target, confidence)) {
    return false;
  }

  if (target === SEMANTIC_TARGETS.CONVERSATION) {
    return false;
  }

  if (
    target === SEMANTIC_TARGETS.MIA &&
    confidence != null &&
    confidence >= MIN_GOVERNED_TARGET_CONFIDENCE &&
    hasSufficientSocialTargetContext(conversationMessages, productCtx)
  ) {
    return false;
  }

  if (
    target === SEMANTIC_TARGETS.PRODUCT &&
    confidence != null &&
    confidence >= MIN_GOVERNED_TARGET_CONFIDENCE
  ) {
    return false;
  }

  if (
    target === SEMANTIC_TARGETS.PREVIOUS_ANSWER &&
    confidence != null &&
    confidence >= MIN_GOVERNED_TARGET_CONFIDENCE
  ) {
    return false;
  }

  if (!isSocialEvaluativeIntent(contract)) {
    return false;
  }

  const hasAmbiguousReason = reasonCodes.some((code) => AMBIGUOUS_TARGET_REASON_CODES.has(code));

  if (target === SEMANTIC_TARGETS.UNKNOWN && hasAmbiguousReason) {
    return true;
  }

  if (
    target === SEMANTIC_TARGETS.UNKNOWN &&
    !hasSufficientSocialTargetContext(conversationMessages, productCtx)
  ) {
    return true;
  }

  if (
    confidence != null &&
    confidence < MIN_GOVERNED_TARGET_CONFIDENCE &&
    !hasSufficientSocialTargetContext(conversationMessages, productCtx)
  ) {
    return true;
  }

  return false;
}

/**
 * Resolve routing key from precedence — specific families always beat ambiguous.
 */
export function resolvePrecedenceRoutingKey(contract = {}, targetResolution = {}) {
  const decision = applySemanticPrecedence(contract, targetResolution);
  if (decision.winningRoutingKey) {
    return decision.winningRoutingKey;
  }
  if (decision.ambiguousAllowed) {
    return ROUTING_KEYS.AMBIGUOUS_SOCIAL;
  }
  return ROUTING_KEYS.CONVERSATION_SOCIAL;
}

/**
 * Central precedence decision — deterministic, explainable, consumed by Semantic Authority.
 */
export function applySemanticPrecedence(contract = {}, targetResolution = {}) {
  const primary = contract.primarySocialIntent || "";
  const secondary = contract.secondarySocialIntent || null;
  const signals = contract.socialIntentSignals || [];
  const blockedCandidates = [];
  const { target, confidence, reasonCodes, productCtx, conversationMessages } =
    resolveTargetContext(contract, targetResolution);

  // 1. Explicit commercial on commerce mode
  if (
    contract.commercialIntent &&
    contract.interactionMode === MIA_INTERACTION_MODES.COMMERCE
  ) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.COMMERCIAL,
      precedenceRank: 1,
      confidence,
      evidenceUsed: ["commercial_intent", "commerce_mode"],
      reasonCodes: [PRECEDENCE_REASON_CODES.EXPLICIT_COMMERCE_PRECEDES_SOCIAL_DEFAULT],
      ambiguousAllowed: false,
    });
  }

  // 2. Mixed intent — preserve both components
  if (
    contract.interactionMode === MIA_INTERACTION_MODES.MIXED ||
    contract.mixedIntent ||
    (secondary && contract.commercialIntent)
  ) {
    blockedCandidates.push({
      candidate: ROUTING_KEYS.AMBIGUOUS_SOCIAL,
      reason: PRECEDENCE_REASON_CODES.MIXED_INTENT_PRESERVES_BOTH_COMPONENTS,
    });
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.CONVERSATION_SOCIAL,
      secondaryIntent: secondary,
      mixedIntent: true,
      precedenceRank: 2,
      confidence,
      evidenceUsed: ["mixed_intent", "secondary_intent"],
      blockedCandidates,
      reasonCodes: [PRECEDENCE_REASON_CODES.MIXED_INTENT_PRESERVES_BOTH_COMPONENTS],
      ambiguousAllowed: false,
    });
  }

  // 3. Specific social family that does not require explicit target
  if (hasSpecificSocialFamilyWithoutTarget(contract)) {
    blockedCandidates.push({
      candidate: ROUTING_KEYS.AMBIGUOUS_SOCIAL,
      reason: PRECEDENCE_REASON_CODES.SPECIFIC_SOCIAL_FAMILY_PRECEDES_AMBIGUOUS,
    });
    const familyReason =
      FAMILY_TARGET_NOT_REQUIRED_REASON[primary] ||
      PRECEDENCE_REASON_CODES.SPECIFIC_SOCIAL_FAMILY_PRECEDES_AMBIGUOUS;
    const extraReason =
      primary === SOCIAL_INTENT_FAMILIES.GREETING
        ? PRECEDENCE_REASON_CODES.TARGET_UNKNOWN_DOES_NOT_INVALIDATE_GREETING
        : null;
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: FAMILY_ROUTING_KEY[primary] || ROUTING_KEYS.CONVERSATION_SOCIAL,
      precedenceRank: 3,
      confidence,
      evidenceUsed: ["primary_social_intent", "target_not_required_family"],
      blockedCandidates,
      reasonCodes: extraReason ? [familyReason, extraReason] : [familyReason],
      ambiguousAllowed: false,
    });
  }

  // 4. Approval / reaction acts without needing product/MIA target
  if (primary === SOCIAL_INTENT_FAMILIES.APPROVAL) {
    blockedCandidates.push({
      candidate: ROUTING_KEYS.AMBIGUOUS_SOCIAL,
      reason: PRECEDENCE_REASON_CODES.APPROVAL_WITHOUT_TARGET_IS_RESPONSE_APPROVAL,
    });
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.RESPONSE_APPROVAL,
      precedenceRank: 4,
      confidence,
      evidenceUsed: ["approval_intent"],
      blockedCandidates,
      reasonCodes: [
        PRECEDENCE_REASON_CODES.APPROVAL_WITHOUT_TARGET_IS_RESPONSE_APPROVAL,
        PRECEDENCE_REASON_CODES.REACTION_ACKNOWLEDGEMENT_PRECEDES_AMBIGUOUS,
      ],
      ambiguousAllowed: false,
    });
  }

  // 5. High-confidence resolved target with evaluative / directed intent
  if (
    signals.some((s) =>
      ["mia_target", "compliment_to_mia", "praise_to_mia", "flirt_to_mia"].includes(s)
    ) &&
    [SOCIAL_INTENT_FAMILIES.COMPLIMENT, SOCIAL_INTENT_FAMILIES.PRAISE].includes(primary) &&
    target === SEMANTIC_TARGETS.MIA &&
    (confidence == null || confidence >= MIN_GOVERNED_TARGET_CONFIDENCE)
  ) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey:
        primary === SOCIAL_INTENT_FAMILIES.PRAISE
          ? ROUTING_KEYS.MIA_PRAISE
          : ROUTING_KEYS.MIA_COMPLIMENT,
      precedenceRank: 5,
      confidence,
      evidenceUsed: ["mia_target_signal", "compliment_or_praise"],
      reasonCodes: [PRECEDENCE_REASON_CODES.RESOLVED_TARGET_PRECEDES_UNKNOWN_TARGET],
      ambiguousAllowed: false,
    });
  }

  if (target === SEMANTIC_TARGETS.PRODUCT && contract.commercialIntent) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.COMMERCIAL,
      precedenceRank: 5,
      confidence,
      evidenceUsed: ["product_target", "commercial_intent"],
      reasonCodes: [PRECEDENCE_REASON_CODES.EXPLICIT_COMMERCE_PRECEDES_SOCIAL_DEFAULT],
      ambiguousAllowed: false,
    });
  }

  if (target === SEMANTIC_TARGETS.PRODUCT) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.PRODUCT_AESTHETIC_OPINION,
      precedenceRank: 5,
      confidence,
      evidenceUsed: ["product_target"],
      reasonCodes: [PRECEDENCE_REASON_CODES.RESOLVED_TARGET_PRECEDES_UNKNOWN_TARGET],
      ambiguousAllowed: false,
    });
  }

  if (target === SEMANTIC_TARGETS.PREVIOUS_ANSWER) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.RESPONSE_APPROVAL,
      precedenceRank: 5,
      confidence,
      evidenceUsed: ["previous_answer_target"],
      reasonCodes: [PRECEDENCE_REASON_CODES.RESOLVED_TARGET_PRECEDES_UNKNOWN_TARGET],
      ambiguousAllowed: false,
    });
  }

  if (primary === SOCIAL_INTENT_FAMILIES.COMPLIMENT && target === SEMANTIC_TARGETS.MIA) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.MIA_COMPLIMENT,
      precedenceRank: 5,
      confidence,
      evidenceUsed: ["compliment", "mia_target"],
      reasonCodes: [PRECEDENCE_REASON_CODES.RESOLVED_TARGET_PRECEDES_UNKNOWN_TARGET],
      ambiguousAllowed: false,
    });
  }

  if (primary === SOCIAL_INTENT_FAMILIES.PRAISE && target === SEMANTIC_TARGETS.MIA) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.MIA_PRAISE,
      precedenceRank: 5,
      confidence,
      evidenceUsed: ["praise", "mia_target"],
      reasonCodes: [PRECEDENCE_REASON_CODES.RESOLVED_TARGET_PRECEDES_UNKNOWN_TARGET],
      ambiguousAllowed: false,
    });
  }

  if (primary === SOCIAL_INTENT_FAMILIES.GRATITUDE) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.MIA_GRATITUDE,
      precedenceRank: 5,
      confidence,
      evidenceUsed: ["gratitude_intent"],
      reasonCodes: [PRECEDENCE_REASON_CODES.GRATITUDE_DOES_NOT_REQUIRE_EXPLICIT_TARGET],
      ambiguousAllowed: false,
    });
  }

  if (
    [
      SOCIAL_INTENT_FAMILIES.IRONY,
      SOCIAL_INTENT_FAMILIES.SARCASM,
      SOCIAL_INTENT_FAMILIES.CORRECTION,
      SOCIAL_INTENT_FAMILIES.CONTEXT_REPAIR,
    ].includes(primary)
  ) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.IRONY_REPAIR,
      precedenceRank: 5,
      confidence,
      evidenceUsed: ["irony_repair_family"],
      reasonCodes: [PRECEDENCE_REASON_CODES.IRONY_REPAIR_PRECEDES_COMMERCE],
      ambiguousAllowed: false,
    });
  }

  if ([SOCIAL_INTENT_FAMILIES.HUMOR, SOCIAL_INTENT_FAMILIES.JOKE].includes(primary)) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.HUMOR_PLAY,
      precedenceRank: 5,
      confidence,
      evidenceUsed: ["humor_family"],
      reasonCodes: [PRECEDENCE_REASON_CODES.SPECIFIC_SOCIAL_FAMILY_PRECEDES_AMBIGUOUS],
      ambiguousAllowed: false,
    });
  }

  if (
    [SOCIAL_INTENT_FAMILIES.CONVERSATION_REQUEST, SOCIAL_INTENT_FAMILIES.SMALL_TALK].includes(
      primary
    ) ||
    target === SEMANTIC_TARGETS.CONVERSATION
  ) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.CONVERSATION_SOCIAL,
      precedenceRank: 5,
      confidence,
      evidenceUsed: ["conversation_request_or_target"],
      reasonCodes: [PRECEDENCE_REASON_CODES.CONVERSATION_REQUEST_PRECEDES_COMMERCE],
      ambiguousAllowed: false,
    });
  }

  // 6. Ambiguous social — only when evaluative and target truly unknown
  if (shouldAllowAmbiguousSocial(contract, targetResolution)) {
    return buildPrecedenceDecision({
      winningFamily: primary,
      winningTarget: target,
      winningRoutingKey: ROUTING_KEYS.AMBIGUOUS_SOCIAL,
      precedenceRank: 8,
      confidence,
      evidenceUsed: ["evaluative_intent", "unknown_target", ...reasonCodes],
      reasonCodes: [PRECEDENCE_REASON_CODES.AMBIGUOUS_SOCIAL_ALLOWED_ONLY_WITHOUT_SPECIFIC_FAMILY],
      ambiguousAllowed: true,
    });
  }

  // 7. Residual — preserve taxonomy family without forcing ambiguous
  return buildPrecedenceDecision({
    winningFamily: primary,
    winningTarget: target,
    winningRoutingKey: FAMILY_ROUTING_KEY[primary] || ROUTING_KEYS.CONVERSATION_SOCIAL,
    precedenceRank: 9,
    confidence,
    evidenceUsed: ["residual_taxonomy_family"],
    reasonCodes: [PRECEDENCE_REASON_CODES.CONFIDENCE_ALONE_DOES_NOT_INVALIDATE_INTENT],
    ambiguousAllowed: false,
  });
}

export function semanticPrecedenceToTrace(decision = null) {
  if (!decision?.version) return null;
  return {
    version: decision.version,
    winningFamily: decision.winningFamily,
    winningTarget: decision.winningTarget,
    winningRoutingKey: decision.winningRoutingKey,
    secondaryIntent: decision.secondaryIntent,
    mixedIntent: decision.mixedIntent,
    precedenceRank: decision.precedenceRank,
    reasonCodes: decision.reasonCodes,
    blockedCandidates: decision.blockedCandidates,
    ambiguousAllowed: decision.ambiguousAllowed,
    clarificationRequired: decision.clarificationRequired,
  };
}
