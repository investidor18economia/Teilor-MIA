/**
 * PATCH 4A.9 — Domain Knowledge Contract
 *
 * Shared contract for domain adapters. Core architecture must only import this.
 */

export const DOMAIN_KNOWLEDGE_ADAPTER_VERSION = "4A.9.0";

export const DOMAIN_ID = Object.freeze({
  DEFAULT: "default",
  MOBILE: "mobile",
  NOTEBOOK: "notebook",
});

export const DOMAIN_KNOWLEDGE_TYPE = Object.freeze({
  LINE_POSITIONING: "line_positioning",
  PROCESSOR_ECOSYSTEM: "processor_ecosystem",
  UPDATE_POLICY: "update_policy",
  MARKET_BEHAVIOR: "market_behavior",
  HISTORICAL_PATTERN: "historical_pattern",
  GENERATION_EVOLUTION: "generation_evolution",
  KNOWN_ISSUE: "known_issue",
  VALUE_POSITIONING: "value_positioning",
});

export const DOMAIN_KNOWLEDGE_VALIDITY = Object.freeze({
  STABLE: "stable",
  VERSIONED: "versioned",
  MARKET_DEPENDENT: "market_dependent",
});

export const DOMAIN_KNOWLEDGE_BUCKET = Object.freeze({
  STRENGTH: "strengths",
  WEAKNESS: "weaknesses",
  IDEAL_FOR: "idealFor",
  AVOID_IF: "avoidIf",
  MARKET_NOTE: "marketNotes",
  STRATEGIC_NOTE: "strategicNotes",
  RISK_NOTE: "riskNotes",
});

/**
 * @typedef {Object} DomainKnowledgeItem
 * @property {string} type
 * @property {string} bucket
 * @property {string} text
 * @property {string} origin
 * @property {string} confidence
 * @property {string} validity
 * @property {string[]} limitations
 * @property {string[]} evidence
 * @property {string} domain
 * @property {string} category
 */

/**
 * @param {DomainKnowledgeItem} item
 */
export function validateDomainKnowledgeItem(item = {}) {
  const reasons = [];
  if (!item.type) reasons.push("missing_type");
  if (!item.bucket) reasons.push("missing_bucket");
  if (!item.text) reasons.push("missing_text");
  if (!item.origin) reasons.push("missing_origin");
  if (!item.confidence) reasons.push("missing_confidence");
  if (!item.validity) reasons.push("missing_validity");
  if (!Array.isArray(item.limitations)) reasons.push("missing_limitations");
  if (!item.domain) reasons.push("missing_domain");
  return { valid: reasons.length === 0, reasons };
}

/**
 * @param {DomainKnowledgeItem[]} items
 */
export function domainKnowledgeToTranslatedOverlay(items = []) {
  const overlay = {
    strengths: [],
    weaknesses: [],
    idealFor: [],
    avoidIf: [],
    marketNotes: [],
    strategicNotes: [],
    riskNotes: [],
  };

  for (const item of items) {
    if (!item?.text || !item.bucket) continue;
    const entry = {
      consequence: item.text,
      source: "domain_knowledge",
      domain: item.domain,
      type: item.type,
      origin: item.origin,
      confidence: item.confidence,
      validity: item.validity,
      limitations: item.limitations || [],
      evidence: item.evidence || [],
    };
    if (Array.isArray(overlay[item.bucket])) {
      overlay[item.bucket].push(entry);
    }
  }

  return overlay;
}

export function mergeTranslatedKnowledge(base = {}, overlay = {}) {
  const merged = { ...base };
  for (const [key, list] of Object.entries(overlay)) {
    if (!Array.isArray(list) || !list.length) continue;
    merged[key] = [...(merged[key] || []), ...list];
  }
  return merged;
}
