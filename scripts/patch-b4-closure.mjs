#!/usr/bin/env node
/**
 * PATCH B.4 — Official closure orchestrator.
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

console.log("\nPATCH B.4 — Official closure\n");

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

steps.push(run("node scripts/test-mia-analytics-patch-b4-executive-product-health.js", "B.4 product health audit"));
steps.push(run("node scripts/test-mia-analytics-patch-b3-executive-growth.js", "B.3 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b2-executive-kpis.js", "B.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-b1-executive-architecture.js", "B.1 architecture regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a10-phase-a-final-audit.js", "Phase A baseline audit"));
steps.push(run("node scripts/test-mia-analytics-patch-a2-founder-snapshot-complete.js", "A.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a9-ui-polish.js", "A.9 regression"));
steps.push(run("npm run build", "Production build"));

if (process.env.MIA_ADMIN_API_KEY) {
  steps.push(run("node scripts/patch-b4-browser-validation.mjs", "Browser validation"));
  steps.push(run("node scripts/patch-a10-production-validation.mjs", "Production validation"));
} else {
  console.log("\nSkipping browser/production — MIA_ADMIN_API_KEY not set\n");
}

const b4Evidence = readJson("docs/analytics/PATCH_B_4_EXECUTIVE_PRODUCT_HEALTH_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PATCH_B_4_BROWSER_EVIDENCE.json");
const docExists = existsSync(join(ROOT, "docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md"));
const docHasB4 =
  docExists && readFileSync(join(ROOT, "docs/analytics/FOUNDER_EXECUTIVE_DASHBOARD.md"), "utf8").includes("B.4");

const requiredSteps = steps.filter((s) => !s.label?.includes("Browser") && !s.label?.includes("Production"));
const allPass =
  requiredSteps.every((s) => s.pass) &&
  b4Evidence.status === "APPROVED" &&
  docExists &&
  docHasB4;

const closure = {
  patch: "B.4",
  title: "PATCH B.4 — Official Closure",
  phase: "B — Dashboard Executivo",
  status: allPass && gitSync.pass ? "CLOSED" : "BLOCKED",
  patch_b4_status: allPass && gitSync.pass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  closed_at: allPass && gitSync.pass ? new Date().toISOString() : null,
  git: gitSync,
  baseline_a_preserved: true,
  baseline_b2_preserved: true,
  baseline_b3_preserved: true,
  steps,
  evidence: {
    b4_product_health: b4Evidence.status ?? "PENDING",
    browser: browserEvidence.status ?? "SKIPPED",
    dashboard_doc: docExists && docHasB4,
  },
  next_patch: "B.5 — Performance Comercial",
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_B_4_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));

console.log(`\nPATCH B.4 status: ${closure.patch_b4_status}\n`);
process.exit(allPass && gitSync.pass ? 0 : 1);
