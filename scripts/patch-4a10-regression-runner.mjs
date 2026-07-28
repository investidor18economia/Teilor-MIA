#!/usr/bin/env node
/**
 * PATCH 4A.10 — Regression runner (4A.4 through 4A.9 unit audits)
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const AUDITS = [
  { patch: "4A.4", label: "Narrative Planner", script: "test-mia-patch-44-narrative-planner-audit.js" },
  { patch: "4A.5", label: "Semantic Verbalizer", script: "test-mia-patch-45-semantic-verbalizer-audit.js" },
  { patch: "4A.6", label: "Literalness / Repetition", script: "test-mia-patch-46-literalness-repetition-audit.js" },
  { patch: "4A.6V", label: "Composition Guard", script: "test-mia-patch-4a6v-composition-guard-audit.js" },
  { patch: "4A.7", label: "Practical Consequence Engine", script: "test-mia-patch-47-practical-consequence-engine-audit.js" },
  { patch: "4A.7V", label: "Absolute Claim Governance", script: "test-mia-patch-4a7v-absolute-claim-governance-audit.js" },
  { patch: "4A.8", label: "Contextual Priority Engine", script: "test-mia-patch-48-contextual-priority-engine-audit.js" },
  { patch: "4A.9", label: "Domain Knowledge Adapter", script: "test-mia-patch-49-domain-knowledge-adapter-audit.js" },
];

console.log("\nPATCH 4A.10 — Regression runner (4A.4 → 4A.9)\n");

const results = [];
for (const audit of AUDITS) {
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
