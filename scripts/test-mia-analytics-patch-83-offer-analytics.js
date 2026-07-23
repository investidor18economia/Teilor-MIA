#!/usr/bin/env node
/**
 * PATCH 8.3 — Offer Set Analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMERCIAL_PERMISSION } from "../lib/miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import {
  buildOfferSetAnalyticsPayload,
  buildOfferSetRecommendationMetadata,
  initializeOfferSetAnalyticsTracking,
  updateOfferSetAnalyticsFromPipeline,
  MIA_OFFER_SET_ANALYTICS_EVENT,
  MIA_OFFER_SET_ANALYTICS_VERSION,
  resolveOfferPipelineStatus,
  resolveOfferSetSearchPath,
  computeOfferPriceAggregates,
  buildMerchantKey,
  buildOfferFingerprint,
  parseOfferPrice,
  isOfferAnalyticallyComplete,
} from "../lib/miaOfferSetAnalytics.js";
import {
  activateOfferSetTracker,
  createOfferSetTracker,
  finalizeOfferSetTracker,
  buildOfferSetDedupKey,
  updateOfferSetTrackerFromPipeline,
  updateOfferSetTrackerFromSelection,
} from "../lib/miaOfferSetTracker.js";
import {
  MIA_OFFER_PIPELINE_STATUSES,
  MIA_OFFER_SET_SEARCH_PATHS,
  MIA_OFFER_TERMINATION_STAGES,
} from "../lib/miaOfferSetCatalog.js";
import { computeWinnerPriceDelta, resolveWinnerIsLowestPrice } from "../lib/miaOfferSetClassifier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");
const SQL_FILES = [
  "patch-83-query1-offer-funnel.sql",
  "patch-83-query2-offer-price-winner.sql",
  "patch-83-query3-offer-diversity.sql",
  "patch-83-query4-offer-quality.sql",
  "patch-83-query5-offer-interactions.sql",
  "patch-83-query6-offer-correlation.sql",
  "patch-83-query7-offer-loss-diagnostic.sql",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

console.log("\nPATCH 8.3 — Offer Set Analytics audit\n");

console.log("Contract");
assert("event name", MIA_OFFER_SET_ANALYTICS_EVENT === "mia_offer_set");
assert("event version", MIA_OFFER_SET_ANALYTICS_VERSION === "8.3.0");

console.log("\nTaxonomies");
assert("success status", resolveOfferPipelineStatus({ pipelineReached: true, deliveredOffersCount: 2, selectedOffersCount: 2 }) === MIA_OFFER_PIPELINE_STATUSES.SUCCESS);
assert("empty status", resolveOfferPipelineStatus({ pipelineReached: true, deliveredOffersCount: 0, rankedOffersCount: 0 }) === MIA_OFFER_PIPELINE_STATUSES.EMPTY);
assert("provider only path", resolveOfferSetSearchPath("PROVIDER_ONLY") === MIA_OFFER_SET_SEARCH_PATHS.PROVIDER_ONLY);

console.log("\nPrice aggregates");
const agg = computeOfferPriceAggregates([
  { price: "100" },
  { price: "200" },
  { price: "300" },
]);
assert("median odd", agg.medianPrice === 200);
assert("min", agg.minimumPrice === 100);
const delta = computeWinnerPriceDelta(250, 100);
assert("winner delta", delta.winnerVsMinimumDelta === 150);
assert("winner lowest", resolveWinnerIsLowestPrice(100, 100) === true);

console.log("\nIdentity");
assert("merchant key stable", buildMerchantKey("google_shopping", "Amazon") === buildMerchantKey("serpapi", "Amazon"));
assert("fingerprint", !!buildOfferFingerprint("google_shopping", "listing-1", ""));
assert("complete offer", isOfferAnalyticallyComplete({ product_name: "X", price: 10, source: "Loja", link: "https://x.com", provider: "google_shopping" }));
assert("parse price", parseOfferPrice("R$ 1.299,90") === 1299.9);

console.log("\nLifecycle");
const tracker = createOfferSetTracker({ requestId: "req-1" });
activateOfferSetTracker(tracker);
updateOfferSetTrackerFromPipeline(tracker, {
  pipelineReached: true,
  rawOffersCount: 10,
  normalizedOffersCount: 8,
  rankedOffersCount: 8,
});
updateOfferSetTrackerFromSelection(tracker, {
  displayProducts: [{ product_name: "A", price: 100, source: "L1", link: "https://a", provider: "google_shopping" }],
  selectedBestProduct: { product_name: "A", price: 100, source: "L1", link: "https://a", provider: "google_shopping" },
});
const metadata = finalizeOfferSetTracker(tracker, {
  body: { prices: [{ product_name: "A", price: 100, source: "L1", link: "https://a" }] },
  commercialSearchMetadata: { search_path: "PROVIDER_ONLY", runtime_mode: "CONTROLLED" },
});
assert("finalized metadata", metadata?.offer_pipeline_status === MIA_OFFER_PIPELINE_STATUSES.SUCCESS);
assert("delivered count", metadata?.delivered_offers_count === 1);
assert("winner present", metadata?.winner_present === true);

console.log("\nPayload");
const built = buildOfferSetAnalyticsPayload({
  requestId: "11111111-1111-4111-8111-111111111111",
  metadata,
});
assert("no query_text", built.payload.query_text == null);
assert("metadata version", built.payload.metadata?.event_version === "8.3.0");
assert("no product_name in metadata", !("product_name" in (built.payload.metadata || {})));

console.log("\nDedup key");
assert("dedup format", buildOfferSetDedupKey("r1", "mia_offer_set", "8.3.0").includes("8.3.0"));

console.log("\nHooks");
const chat = readFileSync(CHAT_API, "utf8");
assert("imports offer analytics", chat.includes("miaOfferSetAnalytics"));
assert("initialize hook", chat.includes("initializeOfferSetAnalyticsTracking"));
assert("delivery hook", chat.includes("instrumentOfferSetAnalyticsForDelivery"));
assert("selection hook", chat.includes("updateOfferSetAnalyticsFromSelection"));

console.log("\nSQL files");
for (const file of SQL_FILES) {
  const path = join(ROOT, "docs/analytics/sql", file);
  assert(`exists ${file}`, existsSync(path));
  assert(`uses event ${file}`, readFileSync(path, "utf8").includes("mia_offer_set"));
}

console.log("\nDomain gate");
initializeOfferSetAnalyticsTracking({ commercialPermission: COMMERCIAL_PERMISSION.DENY, interactionMode: MIA_INTERACTION_MODES.SOCIAL });
const denied = updateOfferSetAnalyticsFromPipeline({ rawOffersCount: 1 });
assert("deny does not update inactive bucket", denied?.rawOffersCount == null);

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
