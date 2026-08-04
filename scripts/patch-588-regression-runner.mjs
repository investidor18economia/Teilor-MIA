#!/usr/bin/env node
/**
 * PATCH 5.8.8 — Directed regression runner (5.8.7 → 5.8.3)
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/conversational/audits/phase-5/evidence/patch-588");
mkdirSync(OUT, { recursive: true });

const SUITES = [
  { id: "5.8.7", cmd: "node scripts/test-mia-patch-587-experience-refinement.js" },
  { id: "5.8.6", cmd: "node scripts/patch-586-llm-agnostic-audit.mjs" },
  { id: "5.8.5", cmd: "node scripts/test-mia-patch-585-social-humanization.js" },
  { id: "5.8.4", cmd: "node scripts/test-mia-patch-584-conversational-rhythm.js" },
  { id: "5.8.3", cmd: "node scripts/test-mia-patch-583-social-continuity.js" },
  { id: "5.8.8", cmd: "node scripts/test-mia-patch-588-human-presence.js" },
];

const results = [];
let allPass = true;

for (const suite of SUITES) {
  try {
    execSync(suite.cmd, { cwd: ROOT, stdio: "pipe", encoding: "utf8" });
    results.push({ id: suite.id, pass: true });
    console.log(`✓ ${suite.id}`);
  } catch (err) {
    allPass = false;
    results.push({ id: suite.id, pass: false, error: String(err.stderr || err.message).slice(0, 500) });
    console.error(`✗ ${suite.id}`);
  }
}

writeFileSync(
  join(OUT, "REGRESSION_RESULTS.json"),
  JSON.stringify({ patch: "5.8.8", allPass, results, timestamp: new Date().toISOString() }, null, 2)
);

process.exit(allPass ? 0 : 1);
