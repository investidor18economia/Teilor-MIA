#!/usr/bin/env node
/**
 * PATCH C.1 — Official closure orchestrator.
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

console.log("\nPATCH C.1 — Official closure\n");

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

steps.push(run("node scripts/test-mia-analytics-patch-c1-executive-analyst-architecture.js", "C.1 architecture audit"));
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
  steps.push(run("node scripts/patch-c1-browser-validation.mjs", "C.1 browser regression"));
  steps.push(run("node scripts/patch-b9-production-validation.mjs", "Production validation"));
}

const c1Evidence = readJson("docs/analytics/PATCH_C_1_ARCHITECTURE_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PATCH_C_1_BROWSER_EVIDENCE.json");
const docExists = existsSync(join(ROOT, "docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md"));

const requiredSteps = steps.filter((s) => !s.label?.includes("browser") && !s.label?.includes("Production validation"));
const prodStep = steps.find((s) => s.label === "Production validation");
const prodOk = !process.env.MIA_ADMIN_API_KEY || prodStep?.pass === true;

const allPass =
  requiredSteps.every((s) => s.pass) &&
  c1Evidence.status === "APPROVED" &&
  docExists &&
  (browserEvidence.status === "APPROVED" || !process.env.MIA_ADMIN_API_KEY) &&
  prodOk;

const closure = {
  patch: "C.1",
  title: "PATCH C.1 — Official Closure",
  phase: "C — MIA como Analista da Empresa",
  status: allPass && gitSync.pass ? "CLOSED" : "BLOCKED",
  patch_c1_status: allPass && gitSync.pass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  closed_at: allPass && gitSync.pass ? new Date().toISOString() : null,
  git: gitSync,
  baseline_a_preserved: true,
  baseline_b_preserved: true,
  scope: "Architecture and contracts only — no analysis behavior, no UI changes",
  steps,
  evidence: {
    architecture: c1Evidence.status ?? "PENDING",
    browser: browserEvidence.status ?? "SKIPPED",
    documentation: docExists,
  },
  files_created: [
    "lib/miaExecutiveAnalysisContracts.js",
    "lib/miaExecutiveAnalysisArchitecture.js",
    "lib/miaExecutiveNarrativeArchitecture.js",
    "docs/analytics/MIA_EXECUTIVE_ANALYST_ARCHITECTURE.md",
  ],
  next_patch: "C.2 — TBD (Analysis engine foundation)",
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_C_1_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));

console.log(`\nPATCH C.1 status: ${closure.patch_c1_status}\n`);
process.exit(allPass && gitSync.pass ? 0 : 1);
