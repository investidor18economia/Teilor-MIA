/**
 * PATCH 4A.9 — Domain Knowledge Adapter (core orchestrator)
 *
 * Resolves domain extensions and enriches structured pipeline inputs.
 * Never generates user text. Never alters winner/ranking.
 */

import {
  DOMAIN_KNOWLEDGE_ADAPTER_VERSION,
  domainKnowledgeToTranslatedOverlay,
  mergeTranslatedKnowledge,
  validateDomainKnowledgeItem,
} from "./domains/domainKnowledgeContract.js";
import { resolveDomainAdapter } from "./domains/index.js";
import { translateDataLayerFieldsToConsequences } from "./miaConsequenceTranslationLayer.js";

export { DOMAIN_KNOWLEDGE_ADAPTER_VERSION };

/**
 * @param {{
 *   category?: string,
 *   productName?: string,
 *   query?: string,
 *   trustedSpecs?: Record<string, unknown>|null,
 *   structuredDecisionFacts?: Record<string, unknown>|null,
 *   priorityModel?: Record<string, unknown>|null,
 * }} input
 */
export function applyDomainKnowledgeAdapter(input = {}) {
  const adapter = resolveDomainAdapter(input.category || "", {
    productName: input.productName,
    query: input.query,
  });

  const enrichment = adapter.enrich({
    category: input.category,
    productName: input.productName,
    query: input.query,
    trustedSpecs: input.trustedSpecs,
    structuredDecisionFacts: input.structuredDecisionFacts,
    priorityModel: input.priorityModel,
  });

  const validItems = (enrichment.items || []).filter(
    (item) => validateDomainKnowledgeItem(item).valid
  );
  const overlay = domainKnowledgeToTranslatedOverlay(validItems);
  const baseTranslated = input.trustedSpecs
    ? translateDataLayerFieldsToConsequences(input.trustedSpecs)
    : {};
  const mergedTranslatedKnowledge = mergeTranslatedKnowledge(baseTranslated, overlay);

  return {
    version: DOMAIN_KNOWLEDGE_ADAPTER_VERSION,
    domain: enrichment.domain,
    adapterVersion: enrichment.version,
    neutral: enrichment.neutral !== false && validItems.length === 0,
    limitation: enrichment.limitation || null,
    items: validItems,
    matchedRules: enrichment.matchedRules || [],
    translatedKnowledgeOverlay: overlay,
    mergedTranslatedKnowledge,
    enrichedTrustedSpecs: {
      ...(input.trustedSpecs || {}),
      _domainKnowledge: {
        domain: enrichment.domain,
        itemCount: validItems.length,
        matchedRules: enrichment.matchedRules || [],
      },
    },
    meta: enrichment.meta || {},
  };
}

export function domainKnowledgeToTrace(result = null) {
  if (!result) return null;
  return {
    version: result.version || DOMAIN_KNOWLEDGE_ADAPTER_VERSION,
    domain: result.domain,
    adapterVersion: result.adapterVersion,
    neutral: !!result.neutral,
    limitation: result.limitation,
    itemCount: result.items?.length || 0,
    matchedRules: result.matchedRules || [],
    items: (result.items || []).slice(0, 8).map((item) => ({
      type: item.type,
      origin: item.origin,
      confidence: item.confidence,
      validity: item.validity,
      bucket: item.bucket,
    })),
    meta: result.meta || {},
  };
}

/**
 * @param {Record<string, unknown>} sessionContext
 * @param {Record<string, unknown>} input
 */
export function attachDomainKnowledgeToSession(sessionContext = {}, input = {}) {
  const result = applyDomainKnowledgeAdapter({
    category: input.category || sessionContext.lastCategory || "",
    productName: input.productName || sessionContext.lastBestProduct?.product_name || "",
    query: input.query || sessionContext.lastQuery || "",
    trustedSpecs: input.trustedSpecs || sessionContext.lastBestProduct?.trustedSpecs || null,
    priorityModel: input.priorityModel || sessionContext.lastContextualPriorityModel || null,
  });

  return {
    ...sessionContext,
    lastDomainKnowledgeModel: {
      domain: result.domain,
      neutral: result.neutral,
      limitation: result.limitation,
      itemCount: result.items?.length || 0,
      matchedRules: result.matchedRules,
      items: result.items,
    },
    lastDomainKnowledgeTrace: domainKnowledgeToTrace(result),
  };
}

export function validateDomainKnowledgeResult(result = null) {
  const reasons = [];
  if (!result) reasons.push("missing_result");
  if (!result?.domain) reasons.push("missing_domain");
  if (!Array.isArray(result?.items)) reasons.push("missing_items");
  for (const item of result?.items || []) {
    const check = validateDomainKnowledgeItem(item);
    if (!check.valid) reasons.push(...check.reasons.map((r) => `item:${r}`));
  }
  return { valid: reasons.length === 0, reasons };
}
