#!/usr/bin/env node
/**
 * PATCH 7.5 — Phase 7 final audit orchestrator (read-only meta-validation).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS = join(ROOT, "docs/analytics");

const REQUIRED_DOCS = [
  "PATCH_7.0_PHASE_7_ROADMAP_AUDIT.md",
  "PATCH_7.1_RESPONSE_ANALYTICS.md",
  "PATCH_7.2_ERROR_ANALYTICS.md",
  "PATCH_7.3_LATENCY_ANALYTICS.md",
  "PATCH_7.4_HEALTH_ANALYTICS.md",
  "RELIABILITY_RESPONSE_ANALYTICS.md",
  "RELIABILITY_ERROR_ANALYTICS.md",
  "RELIABILITY_LATENCY_ANALYTICS.md",
  "RELIABILITY_HEALTH_ANALYTICS.md",
  "PHASE_7_FINAL_AUDIT.md",
  "PHASE_7_EXECUTIVE_SUMMARY.md",
];

const EVIDENCE = [
  "PATCH_7.1_PRODUCTION_EVIDENCE.json",
  "PATCH_7.2_PRODUCTION_EVIDENCE.json",
  "PATCH_7.3_PRODUCTION_EVIDENCE.json",
  "PATCH_7.4_PRODUCTION_EVIDENCE.json",
];

const SQL_SPLITS = [
  ["7.1", ["patch-71-query1-outcome-overview.sql", "patch-71-query2-outcome-dimensions.sql", "patch-71-query3-partial-fallback-analytics.sql", "patch-71-query4-evolution-gaps-panel.sql"]],
  ["7.2", ["patch-72-query1-error-overview.sql", "patch-72-query2-error-dimensions.sql", "patch-72-query3-recovery-correlation.sql", "patch-72-query4-evolution-gaps-panel.sql"]],
  ["7.3", ["patch-73-query1-latency-overview.sql", "patch-73-query2-latency-dimensions.sql", "patch-73-query3-stage-correlation.sql", "patch-73-query4-evolution-gaps-panel.sql"]],
  ["7.4", ["patch-74-query1-overall-health.sql", "patch-74-query2-component-breakdown.sql", "patch-74-query3-health-trends.sql", "patch-74-query4-instrumentation-quality.sql"]],
];

const RUNTIME_LIBS = [
  "lib/miaResponseAnalytics.js",
  "lib/miaErrorAnalytics.js",
  "lib/miaLatencyAnalytics.js",
  "lib/miaHealthSnapshotBuilder.js",
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

console.log("\nPATCH 7.5 — Phase 7 final audit meta-validation\n");

console.log("Documentation");
for (const f of REQUIRED_DOCS) {
  ok(f, existsSync(join(ANALYTICS, f)));
}
for (const f of EVIDENCE) {
  ok(`evidence ${f}`, existsSync(join(ANALYTICS, f)));
}

console.log("\nSQL splits (16 queries)");
for (const [patch, files] of SQL_SPLITS) {
  for (const f of files) {
    ok(`PATCH ${patch} ${f}`, existsSync(join(ANALYTICS, "sql", f)));
  }
}

console.log("\nRuntime libs");
for (const f of RUNTIME_LIBS) {
  ok(f, existsSync(join(ROOT, f)));
}

const chat = readFileSync(join(ROOT, "pages/api/chat-gpt4o.js"), "utf8");
ok("7.1 hook preserved", chat.includes("instrumentResponseOutcomeAnalytics"));
ok("7.2 hook preserved", chat.includes("instrumentErrorAnalyticsForDelivery"));
ok("7.3 hook preserved", chat.includes("instrumentLatencyAnalyticsForDelivery"));
ok("7.4 no runtime health insert", !chat.includes("mia_health_snapshot"));

const contract = readFileSync(join(ANALYTICS, "contracts/EVENT_CONTRACT.md"), "utf8");
ok("contract 7.1 event", contract.includes("mia_response_outcome"));
ok("contract 7.2 event", contract.includes("mia_error_event"));
ok("contract 7.3 event", contract.includes("mia_latency_event"));
ok("contract 7.4 sql-derived", contract.includes("7.10") || contract.includes("SQL-derived"));

console.log("\nGit phase 7 commits present");
const log = execSync("git log --oneline -20", { cwd: ROOT, encoding: "utf8" });
for (const hash of ["e831307", "c541010", "360768a", "59fcf22"]) {
  ok(`commit ${hash}`, log.includes(hash.slice(0, 7)));
}

console.log(`\nMeta-validation: ${passed}/${passed + failed}\n`);
process.exit(failed === 0 ? 0 : 1);
