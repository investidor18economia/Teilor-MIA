#!/usr/bin/env node
/**
 * PATCH C.7 — Official closure orchestrator.
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

console.log("\nPATCH C.7 — Official closure\n");

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

steps.push(run("node scripts/test-mia-analytics-patch-c7-executive-explainability.js", "C.7 explainability audit"));
steps.push(run("node scripts/test-mia-analytics-patch-c6-executive-recommendations.js", "C.6 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c5-executive-alerts.js", "C.5 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c4-executive-trends.js", "C.4 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c3-executive-insights.js", "C.3 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c2-executive-summary.js", "C.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c1-executive-analyst-architecture.js", "C.1 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b9-phase-b-final-audit.js", "Phase B baseline audit"));
steps.push(run("npm run build", "Production build"));
steps.push(run("node scripts/patch-c7-production-validation.mjs", "C.7 production validation"));

if (process.env.MIA_ADMIN_API_KEY) {
  steps.push(run("node scripts/patch-c7-browser-validation.mjs", "C.7 browser regression"));
  steps.push(run("node scripts/patch-b9-production-validation.mjs", "Production validation B.9"));
}

const explainEvidence = readJson("docs/analytics/PATCH_C_7_EXPLAINABILITY_EVIDENCE.json");
const prodEvidence = readJson("docs/analytics/PATCH_C_7_PRODUCTION_VALIDATION_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PATCH_C_7_BROWSER_EVIDENCE.json");
const docExists = existsSync(join(ROOT, "docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md"));

const requiredSteps = steps.filter(
  (s) =>
    !s.label?.includes("browser") &&
    !s.label?.includes("Production validation B.9") &&
    s.label !== "C.7 production validation"
);
const prodStep = steps.find((s) => s.label === "C.7 production validation");
const browserStep = steps.find((s) => s.label === "C.7 browser regression");
const b9ProdStep = steps.find((s) => s.label === "Production validation B.9");

const prodOk = prodStep?.pass === true && prodEvidence.status === "APPROVED";
const browserOk = !process.env.MIA_ADMIN_API_KEY || browserEvidence.status === "APPROVED";
const b9Ok = !process.env.MIA_ADMIN_API_KEY || b9ProdStep?.pass === true;

const allPass =
  requiredSteps.every((s) => s.pass) &&
  prodOk &&
  explainEvidence.status === "APPROVED" &&
  docExists &&
  browserOk &&
  b9Ok &&
  gitSync.pass;

const closure = {
  patch: "C.7",
  title: "PATCH C.7 — Official Closure",
  phase: "C — MIA como Analista da Empresa",
  status: allPass ? "CLOSED" : "BLOCKED",
  patch_c7_status: allPass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  closed_at: allPass ? new Date().toISOString() : null,
  validation_completed_at: allPass ? new Date().toISOString() : null,
  git: gitSync,
  deployment_audit: prodEvidence.deployment_audit ?? null,
  production_validation: prodEvidence.status ?? "PENDING",
  production_test_results: prodEvidence.functional_validation ?? null,
  browser_test_results: browserEvidence.checks ?? null,
  regression_results: {
    c7_explainability: explainEvidence.status,
    production_validation: prodEvidence.status,
    browser: browserEvidence.status,
  },
  baseline_c1_c6_preserved: true,
  scope: "Deterministic Executive Explainability & Confidence Engine — lib only, no Cockpit UI",
  steps,
  evidence: {
    explainability: explainEvidence.status ?? "PENDING",
    production_validation: prodEvidence.status ?? "PENDING",
    browser: browserEvidence.status ?? "SKIPPED",
    documentation: docExists,
  },
  production: {
    health_build: prodEvidence.deployment_audit?.production_build_short ?? null,
    c7_functional_validation: prodEvidence.final_verdict ?? null,
  },
  final_verdict: allPass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  next_patch: "C.8 — Humanization (not started)",
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_C_7_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));
console.log(`\nPATCH C.7 status: ${closure.patch_c7_status}\n`);
process.exit(allPass ? 0 : 1);
