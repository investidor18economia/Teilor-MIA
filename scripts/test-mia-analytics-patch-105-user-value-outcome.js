#!/usr/bin/env node
/**
 * PATCH 10.5 — User Value Outcome Analytics audit
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIA_USER_VALUE_OUTCOME_ANALYTICS_EVENT,
  MIA_USER_VALUE_OUTCOME_ANALYTICS_VERSION,
  buildUserValueOutcomeAnalyticsPayload,
  buildUserValueOutcomeDedupKey,
  MIA_VALUE_OUTCOME_STATUS,
  MIA_VALUE_TYPE,
  MIA_VALUE_CONFIDENCE,
  MIA_VALUE_LAYER,
  MIA_TIME_SAVED_BUCKET,
  MIA_VALUE_EVIDENCE,
} from "../lib/miaUserValueOutcomeAnalytics.js";
import {
  buildUserValueOutcomeMetadata,
  computeUserValueScoreFromComponents,
  resolveValueAmounts,
  resolveTimeSavedBucket,
  resolveOutcomeStatus,
} from "../lib/miaUserValueOutcomeClassifier.js";
import { MIA_SAVINGS_TYPE } from "../lib/miaSavingsEstimationCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OFFER_SET = join(ROOT, "lib/miaOfferSetAnalytics.js");

const SQL_FILES = Array.from({ length: 20 }, (_, i) => {
  const names = [
    "potential-value-avg", "observed-value-avg", "value-by-layer", "score-distribution",
    "confidence-distribution", "value-type", "outcome-status", "time-saved-bucket",
    "value-components", "price-intelligence-correlation", "savings-correlation",
    "anti-regret-correlation", "acceptance-correlation", "rejection-correlation",
    "alerts-correlation", "score-vs-confidence", "temporal-evolution", "search-path",
    "provider-distribution", "verified-rate",
  ];
  return `patch-105-query${i + 1}-${names[i]}.sql`;
});

let passed = 0;
let failed = 0;
function assert(label, condition) {
  if (condition) { passed += 1; console.log(`  ✅ ${label}`); }
  else { failed += 1; console.log(`  ❌ ${label}`); }
}
function section(t) { console.log(`\n${t}`); }

const offerSet = {
  winner_present: true,
  winner_is_lowest_price: true,
  winner_price: 1950,
  minimum_price: 1950,
  price_sample_count: 4,
  provider_count: 3,
  price_currency: "BRL",
  delivered_offers_count: 3,
  raw_offers_count: 6,
  search_path: "COMMERCIAL_PIPELINE",
  winner_provider_id: "amazon",
};
const decision = {
  winner_present: true,
  decision_valid: true,
  runner_up_present: true,
  candidate_count: 6,
  display_count: 3,
  conversation_turn_count: 4,
  budget_constraint: true,
};

section("Contract");
assert("event name", MIA_USER_VALUE_OUTCOME_ANALYTICS_EVENT === "mia_user_value_outcome");
assert("event version", MIA_USER_VALUE_OUTCOME_ANALYTICS_VERSION === "10.5.0");

section("Value layers separation");
const potentialOnly = resolveValueAmounts(
  { savings_type: MIA_SAVINGS_TYPE.OBSERVED, savings_amount: 150 },
  [],
  [],
  null
);
assert("potential amount", potentialOnly.potential_value_amount === 150);
assert("observed null without signals", potentialOnly.observed_value_amount == null);
assert("verified always null", potentialOnly.verified_value_amount == null);

const observed = resolveValueAmounts(
  { savings_type: MIA_SAVINGS_TYPE.OBSERVED, savings_amount: 150 },
  [{ signal_type: "WINNER_OFFER_CLICKED" }],
  [],
  null
);
assert("observed with acceptance", observed.observed_value_amount === 150);
assert("outcome OBSERVED", resolveOutcomeStatus(observed.observed_value_amount, [{ }], null) === MIA_VALUE_OUTCOME_STATUS.OBSERVED);

section("Scenarios — accepted decision");
const accepted = buildUserValueOutcomeMetadata({
  requestId: "11111111-1111-4111-8111-111111111111",
  offerSetMetadata: offerSet,
  decisionMetadata: decision,
  acceptanceSignals: [{ signal_type: "WINNER_FOLLOW_UP", signal_strength: "STRONG" }],
});
assert("accepted OBSERVED status", accepted.value_status === MIA_VALUE_OUTCOME_STATUS.OBSERVED);
assert("accepted layer OBSERVED_VALUE", accepted.value_layer === MIA_VALUE_LAYER.OBSERVED_VALUE);

section("Scenarios — rejected");
const rejected = buildUserValueOutcomeMetadata({
  requestId: "22222222-2222-4222-8222-222222222222",
  offerSetMetadata: offerSet,
  decisionMetadata: decision,
  rejectionSignals: [{ signal_type: "EXPLICIT_REJECTION" }, { signal_type: "ALTERNATIVE_REQUESTED" }],
});
assert("rejected still POTENTIAL at delivery", rejected.value_status === MIA_VALUE_OUTCOME_STATUS.POTENTIAL);

section("Scenarios — alert target reached");
const alertOk = buildUserValueOutcomeMetadata({
  requestId: "33333333-3333-4333-8333-333333333333",
  offerSetMetadata: offerSet,
  decisionMetadata: decision,
  alertStage: "TARGET_REACHED",
});
assert("alert success type", alertOk.value_type === MIA_VALUE_TYPE.ALERT_SUCCESS);
assert("alert OBSERVED", alertOk.value_status === MIA_VALUE_OUTCOME_STATUS.OBSERVED);

section("Scenarios — favorite / click");
const fav = buildUserValueOutcomeMetadata({
  requestId: "44444444-4444-4444-8444-444444444444",
  offerSetMetadata: offerSet,
  decisionMetadata: decision,
  acceptanceSignals: [{ signal_type: "PRODUCT_FAVORITED", source_event_name: "favorite_created" }],
});
assert("favorite discovery type", fav.value_type === MIA_VALUE_TYPE.PRODUCT_DISCOVERY);

section("Scenarios — low price intelligence");
const lowPrice = buildUserValueOutcomeMetadata({
  requestId: "55555555-5555-4555-8555-555555555555",
  offerSetMetadata: { ...offerSet, price_sample_count: 0, winner_present: true, removed_invalid_count: 2 },
  decisionMetadata: decision,
});
assert("low price score below high", lowPrice.user_value_score < 80);

section("Scenarios — savings potential");
const savingsPot = buildUserValueOutcomeMetadata({
  requestId: "66666666-6666-4666-8666-666666666666",
  offerSetMetadata: { ...offerSet, winner_is_lowest_price: false, winner_price: 2100, minimum_price: 1950 },
  decisionMetadata: decision,
});
assert("price opportunity type", [MIA_VALUE_TYPE.PRICE_OPPORTUNITY, MIA_VALUE_TYPE.UNKNOWN].includes(savingsPot.value_type));

section("Scenarios — no savings");
const noSavings = buildUserValueOutcomeMetadata({
  requestId: "77777777-7777-4777-8777-777777777777",
  offerSetMetadata: { winner_present: true, winner_is_lowest_price: true, winner_price: 100, minimum_price: 100, price_sample_count: 1, price_currency: "BRL" },
  decisionMetadata: decision,
});
assert("no savings potential null or zero", noSavings.potential_value_amount == null || noSavings.potential_value_amount === 0);

section("Scenarios — anti-regret high vs low");
const highAr = buildUserValueOutcomeMetadata({
  requestId: "88888888-8888-4888-8888-888888888888",
  offerSetMetadata: offerSet,
  decisionMetadata: { ...decision, anchor_preserved: true, score_gap_bucket: "WIDE" },
});
const lowAr = buildUserValueOutcomeMetadata({
  requestId: "99999999-9999-4999-8999-999999999999",
  offerSetMetadata: { ...offerSet, winner_is_lowest_price: false, winner_price: 2200 },
  decisionMetadata: { ...decision, new_search: true, reset_applied: true },
});
assert("high anti-regret score reflected", highAr.anti_regret_score != null);
assert("score differs by context", highAr.user_value_score !== lowAr.user_value_score);

section("Time saved bucket");
assert("high exploration", resolveTimeSavedBucket({ candidate_count: 8, conversation_turn_count: 6 }, { delivered_offers_count: 4 }) === MIA_TIME_SAVED_BUCKET.HIGH);

section("Score components");
const score = computeUserValueScoreFromComponents({ PRICE: 1, SAVINGS: 0.8, DECISION: 0.8 });
assert("score in range", score >= 0 && score <= 100);

section("Privacy");
const payload = buildUserValueOutcomeAnalyticsPayload({
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  offerSetMetadata: offerSet,
  decisionMetadata: decision,
});
const blob = JSON.stringify(payload.payload.metadata || {});
assert("verified null", payload.payload.metadata.verified_value_amount == null);
assert("purchase false", payload.payload.metadata.purchase_confirmed === false);
assert("value_verified false", payload.payload.metadata.value_verified === false);
assert("roi_assumed false", payload.payload.metadata.roi_assumed === false);
assert("no product_name", !blob.includes("product_name"));
assert("no url", !/https:\/\//.test(blob));

section("Dedup");
assert("dedup format", buildUserValueOutcomeDedupKey("a", "a", "mia_user_value_outcome", "10.5.0").includes("10.5.0"));

section("Hooks");
assert("offer set hook", readFileSync(OFFER_SET, "utf8").includes("emitUserValueOutcomeAnalytics"));

section("SQL files");
for (const file of SQL_FILES) {
  const path = join(ROOT, "docs/analytics/sql", file);
  assert(`${file} exists`, existsSync(path));
  assert(`${file} uses event`, readFileSync(path, "utf8").includes("mia_user_value_outcome"));
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
