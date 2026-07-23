#!/usr/bin/env node
/**
 * PATCH 10.3 — Price Alert Lifecycle Analytics audit
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_EVENT,
  MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_VERSION,
  buildPriceAlertLifecycleAnalyticsPayload,
  buildPriceAlertLifecycleDedupKey,
  instrumentPriceAlertLifecycleFromCreation,
  instrumentPriceAlertLifecycleFromCheck,
  instrumentPriceAlertLifecycleFromNotification,
  MIA_ALERT_LIFECYCLE_STAGE,
  MIA_ALERT_LIFECYCLE_RESERVED,
  MIA_ALERT_STATUS,
  MIA_ALERT_SOURCE,
  MIA_ALERT_TARGET_REALISM,
  MIA_ALERT_CREATION_FAILURE_REASON,
} from "../lib/miaPriceAlertLifecycleAnalytics.js";
import {
  resolveAlertSourceFromCreateInput,
  resolveTargetRealism,
  buildRequestedLifecycleMetadata,
  buildCreatedLifecycleMetadata,
  buildCheckedLifecycleMetadata,
  buildTargetReachedLifecycleMetadata,
  buildNotificationLifecycleMetadata,
  buildFailedLifecycleMetadata,
} from "../lib/miaPriceAlertLifecycleClassifier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CREATE_API = join(ROOT, "pages/api/create-price-alert.js");
const DRY_RUN = join(ROOT, "lib/miaPriceAlertDryRun.js");
const SEND_GATE = join(ROOT, "lib/miaPriceAlertSendGate.js");

const SQL_FILES = Array.from({ length: 30 }, (_, i) =>
  `patch-103-query${i + 1}-${[
    "requested-daily",
    "created-success",
    "creation-rate",
    "creation-failures-by-reason",
    "alert-status-distribution",
    "lifecycle-stage-distribution",
    "target-vs-current-distribution",
    "target-realism-distribution",
    "target-distance-avg-median",
    "alerts-checked-once",
    "check-frequency-volume",
    "check-failures-by-reason",
    "target-reached-alerts",
    "target-reached-rate",
    "time-to-target-avg-median",
    "checks-until-target-avg",
    "notifications-prepared",
    "notifications-sent",
    "notifications-delivered-reserved",
    "notification-failures",
    "user-return-reserved",
    "offer-opened-reserved",
    "potential-savings-avg",
    "potential-savings-total",
    "lifecycle-by-source",
    "lifecycle-by-provider",
    "lifecycle-funnel",
    "time-between-stages",
    "dedup-by-stage",
    "orphan-invalid-transitions",
  ][i]}.sql`
);

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

const alertId = "00000000-0000-4000-8000-000000000099";
const userId = "00000000-0000-4000-8000-000000000001";

console.log("\nPATCH 10.3 — Price Alert Lifecycle Analytics audit\n");

console.log("Contract");
assert("event name", MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_EVENT === "mia_price_alert_lifecycle");
assert("event version", MIA_PRICE_ALERT_LIFECYCLE_ANALYTICS_VERSION === "10.3.0");

console.log("\nReserved stages");
for (const stage of MIA_ALERT_LIFECYCLE_RESERVED) {
  assert(`reserved ${stage}`, Object.values(MIA_ALERT_LIFECYCLE_STAGE).includes(stage));
}
assert(
  "notification delivered reserved",
  MIA_ALERT_LIFECYCLE_RESERVED.includes(MIA_ALERT_LIFECYCLE_STAGE.NOTIFICATION_DELIVERED)
);

console.log("\nAlert source");
assert(
  "offer card with url",
  resolveAlertSourceFromCreateInput({ product_url: "https://shop.example/item", current_price: 100 }) ===
    MIA_ALERT_SOURCE.OFFER_CARD
);
assert(
  "price alert page explicit target",
  resolveAlertSourceFromCreateInput({ current_price: 100, target_price: 90 }) ===
    MIA_ALERT_SOURCE.PRICE_ALERT_PAGE
);

console.log("\nTarget realism");
assert("near", resolveTargetRealism(100, 99) === MIA_ALERT_TARGET_REALISM.TARGET_NEAR_CURRENT);
assert("moderate", resolveTargetRealism(100, 95) === MIA_ALERT_TARGET_REALISM.TARGET_MODERATE);
assert("aggressive", resolveTargetRealism(100, 80) === MIA_ALERT_TARGET_REALISM.TARGET_AGGRESSIVE);
assert("extreme", resolveTargetRealism(100, 50) === MIA_ALERT_TARGET_REALISM.TARGET_EXTREME);
assert("already reached", resolveTargetRealism(100, 100) === MIA_ALERT_TARGET_REALISM.TARGET_ALREADY_REACHED);
assert("invalid above", resolveTargetRealism(100, 110) === MIA_ALERT_TARGET_REALISM.INVALID);

console.log("\nCreation metadata");
const requested = buildRequestedLifecycleMetadata(
  { current_price: 500, target_price: 450, product_url: "https://x.com/p" },
  { userId }
);
assert("requested stage", requested.lifecycle_stage === MIA_ALERT_LIFECYCLE_STAGE.REQUESTED);
assert("requested pending", requested.alert_status === MIA_ALERT_STATUS.PENDING);

const created = buildCreatedLifecycleMetadata(
  { id: alertId, user_id: userId, current_price: 500, target_price: 450, normalized_product_key: "abc" },
  { current_price: 500, target_price: 450 },
  { userId, duplicate: false }
);
assert("created stage", created.lifecycle_stage === MIA_ALERT_LIFECYCLE_STAGE.CREATED);
assert("created success", created.creation_success === true);
assert("alert id", created.alert_id === alertId);

const duplicate = buildCreatedLifecycleMetadata(
  { id: alertId, user_id: userId, current_price: 500, target_price: 450 },
  { current_price: 500, target_price: 450 },
  { userId, duplicate: true }
);
assert("duplicate reason", duplicate.creation_failure_reason === MIA_ALERT_CREATION_FAILURE_REASON.DUPLICATE_ALERT);
assert("duplicate flag", duplicate.duplicate_existing === true);

const failedMeta = buildFailedLifecycleMetadata({
  userId,
  failureReason: MIA_ALERT_CREATION_FAILURE_REASON.VALIDATION_FAILED,
});
assert("failed stage", failedMeta.lifecycle_stage === MIA_ALERT_LIFECYCLE_STAGE.FAILED);
assert("failed status", failedMeta.alert_status === MIA_ALERT_STATUS.FAILED);

console.log("\nCheck metadata");
const alertRow = {
  id: alertId,
  user_id: userId,
  current_price: 500,
  target_price: 450,
  check_count: 2,
  normalized_product_key: "abc",
};
const evaluationAbove = {
  alert_id: alertId,
  target_price: 450,
  best_found_price: 480,
  best_found_source: "google_shopping",
  eligible_for_email: false,
  reason: "price_above_target",
};
const checked = buildCheckedLifecycleMetadata(alertRow, evaluationAbove, { dryRun: true });
assert("checked stage", checked.lifecycle_stage === MIA_ALERT_LIFECYCLE_STAGE.CHECKED);
assert("check id increment", checked.check_id === "3");
assert("not target reached", checked.target_reached === false);

const evaluationReached = {
  alert_id: alertId,
  target_price: 450,
  best_found_price: 440,
  best_found_source: "google_shopping",
  eligible_for_email: true,
  reason: "eligible_below_target",
};
const targetReached = buildTargetReachedLifecycleMetadata(alertRow, evaluationReached);
assert("target reached stage", targetReached.lifecycle_stage === MIA_ALERT_LIFECYCLE_STAGE.TARGET_REACHED);
assert("target reached flag", targetReached.target_reached === true);
assert("opportunity nature", targetReached.savings_nature === "ALERT_OPPORTUNITY");
assert("no purchase confirmed", targetReached.purchase_confirmed === false);
assert("not verified savings", targetReached.savings_type !== "VERIFIED");

console.log("\nNotification metadata");
const notifPrepared = buildNotificationLifecycleMetadata(alertRow, evaluationReached, {
  stage: MIA_ALERT_LIFECYCLE_STAGE.NOTIFICATION_PREPARED,
  success: true,
});
assert("prepared stage", notifPrepared.lifecycle_stage === MIA_ALERT_LIFECYCLE_STAGE.NOTIFICATION_PREPARED);

const notifSent = buildNotificationLifecycleMetadata(alertRow, evaluationReached, {
  stage: MIA_ALERT_LIFECYCLE_STAGE.NOTIFICATION_SENT,
  success: true,
});
assert("sent stage", notifSent.lifecycle_stage === MIA_ALERT_LIFECYCLE_STAGE.NOTIFICATION_SENT);
assert("sent completed status", notifSent.alert_status === MIA_ALERT_STATUS.COMPLETED);

console.log("\nPayload privacy");
const built = buildPriceAlertLifecycleAnalyticsPayload({
  metadata: created,
  analyticsContext: { user_id: userId },
});
const blob = JSON.stringify(built.payload.metadata);
assert("category", built.payload.category === "price_alert_lifecycle");
assert("no query_text", !built.payload.query_text);
assert("no product_name key", !Object.prototype.hasOwnProperty.call(built.payload.metadata || {}, "product_name"));
assert("no url in blob", !/https:\/\//.test(blob));
assert("no email pii", !/"user_email"|[^\s"]+@[^\s"]+/.test(blob));
assert("purchase not confirmed", built.payload.metadata?.purchase_confirmed === false);

console.log("\nDedup key");
assert(
  "dedup format",
  buildPriceAlertLifecycleDedupKey(alertId, "mia_price_alert_lifecycle", "10.3.0", "CREATED", "create").includes("CREATED")
);

console.log("\nInstrument helpers (no supabase)");
instrumentPriceAlertLifecycleFromCreation(null, {
  body: { current_price: 100, target_price: 90, product_name: "Test Product" },
  userId,
  failed: true,
  failureReason: MIA_ALERT_CREATION_FAILURE_REASON.VALIDATION_FAILED,
});
instrumentPriceAlertLifecycleFromCheck(null, { alert: alertRow, evaluation: evaluationAbove, dryRun: true });
instrumentPriceAlertLifecycleFromCheck(null, { alert: alertRow, evaluation: evaluationReached, dryRun: true });
assert(
  "notification delivered blocked",
  instrumentPriceAlertLifecycleFromNotification(null, {
    alert: alertRow,
    evaluation: evaluationReached,
    stage: MIA_ALERT_LIFECYCLE_STAGE.NOTIFICATION_DELIVERED,
  }) === null
);
instrumentPriceAlertLifecycleFromNotification(null, {
  alert: alertRow,
  evaluation: evaluationReached,
  stage: MIA_ALERT_LIFECYCLE_STAGE.NOTIFICATION_SENT,
  success: true,
});

console.log("\nHooks");
const createApi = readFileSync(CREATE_API, "utf8");
const dryRun = readFileSync(DRY_RUN, "utf8");
const sendGate = readFileSync(SEND_GATE, "utf8");
assert("create imports lifecycle", createApi.includes("instrumentPriceAlertLifecycleFromCreation"));
assert("dry run imports lifecycle", dryRun.includes("instrumentPriceAlertLifecycleFromCheck"));
assert("send gate imports lifecycle", sendGate.includes("instrumentPriceAlertLifecycleFromNotification"));
assert("send gate notification prepared", sendGate.includes("NOTIFICATION_PREPARED"));
assert("send gate notification sent", sendGate.includes("NOTIFICATION_SENT"));

console.log("\nSQL files");
for (const file of SQL_FILES) {
  const path = join(ROOT, "docs/analytics/sql", file);
  assert(`${file} exists`, existsSync(path));
  const sql = readFileSync(path, "utf8");
  assert(`${file} uses event`, sql.includes("mia_price_alert_lifecycle"));
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
