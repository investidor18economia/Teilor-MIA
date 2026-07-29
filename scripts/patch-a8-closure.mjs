#!/usr/bin/env node
/**
 * PATCH A.8 — Official closure orchestrator.
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

console.log("\nPATCH A.8 — Official closure\n");

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
steps.push(run("node scripts/test-mia-analytics-patch-a8-founder-charts.js", "A.8 unit"));
steps.push(run("node scripts/test-mia-analytics-patch-a7-founder-advanced-filters.js", "A.7 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a6-founder-performance-conversion.js", "A.6 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a5-founder-products-categories.js", "A.5 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a4-founder-sessions-users.js", "A.4 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a3-temporal-series-api.js", "A.3 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-a2-founder-snapshot-complete.js", "A.2 regression"));
steps.push(run("node scripts/test-mia-analytics-patch-113-founder-executive-cockpit.js", "Founder Cockpit regression"));
steps.push(run("npm run build", "Production build"));
steps.push(run("node scripts/patch-a8-founder-charts-production-validation.mjs", "Production validation"));
steps.push(
  run(
    "node --env-file=.env.local scripts/patch-a8-browser-validation.mjs",
    "Browser UI validation"
  )
);

const chartsEvidence = readJson("docs/analytics/PATCH_A_8_CHARTS_EVIDENCE.json");
const browserEvidence = readJson("docs/analytics/PATCH_A_8_BROWSER_UI_EVIDENCE.json");

const allPass =
  steps.every((s) => s.pass) &&
  chartsEvidence.status === "APPROVED" &&
  browserEvidence.status === "APPROVED";

const closure = {
  patch: "A.8",
  title: "PATCH A.8 — Official Closure",
  status: allPass ? "CLOSED" : "BLOCKED",
  patch_a8_status: allPass ? "OFFICIALLY_CLOSED" : "BLOCKED_PENDING_VALIDATION",
  closed_at: allPass ? new Date().toISOString() : null,
  git: gitSync,
  charts_implemented: [
    "sessions-active-users",
    "sessions-activity",
    "categories-questions",
    "categories-recommendations",
    "categories-share",
    "products-appearances",
    "performance-ctr",
    "performance-engagement",
    "performance-funnel",
  ],
  tests: {
    closure_steps: `${steps.filter((s) => s.pass).length}/${steps.length}`,
  },
  production: chartsEvidence.production ?? {},
  interface_validation: {
    browser: browserEvidence.status,
    base_url: browserEvidence.base_url,
  },
  next_patch: allPass ? "A.9 — Polimento da Interface" : "Complete A.8 validation",
};

writeFileSync(join(ROOT, "docs/analytics/PATCH_A_8_CLOSURE_EVIDENCE.json"), JSON.stringify(closure, null, 2));
console.log(`\nClosure status: ${closure.patch_a8_status}\n`);
process.exit(allPass ? 0 : 1);
