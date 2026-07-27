/**
 * PATCH 4A.9 — Mobile Domain Adapter
 */

import { DOMAIN_ID } from "../../domainKnowledgeContract.js";
import { reasonMobileDomainKnowledge } from "../reasoners/mobileProductReasoner.js";

export const MOBILE_DOMAIN_ADAPTER_VERSION = "4A.9.0";

export const mobileDomainAdapter = {
  id: DOMAIN_ID.MOBILE,
  version: MOBILE_DOMAIN_ADAPTER_VERSION,
  categories: ["mobile", "phone", "celular", "smartphone"],

  resolve(input = {}) {
    const category = String(input.category || "").toLowerCase();
    if (
      this.categories.some((token) => category.includes(token)) ||
      category === "phone"
    ) {
      return true;
    }
    return /\b(celular|smartphone|mobile|iphone|galaxy|redmi|pixel|moto)\b/i.test(
      `${input.productName || ""} ${input.query || ""}`
    );
  },

  enrich(input = {}) {
    const reasoning = reasonMobileDomainKnowledge({
      productName: input.productName,
      query: input.query,
      trustedSpecs: input.trustedSpecs,
    });

    return {
      domain: DOMAIN_ID.MOBILE,
      version: MOBILE_DOMAIN_ADAPTER_VERSION,
      items: reasoning.items,
      matchedRules: reasoning.matchedRules,
      neutral: reasoning.insufficient,
      limitation: reasoning.insufficient
        ? "domínio mobile sem correspondência suficiente — enriquecimento neutro"
        : null,
      meta: {
        usedMarket: reasoning.usedMarket,
        haystackLength: reasoning.haystackLength,
      },
    };
  },
};

export default mobileDomainAdapter;
