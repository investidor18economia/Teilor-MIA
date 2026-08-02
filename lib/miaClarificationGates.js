/**
 * PATCH 3.4a — Clarification Gates
 *
 * Decisão determinística sobre quando pedir esclarecimentos.
 * Executa antes da decisão cognitiva principal.
 *
 * MIA owns the intelligence. The LLM only verbalizes.
 */

import { extractBudget } from "./miaRoutingSafety.js";
import {
  isDirectComparisonQuery,
  extractComparisonTermsFromQuery,
} from "./miaComparisonFlowCrashGuard.js";
import {
  extractProductMentionFromQuery,
  resolveProductIdentityFromQuery,
  detectImplicitProductEvaluationQuery,
} from "./miaProductIdentityResolution.js";
import { isGenericProductSearchQuery } from "./miaSpecificProductResolutionLock.js";
import { detectActiveCommercialAsk } from "./miaIntentRecognitionLayer.js";
import { resolveConversationalFillerInCommercialContext } from "./miaConversationalFillerGovernance.js";
import { isConstraintChangeFamilyQuery, isCommercialProductPreferenceChallengeQuery } from "./miaCognitiveRouter.js";
import { isSpecificProductEvaluationQuery } from "./miaProductIdentityResolution.js";
import { isGovernedSocialContractBlocksClarification, isGovernedAmbiguousSocialContract } from "./miaSemanticAuthority.js";

export const CLARIFICATION_GATES_VERSION = "3.4a.1";

export const CLARIFICATION_ROUTING = Object.freeze({
  PROCEED: "proceed",
  ASK: "ask",
  DEFER: "defer",
});

export const CLARIFICATION_MISSING_SLOTS = Object.freeze({
  PRODUCT: "product",
  CATEGORY: "category",
  BUDGET: "budget",
  USE_CASE: "use_case",
  REFERENCE: "reference",
  INTENT: "intent",
});

const USE_CASE_PATTERN =
  /\b(para|pra)\s+(jogos|jogo|trabalho|estudo|estudar|editar|edição|edicao|fotos?|fotograf\w*|minha mae|minha mãe|programar|programação|programacao|render|video|vídeo|design|uso basico|uso básico)\b/i;

const PRIORITY_PATTERN =
  /\b(bateria|autonomia|camera|câmera|cam|desempenho|performance|tela|memoria|memória|barato|economico|econômico|custo beneficio|custo-beneficio|premium|compacto|leve|resistente)\b/i;

const VAGUE_QUALITY_PATTERN =
  /\b(algo bom|algo legal|algo confiavel|algo confiável|algo decente|comprar algo|quero algo|preciso de algo)\b/i;

const BARE_CATEGORY_WANT_PATTERN =
  /\bquero\s+(?:um|uma)\s+(celular|smartphone|notebook|laptop|tv|monitor|fone|geladeira|tablet)\b/i;

const SEARCH_VERB_PATTERN =
  /\b(quero|preciso|procuro|busco|buscar|procurar|me indica|recomend\w*|indica\w*)\b/i;

function detectProductCategoryFromQuery(text = "") {
  const q = normalizeQuery(text);
  if (/celular|smartphone|iphone|samsung|xiaomi|motorola|galaxy|redmi|realme/.test(q)) {
    return "phone";
  }
  if (/notebook|laptop|macbook|chromebook/.test(q)) {
    return "notebook";
  }
  if (/pc gamer|computador|desktop/.test(q)) {
    return "computer";
  }
  if (/tv|televis|smart tv/.test(q)) {
    return "tv";
  }
  if (/monitor/.test(q)) {
    return "monitor";
  }
  if (/fone|headset|earbud|airpods/.test(q)) {
    return "audio";
  }
  if (/geladeira|frigerador|freezer/.test(q)) {
    return "fridge";
  }
  return "";
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeQuery(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryMentionsSpecificModel(query = "") {
  const mention = extractProductMentionFromQuery(query);
  const identity = resolveProductIdentityFromQuery(mention || query);
  return (
    identity.resolvedFrom === "variant_rule" ||
    /\b[a-z]{1,6}\d{1,3}[a-z]{0,4}\b/i.test(normalizeQuery(query))
  );
}

/**
 * Known context slots from query + session.
 */
export function evaluateClarificationPreconditions({
  query = "",
  resolvedQuery = "",
  sessionContext = {},
} = {}) {
  const raw = cleanText(query);
  const resolved = cleanText(resolvedQuery || query);
  const qNorm = normalizeQuery(resolved || raw);

  const budgetFromQuery = extractBudget(raw) ?? extractBudget(resolved);
  const budgetFromSession =
    sessionContext?.budgetMax ??
    sessionContext?.lastBudget ??
    sessionContext?.lastCommercialConstraints?.budgetMax ??
    null;
  const budget = budgetFromQuery ?? budgetFromSession;

  const categoryFromQuery =
    detectProductCategoryFromQuery(raw) || detectProductCategoryFromQuery(resolved) || "";
  const categoryFromSession =
    sessionContext?.lastCategory ||
    sessionContext?.lastCommercialConstraints?.category ||
    "";
  const category = categoryFromQuery || categoryFromSession;

  const productMention = extractProductMentionFromQuery(raw);
  const productIdentity = resolveProductIdentityFromQuery(productMention || raw);
  const productFromSession =
    sessionContext?.lastBestProduct?.product_name ||
    sessionContext?.lastProductMentioned ||
    "";

  const comparisonTerms = extractComparisonTermsFromQuery(raw);
  const isComparison =
    isDirectComparisonQuery(raw) ||
    isDirectComparisonQuery(resolved) ||
    comparisonTerms.length >= 2;

  const hasUseCase =
    USE_CASE_PATTERN.test(qNorm) ||
    PRIORITY_PATTERN.test(qNorm) ||
    detectImplicitProductEvaluationQuery(raw);

  const hasActiveAnchor = !!(
    sessionContext?.lastBestProduct?.product_name ||
    productFromSession
  );

  const hasCommercialAsk = detectActiveCommercialAsk(raw);
  const hasSpecificProduct =
    queryMentionsSpecificModel(raw) ||
    queryMentionsSpecificModel(resolved) ||
    productIdentity.resolvedFrom === "variant_rule";

  return {
    query: raw,
    resolvedQuery: resolved,
    budget,
    budgetFromQuery,
    budgetFromSession,
    category,
    categoryFromQuery,
    categoryFromSession,
    productMention,
    productIdentity,
    productFromSession,
    comparisonTerms,
    isComparison,
    hasUseCase,
    hasActiveAnchor,
    hasCommercialAsk,
    hasSpecificProduct,
    isEmpty: !raw,
    isVagueGeneric: VAGUE_QUALITY_PATTERN.test(qNorm) && !categoryFromQuery,
    isCategoryOnlyVague:
      !!categoryFromQuery &&
      !budgetFromQuery &&
      !hasUseCase &&
      !hasSpecificProduct &&
      !isComparison &&
      (BARE_CATEGORY_WANT_PATTERN.test(raw) || VAGUE_QUALITY_PATTERN.test(qNorm)) &&
      isGenericProductSearchQuery(raw),
  };
}

function pickMissingSlots(preconditions = {}, options = {}) {
  const missing = [];
  const {
    requiresClarification = false,
    interactionMode = "",
    reasonCodes = [],
  } = options;

  if (preconditions.isEmpty) {
    missing.push(CLARIFICATION_MISSING_SLOTS.PRODUCT);
    return missing;
  }

  if (preconditions.isComparison && preconditions.comparisonTerms.length >= 2) {
    return missing;
  }

  if (preconditions.hasSpecificProduct) {
    if (!preconditions.hasUseCase && !preconditions.budget && !preconditions.hasActiveAnchor) {
      // Optional soft gap — do not force clarification when product is explicit.
    }
    return missing;
  }

  if (preconditions.isVagueGeneric || reasonCodes.includes("short_incomplete_message_without_context")) {
    if (!preconditions.hasCommercialAsk) {
      missing.push(CLARIFICATION_MISSING_SLOTS.INTENT);
      return missing;
    }
    missing.push(CLARIFICATION_MISSING_SLOTS.CATEGORY);
    return missing;
  }

  if (
    preconditions.isCategoryOnlyVague ||
    (preconditions.categoryFromQuery &&
      !preconditions.budgetFromQuery &&
      !preconditions.hasUseCase &&
      preconditions.hasCommercialAsk &&
      !preconditions.isComparison)
  ) {
    if (!preconditions.budget) missing.push(CLARIFICATION_MISSING_SLOTS.BUDGET);
    if (!preconditions.hasUseCase) missing.push(CLARIFICATION_MISSING_SLOTS.USE_CASE);
    return missing.slice(0, 1);
  }

  if (
    requiresClarification &&
    interactionMode === "clarification" &&
    preconditions.hasActiveAnchor
  ) {
    missing.push(CLARIFICATION_MISSING_SLOTS.REFERENCE);
    return missing;
  }

  if (
    requiresClarification &&
    interactionMode === "clarification" &&
    !preconditions.hasActiveAnchor &&
    !preconditions.hasCommercialAsk
  ) {
    missing.push(CLARIFICATION_MISSING_SLOTS.INTENT);
    return missing;
  }

  if (
    preconditions.category &&
    preconditions.hasUseCase &&
    !preconditions.budget &&
    preconditions.hasCommercialAsk &&
    !preconditions.isComparison &&
    !preconditions.hasActiveAnchor
  ) {
    missing.push(CLARIFICATION_MISSING_SLOTS.BUDGET);
    return missing;
  }

  return missing;
}

export function buildClarificationMessage(missingSlots = [], preconditions = {}) {
  const slots = Array.isArray(missingSlots) ? missingSlots : [];
  if (!slots.length) return "";

  if (slots.includes(CLARIFICATION_MISSING_SLOTS.PRODUCT)) {
    return "Me fala o produto que você quer procurar que eu já te ajudo.";
  }

  if (slots.includes(CLARIFICATION_MISSING_SLOTS.CATEGORY)) {
    return "Me conta o que você está buscando — celular, notebook ou outro produto — que eu te ajudo a decidir.";
  }

  if (slots.includes(CLARIFICATION_MISSING_SLOTS.REFERENCE)) {
    return "Entendi. Me diz rapidinho de qual produto você está falando, que eu te respondo com segurança.";
  }

  if (slots.includes(CLARIFICATION_MISSING_SLOTS.INTENT)) {
    if (!preconditions.hasCommercialAsk) {
      return "Me diz rapidinho a que você se refere.";
    }
    return "Me explica um pouco melhor o que você quer analisar ou comparar, que eu te ajudo.";
  }

  if (slots.includes(CLARIFICATION_MISSING_SLOTS.BUDGET)) {
    const categoryLabel = preconditions.category || "produto";
    if (preconditions.hasUseCase) {
      return `Entendi o uso. Qual faixa de preço você quer considerar para esse ${categoryLabel}?`;
    }
    return `Qual faixa de preço ou prioridade você quer considerar para esse ${categoryLabel}?`;
  }

  if (slots.includes(CLARIFICATION_MISSING_SLOTS.USE_CASE)) {
    const categoryLabel = preconditions.category || "produto";
    if (preconditions.budget) {
      return `Beleza. Pra esse ${categoryLabel}, o uso principal seria trabalho, estudo, jogos ou outro?`;
    }
    return `Me conta o uso principal desse ${categoryLabel} — trabalho, estudo, jogos ou dia a dia.`;
  }

  return "Me conta um pouco mais do que você precisa que eu te ajudo.";
}

/**
 * Core gate — should we ask for clarification?
 */
export function needsClarification(input = {}) {
  return resolveClarificationDecision(input).needsClarification;
}

/**
 * Full clarification decision contract.
 */
export function resolveClarificationDecision(input = {}) {
  const preconditions = evaluateClarificationPreconditions(input);
  const {
    contextResolution = {},
    intentRecognition = null,
    forceComparisonLock = false,
    preserveGuideDirectReply = false,
    socialBehaviorContract = null,
  } = input;

  if (
    socialBehaviorContract &&
    isGovernedAmbiguousSocialContract(
      socialBehaviorContract,
      socialBehaviorContract.semanticTargetResolution
    )
  ) {
    return gateResult(
      false,
      CLARIFICATION_ROUTING.PROCEED,
      [],
      preconditions,
      "ambiguous_social_contract_deferred_to_governed_policy"
    );
  }

  if (
    socialBehaviorContract &&
    isGovernedSocialContractBlocksClarification(
      socialBehaviorContract,
      socialBehaviorContract.semanticTargetResolution
    )
  ) {
    return gateResult(
      false,
      CLARIFICATION_ROUTING.PROCEED,
      [],
      preconditions,
      "governed_social_contract_blocks_clarification"
    );
  }

  const reasonCodes = [];
  const interactionMode = intentRecognition?.interactionMode || "";
  const requiresRecognitionClarify = !!intentRecognition?.requiresClarification;

  const fillerResolution = resolveConversationalFillerInCommercialContext({
    message: preconditions.query || input.query || "",
    sessionContext: input.sessionContext || {},
    conversationMessages: input.conversationMessages || [],
    hasActiveAnchor: preconditions.hasActiveAnchor,
  });
  if (fillerResolution.blocksClarification) {
    return gateResult(
      false,
      CLARIFICATION_ROUTING.PROCEED,
      [],
      preconditions,
      fillerResolution.reasonCode || "filler_blocks_clarification"
    );
  }

  if (forceComparisonLock || contextResolution?.lockedComparisonFollowUp) {
    return gateResult(false, CLARIFICATION_ROUTING.PROCEED, [], preconditions, "comparison_lock");
  }

  if (preserveGuideDirectReply && contextResolution?.directReply) {
    return gateResult(false, CLARIFICATION_ROUTING.DEFER, [], preconditions, "guide_direct_reply");
  }

  if (preconditions.isEmpty) {
    reasonCodes.push("empty_query");
    const missingSlots = pickMissingSlots(preconditions);
    return gateResult(true, CLARIFICATION_ROUTING.ASK, missingSlots, preconditions, reasonCodes);
  }

  if (preconditions.isComparison && preconditions.comparisonTerms.length >= 2) {
    return gateResult(false, CLARIFICATION_ROUTING.PROCEED, [], preconditions, "comparison_resolved");
  }

  const queryText = preconditions.query || input.query || "";
  if (
    isConstraintChangeFamilyQuery(queryText) ||
    isCommercialProductPreferenceChallengeQuery(queryText) ||
    isSpecificProductEvaluationQuery(queryText)
  ) {
    return gateResult(
      false,
      CLARIFICATION_ROUTING.PROCEED,
      [],
      preconditions,
      isSpecificProductEvaluationQuery(queryText)
        ? "specific_product_evaluation"
        : "preference_or_constraint_update"
    );
  }

  if (preconditions.hasSpecificProduct && (preconditions.hasCommercialAsk || preconditions.budget)) {
    return gateResult(false, CLARIFICATION_ROUTING.PROCEED, [], preconditions, "specific_product_sufficient");
  }

  if (preconditions.budgetFromQuery && preconditions.categoryFromQuery) {
    return gateResult(false, CLARIFICATION_ROUTING.PROCEED, [], preconditions, "category_and_budget_present");
  }

  if (preconditions.budget && preconditions.category && preconditions.hasActiveAnchor) {
    return gateResult(false, CLARIFICATION_ROUTING.PROCEED, [], preconditions, "session_context_sufficient");
  }

  if (contextResolution?.needsClarification === true && !contextResolution?.directReply) {
    if (
      socialBehaviorContract &&
      isGovernedSocialContractBlocksClarification(
        socialBehaviorContract,
        socialBehaviorContract.semanticTargetResolution
      )
    ) {
      return gateResult(
        false,
        CLARIFICATION_ROUTING.PROCEED,
        [],
        preconditions,
        "governed_social_contract_blocks_clarification"
      );
    }

    reasonCodes.push("legacy_context_needs_clarification");
    const missingSlots =
      pickMissingSlots(preconditions, {
        requiresClarification: true,
        interactionMode,
        reasonCodes: intentRecognition?.reasons || [],
      }) || [CLARIFICATION_MISSING_SLOTS.REFERENCE];
    return gateResult(true, CLARIFICATION_ROUTING.ASK, missingSlots, preconditions, reasonCodes);
  }

  if (requiresRecognitionClarify || interactionMode === "clarification") {
    if (
      socialBehaviorContract &&
      isGovernedSocialContractBlocksClarification(
        socialBehaviorContract,
        socialBehaviorContract.semanticTargetResolution
      )
    ) {
      return gateResult(
        false,
        CLARIFICATION_ROUTING.PROCEED,
        [],
        preconditions,
        "governed_social_contract_blocks_clarification"
      );
    }

    reasonCodes.push("intent_recognition_requires_clarification");
    const missingSlots = pickMissingSlots(preconditions, {
      requiresClarification: true,
      interactionMode,
      reasonCodes: intentRecognition?.reasons || [],
    });
    if (missingSlots.length) {
      return gateResult(true, CLARIFICATION_ROUTING.ASK, missingSlots, preconditions, reasonCodes);
    }
  }

  if (preconditions.isCategoryOnlyVague) {
    reasonCodes.push("category_only_vague_commercial");
    const missingSlots = pickMissingSlots(preconditions);
    return gateResult(true, CLARIFICATION_ROUTING.ASK, missingSlots, preconditions, reasonCodes);
  }

  if (preconditions.isVagueGeneric) {
    reasonCodes.push("vague_generic_without_category");
    const missingSlots = pickMissingSlots(preconditions);
    return gateResult(true, CLARIFICATION_ROUTING.ASK, missingSlots, preconditions, reasonCodes);
  }

  if (
    preconditions.category &&
    preconditions.hasUseCase &&
    !preconditions.budget &&
    preconditions.hasCommercialAsk &&
    !preconditions.hasActiveAnchor
  ) {
    reasonCodes.push("missing_budget_with_use_case");
    const missingSlots = [CLARIFICATION_MISSING_SLOTS.BUDGET];
    return gateResult(true, CLARIFICATION_ROUTING.ASK, missingSlots, preconditions, reasonCodes);
  }

  return gateResult(false, CLARIFICATION_ROUTING.PROCEED, [], preconditions, "context_sufficient");
}

function gateResult(needsClarification, routing, missingSlots, preconditions, reasonCodes) {
  const codes = Array.isArray(reasonCodes)
    ? reasonCodes
    : reasonCodes
      ? [String(reasonCodes)]
      : [];
  const message = needsClarification
    ? buildClarificationMessage(missingSlots, preconditions)
    : "";

  return {
    version: CLARIFICATION_GATES_VERSION,
    needsClarification,
    routing,
    missingSlots,
    reasonCodes: codes,
    clarificationMessage: message,
    preconditions,
  };
}

export function resolveClarificationRouting(input = {}) {
  return resolveClarificationDecision(input).routing;
}

/**
 * Apply gate to legacy contextResolution without breaking guide modes.
 */
export function applyClarificationGateToContextResolution(
  contextResolution = {},
  input = {}
) {
  const preserveGuideDirectReply = [
    "budget_guide",
    "regret_fear_guide",
    "brand_rejection_guide",
    "guidance_needed",
  ].includes(String(contextResolution?.mode || ""));

  const decision = resolveClarificationDecision({
    ...input,
    contextResolution,
    preserveGuideDirectReply,
    forceComparisonLock:
      input.forceComparisonLock ||
      contextResolution?.lockedComparisonFollowUp ||
      contextResolution?.mode === "comparison_context_lock",
    socialBehaviorContract: input.socialBehaviorContract || null,
  });

  if (preserveGuideDirectReply && contextResolution?.directReply) {
    return {
      contextResolution: {
        ...contextResolution,
        needsClarification: false,
      },
      decision,
      applied: false,
      reasonCode: "guide_mode_preserved",
    };
  }

  if (!decision.needsClarification) {
    return {
      contextResolution: {
        ...contextResolution,
        needsClarification: false,
      },
      decision,
      applied: true,
      reasonCode: "clarification_not_required",
    };
  }

  return {
    contextResolution: {
      ...contextResolution,
      needsClarification: true,
      shouldSkipProductSearch: true,
      directReply: null,
      clarificationMessage:
        decision.clarificationMessage ||
        contextResolution?.clarificationMessage ||
        buildClarificationMessage(decision.missingSlots, decision.preconditions),
      mode: contextResolution?.mode === "empty" ? "empty" : "clarification_gate",
    },
    decision,
    applied: true,
    reasonCode: decision.reasonCodes[0] || "clarification_required",
  };
}

/**
 * Prevent commercial reconciliation from suppressing an active clarification gate.
 */
export function reconcileClarificationWithCommercialEntry({
  clarificationDecision = null,
  commercialPatch = null,
} = {}) {
  if (!clarificationDecision?.needsClarification) {
    return commercialPatch;
  }

  if (!commercialPatch) {
    return {
      needsClarification: true,
      shouldSkipProductSearch: true,
      clarificationMessage: clarificationDecision.clarificationMessage,
      mode: "clarification_gate",
    };
  }

  if (commercialPatch.shouldSkipProductSearch === false) {
    if (clarificationDecision.preconditions?.isCategoryOnlyVague) {
      return {
        ...commercialPatch,
        needsClarification: true,
        shouldSkipProductSearch: true,
        clarificationMessage: clarificationDecision.clarificationMessage,
        directReply: null,
      };
    }
    return {
      ...commercialPatch,
      needsClarification: false,
    };
  }

  return {
    ...commercialPatch,
    needsClarification: true,
    shouldSkipProductSearch: true,
    clarificationMessage:
      clarificationDecision.clarificationMessage || commercialPatch.clarificationMessage,
    directReply: null,
  };
}
