/**
 * PATCH UX-1 — Read-only preview harness for cognitive loading (zero LLM).
 * Reuses Router + Routing signals already used by the architecture.
 */

import { classifyMiaTurn, isAnchoredShortFollowUpQuery } from "./miaCognitiveRouter.js";
import { buildRoutingDecision } from "./miaRoutingDecisionContract.js";
import { resolveClearNewCommercialSearchForRouting } from "./miaRoutingSafety.js";
import { deriveCognitiveLoadingState, getCognitiveLoadingFallbackState } from "./miaCognitiveLoading.js";

function hasActiveAnchorFromSession(sessionContext = {}) {
  return !!(
    sessionContext?.lastBestProduct?.product_name ||
    sessionContext?.hasAnchor ||
    sessionContext?.winner
  );
}

/**
 * Builds loading state from the same early cognitive/routing stack (read-only).
 */
export function buildCognitiveLoadingPreview({
  text = "",
  sessionContext = {},
  intent = "search",
  contextAction = "search",
} = {}) {
  const query = String(text || "").trim();
  if (!query) {
    return getCognitiveLoadingFallbackState();
  }
  const hasActiveAnchor = hasActiveAnchorFromSession(sessionContext);

  let cognitiveTurn = null;
  try {
    cognitiveTurn = classifyMiaTurn({
      query,
      originalQuery: query,
      resolvedQuery: query,
      sessionContext,
      hasActiveAnchor,
      detectedIntent: intent,
      contextAction,
    });
  } catch {
    cognitiveTurn = null;
  }

  const anchoredShortFollowUp = isAnchoredShortFollowUpQuery(query, { hasActiveAnchor });

  const clearNewSearch = resolveClearNewCommercialSearchForRouting({
    query,
    resolvedQuery: query,
    hasAnchor: hasActiveAnchor,
    looksLikeShortPriorityFollowUp: anchoredShortFollowUp,
    looksLikeAmbiguousFollowUp: false,
    isExplicitComparison: false,
    explicitProductOnlyQuery: false,
    wantsNew: false,
    detectProductCategory: () => sessionContext?.lastCategory || "",
    wantsNewProduct: () => false,
  });

  let routingDecision = null;
  try {
    routingDecision = buildRoutingDecision({
      userMessage: query,
      resolvedQuery: query,
      contextResolution: {
        mode: hasActiveAnchor ? "general_answer" : "general_answer",
        shouldSkipProductSearch: false,
        clearContext: !hasActiveAnchor,
      },
      sessionContext,
      incomingSessionContext: sessionContext,
      intent,
      contextAction,
      cognitiveRoutingSignal: {
        turnType: cognitiveTurn?.turnType || null,
        confidence: cognitiveTurn?.confidence,
        hasActiveAnchor,
        isConstraintChange: !!cognitiveTurn?.signals?.isConstraintChange,
        isAntiRegret: !!cognitiveTurn?.signals?.isAntiRegret,
        isDecisionConfirmation: !!cognitiveTurn?.signals?.isDecisionConfirmation,
        isConfidenceChallenge: !!cognitiveTurn?.signals?.isConfidenceChallenge,
        isAlternativeExploration: !!cognitiveTurn?.signals?.isAlternativeExploration,
        isSecondBestDiscovery: !!cognitiveTurn?.signals?.isSecondBestDiscovery,
        isSocialValidation: !!cognitiveTurn?.signals?.isSocialValidation,
        isSoftDisagreement: !!cognitiveTurn?.signals?.isSoftDisagreement,
        isAcknowledgement: !!cognitiveTurn?.signals?.isAcknowledgement,
        isGreeting: !!cognitiveTurn?.signals?.isGreeting,
        isComprehension: !!cognitiveTurn?.signals?.isComprehension,
        isAnchoredShortFollowUp: !!cognitiveTurn?.signals?.isAnchoredShortFollowUp,
      },
      signals: {
        hasClearNewCommercialSearch: clearNewSearch,
        isContextDecisionOnOriginal: false,
        isProductReferenceOnOriginal: false,
        looksLikeAmbiguousFollowUp: false,
        looksLikeShortPriorityFollowUp: anchoredShortFollowUp,
        isAnchoredShortFollowUp: anchoredShortFollowUp,
        isExplicitComparison: false,
        hasComparisonProducts: false,
        wantsNew: false,
      },
    });
  } catch {
    routingDecision = null;
  }

  return deriveCognitiveLoadingState({
    intent,
    conversationAct: routingDecision?.conversationAct || "",
    turnType: cognitiveTurn?.turnType || "",
    responsePathHint: routingDecision?.responsePathHint || "",
    anchor:
      sessionContext?.lastBestProduct?.product_name ||
      sessionContext?.winner ||
      null,
    budget: sessionContext?.budgetMax || sessionContext?.lastBudget || null,
    vertical: sessionContext?.lastCategory || sessionContext?.category || "",
    seed: query,
  });
}
