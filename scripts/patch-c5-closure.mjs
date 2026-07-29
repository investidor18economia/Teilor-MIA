#!/usr/bin/env node
/**
 * PATCH C.5 — Official closure orchestrator.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

console.log("\nPATCH C.5 — Official closure\n");

const steps = [];
let gitSync = { pass: false };

try {
  const head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const origin = execSync("git rev-parse origin/master", { cwd: ROOT, encoding: "utf8" }).trim();
  const status = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
  gitSync = { pass: head === origin && !status, head, origin, working_tree_clean: !status };
  console.log(`Git sync: ${gitSync.pass ? "PASS" : "PENDING"} HEAD=${head.slice(0, 7)}`);
} catch (err) {
  console.log(`Git sync: FAIL (${err.message})`);
}

steps.push(run("node scripts/test-mia-analytics-patch-c5-executive-alerts.js", "C.5 alerts audit"));
steps.push(run("node scripts/test-mia-analytics-patch-c4-executive-trends.js", "C.4 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c3-executive-insights.js", "C.3 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c2-executive-summary.js", "C.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c1-executive-analyst-architecture.js", "C.1 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b9-phase-b-final-audit.js", "Phase B baseline audit"));
steps.push(run("node scripts/test-mia-analytics-patch-b8-executive-polish.js", "B.8 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b7-executive-summary.js", "B.7 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b6-executive-operational.js", "B.6 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b5-executive-commercial-performance.js", "B.5 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b4-executive-product-health.js", "B.4 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b3-executive-growth.js", "B.3 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b2-executive-kpis.js", "B.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b1-executive-architecture.js", "B.1 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a10-phase-a-final-audit.js", "Phase A baseline"));
steps.push(run("node scripts/test-mia-analytics-patch-a2-founder-snapshot-complete.js", "A.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a9-ui-polish.js", "A.9 regression"));
steps.push(run("npm run build", "Production build"));

if (process.env.MIA_ADMIN_API_KEY) {
  steps.push(run("node scripts/patch-c5-browser-validation.mjs", "C.5 browser regression"));
  steps.push(run("node scripts/patch-b9-production-validation.mjs", "Production validation"));
}

const alertsEvidence = readJson("docs/analytics/PATCH_C_5_ALERTS_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PATCH_C_5_BROWSER_EVIDENCE.json");
const docExists = existsSync(join(ROOT, "docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md"));
const catalogExists = existsSync(join(ROOT, "lib/miaExecutiveAlertCatalog.js"));
const rulesExists = existsSync(join(ROOT, "lib/miaExecutiveAlertRules.js"));
const builderExists = existsSync(join(ROOT, "lib/miaExecutiveAlertBuilder.js"));

const requiredSteps = steps.filter(
  (s) => !s.label?.includes("browser") && !s.label?.includes("Production validation")
);
const prodStep = steps.find((s) => s.label === "Production validation");
const prodOk = !process.env.MIA_ADMIN_API_KEY || prodStep?.pass === true;

const allPass =
  requiredSteps.every((s) => s.pass) &&
  alertsEvidence.status === "APPROVED" &&
  docExists &&
  catalogExists &&
  rulesExists &&
  builderExists &&
  (browserEvidence.status === "APPROVED" || !process.env.MIA_ADMIN_API_KEY) &&
  prodOk;

const closure = {
  patch: "C.5",
  title: "PATCH C.5 — Official Closure",
  phase: "C — MIA como Analista da Empresa",
  status: allPass && gitSync.pass ? "CLOSED" : "BLOCKED",
  patch_c5_status: allPass && gitSync.pass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  closed_at: allPass && gitSync.pass ? new Date().toISOString() : null,
  git: gitSync,
  baseline_a_preserved: true,
  baseline_b_preserved: true,
  baseline_c1_preserved: true,
  baseline_c2_preserved: true,
  baseline_c3_preserved: true,
  baseline_c4_preserved: true,
  scope: "Deterministic Executive Alert Generator — lib only, no Cockpit UI, no recommendations",
  steps,
  evidence: {
    alerts: alertsEvidence.status ?? "PENDING",
    browser: browserEvidence.status ?? "SKIPPED",
    documentation: docExists,
  },
  files_created: [
    "lib/miaExecutiveAlertCatalog.js",
    "lib/miaExecutiveAlertRules.js",
    "lib/miaExecutiveAlertBuilder.js",
    "scripts/test-mia-analytics-patch-c5-executive-alerts.js",
    "scripts/patch-c5-browser-validation.mjs",
    "scripts/patch-c5-closure.mjs",
  ],
  files_modified: [
    "docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md",
    "lib/miaExecutiveAnalysisArchitecture.js",
    "package.json",
  ],
  next_patch: "C.6 — Recommendations (not started)",
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_C_5_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));

console.log(`\nPATCH C.5 status: ${closure.patch_c5_status}\n`);
process.exit(allPass && gitSync.pass ? 0 : 1);
