/**
 * PATCH 3.2b — Conversation Continuity (Cognitive State)
 *
 * Rehydrates operational memory during buildSessionContext and governs
 * early-return paths that must not drop anchor/winner/runner-up.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import { pickAuthoritativeLastBestProduct } from "./miaRoutingSafety.js";
import {
  auditSessionContextRebuild,
  pickSessionContextForTransport,
  SESSION_CONTEXT_TRANSPORT_VERSION,
} from "./miaSessionContextTransport.js";

export const CONVERSATION_CONTINUITY_VERSION = "3.2.0";

/** Turn types that must bypass general_answer anchor destruction when anchored. */
export const ANCHORED_CONTEXTUAL_TURN_TYPES = Object.freeze([
  "ALTERNATIVE_REQUEST",
  "OBJECTION",
  "PRIORITY_SHIFT",
  "EXPLANATION_REQUEST",
  "REFINEMENT",
  "FOLLOW_UP",
  "CONFIDENCE_CHALLENGE",
  "CONSTRAINT_CHANGE",
  "SECOND_BEST_DISCOVERY",
  "DECISION_CONFIRMATION",
  "COMPREHENSION",
]);

const CONTINUITY_SCALAR_FIELDS = [
  "lastCategory",
  "lastIntent",
  "lastPriority",
  "lastTopic",
  "lastQuery",
  "lastInteractionType",
  "lastAxis",
  "lastMainConsequence",
  "lastArchetype",
  "lastBehaviorMode",
  "lastTradeoff",
  "lastDecisionReason",
  "lastPreviousAxis",
  "lastPreviousPriority",
  "lastComparisonQuery",
  "lastContextualAxis",
  "activeContextKey",
  "activeContextType",
  "activeContextStrength",
  "activeMiaRole",
  "budgetMax",
  "lastBudget",
  "lastRecommendationDecisionRequestId",
  "lastRecommendationDecisionSource",
  "lastRecommendationDecisionWinnerFamily",
  "lastRecommendationDecisionRunnerUpFamily",
];

const CONTINUITY_ARRAY_FIELDS = [
  "lastProducts",
  "lastRankingSnapshot",
  "lastComparisonProducts",
  "lastWinnerAdvantages",
  "lastWinnerSacrifices",
  "contexts",
  "preferredBrands",
  "excludedBrands",
];

const CONTINUITY_OBJECT_FIELDS = [
  "lastBestProduct",
  "lastDecisionChange",
  "miaArgumentMemory",
  "miaBrain",
  "lastCommercialConstraints",
  "semanticStateProvenance",
  "mixedConversationalState",
];

function isEmpty(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

function cloneValue(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry));
  if (typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = cloneValue(entry);
    }
    return next;
  }
  return value;
}

/**
 * Rehydrate continuity fields from incoming session_context after buildSessionContext.
 * Fixes CONV-P-B08 — BUILD_CONTEXT_DROPPED_* during server-side rebuild.
 */
export function rehydrateContinuityFromIncoming(builtContext = {}, incomingContext = {}) {
  const built = { ...(builtContext || {}) };
  const incoming = incomingContext || {};

  const isPostReset =
    built?.lastInteractionType === "legitimate_search_reset" ||
    built?.lastIntent === "legitimate_search_reset" ||
    incoming?.lastInteractionType === "legitimate_search_reset";

  if (isPostReset) {
    return built;
  }

  for (const field of CONTINUITY_SCALAR_FIELDS) {
    if (isEmpty(built[field]) && !isEmpty(incoming[field])) {
      built[field] = incoming[field];
    }
  }

  for (const field of CONTINUITY_ARRAY_FIELDS) {
    if (isEmpty(built[field]) && !isEmpty(incoming[field])) {
      built[field] = cloneValue(incoming[field]);
    }
  }

  for (const field of CONTINUITY_OBJECT_FIELDS) {
    if (isEmpty(built[field]) && !isEmpty(incoming[field])) {
      built[field] = cloneValue(incoming[field]);
    }
  }

  if (incoming?.comparisonContextLocked && !built.comparisonContextLocked) {
    built.comparisonContextLocked = true;
  }

  if (incoming?.lastArgumentMemoryTurn && !built.lastArgumentMemoryTurn) {
    built.lastArgumentMemoryTurn = incoming.lastArgumentMemoryTurn;
  }

  if (incoming?.lastArgumentMemoryPressure && !built.lastArgumentMemoryPressure) {
    built.lastArgumentMemoryPressure = incoming.lastArgumentMemoryPressure;
  }

  if (incoming?.lastRecommendationDecisionAtMs != null && built.lastRecommendationDecisionAtMs == null) {
    built.lastRecommendationDecisionAtMs = incoming.lastRecommendationDecisionAtMs;
  }

  built.lastBestProduct = pickAuthoritativeLastBestProduct(
    built.lastBestProduct || incoming.lastBestProduct,
    built.lastProducts?.length ? built.lastProducts : incoming.lastProducts
  );

  if (
    !built.lastProductMentioned &&
    (built.lastBestProduct?.product_name || incoming.lastProductMentioned)
  ) {
    built.lastProductMentioned =
      built.lastBestProduct?.product_name || incoming.lastProductMentioned;
  }

  built._continuityVersion = CONVERSATION_CONTINUITY_VERSION;
  built._transportVersion = SESSION_CONTEXT_TRANSPORT_VERSION;

  return built;
}

/**
 * Whether an anchored contextual turn must bypass general_answer session wipe.
 */
export function isAnchoredContextualContinuityTurn({
  hasAnchor = false,
  cognitiveTurnType = null,
} = {}) {
  return (
    !!hasAnchor &&
    !!cognitiveTurnType &&
    ANCHORED_CONTEXTUAL_TURN_TYPES.includes(String(cognitiveTurnType))
  );
}

/**
 * Build session_context for early returns that must preserve anchor/history.
 */
export function buildContinuityPreservedSessionContext(
  base = {},
  overrides = {},
  { preserveAnchor = true, preserveRanking = true, preserveComparison = true } = {}
) {
  const merged = {
    ...pickSessionContextForTransport(base),
    ...pickSessionContextForTransport(overrides),
  };

  if (preserveAnchor) {
    const anchor = pickAuthoritativeLastBestProduct(
      base?.lastBestProduct || overrides?.lastBestProduct,
      merged.lastProducts || base?.lastProducts
    );
    if (anchor?.product_name) {
      merged.lastBestProduct = anchor;
      merged.lastProductMentioned =
        anchor.product_name || merged.lastProductMentioned || "";
    }
  }

  if (
    preserveRanking &&
    Array.isArray(base?.lastRankingSnapshot) &&
    base.lastRankingSnapshot.length > 0 &&
    (!Array.isArray(merged.lastRankingSnapshot) || merged.lastRankingSnapshot.length === 0)
  ) {
    merged.lastRankingSnapshot = cloneValue(base.lastRankingSnapshot);
  }

  if (preserveComparison && base?.comparisonContextLocked) {
    merged.comparisonContextLocked = true;
    if (
      Array.isArray(base.lastComparisonProducts) &&
      base.lastComparisonProducts.length > 0 &&
      (!Array.isArray(merged.lastComparisonProducts) ||
        merged.lastComparisonProducts.length === 0)
    ) {
      merged.lastComparisonProducts = cloneValue(base.lastComparisonProducts);
    }
    merged.lastComparisonQuery =
      merged.lastComparisonQuery || base.lastComparisonQuery || "";
  }

  return merged;
}

/**
 * Audit wrapper — returns flags + ok boolean for tests.
 */
export function auditConversationContinuity(incoming = {}, built = {}) {
  const flags = auditSessionContextRebuild(incoming, built);
  return {
    ok: flags.length === 0,
    flags,
    incomingWinner: incoming?.lastBestProduct?.product_name || null,
    builtWinner: built?.lastBestProduct?.product_name || null,
    incomingSnapshotCount: Array.isArray(incoming?.lastRankingSnapshot)
      ? incoming.lastRankingSnapshot.length
      : 0,
    builtSnapshotCount: Array.isArray(built?.lastRankingSnapshot)
      ? built.lastRankingSnapshot.length
      : 0,
  };
}
