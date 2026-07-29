#!/usr/bin/env node
/**
 * PATCH A.10 — Official Phase A closure orchestrator.
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

console.log("\nPATCH A.10 — Phase A official closure\n");

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
steps.push(run("node scripts/test-mia-analytics-patch-a10-phase-a-final-audit.js", "A.10 architecture audit"));
steps.push(run("node scripts/test-mia-analytics-patch-a2-founder-snapshot-complete.js", "A.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a3-temporal-series-api.js", "A.3 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a4-founder-sessions-users.js", "A.4 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a5-founder-products-categories.js", "A.5 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a6-founder-performance-conversion.js", "A.6 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a7-founder-advanced-filters.js", "A.7 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a8-founder-charts.js", "A.8 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a9-ui-polish.js", "A.9 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-113-founder-executive-cockpit.js", "Founder Cockpit regression"));
steps.push(
  run(
    "node --env-file=.env.local scripts/patch-a10-browser-validation.mjs",
    "Phase A browser validation"
  )
);
steps.push(run("npm run build", "Production build"));
steps.push(run("node scripts/patch-a10-production-validation.mjs", "Production validation"));

const auditEvidence = readJson("docs/analytics/PATCH_A_10_FINAL_AUDIT_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PATCH_A_10_BROWSER_EVIDENCE.json");
const prodEvidence = readJson("docs/analytics/PATCH_A_10_PRODUCTION_EVIDENCE.json");

const priorPatchesClosed = [
  readJson("docs/analytics/PATCH_A_9_CLOSURE_EVIDENCE.json").patch_a9_status === "OFFICIALLY_CLOSED",
  readJson("docs/analytics/PATCH_A_8_CLOSURE_EVIDENCE.json").patch_a8_status === "OFFICIALLY_CLOSED",
  readJson("docs/analytics/PATCH_A_7_CLOSURE_EVIDENCE.json").patch_a7_status === "OFFICIALLY_CLOSED",
].every(Boolean);

const allPass =
  steps.every((s) => s.pass) &&
  priorPatchesClosed &&
  browserEvidence.status === "APPROVED" &&
  prodEvidence.status === "APPROVED" &&
  existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md"));

const closure = {
  patch: "A.10",
  title: "PATCH A.10 — Phase A Official Closure",
  phase: "A — Dashboard do Fundador",
  status: allPass ? "CLOSED" : "BLOCKED",
  phase_a_status: allPass ? "OFFICIALLY_COMPLETED" : "BLOCKED_PENDING_VALIDATION",
  baseline: allPass ? "FROZEN" : null,
  ready_for_phase_b: allPass,
  closed_at: allPass ? new Date().toISOString() : null,
  git: gitSync,
  prior_patches_closed: priorPatchesClosed,
  steps,
  evidence: {
    final_audit: auditEvidence.status ?? "PENDING",
    browser: browserEvidence.status ?? "PENDING",
    production: prodEvidence.status ?? "PENDING",
    master_report: existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md")),
  },
  checklist: {
    architecture_validated: steps.find((s) => s.label === "A.10 architecture audit")?.pass ?? false,
    apis_validated: prodEvidence.checks?.passed >= 4,
    dashboard_validated: browserEvidence.checks?.passed >= 10,
    production_validated: prodEvidence.status === "APPROVED",
    git_synchronized: gitSync.pass,
    documentation_complete: existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_PHASE_A_FINAL_REPORT.md")),
    no_blockers: allPass,
  },
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_10_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));

console.log(`\nFASE A status: ${closure.phase_a_status}\n`);
process.exit(allPass ? 0 : 1);
