/**
 * PATCH 4A.9 — Domain adapter registry
 */

import { DOMAIN_ID } from "./domainKnowledgeContract.js";
import defaultDomainAdapter from "./default/domainAdapter.js";
import mobileDomainAdapter from "./mobile/adapters/mobileDomainAdapter.js";

const REGISTERED_ADAPTERS = Object.freeze([mobileDomainAdapter, defaultDomainAdapter]);

/**
 * @param {string} category
 * @param {{ productName?: string, query?: string }} hints
 */
export function resolveDomainAdapter(category = "", hints = {}) {
  const input = { category, ...hints };
  for (const adapter of REGISTERED_ADAPTERS) {
    if (adapter.id === DOMAIN_ID.DEFAULT) continue;
    if (adapter.resolve(input)) return adapter;
  }
  return defaultDomainAdapter;
}

export function listRegisteredDomainAdapters() {
  return REGISTERED_ADAPTERS.map((adapter) => ({
    id: adapter.id,
    version: adapter.version,
    categories: adapter.categories,
  }));
}

export { defaultDomainAdapter, mobileDomainAdapter };
