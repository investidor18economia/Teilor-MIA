/**
 * PATCH 8.3 — Safe offer / merchant identity helpers (no PII, no full URLs).
 */

import { createHash } from "node:crypto";
import { normalizeProviderAttemptId } from "./miaProviderIdCatalog.js";

/**
 * @param {unknown} value
 */
export function parseOfferPrice(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (value == null) return null;

  const normalized = String(value)
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * @param {string} [source]
 */
export function normalizeMerchantKeySource(source = "") {
  return String(source || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

/**
 * @param {string} [providerId]
 * @param {string} [source]
 */
export function buildMerchantKey(providerId = "", source = "") {
  const normalizedSource = normalizeMerchantKeySource(source);
  if (!normalizedSource) return null;
  const provider = normalizeProviderAttemptId(providerId || "unknown");
  return createHash("sha256")
    .update(`${provider}|${normalizedSource}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

/**
 * @param {string} [providerId]
 * @param {string} [externalId]
 * @param {string} [source]
 */
export function buildOfferFingerprint(providerId = "", externalId = "", source = "") {
  const provider = normalizeProviderAttemptId(providerId || "unknown");
  const listing = String(externalId || source || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (!listing) return null;
  return createHash("sha256")
    .update(`${provider}|${listing}`, "utf8")
    .digest("hex")
    .slice(0, 20);
}

/**
 * @param {Record<string, unknown>|null|undefined} offer
 */
export function extractOfferProviderId(offer = null) {
  if (!offer || typeof offer !== "object") return null;
  return normalizeProviderAttemptId(
    offer.provider || offer.commercialProvider || offer.source || "unknown"
  );
}

/**
 * @param {Record<string, unknown>|null|undefined} offer
 */
export function isOfferAnalyticallyComplete(offer = null) {
  if (!offer || typeof offer !== "object") return false;
  const hasTitle = !!String(offer.product_name || offer.title || "").trim();
  const hasPrice = parseOfferPrice(offer.price ?? offer.numericPrice) != null;
  const hasSource = !!String(offer.source || offer.store || "").trim();
  const hasLink = !!String(offer.link || offer.url || "").trim();
  const hasProvider = !!extractOfferProviderId(offer);
  return hasTitle && hasPrice && hasSource && hasLink && hasProvider;
}

/**
 * @param {number[]} values
 */
export function computeMedianPrice(values = []) {
  const sorted = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
  }
  return Math.round(sorted[mid] * 100) / 100;
}
