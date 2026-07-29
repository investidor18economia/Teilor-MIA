#!/usr/bin/env node
/**
 * PATCH B.1 — Official closure orchestrator (architecture only).
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

console.log("\nPATCH B.1 — Official closure\n");

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
steps.push(run("node scripts/test-mia-analytics-patch-b1-executive-architecture.js", "B.1 architecture audit"));
steps.push(run("node scripts/test-mia-analytics-patch-a10-phase-a-final-audit.js", "Phase A baseline audit"));
steps.push(run("node scripts/test-mia-analytics-patch-a2-founder-snapshot-complete.js", "A.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a9-ui-polish.js", "A.9 regression"));
steps.push(run("npm run build", "Production build"));
steps.push(run("node scripts/patch-a10-production-validation.mjs", "Production validation (no functional change)"));

const b1Evidence = readJson("docs/analytics/PATCH_B_1_ARCHITECTURE_EVIDENCE.json");
const archDocExists = existsSync(join(ROOT, "docs/analytics/FOUNDER_COCKPIT_PHASE_B_ARCHITECTURE.md"));

const allPass =
  steps.every((s) => s.pass) &&
  b1Evidence.status === "APPROVED" &&
  archDocExists;

const closure = {
  patch: "B.1",
  title: "PATCH B.1 — Official Closure",
  phase: "B — Dashboard Executivo",
  status: allPass ? "CLOSED" : "BLOCKED",
  patch_b1_status: allPass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  closed_at: allPass ? new Date().toISOString() : null,
  git: gitSync,
  implementation: "NONE — architecture documentation only",
  architecture_doc: "docs/analytics/FOUNDER_COCKPIT_PHASE_B_ARCHITECTURE.md",
  baseline_a_preserved: true,
  steps,
  evidence: {
    b1_architecture: b1Evidence.status ?? "PENDING",
    master_doc: archDocExists,
  },
  next_patch: "B.2 — KPIs Estratégicos",
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_B_1_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));

console.log(`\nPATCH B.1 status: ${closure.patch_b1_status}\n`);
process.exit(allPass ? 0 : 1);
