/**
 * PATCH 3.2a — Session Context Transport
 *
 * Ensures continuity fields round-trip client → API → client without loss.
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import { pickAuthoritativeLastBestProduct } from "./miaRoutingSafety.js";

export const SESSION_CONTEXT_TRANSPORT_VERSION = "3.2.0";

/** Fields that must survive request/response transport (no parallel memory). */
export const SESSION_CONTEXT_TRANSPORT_FIELDS = Object.freeze([
  "lastBestProduct",
  "lastProductMentioned",
  "lastProducts",
  "lastRankingSnapshot",
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
  "lastWinnerAdvantages",
  "lastWinnerSacrifices",
  "lastSemanticDecisionUnits",
  "lastSemanticSacrificeUnits",
  "lastStructuredDecisionFacts",
  "lastDecisionChange",
  "lastPreviousAxis",
  "lastPreviousPriority",
  "lastComparisonProducts",
  "lastComparisonQuery",
  "comparisonContextLocked",
  "contexts",
  "activeContextKey",
  "activeContextType",
  "activeContextStrength",
  "lastContextualAxis",
  "miaArgumentMemory",
  "lastArgumentMemoryTurn",
  "lastArgumentMemoryPressure",
  "miaBrain",
  "activeMiaRole",
  "budgetMax",
  "lastBudget",
  "lastCommercialConstraints",
  "preferredBrands",
  "excludedBrands",
  "semanticStateProvenance",
  "mixedConversationalState",
  "lastRecommendationDecisionRequestId",
  "lastRecommendationDecisionAtMs",
  "lastRecommendationDecisionSource",
  "lastRecommendationDecisionWinnerFamily",
  "lastRecommendationDecisionRunnerUpFamily",
  "user_display_name",
]);

export const SESSION_CONTEXT_DROP_FLAGS = Object.freeze({
  BUILD_CONTEXT_DROPPED_LAST_BEST: "BUILD_CONTEXT_DROPPED_LAST_BEST",
  BUILD_CONTEXT_DROPPED_RANKING_SNAPSHOT: "BUILD_CONTEXT_DROPPED_RANKING_SNAPSHOT",
  BUILD_CONTEXT_DROPPED_COMPARISON_LOCK: "BUILD_CONTEXT_DROPPED_COMPARISON_LOCK",
  BUILD_CONTEXT_DROPPED_CONSTRAINTS: "BUILD_CONTEXT_DROPPED_CONSTRAINTS",
  RESPONSE_DROPPED_LAST_BEST: "RESPONSE_DROPPED_LAST_BEST",
  RESPONSE_DROPPED_RANKING_SNAPSHOT: "RESPONSE_DROPPED_RANKING_SNAPSHOT",
  REQUEST_SESSION_CONTEXT_MISSING: "REQUEST_SESSION_CONTEXT_MISSING",
});

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasDefined(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return false;
}

function cloneValue(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry));
  if (isPlainObject(value)) {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = cloneValue(entry);
    }
    return next;
  }
  return value;
}

/**
 * Serialize session context for outbound transport (client request or API response).
 */
export function pickSessionContextForTransport(sessionContext = {}) {
  if (!isPlainObject(sessionContext)) return {};
  const out = {};
  for (const field of SESSION_CONTEXT_TRANSPORT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(sessionContext, field)) {
      const value = sessionContext[field];
      if (value !== undefined) {
        out[field] = cloneValue(value);
      }
    }
  }
  return out;
}

/**
 * Merge API response session context into client state without losing continuity fields.
 */
export function mergeSessionContextFromApiResponse(
  previous = {},
  incoming = {},
  { pergunta = "", productsRaw = [] } = {}
) {
  if (isPlainObject(incoming) && Object.keys(incoming).length > 0) {
    const transported = pickSessionContextForTransport(incoming);
    return {
      ...pickSessionContextForTransport(previous),
      ...transported,
    };
  }

  const prev = pickSessionContextForTransport(previous);
  const detectedPriority = String(pergunta || "").trim()
    ? detectPriorityFromTextFallback(pergunta)
    : "";

  return {
    ...prev,
    lastQuery: pergunta || prev.lastQuery || "",
    lastPriority: detectedPriority || prev.lastPriority || "",
    lastProducts:
      Array.isArray(productsRaw) && productsRaw.length > 0
        ? productsRaw
        : prev.lastProducts,
    lastBestProduct:
      Array.isArray(productsRaw) && productsRaw.length > 0
        ? productsRaw[0]
        : prev.lastBestProduct,
    lastInteractionType:
      Array.isArray(productsRaw) && productsRaw.length > 0
        ? "search"
        : prev.lastInteractionType || "",
  };
}

function detectPriorityFromTextFallback(text = "") {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\bbateria\b/.test(normalized)) return "bateria";
  if (/\bcamera\b|\bcâmera\b/.test(normalized)) return "camera";
  if (/\bdesempenho\b|\bperformance\b/.test(normalized)) return "desempenho";
  if (/\bpreco\b|\bpreço\b|\bcusto\b|\bbarato\b/.test(normalized)) return "preco";
  return "";
}

/**
 * Audit rebuild: detect continuity drops between incoming request and built context.
 */
export function auditSessionContextRebuild(incoming = {}, built = {}) {
  const flags = [];

  if (!isPlainObject(incoming) || Object.keys(incoming).length === 0) {
    flags.push(SESSION_CONTEXT_DROP_FLAGS.REQUEST_SESSION_CONTEXT_MISSING);
    return flags;
  }

  const reqBest = incoming?.lastBestProduct?.product_name || null;
  const builtBest = built?.lastBestProduct?.product_name || null;
  if (reqBest && !builtBest) {
    flags.push(SESSION_CONTEXT_DROP_FLAGS.BUILD_CONTEXT_DROPPED_LAST_BEST);
  }

  const reqSnap = Array.isArray(incoming?.lastRankingSnapshot)
    ? incoming.lastRankingSnapshot.length
    : 0;
  const builtSnap = Array.isArray(built?.lastRankingSnapshot)
    ? built.lastRankingSnapshot.length
    : 0;
  if (reqSnap > 0 && builtSnap === 0) {
    flags.push(SESSION_CONTEXT_DROP_FLAGS.BUILD_CONTEXT_DROPPED_RANKING_SNAPSHOT);
  }

  if (incoming?.comparisonContextLocked && !built?.comparisonContextLocked) {
    flags.push(SESSION_CONTEXT_DROP_FLAGS.BUILD_CONTEXT_DROPPED_COMPARISON_LOCK);
  }

  const reqConstraints = incoming?.lastCommercialConstraints;
  const builtConstraints = built?.lastCommercialConstraints;
  if (
    hasDefined(reqConstraints) &&
    !hasDefined(builtConstraints) &&
    (incoming?.budgetMax != null || incoming?.lastBudget != null)
  ) {
    flags.push(SESSION_CONTEXT_DROP_FLAGS.BUILD_CONTEXT_DROPPED_CONSTRAINTS);
  }

  return flags;
}

/**
 * Audit response transport: ensure response did not drop incoming continuity.
 */
export function auditSessionContextResponse(incoming = {}, response = {}, routingDecision = {}) {
  const flags = [];
  const rd = routingDecision || {};

  if (!rd.shouldPreserveAnchor || rd.allowReplaceWinner) {
    return flags;
  }

  const reqBest = incoming?.lastBestProduct?.product_name || null;
  const respBest = response?.lastBestProduct?.product_name || null;
  if (reqBest && !respBest) {
    flags.push(SESSION_CONTEXT_DROP_FLAGS.RESPONSE_DROPPED_LAST_BEST);
  }

  const reqSnap = Array.isArray(incoming?.lastRankingSnapshot)
    ? incoming.lastRankingSnapshot.length
    : 0;
  const respSnap = Array.isArray(response?.lastRankingSnapshot)
    ? response.lastRankingSnapshot.length
    : 0;
  if (reqSnap > 0 && respSnap === 0) {
    flags.push(SESSION_CONTEXT_DROP_FLAGS.RESPONSE_DROPPED_RANKING_SNAPSHOT);
  }

  return flags;
}

/**
 * Finalize response session_context — restore dropped continuity when anchor must be preserved.
 */
export function finalizeSessionContextTransport(
  responseContext = {},
  incomingContext = {},
  routingDecision = {}
) {
  const out = {
    ...pickSessionContextForTransport(incomingContext),
    ...pickSessionContextForTransport(responseContext),
  };
  const rd = routingDecision || {};

  if (rd.shouldPreserveAnchor && !rd.allowReplaceWinner) {
    const anchor = pickAuthoritativeLastBestProduct(
      responseContext?.lastBestProduct ||
        incomingContext?.lastBestProduct,
      out.lastProducts
    );
    if (anchor?.product_name) {
      out.lastBestProduct = anchor;
      out.lastProductMentioned =
        anchor.product_name || out.lastProductMentioned || "";
    }

    if (
      Array.isArray(incomingContext?.lastRankingSnapshot) &&
      incomingContext.lastRankingSnapshot.length > 0 &&
      (!Array.isArray(out.lastRankingSnapshot) || out.lastRankingSnapshot.length === 0)
    ) {
      out.lastRankingSnapshot = cloneValue(incomingContext.lastRankingSnapshot);
    }

    if (incomingContext?.comparisonContextLocked && !out.comparisonContextLocked) {
      out.comparisonContextLocked = true;
      if (
        Array.isArray(incomingContext.lastComparisonProducts) &&
        incomingContext.lastComparisonProducts.length > 0
      ) {
        out.lastComparisonProducts = cloneValue(incomingContext.lastComparisonProducts);
      }
      out.lastComparisonQuery =
        out.lastComparisonQuery || incomingContext.lastComparisonQuery || "";
    }
  }

  return out;
}
