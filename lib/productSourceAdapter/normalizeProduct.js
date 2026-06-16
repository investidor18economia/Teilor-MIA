/**
 * PATCH ProductSourceAdapter V1 — base normalization
 */

import {
  createEmptyNormalizedProduct,
  isNormalizedProductUsable,
  NORMALIZED_PRODUCT_VERSION,
  PRODUCT_SOURCE_IDS,
} from "./normalizedProduct.js";

function stripAccents(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function cleanProductTitle(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[|/\\]+/g, " ")
    .trim();
}

export function normalizeProductNameKey(value = "") {
  return stripAccents(String(value || "").toLowerCase())
    .replace(/[^a-z0-9\s+.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveProductFamilyKey(productName = "") {
  const key = normalizeProductNameKey(productName);
  if (!key) return "";
  return key
    .replace(/\b(de|da|do|para|com|sem|novo|nova|original|usado|usada)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNumericPrice(value = null) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const raw = String(value)
    .replace(/[^\d,.-]/g, "")
    .trim();
  if (!raw) return null;

  let normalized = raw;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatBrlPrice(numericPrice = null) {
  if (numericPrice == null || !Number.isFinite(numericPrice)) return null;
  return `R$ ${numericPrice.toFixed(2).replace(".", ",")}`;
}

function pickFirstString(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

/**
 * Normaliza payload bruto de qualquer provider para NormalizedProduct.
 *
 * @param {Record<string, unknown>} rawProduct
 * @param {{
 *   provider?: string,
 *   source?: string,
 *   query?: string,
 *   categoryHint?: string,
 *   externalId?: string|null,
 *   rawSource?: string|null,
 * }} context
 * @returns {import("./normalizedProduct.js").NormalizedProduct|null}
 */
export function normalizeRawProductBase(rawProduct = {}, context = {}) {
  if (!rawProduct || typeof rawProduct !== "object") return null;

  const provider = String(
    context.provider ||
      rawProduct.provider ||
      rawProduct.source_provider ||
      PRODUCT_SOURCE_IDS.UNKNOWN
  ).trim();

  const productName = cleanProductTitle(
    pickFirstString(
      rawProduct.product_name,
      rawProduct.title,
      rawProduct.name,
      rawProduct.official_name
    )
  );

  if (!productName) return null;

  const numericPrice =
    parseNumericPrice(
      rawProduct.numericPrice ??
        rawProduct.numeric_price ??
        rawProduct.extracted_price ??
        rawProduct.price_amount ??
        rawProduct.price
    ) ?? null;

  const price =
    pickFirstString(rawProduct.price) ||
    formatBrlPrice(numericPrice) ||
    null;

  const link =
    pickFirstString(
      rawProduct.link,
      rawProduct.permalink,
      rawProduct.url,
      rawProduct.product_link,
      rawProduct.detail_page_url
    ) || null;

  const thumbnail =
    pickFirstString(rawProduct.thumbnail, rawProduct.image, rawProduct.picture, rawProduct.img) ||
    null;

  const normalizedName = normalizeProductNameKey(productName);
  const familyKey = deriveProductFamilyKey(productName) || normalizedName;

  const normalized = createEmptyNormalizedProduct({
    product_name: productName,
    normalizedName,
    familyKey,
    price,
    numericPrice,
    currency: String(rawProduct.currency || context.currency || "BRL").trim() || "BRL",
    link,
    thumbnail,
    source: pickFirstString(rawProduct.source, context.source, provider) || provider,
    provider,
    externalId:
      pickFirstString(
        rawProduct.externalId,
        rawProduct.external_id,
        rawProduct.id,
        rawProduct.ASIN,
        rawProduct.asin,
        context.externalId
      ) || null,
    category: pickFirstString(rawProduct.category, context.categoryHint, context.category) || "",
    adapterVersion: NORMALIZED_PRODUCT_VERSION,
    rawSource: context.rawSource || provider,
  });

  return isNormalizedProductUsable(normalized) ? normalized : null;
}

/**
 * @param {unknown[]} rawProducts
 * @param {Parameters<typeof normalizeRawProductBase>[1]} context
 * @param {{ limit?: number }} opts
 */
export function normalizeRawProductsBase(rawProducts = [], context = {}, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? Math.max(1, opts.limit) : 12;
  if (!Array.isArray(rawProducts)) return [];

  const normalized = [];
  for (const raw of rawProducts) {
    const item = normalizeRawProductBase(raw, context);
    if (item) normalized.push(item);
    if (normalized.length >= limit) break;
  }
  return normalized;
}
