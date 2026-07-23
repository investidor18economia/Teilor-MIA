/**
 * PATCH 8.3 — Offer set classification (observational only).
 */

import {
  MIA_COMMERCIAL_SEARCH_PATHS,
} from "./miaCommercialSearchCatalog.js";
import {
  MIA_OFFER_PIPELINE_STATUSES,
  MIA_OFFER_SET_SEARCH_PATHS,
  MIA_OFFER_TERMINATION_STAGES,
} from "./miaOfferSetCatalog.js";
import { parseOfferPrice } from "./miaOfferIdentity.js";

/**
 * @param {string} [commercialSearchPath]
 * @param {{ fallbackUsed?: boolean, dataLayerUsedAsPrimarySource?: boolean, providerContinuationRequired?: boolean }} [hints]
 */
export function resolveOfferSetSearchPath(commercialSearchPath = "", hints = {}) {
  const path = String(commercialSearchPath || "").trim();
  if (path === MIA_COMMERCIAL_SEARCH_PATHS.DATA_LAYER_ONLY) {
    return MIA_OFFER_SET_SEARCH_PATHS.DATA_LAYER_ONLY;
  }
  if (path === MIA_COMMERCIAL_SEARCH_PATHS.PROVIDER_ONLY) {
    return MIA_OFFER_SET_SEARCH_PATHS.PROVIDER_ONLY;
  }
  if (path === MIA_COMMERCIAL_SEARCH_PATHS.DATA_LAYER_THEN_PROVIDER) {
    return MIA_OFFER_SET_SEARCH_PATHS.HYBRID;
  }
  if (hints.fallbackUsed === true) {
    return MIA_OFFER_SET_SEARCH_PATHS.FALLBACK;
  }
  if (hints.providerContinuationRequired && hints.dataLayerUsedAsPrimarySource) {
    return MIA_OFFER_SET_SEARCH_PATHS.HYBRID;
  }
  return MIA_OFFER_SET_SEARCH_PATHS.UNKNOWN;
}

/**
 * @param {{
 *   pipelineReached?: boolean,
 *   deliveredOffersCount?: number,
 *   selectedOffersCount?: number,
 *   rankedOffersCount?: number,
 *   failed?: boolean,
 * }} input
 */
export function resolveOfferPipelineStatus(input = {}) {
  if (!input.pipelineReached) return MIA_OFFER_PIPELINE_STATUSES.NOT_EXECUTED;
  if (input.failed) return MIA_OFFER_PIPELINE_STATUSES.FAILED;

  const delivered = Math.max(0, Number(input.deliveredOffersCount) || 0);
  const selected = Math.max(0, Number(input.selectedOffersCount) || 0);
  const ranked = Math.max(0, Number(input.rankedOffersCount) || 0);

  if (delivered > 0 && delivered >= selected) {
    return MIA_OFFER_PIPELINE_STATUSES.SUCCESS;
  }
  if (delivered > 0 && selected > delivered) {
    return MIA_OFFER_PIPELINE_STATUSES.PARTIAL;
  }
  if (delivered === 0 && (ranked > 0 || selected > 0)) {
    return MIA_OFFER_PIPELINE_STATUSES.PARTIAL;
  }
  if (delivered === 0 && input.pipelineReached) {
    return MIA_OFFER_PIPELINE_STATUSES.EMPTY;
  }
  return MIA_OFFER_PIPELINE_STATUSES.UNKNOWN;
}

/**
 * @param {{
 *   deliveredOffersCount?: number,
 *   selectedOffersCount?: number,
 *   rankedOffersCount?: number,
 *   deduplicatedOffersCount?: number,
 *   normalizedOffersCount?: number,
 *   rawOffersCount?: number,
 *   failed?: boolean,
 *   pipelineReached?: boolean,
 * }} tracker
 */
export function resolveOfferTerminationStage(tracker = {}) {
  if (!tracker.pipelineReached) return MIA_OFFER_TERMINATION_STAGES.NOT_APPLICABLE;
  if (tracker.failed) return MIA_OFFER_TERMINATION_STAGES.UNKNOWN;

  const delivered = Number(tracker.deliveredOffersCount) || 0;
  if (delivered > 0) return MIA_OFFER_TERMINATION_STAGES.DELIVERY;

  const selected = Number(tracker.selectedOffersCount) || 0;
  if (selected > 0) return MIA_OFFER_TERMINATION_STAGES.SELECTION;

  const ranked = Number(tracker.rankedOffersCount) || 0;
  if (ranked > 0) return MIA_OFFER_TERMINATION_STAGES.RANKING;

  const deduped = Number(tracker.deduplicatedOffersCount) || 0;
  if (deduped > 0 || (Number(tracker.removedDuplicateCount) || 0) > 0) {
    return MIA_OFFER_TERMINATION_STAGES.DEDUP;
  }

  const merged = Number(tracker.mergedOffersCount) || 0;
  if (merged > 0) return MIA_OFFER_TERMINATION_STAGES.MERGE;

  const normalized = Number(tracker.normalizedOffersCount) || 0;
  if (normalized > 0) return MIA_OFFER_TERMINATION_STAGES.NORMALIZATION;

  const raw = Number(tracker.rawOffersCount) || 0;
  if (raw > 0) return MIA_OFFER_TERMINATION_STAGES.RAW;

  return MIA_OFFER_TERMINATION_STAGES.UNKNOWN;
}

/**
 * @param {Array<Record<string, unknown>>} [offers]
 */
export function computeOfferPriceAggregates(offers = []) {
  const prices = [];
  for (const offer of offers) {
    const price = parseOfferPrice(offer?.price ?? offer?.numericPrice);
    if (price != null) prices.push(price);
  }

  if (!prices.length) {
    return {
      priceCurrency: "BRL",
      priceSampleCount: 0,
      minimumPrice: null,
      maximumPrice: null,
      averagePrice: null,
      medianPrice: null,
    };
  }

  const sum = prices.reduce((acc, value) => acc + value, 0);
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100
      : Math.round(sorted[mid] * 100) / 100;

  return {
    priceCurrency: "BRL",
    priceSampleCount: prices.length,
    minimumPrice: Math.round(sorted[0] * 100) / 100,
    maximumPrice: Math.round(sorted[sorted.length - 1] * 100) / 100,
    averagePrice: Math.round((sum / prices.length) * 100) / 100,
    medianPrice: median,
  };
}

/**
 * @param {number|null|undefined} winnerPrice
 * @param {number|null|undefined} minimumPrice
 */
export function computeWinnerPriceDelta(winnerPrice, minimumPrice) {
  if (winnerPrice == null || minimumPrice == null || minimumPrice <= 0) {
    return { winnerVsMinimumDelta: null, winnerVsMinimumDeltaPercent: null };
  }
  const delta = Math.round((winnerPrice - minimumPrice) * 100) / 100;
  const percent = Math.round(((winnerPrice - minimumPrice) / minimumPrice) * 10000) / 100;
  return {
    winnerVsMinimumDelta: delta,
    winnerVsMinimumDeltaPercent: percent,
  };
}

/**
 * @param {number|null|undefined} winnerPrice
 * @param {number|null|undefined} minimumPrice
 */
export function resolveWinnerIsLowestPrice(winnerPrice, minimumPrice) {
  if (winnerPrice == null || minimumPrice == null) return null;
  return winnerPrice <= minimumPrice;
}
