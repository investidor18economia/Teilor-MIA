#!/usr/bin/env node
/**
 * PATCH A.2 — Founder Snapshot Completeness audit.
 * Validates that all RPC snapshot fields are exposed via miaFounderCockpitDisplay.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapExecutiveMetricsToFounderCockpit,
  FOUNDER_COCKPIT_DISPLAY_VERSION,
  scanFounderCockpitForbiddenContent,
} from "../lib/miaFounderCockpitDisplay.js";
import { buildExecutiveMetricsResponse } from "../lib/miaExecutiveMetricsApi.js";
import { MIA_EXECUTIVE_METRICS_RPC } from "../lib/miaExecutiveMetricsCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** Snapshot fields returned by RPCs — metadata keys excluded intentionally. */
const RPC_SNAPSHOT_FIELDS = Object.freeze({
  platform: ["total_sessions", "unique_visitors", "conversations", "questions"],
  conversation: ["questions_sent", "recommendations_shown", "conversations_with_questions"],
  recommendation: [
    "recommendations_generated",
    "acceptance_signals",
    "rejection_signals",
    "recommendation_acceptance_rate",
    "rejection_rate",
    "runner_up_usage",
  ],
  commerce: [
    "offer_sets_generated",
    "offers_returned",
    "providers_used",
    "favorite_count",
    "offer_clicks",
  ],
  alerts: ["alerts_created", "alerts_active", "target_reached", "notifications_sent"],
  price_intelligence: ["events", "average_price_quality_score", "confidence_distribution"],
  savings: ["potential_savings_total", "average_potential_savings", "opportunities_found"],
  anti_regret: ["events", "average_score", "confidence_distribution"],
  user_value: ["events", "average_user_value", "value_status_distribution", "verified_value_amount_count"],
  system: ["analytics_version", "build_version", "environment", "last_update"],
});

/** Maps API/RPC field names to cockpit metric ids per module. */
const FIELD_TO_METRIC_ID = Object.freeze({
  platform: {
    total_sessions: "sessions",
    unique_visitors: "visitors",
    conversations: "conversations",
    questions: "questions",
  },
  conversation: {
    questions_sent: "questions_sent",
    recommendations_shown: "recommendations_shown",
    conversations_with_questions: "conversations_with_questions",
  },
  recommendation: {
    recommendations_generated: "generated",
    runner_up_usage: "runner_up",
    acceptance_signals: "acceptance_signals",
    rejection_signals: "rejection_signals",
    recommendation_acceptance_rate: "acceptance",
    rejection_rate: "rejection",
  },
  commerce: {
    offer_sets_generated: "offer_sets",
    offers_returned: "offers_returned",
    providers_used: "providers_used",
    offer_clicks: "clicks",
    favorite_count: "favorites",
  },
  alerts: {
    alerts_created: "alerts_created",
    alerts_active: "alerts_active",
    target_reached: "target_reached",
    notifications_sent: "notifications_sent",
  },
  price_intelligence: {
    events: "events",
    average_price_quality_score: "avg_quality",
  },
  savings: {
    potential_savings_total: "potential_total",
    average_potential_savings: "average_potential",
    opportunities_found: "opportunities",
  },
  anti_regret: {
    events: "events",
    average_score: "avg_score",
  },
  user_value: {
    events: "events",
    average_user_value: "avg_value",
    verified_value_amount_count: "verified_value_count",
  },
  system: {
    analytics_version: "analytics_version",
    build_version: "build",
    environment: "environment",
    last_update: "last_update",
  },
});

const MODULE_KEY_MAP = Object.freeze({
  platform: "platform",
  conversation: "conversation",
  recommendation: "recommendation",
  commerce: "commerce",
  alerts: "alerts",
  price_intelligence: "priceIntelligence",
  savings: "savings",
  anti_regret: "antiRegret",
  user_value: "userValue",
  system: "system",
});

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

function collectMetricIds(cockpit) {
  const ids = new Set();
  for (const kpi of cockpit.overview) ids.add(`overview:${kpi.id}`);
  for (const mod of Object.values(cockpit.modules)) {
    for (const metric of mod.metrics) ids.add(`${mod.id}:${metric.id}`);
    if (mod.distribution?.length) ids.add(`${mod.id}:distribution`);
  }
  return ids;
}

console.log("\nPATCH A.2 — Founder Snapshot Completeness audit\n");

console.log("Version");
ok("display version A.2", FOUNDER_COCKPIT_DISPLAY_VERSION === "A.2.0");

console.log("\nArchitecture — no aggregation in display layer");
const displaySrc = readFileSync(join(ROOT, "lib/miaFounderCockpitDisplay.js"), "utf8");
const pageSrc = readFileSync(join(ROOT, "pages/cockpit-fundador.jsx"), "utf8");
const cockpitPageSrc = readFileSync(join(ROOT, "components/founder-cockpit/FounderCockpitPage.jsx"), "utf8");
ok("display no supabase", !displaySrc.includes("supabase"));
ok("display no SQL", !/select\s+from/i.test(displaySrc));
ok("route page fetches executive-metrics", pageSrc.includes("/api/executive-metrics"));
ok("cockpit page includes conversation module", cockpitPageSrc.includes("modules.conversation"));
ok("cockpit page includes alerts module", cockpitPageSrc.includes("modules.alerts"));

console.log("\nMapper structure");
const sample = await buildExecutiveMetricsResponse({ bypassCache: true });
const cockpit = mapExecutiveMetricsToFounderCockpit(sample);
ok("overview 10 KPIs", cockpit.overview.length === 10);
ok("10 modules", Object.keys(cockpit.modules).length === 10);
ok("conversation module present", Boolean(cockpit.modules.conversation));
ok("alerts module present", Boolean(cockpit.modules.alerts));
ok("meta display_version", cockpit.meta.display_version === "A.2.0");

console.log("\nRPC catalog alignment");
for (const category of Object.keys(MIA_EXECUTIVE_METRICS_RPC)) {
  ok(`RPC defined: ${category}`, Boolean(MIA_EXECUTIVE_METRICS_RPC[category]));
}

console.log("\nSnapshot field coverage");
for (const [apiCategory, fields] of Object.entries(RPC_SNAPSHOT_FIELDS)) {
  const moduleKey = MODULE_KEY_MAP[apiCategory];
  const module = cockpit.modules[moduleKey];
  const mapping = FIELD_TO_METRIC_ID[apiCategory] || {};

  for (const field of fields) {
    if (field.endsWith("_distribution")) {
      if (field === "confidence_distribution" || field === "value_status_distribution") {
        ok(`${apiCategory}.${field} → distribution bars`, Array.isArray(module?.distribution));
      }
      continue;
    }

    const metricId = mapping[field];
    if (!metricId) {
      ok(`${apiCategory}.${field} mapped`, false);
      continue;
    }

    const inModule = module?.metrics?.some((m) => m.id === metricId);
    const inOverview = cockpit.overview.some((m) => m.id === metricId || m.id === field);
    ok(`${apiCategory}.${field} exposed`, inModule || inOverview);
  }
}

console.log("\nSystem performance metric");
ok("api_duration in system module", cockpit.modules.system.metrics.some((m) => m.id === "api_duration"));

console.log("\nPrivacy");
ok("clean cockpit JSON", scanFounderCockpitForbiddenContent(JSON.stringify(cockpit)).length === 0);

const allIds = collectMetricIds(cockpit);
ok("at least 40 display points", allIds.size >= 40);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
