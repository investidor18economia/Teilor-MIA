#!/usr/bin/env node
/**
 * PATCH C.9 — Official Phase C closure orchestrator.
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

console.log("\nPATCH C.9 — Phase C official closure\n");

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

steps.push(run("node scripts/test-mia-analytics-phase-c-final-audit.js", "Phase C final audit"));
steps.push(run("node scripts/test-mia-analytics-patch-c8-executive-humanization.js", "C.8 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c7-executive-explainability.js", "C.7 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c6-executive-recommendations.js", "C.6 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c5-executive-alerts.js", "C.5 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c4-executive-trends.js", "C.4 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c3-executive-insights.js", "C.3 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c2-executive-summary.js", "C.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-c1-executive-analyst-architecture.js", "C.1 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b9-phase-b-final-audit.js", "Phase B baseline audit"));
steps.push(run("npm run build", "Production build"));
steps.push(run("node scripts/patch-c9-production-validation.mjs", "C.9 production validation"));

if (process.env.MIA_ADMIN_API_KEY) {
  steps.push(run("node scripts/patch-c9-browser-validation.mjs", "C.9 browser regression"));
  steps.push(run("node scripts/patch-b9-production-validation.mjs", "Production validation B.9"));
}

const auditEvidence = readJson("docs/analytics/PATCH_C_9_FINAL_AUDIT_EVIDENCE.json");
const prodEvidence = readJson("docs/analytics/PATCH_C_9_PRODUCTION_VALIDATION_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PATCH_C_9_BROWSER_EVIDENCE.json");
const docArch = existsSync(join(ROOT, "docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md"));
const docReport = existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_PHASE_C_FINAL_REPORT.md"));
const docBaseline = existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_BASELINE_C.md"));

const requiredSteps = steps.filter(
  (s) =>
    !s.label?.includes("browser") &&
    !s.label?.includes("Production validation B.9") &&
    s.label !== "C.9 production validation"
);
const prodStep = steps.find((s) => s.label === "C.9 production validation");
const b9Step = steps.find((s) => s.label === "Production validation B.9");

const prodOk = prodStep?.pass === true && prodEvidence.status === "APPROVED";
const browserOk = !process.env.MIA_ADMIN_API_KEY || browserEvidence.status === "APPROVED";
const b9Ok = !process.env.MIA_ADMIN_API_KEY || b9Step?.pass === true;

const openP0 = auditEvidence.issues?.P0?.length ?? 0;
const openP1 = auditEvidence.issues?.P1?.length ?? 0;

const allPass =
  requiredSteps.every((s) => s.pass) &&
  prodOk &&
  auditEvidence.status === "APPROVED" &&
  docArch &&
  docReport &&
  docBaseline &&
  browserOk &&
  b9Ok &&
  gitSync.pass &&
  openP0 === 0 &&
  openP1 === 0;

const closure = {
  patch: "C.9",
  title: "PATCH C.9 — Phase C Official Closure",
  phase: "C — MIA como Analista da Empresa",
  phase_c_status: allPass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  status: allPass ? "CLOSED" : "BLOCKED",
  closed_at: allPass ? new Date().toISOString() : null,
  validation_completed_at: allPass ? new Date().toISOString() : null,
  git: gitSync,
  deployment_audit: prodEvidence.deployment_audit ?? null,
  production_validation: prodEvidence.status ?? "PENDING",
  final_audit: auditEvidence.status ?? "PENDING",
  browser: browserEvidence.status ?? "SKIPPED",
  baseline_c_frozen: allPass,
  steps,
  evidence: {
    final_audit: auditEvidence.status,
    production_validation: prodEvidence.status,
    browser: browserEvidence.status,
    phase_c_final_report: docReport,
    baseline_c: docBaseline,
    architecture: docArch,
  },
  production: {
    health_build: prodEvidence.deployment_audit?.production_build_short ?? null,
    phase_c_validation: prodEvidence.final_verdict ?? null,
  },
  issues: auditEvidence.issues ?? { P0: [], P1: [], P2: [], P3: [] },
  final_verdict: allPass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  next_phase: "D — not started",
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_C_9_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));
console.log(`\nPhase C status: ${closure.phase_c_status}\n`);
process.exit(allPass ? 0 : 1);
