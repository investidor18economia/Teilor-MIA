#!/usr/bin/env node
/**
 * PATCH 10.6 — Phase 10 final audit meta-validation (read-only).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS = join(ROOT, "docs/analytics");
const SQL = join(ANALYTICS, "sql");

const PHASE10_DOCS = [
  "PRICE_ARCHITECTURE_AUDIT.md",
  "SAVINGS_OUTCOMES_USER_VALUE_ANALYTICS.md",
  "PHASE_10_FINAL_MASTER_DOCUMENT.md",
  "PATCH_10_0_ARCHITECTURE_AUDIT_EVIDENCE.json",
  "PATCH_10_1_PRICE_INTELLIGENCE_EVIDENCE.json",
  "PATCH_10_2_SAVINGS_ESTIMATION_EVIDENCE.json",
  "PATCH_10_3_PRICE_ALERT_LIFECYCLE_EVIDENCE.json",
  "PATCH_10_4_ANTI_REGRET_FOUNDATION_EVIDENCE.json",
  "PATCH_10_5_SAVINGS_OUTCOMES_EVIDENCE.json",
  "PATCH_10_6_FINAL_AUDIT_EVIDENCE.json",
];

const RUNTIME_LIBS = [
  "lib/miaPriceIntelligenceCatalog.js",
  "lib/miaPriceIntelligenceClassifier.js",
  "lib/miaPriceIntelligenceAnalytics.js",
  "lib/miaSavingsEstimationCatalog.js",
  "lib/miaSavingsEstimationClassifier.js",
  "lib/miaSavingsEstimationAnalytics.js",
  "lib/miaPriceAlertLifecycleCatalog.js",
  "lib/miaPriceAlertLifecycleClassifier.js",
  "lib/miaPriceAlertLifecycleAnalytics.js",
  "lib/miaAntiRegretFoundationCatalog.js",
  "lib/miaAntiRegretFoundationClassifier.js",
  "lib/miaAntiRegretFoundationAnalytics.js",
  "lib/miaUserValueOutcomeCatalog.js",
  "lib/miaUserValueOutcomeClassifier.js",
  "lib/miaUserValueOutcomeAnalytics.js",
];

const SEMANTIC_GUARDS = [
  "purchase_confirmed: false",
  "value_verified: false",
  "roi_assumed: false",
  "regret_confirmed: false",
  "satisfaction_assumed: false",
  "MIA_VERIFIED_VALUE_UNAVAILABLE",
  "never auto-convert OBSERVED",
];

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

function countSql(prefix) {
  return readdirSync(SQL).filter((f) => f.startsWith(prefix) && f.endsWith(".sql")).length;
}

console.log("\nPATCH 10.6 — Phase 10 final audit meta-validation\n");

console.log("Evidence & docs");
for (const f of PHASE10_DOCS) {
  ok(f, existsSync(join(ANALYTICS, f)));
}

console.log("\nSQL counts");
ok("patch-101 count 10", countSql("patch-101-query") === 10);
ok("patch-102 count 15", countSql("patch-102-query") === 15);
ok("patch-103 count 30", countSql("patch-103-query") === 30);
ok("patch-104 count 15", countSql("patch-104-query") === 15);
ok("patch-105 count 20", countSql("patch-105-query") === 20);
ok("patch-106 cross-audit count 30", countSql("patch-106-query") === 30);
ok("phase 10 total 120", countSql("patch-10") === 120);

console.log("\nRuntime libs");
for (const f of RUNTIME_LIBS) {
  ok(f, existsSync(join(ROOT, f)));
}

const offerSet = readFileSync(join(ROOT, "lib/miaOfferSetAnalytics.js"), "utf8");
const chat = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
ok("delivery await offer_set", offerSet.includes("await emitOfferSetAnalytics"));
ok("delivery await 10.1", offerSet.includes("await emitPriceIntelligenceAnalytics"));
ok("delivery await 10.2", offerSet.includes("await emitSavingsEstimationAnalytics"));
ok("delivery await 10.4", offerSet.includes("await emitAntiRegretFoundationAnalytics"));
ok("delivery await 10.5", offerSet.includes("await emitUserValueOutcomeAnalytics"));
ok("chat await delivery", chat.includes("await instrumentOfferSetAnalyticsForDelivery"));

const alertLifecycle = readFileSync(join(ROOT, "lib/miaPriceAlertLifecycleAnalytics.js"), "utf8");
ok("alert creation awaitInsert", alertLifecycle.includes("awaitInsert: true"));
ok("alert schedule fire-and-forget optional", alertLifecycle.includes("void emitPriceAlertLifecycleAnalytics"));

console.log("\nSemantic guards in classifiers");
for (const f of [
  "lib/miaUserValueOutcomeClassifier.js",
  "lib/miaAntiRegretFoundationClassifier.js",
  "lib/miaSavingsEstimationClassifier.js",
  "lib/miaPriceAlertLifecycleClassifier.js",
]) {
  const src = readFileSync(join(ROOT, f), "utf8");
  ok(`${f} purchase_confirmed false`, src.includes("purchase_confirmed: false"));
}

const userValue = readFileSync(join(ROOT, "lib/miaUserValueOutcomeClassifier.js"), "utf8");
ok("verified always NOT_AVAILABLE", userValue.includes("MIA_VERIFIED_VALUE_UNAVAILABLE"));
ok("verified_value_amount null path", userValue.includes("verified_value_amount: null"));

console.log("\nEvent contract");
const contract = readFileSync(join(ANALYTICS, "contracts/EVENT_CONTRACT.md"), "utf8");
ok("contract 10.1", contract.includes("mia_price_intelligence"));
ok("contract 10.2", contract.includes("mia_savings_estimation"));
ok("contract 10.3", contract.includes("mia_price_alert_lifecycle"));
ok("contract 10.4", contract.includes("mia_anti_regret_foundation"));
ok("contract 10.5", contract.includes("mia_user_value_outcome"));

console.log("\nPost-decision hooks");
const acceptance = readFileSync(join(ROOT, "lib/miaRecommendationAcceptanceAnalytics.js"), "utf8");
const rejection = readFileSync(join(ROOT, "lib/miaRecommendationRejectionAnalytics.js"), "utf8");
ok("acceptance schedules user value", acceptance.includes("scheduleUserValueOutcomeFromPostDecisionSignal"));
ok("rejection schedules user value", rejection.includes("scheduleUserValueOutcomeFromPostDecisionSignal"));
ok("acceptance schedules anti-regret", acceptance.includes("scheduleAntiRegretFoundationFromPostDecisionSignal"));

console.log("\nCross-audit SQL semantic checks");
const q11 = readFileSync(join(SQL, "patch-106-query11-verified-indevido.sql"), "utf8");
const q12 = readFileSync(join(SQL, "patch-106-query12-purchase-confirmed-indevido.sql"), "utf8");
ok("Q11 detects VERIFIED indevido", q11.includes("verified_value_amount is not null"));
ok("Q12 detects purchase_confirmed", q12.includes("purchase_confirmed = true"));

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
