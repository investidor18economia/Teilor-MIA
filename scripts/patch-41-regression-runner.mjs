#!/usr/bin/env node
/**
 * PATCH 4.1 — Regression runner (Phase 3 + Phase 4A)
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const PHASE3 = [
  { patch: "3.6", label: "Phase 3.6 regressions", script: "patch-36-run-all-regressions.mjs" },
  { patch: "3.7", label: "Phase 3.7 final audit", script: "patch-37-run-final-audit.mjs" },
];

const PHASE4A = [
  { patch: "4A.11", label: "4A.11 regression", script: "patch-4a11-regression-runner.mjs" },
];

console.log("\nPATCH 4.1 — Regression runner (Phase 3 + 4A)\n");

const results = [];
for (const audit of [...PHASE3, ...PHASE4A]) {
  const scriptPath = path.join(ROOT, "scripts", audit.script);
  try {
    execSync(`node "${scriptPath}"`, { cwd: ROOT, stdio: "inherit", encoding: "utf8" });
    results.push({ ...audit, pass: true });
    console.log(`\n✓ PATCH ${audit.patch} — ${audit.label}\n`);
  } catch {
    results.push({ ...audit, pass: false });
    console.log(`\n✗ PATCH ${audit.patch} — ${audit.label}\n`);
  }
}

const passed = results.filter((entry) => entry.pass).length;
console.log(`\nRegression summary: ${passed}/${results.length} suites passed`);
if (passed !== results.length) process.exit(1);
