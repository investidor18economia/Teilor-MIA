/**
 * PATCH 5.2 — Universal Conversation Response Contract
 *
 * Envelope arquitetural único que REPRESENTA decisões já tomadas pelos módulos
 * existentes. Não decide, não verbaliza, não envia HTTP.
 */

import { COMMERCIAL_PERMISSION } from "./miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";
import {
  FALLBACK_FAMILIES,
  resolveFallbackFamilyForContract,
} from "./miaGovernedFallbackPolicy.js";
import {
  isCommercialFallbackBlocked,
  isGovernedAmbiguousSocialContract,
  isMiaComplimentGovernedContract,
  isProductAestheticFallbackPermitted,
} from "./miaSemanticAuthority.js";
import { LIFECYCLE_STATES } from "./miaRuntimeEnforcement.js";
import { HUMAN_EXPERIENCE_VERSION } from "./miaHumanConversationExperience.js";

export const UNIVERSAL_CONVERSATION_RESPONSE_CONTRACT_VERSION = "5.2.0";

export const CONTRACT_LIFECYCLE = Object.freeze({
  DECIDED: "decided",
  VERBALIZED: "verbalized",
  VALIDATED: "validated",
  REPAIRED: "repaired",
  AUTHORIZED: "authorized",
  SEALED: "sealed",
  SENT: "sent",
});

export const CONTRACT_AUTHORITY_LAYER = Object.freeze({
  INTENT_RECOGNITION: "intent_recognition",
  SEMANTIC_TARGET: "semantic_target_resolution",
  SEMANTIC_AUTHORITY: "semantic_authority",
  BEHAVIOR_CONTRACT: "social_behavior_contract",
  DECISION_ENGINE: "decision_engine",
  RUNTIME_ENFORCEMENT: "runtime_enforcement",
});

export function resolveFallbackFamilyPolicy(contract = {}, targetResolution = null) {
  const resolution =
    targetResolution ||
    contract.semanticTargetResolution ||
    (contract.resolvedSemanticTarget
      ? {
          target: contract.resolvedSemanticTarget,
          confidence: contract.semanticTargetConfidence,
          reasonCodes: contract.semanticTargetReasonCodes || [],
        }
      : {});

  const primaryFamily = resolveFallbackFamilyForContract(contract, resolution);
  const permitted = primaryFamily ? [primaryFamily] : [];
  const forbidden = [];

  if (isGovernedAmbiguousSocialContract(contract, resolution)) {
    forbidden.push(
      FALLBACK_FAMILIES.COMPLIMENT,
      FALLBACK_FAMILIES.PRAISE,
      FALLBACK_FAMILIES.PRODUCT_AESTHETIC,
      FALLBACK_FAMILIES.COMMERCIAL
    );
  }

  if (isMiaComplimentGovernedContract(contract, resolution)) {
    forbidden.push(FALLBACK_FAMILIES.PRODUCT_AESTHETIC);
  }

  if (!isProductAestheticFallbackPermitted(contract, resolution)) {
    forbidden.push(FALLBACK_FAMILIES.PRODUCT_AESTHETIC);
  }

  if (isCommercialFallbackBlocked(contract)) {
    forbidden.push(FALLBACK_FAMILIES.COMMERCIAL);
  }

  const uniquePermitted = [...new Set(permitted.filter(Boolean))];
  const uniqueForbidden = [...new Set(forbidden.filter(Boolean))].filter(
    (f) => !uniquePermitted.includes(f)
  );

  return {
    primaryFamily,
    permittedFamilies: uniquePermitted,
    forbiddenFamilies: uniqueForbidden,
  };
}

function pickAuthoritySnapshot(input = {}) {
  const recognition = input.recognition || input.intentRecognition || null;
  const authority = input.intentAuthority || null;
  const routingDecision = input.routingDecision || null;

  return {
    intentRecognitionVersion: recognition?.version || null,
    intentAuthorityVersion: authority?.version || null,
    authoritative: authority?.authoritative ?? null,
    commercialPermission:
      authority?.commercialPermission ||
      recognition?.commercialPermission ||
      (recognition?.commercialIntent ? COMMERCIAL_PERMISSION.ALLOW : COMMERCIAL_PERMISSION.DENY),
    routingMode: routingDecision?.mode || null,
    routingAct: routingDecision?.conversationAct || null,
    layers: [
      recognition ? CONTRACT_AUTHORITY_LAYER.INTENT_RECOGNITION : null,
      contractHasSemanticTarget(input.behaviorContract)
        ? CONTRACT_AUTHORITY_LAYER.SEMANTIC_TARGET
        : null,
      input.behaviorContract?.governedSocialRoutingKey
        ? CONTRACT_AUTHORITY_LAYER.SEMANTIC_AUTHORITY
        : null,
      input.behaviorContract ? CONTRACT_AUTHORITY_LAYER.BEHAVIOR_CONTRACT : null,
      routingDecision?.mode === "commerce" || routingDecision?.mode === "comparison"
        ? CONTRACT_AUTHORITY_LAYER.DECISION_ENGINE
        : null,
    ].filter(Boolean),
  };
}

function contractHasSemanticTarget(contract = {}) {
  return (
    contract.resolvedSemanticTarget != null ||
    contract.semanticTargetResolution?.target != null
  );
}

function buildDecisionSection(input = {}) {
  const contract = input.behaviorContract || {};
  const recognition = input.recognition || input.intentRecognition || {};
  const targetResolution =
    contract.semanticTargetResolution ||
    (contract.resolvedSemanticTarget
      ? {
          target: contract.resolvedSemanticTarget,
          confidence: contract.semanticTargetConfidence,
          reasonCodes: contract.semanticTargetReasonCodes || [],
        }
      : {});

  return {
    authority: pickAuthoritySnapshot(input),
    interactionMode: contract.interactionMode || recognition.interactionMode || null,
    primaryIntent: contract.primaryIntent || recognition.primaryIntent || null,
    secondaryIntent:
      contract.secondarySocialIntent ||
      recognition.secondarySocialIntent ||
      recognition.primarySocialIntent ||
      null,
    target: {
      value: targetResolution.target || contract.resolvedSemanticTarget || null,
      confidence:
        targetResolution.confidence ?? contract.semanticTargetConfidence ?? null,
      reasonCodes: targetResolution.reasonCodes || contract.semanticTargetReasonCodes || [],
    },
    routingKey: contract.governedSocialRoutingKey || null,
    humanObjective: contract.humanObjective || recognition.humanObjective || null,
    conversationObjective:
      contract.conversationObjective || recognition.conversationObjective || null,
    expectedBehavior:
      contract.expectedHumanBehavior || recognition.expectedHumanBehavior || null,
    commercialPermission: pickAuthoritySnapshot(input).commercialPermission,
  };
}

function buildExperienceSection(contract = {}) {
  return {
    responseDepth: contract.responseDepth || null,
    followUpPolicy: contract.followUpPolicy || null,
    commerceReentryPolicy: contract.commerceReentryPolicy || null,
    contextPolicy: {
      preserveCommerceContext: !!contract.preserveCommerceContext,
      domainReentry: contract.domainReentry || null,
      requiresClarification: !!contract.requiresClarification,
    },
    personalityPolicy: contract.perceptionVersion
      ? {
          version: contract.perceptionVersion,
          socialDistance: contract.personalityPolicy?.socialDistance || null,
          tone: contract.responseBehavior?.tone || null,
        }
      : {
          tone: contract.responseBehavior?.tone || null,
        },
    validatorPolicy: {
      experienceVersion: contract.experienceVersion || HUMAN_EXPERIENCE_VERSION,
      forbiddenBehaviors: contract.responseBehavior?.forbidden || [],
      askFollowUp: contract.responseBehavior?.askFollowUp ?? null,
    },
  };
}

function buildVerbalizationSection(input = {}) {
  const finalization = input.finalization || {};
  return {
    rawResponse: finalization.rawLlmResponse ?? finalization.rawResponse ?? null,
    finalizedResponse:
      finalization.finalResponse ?? finalization.response ?? input.finalizedResponse ?? null,
    verbalizer:
      input.verbalizer ||
      (finalization.rawLlmResponse != null
        ? "llm"
        : finalization.response
          ? "governed_fallback"
          : null),
  };
}

function buildValidationSection(finalization = {}) {
  const validation = finalization.validation || finalization.validatorResults || null;
  if (!validation) {
    return { result: null, valid: null, violations: [] };
  }
  return {
    result: validation.valid ? "valid" : "invalid",
    valid: validation.valid ?? null,
    violations: validation.violations || [],
    perception: validation.perception || null,
  };
}

function buildRepairSection(finalization = {}) {
  const trace = finalization.replacementTrace || null;
  if (!trace) {
    return {
      applied: false,
      stage: null,
      reason: null,
      history: [],
    };
  }
  return {
    applied: !!trace.responseWasReplaced,
    stage: trace.replacementStage || null,
    reason: trace.replacementReason || null,
    selectedFallbackFamily: trace.selectedFallbackFamily || null,
    history: trace.reasonCodes || [],
  };
}

function buildDeliverySection(input = {}) {
  const runtime = input.runtimeEnforcement || {};
  const lifecycleHistory = runtime.lifecycle?.history || runtime.history || [];

  return {
    responsePath: input.responsePath || null,
    lifecycle: {
      current: runtime.lifecycle?.state || input.lifecycle?.current || CONTRACT_LIFECYCLE.DECIDED,
      history: lifecycleHistory,
      sealed: lifecycleHistory.includes(LIFECYCLE_STATES.SEALED),
      sent: lifecycleHistory.includes(LIFECYCLE_STATES.SENT),
    },
    provenance: {
      behaviorContractVersion:
        input.behaviorContract?.experienceVersion ||
        input.behaviorContract?.socialVerbalizationBridgeVersion ||
        null,
      modules: pickAuthoritySnapshot(input).layers,
    },
  };
}

function buildStateSection(input = {}) {
  return {
    runtimeState: input.runtimeEnforcement
      ? {
          lifecycle: input.runtimeEnforcement.lifecycle?.state || null,
          unknownPathFailClosed: input.runtimeEnforcement.unknownPathFailClosed ?? null,
          providerCallCount:
            input.runtimeEnforcement.providerAccounting?.providerCallCount ?? null,
        }
      : null,
    semanticState: input.semanticState || input.sessionContext?.semanticStateProvenance || null,
  };
}

export function buildUniversalConversationResponseContract(input = {}) {
  const contract = input.behaviorContract || {};
  const targetResolution =
    contract.semanticTargetResolution ||
    (contract.resolvedSemanticTarget
      ? {
          target: contract.resolvedSemanticTarget,
          confidence: contract.semanticTargetConfidence,
          reasonCodes: contract.semanticTargetReasonCodes || [],
        }
      : {});

  const fallbackPolicy = resolveFallbackFamilyPolicy(contract, targetResolution);
  const finalization = input.finalization || {};

  return {
    version: UNIVERSAL_CONVERSATION_RESPONSE_CONTRACT_VERSION,
    decision: buildDecisionSection(input),
    experience: buildExperienceSection(contract),
    fallback: fallbackPolicy,
    verbalization: buildVerbalizationSection(input),
    validation: buildValidationSection(finalization),
    repair: buildRepairSection(finalization),
    delivery: buildDeliverySection(input),
    state: buildStateSection(input),
    references: {
      behaviorContractPresent: !!input.behaviorContract,
      routingDecisionPresent: !!input.routingDecision,
      intentRecognitionPresent: !!(input.recognition || input.intentRecognition),
      intentAuthorityPresent: !!input.intentAuthority,
    },
  };
}

export function universalConversationResponseContractToTrace(envelope = null) {
  if (!envelope) return null;
  return {
    version: envelope.version,
    interactionMode: envelope.decision?.interactionMode,
    primaryIntent: envelope.decision?.primaryIntent,
    routingKey: envelope.decision?.routingKey,
    target: envelope.decision?.target?.value,
    targetConfidence: envelope.decision?.target?.confidence,
    responsePath: envelope.delivery?.responsePath,
    lifecycle: envelope.delivery?.lifecycle?.current,
    validationValid: envelope.validation?.valid,
    repairApplied: envelope.repair?.applied,
    fallbackPrimary: envelope.fallback?.primaryFamily,
    commercialPermission: envelope.decision?.commercialPermission,
  };
}

export function validateUniversalContractShape(envelope = {}) {
  const violations = [];
  if (envelope.version !== UNIVERSAL_CONVERSATION_RESPONSE_CONTRACT_VERSION) {
    violations.push("version_mismatch");
  }
  if (!envelope.decision || typeof envelope.decision !== "object") {
    violations.push("missing_decision");
  }
  if (!envelope.experience || typeof envelope.experience !== "object") {
    violations.push("missing_experience");
  }
  if (!envelope.fallback || !Array.isArray(envelope.fallback.permittedFamilies)) {
    violations.push("missing_fallback_policy");
  }
  if (!envelope.verbalization || typeof envelope.verbalization !== "object") {
    violations.push("missing_verbalization");
  }
  if (!envelope.delivery || typeof envelope.delivery !== "object") {
    violations.push("missing_delivery");
  }
  return { valid: violations.length === 0, violations };
}

export function buildUniversalContractFromHumanFinalization(
  behaviorContract = {},
  finalizeResult = {},
  context = {}
) {
  return buildUniversalConversationResponseContract({
    behaviorContract,
    finalization: {
      rawLlmResponse: finalizeResult.rawLlmResponse,
      finalResponse: finalizeResult.response,
      validation: finalizeResult.validation,
      replacementTrace: finalizeResult.replacementTrace,
      usedFallback: finalizeResult.usedFallback,
    },
    recognition: context.recognition,
    intentRecognition: context.intentRecognition,
    intentAuthority: context.intentAuthority,
    routingDecision: context.routingDecision,
    responsePath: context.responsePath || null,
    runtimeEnforcement: context.runtimeEnforcement || null,
    sessionContext: context.sessionContext || null,
  });
}

export function buildUniversalContractFromCommercialDelivery(context = {}) {
  const recognition = context.intentRecognition || context.recognition || {};
  const routingDecision = context.routingDecision || {};
  const behaviorContract = context.behaviorContract || {
    interactionMode: recognition.interactionMode || MIA_INTERACTION_MODES.COMMERCE,
    primaryIntent: recognition.primaryIntent || routingDecision.mode || "commerce",
    commercialIntent: true,
    responseDepth: context.responseDepth || "standard",
  };

  return buildUniversalConversationResponseContract({
    behaviorContract,
    recognition,
    intentAuthority: context.intentAuthority,
    routingDecision,
    responsePath: context.responsePath,
    runtimeEnforcement: context.runtimeEnforcement,
    sessionContext: context.sessionContext,
    finalizedResponse: context.reply || null,
    finalization: {
      rawResponse: context.replyBeforeTone || context.reply,
      finalResponse: context.reply,
      validation: context.validation || { valid: true, violations: [] },
    },
    verbalizer: context.verbalizer || "commercial_verbalizer",
  });
}
