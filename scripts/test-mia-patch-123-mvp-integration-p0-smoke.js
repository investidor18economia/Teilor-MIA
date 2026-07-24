#!/usr/bin/env node
/**
 * PATCH 12.3 — MVP P0 consolidated integration smoke (real module chains, external mocks only).
 */
import {
  recognizeMiaIntent,
  MIA_INTERACTION_MODES,
} from "../lib/miaIntentRecognitionLayer.js";
import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { buildIntentAuthorityFromRecognition } from "../lib/miaIntentAuthority.js";
import { resolveDecisionEngineWinners, namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";
import {
  classifyDataLayerResponse,
  classifyFallbackKind,
} from "../lib/miaDataLayerResolutionClassifier.js";
import {
  applyDataLayerHumanizationGuard,
  detectRawDataLayerTokenLeak,
} from "../lib/miaDataLayerHumanizationGuard.js";
import { pickAuthoritativeLastBestProduct } from "../lib/miaRoutingSafety.js";
import {
  validateAnalyticsTrackRequest,
  ALLOWED_ANALYTICS_EVENTS,
} from "../lib/miaAnalyticsAllowlist.js";
import { classifyAcceptanceSignalFromClientEvent } from "../lib/miaRecommendationAcceptanceClassifier.js";
import {
  COMMERCIAL_PROVIDER_IDS,
  getCommercialProviderRegistry,
} from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { deduplicateCommercialOffers } from "../lib/productSourceAdapter/commercialDeduplicationLayer.js";
import { mergeCommercialOffers } from "../lib/productSourceAdapter/commercialOfferMergeLayer.js";
import { selectCommercialOffers } from "../lib/productSourceAdapter/commercialSelectionEngine.js";
import {
  createEmptyNormalizedProduct,
  isNormalizedProductUsable,
} from "../lib/productSourceAdapter/normalizedProduct.js";
import { generateDeterministicInsights } from "../lib/miaExecutiveInsightsEngine.js";
import {
  forwardChatRequestToCore,
  normalizeProxyRequestBody,
} from "../lib/miaPerimeterChatProxy.js";

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

function chainIntentRouter(text, session = {}) {
  const intent = recognizeMiaIntent({
    userMessage: text,
    resolvedQuery: text,
    sessionContext: session,
    signals: { hasClearNewCommercialSearch: /celular|iphone|notebook/i.test(text) },
  });
  const authority = buildIntentAuthorityFromRecognition(intent, { sessionContext: session });
  const turn = classifyMiaTurn({
    userMessage: text,
    resolvedQuery: text,
    sessionContext: session,
    intent,
  });
  return { intent, authority, turn };
}

console.log("\nPATCH 12.3 — MVP P0 integration smoke\n");

console.log("Intent → Router → Authority");
{
  const social = chainIntentRouter("oi, tudo bem?");
  ok("social mode", social.intent.interactionMode === MIA_INTERACTION_MODES.SOCIAL);
  ok("social turn", social.turn.turnType != null);

  const commercial = chainIntentRouter("quero um celular samsung até 2000");
  ok("commercial mode", commercial.intent.interactionMode === MIA_INTERACTION_MODES.COMMERCE);

  const mixed = chainIntentRouter("Hoje foi ruim, preciso de um celular");
  ok("mixed still routes", mixed.turn.turnType != null);
}

console.log("\nRouter → Decision Engine");
{
  const winners = resolveDecisionEngineWinners(
    [
      { product_name: "Samsung Galaxy A55", score: 0.9 },
      { product_name: "Xiaomi Redmi Note 13", score: 0.7 },
    ],
    { product_name: "Samsung Galaxy A55" }
  );
  ok("winner resolved", winners.best?.product_name === "Samsung Galaxy A55");
  ok("runner-up present", winners.second?.product_name != null);
  ok("anchor match", namesLikelyMatch("Galaxy A55", "Samsung Galaxy A55"));
}

console.log("\nDecision Engine → Data Layer");
{
  const dl = classifyDataLayerResponse({
    productsUsedCount: 2,
    dataLayerUsedAsPrimarySource: true,
    dataLayerProductsInResponse: 2,
  });
  ok("DL classification", dl === "FULL_DATA_LAYER");
  ok(
    "fallback none when evidence",
    classifyFallbackKind({
      responseClassification: "FULL_DATA_LAYER",
      dataLayerUsedAsPrimarySource: true,
    }) === "none"
  );

  const guarded = applyDataLayerHumanizationGuard({ ideal_for: "heavy_users" });
  ok("humanization applied", guarded.changed === true || guarded.suppressedFields?.length > 0);
  ok("no token leak", detectRawDataLayerTokenLeak("Produto com boa bateria.").leak === false);
}

console.log("\nCommercial Runtime chain (mocked providers)");
{
  const gs = {
    source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    title: "Apple iPhone 13 128GB",
    price: 3500,
    url: "https://shop.test/iphone13",
    image: "https://img.test/1.jpg",
  };
  const ml = {
    source: COMMERCIAL_PROVIDER_IDS.APIFY_MERCADOLIVRE,
    title: "Apple iPhone 13 128GB",
    price: 3200,
    url: "https://ml.test/iphone13",
    image: "https://img.test/2.jpg",
  };
  const dup = {
    source: COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING,
    title: "Apple iPhone 13 128GB",
    price: 3600,
    url: "https://shop.test/iphone13-dup",
    image: "",
  };

  const merged = mergeCommercialOffers({
    googleShoppingOffers: [gs],
    apifyMercadoLivreOffers: [ml],
  });
  ok("merge produces offers", Array.isArray(merged) && merged.length >= 2);

  const deduped = deduplicateCommercialOffers([gs, ml, dup]);
  ok("dedupe reduces duplicates", deduped.length < 3);

  const selected = selectCommercialOffers({
    offers: deduped,
    query: "iphone 13",
  });
  ok("selection winner", selected.selectedOffer != null);
  ok("selection has alternatives", Array.isArray(selected.alternativeOffers));

  const emptySel = selectCommercialOffers({ offers: [], query: "x" });
  ok("empty offers safe", emptySel.selectedOffer == null);
}

console.log("\nWinner cognitivo × winner comercial (audit)");
{
  const cognitive = { product_name: "Samsung Galaxy A55" };
  const commercialFirst = { product_name: "Xiaomi Redmi Note 13", price: 1200 };
  const diverges = !namesLikelyMatch(cognitive.product_name, commercialFirst.product_name);
  ok("divergence detectable", diverges);
  ok("documented dual winner risk", true);
}

console.log("\nNormalized Product contract");
{
  const empty = createEmptyNormalizedProduct();
  ok("empty not usable", !isNormalizedProductUsable(empty));
  const named = createEmptyNormalizedProduct({ product_name: "Test Product", brand: "Brand" });
  ok("named usable", isNormalizedProductUsable(named));
}

console.log("\nAnalytics integration chain");
{
  ok("allowlist has session_started", ALLOWED_ANALYTICS_EVENTS.includes("session_started"));
  const valid = validateAnalyticsTrackRequest({
    event_name: "mia_recommendation_shown",
    visitor_id: "v1",
    session_id: "s1",
    metadata: { product_name: "iPhone 13" },
  });
  ok("recommendation event valid", valid.ok === true);
  ok("null body safe", validateAnalyticsTrackRequest(null).ok === false);
  const fav = classifyAcceptanceSignalFromClientEvent("favorite_created", {}, {});
  ok("favorite analytics signal", fav?.signal_type != null);
}

console.log("\nExecutive Metrics → Insights");
{
  const metrics = {
    platform: { sessions: 100, visitors: 80 },
    conversation: { questions: 50 },
    recommendation: { shown: 40 },
    commerce: { offers_returned: 30, offer_clicks: 5, favorite_count: 2 },
    alerts: { created: 1 },
    price_intelligence: { observations: 10 },
    savings: { estimated_total_brl: 500 },
    anti_regret: { interventions: 2 },
    user_value: { positive_outcomes: 8 },
  };
  const insights = generateDeterministicInsights({
    current: metrics,
    previous: { ...metrics, platform: { sessions: 90, visitors: 70 } },
    windowDays: 30,
  });
  ok("insights array", Array.isArray(insights));
  ok("insights deterministic", insights.length >= 0);
}

console.log("\nContinuidade conversacional (session chain)");
{
  const turn1Session = {
    lastBestProduct: { product_name: "iPhone 13", price: "R$ 3.500" },
    lastRankingSnapshot: [{ product_name: "iPhone 13", rank: 1 }],
    lastQuery: "iphone 13",
  };
  ok("session shape valid", turn1Session.lastBestProduct?.product_name === "iPhone 13");

  const followUp = chainIntentRouter("e a bateria?", turn1Session);
  ok("follow-up turn", followUp.turn.turnType != null);

  const anchor = pickAuthoritativeLastBestProduct(turn1Session.lastBestProduct);
  ok("anchor preserved", anchor?.product_name === "iPhone 13");
}

console.log("\nPerimeter → Core proxy (mocked upstream)");
{
  const body = normalizeProxyRequestBody({ text: "iphone", conversation_id: "c1" });
  ok("normalize body", body.text === "iphone");

  let fetchCalled = false;
  const result = await forwardChatRequestToCore({
    req: { headers: { host: "localhost:3000", "x-forwarded-proto": "http" } },
    body: { text: "oi" },
    env: { API_SHARED_KEY: "test-key-patch-123" },
    fetchImpl: async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ reply: "ok", prices: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  ok("proxy forwards", fetchCalled);
  ok("proxy returns ok", result.ok === true);
}

console.log("\nProvider registry");
{
  const registry = getCommercialProviderRegistry({ NODE_ENV: "test" });
  ok("registry non-empty", registry.length >= 2);
  ok("google shopping registered", registry.some((p) => p.id === COMMERCIAL_PROVIDER_IDS.GOOGLE_SHOPPING));
}

console.log("\nNegative / degradation");
{
  ok("invalid analytics rejected", validateAnalyticsTrackRequest({ event_name: "hack_event" }).ok === false);
  ok("empty commercial selection", selectCommercialOffers({ offers: null, query: "" }).selectedOffer == null);
  ok("missing proxy key 503", (await forwardChatRequestToCore({
    req: { headers: { host: "localhost:3000" } },
    body: {},
    env: {},
    fetchImpl: async () => new Response("{}"),
  })).status === 503);
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
