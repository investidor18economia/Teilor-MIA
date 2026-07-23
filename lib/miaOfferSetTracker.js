/**
 * PATCH 8.3 — Offer set request-scoped tracker.
 */

import {
  MIA_OFFER_SET_DEFAULT_CURRENCY,
  MIA_OFFER_SET_RUNTIME_MODES,
} from "./miaOfferSetCatalog.js";
import {
  buildMerchantKey,
  extractOfferProviderId,
  isOfferAnalyticallyComplete,
  parseOfferPrice,
} from "./miaOfferIdentity.js";
import {
  computeOfferPriceAggregates,
  computeWinnerPriceDelta,
  resolveOfferPipelineStatus,
  resolveOfferSetSearchPath,
  resolveOfferTerminationStage,
  resolveWinnerIsLowestPrice,
} from "./miaOfferSetClassifier.js";
import { resolveProviderAnalyticsRuntimeMode } from "./miaProviderAttemptClassifier.js";

/**
 * @param {string} requestId
 * @param {string} eventName
 * @param {string} eventVersion
 */
export function buildOfferSetDedupKey(requestId, eventName, eventVersion) {
  return `${requestId}|${eventName}|${eventVersion}`;
}

/**
 * @param {object} [seed]
 */
export function createOfferSetTracker(seed = {}) {
  return {
    active: false,
    finalized: false,
    emitted: false,
    pipelineReached: false,
    failed: false,
    requestId: seed.requestId ?? null,
    analyticsContext: seed.analyticsContext || {},
    endpoint: seed.endpoint || "/api/chat-gpt4o",
    controlledTest: !!seed.controlledTest,
    runtimeMode: seed.runtimeMode ?? resolveProviderAnalyticsRuntimeMode(),
    searchPath: null,
    commercialSearchPath: null,
    dataLayerUsedAsPrimarySource: false,
    providerContinuationRequired: false,
    fallbackUsed: false,
    rawOffersCount: null,
    normalizedOffersCount: null,
    eligibleOffersCount: null,
    mergedOffersCount: null,
    deduplicatedOffersCount: null,
    rankedOffersCount: null,
    selectedOffersCount: null,
    deliveredOffersCount: null,
    removedInvalidCount: null,
    removedDuplicateCount: null,
    removedIneligibleCount: null,
    rankingObserved: false,
    dedupObserved: false,
    selectedWinner: null,
    rankedOffersSample: [],
    displayOffersSample: [],
    deliveredOffersSample: [],
  };
}

/**
 * @param {ReturnType<typeof createOfferSetTracker>|null|undefined} tracker
 */
export function activateOfferSetTracker(tracker) {
  if (!tracker) return tracker;
  tracker.active = true;
  return tracker;
}

function clampCount(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * @param {ReturnType<typeof createOfferSetTracker>|null|undefined} tracker
 * @param {object} input
 */
export function updateOfferSetTrackerFromPipeline(tracker, input = {}) {
  if (!tracker?.active || tracker.finalized) return tracker;

  if (input.pipelineReached != null) tracker.pipelineReached = !!input.pipelineReached;
  if (input.failed != null) tracker.failed = !!input.failed;
  if (input.runtimeMode != null) tracker.runtimeMode = input.runtimeMode;
  if (input.commercialSearchPath != null) tracker.commercialSearchPath = input.commercialSearchPath;
  if (input.dataLayerUsedAsPrimarySource != null) {
    tracker.dataLayerUsedAsPrimarySource = !!input.dataLayerUsedAsPrimarySource;
  }
  if (input.providerContinuationRequired != null) {
    tracker.providerContinuationRequired = !!input.providerContinuationRequired;
  }
  if (input.fallbackUsed != null) tracker.fallbackUsed = !!input.fallbackUsed;

  if (input.rawOffersCount != null) tracker.rawOffersCount = clampCount(input.rawOffersCount);
  if (input.normalizedOffersCount != null) {
    tracker.normalizedOffersCount = clampCount(input.normalizedOffersCount);
  }
  if (input.eligibleOffersCount != null) {
    tracker.eligibleOffersCount = clampCount(input.eligibleOffersCount);
  }
  if (input.mergedOffersCount != null) tracker.mergedOffersCount = clampCount(input.mergedOffersCount);
  if (input.deduplicatedOffersCount != null) {
    tracker.deduplicatedOffersCount = clampCount(input.deduplicatedOffersCount);
  }
  if (input.rankedOffersCount != null) tracker.rankedOffersCount = clampCount(input.rankedOffersCount);
  if (input.removedInvalidCount != null) {
    tracker.removedInvalidCount = clampCount(input.removedInvalidCount);
  }
  if (input.removedDuplicateCount != null) {
    tracker.removedDuplicateCount = clampCount(input.removedDuplicateCount);
    tracker.dedupObserved = tracker.dedupObserved || clampCount(input.removedDuplicateCount) > 0;
  }
  if (input.removedIneligibleCount != null) {
    tracker.removedIneligibleCount = clampCount(input.removedIneligibleCount);
  }
  if (input.rankingObserved != null) tracker.rankingObserved = !!input.rankingObserved;

  if (Array.isArray(input.rankedOffersSample)) {
    tracker.rankedOffersSample = input.rankedOffersSample.slice(0, 12);
  }

  return tracker;
}

/**
 * @param {ReturnType<typeof createOfferSetTracker>|null|undefined} tracker
 * @param {object} input
 */
export function updateOfferSetTrackerFromSelection(tracker, input = {}) {
  if (!tracker?.active || tracker.finalized) return tracker;

  const displayProducts = Array.isArray(input.displayProducts) ? input.displayProducts : [];
  tracker.selectedOffersCount = clampCount(displayProducts.length);
  tracker.displayOffersSample = displayProducts.slice(0, 6);
  tracker.selectedWinner = input.selectedBestProduct || displayProducts[0] || null;
  tracker.rankingObserved = tracker.rankingObserved || displayProducts.length > 0;
  return tracker;
}

function collectDiversityMetrics(offers = []) {
  const providers = new Set();
  const merchants = new Set();
  for (const offer of offers) {
    const providerId = extractOfferProviderId(offer);
    if (providerId) providers.add(providerId);
    const merchantKey = buildMerchantKey(providerId, offer?.source || offer?.store || "");
    if (merchantKey) merchants.add(merchantKey);
  }
  return {
    providerCount: providers.size,
    merchantCount: merchants.size,
    singleProviderDependency: providers.size === 1,
    singleMerchantDependency: merchants.size === 1,
  };
}

function countQualityMetrics(offers = []) {
  let complete = 0;
  let incomplete = 0;
  let withShipping = 0;
  let withFreeShipping = 0;
  let withInstallments = 0;
  let inStock = 0;
  let withPreviousPrice = 0;

  for (const offer of offers) {
    if (isOfferAnalyticallyComplete(offer)) complete += 1;
    else incomplete += 1;

    if (offer?.shipping != null || offer?.hasShipping === true) withShipping += 1;
    if (offer?.freeShipping === true || offer?.shipping === 0) withFreeShipping += 1;
    if (offer?.installments != null || offer?.hasInstallments === true) withInstallments += 1;
    if (offer?.inStock === true || offer?.offer_status === "available") inStock += 1;
    if (offer?.previousPrice != null || offer?.original_price != null) withPreviousPrice += 1;
  }

  return {
    offersWithCompleteDataCount: complete,
    offersWithIncompleteDataCount: incomplete,
    offersWithShippingCount: withShipping,
    offersWithFreeShippingCount: withFreeShipping,
    offersWithInstallmentsCount: withInstallments,
    offersInStockCount: inStock,
    offersWithPreviousPriceCount: withPreviousPrice,
  };
}

/**
 * @param {ReturnType<typeof createOfferSetTracker>|null|undefined} tracker
 * @param {{
 *   body?: Record<string, unknown>|null,
 *   commercialSearchMetadata?: Record<string, unknown>|null,
 *   responsePath?: string|null,
 * }} [input]
 */
export function finalizeOfferSetTracker(tracker, input = {}) {
  if (!tracker?.active || tracker.finalized) return null;

  const body = input.body && typeof input.body === "object" ? input.body : {};
  const prices = Array.isArray(body.prices) ? body.prices : [];
  tracker.deliveredOffersCount = clampCount(prices.length);
  tracker.deliveredOffersSample = prices.slice(0, 6);

  const commercialMeta = input.commercialSearchMetadata || {};
  tracker.commercialSearchPath =
    commercialMeta.search_path ?? tracker.commercialSearchPath ?? null;
  tracker.runtimeMode =
    commercialMeta.runtime_mode ?? tracker.runtimeMode ?? MIA_OFFER_SET_RUNTIME_MODES.UNKNOWN;
  tracker.searchPath = resolveOfferSetSearchPath(tracker.commercialSearchPath, {
    fallbackUsed: commercialMeta.search_result_status === "FALLBACK_RESULT" || tracker.fallbackUsed,
    dataLayerUsedAsPrimarySource: tracker.dataLayerUsedAsPrimarySource,
    providerContinuationRequired: tracker.providerContinuationRequired,
  });

  const diversitySource =
    tracker.deliveredOffersSample.length > 0
      ? tracker.deliveredOffersSample
      : tracker.displayOffersSample.length > 0
        ? tracker.displayOffersSample
        : tracker.rankedOffersSample;

  const diversity = collectDiversityMetrics(diversitySource);
  const quality = countQualityMetrics(diversitySource);
  const priceAgg = computeOfferPriceAggregates(diversitySource);

  const winnerOffer =
    tracker.selectedWinner ||
    (prices[0]
      ? {
          product_name: prices[0].product_name,
          price: prices[0].price,
          source: prices[0].source,
          provider: prices[0].provider,
          link: prices[0].link,
        }
      : null);

  const winnerPrice = parseOfferPrice(winnerOffer?.price);
  const winnerProviderId = extractOfferProviderId(winnerOffer);
  const winnerMerchantKey = buildMerchantKey(winnerProviderId, winnerOffer?.source || "");
  const winnerDelta = computeWinnerPriceDelta(winnerPrice, priceAgg.minimumPrice);

  tracker.finalized = true;

  const offerPipelineStatus = resolveOfferPipelineStatus({
    pipelineReached: tracker.pipelineReached,
    deliveredOffersCount: tracker.deliveredOffersCount,
    selectedOffersCount: tracker.selectedOffersCount,
    rankedOffersCount: tracker.rankedOffersCount,
    failed: tracker.failed,
  });

  const terminationStage = resolveOfferTerminationStage(tracker);

  return {
    runtime_mode: tracker.runtimeMode,
    search_path: tracker.searchPath,
    offer_pipeline_status: offerPipelineStatus,
    termination_stage: terminationStage,
    raw_offers_count: tracker.rawOffersCount,
    normalized_offers_count: tracker.normalizedOffersCount,
    eligible_offers_count: tracker.eligibleOffersCount,
    merged_offers_count: tracker.mergedOffersCount,
    deduplicated_offers_count: tracker.deduplicatedOffersCount,
    ranked_offers_count: tracker.rankedOffersCount,
    selected_offers_count: tracker.selectedOffersCount,
    delivered_offers_count: tracker.deliveredOffersCount,
    removed_invalid_count: tracker.removedInvalidCount,
    removed_duplicate_count: tracker.removedDuplicateCount,
    removed_ineligible_count: tracker.removedIneligibleCount,
    provider_count: diversity.providerCount,
    merchant_count: diversity.merchantCount,
    single_provider_dependency: diversity.singleProviderDependency,
    single_merchant_dependency: diversity.singleMerchantDependency,
    winner_present: !!winnerOffer,
    winner_position: winnerOffer ? 1 : null,
    winner_provider_id: winnerProviderId,
    winner_merchant_key: winnerMerchantKey,
    winner_is_lowest_price: resolveWinnerIsLowestPrice(winnerPrice, priceAgg.minimumPrice),
    winner_has_shipping: winnerOffer?.hasShipping === true || winnerOffer?.shipping != null,
    winner_has_installments:
      winnerOffer?.hasInstallments === true || winnerOffer?.installments != null,
    winner_in_stock:
      winnerOffer?.inStock === true || winnerOffer?.offer_status === "available" || null,
    price_currency: priceAgg.priceSampleCount > 0 ? MIA_OFFER_SET_DEFAULT_CURRENCY : null,
    price_sample_count: priceAgg.priceSampleCount,
    minimum_price: priceAgg.minimumPrice,
    maximum_price: priceAgg.maximumPrice,
    average_price: priceAgg.averagePrice,
    median_price: priceAgg.medianPrice,
    winner_price: winnerPrice,
    winner_vs_minimum_delta: winnerDelta.winnerVsMinimumDelta,
    winner_vs_minimum_delta_percent: winnerDelta.winnerVsMinimumDeltaPercent,
    offers_with_shipping_count: quality.offersWithShippingCount,
    offers_with_free_shipping_count: quality.offersWithFreeShippingCount,
    offers_with_installments_count: quality.offersWithInstallmentsCount,
    offers_in_stock_count: quality.offersInStockCount,
    offers_with_previous_price_count: quality.offersWithPreviousPriceCount,
    offers_with_complete_data_count: quality.offersWithCompleteDataCount,
    offers_with_incomplete_data_count: quality.offersWithIncompleteDataCount,
    display_ready: prices.length > 0,
    response_contains_offer_cards: prices.length > 0,
    ranking_observed: tracker.rankingObserved,
    dedup_observed: tracker.dedupObserved,
    response_path: input.responsePath ?? null,
    source: "server",
  };
}

/**
 * @param {ReturnType<typeof createOfferSetTracker>|null|undefined} tracker
 */
export function isOfferSetTrackerEmitEligible(tracker) {
  return !!tracker?.active && tracker.finalized && !tracker.emitted && tracker.pipelineReached;
}

/**
 * @param {ReturnType<typeof createOfferSetTracker>|null|undefined} tracker
 */
export function markOfferSetTrackerEmitted(tracker) {
  if (!tracker) return;
  tracker.emitted = true;
}
