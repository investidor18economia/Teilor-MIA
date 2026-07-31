/**
 * PATCH 5.5 — Universal Conversation Recovery & Finalization Gate
 *
 * Last autonomous correction layer before user-visible delivery.
 * Contract-driven only — no phrase hardcodes, no parallel pipeline.
 * MIA owns the intelligence; recovery preserves governed decisions.
 */

import {
  validateHumanConversationResponse,
  finalizeHumanConversationReply,
} from "./miaHumanConversationExperience.js";
import {
  validateUniversalContractShape,
  UNIVERSAL_CONVERSATION_RESPONSE_CONTRACT_VERSION,
  CONTRACT_LIFECYCLE,
} from "./miaUniversalConversationResponseContract.js";
import {
  selectGovernedFallback,
  FALLBACK_FAMILIES,
} from "./miaGovernedFallbackPolicy.js";
import { isCommercialFallbackBlocked } from "./miaSemanticAuthority.js";
import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";

export const UNIVERSAL_RECOVERY_VERSION = "5.5.0";

function isReplyEmpty(value) {
  if (value == null) return true;
  const text = String(value);
  return !text.length || !text.trim().length;
}

export const RECOVERY_STRATEGIES = Object.freeze({
  NONE: "none",
  REUSE_PRIOR_VALID: "reuse_prior_valid",
  REBUILD_FROM_UNIVERSAL_CONTRACT: "rebuild_from_universal_contract",
  REBUILD_FROM_INTENT_TARGET: "rebuild_from_intent_target",
  GOVERNED_FALLBACK: "governed_fallback",
});

export const RECOVERY_REASON_CODES = Object.freeze({
  EMPTY_REPLY: "empty_reply",
  UNIVERSAL_CONTRACT_SHAPE_INVALID: "universal_contract_shape_invalid",
  EXPERIENCE_CONTRACT_VIOLATION: "experience_contract_violation",
  FORBIDDEN_FALLBACK_FAMILY: "forbidden_fallback_family",
  COMMERCIAL_IN_SOCIAL_MODE: "commercial_in_social_mode",
  DISPROPORTIONATE_LENGTH: "disproportionate_length",
  PRIOR_VALID_REUSED: "prior_valid_reused",
  CONTRACT_REBUILD_SUCCESS: "contract_rebuild_success",
  INTENT_TARGET_REBUILD_SUCCESS: "intent_target_rebuild_success",
  GOVERNED_FALLBACK_APPLIED: "governed_fallback_applied",
  ALL_STRATEGIES_EXHAUSTED: "all_strategies_exhausted",
});

const VALIDATOR_IDS = Object.freeze({
  STRUCTURAL: "structural_integrity",
  UNIVERSAL_CONTRACT: "universal_contract_shape",
  EXPERIENCE_CONTRACT: "experience_contract_alignment",
  FALLBACK_POLICY: "fallback_policy_compliance",
  INTERACTION_MODE: "interaction_mode_alignment",
});

function runValidator(id, fn) {
  const result = fn();
  return {
    id,
    valid: result.valid,
    violations: result.violations || [],
    reasonCodes: result.reasonCodes || [],
  };
}

function validateStructuralIntegrity(reply = "") {
  if (isReplyEmpty(reply)) {
    return {
      valid: false,
      violations: ["empty_reply"],
      reasonCodes: [RECOVERY_REASON_CODES.EMPTY_REPLY],
    };
  }
  return { valid: true, violations: [], reasonCodes: [] };
}

function validateUniversalContractIntegrity(universalContract = null) {
  if (!universalContract) {
    return { valid: true, violations: [], reasonCodes: [] };
  }
  const shape = validateUniversalContractShape(universalContract);
  if (!shape.valid) {
    return {
      valid: false,
      violations: shape.violations,
      reasonCodes: [RECOVERY_REASON_CODES.UNIVERSAL_CONTRACT_SHAPE_INVALID],
    };
  }
  return { valid: true, violations: [], reasonCodes: [] };
}

function validateExperienceContractAlignment(reply = "", behaviorContract = {}) {
  const validation = validateHumanConversationResponse(reply, behaviorContract);
  if (!validation.valid) {
    return {
      valid: false,
      violations: validation.violations,
      reasonCodes: [RECOVERY_REASON_CODES.EXPERIENCE_CONTRACT_VIOLATION],
    };
  }
  return { valid: true, violations: [], reasonCodes: [] };
}

function validateFallbackPolicyCompliance(
  reply = "",
  behaviorContract = {},
  universalContract = null
) {
  const forbidden = universalContract?.fallback?.forbiddenFamilies || [];
  if (!forbidden.length) {
    return { valid: true, violations: [], reasonCodes: [] };
  }

  const selection = selectGovernedFallback(behaviorContract, {
    failureReason: "recovery_policy_probe",
  });
  if (forbidden.includes(selection.family)) {
    return {
      valid: false,
      violations: ["forbidden_fallback_family"],
      reasonCodes: [RECOVERY_REASON_CODES.FORBIDDEN_FALLBACK_FAMILY],
    };
  }
  return { valid: true, violations: [], reasonCodes: [] };
}

function validateInteractionModeAlignment(reply = "", behaviorContract = {}) {
  if (
    behaviorContract.interactionMode === MIA_INTERACTION_MODES.SOCIAL &&
    isCommercialFallbackBlocked(behaviorContract)
  ) {
    const validation = validateHumanConversationResponse(reply, behaviorContract);
    if (validation.violations.includes("commercial_redirect_in_social_mode")) {
      return {
        valid: false,
        violations: validation.violations,
        reasonCodes: [RECOVERY_REASON_CODES.COMMERCIAL_IN_SOCIAL_MODE],
      };
    }
  }
  return { valid: true, violations: [], reasonCodes: [] };
}

/**
 * Unified validator chain — single entry, unique responsibilities per validator.
 */
export function runUniversalValidatorChain(
  reply = "",
  behaviorContract = {},
  universalContract = null
) {
  const results = [
    runValidator(VALIDATOR_IDS.STRUCTURAL, () => validateStructuralIntegrity(reply)),
    runValidator(VALIDATOR_IDS.UNIVERSAL_CONTRACT, () =>
      validateUniversalContractIntegrity(universalContract)
    ),
    runValidator(VALIDATOR_IDS.EXPERIENCE_CONTRACT, () =>
      validateExperienceContractAlignment(reply, behaviorContract)
    ),
    runValidator(VALIDATOR_IDS.FALLBACK_POLICY, () =>
      validateFallbackPolicyCompliance(reply, behaviorContract, universalContract)
    ),
    runValidator(VALIDATOR_IDS.INTERACTION_MODE, () =>
      validateInteractionModeAlignment(reply, behaviorContract)
    ),
  ];

  const rejected = results.filter((r) => !r.valid);
  return {
    version: UNIVERSAL_RECOVERY_VERSION,
    valid: rejected.length === 0,
    results,
    approved: results.filter((r) => r.valid).map((r) => r.id),
    rejected: rejected.map((r) => ({ id: r.id, violations: r.violations, reasonCodes: r.reasonCodes })),
    violations: rejected.flatMap((r) => r.violations),
    reasonCodes: rejected.flatMap((r) => r.reasonCodes),
  };
}

function finalizeCandidate(
  candidateReply,
  behaviorContract,
  toneProfile,
  { period = "", universalContext = null } = {}
) {
  return finalizeHumanConversationReply(candidateReply, behaviorContract, toneProfile, {
    period,
    universalContext,
  });
}

function tryReusePriorValid(priorValidReply, behaviorContract, universalContract, toneProfile, ctx) {
  if (!priorValidReply) return null;
  const chain = runUniversalValidatorChain(priorValidReply, behaviorContract, universalContract);
  if (!chain.valid) return null;
  return {
    reply: priorValidReply,
    strategy: RECOVERY_STRATEGIES.REUSE_PRIOR_VALID,
    reasonCodes: [RECOVERY_REASON_CODES.PRIOR_VALID_REUSED],
    finalizeResult: {
      response: priorValidReply,
      validation: { valid: true, violations: [] },
      usedFallback: false,
      recoveryApplied: true,
    },
  };
}

function tryRebuildFromUniversalContract(behaviorContract, universalContract, toneProfile, ctx) {
  const primaryFamily = universalContract?.fallback?.primaryFamily;
  if (!primaryFamily) return null;

  const selection = selectGovernedFallback(behaviorContract, {
    failureReason: "universal_contract_rebuild",
    period: ctx.period || "",
  });

  if (
    universalContract?.fallback?.forbiddenFamilies?.includes(selection.family) &&
    selection.family !== primaryFamily
  ) {
    return null;
  }

  const finalized = finalizeCandidate(selection.text, behaviorContract, toneProfile, ctx);
  const chain = runUniversalValidatorChain(finalized.response, behaviorContract, universalContract);
  if (!chain.valid) return null;

  return {
    reply: finalized.response,
    strategy: RECOVERY_STRATEGIES.REBUILD_FROM_UNIVERSAL_CONTRACT,
    reasonCodes: [RECOVERY_REASON_CODES.CONTRACT_REBUILD_SUCCESS],
    finalizeResult: { ...finalized, recoveryApplied: true },
  };
}

function tryRebuildFromIntentTarget(behaviorContract, universalContract, toneProfile, ctx) {
  const selection = selectGovernedFallback(behaviorContract, {
    failureReason: "intent_target_rebuild",
    period: ctx.period || "",
  });
  const finalized = finalizeCandidate(selection.text, behaviorContract, toneProfile, ctx);
  const chain = runUniversalValidatorChain(finalized.response, behaviorContract, universalContract);
  if (!chain.valid) return null;

  return {
    reply: finalized.response,
    strategy: RECOVERY_STRATEGIES.REBUILD_FROM_INTENT_TARGET,
    reasonCodes: [RECOVERY_REASON_CODES.INTENT_TARGET_REBUILD_SUCCESS],
    finalizeResult: { ...finalized, recoveryApplied: true },
  };
}

function tryGovernedFallback(behaviorContract, universalContract, toneProfile, ctx) {
  const selection = selectGovernedFallback(behaviorContract, {
    failureReason: "universal_recovery_final",
    period: ctx.period || "",
  });
  const finalized = finalizeCandidate(selection.text, behaviorContract, toneProfile, ctx);
  return {
    reply: finalized.response || selection.text || "",
    strategy: RECOVERY_STRATEGIES.GOVERNED_FALLBACK,
    reasonCodes: [RECOVERY_REASON_CODES.GOVERNED_FALLBACK_APPLIED],
    finalizeResult: { ...finalized, usedFallback: true, recoveryApplied: true },
  };
}

function sealUniversalContract(universalContract = null, recovery = {}) {
  if (!universalContract) return null;
  return {
    ...universalContract,
    validation: {
      ...(universalContract.validation || {}),
      result: recovery.chainValid ? "valid" : "recovered",
      valid: true,
      violations: [],
    },
    repair: {
      applied: !!recovery.recoveryApplied,
      stage: recovery.strategy || null,
      reason: recovery.reasonCodes?.join("|") || null,
      history: recovery.reasonCodes || [],
    },
    delivery: {
      ...(universalContract.delivery || {}),
      lifecycle: {
        ...(universalContract.delivery?.lifecycle || {}),
        current: CONTRACT_LIFECYCLE.REPAIRED,
        history: [
          ...(universalContract.delivery?.lifecycle?.history || []),
          CONTRACT_LIFECYCLE.REPAIRED,
          CONTRACT_LIFECYCLE.AUTHORIZED,
        ],
      },
    },
  };
}

/**
 * Universal recovery gate — last correction before egress delivery.
 */
export function applyUniversalConversationRecovery({
  reply = "",
  behaviorContract = {},
  universalContract = null,
  toneProfile = null,
  priorValidReply = null,
  period = "",
  universalContext = null,
  finalizeResult = null,
} = {}) {
  const ctx = { period, universalContext };
  let chain = runUniversalValidatorChain(reply, behaviorContract, universalContract);

  if (chain.valid) {
    return {
      version: UNIVERSAL_RECOVERY_VERSION,
      reply,
      recoveryApplied: false,
      strategy: RECOVERY_STRATEGIES.NONE,
      chain,
      finalizeResult,
      universalContract,
      reasonCodes: [],
    };
  }

  const strategies = [
    () => tryReusePriorValid(priorValidReply, behaviorContract, universalContract, toneProfile, ctx),
    () => tryRebuildFromUniversalContract(behaviorContract, universalContract, toneProfile, ctx),
    () => tryRebuildFromIntentTarget(behaviorContract, universalContract, toneProfile, ctx),
    () => tryGovernedFallback(behaviorContract, universalContract, toneProfile, ctx),
  ];

  for (const attempt of strategies) {
    const recovered = attempt();
    if (!recovered?.reply) continue;
    const recoveredChain = runUniversalValidatorChain(
      recovered.reply,
      behaviorContract,
      universalContract
    );
    if (!recoveredChain.valid && recovered.strategy !== RECOVERY_STRATEGIES.GOVERNED_FALLBACK) {
      continue;
    }
    return {
      version: UNIVERSAL_RECOVERY_VERSION,
      reply: recovered.reply,
      recoveryApplied: true,
      strategy: recovered.strategy,
      chain: recoveredChain,
      priorChain: chain,
      finalizeResult: recovered.finalizeResult || finalizeResult,
      universalContract: sealUniversalContract(universalContract, {
        recoveryApplied: true,
        strategy: recovered.strategy,
        reasonCodes: recovered.reasonCodes,
        chainValid: recoveredChain.valid,
      }),
      reasonCodes: recovered.reasonCodes,
    };
  }

  const fallback = tryGovernedFallback(behaviorContract, universalContract, toneProfile, ctx);
  return {
    version: UNIVERSAL_RECOVERY_VERSION,
    reply: fallback.reply || reply,
    recoveryApplied: true,
    strategy: RECOVERY_STRATEGIES.GOVERNED_FALLBACK,
    chain: runUniversalValidatorChain(fallback.reply, behaviorContract, universalContract),
    priorChain: chain,
    finalizeResult: fallback.finalizeResult,
    universalContract: sealUniversalContract(universalContract, {
      recoveryApplied: true,
      strategy: RECOVERY_STRATEGIES.GOVERNED_FALLBACK,
      reasonCodes: [RECOVERY_REASON_CODES.ALL_STRATEGIES_EXHAUSTED],
      chainValid: true,
    }),
    reasonCodes: [RECOVERY_REASON_CODES.ALL_STRATEGIES_EXHAUSTED, ...fallback.reasonCodes],
  };
}

export function universalRecoveryToTrace(recovery = null) {
  if (!recovery?.version) return null;
  return {
    version: recovery.version,
    recoveryApplied: recovery.recoveryApplied,
    strategy: recovery.strategy,
    reasonCodes: recovery.reasonCodes,
    validatorsApproved: recovery.chain?.approved || [],
    validatorsRejected: recovery.chain?.rejected || [],
    priorViolations: recovery.priorChain?.violations || null,
  };
}

export { VALIDATOR_IDS, FALLBACK_FAMILIES, UNIVERSAL_CONVERSATION_RESPONSE_CONTRACT_VERSION };
