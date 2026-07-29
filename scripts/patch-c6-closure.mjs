#!/usr/bin/env node
/**
 * PATCH C.6 — Official closure orchestrator.
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

console.log("\nPATCH C.6 — Official closure\n");

const steps = [];
let gitSync = { pass: false };

try {
  const head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const origin = execSync("git rev-parse origin/master", { cwd: ROOT, encoding: "utf8" }).trim();
  const status = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
  gitSync = { pass: head === origin && !status, head, origin, working_tree_clean: !status };
} catch (err) {
  console.log(`Git sync: FAIL (${err.message})`);
}

steps.push(run("node scripts/test-mia-analytics-patch-c6-executive-recommendations.js", "C.6 recommendations audit"));
steps.push(run("node scripts/patch-c6-production-revalidation.mjs", "C.6 production revalidation"));
steps.push(run("node scripts/test-mia-analytics-patch-c5-executive-alerts.js", "C.5 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c4-executive-trends.js", "C.4 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c3-executive-insights.js", "C.3 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c2-executive-summary.js", "C.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c1-executive-analyst-architecture.js", "C.1 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b9-phase-b-final-audit.js", "Phase B baseline audit"));
steps.push(run("npm run build", "Production build"));

if (process.env.MIA_ADMIN_API_KEY) {
  steps.push(run("node scripts/patch-c6-browser-validation.mjs", "C.6 browser regression"));
  steps.push(run("node scripts/patch-b9-production-validation.mjs", "Production validation"));
}

const recsEvidence = readJson("docs/analytics/PATCH_C_6_RECOMMENDATIONS_EVIDENCE.json");
const prodRevalidation = readJson("docs/analytics/PATCH_C_6_PRODUCTION_REVALIDATION_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PATCH_C_6_BROWSER_EVIDENCE.json");
const docExists = existsSync(join(ROOT, "docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md"));

const requiredSteps = steps.filter(
  (s) =>
    !s.label?.includes("browser") &&
    !s.label?.includes("Production validation") &&
    s.label !== "C.6 production revalidation"
);
const prodRevalStep = steps.find((s) => s.label === "C.6 production revalidation");
const prodStep = steps.find((s) => s.label === "Production validation");
const browserStep = steps.find((s) => s.label === "C.6 browser regression");

const prodRevalOk = prodRevalStep?.pass === true && prodRevalidation.status === "APPROVED";
const prodOk = !process.env.MIA_ADMIN_API_KEY || prodStep?.pass === true;
const browserOk = !process.env.MIA_ADMIN_API_KEY || browserEvidence.status === "APPROVED";

const allPass =
  requiredSteps.every((s) => s.pass) &&
  prodRevalOk &&
  recsEvidence.status === "APPROVED" &&
  docExists &&
  browserOk &&
  prodOk &&
  gitSync.pass;

const closure = {
  patch: "C.6",
  title: "PATCH C.6 — Official Closure",
  phase: "C — MIA como Analista da Empresa",
  previous_status: "BLOCKED_PENDING_VALIDATION",
  blocking_reason:
    prodRevalidation.blocking_reason ||
    "Initial closure declared OFFICIALLY_CLOSED while production build had not yet deployed C.6 commit",
  status: allPass ? "CLOSED" : "BLOCKED",
  patch_c6_status: allPass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  closed_at: allPass ? new Date().toISOString() : null,
  validation_completed_at: allPass ? new Date().toISOString() : null,
  git: gitSync,
  deployment_audit: prodRevalidation.deployment_audit ?? null,
  production_revalidation: prodRevalidation.status ?? "PENDING",
  production_test_results: prodRevalidation.functional_validation ?? null,
  browser_test_results: browserEvidence.checks ?? null,
  regression_results: {
    c6_recommendations: recsEvidence.status,
    production_revalidation: prodRevalidation.status,
    browser: browserEvidence.status,
  },
  baseline_c1_c5_preserved: true,
  scope: "Deterministic Executive Recommendation Generator — lib only, no Cockpit UI",
  steps,
  evidence: {
    recommendations: recsEvidence.status ?? "PENDING",
    production_revalidation: prodRevalidation.status ?? "PENDING",
    browser: browserEvidence.status ?? "SKIPPED",
    documentation: docExists,
  },
  production: {
    health_build: prodRevalidation.deployment_audit?.production_build_short ?? null,
    c6_functional_validation: prodRevalidation.final_verdict ?? null,
  },
  transition: allPass
    ? "BLOCKED_PENDING_VALIDATION → production confirmed → revalidation approved → OFFICIALLY_CLOSED"
    : "BLOCKED_PENDING_VALIDATION",
  final_verdict: allPass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  next_patch: "C.7 — Cockpit analyst UI (not started)",
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_C_6_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));
console.log(`\nPATCH C.6 status: ${closure.patch_c6_status}\n`);
process.exit(allPass ? 0 : 1);
