#!/usr/bin/env node
/**
 * PATCH 8.1 — Commercial Search Analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMERCIAL_PERMISSION } from "../lib/miaIntentAuthority.js";
import { MIA_INTERACTION_MODES } from "../lib/miaIntentRecognitionLayer.js";
import {
  COMMERCIAL_SEARCH_QUERY_MAX_LENGTH,
  sanitizeCommercialSearchQueryText,
  areSanitizedCommercialQueriesEqual,
} from "../lib/miaCommercialSearchQuerySanitizer.js";
import {
  shouldEnterCommercialSearchAnalyticsDomain,
  resolveCommercialSearchIntentType,
  resolveQueryExtractionStatus,
  resolveQueryChangeType,
  resolveCommercialGateStatus,
  resolveSearchExecutionStatus,
  resolveCommercialSearchPath,
  resolveSearchResultStatus,
  resolveCommercialSearchTerminationStage,
} from "../lib/miaCommercialSearchClassifier.js";
import {
  buildCommercialSearchDedupKey,
  createCommercialSearchTracker,
  beginCommercialSearchTracker,
  updateCommercialSearchTrackerFromPipeline,
  finalizeCommercialSearchTracker,
  markCommercialSearchTrackerEmitted,
} from "../lib/miaCommercialSearchTracker.js";
import {
  buildCommercialSearchAnalyticsPayload,
  buildCommercialSearchRecommendationMetadata,
  MIA_COMMERCIAL_SEARCH_ANALYTICS_EVENT,
  MIA_COMMERCIAL_SEARCH_ANALYTICS_VERSION,
} from "../lib/miaCommercialSearchAnalytics.js";
import {
  MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES,
  MIA_COMMERCIAL_SEARCH_GATE_STATUSES,
  MIA_COMMERCIAL_SEARCH_INTENT_TYPES,
  MIA_COMMERCIAL_SEARCH_PATHS,
  MIA_COMMERCIAL_SEARCH_QUERY_CHANGE_TYPES,
  MIA_COMMERCIAL_SEARCH_QUERY_EXTRACTION_STATUSES,
  MIA_COMMERCIAL_SEARCH_RESULT_STATUSES,
  MIA_COMMERCIAL_SEARCH_RUNTIME_MODES,
} from "../lib/miaCommercialSearchCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");

const SPLIT_FILES = [
  "patch-81-query1-search-volume.sql",
  "patch-81-query2-query-extraction.sql",
  "patch-81-query3-search-paths.sql",
  "patch-81-query4-search-results.sql",
  "patch-81-query5-correlation-diagnostic.sql",
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

console.log("\nPATCH 8.1 — Commercial Search Analytics audit\n");

console.log("Domain eligibility");
assert("allow enters domain", shouldEnterCommercialSearchAnalyticsDomain({ commercialPermission: COMMERCIAL_PERMISSION.ALLOW }));
assert("mixed enters domain", shouldEnterCommercialSearchAnalyticsDomain({ commercialPermission: COMMERCIAL_PERMISSION.MIXED }));
assert("deny excluded", !shouldEnterCommercialSearchAnalyticsDomain({ commercialPermission: COMMERCIAL_PERMISSION.DENY }));

console.log("\nIntent type");
assert("mixed intent", resolveCommercialSearchIntentType({ interactionMode: MIA_INTERACTION_MODES.MIXED }) === MIA_COMMERCIAL_SEARCH_INTENT_TYPES.MIXED);
assert("commercial intent", resolveCommercialSearchIntentType({ commercialPermission: COMMERCIAL_PERMISSION.ALLOW }) === MIA_COMMERCIAL_SEARCH_INTENT_TYPES.COMMERCIAL);

console.log("\nSanitization");
assert("email redacted", sanitizeCommercialSearchQueryText("meu email joao@test.com")?.includes("[email_redacted]"));
assert("phone redacted", sanitizeCommercialSearchQueryText("ligue 11999998888")?.includes("[phone_redacted]"));
assert("url redacted", sanitizeCommercialSearchQueryText("veja https://example.com/x")?.includes("[url_redacted]"));
assert("truncation", sanitizeCommercialSearchQueryText("a".repeat(COMMERCIAL_SEARCH_QUERY_MAX_LENGTH + 50))?.endsWith("…"));
assert("equal sanitized", areSanitizedCommercialQueriesEqual("  celular  ", "celular"));

console.log("\nQuery extraction");
assert("not required pure commercial", resolveQueryExtractionStatus({ intentType: MIA_COMMERCIAL_SEARCH_INTENT_TYPES.COMMERCIAL }) === MIA_COMMERCIAL_SEARCH_QUERY_EXTRACTION_STATUSES.NOT_REQUIRED);
assert("success mixed", resolveQueryExtractionStatus({ intentType: MIA_COMMERCIAL_SEARCH_INTENT_TYPES.MIXED, mixedSegmentationApplied: true, commercialPipelineQuery: "celular samsung", validation: { valid: true } }) === MIA_COMMERCIAL_SEARCH_QUERY_EXTRACTION_STATUSES.SUCCESS);
assert("failed empty", resolveQueryExtractionStatus({ intentType: MIA_COMMERCIAL_SEARCH_INTENT_TYPES.MIXED, mixedSegmentationApplied: true, commercialPipelineQuery: "" }) === MIA_COMMERCIAL_SEARCH_QUERY_EXTRACTION_STATUSES.FAILED);

console.log("\nQuery change type");
assert("none unchanged", resolveQueryChangeType({ originalQuery: "celular samsung", extractedQuery: "celular samsung", normalizedQuery: "celular samsung" }) === MIA_COMMERCIAL_SEARCH_QUERY_CHANGE_TYPES.NONE);
assert("extraction", resolveQueryChangeType({ originalQuery: "estou cansado mas quero celular", extractedQuery: "celular", mixedSegmentationApplied: true }) === MIA_COMMERCIAL_SEARCH_QUERY_CHANGE_TYPES.EXTRACTION);
assert("normalization", resolveQueryChangeType({ originalQuery: "iphone 15", extractedQuery: "iphone 15", normalizedQuery: "iphone 15 preço" }) === MIA_COMMERCIAL_SEARCH_QUERY_CHANGE_TYPES.NORMALIZATION);

console.log("\nGate & execution");
assert("gate passed", resolveCommercialGateStatus({ commercialEntryAllowed: true }) === MIA_COMMERCIAL_SEARCH_GATE_STATUSES.PASSED);
assert("gate blocked", resolveCommercialGateStatus({ commercialEntryAllowed: false }) === MIA_COMMERCIAL_SEARCH_GATE_STATUSES.BLOCKED);
assert("executed", resolveSearchExecutionStatus({ searchExecuted: true, gateStatus: MIA_COMMERCIAL_SEARCH_GATE_STATUSES.PASSED }) === MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.EXECUTED);
assert("not executed blocked", resolveSearchExecutionStatus({ gateStatus: MIA_COMMERCIAL_SEARCH_GATE_STATUSES.BLOCKED }) === MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.NOT_EXECUTED);

console.log("\nSearch path");
assert("data layer only", resolveCommercialSearchPath({ searchExecuted: true, dataLayerAttempted: true, dataLayerUsedAsPrimarySource: true, providerContinuationRequired: false }) === MIA_COMMERCIAL_SEARCH_PATHS.DATA_LAYER_ONLY);
assert("provider only", resolveCommercialSearchPath({ searchExecuted: true, dataLayerAttempted: false, providerContinuationRequired: true }) === MIA_COMMERCIAL_SEARCH_PATHS.PROVIDER_ONLY);
assert("no search follow-up", resolveCommercialSearchPath({ hasPriorityFollowUp: true, searchExecuted: false }) === MIA_COMMERCIAL_SEARCH_PATHS.NO_SEARCH);

console.log("\nSearch result");
assert("results found", resolveSearchResultStatus({ resultsCount: 3, searchExecuted: true, executionStatus: MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.EXECUTED }) === MIA_COMMERCIAL_SEARCH_RESULT_STATUSES.RESULTS_FOUND);
assert("no results", resolveSearchResultStatus({ resultsCount: 0, searchExecuted: true, executionStatus: MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.EXECUTED }) === MIA_COMMERCIAL_SEARCH_RESULT_STATUSES.NO_RESULTS);
assert("fallback result", resolveSearchResultStatus({ resultsCount: 2, fallbackUsed: true, searchExecuted: true, executionStatus: MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.EXECUTED }) === MIA_COMMERCIAL_SEARCH_RESULT_STATUSES.FALLBACK_RESULT);

console.log("\nTracker lifecycle");
{
  const tracker = createCommercialSearchTracker({ requestId: "req-1" });
  beginCommercialSearchTracker(tracker, {
    commercialPermission: COMMERCIAL_PERMISSION.ALLOW,
    interactionMode: MIA_INTERACTION_MODES.COMMERCE,
    commercialEntryGateResult: { commercialEntryAllowed: true },
    originalQuery: "celular samsung",
    commercialPipelineQuery: "celular samsung",
    commercialQuery: "celular samsung",
  });
  assert("tracker active", tracker.active);
  updateCommercialSearchTrackerFromPipeline(tracker, {
    dataLayerAttempted: true,
    dataLayerUsedAsPrimarySource: true,
    searchExecuted: true,
    resultsCount: 4,
    rankingCompleted: true,
  });
  const metadata = finalizeCommercialSearchTracker(tracker, {
    responsePath: "return_seguro",
    body: { prices: [{ product_name: "A" }] },
  });
  assert("finalized metadata", metadata?.search_path === MIA_COMMERCIAL_SEARCH_PATHS.DATA_LAYER_ONLY);
  assert("runtime legacy default", metadata?.runtime_mode === MIA_COMMERCIAL_SEARCH_RUNTIME_MODES.LEGACY);
  markCommercialSearchTrackerEmitted(tracker);
  assert("double finalize blocked", finalizeCommercialSearchTracker(tracker, {}) == null);
}

console.log("\nPayload");
{
  const built = buildCommercialSearchAnalyticsPayload({
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    analyticsContext: {
      session_id: "550e8400-e29b-41d4-a716-446655440001",
      visitor_id: "550e8400-e29b-41d4-a716-446655440002",
      conversation_id: "550e8400-e29b-41d4-a716-446655440003",
    },
    metadata: {
      event_version: MIA_COMMERCIAL_SEARCH_ANALYTICS_VERSION,
      request_id: "550e8400-e29b-41d4-a716-446655440000",
      intent_type: MIA_COMMERCIAL_SEARCH_INTENT_TYPES.COMMERCIAL,
      search_execution_status: MIA_COMMERCIAL_SEARCH_EXECUTION_STATUSES.EXECUTED,
      source: "server",
    },
    queryText: "celular samsung",
  });
  assert("event name", built.payload.event_name === MIA_COMMERCIAL_SEARCH_ANALYTICS_EVENT);
  assert("event version metadata", built.payload.metadata?.event_version === MIA_COMMERCIAL_SEARCH_ANALYTICS_VERSION);
  assert("request_id metadata", built.payload.metadata?.request_id === "550e8400-e29b-41d4-a716-446655440000");
  assert("no forbidden secret key", !("api_key" in (built.payload.metadata || {})));
  const rec = buildCommercialSearchRecommendationMetadata(built.summary);
  assert("recommendation metadata", rec.commercial_search_event_version === MIA_COMMERCIAL_SEARCH_ANALYTICS_VERSION);
}

console.log("\nDeduplication key");
assert("dedup key format", buildCommercialSearchDedupKey("r1", MIA_COMMERCIAL_SEARCH_ANALYTICS_EVENT, MIA_COMMERCIAL_SEARCH_ANALYTICS_VERSION) === `r1|${MIA_COMMERCIAL_SEARCH_ANALYTICS_EVENT}|${MIA_COMMERCIAL_SEARCH_ANALYTICS_VERSION}`);

console.log("\nRuntime hooks");
const chatApi = readFileSync(CHAT_API, "utf8");
assert("initialize hook", chatApi.includes("initializeCommercialSearchAnalyticsTracking"));
assert("pipeline update hook", chatApi.includes("updateCommercialSearchAnalyticsFromPipeline"));
assert("delivery hook", chatApi.includes("instrumentCommercialSearchAnalyticsForDelivery"));
assert("no provider detail fields", !chatApi.includes("provider_attempt_status"));

console.log("\nSQL");
for (const file of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", file);
  const sql = readFileSync(path, "utf8");
  assert(`${file} exists`, existsSync(path));
  assert(`${file} uses mia_commercial_search`, /mia_commercial_search/i.test(sql));
  assert(`${file} has tipo_analise`, /tipo_analise/i.test(sql));
  assert(`${file} excludes commercial_search_test`, /commercial_search_test/i.test(sql));
}

console.log(`\nPATCH 8.1 audit: ${passed}/${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
