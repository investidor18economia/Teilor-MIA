#!/usr/bin/env node
/**
 * PATCH 7.2 — Error reliability analytics audit.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildErrorDedupKey,
  classifyErrorEvent,
  extractRuntimeErrorSignals,
} from "../lib/miaErrorClassifier.js";
import {
  MIA_ERROR_LAYERS,
  MIA_ERROR_SEVERITIES,
  MIA_ERROR_TYPES,
  MIA_RECOVERY_METHODS,
  resolveReasonCodeMapping,
} from "../lib/miaErrorReasonCodeCatalog.js";
import {
  buildErrorAnalyticsPayload,
  MIA_ERROR_ANALYTICS_EVENT,
  MIA_ERROR_ANALYTICS_VERSION,
} from "../lib/miaErrorAnalytics.js";
import { MIA_RESPONSE_OUTCOMES } from "../lib/miaResponseOutcomeClassifier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS_DIR = join(ROOT, "docs/analytics");

const SQL_FILE = join(ANALYTICS_DIR, "analytics-reliability-error.sql");
const USAGE_DOC = join(ANALYTICS_DIR, "RELIABILITY_ERROR_ANALYTICS.md");
const PATCH_DOC = join(ANALYTICS_DIR, "PATCH_7.2_ERROR_ANALYTICS.md");
const EVENT_CONTRACT = join(ANALYTICS_DIR, "contracts/EVENT_CONTRACT.md");
const CLASSIFIER_FILE = join(ROOT, "lib/miaErrorClassifier.js");
const CATALOG_FILE = join(ROOT, "lib/miaErrorReasonCodeCatalog.js");
const ANALYTICS_LIB = join(ROOT, "lib/miaErrorAnalytics.js");
const CHAT_API = join(ROOT, "pages/api/chat-gpt4o.js");

const SPLIT_FILES = [
  "patch-72-query1-error-overview.sql",
  "patch-72-query2-error-dimensions.sql",
  "patch-72-query3-recovery-correlation.sql",
  "patch-72-query4-evolution-gaps-panel.sql",
];

const REQUIRED_ALIASES = [
  "dia_referencia",
  "tipo_analise",
  "metrica",
  "valor_absoluto",
  "valor_relativo",
  "registros_total",
  "referencia_denominador",
  "amostra_analisavel",
];

const REQUIRED_METRICS = [
  "total_error_events",
  "requests_with_error",
  "error_request_rate",
  "recovered_error_count",
  "recovered_error_rate",
  "unrecovered_error_count",
  "unrecovered_error_rate",
  "unknown_error_rate",
];

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ❌ ${label}`);
}

const sql = existsSync(SQL_FILE) ? readFileSync(SQL_FILE, "utf8") : "";
const usageDoc = existsSync(USAGE_DOC) ? readFileSync(USAGE_DOC, "utf8") : "";
const eventContract = readFileSync(EVENT_CONTRACT, "utf8");
const chatApi = readFileSync(CHAT_API, "utf8");

console.log("\nPATCH 7.2 — Error reliability analytics audit\n");

console.log("SQL structure");
assert("main SQL exists", existsSync(SQL_FILE));
assert("uses analytics_events", /from\s+analytics_events/i.test(sql));
assert("filters mia_error_event", /event_name\s*=\s*'mia_error_event'/i.test(sql));
assert("excludes reliability_error_test", /reliability_error_test/i.test(sql));
assert("correlates mia_response_outcome", /mia_response_outcome/i.test(sql));
for (const alias of REQUIRED_ALIASES) {
  assert(`SQL alias ${alias}`, sql.includes(alias));
}
for (const metric of REQUIRED_METRICS) {
  assert(`SQL metric ${metric}`, sql.includes(metric));
}
assert("SQL has 4 query sections", (sql.match(/^-- QUERY /gm) || []).length === 4);

console.log("\nSQL splits");
for (const split of SPLIT_FILES) {
  const path = join(ANALYTICS_DIR, "sql", split);
  assert(`split ${split} exists`, existsSync(path));
  const splitSql = readFileSync(path, "utf8");
  assert(`${split} standalone`, /^with\s+/i.test(splitSql.trim()));
}

console.log("\nClassifier & catalog");
assert(
  "validation error",
  classifyErrorEvent({ reasonCode: "chat_empty_query", httpStatus: 400 }).error_type ===
    MIA_ERROR_TYPES.VALIDATION_ERROR
);
assert(
  "auth error",
  classifyErrorEvent({ reasonCode: "internal_api_auth_invalid", httpStatus: 401 }).error_type ===
    MIA_ERROR_TYPES.AUTHENTICATION_ERROR
);
assert(
  "internal critical",
  classifyErrorEvent({ reasonCode: "chat_internal_error", httpStatus: 500 }).severity ===
    MIA_ERROR_SEVERITIES.CRITICAL
);
assert(
  "recovered provider",
  classifyErrorEvent({
    reasonCode: "provider_error",
    httpStatus: 200,
    recovered: true,
    fallbackUsed: true,
  }).recovery_method === MIA_RECOVERY_METHODS.FALLBACK
);
assert(
  "runtime signal extract",
  extractRuntimeErrorSignals(
    {
      unknownPathFailClosed: true,
      providerAccounting: {
        providers: [{ providerId: "google", failed: true, blockedReason: "provider_error" }],
        costGuardDecisions: [],
      },
    },
    { responseDelivered: true, httpStatus: 200, responseOutcome: MIA_RESPONSE_OUTCOMES.FALLBACK }
  ).length >= 2
);
assert(
  "dedup key stable",
  buildErrorDedupKey("req-1", MIA_ERROR_LAYERS.PROVIDER, "provider_error") ===
    "req-1|PROVIDER|provider_error"
);
assert(
  "catalog chat_empty_query",
  resolveReasonCodeMapping("chat_empty_query").severity === MIA_ERROR_SEVERITIES.INFO
);

console.log("\nAnalytics payload");
const built = buildErrorAnalyticsPayload({
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  reasonCode: "provider_unavailable",
  httpStatus: 200,
  recovered: true,
  fallbackUsed: true,
  responseDelivered: true,
  responseOutcome: MIA_RESPONSE_OUTCOMES.FALLBACK,
  analyticsContext: {
    session_id: "550e8400-e29b-41d4-a716-446655440000",
    visitor_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  },
});
assert("event name", built.payload.event_name === MIA_ERROR_ANALYTICS_EVENT);
assert("event_version", built.payload.metadata?.event_version === MIA_ERROR_ANALYTICS_VERSION);
assert("error_type", built.payload.metadata?.error_type === MIA_ERROR_TYPES.PROVIDER_ERROR);
assert("recovered flag", built.payload.metadata?.recovered === true);
assert("no forbidden keys", !("api_key" in (built.payload.metadata || {})));

console.log("\nRuntime instrumentation");
assert("classifier exists", existsSync(CLASSIFIER_FILE));
assert("catalog exists", existsSync(CATALOG_FILE));
assert("analytics lib exists", existsSync(ANALYTICS_LIB));
assert("chat imports error analytics", /scheduleRuntimeRecoveredErrorAnalytics/.test(chatApi));
assert("chat instrument delivery", /instrumentErrorAnalyticsForDelivery/.test(chatApi));
assert("chat error bucket", /errorAnalytics/.test(chatApi));

console.log("\nDocumentation");
assert("usage doc exists", existsSync(USAGE_DOC));
assert("usage doc error types", /VALIDATION_ERROR/.test(usageDoc));
assert("usage doc dedup", /deduplic/i.test(usageDoc));
assert("usage doc delta 7.1", /7\.1|mia_response_outcome/i.test(usageDoc));
assert("event contract mia_error_event", /mia_error_event/i.test(eventContract));

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
