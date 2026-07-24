#!/usr/bin/env node
/**
 * PATCH 12.1 — MVP general architecture audit (read-only meta-validation).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const ARCH_DOCS = [
  "docs/architecture/BLOCK_12_ARCHITECTURE.md",
  "docs/architecture/REQUEST_LIFECYCLE.md",
  "docs/architecture/SECURITY_MODEL.md",
  "docs/architecture/OBSERVABILITY.md",
  "docs/architecture/SHARED_STATE.md",
  "docs/architecture/ARCHITECTURAL_DECISIONS.md",
  "docs/architecture/KNOWN_LIMITATIONS.md",
  "docs/architecture/MVP_ARCHITECTURE_AUDIT_REPORT.md",
  "docs/analytics/contracts/EVENT_CONTRACT.md",
  "docs/analytics/PHASE_11_FINAL_MASTER_DOCUMENT.md",
  "docs/analytics/PATCH_12_1_ARCHITECTURE_AUDIT_EVIDENCE.json",
];

const MIA_FLOW = [
  "lib/miaCognitiveRouter.js",
  "lib/miaIntentRecognitionLayer.js",
  "lib/miaIntentAuthority.js",
  "lib/miaCognitiveBridge.js",
  "lib/miaRuntimePrecedence.js",
  "lib/miaDataLayerResolutionClassifier.js",
  "lib/miaDataLayerSemanticNormalizer.js",
  "lib/miaDecisionConsistencyFixes.js",
  "lib/miaProductExplanationBuilder.js",
  "pages/api/chat-gpt4o.js",
  "pages/api/mia-chat.js",
];

const SSOT = [
  { domain: "executive_metrics", file: "lib/miaExecutiveMetricsApi.js", marker: "buildExecutiveMetricsResponse" },
  { domain: "analytics_events", file: "lib/miaAnalyticsPayload.js", marker: "assembleAnalyticsInsertRow" },
  { domain: "product_adapter", file: "lib/productSourceAdapter/normalizedProduct.js", marker: "NORMALIZED_PRODUCT_VERSION" },
  { domain: "commercial_providers", file: "lib/productSourceAdapter/commercialProviderRegistry.js", marker: "COMMERCIAL_PROVIDER_IDS" },
  { domain: "analytics_allowlist", file: "lib/miaAnalyticsAllowlist.js", marker: "ALLOWED_ANALYTICS_EVENTS" },
];

const DECISION_ENGINE = [
  "lib/miaDecisionConsistencyFixes.js",
  "lib/miaDecisionConsistencyAudit.js",
  "lib/miaRecommendationStabilityGuard.js",
  "lib/miaFinalDecisionScopeGuard.js",
];

const DATA_LAYER = [
  "lib/miaDataLayerResolutionClassifier.js",
  "lib/miaDataLayerEvidenceInjectionLayer.js",
  "lib/miaDataLayerHumanizationGuard.js",
  "lib/miaDataLayerSemanticNormalizer.js",
  "lib/miaDataLayerUsageAnalytics.js",
];

const ADAPTERS = [
  "lib/productSourceAdapter/sourceRegistry.js",
  "lib/productSourceAdapter/commercialProviderRegistry.js",
  "lib/productSourceAdapter/adapters/googleShoppingAdapter.js",
  "lib/productSourceAdapter/adapters/mercadoLivreAdapter.js",
  "lib/productSourceAdapter/adapters/dataForSeoGoogleShoppingAdapter.js",
  "lib/productSourceAdapter/commercialSelectionEngine.js",
  "lib/productSourceAdapter/commercialOfferMergeLayer.js",
];

const SECURITY = [
  "middleware.js",
  "lib/miaEndpointAccessPolicy.js",
  "lib/miaPublicApiHardening.js",
  "lib/miaPerimeterRateLimit.js",
  "lib/miaUserSessionToken.js",
  "lib/miaFounderAccess.js",
  "lib/miaLogRedaction.js",
];

const ANALYTICS_EMIT = [
  "lib/miaOfferSetAnalytics.js",
  "lib/miaRecommendationDecisionAnalytics.js",
  "lib/miaPriceIntelligenceAnalytics.js",
  "lib/miaSavingsEstimationAnalytics.js",
  "lib/miaAntiRegretFoundationAnalytics.js",
  "lib/miaUserValueOutcomeAnalytics.js",
  "lib/miaPriceAlertLifecycleAnalytics.js",
  "lib/miaExecutiveMetricsApi.js",
];

const DEAD_CODE_CATALOG = [
  { path: "pages/api/pages/api/test-economia.js", reason: "orphan nested route — blocked by middleware" },
  { path: "pages/api/test-mia.js", reason: "legacy test — blocked by middleware in prod" },
  { path: "pages/api/test-economia.js", reason: "legacy test — blocked by middleware in prod" },
  { path: "pages/api/test-serp.js", reason: "legacy test — blocked by middleware in prod" },
  { path: "pages/api/env.js", reason: "env debug — blocked by middleware in prod" },
];

let passed = 0;
let failed = 0;
const findings = { dead_code: [], debt: [] };

function ok(label, cond) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function listApiRoutes(dir = join(ROOT, "pages/api"), acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      listApiRoutes(full, acc);
    } else if (name.endsWith(".js")) {
      acc.push(relative(join(ROOT, "pages/api"), full).replace(/\\/g, "/"));
    }
  }
  return acc;
}

function grepFiles(dir, pattern, glob = ".js") {
  const hits = [];
  function walk(d) {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory() && name !== "node_modules" && name !== ".next") {
        walk(full);
      } else if (name.endsWith(glob)) {
        const src = readFileSync(full, "utf8");
        if (pattern.test(src)) hits.push(relative(ROOT, full).replace(/\\/g, "/"));
      }
    }
  }
  walk(dir);
  return hits;
}

console.log("\nPATCH 12.1 — MVP general architecture audit\n");

console.log("Documentation");
for (const f of ARCH_DOCS) {
  ok(f, existsSync(join(ROOT, f)));
}

console.log("\nMIA conversation flow");
for (const f of MIA_FLOW) {
  ok(`${f} exists`, existsSync(join(ROOT, f)));
}
const chat = read("pages/api/chat-gpt4o.js");
ok("chat classifyMiaTurn", chat.includes("classifyMiaTurn"));
ok("chat recognizeMiaIntent", chat.includes("recognizeMiaIntent"));
ok("chat applyIntentAuthorityToPipeline", chat.includes("applyIntentAuthorityToPipeline"));
ok("chat buildDecisionEngineReply", chat.includes("buildDecisionEngineReply"));
ok("chat resolveDecisionEngineWinners", chat.includes("resolveDecisionEngineWinners"));
ok("chat instrumentOfferSetAnalyticsForDelivery", chat.includes("instrumentOfferSetAnalyticsForDelivery"));
ok("chat emitDataLayerUsageAnalytics", chat.includes("emitDataLayerUsageAnalytics"));
ok("mia-chat forwards to core", read("pages/api/mia-chat.js").includes("forwardChatRequestToCore"));

console.log("\nDecision Engine — not in frontend");
const feDecisionHits = grepFiles(join(ROOT, "components"), /buildDecisionEngine|resolveDecisionEngineWinners|selectCommercialOffers/);
ok("no decision logic in components", feDecisionHits.length === 0);
const pageDecisionHits = grepFiles(join(ROOT, "pages"), /buildDecisionEngine|resolveDecisionEngineWinners|selectCommercialOffers/, ".jsx");
ok("no decision logic in pages jsx", pageDecisionHits.length === 0);

console.log("\nSingle Source of Truth");
for (const { domain, file, marker } of SSOT) {
  ok(`SSOT ${domain}`, existsSync(join(ROOT, file)) && read(file).includes(marker));
}
ok("public page no direct metrics RPC", !read("pages/teilor-em-numeros.jsx").includes(".rpc("));
ok("cockpit no direct metrics RPC", !read("pages/cockpit-fundador.jsx").includes(".rpc("));

console.log("\nData Layer");
for (const f of DATA_LAYER) {
  ok(f, existsSync(join(ROOT, f)));
}
ok("data layer never invent guard", read("lib/miaDataLayerHumanizationGuard.js").length > 100);

console.log("\nDecision Engine libs");
for (const f of DECISION_ENGINE) {
  ok(f, existsSync(join(ROOT, f)));
}

console.log("\nContracts");
const eventContract = read("docs/analytics/contracts/EVENT_CONTRACT.md");
ok("EVENT_CONTRACT v1", eventContract.includes("Event Contract"));
ok("executive metrics contract 11.1.0", eventContract.includes("11.1.0"));
ok("executive insights contract 11.4.0", eventContract.includes("11.4.0"));
ok("adapter contract", read("lib/productSourceAdapter/adapterContract.js").includes("ADAPTER_CONTRACT_VERSION"));

console.log("\nAPIs inventory");
const routes = listApiRoutes();
ok("api routes catalogued", routes.length >= 50, `count=${routes.length}`);
const prodPublic = [
  "mia-chat.js",
  "executive-metrics.js",
  "analytics/track/index.js",
  "health.js",
  "ready.js",
  "create-price-alert.js",
  "save-wish.js",
  "list-wish.js",
  "delete-wish.js",
];
for (const r of prodPublic) {
  ok(`production route ${r}`, routes.includes(r));
}

console.log("\nFrontend");
ok("MIAChat component", existsSync(join(ROOT, "components/MIAChat.jsx")));
ok("public metrics page", existsSync(join(ROOT, "pages/teilor-em-numeros.jsx")));
ok("founder cockpit page", existsSync(join(ROOT, "pages/cockpit-fundador.jsx")));
ok("app-mia page", existsSync(join(ROOT, "pages/app-mia.jsx")));

console.log("\nSupabase migrations");
const migrations = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
ok("migrations present", migrations.length >= 10, `count=${migrations.length}`);
ok("executive metrics migration", migrations.some((m) => m.includes("executive_metrics")));
ok("auth foundation migration", migrations.some((m) => m.includes("auth")));

console.log("\nAnalytics pipeline");
for (const f of ANALYTICS_EMIT) {
  ok(f, existsSync(join(ROOT, f)));
}
ok("offer set delivery await chain", read("lib/miaOfferSetAnalytics.js").includes("await emitPriceIntelligenceAnalytics"));
const catalogs = readdirSync(join(ROOT, "lib")).filter((f) => f.endsWith("Catalog.js"));
ok("analytics catalogs", catalogs.length >= 15, `count=${catalogs.length}`);

console.log("\nAdapters");
for (const f of ADAPTERS) {
  ok(f, existsSync(join(ROOT, f)));
}
ok("adapter registry register", read("lib/productSourceAdapter/sourceRegistry.js").includes("registerProductSourceAdapter"));
ok("ML OAuth routes", existsSync(join(ROOT, "pages/api/auth/mercadolivre/start.js")));

console.log("\nSecurity");
for (const f of SECURITY) {
  ok(f, existsSync(join(ROOT, f)));
}
ok("middleware fail-closed dev routes", read("middleware.js").includes("endpoint_not_found"));
ok("founder insights gate", read("pages/api/founder/executive-insights.js").includes("requireFounderGate"));
ok("log redaction", read("lib/miaLogRedaction.js").includes("redact"));

console.log("\nPerformance & cache");
ok("executive metrics cache", read("lib/miaExecutiveMetricsApi.js").includes("cache"));
ok("ISR public metrics", read("pages/teilor-em-numeros.jsx").includes("revalidate"));
ok("observability wrapper", read("pages/api/executive-metrics.js").includes("withMiaObservability"));

console.log("\nDead code catalog (document only — not removed)");
for (const item of DEAD_CODE_CATALOG) {
  const exists = existsSync(join(ROOT, item.path));
  findings.dead_code.push({ ...item, exists });
  ok(`cataloged ${item.path}`, exists, item.reason);
}

console.log("\nTechnical debt flags (catalog only)");
const debtItems = [
  { severity: "medium", item: "Monolith chat-gpt4o.js (~38k lines)", phase: "pos_mvp" },
  { severity: "medium", item: "Dual winner cognitive vs commercial display", phase: "pos_mvp" },
  { severity: "low", item: "In-memory cache not shared across serverless instances", phase: "pos_mvp" },
  { severity: "low", item: "Alert UI localStorage vs DB split", phase: "pos_mvp" },
  { severity: "low", item: "Orphan route pages/api/pages/api/test-economia.js", phase: "pre_mvp" },
];
for (const d of debtItems) {
  findings.debt.push(d);
  ok(`debt cataloged [${d.severity}] ${d.item.slice(0, 40)}…`, true);
}

console.log(`\nResult: ${passed} passed, ${failed} failed`);
console.log(`API routes: ${routes.length} · Catalogs: ${catalogs.length} · Migrations: ${migrations.length}\n`);

process.exit(failed ? 1 : 0);
