#!/usr/bin/env node
/**
 * PATCH A.9 — UI polish audit (no data/API changes).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function ok(label, pass, detail = "") {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("\nPATCH A.9 — UI polish audit\n");

const css = readFileSync(join(ROOT, "styles/founder-cockpit.css"), "utf8");

ok("design system doc", existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_DESIGN_SYSTEM.md")));
ok("FounderSkeleton component", existsSync(join(ROOT, "components/founder-cockpit/FounderSkeleton.jsx")));
ok("CSS design tokens", css.includes("--fc-accent"));
ok("skeleton shimmer", css.includes("founder-shimmer"));
ok("focus-visible styles", css.includes(":focus-visible"));
ok("reduced motion", css.includes("prefers-reduced-motion"));
ok("table zebra hover", css.includes("tbody tr:hover"));
ok("module shell", css.includes("founder-module-shell"));

const forbiddenInSections = [
  "lib/miaFounderChartsDisplay.js",
  "lib/miaAnalyticsFilterParams.js",
  "pages/api/temporal-metrics.js",
];
for (const f of forbiddenInSections) {
  ok(`A.9 did not modify ${f}`, !readFileSync(join(ROOT, f), "utf8").includes("PATCH A.9"));
}

const sessions = readFileSync(join(ROOT, "components/founder-cockpit/FounderSessionsUsersSection.jsx"), "utf8");
ok("sessions uses skeleton", sessions.includes("FounderSkeleton"));
ok("sessions same API fetch", sessions.includes('buildTemporalQueryString("growth,platform_activity")'));

const chartPanel = readFileSync(join(ROOT, "components/founder-cockpit/charts/FounderChartPanel.jsx"), "utf8");
ok("chart panel skeleton loading", chartPanel.includes('variant="chart"'));

console.log("\nParity guard — mappers unchanged version strings");
ok("charts display still A.8.0", readFileSync(join(ROOT, "lib/miaFounderChartsDisplay.js"), "utf8").includes('"A.8.0"'));
ok("filters still A.7.0", readFileSync(join(ROOT, "lib/miaFounderFiltersCatalog.js"), "utf8").includes('"A.7.0"'));

const passed = checks.filter((c) => c.pass).length;
console.log(`\nResult: ${passed}/${checks.length} passed\n`);
process.exit(checks.length - passed ? 1 : 0);
