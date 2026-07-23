#!/usr/bin/env node
/**
 * PATCH 11.3 — Founder Executive Cockpit audit.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapExecutiveMetricsToFounderCockpit,
  mapDistributionToBars,
  formatFounderMetricValue,
  scanFounderCockpitForbiddenContent,
  FOUNDER_COCKPIT_PERIOD_OPTIONS,
} from "../lib/miaFounderCockpitDisplay.js";
import {
  issueFounderGateToken,
  verifyFounderGateToken,
  isFounderEmail,
  resolveFounderAllowedEmails,
  MIA_FOUNDER_GATE_COOKIE,
} from "../lib/miaFounderAccess.js";
import { buildExecutiveMetricsResponse } from "../lib/miaExecutiveMetricsApi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TEST_ENV = {
  ...process.env,
  MIA_USER_SESSION_SECRET: process.env.MIA_USER_SESSION_SECRET || "x".repeat(32),
  MIA_FOUNDER_ALLOWED_EMAILS: "founder@teilor.test,admin@teilor.test",
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

console.log("\nPATCH 11.3 — Founder Executive Cockpit audit\n");

console.log("Files");
ok("cockpit page", existsSync(join(ROOT, "pages/cockpit-fundador.jsx")));
ok("founder access lib", existsSync(join(ROOT, "lib/miaFounderAccess.js")));
ok("cockpit display lib", existsSync(join(ROOT, "lib/miaFounderCockpitDisplay.js")));
ok("FounderCockpitPage", existsSync(join(ROOT, "components/founder-cockpit/FounderCockpitPage.jsx")));
ok("FounderLoginGate", existsSync(join(ROOT, "components/founder-cockpit/FounderLoginGate.jsx")));
ok("authenticate route", existsSync(join(ROOT, "pages/api/founder/authenticate.js")));
ok("logout route", existsSync(join(ROOT, "pages/api/founder/logout.js")));
ok("styles", existsSync(join(ROOT, "styles/founder-cockpit.css")));
ok("doc", existsSync(join(ROOT, "docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md")));

console.log("\nNo direct DB / aggregation on page");
const pageSrc = readFileSync(join(ROOT, "pages/cockpit-fundador.jsx"), "utf8");
const displaySrc = readFileSync(join(ROOT, "lib/miaFounderCockpitDisplay.js"), "utf8");
ok("page fetches executive-metrics only", pageSrc.includes("/api/executive-metrics"));
ok("page no supabase", !pageSrc.includes("supabase"));
ok("page getServerSideProps", pageSrc.includes("getServerSideProps"));
ok("page requireFounderGate", pageSrc.includes("requireFounderGate"));
ok("page robots noindex", pageSrc.includes('content="noindex, nofollow"'));
ok("display no supabase", !displaySrc.includes("supabase"));
ok("display no SQL", !/select\s+from/i.test(displaySrc));

console.log("\nAuth");
ok("gate cookie name", MIA_FOUNDER_GATE_COOKIE === "mia_founder_gate");
ok("allowlist env parsing", resolveFounderAllowedEmails(TEST_ENV).length === 2);
ok("founder email match", isFounderEmail("founder@teilor.test", TEST_ENV));
ok("founder email deny", !isFounderEmail("other@test.com", TEST_ENV));
const gate = issueFounderGateToken({ subject: "founder@teilor.test", method: "session" }, TEST_ENV);
const verified = verifyFounderGateToken(gate, TEST_ENV);
ok("gate token roundtrip", verified.ok && verified.subject === "founder@teilor.test");

console.log("\nPeriod filters");
ok("4 period options", FOUNDER_COCKPIT_PERIOD_OPTIONS.length === 4);
ok("includes 7 days", FOUNDER_COCKPIT_PERIOD_OPTIONS.some((o) => o.days === 7));
ok("includes 365 days", FOUNDER_COCKPIT_PERIOD_OPTIONS.some((o) => o.days === 365));

console.log("\nMapper");
const sample = await buildExecutiveMetricsResponse({ bypassCache: true });
const cockpit = mapExecutiveMetricsToFounderCockpit(sample);
ok("overview 8 KPIs", cockpit.overview.length === 8);
ok("8 modules", Object.keys(cockpit.modules).length === 8);
ok("savings disclaimer", cockpit.modules.savings.disclaimer.includes("Não representa economia"));
ok("system status", cockpit.modules.system.status === "ok" || cockpit.modules.system.status === "partial");
ok("distribution bars helper", Array.isArray(mapDistributionToBars({ HIGH: 3, LOW: 1 })));
ok("format duration", formatFounderMetricValue({ format: "duration", value: 1200 }).includes("ms"));

console.log("\nPrivacy");
ok("clean cockpit JSON", scanFounderCockpitForbiddenContent(JSON.stringify(cockpit)).length === 0);

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
