/**
 * PATCH ProductSourceAdapter V1 — adapter contract
 */

export const ADAPTER_CONTRACT_VERSION = "1.0.0";

export const ADAPTER_REQUIRED_FIELDS = Object.freeze([
  "id",
  "displayName",
  "version",
  "enabled",
  "fetchProducts",
]);

/**
 * @typedef {Object} ProductSourceFetchResult
 * @property {boolean} ok
 * @property {string} provider
 * @property {unknown[]} products
 * @property {string|null} [error]
 * @property {number} [count]
 */

/**
 * @typedef {Object} ProductSourceAdapter
 * @property {string} id
 * @property {string} displayName
 * @property {string} version
 * @property {boolean} enabled
 * @property {(input: { query: string, limit?: number, categoryHint?: string }) => Promise<ProductSourceFetchResult>} fetchProducts
 * @property {(raw: unknown, context?: Record<string, unknown>) => import("./normalizedProduct.js").NormalizedProduct|null} [normalizeItem]
 */

export function validateProductSourceAdapter(adapter = null) {
  const errors = [];

  if (!adapter || typeof adapter !== "object") {
    return { ok: false, errors: ["adapter_missing"] };
  }

  for (const field of ADAPTER_REQUIRED_FIELDS) {
    if (!(field in adapter)) errors.push(`missing:${field}`);
  }

  if (adapter.id != null && String(adapter.id).trim().length < 2) {
    errors.push("invalid:id");
  }

  if (adapter.fetchProducts != null && typeof adapter.fetchProducts !== "function") {
    errors.push("invalid:fetchProducts");
  }

  if (adapter.normalizeItem != null && typeof adapter.normalizeItem !== "function") {
    errors.push("invalid:normalizeItem");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function createNotIntegratedFetchResult(provider = "unknown") {
  return Object.freeze({
    ok: false,
    provider,
    products: [],
    error: "not_integrated",
    count: 0,
  });
}
