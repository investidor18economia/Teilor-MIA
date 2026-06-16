/**
 * PATCH Comercial 1.1 — Google Shopping / SerpAPI adapter
 *
 * Alinha a fonte atual (lib/prices.fetchSerpPrices) ao contrato ProductSourceAdapter V1.
 * Produção continua usando provider legado "serpapi" via fetchGoogleShoppingLegacyResult().
 */

import { fetchSerpPrices } from "../../prices.js";
import {
  ADAPTER_CONTRACT_VERSION,
} from "../adapterContract.js";
import {
  dedupeProducts,
} from "../dedupeProducts.js";
import {
  cleanProductTitle,
  normalizeRawProductBase,
  normalizeRawProductsBase,
} from "../normalizeProduct.js";
import {
  PRODUCT_SOURCE_IDS,
} from "../normalizedProduct.js";

/** Nome do provider no pipeline comercial legado — não alterar em produção. */
export const GOOGLE_SHOPPING_LEGACY_PROVIDER = "serpapi";

export const googleShoppingAdapter = Object.freeze({
  id: PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING,
  displayName: "Google Shopping (SerpAPI)",
  version: ADAPTER_CONTRACT_VERSION,
  enabled: true,
  async fetchProducts({ query = "", limit = 12, categoryHint = "" } = {}) {
    return fetchGoogleShoppingAdapterResult({ query, limit, categoryHint });
  },
  normalizeItem(raw = {}, context = {}) {
    return normalizeRawProductBase(raw, {
      ...context,
      provider: PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING,
      rawSource: GOOGLE_SHOPPING_LEGACY_PROVIDER,
    });
  },
});

export function isLegacyUsableCommercialProduct(product = {}) {
  const title = cleanProductTitle(product?.product_name || "");
  const hasName = title.length >= 4;
  const hasPrice =
    product?.price !== null &&
    product?.price !== undefined &&
    String(product.price).trim() !== "" &&
    !/indispon/i.test(String(product.price));
  const hasLink =
    product?.link &&
    typeof product.link === "string" &&
    product.link.startsWith("http");

  return hasName && hasPrice && hasLink;
}

/**
 * Converte NormalizedProduct para o shape legado usado em chat-gpt4o.js.
 */
export function toLegacyCommercialProduct(normalized = null, legacyProvider = GOOGLE_SHOPPING_LEGACY_PROVIDER) {
  if (!normalized) return null;

  return {
    product_name: normalized.product_name,
    normalizedName: normalized.normalizedName,
    familyKey: normalized.familyKey,
    price: normalized.price,
    numericPrice: normalized.numericPrice,
    link: normalized.link,
    thumbnail: normalized.thumbnail,
    source: normalized.source || legacyProvider,
    provider: legacyProvider,
    category: normalized.category || "",
    trustedSpecs: null,
    scoreEngine: null,
  };
}

export function mapNormalizedProductsToLegacy(products = [], legacyProvider = GOOGLE_SHOPPING_LEGACY_PROVIDER) {
  if (!Array.isArray(products)) return [];

  return products
    .map((product) => toLegacyCommercialProduct(product, legacyProvider))
    .filter(isLegacyUsableCommercialProduct);
}

/**
 * @param {{ query?: string, limit?: number, categoryHint?: string, fetcher?: Function }} input
 */
export async function fetchGoogleShoppingAdapterResult({
  query = "",
  limit = 12,
  categoryHint = "",
  fetcher = fetchSerpPrices,
} = {}) {
  try {
    const rawProducts = await fetcher(query, limit);

    if (!Array.isArray(rawProducts)) {
      return {
        ok: false,
        provider: GOOGLE_SHOPPING_LEGACY_PROVIDER,
        products: [],
        error: "invalid_response",
        count: 0,
      };
    }

    const normalized = normalizeRawProductsBase(
      rawProducts,
      {
        provider: PRODUCT_SOURCE_IDS.GOOGLE_SHOPPING,
        query,
        categoryHint,
        rawSource: GOOGLE_SHOPPING_LEGACY_PROVIDER,
      },
      { limit }
    );

    if (!normalized.length) {
      return {
        ok: false,
        provider: GOOGLE_SHOPPING_LEGACY_PROVIDER,
        products: [],
        error: "rate_limited_or_empty",
        count: 0,
      };
    }

    return {
      ok: true,
      provider: GOOGLE_SHOPPING_LEGACY_PROVIDER,
      products: normalized,
      error: null,
      count: normalized.length,
    };
  } catch (err) {
    return {
      ok: false,
      provider: GOOGLE_SHOPPING_LEGACY_PROVIDER,
      products: [],
      error: err?.response?.status === 429 ? "rate_limited" : "provider_error",
      count: 0,
    };
  }
}

/**
 * Drop-in compatível com fetchFromSerpApiProvider() em chat-gpt4o.js.
 */
export async function fetchGoogleShoppingLegacyResult(query = "", limit = 12, options = {}) {
  const adapterResult = await fetchGoogleShoppingAdapterResult({
    query,
    limit,
    categoryHint: options.categoryHint || "",
    fetcher: options.fetcher || fetchSerpPrices,
  });

  const legacyProducts = mapNormalizedProductsToLegacy(
    adapterResult.products,
    GOOGLE_SHOPPING_LEGACY_PROVIDER
  ).slice(0, limit);

  return {
    provider: GOOGLE_SHOPPING_LEGACY_PROVIDER,
    ok: legacyProducts.length > 0,
    products: legacyProducts,
    error: legacyProducts.length > 0 ? null : adapterResult.error || "rate_limited_or_empty",
  };
}

export function dedupeGoogleShoppingProducts(products = [], limit = 12) {
  return dedupeProducts(products, { limit });
}
