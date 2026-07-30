/**
 * PATCH 4.1I.3 — Response Replacement Trace
 *
 * Traceability for post-LLM response substitution paths.
 */

export const RESPONSE_REPLACEMENT_TRACE_VERSION = "4.1I.3";

export const REPLACEMENT_STAGES = Object.freeze({
  NONE: "none",
  VALIDATION: "validation",
  PERCEPTION: "perception",
  TONE_GUARD: "tone_guard",
  COMMERCIAL_STRIP: "commercial_strip",
  GOVERNED_FALLBACK: "governed_fallback",
  LEGACY_FALLBACK: "legacy_fallback",
});

/**
 * @param {object} input
 * @returns {object}
 */
export function createResponseReplacementTrace(input = {}) {
  return {
    version: RESPONSE_REPLACEMENT_TRACE_VERSION,
    rawLlmResponse: input.rawLlmResponse ?? null,
    finalResponse: input.finalResponse ?? null,
    responseWasReplaced: !!input.responseWasReplaced,
    replacementStage: input.replacementStage || REPLACEMENT_STAGES.NONE,
    replacementReason: input.replacementReason || null,
    selectedFallbackFamily: input.selectedFallbackFamily || null,
    selectedFallbackFunction: input.selectedFallbackFunction || null,
    governedIntent: input.governedIntent || null,
    resolvedTarget: input.resolvedTarget || null,
    interactionMode: input.interactionMode || null,
    commercialRelevance: input.commercialRelevance ?? null,
    primarySocialIntent: input.primarySocialIntent || null,
    expectedHumanBehavior: input.expectedHumanBehavior || null,
    conversationObjective: input.conversationObjective || null,
    validatorResults: input.validatorResults || null,
    legacyPathUsed: input.legacyPathUsed ?? false,
    legacyPathBlocked: input.legacyPathBlocked ?? false,
    reasonCodes: input.reasonCodes || [],
    governedSocialRoutingKey: input.governedSocialRoutingKey || null,
    preservedLlmResponse: input.preservedLlmResponse ?? false,
  };
}

export function responseReplacementTraceToDebug(trace = null) {
  if (!trace) return null;
  return { ...trace };
}
