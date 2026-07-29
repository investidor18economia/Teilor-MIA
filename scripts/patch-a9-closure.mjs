#!/usr/bin/env node
/**
 * PATCH A.9 — Official closure orchestrator.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, label) {
  console.log(`\n▶ ${label}\n`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit", env: process.env });
    return { label, pass: true };
  } catch {
    return { label, pass: false };
  }
}

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
  } catch {
    return {};
  }
}

console.log("\nPATCH A.9 — Official closure\n");

const steps = [];
let gitSync = { pass: false };

try {
  const head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const origin = execSync("git rev-parse origin/master", { cwd: ROOT, encoding: "utf8" }).trim();
  const status = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
  gitSync = { pass: head === origin && !status, head, origin, working_tree_clean: !status };
  console.log(`Git sync: ${gitSync.pass ? "PASS" : "FAIL"} HEAD=${head.slice(0, 7)}`);
} catch (err) {
  console.log(`Git sync: FAIL (${err.message})`);
}

steps.push({ label: "git synchronized", pass: gitSync.pass });
steps.push(run("node scripts/test-mia-analytics-patch-a9-ui-polish.js", "A.9 unit"));
steps.push(run("node scripts/test-mia-analytics-patch-a8-founder-charts.js", "A.8 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a7-founder-advanced-filters.js", "A.7 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a6-founder-performance-conversion.js", "A.6 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a5-founder-products-categories.js", "A.5 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a4-founder-sessions-users.js", "A.4 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a3-temporal-series-api.js", "A.3 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a2-founder-snapshot-complete.js", "A.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-113-founder-executive-cockpit.js", "Founder Cockpit regression"));
steps.push(run("npm run build", "Production build"));
steps.push(run("node scripts/patch-a9-ui-polish-production-validation.mjs", "Production validation"));
steps.push(
  run(
    "node --env-file=.env.local scripts/patch-a9-browser-validation.mjs",
    "Browser UI validation"
  )
);

const uiEvidence = readJson("docs/analytics/PATCH_A_9_UI_POLISH_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PATCH_A_9_BROWSER_UI_EVIDENCE.json");

const allPass =
  steps.every((s) => s.pass) &&
  uiEvidence.status === "APPROVED" &&
  browserEvidence.status === "APPROVED";

const closure = {
  patch: "A.9",
  title: "PATCH A.9 — Official Closure",
  status: allPass ? "CLOSED" : "BLOCKED",
  patch_a9_status: allPass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  closed_at: allPass ? new Date().toISOString() : null,
  git: gitSync,
  ui_improvements: [
    "design tokens (--fc-*)",
    "FounderSkeleton loading states",
    "table zebra/hover polish",
    "filter bar focus-visible",
    "module shells",
    "tablet/mobile responsive rules",
    "prefers-reduced-motion safe shimmer",
  ],
  components_changed: [
    "styles/founder-cockpit.css",
    "components/founder-cockpit/FounderSkeleton.jsx",
    "components/founder-cockpit/FounderModuleSection.jsx",
    "components/founder-cockpit/FounderExecutiveInsights.jsx",
    "components/founder-cockpit/FounderSessionsUsersSection.jsx",
    "components/founder-cockpit/FounderProductsCategoriesSection.jsx",
    "components/founder-cockpit/FounderPerformanceConversionSection.jsx",
    "components/founder-cockpit/charts/FounderChartPanel.jsx",
  ],
  constraints_preserved: [
    "no API changes",
    "no RPC changes",
    "no metric mapper changes",
    "no filter logic changes",
    "no data source changes",
  ],
  steps,
  evidence: {
    ui_polish: uiEvidence.status ?? "MISSING",
    browser: browserEvidence.status ?? "MISSING",
  },
  next_patch: "A.10 — Auditoria Final da Fase A",
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_9_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));

console.log(`\nPATCH A.9 status: ${closure.patch_a9_status}\n`);
process.exit(allPass ? 0 : 1);
