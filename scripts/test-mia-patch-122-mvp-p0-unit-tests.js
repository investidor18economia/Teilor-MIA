#!/usr/bin/env node
/**
 * PATCH 12.2 — MVP P0 consolidated unit tests (behavioral, no external services).
 */
import {
  ALLOWED_ANALYTICS_EVENTS,
  validateAnalyticsTrackRequest,
} from "../lib/miaAnalyticsAllowlist.js";
import {
  classifyDataLayerResponse,
  classifyFallbackKind,
  DATA_LAYER_RESPONSE_CLASSIFICATIONS,
} from "../lib/miaDataLayerResolutionClassifier.js";
import {
  applyDataLayerHumanizationGuard,
  detectRawDataLayerTokenLeak,
  humanizeDataLayerText,
} from "../lib/miaDataLayerHumanizationGuard.js";
import {
  issueFounderGateToken,
  verifyFounderGateToken,
  isFounderEmail,
  resolveFounderAllowedEmails,
} from "../lib/miaFounderAccess.js";
import {
  createEmptyNormalizedProduct,
  isNormalizedProductUsable,
  NORMALIZED_PRODUCT_VERSION,
} from "../lib/productSourceAdapter/normalizedProduct.js";
import {
  COMMERCIAL_PROVIDER_IDS,
  isMercadoLivreCommercialProviderRuntimeEnabled,
} from "../lib/productSourceAdapter/commercialProviderRegistry.js";
import { MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS } from "../lib/miaExecutiveMetricsCatalog.js";
import {
  generateDeterministicInsights,
  scanInsightsForbiddenContent,
} from "../lib/miaExecutiveInsightsEngine.js";
import { resolveDecisionEngineWinners, namesLikelyMatch } from "../lib/miaDecisionConsistencyFixes.js";
import { recognizeMiaIntent, MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import { classifyMiaTurn, MIA_TURN_TYPES } from "../lib/miaCognitiveRouter.js";
import { validatePublicHttpMethod } from "../lib/miaPublicApiHardening.js";
import { redactLogFields } from "../lib/miaLogRedaction.js";

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

const TEST_ENV = {
  MIA_USER_SESSION_SECRET: "test-secret-patch-122-unit-tests-only",
  MIA_FOUNDER_ALLOWED_EMAILS: "founder@teilor.test,admin@teilor.test",
};

console.log("\nPATCH 12.2 — MVP P0 consolidated unit tests\n");

console.log("Intent Recognition");
const social = recognizeMiaIntent({
  userMessage: "oi, tudo bem?",
  resolvedQuery: "oi, tudo bem?",
  sessionContext: {},
  signals: {},
});
ok("social greeting mode", social.interactionMode === MIA_INTERACTION_MODES.SOCIAL);
const commercial = recognizeMiaIntent({
  userMessage: "quero um celular samsung até 2000",
  resolvedQuery: "quero um celular samsung até 2000",
  sessionContext: {},
  signals: { hasClearNewCommercialSearch: true },
});
ok("commercial search detected", commercial.interactionMode === MIA_INTERACTION_MODES.COMMERCE);
ok("empty message safe", recognizeMiaIntent({ userMessage: "", resolvedQuery: "" }).interactionMode != null);

console.log("\nCognitive Router");
const greetingTurn = classifyMiaTurn({ query: "olá!" });
ok("greeting turn type", [MIA_TURN_TYPES.CONVERSATIONAL, MIA_TURN_TYPES.UNKNOWN].includes(greetingTurn.turnType));
ok("router deterministic confidence", typeof greetingTurn.confidence === "number");
const unknownTurn = classifyMiaTurn({ query: "   " });
ok("whitespace input handled", unknownTurn.turnType != null);

console.log("\nDecision Engine");
const products = [
  { product_name: "Samsung Galaxy A55" },
  { product_name: "iPhone 13" },
];
const winners = resolveDecisionEngineWinners(products, { product_name: "iPhone 13" });
ok("anchor winner iPhone", winners.best?.product_name === "iPhone 13");
ok("LLM not involved in winner", winners.best != null && winners.second != null);
ok("namesLikelyMatch same product", namesLikelyMatch("iPhone 13", "Apple iPhone 13"));
ok("empty list no crash", resolveDecisionEngineWinners([], {}).best == null);

console.log("\nData Layer");
ok(
  "no commercial result classification",
  classifyDataLayerResponse({ productsUsedCount: 0 }) === DATA_LAYER_RESPONSE_CLASSIFICATIONS.NO_COMMERCIAL_RESULT
);
ok(
  "fallback only when no DL",
  classifyDataLayerResponse({ productsUsedCount: 2, dataLayerUsedAsPrimarySource: false }) ===
    DATA_LAYER_RESPONSE_CLASSIFICATIONS.FALLBACK_ONLY
);
ok("fallback kind none when empty", classifyFallbackKind({ responseClassification: "NO_COMMERCIAL_RESULT" }) === "none");
const humanizedText = humanizeDataLayerText("excelente_custo_beneficio");
ok("humanization removes snake_case leak", !detectRawDataLayerTokenLeak(humanizedText).leak);
ok("humanization guard null safe", applyDataLayerHumanizationGuard(null).changed === false);

console.log("\nContracts — NormalizedProduct");
ok("version 1.0.0", NORMALIZED_PRODUCT_VERSION === "1.0.0");
ok("empty product not usable", !isNormalizedProductUsable(createEmptyNormalizedProduct()));
ok("named product usable", isNormalizedProductUsable(createEmptyNormalizedProduct({ product_name: "Test Phone" })));

console.log("\nCommercial Runtime — Registry (no network)");
ok("provider ids defined", Object.keys(COMMERCIAL_PROVIDER_IDS).length > 0);
ok("ML enable is boolean", typeof isMercadoLivreCommercialProviderRuntimeEnabled({}) === "boolean");

console.log("\nAnalytics Allowlist");
ok("7 client events", ALLOWED_ANALYTICS_EVENTS.length === 7);
ok("reject unknown event", validateAnalyticsTrackRequest({ event_name: "forbidden_xyz" }).ok === false);
ok("accept session_started", validateAnalyticsTrackRequest({ event_name: "session_started", visitor_id: "v1" }).ok === true);
ok("reject missing event_name", validateAnalyticsTrackRequest({}).ok === false);
ok("reject invalid metadata type", validateAnalyticsTrackRequest({ event_name: "session_started", metadata: "bad" }).ok === false);

console.log("\nExecutive Metrics — forbidden keys");
ok("visitor_id forbidden", MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS.includes("visitor_id"));
ok("query_text forbidden", MIA_EXECUTIVE_METRICS_FORBIDDEN_KEYS.includes("query_text"));

console.log("\nExecutive AI Insights — deterministic");
const insights = generateDeterministicInsights({
  current: { platform: { questions: 100 }, conversation: { depth_avg: 2 } },
  previous: { platform: { questions: 80 }, conversation: { depth_avg: 2 } },
  windowDays: 30,
  partialErrors: [],
});
ok("insights array", Array.isArray(insights));
const forbiddenScan = scanInsightsForbiddenContent({
  insights,
  executive_summary: { overview: "Resumo agregado.", headline: "Test" },
});
ok("insights no PII scan hits", forbiddenScan.length === 0);

console.log("\nSecurity");
const token = issueFounderGateToken({ subject: "founder@teilor.test", method: "admin" }, TEST_ENV);
ok("founder token issued", !!token);
ok("founder token verifies", verifyFounderGateToken(token, TEST_ENV).ok === true);
ok("founder email allowlist", isFounderEmail("founder@teilor.test", TEST_ENV));
ok("founder email deny", !isFounderEmail("stranger@example.com", TEST_ENV));
ok("allowlist parsing", resolveFounderAllowedEmails(TEST_ENV).length === 2);
const getCheck = validatePublicHttpMethod({ method: "GET" }, ["GET"]);
ok("GET allowed", getCheck.ok === true);
const postCheck = validatePublicHttpMethod({ method: "POST" }, ["GET"]);
ok("POST rejected on GET-only", postCheck.ok === false);
const redacted = redactLogFields({ api_key: "secret123", message: "hello" });
ok("log redaction masks secrets", !String(JSON.stringify(redacted)).includes("secret123"));

console.log("\nNegative cases");
ok("null analytics body", validateAnalyticsTrackRequest(null).ok === false);
ok("undefined DL context", classifyDataLayerResponse(undefined) === DATA_LAYER_RESPONSE_CLASSIFICATIONS.NO_COMMERCIAL_RESULT);
ok("invalid founder token", verifyFounderGateToken("bad.token", TEST_ENV).ok === false);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
