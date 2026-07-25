/**
 * PATCH 3.1 — Commercial Entry Reconciliation
 *
 * Synchronizes legacy resolveContextQuery() output with authoritative
 * Intent Recognition + Intent Authority decisions.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import {
  COMMERCIAL_PERMISSION,
  INTENT_AUTHORITY_VERSION,
} from "./miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "./miaIntentRecognitionLayer.js";

export const COMMERCIAL_ENTRY_RECONCILIATION_VERSION = "3.1.0";

/** Legacy modes that must defer to commercial authority when permission is allow/mixed. */
export const LEGACY_MODES_DEFERRING_TO_COMMERCIAL_AUTHORITY = Object.freeze([
  "casual_chat",
  "social_conversation",
  "general_answer",
  "direct",
  "new_or_direct",
  "conversational",
]);

/** Intentional non-commercial guide modes — never opened by commercial authority. */
export const LEGACY_GUIDE_MODES_PRESERVED = Object.freeze([
  "budget_guide",
  "regret_fear_guide",
  "empty",
  "about_mia",
  "greeting",
  "acknowledgement",
  "emotional_support",
]);

/**
 * Whether legacy context resolution should yield to commercial authority.
 */
export function shouldLegacyContextDeferToCommercialAuthority(
  contextResolution = {},
  authority = null
) {
  if (!authority?.authoritative) return false;
  if (
    authority.commercialPermission !== COMMERCIAL_PERMISSION.ALLOW &&
    authority.commercialPermission !== COMMERCIAL_PERMISSION.MIXED
  ) {
    return false;
  }

  const mode = String(contextResolution?.mode || "");
  if (LEGACY_GUIDE_MODES_PRESERVED.includes(mode)) {
    return false;
  }

  if (contextResolution?.shouldSkipProductSearch === true) {
    return true;
  }

  if (LEGACY_MODES_DEFERRING_TO_COMMERCIAL_AUTHORITY.includes(mode)) {
    return true;
  }

  if (contextResolution?.directReply && mode === "general_answer") {
    return true;
  }

  return false;
}

/**
 * Build contextResolution patch when commercial entry is authorized.
 */
export function reconcileContextResolutionWithCommercialAuthority({
  contextResolution = {},
  authority = null,
  intentRecognition = null,
  query = "",
} = {}) {
  if (!shouldLegacyContextDeferToCommercialAuthority(contextResolution, authority)) {
    return { patch: null, applied: false, reasonCode: "no_reconciliation_needed" };
  }

  const isMixed = authority.commercialPermission === COMMERCIAL_PERMISSION.MIXED;
  const patch = {
    shouldSkipProductSearch: false,
    needsClarification: false,
    directReply: null,
    clearContext: false,
    mode: isMixed ? "mixed_commercial_authority_open" : "commercial_authority_open",
    standaloneQuery: contextResolution?.standaloneQuery || query,
  };

  if (intentRecognition?.requiresClarification && isMixed) {
    patch.needsClarification = true;
  }

  return {
    patch,
    applied: true,
    reasonCode: isMixed
      ? "legacy_context_deferred_to_mixed_authority"
      : "legacy_context_deferred_to_commercial_authority",
  };
}

/**
 * Extend applyIntentAuthorityToPipeline commercial-allow path.
 */
export function buildCommercialAuthorityContextPatch({
  authority = null,
  contextResolution = {},
  intentRecognition = null,
  query = "",
} = {}) {
  if (!authority?.authoritative) return null;

  if (authority.commercialPermission === COMMERCIAL_PERMISSION.DENY) {
    return null;
  }

  const reconciliation = reconcileContextResolutionWithCommercialAuthority({
    contextResolution,
    authority,
    intentRecognition,
    query,
  });

  if (reconciliation.applied && reconciliation.patch) {
    return reconciliation.patch;
  }

  if (
    authority.commercialPermission === COMMERCIAL_PERMISSION.ALLOW ||
    authority.commercialPermission === COMMERCIAL_PERMISSION.MIXED
  ) {
    if (contextResolution?.shouldSkipProductSearch === true) {
      return {
        shouldSkipProductSearch: false,
        needsClarification: false,
        directReply: null,
      };
    }
  }

  return null;
}

/**
 * Trace helper for pipeline/debug.
 */
export function commercialEntryReconciliationToTrace(result = null) {
  if (!result) return null;
  return {
    version: COMMERCIAL_ENTRY_RECONCILIATION_VERSION,
    authorityVersion: INTENT_AUTHORITY_VERSION,
    applied: !!result.applied,
    reasonCode: result.reasonCode || null,
    patch: result.patch || null,
  };
}

/**
 * Validate mixed segmentation may proceed (entry gate pre-check).
 */
export function shouldOpenCommercialPipelineFromAuthority(authority = null) {
  if (!authority?.authoritative) return true;
  return (
    authority.commercialPermission === COMMERCIAL_PERMISSION.ALLOW ||
    authority.commercialPermission === COMMERCIAL_PERMISSION.MIXED
  );
}

export function isIdentityOrSafetyNonCommercialEntry(intentRecognition = null) {
  const mode = intentRecognition?.interactionMode || "";
  return (
    mode === MIA_INTERACTION_MODES.IDENTITY ||
    mode === MIA_INTERACTION_MODES.SAFETY
  );
}
