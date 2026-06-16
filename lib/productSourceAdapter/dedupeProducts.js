/**
 * PATCH ProductSourceAdapter V1 — dedupe
 */

import { getProductIdentityKey, normalizeProductLink } from "../productIdentity.js";
import { isNormalizedProductUsable } from "./normalizedProduct.js";
import { cleanProductTitle, normalizeProductNameKey } from "./normalizeProduct.js";

function completenessScore(product = {}) {
  let score = String(product.product_name || "").length;
  if (product.thumbnail) score += 20;
  if (product.link) score += 30;
  if (product.price) score += 30;
  if (product.numericPrice != null) score += 10;
  if (product.externalId) score += 5;
  return score;
}

function buildDedupeKey(product = {}) {
  const familyKey =
    product.familyKey ||
    normalizeProductNameKey(cleanProductTitle(product.product_name || ""));

  const linkKey = product.link ? normalizeProductLink(String(product.link)) : "";

  // Alinha com dedupeCommercialProducts: colapsar por família, não por loja/source.
  if (familyKey) return `family:${familyKey}`;
  if (linkKey) return `link:${linkKey}`;

  const identityKey = getProductIdentityKey(product);
  if (identityKey && identityKey !== "||||") return `identity:${identityKey}`;
  return "";
}

/**
 * Remove duplicatas preservando o item mais completo por chave.
 *
 * @param {import("./normalizedProduct.js").NormalizedProduct[]} products
 * @param {{ limit?: number }} opts
 */
export function dedupeProducts(products = [], opts = {}) {
  const limit = Number.isFinite(opts.limit) ? Math.max(1, opts.limit) : 12;
  if (!Array.isArray(products)) return [];

  const seen = new Map();

  for (const product of products) {
    if (!isNormalizedProductUsable(product)) continue;

    const cleanName = cleanProductTitle(product.product_name || "");
    if (!cleanName) continue;

    const candidate = {
      ...product,
      product_name: cleanName,
      familyKey: product.familyKey || normalizeProductNameKey(cleanName),
    };

    const dedupeKey = buildDedupeKey(candidate);
    if (!dedupeKey) continue;

    const existing = seen.get(dedupeKey);
    if (!existing || completenessScore(candidate) > completenessScore(existing)) {
      seen.set(dedupeKey, candidate);
    }
  }

  return Array.from(seen.values()).slice(0, limit);
}
