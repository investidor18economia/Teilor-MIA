/**
 * PATCH 4A.9 — Mobile product reasoner (domain-only)
 */

import { MOBILE_LINE_RULES } from "../knowledge/lineKnowledge.js";
import { MOBILE_PROCESSOR_RULES } from "../knowledge/processorKnowledge.js";
import { MOBILE_UPDATE_POLICY_RULES } from "../knowledge/updatePolicyKnowledge.js";
import { MOBILE_MARKET_RULES } from "../knowledge/marketKnowledge.js";
import { validateDomainKnowledgeItem } from "../../domainKnowledgeContract.js";

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildHaystack(input = {}) {
  return [
    input.productName,
    input.query,
    input.chipset,
    input.processor,
    input.brand,
    input.model,
    ...(input.specTexts || []),
  ]
    .filter(Boolean)
    .join(" ");
}

function detectUsedMarketSignal(haystack = "", trustedSpecs = {}) {
  const text = cleanText(haystack).toLowerCase();
  if (/\b(usado|seminovo|recondicionado|refurb)\b/i.test(text)) return true;
  if (trustedSpecs?.condition === "used") return true;
  if (trustedSpecs?.isUsed === true) return true;
  return false;
}

function matchRuleList(rules = [], haystack = "", options = {}) {
  const matched = [];
  for (const rule of rules) {
    if (rule.usedOnly && !options.usedMarket) continue;
    const pattern = rule.pattern || rule.brandPattern;
    if (!pattern?.test?.(haystack)) continue;
    for (const item of rule.items || []) {
      const validation = validateDomainKnowledgeItem(item);
      if (validation.valid) matched.push(item);
    }
  }
  return matched;
}

function dedupeItems(items = []) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = `${item.origin}:${item.text}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

/**
 * @param {{
 *   productName?: string,
 *   query?: string,
 *   trustedSpecs?: Record<string, unknown>|null,
 * }} input
 */
export function reasonMobileDomainKnowledge(input = {}) {
  const trustedSpecs = input.trustedSpecs || {};
  const haystack = buildHaystack({
    productName: input.productName,
    query: input.query,
    chipset: trustedSpecs.chipset || trustedSpecs.processor || "",
    processor: trustedSpecs.processor || "",
    brand: trustedSpecs.brand || "",
    model: trustedSpecs.model || "",
    specTexts: [
      trustedSpecs.official_name,
      trustedSpecs.marketing_name,
      trustedSpecs.product_line,
    ].filter(Boolean),
  });

  if (!haystack || haystack.length < 3) {
    return { items: [], matchedRules: [], insufficient: true };
  }

  const usedMarket = detectUsedMarketSignal(haystack, trustedSpecs);
  const fromLines = matchRuleList(MOBILE_LINE_RULES, haystack, { usedMarket });
  const fromProcessors = matchRuleList(MOBILE_PROCESSOR_RULES, haystack, { usedMarket });
  const fromUpdates = matchRuleList(MOBILE_UPDATE_POLICY_RULES, haystack, { usedMarket });
  const fromMarket = matchRuleList(MOBILE_MARKET_RULES, haystack, { usedMarket });

  const items = dedupeItems([...fromLines, ...fromProcessors, ...fromUpdates, ...fromMarket]);

  return {
    items,
    matchedRules: items.map((entry) => entry.origin),
    insufficient: items.length === 0,
    usedMarket,
    haystackLength: haystack.length,
  };
}
