/**
 * PATCH 5.3 — Unified Conversational Egress
 *
 * Prepara entrega governada: finalização social, empty guard, contrato universal,
 * metadata honesta. Não envia HTTP — o handler delega ao sendRuntimeResponse.
 */

import {
  finalizeHumanConversationReply,
  buildGovernedSocialFallbackReply,
} from "./miaHumanConversationExperience.js";
import {
  buildUniversalContractFromHumanFinalization,
  buildUniversalContractFromCommercialDelivery,
  universalConversationResponseContractToTrace,
  validateUniversalContractShape,
} from "./miaUniversalConversationResponseContract.js";
import { selectGovernedFallback } from "./miaGovernedFallbackPolicy.js";
import {
  applyUniversalConversationRecovery,
  universalRecoveryToTrace,
  UNIVERSAL_RECOVERY_VERSION,
} from "./miaUniversalConversationRecovery.js";

export const UNIFIED_CONVERSATION_EGRESS_VERSION = "5.5.0";

export const EGRESS_FINALIZER_KIND = Object.freeze({
  SOCIAL: "social",
  COMMERCIAL: "commercial",
  CLARIFICATION: "clarification",
  DIRECT: "direct",
  TECHNICAL: "technical",
});

export const EMPTY_REPLY_REASON = Object.freeze({
  NULL: "null_reply",
  UNDEFINED: "undefined_reply",
  BLANK: "blank_reply",
  WHITESPACE: "whitespace_reply",
  MISSING_FIELD: "missing_reply_field",
});

export function isEmptyConversationalReply(value) {
  if (value == null) return { empty: true, reason: value === null ? EMPTY_REPLY_REASON.NULL : EMPTY_REPLY_REASON.UNDEFINED };
  const text = String(value);
  if (!text.length) return { empty: true, reason: EMPTY_REPLY_REASON.BLANK };
  if (!text.trim().length) return { empty: true, reason: EMPTY_REPLY_REASON.WHITESPACE };
  return { empty: false, reason: null };
}

export function buildHonestFinalizationMetadata(finalizeResult = {}, finalizerKind = EGRESS_FINALIZER_KIND.SOCIAL) {
  const applied = !!finalizeResult?.validation || finalizeResult?.response != null;
  return {
    required: true,
    applied,
    validatorApplied: applied && finalizeResult?.validation != null,
    finalizerKind,
    usedFallback: !!finalizeResult?.usedFallback,
    repairApplied: !!finalizeResult?.replacementTrace?.responseWasReplaced,
    emptyGuardApplied: !!finalizeResult?.emptyGuardApplied,
    emptyGuardReason: finalizeResult?.emptyGuardReason || null,
  };
}

export function prepareSocialEgressFinalization(
  candidateReply = "",
  behaviorContract = {},
  toneProfile = null,
  { period = "", universalContext = null, skipEmptyGuard = false } = {}
) {
  let seed = String(candidateReply ?? "").trim();
  if (!seed) {
    seed = buildGovernedSocialFallbackReply(behaviorContract, {
      period,
      failureReason: "empty_candidate_pre_finalize",
    });
  }

  const finalized = finalizeHumanConversationReply(seed, behaviorContract, toneProfile, {
    period,
    universalContext,
  });

  let response = finalized.response;
  let emptyGuardApplied = false;
  let emptyGuardReason = null;

  let finalizeResult = {
    ...finalized,
    response,
    emptyGuardApplied,
    emptyGuardReason,
  };

  if (!skipEmptyGuard) {
    const emptyCheck = isEmptyConversationalReply(response);
    if (emptyCheck.empty) {
      emptyGuardReason = emptyCheck.reason;
      emptyGuardApplied = true;
      const fallback = selectGovernedFallback(behaviorContract, {
        failureReason: `empty_reply_${emptyCheck.reason}`,
        period,
      });
      const fallbackText =
        fallback.text || buildGovernedSocialFallbackReply(behaviorContract, { period });
      const repaired = finalizeHumanConversationReply(fallbackText, behaviorContract, toneProfile, {
        period,
        universalContext,
      });
      finalizeResult = {
        ...repaired,
        emptyGuardApplied,
        emptyGuardReason,
        usedFallback: true,
      };
      response = repaired.response;
    }
  }

  const universalContract =
    finalizeResult.universalContract ||
    buildUniversalContractFromHumanFinalization(behaviorContract, finalizeResult, universalContext || {});

  const recovery = applyUniversalConversationRecovery({
    reply: response,
    behaviorContract,
    universalContract,
    toneProfile,
    period,
    universalContext,
    finalizeResult,
  });

  if (recovery.recoveryApplied) {
    response = recovery.reply;
    finalizeResult = recovery.finalizeResult || finalizeResult;
  }

  const sealedContract = recovery.universalContract || universalContract;

  return {
    reply: response,
    finalizeResult,
    universalContract: sealedContract,
    universalRecovery: recovery,
    finalizationMeta: {
      ...buildHonestFinalizationMetadata(finalizeResult, EGRESS_FINALIZER_KIND.SOCIAL),
      recoveryApplied: recovery.recoveryApplied,
      recoveryStrategy: recovery.strategy,
      universalRecoveryVersion: UNIVERSAL_RECOVERY_VERSION,
    },
  };
}

export function wrapSocialFinalizationForEgress(
  finalized = {},
  behaviorContract = {},
  universalContext = {}
) {
  const emptyCheck = isEmptyConversationalReply(finalized.response);
  if (emptyCheck.empty) {
    return prepareSocialEgressFinalization("", behaviorContract, null, {
      period: universalContext?.period || "",
      universalContext,
    });
  }
  const universalContract =
    finalized.universalContract ||
    buildUniversalContractFromHumanFinalization(behaviorContract, finalized, universalContext || {});

  const recovery = applyUniversalConversationRecovery({
    reply: finalized.response,
    behaviorContract,
    universalContract,
    toneProfile: null,
    universalContext,
    finalizeResult: finalized,
  });

  return {
    reply: recovery.reply,
    finalizeResult: recovery.finalizeResult || finalized,
    universalContract: recovery.universalContract || universalContract,
    universalRecovery: recovery,
    finalizationMeta: {
      ...buildHonestFinalizationMetadata(finalized, EGRESS_FINALIZER_KIND.SOCIAL),
      recoveryApplied: recovery.recoveryApplied,
      recoveryStrategy: recovery.strategy,
      universalRecoveryVersion: UNIVERSAL_RECOVERY_VERSION,
    },
  };
}

export function prepareClarificationEgressFinalization(
  candidateReply = "",
  behaviorContract = {},
  toneProfile = null,
  context = {}
) {
  return prepareSocialEgressFinalization(candidateReply, behaviorContract, toneProfile, {
    ...context,
    universalContext: {
      ...(context.universalContext || {}),
      responsePath: context.responsePath || "needs_clarification",
    },
  });
}

export function prepareCommercialEgressEnvelope(body = {}, context = {}) {
  const emptyCheck = isEmptyConversationalReply(body?.reply);
  let reply = body?.reply;
  let emptyGuardApplied = false;
  let emptyGuardReason = null;

  if (emptyCheck.empty) {
    emptyGuardApplied = true;
    emptyGuardReason = emptyCheck.reason;
    reply =
      "Consigo te ajudar — me conta um pouco mais do que você precisa que eu direciono a resposta.";
  }

  const universalContract = buildUniversalContractFromCommercialDelivery({
    ...context,
    reply,
    replyBeforeTone: body?.reply,
    validation: { valid: !emptyCheck.empty, violations: emptyCheck.empty ? ["empty_reply"] : [] },
  });

  const recovery = applyUniversalConversationRecovery({
    reply,
    behaviorContract: context.behaviorContract || {
      interactionMode: "commerce",
      commercialIntent: true,
      primaryIntent: "commerce",
    },
    universalContract,
    universalContext: context,
  });

  if (recovery.recoveryApplied) {
    reply = recovery.reply;
  }

  return {
    body: { ...body, reply },
    universalContract: recovery.universalContract || universalContract,
    universalRecovery: recovery,
    emptyGuardApplied: emptyGuardApplied || recovery.recoveryApplied,
    emptyGuardReason,
    finalizationMeta: {
      required: true,
      applied: true,
      validatorApplied: true,
      finalizerKind: EGRESS_FINALIZER_KIND.COMMERCIAL,
      usedFallback: emptyGuardApplied || recovery.recoveryApplied,
      repairApplied: recovery.recoveryApplied,
      emptyGuardApplied: emptyGuardApplied || recovery.recoveryApplied,
      emptyGuardReason,
      recoveryStrategy: recovery.strategy,
      universalRecoveryVersion: UNIVERSAL_RECOVERY_VERSION,
    },
  };
}

export function unifiedEgressToTrace(egressPrep = {}) {
  const contractTrace = universalConversationResponseContractToTrace(egressPrep.universalContract);
  return {
    version: UNIFIED_CONVERSATION_EGRESS_VERSION,
    finalizerKind: egressPrep.finalizationMeta?.finalizerKind || null,
    emptyGuardApplied: egressPrep.finalizationMeta?.emptyGuardApplied || egressPrep.emptyGuardApplied || false,
    emptyGuardReason: egressPrep.finalizationMeta?.emptyGuardReason || egressPrep.emptyGuardReason || null,
    universalRecovery: universalRecoveryToTrace(egressPrep.universalRecovery),
    universalContract: contractTrace,
    finalization: egressPrep.finalizationMeta || null,
  };
}

export function validateEgressInvariants(egressPrep = {}) {
  const violations = [];
  if (!egressPrep.finalizationMeta?.applied) {
    violations.push("finalization_not_applied");
  }
  const empty = isEmptyConversationalReply(egressPrep.reply);
  if (empty.empty) violations.push("empty_reply_not_blocked");
  if (egressPrep.universalContract) {
    const shape = validateUniversalContractShape(egressPrep.universalContract);
    if (!shape.valid) violations.push(...shape.violations.map((v) => `contract_${v}`));
  }
  if (egressPrep.universalRecovery?.recoveryApplied && !egressPrep.reply) {
    violations.push("recovery_failed_to_produce_reply");
  }
  return { valid: violations.length === 0, violations };
}

export { universalRecoveryToTrace, UNIVERSAL_RECOVERY_VERSION } from "./miaUniversalConversationRecovery.js";
