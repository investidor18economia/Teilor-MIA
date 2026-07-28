#!/usr/bin/env node
/**
 * PATCH 4.1F — Full regression runner
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const SUITES = [
  { patch: "4.1F", label: "Legacy regression audit", script: "patch-41f-legacy-regression-audit.mjs" },
  { patch: "3.5b", label: "Verbalizer humanization", script: "test-mia-patch-35b-verbalizer-humanization-audit.js" },
  { patch: "11C", label: "Conversation polish", script: "test-mia-conversation-polish.js" },
  { patch: "3.6", label: "Phase 3.6 regressions", script: "patch-36-run-all-regressions.mjs" },
  { patch: "3.7", label: "Phase 3.7 final audit", script: "patch-37-run-final-audit.mjs" },
  { patch: "4A.10", label: "Phase 4A.4→4A.9", script: "patch-4a10-regression-runner.mjs" },
  { patch: "4A.11", label: "Phase 4A.11", script: "patch-4a11-regression-runner.mjs" },
  { patch: "4.1", label: "PATCH 4.1 audit", script: "test-mia-patch-41-e2e-conversation-audit.js" },
];

console.log("\nPATCH 4.1F — Full regression runner\n");

const results = [];
for (const suite of SUITES) {
  const scriptPath = path.join(ROOT, "scripts", suite.script);
  try {
    execSync(`node "${scriptPath}"`, { cwd: ROOT, stdio: "inherit", encoding: "utf8" });
    results.push({ ...suite, pass: true });
    console.log(`\n✓ PATCH ${suite.patch} — ${suite.label}\n`);
  } catch {
    results.push({ ...suite, pass: false });
    console.log(`\n✗ PATCH ${suite.patch} — ${suite.label}\n`);
  }
}

const passed = results.filter((entry) => entry.pass).length;
console.log(`\nRegression summary: ${passed}/${results.length} suites passed`);
if (passed !== results.length) process.exit(1);
