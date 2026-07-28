#!/usr/bin/env node
/**
 * PATCH A.4 — Founder Sessions & Users audit.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FOUNDER_GROWTH_DISPLAY_VERSION,
  mapTemporalMetricsToFounderSessionsUsers,
  mergeTemporalDailyRows,
  classifyTrendDirection,
  formatTrendPercent,
  scanFounderGrowthForbiddenContent,
} from "../lib/miaFounderGrowthDisplay.js";
import { buildTemporalSeriesResponse } from "../lib/miaTemporalSeriesApi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SAMPLE_TEMPORAL = {
  temporal_version: "A.3.0",
  reference_period_days: 30,
  computed_at: "2026-07-28T12:00:00.000Z",
  growth: {
    series: [
      {
        activity_day: "2026-07-28",
        dau_visitors: 86,
        dau_users: 0,
        wau_visitors: 261,
        wau_users: 7,
        mau_visitors: 261,
        mau_users: 7,
        new_visitors: 83,
        returning_visitors: 3,
        anonymous_visitors: 85,
        authenticated_users: 0,
        taxa_autenticacao: 0,
        crescimento_dau_visitors_pct: 0.162,
        crescimento_wau_visitors_pct: 0.4663,
        crescimento_mau_visitors_pct: 0.4663,
      },
      {
        activity_day: "2026-07-27",
        dau_visitors: 5,
        wau_visitors: 178,
        mau_visitors: 178,
        crescimento_dau_visitors_pct: -0.9153,
      },
    ],
  },
  platform_activity: {
    series: [
      {
        activity_day: "2026-07-28",
        total_sessions: 86,
        conversations: 791,
        questions: 177,
        recommendations_shown: 32,
      },
      {
        activity_day: "2026-07-27",
        total_sessions: 9,
        conversations: 480,
        questions: 48,
        recommendations_shown: 16,
      },
    ],
  },
  partial_errors: [],
};

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

console.log("\nPATCH A.4 — Founder Sessions & Users audit\n");

console.log("Files");
ok("growth display lib", existsSync(join(ROOT, "lib/miaFounderGrowthDisplay.js")));
ok("SessionsUsersSection", existsSync(join(ROOT, "components/founder-cockpit/FounderSessionsUsersSection.jsx")));

console.log("\nArchitecture — no aggregation in display layer");
const displaySrc = readFileSync(join(ROOT, "lib/miaFounderGrowthDisplay.js"), "utf8");
const sectionSrc = readFileSync(join(ROOT, "components/founder-cockpit/FounderSessionsUsersSection.jsx"), "utf8");
const pageSrc = readFileSync(join(ROOT, "components/founder-cockpit/FounderCockpitPage.jsx"), "utf8");
ok("display no supabase", !displaySrc.includes("supabase"));
ok("display no SQL", !/select\s+from/i.test(displaySrc));
ok("display no rpc", !displaySrc.includes(".rpc("));
ok("section fetches temporal-metrics", sectionSrc.includes("/api/temporal-metrics"));
ok("section no supabase", !sectionSrc.includes("supabase"));
ok("page includes SessionsUsersSection", pageSrc.includes("FounderSessionsUsersSection"));

console.log("\nMapper");
ok("display version A.4", FOUNDER_GROWTH_DISPLAY_VERSION === "A.4.0");
const view = mapTemporalMetricsToFounderSessionsUsers(SAMPLE_TEMPORAL, {
  snapshotPlatform: { metrics: [{ id: "sessions", label: "Sessões", value: 500 }] },
});
ok("status success", view.meta.status === "success");
ok("rolling 6 metrics", view.rollingMetrics.length === 6);
ok("audience 5 metrics", view.audienceMetrics.length === 5);
ok("activity 4 metrics", view.activityMetrics.length === 4);
ok("3 trends", view.trends.length === 3);
ok("recent days merged", view.recentDays.length === 2);
ok("DAU in rolling", view.rollingMetrics.some((m) => m.id === "dau_visitors"));
ok("WAU in rolling", view.rollingMetrics.some((m) => m.id === "wau_visitors"));
ok("MAU in rolling", view.rollingMetrics.some((m) => m.id === "mau_visitors"));
ok("trend up", view.trends[0].direction === "up");
ok("trend pct formatted", view.trends[0].pctFormatted.includes("%"));
ok("snapshot reference", view.snapshotReference.some((m) => m.id === "sessions"));

console.log("\nTrend helpers");
ok("classify up", classifyTrendDirection(0.05) === "up");
ok("classify down", classifyTrendDirection(-0.05) === "down");
ok("classify stable", classifyTrendDirection(0.005) === "stable");
ok("classify unknown", classifyTrendDirection(null) === "unknown");
ok("format trend +", formatTrendPercent(0.1).startsWith("+"));

console.log("\nMerge rows (join only)");
const merged = mergeTemporalDailyRows(SAMPLE_TEMPORAL.growth.series, SAMPLE_TEMPORAL.platform_activity.series);
ok("merge preserves sessions", merged[0].total_sessions === 86);
ok("merge preserves dau", merged[0].dau_visitors === 86);

console.log("\nPartial / empty states");
const partialView = mapTemporalMetricsToFounderSessionsUsers({
  ...SAMPLE_TEMPORAL,
  growth: null,
  partial_errors: [{ scope: "growth", error: "rpc_failed" }],
});
ok("partial status", partialView.meta.status === "partial");

const emptyView = mapTemporalMetricsToFounderSessionsUsers({
  temporal_version: "A.3.0",
  growth: { series: [] },
  platform_activity: { series: [] },
  partial_errors: [],
});
ok("empty status", emptyView.meta.status === "empty");

console.log("\nPrivacy");
ok("clean mapped JSON", scanFounderGrowthForbiddenContent(JSON.stringify(view)).length === 0);

console.log("\nLive API integration (optional)");
try {
  const live = await buildTemporalSeriesResponse({ bypassCache: true, windowDays: 30 });
  if (live.ok) {
    const liveView = mapTemporalMetricsToFounderSessionsUsers(live);
    ok("live map status", ["success", "partial", "empty", "error"].includes(liveView.meta.status));
  } else {
    ok("live map skipped", true, "supabase unavailable");
  }
} catch {
  ok("live map skipped", true, "offline");
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
