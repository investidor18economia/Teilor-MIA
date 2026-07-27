/**
 * PATCH 4A.9 — Default domain adapter (neutral)
 */

import { DOMAIN_ID } from "../domainKnowledgeContract.js";

export const defaultDomainAdapter = {
  id: DOMAIN_ID.DEFAULT,
  version: "4A.9.0",
  categories: [],

  resolve() {
    return true;
  },

  enrich() {
    return {
      domain: DOMAIN_ID.DEFAULT,
      version: "4A.9.0",
      items: [],
      matchedRules: [],
      neutral: true,
      limitation: "sem extensão de domínio registrada — resultado neutro",
      meta: {},
    };
  },
};

export default defaultDomainAdapter;
